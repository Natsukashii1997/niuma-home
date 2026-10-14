import { createHash } from "node:crypto";

function decodeEntities(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? whole;
    const value = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : whole;
  });
}

// 飞书 Markdown 中的表格仍可能是 HTML；只提取文字，前端不执行 HTML。
function plainBody(text) {
  const strip = value => value.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n").replace(/<[^>]*>/g, "");
  return decodeEntities(text
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi, (_, table) => {
      const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)];
      return "\n" + rows.map(row => [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]\s*>/gi)]
        .map(cell => strip(cell[1]).trim().replace(/\s*\n\s*/g, " / ")).join(" | ")).join("\n") + "\n";
    })
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]*>/g, ""))
    .replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trim();
}

function headingInfo(title) {
  const cleaned = title.replace(/^[^\p{L}\p{N}]+/u, "");
  const match = cleaned.match(/^(?:(日报|周报)\s*[：:|｜·-]?\s*)?(\d{4})(?:-(\d{1,2})-(\d{1,2})|\/(\d{1,2})\/(\d{1,2})|年(\d{1,2})月(\d{1,2})日)/);
  if (!match) return null;
  const year = Number(match[2]), month = Number(match[3] || match[5] || match[7]), day = Number(match[4] || match[6] || match[8]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { kind: /周报/.test(cleaned) ? "周报" : "日报", date: `${match[2]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

function weeklyHeadingMatch(title) {
  const cleaned = title.replace(/^[^\p{L}\p{N}]+/u, "");
  return cleaned.match(/^第\s*(\d+)\s*周\s*(\d{4})\s*\.\s*(\d+)\s*[（(]\s*(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})\s*[-–—~至]\s*(?:(\d{4})\s*\.\s*)?(\d{1,2})\s*\.\s*(\d{1,2})\s*[）)]\s*$/);
}

function weeklyHeadingInfo(title) {
  const match = weeklyHeadingMatch(title);
  if (!match) return null;
  const [, week, weekYear, writtenWeek, y1, m1, d1, y2, m2, d2] = match.map(Number);
  const endYear = y2 || y1 + (m2 < m1 ? 1 : 0);
  const start = new Date(Date.UTC(y1, m1 - 1, d1)), end = new Date(Date.UTC(endYear, m2 - 1, d2));
  const valid = (date, y, m, d) => date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  if (!valid(start, y1, m1, d1) || !valid(end, endYear, m2, d2) || end < start || end - start > 6 * 86400000) return null;
  // ISO 周以星期四所属年份计周年，1 月 4 日所在周为第一周。
  const thursday = new Date(start);
  thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7));
  const isoYear = thursday.getUTCFullYear();
  const isoWeek = Math.ceil(((thursday - Date.UTC(isoYear, 0, 1)) / 86400000 + 1) / 7);
  const warnings = [];
  if (week !== writtenWeek) warnings.push(`标题第${week}周与 ${weekYear}.${writtenWeek} 的周次不一致，以日期范围为准`);
  if (weekYear !== isoYear || writtenWeek !== isoWeek) warnings.push(`标题周年或周次与起日所在的 ISO ${isoYear} 年第 ${isoWeek} 周不一致，以日期范围为准`);
  const startDate = start.toISOString().slice(0, 10), endDate = end.toISOString().slice(0, 10);
  return { kind: "周报", date: startDate, startDate, endDate, week, weekYear, ...(warnings.length ? { warnings } : {}) };
}

export function parseReportDocument(markdown) {
  if (typeof markdown !== "string") return { reports: [], unrecognized: [] };
  let fence = null;
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n").map((text, index) => {
    const marker = text.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return { text };
    }
    const heading = !fence && text.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    return heading ? { text, lineNo: index + 1, level: heading[1].length, title: heading[2], info: weeklyHeadingInfo(heading[2]) || headingInfo(heading[2]) } : { text };
  });
  // 新周报候选即使日期无效也界定层级，防止把其日期子章节另起为日报。
  const level = Math.min(...lines.filter(line => line.info || (line.title && weeklyHeadingMatch(line.title))).map(line => line.level));
  const unrecognized = lines.filter(line => line.title && !line.info && (Number.isFinite(level) ? line.level === level : true))
    .map(({ lineNo, title }) => ({ lineNo, title }));
  const reports = [], counts = new Map();
  let current = null;
  const finish = () => {
    if (!current) return;
    const key = `${current.kind}|${current.date}|${current.title}`;
    const occurrence = (counts.get(key) || 0) + 1;
    counts.set(key, occurrence);
    const id = createHash("sha256").update(key).digest("hex").slice(0, 20) + `-${occurrence}`;
    const { body, ...info } = current;
    reports.push({ id, ...info, body: plainBody(body.join("\n")) });
    current = null;
  };
  for (const line of lines) {
    if (line.level <= level) {
      finish();
      if (line.level === level && line.info) current = { ...line.info, title: line.title, body: [] };
    } else if (current) current.body.push(line.text);
  }
  finish();
  return { reports: reports.sort((a, b) => b.date.localeCompare(a.date)), unrecognized };
}

export function parseReports(markdown) { return parseReportDocument(markdown).reports; }
