import { Fragment, useEffect, useRef, useState } from "react";
import { apiSend, useApi } from "../../api.js";
import { deliveryMonth } from "../../constants.js";
import { href } from "../../router.js";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { Button, Loadable, MonthSwitch, PendingButton, Placeholder, Tag } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { BARRIERS, MECHANISMS } from "./playbook.js";
import { PLAY_BY_ID } from "./playbook-cards.js";
import { authoredStrategyRecord } from "./strategy-record.js";
import { DismissibleNote } from "../../ui/dismissible.jsx";

// 用户策略（结构见 docs/用户策略规范.md，接口见 T13）：
// 0 核心结论 → 1 全局研判 → 2 用户洞察（地区矩阵）→ 3 机会收敛 → 4 促销策略 → 附 依据与待确认。
// 用户情况（核心判断、1–3 段）按月内置，打开即可查看；点正文就在原位修改。本月目标、核心打法与第 4 段由「生成促销策略」按钮产出。
// 每条内容是 [正文, 来源]；页面只标「推测」，其余来源留在数据里（附录与飞书版用）。
// 修改、生成、定稿都是「预览 → 确认 → 回读」；打法与心理机制存编号，显示时取打法库的标准名。
const SECTIONS = [["us-0", "0", "核心结论"], ["us-1", "1", "全局研判"], ["us-2", "2", "用户洞察"], ["us-3", "3", "机会收敛"], ["us-4", "4", "促销策略"], ["us-a", "附", "依据与待确认"]];
const TIERS = ["主战场", "次要", "平稳"];
const TIER_TONE = { 主战场: "ink", 次要: "frame", 平稳: "neutral" };
const STATUS_TONE = { 草稿: "amber", 定稿: "green" };
const TEMP_CLASS = { 冷: "is-cold", 温: "is-warm", 热: "is-hot" };
const ROWS = [["node", "用户节点"], ["task", "待办任务"], ["pain", "核心痛点"], ["temp", "需求温度"], ["barrier", "决策障碍"], ["opp", "机会点"], ["master", "硕士关注"]];
const OPP_COLS = ["优先级", "机会", "地区", "业务线", "新签 / 续费", "窗口", "依据"];
const barrierName = Object.fromEntries(BARRIERS.flatMap(([, , list]) => list));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const when = (iso) => (iso ? new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "");

// 时间线依据：一致时不显示；有变化或缺快照才挂出来，可点 × 关掉，直到依据再次变化（用户 2026-10-23）。
const evidenceKey = (month) => `niuma:us-evidence:${month}`;
function EvidenceNotice({ month, ev }) {
  const stamp = `${ev.status}:${ev.fingerprint || ""}`; // 指纹已含来源、窗口与事件；只重新同步不算变化
  const [closed, setClosed] = useState(() => { try { return localStorage.getItem(evidenceKey(month)); } catch { return null; } });
  if (ev.status === "current" || closed === stamp) return null;
  const close = () => { try { localStorage.setItem(evidenceKey(month), stamp); } catch { /* 存不了就只关本次 */ } setClosed(stamp); };
  return <p className="us-warn-line">
    <PixelIcon name="alert" />{ev.message}
    {ev.syncedAt && <span className="small tnum">同步于 {ev.syncedAt}</span>}
    <button type="button" className="icon-btn us-warn-close" onClick={close} aria-label="关闭这条提示"><PixelIcon name="close" /></button>
  </p>;
}

