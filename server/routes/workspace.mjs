import { json, readJson, route, pending } from "../http.mjs";
import { getSettings, saveSetting } from "../db.mjs";
import { createReportReader } from "../reports.mjs";

const invalid = (message) => { throw Object.assign(new Error(message), { status: 400 }); };

function settingValue(key, value) {
  if (!["brand_base_url", "report_doc_url", "material_types"].includes(key)) invalid("不支持此配置项");
  if (typeof value !== "string") invalid("配置值须为字符串");
  if (key === "material_types") {
    let types;
    try { types = JSON.parse(value); } catch { invalid("物料类型须为 JSON 字符串数组"); }
    if (!Array.isArray(types) || types.some((type) => typeof type !== "string")) invalid("物料类型须全部为字符串");
    types = [...new Set(types.map((type) => type.trim()).filter(Boolean))];
    if (!types.length) invalid("请至少填写一个物料类型");
    return JSON.stringify(types);
  }
  const link = value.trim();
  let url;
  try { url = new URL(link); } catch { invalid("请输入有效的 HTTPS 飞书链接"); }
  const allowed = ["feishu.cn", "larksuite.com"].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  if (!/^https:\/\/[^/]/i.test(link) || /[\s\\]/.test(link) || url.protocol !== "https:" || !allowed || url.username || url.password) {
    invalid("链接须为 HTTPS 飞书域名（feishu.cn、larksuite.com 或其子域），且不能含账号或空白字符");
  }
  return link;
}

// 首页、日报周报、日历、配置
export function routes(db, reportOptions) {
  const reports = createReportReader(() => getSettings(db).report_doc_url, reportOptions);
  const reportHandler = (detail) => async (req, res, { params, url }) => {
    try {
      const rows = await reports({ refresh: url.searchParams.get("refresh") === "1" });
      if (!detail) return json(res, 200, rows);
      const row = rows.find(item => item.id === params.id);
      return row ? json(res, 200, row) : json(res, 404, { error: "这篇日报或周报不存在，请刷新列表后重新选择" });
    } catch (error) {
      return json(res, error.status || 502, { error: error.status ? error.message : "日报文档读取失败，请稍后刷新重试" });
    }
  };
  return [
    route("GET", "/api/calendar/today", pending("T06")),
    route("GET", "/api/reports", reportHandler(false)),
    route("GET", "/api/reports/:id", reportHandler(true)),
    route("GET", "/api/settings", (req, res) => json(res, 200, getSettings(db))),
    route("PUT", "/api/settings/:key", async (req, res, { params: { key } }) => {
      try {
        let body;
        try { body = await readJson(req); } catch { invalid("请求内容不是有效的 JSON"); }
        const value = settingValue(key, body?.value);
        return json(res, 200, saveSetting(db, key, value));
      } catch (error) {
        return json(res, error.status || 500, { error: error.status ? error.message : "配置保存失败，请重新读取配置后再操作" });
      }
    }),
  ];
}
