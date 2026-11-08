import { useEffect, useState } from "react";
import { useApi } from "../../api.js";
import { beijingTime, currentMonth } from "../../constants.js";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { Button, Loadable, MonthSwitch, PendingButton, Tag } from "../../ui/components.jsx";
import { SavedNote, useWriteFlow } from "../../ui/write-flow.jsx";
import { StrategyV1 } from "./StrategyView.jsx";
import { BizcardModal, LegacyArchive, SubmissionReview, Versions, revNo, reviewModel } from "./StrategyV2Parts.jsx";
import {
  COUNTRY_NAME, FIELDS, PRIORITY_TONE, REGIONS, VERIFICATION, dateText, evidenceName, kindLabel, routeText, scenarioNo, sortKey, span, stageName, staleRefs, statusLabel,
} from "./strategy-v2.js";

// 月度用户策略 v2（#30，常浩 2026-11-08 选定 A 报告式样稿，见 #26）：
// 工具栏 → 待确认提示条 → 吸顶导航 → 0 核心结论 / 1 全局研判 / 2 地区单元（8 字段 × 6 地区）/ 3 待确认提交 / 附 版本与留痕 / 存 旧版存档。
// 正式稿只读 revision（不可变）；改动只能来自 skill 提交，常浩在第 3 节预览差异后确认或拒绝。所有写入都是「预览 → 确认 → 回读」。
// v2 还没有正式版本时（旧数据迁移 #29 完成前），保留 v1 旧视图。
const SECTIONS = [["s2-0", "0", "核心结论"], ["s2-1", "1", "全局研判"], ["s2-2", "2", "地区单元"], ["s2-3", "3", "待确认提交"], ["s2-v", "附", "版本与留痕"], ["s2-l", "存", "旧版存档"]];
const jump = (id) => requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));

export function Strategy() {
  const [month, setMonth] = useState(currentMonth);
  const [busy, setBusy] = useState(false);
  return <MonthView key={month} month={month} onMonth={(m) => { if (!busy) setMonth(m); }} onBusy={setBusy} />;
}

function MonthView({ month, onMonth, onBusy }) {
  const base = "/api/v3/strategy-v2";
  const main = useApi(`${base}?month=${month}`);
  const revs = useApi(`${base}/revisions?month=${month}`);
  const subs = useApi(`${base}/submissions?month=${month}`);
  const pending = main.data?.submissions || [];
  // 证据要读时间线（可能要几秒、读不到时报错）：只有正式版本或待确认提交引用证据时才读。
  const ev = useApi(main.data && (main.data.revision || pending.length) ? `${base}/evidence?month=${month}` : null);
  const [pick, setPick] = useState(null);
  const sub = pending.find((s) => s.id === pick) || pending[0] || null;
  const pv = useApi(sub ? `${base}/submissions/${sub.id}/preview` : null);
  const prevId = revs.data?.[1]?.id;
  const prev = useApi(prevId ? `${base}/revisions/${prevId}` : null);
  // 旧版存档只在迁移版本里（skill 提交不能带 legacy）：正式版本没有时，取最早的版本。
  const oldestId = revs.data?.length > 2 ? revs.data.at(-1).id : null;
  const oldest = useApi(oldestId ? `${base}/revisions/${oldestId}` : null);
  const first = oldestId ? oldest.data : revs.data?.length === 2 ? prev.data : null;
  const legacy = main.data?.revision?.content.legacy ? { legacy: main.data.revision.content.legacy } : first?.content.legacy ? { legacy: first.content.legacy, from: first.id } : null;
  const flows = { confirm: useWriteFlow(), reject: useWriteFlow(), rollback: useWriteFlow(), bizcard: useWriteFlow() };
  const [v1Busy, setV1Busy] = useState(false);
  const busy = v1Busy || Object.values(flows).some((f) => f.busy || f.phase === "unknown");
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  const [bizOpen, setBizOpen] = useState(false);
  const [saved, setSaved] = useState("");
  const reloadAll = () => { main.reload(); revs.reload(); subs.reload(); ev.reload(); pv.reload(); prev.reload(); oldest.reload(); };
  // 写入回读一致后页面按新数据重建，结果由外层显示；结果不明时重新读取核对（text 为空）。
  const onSaved = (text) => { if (text) setSaved(text); reloadAll(); };

  const evList = ev.data?.evidence;
  const ctx = {
    ev: evList ? Object.fromEntries(evList.map((e) => [e.evidenceId, e])) : null,
    win: Object.fromEntries((ev.data?.windows || []).map((w) => [w.evidenceId, w])),
    evError: ev.error, prevIds: prevId && prev.data ? new Set(prev.data.content.claims.map((c) => c.id)) : null,
  };
  const model = sub && pv.data ? reviewModel(pv.data, main.data?.revision?.content, ctx.ev) : null;
  const review = { month, sub, pending, pick: setPick, pv, model, flows, revision: main.data?.revision, onSaved, revs: revs.data, ctx };

  return (
    <div className="us-page s2-page">
      <Toolbar month={month} onMonth={onMonth} busy={busy} data={main.data} onBizcard={() => setBizOpen(true)} />
      <SavedNote text={saved} onClose={() => setSaved("")} />
      {sub && <Banner pending={pending} sub={sub} pv={pv} model={model} />}
      <Loadable state={main} name="月度用户策略" big>{(d) => d.revision
        ? <Report d={d} ctx={ctx} review={review} subs={subs} legacy={legacy} />
        : <NoRevision month={month} review={review} subs={subs} onBusy={setV1Busy} />}</Loadable>
      <BizcardModal open={bizOpen} onClose={() => { if (!flows.bizcard.busy && flows.bizcard.phase !== "unknown") { flows.bizcard.reset(); setBizOpen(false); } }}
        month={month} card={main.data?.bizcard} flow={flows.bizcard} onSaved={onSaved} />
    </div>
  );
}