export function Strategy() {
  const [month, setMonth] = useState(deliveryMonth);
  const path = `/api/v3/user-strategy?month=${month}`;
  const state = useApi(path);
  const gen = useWriteFlow(), fin = useWriteFlow(), edit = useWriteFlow();
  const [editing, setEditing] = useState(null); // { path, sub, text, done }
  // 保存后重新读取时沿用上一份数据，页面不卸载（保留滚动位置和格内「已保存」提示）。
  const [last, setLast] = useState(null);
  useEffect(() => { if (state.data) setLast(state.data); }, [state.data]);
  const view = state.loading && last?.month === month ? { ...state, loading: false, data: last } : state;
  const d = view.data;
  const busy = gen.busy || fin.busy || edit.busy;
  const switchMonth = (m) => { if (busy) return; gen.reset(); fin.reset(); edit.reset(); setEditing(null); setMonth(m); };
  // 回读全部可保存正文；时间线派生字段和读取状态可随最近一次同步改变。
  const reread = async (receipt, pv) => { const fresh = await apiSend("GET", path); state.reload(); return sameJson(authoredStrategyRecord(fresh), authoredStrategyRecord(pv.value)); };
  const confirm = (flow) => flow.confirm((pv) => apiSend("POST", `/api/v3/user-strategy/${month}/confirm`, { previewId: pv.previewId, confirm: true }), reread);
  // 保存成功的格子先显示「已保存」，关掉提示后退出修改。
  useEffect(() => { if (editing?.done && edit.phase === "idle") setEditing(null); }, [editing, edit.phase]);

  const st = d?.strategy, overwrite = st?.status === "定稿";
  const generate = () => gen.preview(() => apiSend("POST", "/api/v3/user-strategy/generate/preview", { month, ...(overwrite && { confirmOverwrite: true }) }));
  const finalize = () => fin.preview(() => apiSend("POST", `/api/v3/user-strategy/${month}/finalize/preview`));
  const editor = {
    editing, flow: edit,
    is: (p, sub) => editing?.path === p && editing.sub === sub,
    open: (p, sub) => { if (busy || edit.phase === "unknown" || d?.month !== month) return; edit.reset(); setEditing({ path: p, sub, text: textOf(d, p, sub).join("\n") }); },
    text: (text) => { edit.reset(); setEditing({ ...editing, text }); },
    close: () => { if (edit.busy) return; edit.reset(); setEditing(null); },
    preview: () => edit.preview(async () => apiSend("POST", `/api/v3/user-strategy/${month}/edit/preview`, { path: editing.path, lines: compose(d, editing) })),
    confirm: async () => { if (await confirm(edit)) setEditing((e) => e && { ...e, done: true }); },
    reread: () => { edit.resolve(); setEditing(null); state.reload(); },
  };

  return (
    <div className="us-page">
      <div className="us-bar">
        <MonthSwitch month={month} onChange={switchMonth} />
        {d?.origin && <>
          <span className="us-state"><span className="label">用户情况</span><Tag tone={d.origin === "已修改" ? "blue" : "frame"}>{d.origin}</Tag>{d.updatedAt && <span className="small muted tnum">修改于 {when(d.updatedAt)}</span>}</span>
          <span className="us-state"><span className="label">促销策略</span>{st ? <><Tag tone={STATUS_TONE[st.status]}>{st.status}</Tag><span className="small muted tnum">生成于 {when(st.generatedAt)}{st.model ? ` · ${st.model}` : ""}</span></> : <Tag>未生成</Tag>}</span>
        </>}
        <span className="us-bar-actions">
          {d?.origin && <Button variant={st ? "default" : "primary"} onClick={generate} disabled={busy}>{!st ? "生成促销策略" : overwrite ? "重新生成促销（覆盖定稿）" : "重新生成促销"}</Button>}
          {st?.status === "草稿" && <Button onClick={finalize} disabled={busy}>促销定稿</Button>}
          <PendingButton task="T13-用户策略生成">导出到飞书</PendingButton>
        </span>
      </div>
      {d?.timelineEvidence && <EvidenceNotice key={month} month={month} ev={d.timelineEvidence} />}
      <WriteBox flow={gen} title={`${month} 促销策略 · 生成预览`} confirmLabel={overwrite ? "覆盖定稿并保存为草稿" : "保存为草稿"} savedText="促销策略已保存为草稿，回读核对一致"
        onConfirm={() => confirm(gen)} onRepreview={generate} onReread={() => { gen.resolve(); state.reload(); }}>
        {(pv) => <GenPreview pv={pv} />}
      </WriteBox>
      <WriteBox flow={fin} title={`${month} 促销策略 · 定稿`} confirmLabel="确认定稿" savedText="促销策略已定稿，回读核对一致"
        onConfirm={() => confirm(fin)} onRepreview={finalize} onReread={() => { fin.resolve(); state.reload(); }}>
        {() => <p>将 {month} 的促销策略标为定稿。定稿后用户情况与本月目标仍可修改；重新生成促销需要明确确认覆盖。</p>}
      </WriteBox>
      <Loadable state={view} name="用户策略" big>{(data) => data.status === "未准备"
        ? <Placeholder icon="target" className="is-page" title={`${data.month} 的用户情况还没有准备`} />
        : <Report d={data} editor={editor} onGenerate={generate} busy={busy} />}</Loadable>
    </div>
  );
}

