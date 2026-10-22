// 轻量 Markdown 解析：只覆盖飞书日报 / 周报 / 日志里实际出现的写法（标题、列表、表格、加粗），不引入依赖。
// 飞书导出的特点：标题前可能带转义「\#」；表格常常没有首尾竖线，也没有 --- 分隔行。

const cells = (line) => line.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
const isSep = (line) => /^\s*\|?\s*:?-{2,}/.test(line) && /^[\s|:-]+$/.test(line);
const isTableLine = (line) => (line.match(/\|/g) || []).length >= 2;
const heading = (line) => line.trimEnd().match(/^(#{1,6})\s*(.+)$/);
const isListLine = (line) => /^\s*([-*•]|\d+[.)])\s+/.test(line.trimEnd());

export function parseMarkdown(text = "") {
  // 飞书会转义列表符号。统一预处理后，各分支必须检查同一份行内容；
  // 否则外层识别到列表、内层不识别，索引不前进会无限追加空列表。
  const lines = String(text).replace(/\r/g, "").split("\n").map(line => line.replace(/^\\(?=[#*-])/, ""));
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (!line.trim()) { i += 1; continue; }
    const h = heading(line);
    if (h) { blocks.push({ type: "heading", level: h[1].length, text: h[2].replace(/^\\/, "") }); i += 1; continue; }
    if (isTableLine(line)) {
      const rows = [];
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isSep(lines[i])) rows.push(cells(lines[i]));
        i += 1;
      }
      if (!rows.length) continue;
      const width = Math.max(...rows.map((r) => r.length));
      blocks.push({ type: "table", head: rows[0], rows: rows.slice(1).map((r) => [...r, ...Array(Math.max(0, width - r.length)).fill("")]) });
      continue;
    }
    if (isListLine(line)) {
      const items = [];
      while (i < lines.length && isListLine(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "list", ordered: /^\s*\d/.test(line), items });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !heading(lines[i]) && !isTableLine(lines[i]) && !isListLine(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "para", text: para.join("\n") });
  }
  return blocks;
}

// 状态文字 → 语义：done / doing / todo / block；用于日报事项表的状态标签。
export function statusTone(text = "") {
  if (/✅|已完成|完成|已定稿|已上线/.test(text)) return "done";
  if (/⛔|卡点|阻塞|延期|风险/.test(text)) return "block";
  if (/⏳|待处理|待确认|待/.test(text)) return "todo";
  if (/🔄|进行中|推进中/.test(text)) return "doing";
  return "";
}

// 去掉行首的编号 emoji（1️⃣ 2️⃣ …）和状态 emoji，留下干净文字。
export const cleanCell = (text = "") => text.replace(/[0-9]️?⃣/g, "").replace(/[✅🔄⏳⛔📅📋💬]/gu, "").replace(/\s+/g, " ").trim();
