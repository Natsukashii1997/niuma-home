const LINES = ["大学辅导", "国际课程", "申诉服务"];
const FIELDS = { 试听: "trial", 正价: "price", 新签活动: "newDeal", 续费活动: "renewal" };

// 只处理文本；别名由调用方提供，纯函数不读库、不改输入。
export function parsePlan(rawText, { aliases = [] } = {}) {
  const result = { line: null, rows: [], unrecognized: [] };
  let row = null;
  let collecting = null;
  let values = [];
  for (const [index, original] of rawText.split(/\r\n|\n|\r/).entries()) {
    const text = original.trim();
    if (!text) continue;
    const header = text.match(/【([^】]*板块)】/);
    if (header) {
      const name = header[1].replace(/板块/g, "").replace(/[^\p{Script=Han}]/gu, "");
      const line = LINES.find((value) => name === value);
      if (line && (!result.line || result.line === line)) result.line = line;
      else result.unrecognized.push({ lineNo: index + 1, text: original });
      row = null;
      collecting = null;
      continue;
    }
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
    if (field && row) {
      row[FIELDS[field[1]]] = field[2].trim() || "无";
      collecting = field[2].trim() ? null : FIELDS[field[1]];
      values = [];
    } else if (!field && numbered && !/^[^：:]{1,12}[：:]/.test(content)) {
      // 「未知标签：…」形式的编号行不当成 SKU，落到下方未识别
      const alias = aliases.find((item) => item.line === result.line && item.alias === content);
      row = { sku: alias?.sku || content, trial: "无", price: "无", newDeal: "无", renewal: "无" };
      if (alias && alias.sku !== content) row.alias = content;
      if (result.rows.some((existing) => existing.sku === row.sku)) result.unrecognized.push({ lineNo: index + 1, text: original });
      result.rows.push(row);
      collecting = null;
    } else if (listed && collecting && row) {
      values.push(content);
      row[collecting] = values.join("\n");
    } else {
      result.unrecognized.push({ lineNo: index + 1, text: original });
    }
  }
  return result;
}
