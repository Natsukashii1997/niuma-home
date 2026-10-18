import { useMemo, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button, Loadable, PageHeader, StatStrip, Tag } from "../../ui/components.jsx";

// 品牌数据（用户 2026-10-18 确认草稿 docs/design/brand-data）：飞书品牌多维表格里每一版是一张表，只读。
// 默认看最新一版；可切到前几版。和上一版按数据项ID比较：值不同算「更新」，名字不同算「改名」，上一版有、本版没有算「下线」；
// 「数据核对」标了删减的留在表里，显示删除线和「待删减」。只有更新、新增的数值用信号橙。
const LINES = [["品牌综合", "brand"], ["大学辅导", "uni"], ["国际课程", "intl"], ["申诉服务", "appeal"]];
const LINE_CLASS = Object.fromEntries(LINES);
const TAG = { upd: <Tag tone="orange">更新</Tag>, new: <Tag tone="orange">新增</Tag>, ren: <Tag>改名</Tag>, del: <span className="brand-del-tag">待删减</span> };
const nums = (s) => s.split(/(\d+(?:[.,:]\d+)*%?)/).map((part, i) => (i % 2 ? <span key={i} className="type-num">{part}</span> : part));

export function diffVersion(versions, i) {
  const cur = versions[i].items, prev = versions[i + 1]?.items;
  const byId = new Map((prev || []).map((x) => [x.id, x]));
  const rows = cur.map((x) => {
    const p = prev ? byId.get(x.id) : undefined;
    const kind = x.check === "删减" ? "del" : !prev ? "" : !p ? "new" : (p.value || "") !== (x.value || "") ? "upd" : p.name !== x.name ? "ren" : "";
    return { ...x, prev: p, kind, renamed: !!p && p.name !== x.name, valueChanged: !!p && (p.value || "") !== (x.value || "") };
  });
  const ids = new Set(cur.map((x) => x.id));
  return { rows, gone: prev ? prev.filter((x) => !ids.has(x.id)) : [], hasPrev: !!prev };
}

export default function BrandPage() {
  const state = useApi("/api/v3/brand");
  return <Loadable state={state} name="品牌数据" big>{(data) => <BrandData initial={data} />}</Loadable>;
}

