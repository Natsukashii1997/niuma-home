// 各业务线的固定 SKU（用户 2026-10-19 确认）；方案里没提到的记一行全「无」，行序按这里排。
export const PROMO_SKUS = {
  大学辅导: ["灵活学Lite", "安心学Max", "学考无忧Pass", "补考护航Pass", "选课指导", "论文稳Pass", "先修班课"],
  国际课程: ["灵活学Lite", "安心学Max"],
};
const LINES = Object.keys(PROMO_SKUS);
const FIELDS = { 试听: "trial", 正价: "price", 新签活动: "newDeal", 续费活动: "renewal" };
const empty = () => ({ trial: "无", price: "无", newDeal: "无", renewal: "无", special: "无" });
const LABELED = /^([^：:]{1,12})[：:]\s*(.*)$/;

// 只处理文本；别名由调用方提供，纯函数不读库、不改输入。
// 编号行是固定 SKU（可用「/」合写多个）→ SKU 块；不是 → 整月特殊活动块（如「双11活动」）。
// SKU 下面不是试听/正价/新签活动/续费活动的「标签：内容」记进该 SKU 的特殊活动。
export function parsePlan(rawText, { aliases = [] } = {}) {
  const result = { line: null, rows: [], special: "无", unrecognized: [] };
  const found = new Map(); // sku → row
  const blocks = []; // 整月特殊活动块：每块一组行
  let rows = null; // 当前 SKU 块（合写时多行共用同一组字段）
  let block = null; // 当前整月特殊活动块
  let collecting = null; // 等待列表值的字段
  let foreign = false; // 无法识别或混入的板块：其下各行一律不收
  const miss = (lineNo, text) => result.unrecognized.push({ lineNo, text });
  const setField = (key, value) => { for (const row of rows) row[key] = value; };
  const addSpecial = (text) => { for (const row of rows) row.special = row.special === "无" ? text : `${row.special}\n${text}`; };

  for (const [index, original] of rawText.split(/\r\n|\n|\r/).entries()) {
    const lineNo = index + 1;
    const text = original.trim();
    if (!text) continue;
    const header = text.match(/【([^】]*板块)】/);
    if (header) {
      const name = header[1].replace(/板块/g, "").replace(/[^\p{Script=Han}]/gu, "");
      const line = LINES.find((value) => name === value);
      foreign = !(line && (!result.line || result.line === line));
      if (foreign) miss(lineNo, original);
      else result.line = line;
      rows = block = collecting = null;
      continue;
    }
    if (foreign) { miss(lineNo, original); continue; }
    let content = text;
    let numbered = false;
    let listed = false;
    let prefix;
    while ((prefix = content.match(/^(?:(\d+|[a-z]|[ivxlcdm]+)[.．、)](?=\s|$|\p{Script=Han})|([*\-•▪◦]))\s*/iu))) {
      if (numbered && prefix[1]) break;
      numbered ||= Boolean(prefix[1]);
      listed ||= Boolean(prefix[2]);
      content = content.slice(prefix[0].length).trim();
    }
    if (!content) continue;
    const field = content.match(/^(试听|正价|新签活动|续费活动)\s*[:：]\s*(.*)$/);
    const labeled = !field && content.match(LABELED);

    if (field) {
      if (!rows) {
        // 特殊活动块里出现四种标签，说明是清单外的 SKU：标题和这一行都挡下来
        if (block && !block.flagged) { block.flagged = true; miss(block.lineNo, block.original); }
        miss(lineNo, original);
        continue;
      }
      const value = field[2].trim();
      setField(FIELDS[field[1]], value || "无");
      collecting = value ? null : FIELDS[field[1]];
      if (collecting) setField(collecting, "");
    } else if (rows && listed && collecting) {
      for (const row of rows) row[collecting] = row[collecting] && row[collecting] !== "无" ? `${row[collecting]}\n${content}` : content;
    } else if (rows && labeled) {
      addSpecial(`${labeled[1].trim()}：${labeled[2].trim()}`);
      collecting = labeled[2].trim() ? null : "special";
    } else if (numbered && !labeled) {
      const fixed = PROMO_SKUS[result.line] || [];
      const names = content.split(/\s*[/／]\s*/).map((part) =>
        aliases.find((item) => item.line === result.line && item.alias === part)?.sku || part);
      collecting = null;
      if (names.every((sku) => fixed.includes(sku))) {
        block = null;
        if (names.some((sku) => found.has(sku)) || new Set(names).size !== names.length) { rows = []; miss(lineNo, original); continue; }
        rows = names.map((sku) => ({ sku, ...empty(), ...(sku !== content && { alias: content }) }));
        for (const row of rows) found.set(row.sku, row);
      } else {
        rows = null;
        block = { lineNo, original, lines: [content] };
        blocks.push(block);
      }
    } else if (block) {
      block.lines.push(content);
    } else {
      miss(lineNo, original);
    }
  }
  // 「新签活动：」后面没有列表时仍记「无」
  for (const row of found.values()) for (const key of [...Object.values(FIELDS), "special"]) if (!row[key]) row[key] = "无";
  const fixed = PROMO_SKUS[result.line] || [];
  result.rows = fixed.map((sku) => found.get(sku) || { sku, ...empty() });
  if (blocks.length) result.special = blocks.map((item) => item.lines.join("\n")).join("\n\n");
  result.unrecognized.sort((a, b) => a.lineNo - b.lineNo);
  return result;
}
