import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseReports } from "./report-parser.mjs";

const execute = promisify(execFile);
const failure = (status, message) => Object.assign(new Error(message), { status });

export function reportDocumentUrl(value) {
  if (!value?.trim()) throw failure(400, "尚未配置日报文档链接，请到设置页保存链接后刷新");
  let url;
  try { url = new URL(value); } catch { throw failure(400, "日报文档链接无效，请在设置页填写飞书文档链接"); }
  const allowed = ["feishu.cn", "larksuite.com"].some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  if (url.protocol !== "https:" || !allowed || url.username || url.password || url.port || /[\s\\]/.test(value) ||
      !/^https:\/\/[^/]/i.test(value) || !/^\/(docx|wiki)\/[a-z\d]+\/?$/i.test(url.pathname)) {
    throw failure(400, "请在设置页填写 HTTPS 飞书文档或知识库文档链接（docx / wiki）");
  }
  return `${url.origin}${url.pathname}`;
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

// 每个工作台实例单独缓存；改链接、强制刷新或读取失败后不复用旧内容。
export function createReportReader(getLink, { readDocument = readReportDocument } = {}) {
  let source, cache, pending, generation = 0;
  return async function reports({ refresh = false } = {}) {
    const link = getLink();
    if (source !== link) { source = link; cache = undefined; pending = undefined; generation++; }
    const url = reportDocumentUrl(link);
    if (!refresh && pending) return pending;
    if (!refresh && cache) return cache;
    const version = ++generation;
    cache = undefined;
    const request = (async () => {
      const content = await readDocument(url);
      const rows = parseReports(content);
      if (content.trim() && !rows.length) throw failure(502, "文档中未识别到有效日期标题，请确认包含 YYYY-MM-DD 形式的日报或周报标题");
      if (version === generation) cache = rows;
      return rows;
    })();
    pending = request;
    try { return await request; }
    finally { if (version === generation) pending = undefined; }
  };
}
