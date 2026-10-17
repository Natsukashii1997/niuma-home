import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Empty, FilterBar, Loadable, Segmented, Select } from "../../ui/components.jsx";
import { PROMO_FIELDS } from "../../constants.js";
import { buildPromoView, normalizePromoView, readPromoView, writePromoView } from "./promo-view.js";

const GROUPS = [["sku", "按 SKU"], ["line", "按业务线"], ["month", "按月份"]];
const LONG = new Set(["newDeal", "renewal"]);
// 定宽列；新签、续费两列不写宽度，平分剩余（二次评审 P2-5）
const COL_W = { month: 88, line: 88, sku: 120, trial: 88, price: 168 };

export default function PromosView() {
  const state = useApi("/api/promos");
  return <Loadable state={state} name="方案汇总">{(rows) => <PromoTable rows={rows} />}</Loadable>;
}

function PromoTable({ rows }) {
  const [view, setView] = useState(() => normalizePromoView(readPromoView(), rows));
  const [collapsed, setCollapsed] = useState(new Set());
  const { group, filter } = view;
  const { groups, previous } = useMemo(() => buildPromoView(rows, view), [rows, view]);
  useEffect(() => { writePromoView(view); }, [view]);
  const set = (key) => (value) => setView((old) => normalizePromoView({ ...old, filter: { ...old.filter, [key]: value } }, rows));
  const uniq = (key, source = rows) => [...new Set(source.map((row) => row[key]))];
  // v3：按哪个字段分组，就隐藏哪一列（按 SKU 分组时业务线和 SKU 都在组名里）。
  const hidden = new Set(group === "month" ? ["month"] : group === "line" ? ["line"] : ["line", "sku"]);
  const BASE = [["month", "月份"], ["line", "业务线"], ["sku", "SKU"]].filter(([k]) => !hidden.has(k));
  const [copied, setCopied] = useState("");
  async function copyRows(key, items) {
    const text = items.map((r) => `${r.month} ${r.line} · ${r.sku}\n${PROMO_FIELDS.map(([f, l]) => `${l}：${r[f]}`).join("\n")}`).join("\n\n");
    try { await navigator.clipboard.writeText(text); setCopied(key); setTimeout(() => setCopied(""), 1800); }
    catch { setCopied("error"); }
  }
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
        <span className="spacer" />
        <Button disabled={!groups.length || allExpanded} onClick={() => setCollapsed(new Set())}>全部展开</Button>
        <Button disabled={!groups.length || allCollapsed} onClick={() => setCollapsed(new Set(groups.map((item) => item.key)))}>全部折叠</Button>
      </FilterBar>
      {!groups.length ? <Empty>没有符合条件的记录</Empty> : (
        <div className="table-wrap promo-table-wrap" role="region" aria-label="促销表" tabIndex={0}>
          <table className="grid promo-table">
            <colgroup>{BASE.map(([k]) => <col key={k} style={{ width: COL_W[k] }} />)}{PROMO_FIELDS.map(([f]) => <col key={f} style={{ width: COL_W[f] }} />)}<col style={{ width: 40 }} /></colgroup>
            <thead><tr>{BASE.map(([k, l]) => <th key={k}>{l}</th>)}{PROMO_FIELDS.map(([, label]) => <th key={label}>{label}</th>)}<th aria-label="操作" /></tr></thead>
            {groups.map(({ key, name, rows: items, latestChange }) => (
              <tbody key={key}>
                <tr className="group-row">
                  <td colSpan={BASE.length + PROMO_FIELDS.length + 1} onClick={() => toggle(key)}>
                    <div className="promo-group">
                      <button type="button" className="promo-group-toggle" data-dither="" aria-expanded={!collapsed.has(key)} aria-label={`${collapsed.has(key) ? "展开" : "折叠"} ${name}`}>
                        {collapsed.has(key) ? <PixelIcon name="right" size={16} /> : <PixelIcon name="down" size={16} />}
                        <span>{name}</span><span className="muted">{items.length} 条</span>
                        {group === "sku" && <span className="muted small">{latestChange ? `最近变化：${latestChange}` : "暂无变化记录"}</span>}
                      </button>
                      <div className="row" onClick={(event) => event.stopPropagation()}>
                        {group === "sku" && <a className="link link-btn" href={href("marketing", "sku", items[0].line, items[0].sku)}>SKU 档案<PixelIcon name="right" /></a>}
                        <Button onClick={() => copyRows(key, items)}><PixelIcon name="copy" />{copied === key ? "已复制本组" : "复制本组"}</Button>
                      </div>
                    </div>
                  </td>
                </tr>
                {!collapsed.has(key) && items.map((row) => (
                  <tr key={JSON.stringify([row.month, row.line, row.sku])}>
                    {BASE.map(([k]) => <td key={k} className={k === "sku" ? "nowrap promo-sku" : "nowrap"}>{k === "sku" ? <a className="sku-link" href={href("marketing", "sku", row.line, row.sku)} title="打开 SKU 档案">{row.sku}</a> : row[k]}</td>)}
                    {PROMO_FIELDS.map(([field]) => <PromoCell key={field} value={row[field]} field={field} previous={previous.get(row)} />)}
                    <td className="promo-actions"><button type="button" className="icon-btn" title="复制这一行" onClick={() => copyRows(JSON.stringify([row.month, row.line, row.sku]), [row])}><PixelIcon name={copied === JSON.stringify([row.month, row.line, row.sku]) ? "check" : "copy"} /></button></td>
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
  const [open, setOpen] = useState(false);
  const long = LONG.has(field) && String(value).length > 40;
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
      {long ? <button type="button" className={`promo-long${open ? " is-open" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={open ? undefined : "clamp-2"}>{value}</span><span className="promo-more">{open ? "收起" : "展开"}</span></button> : value}
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
