import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AGUMON, larkRun } from './lark-identity.mjs';

const execute = promisify(execFile);
const failure = (status, message) => Object.assign(new Error(message), { status });
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
const timeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateText = value => dayFormatter.format(new Date(value));

export function calendarDay(now = Date.now()) {
  const date = dateText(now);
  const next = dateText(Date.parse(`${date}T00:00:00+08:00`) + 86_400_000);
  return { date, start: `${date}T00:00:00+08:00`, end: `${next}T00:00:00+08:00` };
}

const badOutput = () => failure(502, "lark-cli 返回的日历数据格式异常，请检查 CLI 状态后重新打开首页");
function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw badOutput();
  const instant = Date.parse(`${value}T00:00:00+08:00`);
  if (!Number.isFinite(instant) || dateText(instant) !== value) throw badOutput();
  return instant;
}
function dateTimeValue(value) {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw badOutput();
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) throw badOutput();
  return instant;
}

// +agenda 的成功 data 直接是数组；datetime 有时区，全天 end_time.date 为包含的最后一天。
export function agendaRows(result, day) {
  if (result?.ok !== true || result.identity !== "user" || !Array.isArray(result.data)) throw badOutput();
  if (result.truncated || result.has_more || result.meta?.truncated || result.meta?.has_more ||
      (Number.isInteger(result.meta?.count) && result.meta.count !== result.data.length)) {
    throw failure(502, "飞书日历返回不完整，请稍后重新打开首页");
  }
  const lower = Date.parse(day.start), upper = Date.parse(day.end);
  return result.data.map(event => {
    if (!event || typeof event !== "object") throw badOutput();
    const allDay = Boolean(event.start_time?.date);
    const start = allDay ? dateValue(event.start_time.date) : dateTimeValue(event.start_time?.datetime);
    const last = allDay ? dateValue(event.end_time?.date) : dateTimeValue(event.end_time?.datetime);
    if (last < start) throw badOutput();
    const end = allDay ? last + 86_400_000 : last;
    const clock = value => `${dateText(value) === day.date ? "" : dateText(value) + " "}${timeFormatter.format(new Date(value))}`;
    return {
      start, end,
      row: {
        time: allDay ? "全天" : `${clock(start)}–${clock(end)}`,
        title: typeof event.summary === "string" && event.summary.trim() ? event.summary : "未命名日程",
        place: typeof event.location?.name === "string" ? event.location.name : "",
      },
    };
  }).filter(event => event.start < upper && (event.end > lower || event.start === event.end && event.start >= lower))
    .sort((a, b) => a.start - b.start).map(event => event.row);
}

function readFailure(error) {
  if (error.code === "ENOENT") return failure(503, "未找到 lark-cli，请安装并完成亚古兽配置的用户登录后重新打开首页");
  if (/MAXBUFFER/i.test(String(error.code))) return failure(502, "飞书日历返回不完整，请稍后重新打开首页");
  if (error.killed || error.code === "ETIMEDOUT") return failure(504, "飞书日历读取超时，请稍后重新打开首页");
  let detail;
  try { detail = JSON.parse(error.stderr || error.stdout || "").error; } catch { /* 普通进程错误 */ }
  detail ||= error;
  const text = `${detail.type || ""} ${detail.subtype || ""} ${detail.code || ""} ${detail.message || ""}`;
  if (/missing_scope|permission|forbidden|access.?denied|权限|403|99991679/i.test(text)) {
    return failure(403, "缺少日历读取权限，请为亚古兽配置授权 calendar:calendar.event:read 后重新打开首页");
  }
  if (/authentication|unauth|not.?logged|token.*(expired|invalid)|login|未登录|401/i.test(text)) {
    return failure(401, "lark-cli 尚未登录或登录已过期，请使用亚古兽配置完成用户登录后重新打开首页");
  }
  return failure(502, "飞书日历读取失败，请检查网络与 lark-cli 状态后重新打开首页");
}

export async function readCalendarAgenda(day, { run = execute } = {}) {
  let stdout;
  try {
    ({ stdout } = await larkRun(run, AGUMON, ["calendar", "+agenda", "--as", "user", "--start", day.start, "--end", day.end, "--format", "json"],
      { encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024, shell: false }));
  } catch (error) { throw readFailure(error); }
  let result;
  try { result = JSON.parse(stdout); } catch { throw badOutput(); }
  if (result?.ok === false) throw readFailure(result.error || {});
  return agendaRows(result, day);
}

export function createCalendarReader({ now = Date.now, readAgenda = readCalendarAgenda } = {}) {
  let cached, pending, currentDate, generation = 0;
  return async () => {
    const instant = now(), day = calendarDay(instant);
    if (day.date !== currentDate) { currentDate = day.date; cached = undefined; pending = undefined; generation++; }
    if (pending) return pending;
    if (cached && instant >= cached.at && instant - cached.at < 300_000) return cached.rows;
    cached = undefined;
    const version = ++generation;
    const request = (async () => {
      const rows = await readAgenda(day);
      if (version === generation) cached = { rows, at: now() };
      return rows;
    })();
    pending = request;
    try { return await request; }
    finally { if (version === generation) pending = undefined; }
  };
}