/* ---------- 工具栏与提示条 ---------- */
function Toolbar({ month, onMonth, busy, data, onBizcard }) {
  const rev = data?.revision, pending = data?.submissions?.length || 0;
  const card = data?.bizcard, filled = card ? Object.values(card).reduce((n, list) => n + list.length, 0) : 0;
  const content = rev?.content;
  const renewUnknown = content && !(card?.["存量用户情况"] || []).length
    ? content.claims.filter((c) => c.targetRelation === "续费" && c.status === "unknown").length : 0;
  return (
    <div className="us-bar">
      <MonthSwitch month={month} onChange={onMonth} />
      {data && <>
        <span className="us-state"><span className="label">正式版本</span>
          {rev ? <><Tag tone="green">{revNo(rev.id)} · 已确认</Tag><span className="small muted tnum">{beijingTime(rev.createdAt).slice(5)}{rev.confirmedFrom?.startsWith("rollback:") ? ` · 回退自 ${revNo(rev.confirmedFrom.slice(9))}` : ""}</span></> : <Tag tone="amber">v2 尚无正式版本</Tag>}
        </span>
        {pending > 0 && <span className="us-state"><span className="label">待确认</span><Tag tone="amber">{pending} 份提交</Tag></span>}
        <span className="us-state"><span className="label">业务背景卡</span>
          {filled ? <Tag tone="green">已填写 {filled} 条</Tag> : <Tag tone="amber">未填写</Tag>}
          {renewUnknown > 0 && <span className="small muted">续费判断 {renewUnknown} 条因缺存量用户情况为未知</span>}
          <Button className="btn btn-sm" onClick={onBizcard} disabled={busy}><PixelIcon name="edit" />{filled ? "修改背景卡" : "填写背景卡"}</Button>
        </span>
      </>}
      <span className="us-bar-actions">
        {rev && <Button onClick={() => jump("s2-v")}>版本历史</Button>}
        {rev && <PendingButton task="T13-用户策略生成">导出到飞书</PendingButton>}
      </span>
    </div>
  );
}

function Banner({ pending, sub, pv, model: m }) {
  const p = pv.data;
  return (
    <div className="write-box is-warn s2-banner">
      <div className="write-head"><PixelIcon name="alert" /><strong>有 {pending.length} 份待确认提交</strong>
        <span className="small">{sub.id} · {sub.declared?.executor || "未声明执行方"}（声明）· {beijingTime(sub.submittedAt)}
          {p && m && ` · 新增 ${m.counts.add} · 修改 ${m.counts.mod} · 删除 ${m.counts.del} · 改动你写的 ${m.manual.length} 条 · 校验拦截 ${m.blocking.length}${p.stale ? " · 已过期" : ""}`}
          {pv.error && ` · 预览读取失败：${pv.error}`}</span>
        <Button className="btn btn-sm s2-banner-go" onClick={() => jump("s2-3")}>查看差异并确认</Button>
      </div>
    </div>
  );
}

