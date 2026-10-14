import { PROMO_FIELDS } from "../../constants.js";

export const VIEW_KEY = "work-desk:promos-view";
const defaults = () => ({ group: "month", filter: { month: "", line: "", sku: "" } });
const skuKey = (row) => JSON.stringify([row.line, row.sku]);

function validView(value) {
  if (!value || !["sku", "line", "month"].includes(value.group) ||
      !value.filter || !["month", "line", "sku"].every((key) => typeof value.filter[key] === "string")) return defaults();
  return { group: value.group, filter: { month: value.filter.month, line: value.filter.line, sku: value.filter.sku } };
}

export function readPromoView(getStorage = () => globalThis.localStorage) {
  try { return validView(JSON.parse(getStorage().getItem(VIEW_KEY))); }
  catch { return defaults(); }
}

export function writePromoView(view, getStorage = () => globalThis.localStorage) {
  try { getStorage().setItem(VIEW_KEY, JSON.stringify(view)); }
  catch { /* 存储被禁用或空间不足时，仍可正常使用当前视图。 */ }
}

export function normalizePromoView(value, rows) {
  const { group, filter } = validView(value);
  if (filter.month && !rows.some((row) => row.month === filter.month)) filter.month = "";
  if (filter.line && !rows.some((row) => row.line === filter.line)) filter.line = "";
  if (filter.sku && !rows.some((row) => row.sku === filter.sku && (!filter.line || row.line === filter.line))) filter.sku = "";
  return { group, filter };
}

// 比较和最近变化用完整历史；筛选只决定哪些记录可见。
export function buildPromoView(rows, { group, filter }) {
  const ordered = [...rows].sort((a, b) => b.month.localeCompare(a.month));
  const previous = new Map();
  const latestChanges = new Map();
  const last = new Map();
  for (const row of [...ordered].reverse()) {
    const key = skuKey(row);
    const prev = last.get(key);
    if (prev) {
      previous.set(row, prev);
      if (PROMO_FIELDS.some(([field]) => prev[field] !== row[field])) latestChanges.set(key, row.month);
    }
    last.set(key, row);
  }

  const groups = new Map();
  for (const row of ordered) {
    if ((filter.month && row.month !== filter.month) || (filter.line && row.line !== filter.line) || (filter.sku && row.sku !== filter.sku)) continue;
    const key = group === "sku" ? skuKey(row) : row[group];
    if (!groups.has(key)) groups.set(key, {
      key,
      name: group === "sku" ? `${row.line} · ${row.sku}` : row[group],
      rows: [],
      latestChange: group === "sku" ? latestChanges.get(skuKey(row)) || null : null,
    });
    groups.get(key).rows.push(row);
  }
  return { groups: [...groups.values()], previous };
}
