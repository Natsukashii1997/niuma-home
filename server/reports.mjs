import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseReportDocument } from "./report-parser.mjs";

const execute = promisify(execFile);
const failure = (status, message) => Object.assign(new Error(message), { status });

export function reportDocumentUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw failure(400, "尚未配置日报文档链接，请到设置页保存链接后刷新");
  let url;
  try { url = new URL(value); } catch { throw failure(400, "日报文档链接无效，请在设置页填写飞书文档链接"); }
  const allowed = ["feishu.cn", "larksuite.com"].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  if (url.protocol !== "https:" || !allowed || url.username || url.password || url.port || /:[0-9]+$/.test(value.split("/")[2]) || /[\s\\]/.test(value) ||
      !/^https:\/\/[^/]/i.test(value) || !/^\/(docx|wiki)\/[a-z\d]+\/?$/i.test(url.pathname)) {
    throw failure(400, "请在设置页填写 HTTPS 飞书文档或知识库文档链接（docx / wiki）");
  }
  return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
}

function readFailure(error) {
  const detail = `${error.code || ""} ${error.message || ""} ${error.stderr || ""} ${error.stdout || ""}`;
  if (error.code === "ENOENT") return failure(503, "未找到 lark-cli，请安装并完成 codex 配置的用户登录后重试");
  if (error.killed || /ETIMEDOUT|timed?\s*out|超时/i.test(detail)) return failure(504, "飞书文档读取超时，请稍后刷新重试");
  if (/MAXBUFFER|maxBuffer|truncat|截断/i.test(detail)) return failure(502, "飞书文档返回不完整，请检查文档大小后重试");
  if (/9999166[134578]|9999167[1679]|unauth|not.?logged|login.?required|token.*(expir|invalid)|未登录|登录过期|需要登录|401/i.test(detail)) {
    return failure(401, "lark-cli 尚未登录或登录已过期，请使用 codex 配置完成用户登录后刷新");
  }
  if (/forbidden|permission|access.?denied|scope|权限|403|1770032/i.test(detail)) {
    return failure(403, "无法读取日报文档：当前用户或 codex 应用缺少文档访问权限，请确认文档授权后刷新");
  }
  return failure(502, "飞书文档读取失败，请确认链接、lark-cli 登录状态和网络后刷新");
}

export async function readReportDocument(link, { run = execute } = {}) {
  const url = reportDocumentUrl(link);
  let stdout;
  try {
    ({ stdout } = await run("lark-cli", ["--profile", "codex", "docs", "+fetch", "--as", "user", "--doc", url, "--doc-format", "markdown"],
      { encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024, shell: false }));
  } catch (error) { throw readFailure(error); }
  let result;
  try { result = JSON.parse(stdout); } catch { throw failure(502, "lark-cli 返回的文档格式异常，请检查 CLI 状态后刷新"); }
  if (!result.ok) throw readFailure({ message: JSON.stringify(result.error || result) });
  const doc = result.data?.document;
  if (result.truncated || result.data?.truncated || doc?.truncated || result.has_more || result.data?.has_more || doc?.has_more) {
    throw failure(502, "飞书文档返回不完整，请检查文档大小后重试");
  }
  if (result.identity !== "user" || typeof doc?.content !== "string") throw failure(502, "lark-cli 未返回完整的用户身份文档内容，请检查 CLI 状态后刷新");
  return doc.content;
}

export function mergeReports(groups) {
  const rows = groups.flat(), ids = new Set();
  for (const row of rows) {
    if (ids.has(row.id)) throw failure(500, "日报周报编号冲突");
    ids.add(row.id);
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || (a.kind === b.kind ? 0 : a.kind === "日报" ? -1 : 1));
}

