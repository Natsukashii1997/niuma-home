import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { Button, Empty, FilterBar, Loadable, Segmented, Select } from "../../ui/components.jsx";
import { PROMO_FIELDS } from "../../constants.js";
import { buildPromoView, normalizePromoView, readPromoView, writePromoView } from "./promo-view.js";

const GROUPS = [["sku", "按 SKU"], ["line", "按业务线"], ["month", "按月份"]];
const LONG = new Set(["newDeal", "renewal"]);

export default function PromosView() {
  const state = useApi("/api/promos");
  return <Loadable state={state}>{(rows) => <PromoTable rows={rows} />}</Loadable>;
}

function PromoTable({ rows }) {
  const [view, setView] = useState(() => normalizePromoView(readPromoView(), rows));
  const [collapsed, setCollapsed] = useState(new Set());
  const { group, filter } = view;
  const { groups, previous } = useMemo(() => buildPromoView(rows, view), [rows, view]);
  useEffect(() => { writePromoView(view); }, [view]);
  const set = (key) => (value) => setView((old) => normalizePromoView({ ...old, filter: { ...old.filter, [key]: value } }, rows));
  const uniq = (key, source = rows) => [...new Set(source.map((row) => row[key]))];
  const allExpanded = groups.every((item) => !collapsed.has(item.key));
  const allCollapsed = groups.every((item) => collapsed.has(item.key));
  function toggle(key) {
    setCollapsed((old) => {
      const next = new Set(old);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <>
      <FilterBar>
        <Segmented options={GROUPS} value={group} onChange={(value) => { setView((old) => ({ ...old, group: value })); setCollapsed(new Set()); }} />
        <Select label="月份" value={filter.month} options={uniq("month").sort().reverse()} onChange={set("month")} />
        <Select label="业务线" value={filter.line} options={uniq("line")} onChange={set("line")} />
        <Select label="SKU" value={filter.sku} options={uniq("sku", rows.filter((row) => !filter.line || row.line === filter.line))} onChange={set("sku")} />
        <span className="legend"><i className="changed-dot" /> 与上一个有数据的月份不同</span>
      </FilterBar>
      {!groups.length ? <Empty>没有符合条件的记录</Empty> : (
        <div className="table-wrap promo-table-wrap" role="region" aria-label="促销表" tabIndex={0}>
          <table className="grid promo-table">
            <thead><tr><th>月份</th><th>业务线</th><th>SKU</th>{PROMO_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
            {groups.map(({ key, name, rows: items, latestChange }) => (
              <tbody key={key}>
                <tr className="group-row">
                  <td colSpan={3 + PROMO_FIELDS.length} onClick={() => toggle(key)}>
                    <div className="promo-group">
                      <button type="button" className="promo-group-toggle" data-dither="" aria-expanded={!collapsed.has(key)} aria-label={`${collapsed.has(key) ? "展开" : "折叠"} ${name}`}>
                        {collapsed.has(key) ? <PixelIcon name="right" size={16} /> : <PixelIcon name="down" size={16} />}
                        <span>{name}</span><span className="muted">{items.length} 条</span>
                        {group === "sku" && <span className="muted small">{latestChange ? `最近变化：${latestChange}` : "暂无变化记录"}</span>}
                      </button>
                      <div className="row" onClick={(event) => event.stopPropagation()}>
                        <Button disabled={allExpanded} onClick={() => setCollapsed(new Set())}>全部展开</Button>
                        <Button disabled={allCollapsed} onClick={() => setCollapsed(new Set(groups.map((item) => item.key)))}>全部折叠</Button>
                      </div>
                    </div>
                  </td>
                </tr>
                {!collapsed.has(key) && items.map((row) => (
                  <tr key={JSON.stringify([row.month, row.line, row.sku])}>
                    <td className="nowrap">{row.month}</td><td className="nowrap">{row.line}</td><td className="nowrap">{row.sku}</td>
                    {PROMO_FIELDS.map(([field]) => <PromoCell key={field} value={row[field]} field={field} previous={previous.get(row)} />)}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </>
  );
}

function PromoCell({ value, field, previous }) {
  const [anchor, setAnchor] = useState(null);
  const timer = useRef(null);
  const id = useId();
  const changed = previous && previous[field] !== value;
  const cancelClose = () => clearTimeout(timer.current);
  const closeSoon = () => { cancelClose(); timer.current = setTimeout(() => setAnchor(null), 120); };
  useEffect(() => () => clearTimeout(timer.current), []);
  function show(event) {
    if (!changed) return;
    cancelClose();
    setAnchor(event.currentTarget.getBoundingClientRect());
  }
  return (
    <td className={`${changed ? "changed promo-changed" : ""} ${LONG.has(field) ? "long" : ""}`}
      tabIndex={changed ? 0 : undefined} aria-describedby={anchor ? id : undefined}
      onMouseEnter={show} onMouseLeave={closeSoon} onFocus={show} onBlur={closeSoon}>
      {value}
      {anchor && createPortal(<PreviousValue id={id} anchor={anchor} text={`${previous.month}：${previous[field]}`}
        onClose={() => setAnchor(null)} onEnter={cancelClose} onLeave={closeSoon} />, document.body)}
    </td>
  );
}

// 挂在 body 上，避免浮层被表格的横向/纵向滚动容器裁切。
function PreviousValue({ id, anchor, text, onClose, onEnter, onLeave }) {
  const ref = useRef(null);
  const [position, setPosition] = useState(null);
  useLayoutEffect(() => {
    const { width, height } = ref.current.getBoundingClientRect();
    const left = Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12));
    const top = anchor.bottom + height + 6 < window.innerHeight ? anchor.bottom + 6 : Math.max(12, anchor.top - height - 6);
    setPosition({ left, top });
  }, [anchor]);
  useEffect(() => {
    const scroll = (event) => { if (!ref.current?.contains(event.target)) onClose(); };
    const keydown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", keydown);
    return () => {
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", keydown);
    };
  }, [onClose]);
  return <div ref={ref} id={id} role="tooltip" className="promo-tooltip" onMouseEnter={onEnter} onMouseLeave={onLeave}
    style={position || { visibility: "hidden", left: 0, top: 0 }}>{text}</div>;
}
