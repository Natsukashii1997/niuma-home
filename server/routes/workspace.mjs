import { json, readJson, route } from "../http.mjs";
import { getSettings } from "../db.mjs";
import { createReportReader, reportDocumentUrl } from "../reports.mjs";
import { createCalendarReader } from "../calendar.mjs";
import { createCodexResetReader } from "../codex-reset.mjs";
import { codexPushStatus } from "../codex-push.mjs";
import { createUserServices, userRoutes, handleV3 } from "./user.mjs";
import { deliveryRoutes } from "./delivery.mjs";
import { recordSource, sourceStatus, reportIdentity } from "../source-status.mjs";
import { createSettingsChanges, V3_SETTING_KEYS, validateV3Setting } from "../v3-settings.mjs";
import { routes as selftalkRoutes } from "./selftalk.mjs";
import { routes as referenceRoutes } from "./references.mjs";
import { createProjectServices, projectRoutes } from "./projects.mjs";
import { routes as brandRoutes } from "./brand.mjs";
import { routes as marketingRoutes } from "./v3-marketing.mjs";
import { createTodoReader } from "../home-todo.mjs";
import { createRevenueService } from "../revenue.mjs";
import { createVoiceReader } from "../voice.mjs";

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
export function routes(db, reportOptions, calendarOptions, v3Options = {}) {
  const settingsChanges = createSettingsChanges(db, { ...v3Options.settings,
    validate: (key, value) => V3_SETTING_KEYS.has(key) ? validateV3Setting(key, value) : settingValue(key, value),
  });
  const calendar = createCalendarReader(calendarOptions);
  const reports = createReportReader(() => getSettings(db), { staleWhileRevalidate: true, ...reportOptions, onSource: event => {
    const settings = getSettings(db);
    const roles = event.single && (!event.ok || event.kinds?.includes('周报')) ? ['daily', 'weekly'] : [event.role];
    for (const role of roles) {
      const identity = reportIdentity(role === 'daily' ? settings.report_doc_url : settings.weekly_doc_url || settings.report_doc_url);
      if (identity !== event.url) continue;
      recordSource(db, role, { identity, attemptAt: event.attemptAt, at: event.ok ? event.fetchedAt : undefined, error: event.ok ? undefined : event.error });
    }
    reportOptions?.onSource?.(event);
  } });
  const codexReset = createCodexResetReader(v3Options.codex);
  const voice = createVoiceReader(db, v3Options.voice);
  const userServices = createUserServices(db, { ...v3Options, voiceReader: voice, timeline: { ...v3Options.timeline, onSource: event => recordSource(db, 'timeline', event) } });
  const projectServices = createProjectServices(db, v3Options);
  const revenue = createRevenueService(db, v3Options.revenue);
  const todo = createTodoReader(db, { ...userServices, projects: projectServices.projects, ...v3Options.todo });
  const reportHandler = (detail) => async (req, res, { params, url }) => {
    try {
      return json(res, 200, await reports({ refresh: url.searchParams.get("refresh") === "1", withSources: url.searchParams.get("withSources") === "1", ...(detail ? { id: params.id } : {}) }));
    } catch (error) {
      return json(res, error.status || 502, { error: error.status ? error.message : "日报文档读取失败，请稍后刷新重试", ...(error.sources ? { sources: error.sources } : {}) });
    }
  };
  return [
    route("GET", "/api/v3/status", handleV3(() => sourceStatus(db, { implemented:['daily','weekly','timeline','kb','nas', ...(voice.identity() ? ['voice'] : [])], voiceIdentity:voice.identity() }))),
    route('GET', '/api/v3/voice', async (req,res) => {
      try { json(res,200,await voice()); }
      catch(error) { json(res,error.status||500,{error:error.status?error.message:'留学之声读取失败',code:error.code||'VOICE_READ_FAILED'}); }
    }),
    route("GET", "/api/v3/settings", handleV3(() => settingsChanges.read())),
    route("POST", "/api/settings/:key/preview", handleV3(async (req, { params }) => settingsChanges.preview(params.key, await readJson(req)))),
    route("GET", "/api/v3/codex-reset", handleV3(() => codexReset())),
    route("GET", "/api/v3/codex-push", handleV3(() => codexPushStatus(db))),
    ...userRoutes(userServices),
    route('GET', '/api/v3/home/todo', handleV3((req, { url }) => todo(url.searchParams.get('month') || undefined))),
    route('GET', '/api/v3/business/revenue', handleV3(() => revenue.get())),
    ...deliveryRoutes(userServices.needs, db),
    ...projectRoutes(projectServices),
    ...brandRoutes(db, v3Options.brand),
    ...marketingRoutes(db, v3Options),
    ...selftalkRoutes(db, v3Options.selftalk),
    ...referenceRoutes(db, v3Options.refs),
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
        if (V3_SETTING_KEYS.has(key)) return json(res, 200, settingsChanges.confirm(key, body));
        if (!body || Object.keys(body).some(k => !['previewId', 'confirm'].includes(k))) invalid("请先预览配置，再确认保存");
        return json(res, 200, settingsChanges.confirm(key, body));
      } catch (error) {
        return json(res, error.status || 500, { error: error.status ? error.message : "配置保存失败，请重新读取配置后再操作" });
      }
    }),
  ];
}