// 缓存完整解析结果，按本次来源角色筛选，避免单/双文档切换时复用错误列表。
// staleWhileRevalidate：超过十分钟的旧结果先返回，后台再读一次（打开日报不再等飞书）；手动刷新仍现读。
export function createReportReader(getConfig, { readDocument = readReportDocument, now = Date.now, onSource = () => {}, staleWhileRevalidate = false } = {}) {
  const entries = new Map();
  let lastAttempt = 0;
  const config = () => {
    const value = getConfig();
    return typeof value === "string" || !value ? { report_doc_url: value } : value;
  };
  const describe = (role, link) => {
    try { return { role, url: reportDocumentUrl(link) }; }
    catch (error) { return { role, url: typeof link === "string" ? link : "", error }; }
  };
  const sources = () => {
    const settings = config(), daily = describe("daily", settings.report_doc_url);
    const weekly = settings.weekly_doc_url ? describe("weekly", settings.weekly_doc_url) : null;
    const list = !weekly || (!daily.error && !weekly.error && daily.url === weekly.url) ? [daily] : [daily, weekly];
    const active = new Set(list.filter(s => !s.error).map(s => s.url));
    for (const url of entries.keys()) if (!active.has(url)) entries.delete(url);
    return list;
  };
  const read = async (url, refresh) => {
    if (!entries.has(url)) entries.set(url, { generation: 0 });
    const entry = entries.get(url);
    if (!refresh && entry.pending && !(staleWhileRevalidate && entry.cache)) return entry.pending;
    if (!refresh && entry.cache && now() - entry.cache.time < 600000) return entry.cache;
    const stale = !refresh && staleWhileRevalidate && entry.cache;
    if (stale && entry.pending) return entry.cache;
    const generation = ++entry.generation;
    if (!stale) entry.cache = undefined;
    const request = (async () => {
      const content = await readDocument(url);
      const result = { ...parseReportDocument(content), nonempty: !!content.trim(), time: now() };
      if (entry.generation === generation) entry.cache = result;
      return result;
    })();
    entry.pending = request;
    const settle = request.finally(() => { if (entry.generation === generation) entry.pending = undefined; });
    if (stale) { settle.catch(() => {}); return stale; }
    return await settle;
  };
  const select = (parsed, role, single) => {
    const rows = single ? parsed.reports : parsed.reports.filter(r => r.kind === (role === "daily" ? "日报" : "周报"));
    if (parsed.nonempty && !rows.length) {
      const headings = parsed.unrecognized.slice(0, 5).map(h => h.title);
      throw Object.assign(failure(502, `未识别到${single ? "日报或周报" : role === "daily" ? "日报" : "周报"}标题${headings.length ? `：${headings.join("；")}` : ""}`), { unrecognized: parsed.unrecognized, ignored: parsed.reports.length });
    }
    return rows;
  };
  const load = async (source, single, refresh) => {
    const meta = { role: source.role, url: source.url, ok: false, count: 0, ignored: 0, unrecognized: [] };
    const attemptAt = lastAttempt = Math.max(now(), lastAttempt + 1);
    let parsed;
    try {
      if (source.error) throw source.error;
      parsed = await read(source.url, refresh);
      const selected = select(parsed, source.role, single);
      const reports = selected.map(r => ({ ...r, id: source.role === "weekly" ? `w-${r.id}` : r.id, source: source.role }));
      const completed = { ...meta, ok: true, count: reports.length, ignored: parsed.reports.length - reports.length, unrecognized: parsed.unrecognized, fetchedAt: new Date(parsed.time).toISOString() };
      onSource({ ...completed, attemptAt, single, kinds: [...new Set(selected.map(r => r.kind))] });
      return { reports, meta: completed };
    } catch (error) {
      // 只有当前缓存解析失败才清理；旧请求不能清掉新一代成功缓存。
      if (parsed && entries.get(source.url)?.cache === parsed) entries.get(source.url).cache = undefined;
      const completed = { ...meta, ignored: error.ignored || 0, unrecognized: error.unrecognized || [], status: error.status || 502, error: error.status ? error.message : "飞书文档读取失败，请稍后刷新重试" };
      onSource({ ...completed, attemptAt, single });
      return { reports: [], meta: completed };
    }
  };
  const legacy = rows => rows.map(({ source, ...row }) => row);
  const reports = async ({ refresh = false, withSources = false, id } = {}) => {
    const list = sources(), single = list.length === 1;
    if (id !== undefined) {
      const role = id.startsWith("w-") ? "weekly" : "daily", source = list.find(s => s.role === role);
      if (!source) throw failure(404, "这篇日报或周报不存在，请刷新列表后重新选择");
      const result = await load(source, single, refresh);
      if (!result.meta.ok) throw failure(result.meta.status, result.meta.error);
      const row = legacy(result.reports).find(r => r.id === id);
      if (!row) throw failure(404, "这篇日报或周报不存在，请刷新列表后重新选择");
      return row;
    }
    const results = await Promise.all(list.map(source => load(source, single, refresh)));
    const metadata = results.map(r => r.meta), failed = metadata.filter(s => !s.ok);
    if (failed.length && (!withSources || failed.length === metadata.length)) {
      throw Object.assign(failure(failed[0].status, failed[0].error), withSources ? { sources: metadata } : {});
    }
    const rows = mergeReports(results.map(r => r.reports));
    return withSources ? { reports: rows, sources: metadata } : legacy(rows);
  };
  reports.preview = async ({ role, url: link } = {}) => {
    if (!["daily", "weekly"].includes(role)) throw failure(400, "来源角色须为 daily 或 weekly");
    const url = reportDocumentUrl(link);
    let sameAsDaily = false;
    try { sameAsDaily = url === reportDocumentUrl(config().report_doc_url); } catch { /* 日报未配置仍可试读周报。 */ }
    const content = await readDocument(url), parsed = { ...parseReportDocument(content), nonempty: !!content.trim() };
    // 同链接保存后进入单文档模式，暂无周报也可保存。
    const selected = select(parsed, role, sameAsDaily);
    const rows = selected.filter(r => r.kind === (role === "daily" ? "日报" : "周报"));
    return { url, sameAsDaily, count: rows.length, ...(rows[0] ? { latest: { title: rows[0].title, date: rows[0].date } } : {}), unrecognized: parsed.unrecognized };
  };
  return reports;
}
