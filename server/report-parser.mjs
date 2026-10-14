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

export function parseReports(markdown) {
  if (typeof markdown !== "string") return [];
  let fence = null;
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n").map(text => {
    const marker = text.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
      return { text };
    }
    const heading = !fence && text.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    return heading ? { text, level: heading[1].length, title: heading[2], info: headingInfo(heading[2]) } : { text };
  });
  const level = Math.min(...lines.filter(line => line.info).map(line => line.level));
  const reports = [], counts = new Map();
  let current = null;
  const finish = () => {
    if (!current) return;
    const key = `${current.kind}|${current.date}|${current.title}`;
    const occurrence = (counts.get(key) || 0) + 1;
    counts.set(key, occurrence);
    const id = createHash("sha256").update(key).digest("hex").slice(0, 20) + `-${occurrence}`;
    reports.push({ id, kind: current.kind, date: current.date, title: current.title, body: plainBody(current.body.join("\n")) });
    current = null;
  };
  for (const line of lines) {
    if (line.level <= level) {
      finish();
      if (line.level === level && line.info) current = { ...line.info, title: line.title, body: [] };
    } else if (current) current.body.push(line.text);
  }
  finish();
  return reports.sort((a, b) => b.date.localeCompare(a.date));
}
