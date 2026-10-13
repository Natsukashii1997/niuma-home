import { useMemo, useState } from "react";
import { useApi } from "../../api.js";
import { Empty, FilterBar, Loadable, Segmented, Select } from "../../ui/components.jsx";
import { PROMO_FIELDS } from "../../constants.js";

const GROUPS = [
  ["sku", "按 SKU"],
  ["line", "按业务线"],
  ["month", "按月份"],
];

const LONG = new Set(["newDeal", "renewal"]); // 活动类字段较长，给足列宽

const groupKey = { sku: (r) => `${r.line} · ${r.sku}`, line: (r) => r.line, month: (r) => r.month };

// 促销表：三种分组 + 筛选 + 与上月同一 SKU 对比高亮。
export default function PromosView() {
  const state = useApi("/api/promos");
  return <Loadable state={state}>{(rows) => <PromoTable rows={rows} />}</Loadable>;
}

function PromoTable({ rows }) {
  const [group, setGroup] = useState("month");
  const [filter, setFilter] = useState({ month: "", line: "", sku: "" });
  const set = (k) => (v) => setFilter((f) => ({ ...f, [k]: v }));
  const uniq = (k) => [...new Set(rows.map((r) => r[k]))];

  // 每行对应的「上一个有数据的月份」的同一 SKU
  const prevOf = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const prev = rows
        .filter((p) => p.line === r.line && p.sku === r.sku && p.month < r.month)
        .sort((a, b) => b.month.localeCompare(a.month))[0];
      if (prev) map.set(r, prev);
    }
    return map;
  }, [rows]);

  const shown = rows.filter((r) => (!filter.month || r.month === filter.month) && (!filter.line || r.line === filter.line) && (!filter.sku || r.sku === filter.sku));
  const groups = new Map();
  for (const r of shown) {
    const k = groupKey[group](r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }

  return (
    <>
      <FilterBar>
        <Segmented options={GROUPS} value={group} onChange={setGroup} />
        <Select label="月份" value={filter.month} options={uniq("month").sort().reverse()} onChange={set("month")} />
        <Select label="业务线" value={filter.line} options={uniq("line")} onChange={set("line")} />
        <Select label="SKU" value={filter.sku} options={uniq("sku")} onChange={set("sku")} />
        <span className="legend"><i className="changed-dot" /> 与上月不同</span>
      </FilterBar>
      {shown.length === 0 ? (
        <Empty>没有符合条件的记录</Empty>
      ) : (
        <div className="table-wrap">
          <table className="grid">
            <thead>
              <tr>
                <th>月份</th>
                <th>业务线</th>
                <th>SKU</th>
                {PROMO_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}
              </tr>
            </thead>
            {[...groups].map(([name, items]) => (
              <tbody key={name}>
                <tr className="group-row">
                  <td colSpan={3 + PROMO_FIELDS.length}>
                    {name} <span className="muted">{items.length} 条</span>
                  </td>
                </tr>
                {items.map((r) => {
                  const prev = prevOf.get(r);
                  return (
                    <tr key={`${r.month}|${r.line}|${r.sku}`}>
                      <td className="nowrap">{r.month}</td>
                      <td className="nowrap">{r.line}</td>
                      <td className="nowrap">{r.sku}</td>
                      {PROMO_FIELDS.map(([key]) => {
                        const changed = prev && prev[key] !== r[key];
                        return (
                          <td key={key} className={`${changed ? "changed" : ""} ${LONG.has(key) ? "long" : ""}`} title={changed ? `${prev.month}：${prev[key]}` : undefined}>
                            {r[key]}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </>
  );
}