function GenPreview({ pv }) {
  const v = pv.value.strategy;
  return (
    <div className="us-gen-preview">
      {pv.overwrite && <p className="us-warn-line"><PixelIcon name="alert" />将覆盖当前{pv.overwrite}的促销策略，状态回到草稿。用户情况不变。</p>}
      <dl className="kv">
        <dt>本月目标</dt><dd>{v.goal}</dd>
        <dt>核心打法</dt><dd>{v.plays.map(([k, t]) => `${k}：${t}`).join("；")}</dd>
        {Object.entries(v.promo.lines).map(([line, rows]) => <Fragment key={line}><dt>{line}</dt><dd>{rows.map(([role, ids], i) => <Fragment key={i}>{i > 0 && "；"}{role} <Plays ids={ids} /></Fragment>)}</dd></Fragment>)}
        <dt>不选</dt><dd>{v.promo.exclude.map(([ids], i) => <Fragment key={i}>{i > 0 && "；"}<Plays ids={ids} /></Fragment>)}</dd>
      </dl>
      {v.warnings.length > 0 && <div className="us-warns"><span className="label">写作规范提示 · {v.warnings.length} 条（不拦截）</span><ul className="us-items">{v.warnings.slice(0, 12).map((w, i) => <li key={i}>{w}</li>)}</ul>{v.warnings.length > 12 && <span className="small muted">另有 {v.warnings.length - 12} 条，保存后见附录</span>}</div>}
    </div>
  );
}

/* ---------- 原位修改 ---------- */
// path 对应接口的一格；sub 指格内的一部分：1.3 的一个地区（地区 key）、3 的一行（行号），
// 或同一字段出现在两处时区分位置。提交时前端把这一部分拼回整格。
const nameOf = (d, key) => d.regions.find((r) => r.key === key)?.name || key;
function linesOf(d, path) {
  const [head, a, b] = path.split(".");
  if (head === "summary" || head === "strategy") return [d[head][a]];
  if (head === "opportunities") return d.opportunities.map((x) => x.join(" | "));
  if (a === "tiers") return d.overview.tiers.map(([k, t, w]) => `${nameOf(d, k)} | ${t} | ${w}`);
  if (head === "overview") return d.overview[a].map(([t]) => t);
  const r = d.regions.find((x) => x.key === a);
  if (b === "temp") return [r.temp[0] === r.temp[1] ? r.temp[0] : `${r.temp[0]} → ${r.temp[1]}`, ...r.tempNote.map(([t]) => t)];
  if (b === "barrier") return r.barrier.map(([c, t]) => `${barrierName[c] || c}：${t}`);
  return r[b].map(([t]) => t);
}
// 一行一个字段的表单（1.3 一个地区、3 一行机会）；其余是多行文本框。
const fieldsOf = (path) => (path === "overview.tiers" ? [["分档", TIERS], ["依据"]] : path === "opportunities" ? OPP_COLS.map((c, i) => (i === 0 ? [c, ["P0", "P1", "P2"]] : [c])) : null);
function textOf(d, path, sub) {
  if (path === "overview.tiers") { const t = d.overview.tiers.find(([k]) => k === sub); return [t[1], t[2]]; }
  if (path === "opportunities") return d.opportunities[sub];
  return linesOf(d, path);
}
function compose(d, { path, sub, text }) {
  const fields = fieldsOf(path);
  if (!fields) return text.split("\n");
  const vals = text.split("\n").map((v) => v.trim());
  fields.forEach(([label], i) => {
    if (!vals[i]) throw new Error(`「${label}」不能为空`);
    if (vals[i].includes("|")) throw new Error(`「${label}」里不能有「|」`);
  });
  if (path === "overview.tiers") return d.overview.tiers.map(([k, t, w]) => [nameOf(d, k), ...(k === sub ? vals : [t, w])].join(" | "));
  return d.opportunities.map((row, i) => (i === sub ? vals : row).join(" | "));
}
const HINT = {
  temp: "第一行写温度：冷 / 温 / 热，或「温 → 热」；之后每行一条说明",
  barrier: `每行「障碍名称：具体描述」，名称取自：${Object.values(barrierName).join("、")}`,
};