/* ---------- 没有正式版本：保留 v1 旧视图 ---------- */
function NoRevision({ month, review, subs, onBusy }) {
  return (
    <>
      <p className="s2-note"><PixelIcon name="alert" />{month} 的 v2 尚无正式版本。下面先显示 v1 旧视图；旧数据迁移（#29）完成或常浩确认第一份 skill 提交后，这里换成 v2 正式稿。</p>
      {review.sub && <Sec id="s2-3" no="3" title="待确认提交"><SubmissionReview {...review} /></Sec>}
      {subs.data?.length > 0 && <Sec id="s2-v" no="附" title="版本与留痕"><Versions review={review} subs={subs.data} /></Sec>}
      <StrategyV1 month={month} onBusy={onBusy} />
    </>
  );
}

/* ---------- 正式稿 ---------- */
function Report({ d, ctx, review, subs, legacy }) {
  const doc = d.revision.content;
  const active = useActiveSection();
  return (
    <>
      <nav className="us-nav" aria-label="段落导航">
        {SECTIONS.map(([id, no, name]) => (
          <button key={id} type="button" className={active === id ? "is-cur" : ""} onClick={() => jump(id)}><b>{no}</b>{name}
            {id === "s2-3" && review.pending.length > 0 && <span className="s2-cnt tnum">{review.pending.length}</span>}</button>
        ))}
      </nav>
      {ctx.evError && <p className="s2-note"><PixelIcon name="alert" />时间线证据没有读到（{ctx.evError}）：关联事件只显示证据编号，「依据已变化」暂不判断。</p>}
      <Brief doc={doc} ctx={ctx} card={d.bizcard} />
      <Global doc={doc} ctx={ctx} />
      <Matrix doc={doc} ctx={ctx} />
      <Sec id="s2-3" no="3" title="待确认提交" extra={review.sub ? <><Tag tone="amber">待确认</Tag><span className="small muted tnum">{beijingTime(review.sub.submittedAt)} · {review.sub.declared?.executor || "未声明"}（声明）</span></> : null}>
        {review.sub ? <SubmissionReview {...review} /> : <p className="muted">当前没有待确认提交。skill 经 strategy_submit 提交后会出现在这里。</p>}
      </Sec>
      <Sec id="s2-v" no="附" title="版本与留痕" extra={<span className="small muted">执行方、模型是 AI 自报的声明；提交凭据、提交与确认时间由服务端独立记录</span>}>
        <Versions review={review} subs={subs.data || []} />
      </Sec>
      <Sec id="s2-l" no="存" title="旧版存档" extra={<span className="s2-ro">只读</span>}>
        {legacy ? <details className="s2-basis s2-legacy"><summary>展开旧版存档（{d.month} 迁移前内容{legacy.from ? `，存在迁移版本 ${revNo(legacy.from)} 里` : ""}）</summary><LegacyArchive legacy={legacy.legacy} /></details>
          : <p className="muted small">本月没有旧版存档。</p>}
      </Sec>
    </>
  );
}

function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0][0]);
  useEffect(() => {
    const onScroll = () => {
      let cur = SECTIONS[0][0];
      for (const [id] of SECTIONS) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < 160) cur = id; }
      setActive(cur);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return active;
}

export function Sec({ id, no, title, extra, children }) {
  return (
    <section id={id} className="card us-sec s2-sec">
      <div className="card-head"><h2><span className="us-no">{no}</span>{title}</h2>{extra && <div className="card-extra">{extra}</div>}</div>
      <div className="card-body">{children}</div>
    </section>
  );
}

/* ---------- 判断条目与研判依据 ---------- */
export function StatusTag({ c, stale }) {
  const [text, tone] = statusLabel(c, stale);
  return <span title={stale ? "引用的证据版本已变，不能进入新版本（I-06）" : undefined}><Tag tone={tone}>{text}</Tag></span>;
}

