import { json, readJson, route } from "../http.mjs";
import { getSettings, saveSetting } from "../db.mjs";
import { createReportReader, reportDocumentUrl } from "../reports.mjs";
import { createCalendarReader } from "../calendar.mjs";

const invalid = (message) => { throw Object.assign(new Error(message), { status: 400 }); };

function settingValue(key, value) {
  if (!["brand_base_url", "report_doc_url", "material_types", "weekly_doc_url"].includes(key)) invalid("不支持此配置项");
  if (typeof value !== "string") invalid("配置值须为字符串");
  if (key === "weekly_doc_url") {
    if (value !== "") reportDocumentUrl(value);
    return value;
  }
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
export function routes(db, reportOptions, calendarOptions) {
  const calendar = createCalendarReader(calendarOptions);
  const reports = createReportReader(() => getSettings(db), reportOptions);
  const reportHandler = (detail) => async (req, res, { params, url }) => {
    try {
      return json(res, 200, await reports({ refresh: url.searchParams.get("refresh") === "1", withSources: url.searchParams.get("withSources") === "1", ...(detail ? { id: params.id } : {}) }));
    } catch (error) {
      return json(res, error.status || 502, { error: error.status ? error.message : "日报文档读取失败，请稍后刷新重试", ...(error.sources ? { sources: error.sources } : {}) });
    }
  };
  return [
    route("GET", "/api/calendar/today", async (req, res) => {
      try { return json(res, 200, await calendar()); }
      catch (error) { return json(res, error.status || 502, { error: error.status ? error.message : "飞书日历读取失败，请稍后重新打开首页" }); }
    }),
    route("GET", "/api/reports", reportHandler(false)),
    route("GET", "/api/reports/:id", reportHandler(true)),
    route("POST", "/api/reports/source-preview", async (req, res) => {
      try {
        let body;
        try { body = await readJson(req); } catch { invalid("请求内容不是有效的 JSON"); }
        return json(res, 200, await reports.preview(body || {}));
      } catch (error) {
        return json(res, error.status || 502, { error: error.status ? error.message : "飞书文档试读失败，请稍后重试" });
      }
    }),
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