// 可修改的正文：点击（或回车）即在原位出现文本框 → 预览 → 确认保存 → 回读。选中文字时不触发。
function Editable({ editor, path, sub, className = "", children }) {
  const on = editor.is(path, sub);
  const open = () => { if (!window.getSelection()?.toString()) editor.open(path, sub); };
  if (!on) return (
    <div className={`us-editable ${className}`} role="button" tabIndex={0} title="点击修改" onClick={open}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) editor.open(path, sub); }}>{children}</div>
  );
  return <div className={`us-editable is-editing ${className}`}>{editor.editing.done && children}<InlineEdit editor={editor} /></div>;
}

function InlineEdit({ editor }) {
  const { editing: e, flow } = editor;
  const fields = fieldsOf(e.path), key = e.path.split(".")[2];
  const locked = flow.busy || flow.phase === "unknown";
  // 打开时聚焦第一个文本框，光标放到末尾。
  const box = useRef(null);
  useEffect(() => { const t = box.current?.querySelector("textarea"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, []);
  const onKey = (ev) => {
    if (ev.key === "Escape") editor.close();
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && flow.phase === "idle") editor.preview();
  };
  const vals = e.text.split("\n");
  const setVal = (i, v) => { const next = [...vals]; next[i] = v.replace(/\n/g, " "); editor.text(next.join("\n")); };
  return (
    <div className="us-inline" ref={box}>
      {!e.done && (fields
        ? <div className="us-fields">{fields.map(([label, options], i) => (
            <label key={label}><span className="label">{label}</span>
              {options
                ? <select value={vals[i]} onChange={(ev) => setVal(i, ev.target.value)} disabled={locked}>{options.map((o) => <option key={o}>{o}</option>)}</select>
                : <textarea value={vals[i] || ""} rows={label === "依据" || label === "机会" ? 2 : 1} onChange={(ev) => setVal(i, ev.target.value)} onKeyDown={onKey} disabled={locked} />}
            </label>
          ))}</div>
        : <textarea value={e.text} rows={Math.max(2, vals.length + 1)} onChange={(ev) => editor.text(ev.target.value)} onKeyDown={onKey} disabled={locked} />)}
      {!e.done && HINT[key] && <DismissibleNote as="span" id={`us-hint:${key}`} stamp="1" className="us-hint small muted">{HINT[key]}</DismissibleNote>}
      {!e.done && flow.phase === "idle" && <div className="write-actions"><Button onClick={editor.close}>取消</Button><Button variant="primary" onClick={editor.preview}>预览</Button></div>}
      <WriteBox flow={flow} title="修改预览" confirmLabel="确认保存" savedText="已保存，回读核对一致" onConfirm={editor.confirm} onRepreview={editor.preview} onReread={editor.reread}>
        {(pv) => <Piece d={pv.value} e={e} />}
      </WriteBox>
    </div>
  );
}

// 预览里只显示被修改的那一部分，按保存后的样子（含来源）呈现。
function Piece({ d, e }) {
  const [head, a, b] = e.path.split(".");
  if (head === "summary" || head === "strategy") return <p className="us-piece">{d[head][a]}</p>;
  if (head === "opportunities") return <dl className="kv">{d.opportunities[e.sub].map((v, i) => <Fragment key={i}><dt>{OPP_COLS[i]}</dt><dd>{v}</dd></Fragment>)}</dl>;
  if (a === "tiers") { const [k, t, w] = d.overview.tiers.find(([x]) => x === e.sub); return <TierBlock name={nameOf(d, k)} tier={t} count={d.overview.counts?.[k]} why={w} />; }
  if (head === "overview") return <Items list={d.overview[a]} />;
  const r = d.regions.find((x) => x.key === a);
  if (b === "temp") return <><Temp from={r.temp[0]} to={r.temp[1]} /><Items list={r.tempNote} /></>;
  if (b === "barrier") return <Barriers list={r.barrier} />;
  return <Items list={r[b]} />;
}

/* ---------- 报告 ---------- */
function Report({ d, editor, onGenerate, busy }) {
  const active = useActiveSection();
  const [openA, setOpenA] = useState(false);
  const go = (id) => {
    if (id === "us-a") setOpenA(true);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  };
  return (
    <>
      <nav className="us-nav" aria-label="段落导航">
        {SECTIONS.map(([id, no, name]) => (
          <button key={id} type="button" className={active === id ? "is-cur" : ""} onClick={() => go(id)}><b>{no}</b>{name}</button>
        ))}
      </nav>
      <Summary d={d} editor={editor} />
      <Overview d={d} editor={editor} />
      <Insight d={d} editor={editor} />
      <Opportunities d={d} editor={editor} />
      <Promo d={d} onGenerate={onGenerate} busy={busy} />
      <Appendix d={d} open={openA} onToggle={() => setOpenA(!openA)} />
    </>
  );
}

// 吸顶导航高亮：取最靠上的、已进入视口上半部的段落。
function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0][0]);
  useEffect(() => {
    const onScroll = () => {
      let cur = SECTIONS[0][0];
      for (const [id] of SECTIONS) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 140) cur = id; }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return active;
}