function Claim({ c, ctx, events = true, gap = false, kind = true }) {
  const stale = staleRefs(c, ctx.ev).length > 0;
  const isNew = ctx.prevIds && c.id && !ctx.prevIds.has(c.id);
  return (
    <div className={`s2-claim${stale ? " is-stale" : ""}`}>
      <span className="s2-claim-text">{c.text}</span>
      <span className="s2-tags">{kind && <span className="s2-kind">{kindLabel(c, ctx.ev || {})}</span>}<StatusTag c={c} stale={stale} />
        {c.origin === "manual" && <Tag tone="frame">你写的</Tag>}{isNew && <Tag tone="orange">新增</Tag>}</span>
      {gap && c.status === "unknown" && c.gap && <span className="s2-gap small">缺口：{c.gap}</span>}
      {events && <EventsLine refs={c.evidenceRefs} ctx={ctx} />}
    </div>
  );
}

function EventsLine({ refs = [], ctx, max = 3 }) {
  if (!refs.length) return null;
  if (!ctx.ev) return <div className="s2-evline"><PixelIcon name="timeline" /><span className="muted">{refs.length} 个证据</span></div>;
  return (
    <div className="s2-evline"><PixelIcon name="timeline" />
      {refs.slice(0, max).map((id) => { const e = ctx.ev[id]; return e
        ? <span key={id} className="s2-evl">{evidenceName(e)} <b>{e.kind === "business" ? e.bizType : dateText(e.dates)}</b></span>
        : <span key={id} className="s2-evl is-gone">{id} <b>已不在当前快照</b></span>; })}
      {refs.length > max && <span className="muted">等 {refs.length} 个事件</span>}
    </div>
  );
}

const WIN_STATUS = { known: "已知", inferred: "推断" };
export function Basis({ c, ctx, compact = false }) {
  const refs = c.evidenceRefs || [];
  const stale = new Set(staleRefs(c, ctx.ev));
  const wins = refs.map((id) => ctx.win[id]).filter(Boolean).slice(0, compact ? 2 : 4);
  return (
    <div className="s2-basis-grid">
      <section><h5>证据 · {refs.length}</h5>
        <ul className="s2-ev-list">{refs.length ? refs.map((id) => { const e = ctx.ev?.[id]; return (
          <li key={id} className={stale.has(id) ? "is-stale" : ""}>
            <span className="s2-ev-id">{id}</span>
            {e ? e.kind === "business"
              ? <span className="s2-ev-main">背景卡 · {e.field}：{e.text} <Tag>{e.bizType}</Tag></span>
              : <span className="s2-ev-main"><b>{e.school}</b> · {e.eventType === "其他" ? e.header : e.eventType} · <span className="tnum">{dateText(e.dates)}</span>{e.scope ? ` · 仅${e.scope}` : ""} <i className={`s2-ver is-${e.verification}`}>{VERIFICATION[e.verification] || e.verification}</i></span>
              : <span className="s2-ev-main muted">{ctx.ev ? "已不在当前快照" : "时间线未读取"}</span>}
            {stale.has(id) && e && <span className="s2-ev-note">版本已变（提交时 {c.refVersions?.[id]}，现在 {e.evidenceVersion}）</span>}
          </li>); }) : <li className="muted">无时间线证据{c.status === "unknown" ? "" : "（常识或规则推断）"}</li>}</ul>
      </section>
      <section><h5>窗口</h5>
        <ul className="s2-win-list">{wins.length ? wins.map((w) => (
          <li key={w.evidenceId}>{w.skipped ? <span className="muted">{evidenceName(ctx.ev?.[w.evidenceId] || {})}：{w.skipped}</span>
            : <><span className="tnum">{w.action ? `行动 ${span(w.action.from, w.action.to)}` : "无行动窗口"}{w.need ? ` · 需求 ${span(w.need.from, w.need.to)}` : ""}</span> <span className="muted">{evidenceName(ctx.ev?.[w.evidenceId] || {})} · {w.ruleVersion} · {WIN_STATUS[w.status] || w.status}</span></>}</li>
        )) : <li className="muted">{c.rule || "不生成窗口"}</li>}</ul>
      </section>
      <section><h5>{c.status === "unknown" ? "缺口与来源" : "限定"}</h5>
        {c.status === "unknown" ? <><p><b>缺口</b>：{c.gap || "—"}</p><p><b>可补来源</b>：{routeText(c.route) || "—"}</p></> : <p>{c.limitations || "—"}</p>}
        {c.rule && <p className="muted small">规则 {c.rule}</p>}
      </section>
      <section><h5>反驳</h5><p className="muted">{c.rebuttal || (c.status === "unknown" ? "暂不判断，无需反驳" : "未记录")}</p></section>
    </div>
  );
}

