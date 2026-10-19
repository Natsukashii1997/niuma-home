import { json, readJson, route } from "../http.mjs";
import { listPromos, listPlans, getPlan, listPlanAliases, comparePlan, savePlan } from "../db.mjs";
import { parsePlan, PROMO_SKUS } from "../plan-parser.mjs";
import { routes as materialRoutes } from "./materials.mjs";

const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
const planHandler = (handler) => async (req, res, context) => {
  try {
    let body;
    try { body = await readJson(req); } catch { fail("请求内容不是有效的 JSON"); }
    return handler(res, context, body);
  } catch (error) {
    return json(res, error.status || 500, { error: error.status ? error.message : "方案处理失败，请重新预览后再试" });
  }
};

function validatePlan(month, line, body) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail("月份须为 YYYY-MM");
  if (!Object.hasOwn(PROMO_SKUS, line)) fail("业务线无效");
  if (!body || typeof body.rawText !== "string" || !body.rawText.trim()) fail("请先粘贴方案原文");
}

export function routes(db) {
  return [
    // 促销表
    route("GET", "/api/promos", (req, res) => json(res, 200, listPromos(db))),

    // 方案原文
    route("GET", "/api/plans", (req, res) => json(res, 200, listPlans(db))),
    route("GET", "/api/plans/:month/:line", (req, res, { params }) => {
      const plan = getPlan(db, params.month, params.line);
      return plan ? json(res, 200, plan) : json(res, 404, { error: "该月该业务线还没有方案原文" });
    }),
    // line 可省略：按原文【…板块】识别业务线，并与该业务线已有数据对比
    route("POST", "/api/plans/parse", planHandler((res, context, body) => {
      const { month, line } = body || {};
      validatePlan(month, line ?? "大学辅导", body);
      const parsed = parsePlan(body.rawText, { aliases: listPlanAliases(db) });
      return json(res, 200, comparePlan(db, month, line ?? parsed.line, parsed));
    })),
    route("PUT", "/api/plans/:month/:line", planHandler((res, { params: { month, line } }, body) => {
      validatePlan(month, line, body);
      const parsed = parsePlan(body.rawText, { aliases: listPlanAliases(db) });
      if (parsed.unrecognized.length) fail("原文中有未识别行，请修改后重新解析");
      if (parsed.line !== line) fail("原文板块与当前业务线不一致或未识别，请修改后重新解析");
      if (body.rawHtml !== undefined && typeof body.rawHtml !== "string") fail("原文 HTML 格式无效");
      // 申诉服务没有固定 SKU，只有整月特殊活动也可入库
      if (!Array.isArray(body.rows) || (!body.rows.length && parsed.special === "无")) fail("没有可入库的内容，请先解析预览");
      const names = body.rows.map((row) => row?.sku);
      if (new Set(names).size !== names.length) fail("存在重复 SKU，请修改后重新解析");
      const keys = ["sku", "trial", "price", "newDeal", "renewal", "special"];
      if (body.rows.length !== parsed.rows.length || body.rows.some((row, index) =>
        !row || keys.some((key) => typeof row[key] !== "string" || row[key] !== parsed.rows[index][key]))) {
        fail("确认内容与原文不一致，请重新解析预览");
      }
      if (body.special !== parsed.special) fail("整月特殊活动与原文不一致，请重新解析预览");
      return json(res, 200, savePlan(db, month, line, body));
    })),

    // 物料
    ...materialRoutes(db),
  ];
}