function Sec({ id, no, title, children }) {
  return (
    <section id={id} className="card us-sec">
      <div className="card-head"><h2><span className="us-no">{no}</span>{title}</h2></div>
      <div className="card-body">{children}</div>
    </section>
  );
}

const Src = ({ s }) => (s === "推测" ? <span className="us-src">推测</span> : null);
const Items = ({ list }) => (list.length ? <ul className="us-items">{list.map(([t, s], i) => <li key={i}><span className="us-text">{t}</span><Src s={s} /></li>)}</ul> : <span className="muted">—</span>);
const Barriers = ({ list }) => <ul className="us-items">{list.map(([c, t, s], i) => <li key={i}><span className="us-text"><b>{barrierName[c] || c}</b>：{t}</span><Src s={s} /></li>)}</ul>;
const Plays = ({ ids }) => ids.map((id, i) => <Fragment key={id}>{i > 0 && " + "}<a className="us-play" href={href("user", "playbook", id)} title={PLAY_BY_ID[id]?.lead || id}>{PLAY_BY_ID[id]?.name || id}</a></Fragment>);
const Mechs = ({ ids }) => ids.map((id, i) => <Fragment key={id}>{i > 0 && " + "}<span title={MECHANISMS[id]?.[1]}>{MECHANISMS[id]?.[0] || id}</span></Fragment>);

function Temp({ from, to }) {
  return <span className="us-temp-row"><b className={`us-temp ${TEMP_CLASS[from]}`}>{from}</b>{to && to !== from && <><span className="us-temp-arrow">→</span><b className={`us-temp ${TEMP_CLASS[to]}`}>{to}</b></>}</span>;
}

