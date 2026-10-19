// 各业务线的固定 SKU（用户 2026-10-19 确认）；方案里没提到的记一行全「无」，行序按这里排。
export const PROMO_SKUS = {
  大学辅导: ["灵活学Lite", "安心学Max", "学考无忧Pass", "补考护航Pass", "选课指导", "论文稳Pass", "先修班课"],
  国际课程: ["灵活学Lite", "安心学Max"],
  申诉服务: [], // 不设固定 SKU：内容（如「双11活动」）记为整月特殊活动；只存原文，不进方案汇总（用户 2026-10-19）
};
const LINES = Object.keys(PROMO_SKUS);
const KEYS = { 试听: "trial", 正价: "price", 新签活动: "newDeal", 新签: "newDeal", 续费活动: "renewal", 续费: "renewal" };
// 四种字段：「试听/正价/新签活动/续费活动：」，也认「新签：」「续费（新价格用户）：」「学科正价：」这类变体
const FIELD = /^([^：:（(\s]{0,6}?)(试听|正价|新签活动|续费活动|新签|续费)\s*(（[^）]*）|\([^)]*\))?\s*[:：]\s*(.*)$/;
const empty = () => ({ trial: "无", price: "无", newDeal: "无", renewal: "无", special: "无" });
const LABELED = /^([^：:]{1,12})[：:]\s*(.*)$/;

// 只处理文本；别名由调用方提供，纯函数不读库、不改输入。
// 标题行（编号行，或不带编号、不带冒号的单独一行）是固定 SKU（可用「/」合写多个）→ SKU 块；
// 不是固定 SKU 的编号行、或空行后的单独一行 → 整月特殊活动块（如「双11活动」），块里各行原样收进整月特殊活动。
// SKU 下面不是四种字段的「标签：内容」记进该 SKU 的特殊活动。
export function parsePlan(rawText, { aliases = [] } = {}) {
  const result = { line: null, rows: [], special: "无", unrecognized: [] };
  const found = new Map(); // sku → row
  const blocks = []; // 整月特殊活动块：每块一组行
  let rows = null; // 当前 SKU 块（合写时多行共用同一组字段）
  let block = null; // 当前整月特殊活动块
  let collecting = null; // 等待列表值的字段
  let foreign = false; // 无法识别或混入的板块：其下各行一律不收
  let afterBlank = true; // 上一行是空行（或刚进板块）
  const miss = (lineNo, text) => result.unrecognized.push({ lineNo, text });
  const append = (key, text) => { for (const row of rows) row[key] = row[key] === "无" ? text : `${row[key]}\n${text}`; };
  const skuNames = (content) => content.split(/\s*[/／]\s*/).map((part) =>
    aliases.find((item) => item.line === result.line && item.alias === part)?.sku || part);

  for (const [index, original] of rawText.split(/\r\n|\n|\r/).entries()) {
    const lineNo = index + 1;
    const text = original.trim();
    const blank = afterBlank;
    afterBlank = !text;
    if (!text) continue;
    const header = text.match(/【([^】]*板块)】/);
    if (header) {
      const name = header[1].replace(/板块/g, "").replace(/[^\p{Script=Han}]/gu, "");
      const line = LINES.find((value) => name === value);
      foreign = !(line && (!result.line || result.line === line));
      if (foreign) miss(lineNo, original);
      else result.line = line;
      rows = block = collecting = null;
      afterBlank = true;
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
    const field = content.match(FIELD);
    const labeled = !field && content.match(LABELED);
    const fixed = PROMO_SKUS[result.line] || [];
    const heading = !field && !labeled && (numbered || !listed); // 标题行：编号行，或不带列表符号、不带冒号的单独一行
    const names = heading ? skuNames(content) : null;
    const isSku = names && names.every((sku) => fixed.includes(sku));

    if (field && rows) {
      const key = KEYS[field[2]];
      const qualifier = field[3] ? field[3].slice(1, -1).trim() : "";
      const label = field[1] ? `${field[1]}${field[2]}${field[3] || ""}` : qualifier;
      const value = field[4].trim();
      if (value) append(key, label ? `${label}：${value}` : value);
      else if (label) append(key, `${label}：`);
      collecting = value ? null : key;
    } else if (field) {
      // 特殊活动块里的新签、续费照原文收进块；出现试听、正价说明是清单外的 SKU：标题和这一行都挡下来
      if (block && (KEYS[field[2]] === "newDeal" || KEYS[field[2]] === "renewal")) { block.lines.push(content); continue; }
      if (block && !block.flagged) { block.flagged = true; miss(block.lineNo, block.original); }
      miss(lineNo, original);
    } else if (rows && listed && collecting) {
      append(collecting, content);
    } else if (rows && labeled) {
      append("special", `${labeled[1].trim()}：${labeled[2].trim()}`);
      collecting = labeled[2].trim() ? null : "special";
    } else if (isSku) {
      block = collecting = null;
      if (names.some((sku) => found.has(sku)) || new Set(names).size !== names.length) { rows = []; miss(lineNo, original); continue; }
      rows = names.map((sku) => ({ sku, ...empty(), ...(sku !== content && { alias: content }) }));
      for (const row of rows) found.set(row.sku, row);
    } else if (heading && (numbered || blank || (!rows && !block))) {
      rows = collecting = null;
      block = { lineNo, original, lines: [content] };
      blocks.push(block);
    } else if (block) {
      block.lines.push(content);
    } else {
      miss(lineNo, original);
    }
  }
  const fixed = PROMO_SKUS[result.line] || [];
  result.rows = fixed.map((sku) => found.get(sku) || { sku, ...empty() });
  if (blocks.length) result.special = blocks.map((item) => item.lines.join("\n")).join("\n\n");
  result.unrecognized.sort((a, b) => a.lineNo - b.lineNo);
  return result;
}