/* ---------- 0 核心结论 ---------- */
function Brief({ doc, ctx, card }) {
  const j = doc.brief?.judgement || {};
  const linked = (j.claims || []).map((id) => doc.claims.find((c) => c.id === id)).filter(Boolean);
  const empty = !card || !Object.values(card).some((list) => list.length);
  return (
    <Sec id="s2-0" no="0" title="核心结论" extra={<span className="small muted">本月目标与核心打法：批 2 起生成</span>}>
      <p className="us-judge s2-judge">{j.text || <span className="muted">（本月没有核心结论）</span>}</p>
      {empty && <p className="s2-note"><PixelIcon name="alert" />本月未提供业务背景，用户需求与购买判断均基于学校时间线推断。</p>}
      <details className="s2-basis s2-judge-basis"><summary>研判依据 · 支撑这句判断的 {linked.length} 条判断</summary>
        {linked.length ? <ul className="us-items s2-basis-grid">{linked.map((c) => <li key={c.id}>{c.text} <StatusTag c={c} stale={staleRefs(c, ctx.ev).length > 0} /></li>)}</ul>
          : <p className="s2-basis-grid muted small">没有链接具体判断（迁移数据的核心结论原文保留，不链接判断）。</p>}
      </details>
    </Sec>
  );
}

/* ---------- 1 全局研判 ---------- */
const pct = (r) => Math.round(r * 100);
function PriorityTag({ p }) { return p?.value ? <Tag tone={PRIORITY_TONE[p.value]}>{p.value}</Tag> : <Tag tone="amber">待研判</Tag>; }
const dqText = (q = {}) => `官网 ${q.verified || 0} · 裁定 ${q.ruled || 0} · 原表 ${q.source || 0} · 推测 ${q.guess || 0}`;
function DqBar({ q = {} }) {
  const v = (q.verified || 0) + (q.ruled || 0), s = q.source || 0, g = q.guess || 0, total = v + s + g || 1;
  return <span className="s2-dqbar" title={dqText(q)}>{[[v, "v"], [s, "s"], [g, "g"]].map(([n, k]) => n > 0 && <i key={k} className={`is-${k}`} style={{ width: `${(n / total) * 100}%` }} />)}</span>;
}
function Activity({ a }) {
  if (!a || a.status === "unknown" || a.ratio == null) return <><Tag tone="amber">未知</Tag> <span className="small muted">没有可计算的学校</span></>;
  return <span className="s2-act"><span className="s2-covbar" title={`候选行动窗口覆盖率 ${pct(a.ratio)}%`}><i style={{ width: `${pct(a.ratio)}%` }} /></span><b className="tnum">{pct(a.ratio)}%</b><Tag>{a.value}</Tag><span className="small muted">推断</span></span>;
}
const counts = (c = {}) => ({ calc: c.calculable ?? 0, active: c.active ?? 0, gap: c.notCovered ?? (c.calculable ?? 0) - (c.active ?? 0), none: c.insufficient ?? (c.schools ?? 0) - (c.calculable ?? 0) });

function BriefItem({ x, ctx }) {
  const stale = staleRefs(x, ctx.ev).length > 0;
  return (
    <div className="s2-claim">
      <span className="s2-claim-text">{x.text}</span>
      <span className="s2-tags"><StatusTag c={x} stale={stale} /></span>
      <EventsLine refs={x.evidenceRefs} ctx={ctx} />
      <details className="s2-basis"><summary>研判依据</summary><Basis c={x} ctx={ctx} /></details>
    </div>
  );
}