/* ---------- 0 核心结论 ---------- */
function Summary({ d, editor }) {
  const st = d.strategy;
  return (
    <Sec id="us-0" no="0" title="核心结论">
      <Editable editor={editor} path="summary.judgement" className="us-judge">{d.summary.judgement}</Editable>
      <div className="us-summary">
        <div><span className="label">本月目标</span>{st ? <Editable editor={editor} path="strategy.goal"><p>{st.goal}</p></Editable> : <p className="muted">生成促销策略后给出</p>}</div>
        <div><span className="label">核心打法</span>
          {st ? <dl className="us-plays">{st.plays.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl> : <p className="muted">生成促销策略后给出</p>}
        </div>
      </div>
    </Sec>
  );
}

/* ---------- 1 全局研判 ---------- */
const day = (s) => Date.UTC(...s.split("-").map((n, i) => (i === 1 ? n - 1 : +n))) / 86400000;
const mmdd = (t) => new Date(t * 86400000).toISOString().slice(5, 10).replace("-", "/");
// 文字比条长的短事件（如单日选课）把文字完整写在条外；排行时按文字宽度预留天数（按每天约 14px 估算）。
const textDays = (label) => Math.ceil(([...label].reduce((n, ch) => n + (ch.charCodeAt(0) < 128 ? 0.5 : 1), 0) * 11 + 14) / 14);
const isShort = ([from, to, , label]) => day(to) - day(from) + 1 < textDays(label);
// 同一地区时间重叠的节点条分行放，避免互相遮挡。
function stack(bars) {
  const ends = [];
  const placed = bars.map((b) => {
    const end = Math.max(day(b[1]), day(b[0]) + textDays(b[3]) - 1);
    let lane = ends.findIndex((e) => e < day(b[0]));
    if (lane < 0) lane = ends.length;
    ends[lane] = end;
    return [b, lane];
  });
  return { bars: placed, lanes: Math.max(1, ends.length) };
}

function TierBlock({ name, tier, count, why }) {
  return (
    <div className="us-tier-block">
      <div className="us-tier-name"><b>{name}</b>{tier && <Tag tone={TIER_TONE[tier]}>{tier}</Tag>}<span className="tnum muted small">{count ?? 0} 个节点</span></div>
      <p>{why}</p>
    </div>
  );
}

function Overview({ d, editor }) {
  const o = d.overview, w = d.window;
  const start = day(w.from), end = day(w.preheatTo), total = end - start + 1;
  const pos = (from, to) => ({ left: `${((day(from) - start) / total) * 100}%`, width: `${((day(to) - day(from) + 1) / total) * 100}%` });
  const pre = { left: `${((day(w.to) + 1 - start) / total) * 100}%`, right: 0 };
  const ticks = [];
  for (let t = start; t <= end; t += 7) ticks.push(t);
  const markers = o.markers.filter(([dt]) => dt >= w.from && dt <= w.preheatTo);
  const marks = markers.map(([dt]) => <i key={dt} className="us-g-mark" style={{ left: pos(dt, dt).left }} />);
  const tier = Object.fromEntries(o.tiers.map(([k, t]) => [k, t]));
  return (
    <Sec id="us-1" no="1" title="全局研判">
      <h3 className="us-h3">1.1 时间全景</h3>
      <div className="us-gantt">
        <div className="us-g-head">
          <span className="us-g-name is-head">日期</span>
          <div className="us-g-track">
            <span className="us-g-pre" style={pre} />
            {ticks.map((t) => <span key={t} className="us-g-tick tnum" style={{ left: `${((t - start) / total) * 100}%` }}>{mmdd(t)}</span>)}
          </div>
        </div>
        <div className="us-g-head is-marks">
          <span className="us-g-name is-head">外部节点</span>
          <div className="us-g-track">
            <span className="us-g-pre" style={pre} />
            {marks}
            {markers.map(([dt, n]) => <span key={dt} className="us-g-mlabel" style={{ left: pos(dt, dt).left }}><b>{n}</b><span className="tnum">{dt.slice(5).replace("-", "/")}</span></span>)}
          </div>
        </div>
        {o.lanes.map(([key, name, bars]) => {
          const placed = stack(bars);
          return (
            <div key={key} className="us-g-row">
              <span className="us-g-name">{name}<Tag tone={TIER_TONE[tier[key]]}>{tier[key]}</Tag></span>
              <div className="us-g-track" style={{ height: 12 + 24 * placed.lanes }}>
                <span className="us-g-pre" style={pre} />
                {marks}
                {placed.bars.map(([[from, to, cat, label, guess], lane]) => (
                  <span key={`${label}${from}`} className={`us-g-bar ev-${cat}${guess ? " is-guess" : ""}${isShort([from, to, cat, label]) ? " is-short" : ""}`} style={{ ...pos(from, to), top: 6 + 24 * lane }} title={`${label} ${from.slice(5)} → ${to.slice(5)}${guess ? "（推测）" : ""}`}>{label}</span>
                ))}
              </div>
            </div>
          );
        })}
        <div className="us-g-foot small">
          <span><i className="us-g-key is-pre" />提前预热 {mmdd(day(w.to) + 1)} → {mmdd(end)}</span>
          <span><i className="us-g-key is-guess" />推测日期</span>
        </div>
      </div>

      <h3 className="us-h3">1.2 共性与差异</h3>
      <div className="us-boxes">
        {[["common", "共性"], ["diff", "差异"], ["external", "外部变量"]].map(([k, label]) => (
          <div key={k} className="us-box"><div className="us-box-head">{label}</div>
            <Editable editor={editor} path={`overview.${k}`} className="us-box-body"><Items list={o[k]} /></Editable>
          </div>
        ))}
      </div>

      <h3 className="us-h3">1.3 地区分档</h3>
      <ul className="us-tiers">
        {TIERS.map((t) => (
          <li key={t}><Tag tone={TIER_TONE[t]}>{t}</Tag>
            <div className="us-tier-list">
              {o.tiers.filter(([, x]) => x === t).map(([k, , why]) => (
                <Editable key={k} editor={editor} path="overview.tiers" sub={k}><TierBlock name={nameOf(d, k)} count={o.counts?.[k]} why={why} /></Editable>
              ))}
              {!o.tiers.some(([, x]) => x === t) && <span className="muted">—</span>}
            </div>
          </li>
        ))}
      </ul>
    </Sec>
  );
}

/* ---------- 2 用户洞察：行 = 7 格，列 = 地区（按权重） ---------- */
function Insight({ d, editor }) {
  const wide = editor.editing?.path.startsWith("regions.") && editor.editing.path.split(".")[1];
  return (
    <Sec id="us-2" no="2" title="用户洞察">
      <div className="table-wrap us-matrix-wrap">
        <table className="grid us-matrix">
          <colgroup><col className="us-c-head" />{d.regions.map((r) => <col key={r.key} className={wide === r.key ? "is-wide" : ""} />)}</colgroup>
          <thead><tr><th>维度</th>{d.regions.map((r) => <th key={r.key}><span className="us-m-region">{r.name}</span><Tag tone={TIER_TONE[r.tier]}>{r.tier}</Tag></th>)}</tr></thead>
          <tbody>
              {ROWS.map(([k, label]) => (
                <tr key={k}>
                  <th scope="row">{label}</th>
                  {d.regions.map((r) => {
                    const path = `regions.${r.key}.${k}`;
                    return (
                      <td key={r.key}>
                        <Editable editor={editor} path={path}>
                          {k === "temp" ? <><Temp from={r.temp[0]} to={r.temp[1]} /><Items list={r.tempNote} /></>
                            : k === "barrier" ? <Barriers list={r.barrier} />
                            : <Items list={r[k]} />}
                        </Editable>
                      </td>
                    );
                  })}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Sec>
  );
}

/* ---------- 3 机会收敛 ---------- */
function Opportunities({ d, editor }) {
  return (
    <Sec id="us-3" no="3" title="机会收敛">
      <div className="table-wrap">
        <table className="grid us-opps">
          <thead><tr>{OPP_COLS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
          <tbody>{d.opportunities.map((row, i) => editor.is("opportunities", i)
            ? <tr key={i} className="is-editing"><td colSpan={OPP_COLS.length}><Editable editor={editor} path="opportunities" sub={i}><OppRow row={row} /></Editable></td></tr>
            : <tr key={i} className="us-opp-row" tabIndex={0} title="点击修改" onClick={() => { if (!window.getSelection()?.toString()) editor.open("opportunities", i); }} onKeyDown={(e) => { if (e.key === "Enter") editor.open("opportunities", i); }}><OppCells row={row} /></tr>)}
          </tbody>
        </table>
      </div>
      <div className="us-goal"><span className="label">本月目标</span>
        {d.strategy ? <Editable editor={editor} path="strategy.goal" sub="sec3"><p>{d.strategy.goal}</p></Editable> : <p className="muted">生成促销策略后给出</p>}
      </div>
    </Sec>
  );
}
const OppCells = ({ row: [p, name, region, line, kind, win, why] }) => <><td><Tag tone={p === "P0" ? "orange" : "neutral"}>{p}</Tag></td><td><strong>{name}</strong></td><td>{region}</td><td>{line}</td><td>{kind}</td><td className="tnum">{win}</td><td className="small">{why}</td></>;
const OppRow = ({ row }) => <dl className="kv">{row.map((v, i) => <Fragment key={i}><dt>{OPP_COLS[i]}</dt><dd>{v}</dd></Fragment>)}</dl>;

/* ---------- 4 促销策略 ---------- */
function Promo({ d, onGenerate, busy }) {
  if (!d.strategy) return (
    <Sec id="us-4" no="4" title="促销策略">
      <Placeholder icon="spark" title="还没有生成促销策略" action={<Button variant="primary" onClick={onGenerate} disabled={busy}>生成促销策略</Button>} />
    </Sec>
  );
  const p = d.strategy.promo;
  return (
    <Sec id="us-4" no="4" title="促销策略">
      <h3 className="us-h3">4.1 打法组合</h3>
      <div className="us-lines">
        {Object.entries(p.lines).map(([line, plays]) => (
          <div key={line} className="us-line">
            <div className="us-line-head">{line}</div>
            <ul>{plays.map(([role, ids, how, scope], i) => (
              <li key={i}><span className="label">{role}</span><div><strong><Plays ids={ids} /></strong><p className="small">{how}</p><span className="us-scope small muted">{scope}</span></div></li>
            ))}</ul>
          </div>
        ))}
      </div>

      <h3 className="us-h3">4.2 选择逻辑</h3>
      <div className="table-wrap">
        <table className="grid us-logic">
          <thead><tr><th>决策障碍</th><th>栏</th><th>心理机制</th><th>打法</th><th>作用路径</th></tr></thead>
          <tbody>{p.logic.map(([b, line, mechs, ids, path], i) => (
            <tr key={i}><td><strong>{barrierName[b] || b}</strong></td><td>{line}</td><td><Mechs ids={mechs} /></td><td><Plays ids={ids} /></td><td>{path}</td></tr>
          ))}</tbody>
        </table>
      </div>

      <div className="us-cols is-2">
        <div><h3 className="us-h3">4.3 不选什么</h3>
          <ul className="us-items">{p.exclude.map(([ids, why], i) => <li key={i}><strong>不做<Plays ids={ids} /></strong>：{why}</li>)}</ul>
        </div>
        <div><h3 className="us-h3">4.4 底线</h3>
          <ul className="us-items">{p.floor.map(([k, t]) => <li key={k}><strong>{k}</strong>：{t}</li>)}</ul>
        </div>
      </div>
    </Sec>
  );
}

/* ---------- 附 依据与待确认（默认收起；从导航跳转时展开） ---------- */
function Appendix({ d, open, onToggle }) {
  const a = d.appendix, warns = d.strategy?.warnings || [];
  return (
    <section id="us-a" className="card us-sec">
      <button type="button" className={`card-head us-fold${open ? "" : " is-closed"}`} aria-expanded={open} onClick={onToggle}>
        <h2><span className="us-no">附</span>依据与待确认</h2>
        <span className="small muted tnum">推测节点 {a.guesses.length} · 待确认 {a.pending.length}{warns.length ? ` · 规范提示 ${warns.length}` : ""}<PixelIcon name={open ? "up" : "down"} /></span>
      </button>
      {open && <div className="card-body">
        <div className="us-cols is-2">
          <div><span className="label">推测节点 · {a.guesses.length} 条</span>{a.guesses.length ? <ul className="us-items">{a.guesses.map((t, i) => <li key={i}>{t}</li>)}</ul> : <span className="muted">—</span>}</div>
          <div><span className="label">待确认</span>{a.pending.length ? <ul className="us-items">{a.pending.map((t, i) => <li key={i}>{t}</li>)}</ul> : <span className="muted">—</span>}
            {warns.length > 0 && <><span className="label us-label-gap">促销生成时的写作规范提示 · {warns.length} 条</span><ul className="us-items">{warns.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
          </div>
        </div>
      </div>}
    </section>
  );
}