function BrandData({ initial }) {
  const [data, setData] = useState(initial);
  const [sync, setSync] = useState({ busy: false, error: "" });
  const [v, setV] = useState(0);
  const [line, setLine] = useState(""), [q, setQ] = useState(""), [changed, setChanged] = useState(false);
  const versions = data.versions;
  const ver = versions[v], d = useMemo(() => diffVersion(versions, v), [versions, v]);
  const prevVer = versions[v + 1];
  async function refresh() {
    setSync({ busy: true, error: "" });
    try { setData(await apiSend("POST", "/api/v3/brand/refresh")); setSync({ busy: false, error: "" }); }
    catch (e) { setSync({ busy: false, error: e.message }); }
  }
  const pick = (i) => { setV(i); setChanged(false); };
  const count = (k) => d.rows.filter((r) => r.kind === k).length;
  const term = q.trim().toLowerCase();
  const shown = d.rows.filter((r) => (!line || r.line === line) && (!term || `${r.id}${r.name}${r.value}`.toLowerCase().includes(term)) && (!changed || r.kind || r.renamed));
  const groups = [...shown.reduce((m, r) => m.set(r.dim, [...(m.get(r.dim) || []), r]), new Map())];
  const readAt = new Date(data.readAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\//g, "-");
  return (
    <div className="brand-page">
      <PageHeader title="品牌" subtitle={<>最新读取于 <span className="tnum">{readAt}</span>{sync.error && <span className="risk-text"> · 重新读取失败：{sync.error}（下面仍是上次读到的数据）</span>}</>} actions={<>
        {sync.busy ? <div style={{ width: 200 }}><StepProgress label="读取飞书（只读）" /></div> : <Button onClick={refresh}><PixelIcon name="refresh" />重新读取</Button>}
        <a className="btn" href={data.source} target="_blank" rel="noreferrer"><PixelIcon name="external" size={14} />在飞书打开</a>
      </>} />
      <div className="brand-vers" role="tablist" aria-label="版本">
        {versions.map((x, i) => (
          <button key={x.table} type="button" role="tab" aria-selected={i === v} className={`brand-ver${i === v ? " is-on" : ""}${i === 0 ? " is-latest" : ""}`} onClick={() => pick(i)}>
            <span className="brand-ver-badge">{i === 0 ? "最新" : "历史"}</span>
            <span className="label">{i === 0 ? "当前版本" : "历史版本"} · {x.date}</span>
            <span className="brand-ver-no">{x.version}</span>
            <span className="brand-ver-count"><b>{x.items.length}</b><span className="label">个数据项</span></span>
          </button>
        ))}
      </div>
      <StatStrip items={d.hasPrev ? [
        { label: "数据项", value: ver.items.length, foot: ver.version },
        { label: "数值更新", value: count("upd"), foot: `相比 ${prevVer.version}`, tone: count("upd") ? "signal" : undefined },
        { label: "改名", value: d.rows.filter((r) => r.renamed).length, foot: "按数据项ID对齐" },
        { label: "本版新增", value: count("new"), foot: "上一版没有", tone: count("new") ? "signal" : undefined },
        { label: "下线", value: d.gone.length, foot: "上一版有、本版没有" },
        { label: "待删减", value: count("del"), foot: "数据核对标了「删减」" },
      ] : [{ label: "数据项", value: ver.items.length, foot: ver.version }, { label: "对比", value: "—", foot: "最早的版本，没有上一版可比", tone: "muted" }]} />
      <div className="toolbar brand-bar">
        <button type="button" className={`chip${!line ? " is-on" : ""}`} onClick={() => setLine("")}>全部业务线 <span className="tnum">{ver.items.length}</span></button>
        {LINES.map(([name, cls]) => <button key={name} type="button" className={`chip${line === name ? " is-on" : ""}`} onClick={() => setLine(line === name ? "" : name)}><i className={`brand-sw line-${cls}`} />{name} <span className="tnum">{ver.items.filter((x) => x.line === name).length}</span></button>)}
        <span className="spacer" />
        <label className="search-box"><PixelIcon name="search" /><input placeholder="搜指标名称、数据、ID" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {d.hasPrev && <label className="check-inline"><input type="checkbox" checked={changed} onChange={(e) => setChanged(e.target.checked)} />只看有变化</label>}
      </div>
      <div className="brand-table">
        <table className="grid compact">
          <thead><tr><th>数据项ID</th><th>指标名称</th><th>业务线</th><th>当前数据</th><th>{prevVer ? `上一版 ${prevVer.version}` : "上一版"}</th><th>变化</th><th>责任人</th></tr></thead>
          <tbody>
            {!shown.length && <tr><td colSpan={7} className="muted brand-empty">没有符合条件的数据项</td></tr>}
            {groups.map(([g, rows]) => [
              <tr key={`g-${g}`} className="brand-group"><td colSpan={7}><strong>{g || "未分维度"}</strong><span className="tnum muted">{rows.length} 项</span></td></tr>,
              ...rows.map((r) => (
                <tr key={`${r.id}-${r.name}`} className={r.kind === "del" ? "is-del" : ""}>
                  <td className="mono small muted">{r.id}</td>
                  <td className="brand-item-name">{r.name}{r.renamed && <small className="muted">原名：{r.prev.name}</small>}</td>
                  <td className="nowrap"><i className={`brand-sw line-${LINE_CLASS[r.line] || "brand"}`} /> {r.line}</td>
                  <td className={`brand-val${r.value ? "" : " is-empty"}`}>{!r.value ? "未填" : r.kind === "upd" || r.kind === "new" ? nums(r.value) : r.value}</td>
                  <td className="brand-prev">{!d.hasPrev ? "—" : !r.prev ? "上一版没有" : r.valueChanged ? <s>{r.prev.value || "未填"}</s> : "未变"}</td>
                  <td>{TAG[r.kind] || (r.renamed ? TAG.ren : null)}</td>
                  <td className="small nowrap">{r.owner}</td>
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      {d.gone.length > 0 && (
        <section className="brand-gone">
          <h2>相比上一版下线的数据项<span className="tnum muted">{d.gone.length} 项 · 只在 {prevVer.version} 里有</span></h2>
          <ul>{d.gone.map((x) => <li key={x.id}><span className="label">{x.id} · {x.line} · {x.dim}</span><strong>{x.name}</strong><span className="mono small muted">最后的数据：{x.value || "未填"}</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
