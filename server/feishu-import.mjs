// 把旧飞书多维表格的一行（字段名 + 值）转成促销行。一次性迁移用。
const text = (v) => {
  const s = (Array.isArray(v) ? v.join("、") : v ?? "").toString().trim();
  return s || "无";
};

export function toPromo(fields, values) {
  const get = (name) => values[fields.indexOf(name)];
  const date = get("填写日期");
  if (!date) throw new Error(`缺少填写日期：${JSON.stringify(values)}`);
  return {
    month: String(date).slice(0, 7), // "2026-09-01T00:00:00.000+08:00" → "2026-09"
    line: text(get("业务线")),
    sku: text(get("SKU名称")),
    trial: text(get("试听价格")),
    price: text(get("正价价格")),
    newDeal: text(get("新签活动")),
    renewal: text(get("续费活动")),
  };
}