function Global({ doc, ctx }) {
  const byKey = Object.fromEntries((doc.regions || []).map((r) => [r.key, r]));
  return (
    <Sec id="s2-1" no="1" title="全局研判">
      <h3 className="us-h3">1.1 共性、差异与外部因素</h3>
      <div className="us-boxes">
        {[["common", "共性"], ["diff", "差异"], ["external", "外部因素"]].map(([k, label]) => { const list = doc.brief?.[k] || []; return (
          <div key={k} className="us-box"><div className="us-box-head s2-box-head">{label}<span className="label">{list.length} 条</span></div>
            <div className="s2-box-body">{list.length ? list.map((x, i) => <BriefItem key={i} x={x} ctx={ctx} />) : <span className="muted">—</span>}</div>
          </div>); })}
      </div>
      <h3 className="us-h3">1.2 地区优先级与需求活跃度 <span className="small muted">需求活跃度 = 候选行动窗口覆盖率（由日历推出，不是已验证需求）</span></h3>
      <div className="table-wrap">
        <table className="grid s2-pri">
          <colgroup><col className="is-name" /><col className="is-tag" /><col className="is-tag" /><col /><col className="is-act" /><col className="is-num" /><col className="is-dq" /><col className="is-scn" /></colgroup>
          <thead><tr><th>地区</th><th>策略优先级</th><th>默认建议</th><th>理由</th><th>需求活跃度</th><th>有效 / 活跃 / 窗口未覆盖 / 数据不足</th><th>日期质量</th><th>情境</th></tr></thead>
          <tbody>{REGIONS.map(([key, name]) => { const r = byKey[key]; if (!r) return <tr key={key}><td><b>{name}</b></td><td colSpan={7} className="muted">文档里缺这个地区</td></tr>;
            const p = r.priority || {}, a = r.activity || {}, n = counts(a.coverage);
            return [
              <tr key={key}>
                <td><b>{name}</b></td>
                <td><PriorityTag p={p} /></td>
                <td>{p.default ? <Tag>{p.default}</Tag> : "—"}{p.value && p.default && p.value !== p.default && <div className="small s2-warn-text">与默认不同</div>}</td>
                <td className="s2-reason">{p.reason || <span className="muted">—</span>}</td>
                <td><Activity a={a} /></td>
                <td className="tnum">{n.calc} / {n.active} / {n.gap} / <span className={n.none ? "" : "muted"}>{n.none}</span></td>
                <td><DqBar q={a.dateQuality} /><div className="small muted tnum s2-dq-text">{dqText(a.dateQuality)}</div></td>
                <td>{r.scenarios?.length ? `${r.scenarios.length} 个` : <span title={r.emptyReason || ""}><Tag tone="amber">空 · 有原因</Tag></span>}</td>
              </tr>,
              a.byCountry && <tr key={`${key}-by`} className="s2-by"><td /><td colSpan={7}><span className="label">各国贡献</span>
                {Object.entries(a.byCountry).map(([c, x]) => <span key={c} className="s2-bychip">{COUNTRY_NAME[c] || c} <b className="tnum">{x.coverage?.active ?? 0}/{x.coverage?.calculable ?? 0}</b></span>)}
                <span className="small muted">活跃 / 有效</span></td></tr>,
            ]; })}</tbody>
        </table>
      </div>
      <div className="s2-dq-key"><span><i className="is-v" />官网核实或裁定</span><span><i className="is-s" />原表日期</span><span><i className="is-g" />推测</span></div>
    </Sec>
  );
}

/* ---------- 2 地区单元：8 字段 × 6 地区 ---------- */
function Matrix({ doc, ctx }) {
  const regions = REGIONS.map(([key, name]) => ({ key, name, r: (doc.regions || []).find((x) => x.key === key) || { key, scenarios: [], emptyReason: "文档里缺这个地区" } }));
  const scn = Object.fromEntries((doc.scenarios || []).map((s) => [s.id, s]));
  const claimsOf = (id, types) => doc.claims.filter((c) => c.scenario === id && types.includes(c.claimType));
  return (
    <Sec id="s2-2" no="2" title="地区单元" extra={<span className="small muted">点「研判依据」行展开证据、窗口、限定与反驳</span>}>
      <div className="s2-mx">
        <div className="s2-mx-row s2-mx-head"><div className="s2-mx-f" />{regions.map(({ key, name, r }) => <div key={key} className="s2-mx-c"><b>{name}</b><PriorityTag p={r.priority} /></div>)}</div>
        {FIELDS.map(([f, no, label]) => (
          <div key={f} className={`s2-mx-row${f === "basis" ? " is-basis" : ""}`}>
            <div className="s2-mx-f"><span className="mono">{no}</span> {label}</div>
            {regions.map(({ key, r }) => <div key={key} className="s2-mx-c"><Cell f={f} r={r} scn={scn} doc={doc} ctx={ctx} claimsOf={claimsOf} /></div>)}
          </div>
        ))}
      </div>
    </Sec>
  );
}

function Cell({ f, r, scn, doc, ctx, claimsOf }) {
  const ids = r.scenarios || [];
  if (!ids.length) {
    if (f === "scn") return <div className="s2-empty"><b>暂无独立情境</b><br />{r.emptyReason || "没有写空情境原因"}</div>;
    return <span className="muted small">{f === "node" ? "无情境，不投影节点" : "—"}</span>;
  }
  if (f === "opp") return <span className="small muted">批 2 起由 Opportunity 生成{(doc.opportunities || []).length ? "" : "；本月机会见旧版存档"}</span>;
  if (f === "basis") {
    const cs = doc.claims.filter((c) => ids.includes(c.scenario));
    const evn = new Set(cs.flatMap((c) => c.evidenceRefs || [])).size;
    return <details className="s2-basis"><summary>展开 · {cs.length} 条判断 · {evn} 个证据</summary>
      <div className="s2-basis-list">{cs.map((c) => <div key={c.id} className="s2-basis-item"><div className="small"><b>{c.text}</b> <StatusTag c={c} stale={staleRefs(c, ctx.ev).length > 0} /></div><Basis c={c} ctx={ctx} compact /></div>)}</div>
    </details>;
  }
  const multi = ids.length > 1;
  return ids.map((id) => (
    <div key={id} className="s2-scn-part">{multi && <span className="s2-sno">情境 {scenarioNo(r, id)}</span>}<Part f={f} s={scn[id]} id={id} ctx={ctx} claimsOf={claimsOf} /></div>
  ));
}

function Part({ f, s, id, ctx, claimsOf }) {
  if (!s) return <span className="small s2-warn-text">情境 {id} 不在文档里</span>;
  const list = (types, opts) => { const cs = claimsOf(id, types); return cs.length ? cs.map((c) => <Claim key={c.id} c={c} ctx={ctx} {...opts} />) : <span className="small muted">无判断</span>; };
  if (f === "scn") return (
    <div className="s2-scn"><span className="s2-ev-id">{s.id}</span><b>{s.phase}</b><span>{s.keyTask}</span>
      <span className="s2-tags"><Tag>{stageName(s.academicStage)}</Tag><Tag tone="frame">面向 {s.targetRelation}</Tag>
        {s.observedRelation?.value && s.observedRelation.value !== "unknown" ? <Tag tone="green">实际 {s.observedRelation.value}</Tag> : <span className="small muted">实际关系 未知</span>}</span>
      {(s.region === "other" || s.schools?.length > 0) && <span className="small muted">{s.countries.map((c) => COUNTRY_NAME[c] || c).join("、")}{s.schools?.length ? ` · ${s.schools.join("、")}` : ""}</span>}
    </div>
  );
  if (f === "node") {
    const refs = s.evidenceRefs || [];
    if (!refs.length) return <span className="small muted">没有引用证据（迁移情境）</span>;
    if (!ctx.ev) return <span className="small muted">{refs.length} 个证据（时间线未读取）</span>;
    const evs = refs.map((x) => ctx.ev[x] || { evidenceId: x, gone: true }).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    return <ul className="s2-nodes">{evs.map((e) => e.gone ? <li key={e.evidenceId} className="is-stale">{e.evidenceId} 已不在当前快照</li>
      : <li key={e.evidenceId}><span className="tnum">{e.kind === "business" ? e.bizType : dateText(e.dates)}</span> {evidenceName(e)} {e.verification && <i className={`s2-ver is-${e.verification}`}>{VERIFICATION[e.verification]}</i>}</li>)}</ul>;
  }
  if (f === "task") return list(["task"]);
  if (f === "pain") return list(["pain"]);
  if (f === "need") return list(["need_strength", "readiness", "academic_need"], { events: false, gap: true });
  if (f === "barrier") {
    const rels = ["新签", "续费", ...(claimsOf(id, ["barrier"]).some((c) => c.targetRelation === "通用") ? ["通用"] : [])];
    return rels.map((rel) => { const cs = claimsOf(id, ["barrier"]).filter((c) => c.targetRelation === rel); return (
      <div key={rel} className="s2-rel"><span className="label">{rel}</span>{cs.length ? cs.map((c) => <Claim key={c.id} c={c} ctx={ctx} events={false} gap />) : <span className="small muted">无判断</span>}</div>); });
  }
  return null;
}
