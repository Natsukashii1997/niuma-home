import { useState } from "react";
import { FlipNumber, PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Card, Loadable, NodeCheck, PendingButton, PhaseSteps, Segmented, Tag } from "../../ui/components.jsx";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { deliveryMonth, deliverySteps } from "../../constants.js";

// 营销战役（v3）：大节点（如双11）才开，可跨月。节点来自飞书营销战役模板（阶段、节点名、门禁、里程碑不能改）。
// 还没创建战役时接口返回模板（id = "template"）：页面明确写「模板」，不显示进度、不让勾选；先填名称和起止日期创建战役。
// 创建、勾选节点、改负责人和日期、物料决定都存工作台本地：预览 → 确认 → 回读。门禁只提醒、不拦截。
const CHOICES = [["reuse", "沿用常规"], ["campaign", "用战役版替代"], ["skip", "本月不出"]];
const DAY = 86400000;

const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "") && !Number.isNaN(parseDay(s).getTime());

export default function CampaignView() {
  const state = useApi("/api/v3/campaigns/current");
  const [fresh, setFresh] = useState(null);
  const [notice, setNotice] = useState(""); // 保存后页面按回读结果重建，结果提示放在外层
  const saved = (back, text = "") => { setFresh(back); setNotice(text); };
  return <Loadable state={state} name="营销战役" big>{(c) => { const cur = fresh || c; return <><SavedNote text={notice} onClose={() => setNotice("")} /><Campaign key={`${cur.id}-${JSON.stringify(cur).length}`} c={cur} onSaved={saved} onEdit={() => setNotice("")} /></>; }}</Loadable>;
}

function Campaign({ c, onSaved, onEdit }) {
  const isTemplate = c.id === "template";
  const [phases, setPhases] = useState(c.phases);
  const [routine, setRoutine] = useState(c.routine);
  const [form, setForm] = useState({ name: "", desc: "", start: "", end: "" });
  const [what, setWhat] = useState(""); // 预览里写清楚改了什么
  const flow = useWriteFlow();
  const nodes = phases.flatMap((p) => p.nodes);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const year = isDay(c.start) ? parseDay(c.start).getFullYear() : today.getFullYear();
  const dueDate = (due) => /^\d{2}-\d{2}$/.test(due || "") ? new Date(year, Number(due.slice(0, 2)) - 1, Number(due.slice(3))) : null;
  const daysTo = (due) => { const d = dueDate(due); return d ? Math.round((d - today) / DAY) : null; };
  const curPhase = phases.findIndex((p) => p.nodes.some((n) => !n.done));
  const locked = flow.busy || flow.phase === "unknown";

  // 实例：改一处就按完整的阶段 / 物料决定生成预览（只允许改状态、负责人、日期和物料决定）。
  function propose(nextPhases, nextRoutine, label) {
    if (locked) return;
    setPhases(nextPhases); setRoutine(nextRoutine); setWhat(label); onEdit();
    flow.reset();
    flow.preview(() => apiSend("POST", "/api/v3/campaigns/current/preview", { phases: nextPhases, routine: nextRoutine }));
  }
  const editNode = (num, patch, label) => propose(phases.map((p) => ({ ...p, nodes: p.nodes.map((n) => (n.n === num ? { ...n, ...patch } : n)) })), routine, label);
  const create = () => {
    setWhat("create"); onEdit();
    flow.preview(() => apiSend("POST", "/api/v3/campaigns/current/preview", { name: form.name.trim(), desc: form.desc.trim(), start: form.start, end: form.end }));
  };
  const confirm = () => flow.confirm(
    (pv) => apiSend("PATCH", "/api/v3/campaigns/current", { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      const back = await apiSend("GET", "/api/v3/campaigns/current");
      const ok = back.id === pv.value.id && JSON.stringify(back) === JSON.stringify(pv.value);
      if (ok) onSaved(back, what === "create" ? "战役已创建，回读核对一致" : "已保存，回读核对一致");
      return ok;
    },
  );
  // 结果不明或预览失效：丢掉本地改动，以接口为准重新读取。
  const reread = async () => { const back = await apiSend("GET", "/api/v3/campaigns/current"); flow.resolve(); onSaved({ ...back }); };
  const cancel = () => { flow.reset(); setPhases(c.phases); setRoutine(c.routine); };
  const formOk = form.name.trim() && form.desc.trim() && isDay(form.start) && isDay(form.end) && form.end >= form.start;
  return (
    <>
      <div className="campaign-strip">
        <PixelIcon name="bolt" />
        <span className="label">营销战役</span>
        <strong>{c.name}</strong>
        {isTemplate ? <Tag tone="frame">模板 · 未创建战役</Tag> : <span className="mono small muted">{c.start} → {c.end.slice(5)}</span>}
        {c.desc && <span className="small">{c.desc}</span>}
        <span className="spacer" />
        {!isTemplate && <PendingButton task="V3-接口清单"><PixelIcon name="plus" />新开战役</PendingButton>}
      </div>
      <DeadlineBar />
      {isTemplate && (
        <section className="card campaign-create">
          <div className="card-head"><h2><PixelIcon name="plus" />按模板创建战役</h2><span className="small muted">创建后才有日期、负责人、勾选进度和物料决定</span></div>
          <div className="card-body">
            <div className="create-grid">
              <label><span className="label">名称</span><input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); flow.reset(); }} placeholder="如：2026 双11 冲分节" /></label>
              <label><span className="label">开始</span><input value={form.start} onChange={(e) => { setForm({ ...form, start: e.target.value.trim() }); flow.reset(); }} placeholder="2026-10-20" /></label>
              <label><span className="label">结束</span><input value={form.end} onChange={(e) => { setForm({ ...form, end: e.target.value.trim() }); flow.reset(); }} placeholder="2026-11-30" /></label>
              <label className="is-wide"><span className="label">一句话说明</span><input value={form.desc} onChange={(e) => { setForm({ ...form, desc: e.target.value }); flow.reset(); }} placeholder="这次战役要做成什么" /></label>
            </div>
            <div className="row"><span className="small muted">{formOk ? "预览确认后才创建；节点、阶段、门禁沿用模板" : "名称、说明、起止日期（YYYY-MM-DD）都要填，结束不早于开始"}</span><span className="spacer" /><Button variant="primary" disabled={!formOk || locked} onClick={create}><PixelIcon name="eye" />预览创建</Button></div>
          </div>
        </section>
      )}
      <WriteBox flow={flow} title={what === "create" ? "创建战役预览" : "战役改动预览"} confirmLabel={what === "create" ? "确认创建" : "确认保存"} onConfirm={confirm}
        onRepreview={() => (what === "create" ? create() : propose(phases, routine, what))} onReread={reread}>
        {(pv) => <dl className="kv">
          {what === "create" ? <>
            <dt>名称</dt><dd>{pv.value.name}</dd><dt>起止</dt><dd className="tnum">{pv.value.start} → {pv.value.end}</dd>
            <dt>挂在哪些月</dt><dd className="tnum">{pv.value.months.join("、") || "—"}</dd><dt>说明</dt><dd>{pv.value.desc}</dd>
            <dt>节点</dt><dd>沿用模板 {pv.value.phases.length} 个阶段、{pv.value.phases.flatMap((p) => p.nodes).length} 个节点，状态全部未完成</dd>
          </> : <><dt>改动</dt><dd>{what}</dd></>}
          <dt>写到哪里</dt><dd>工作台本地，不回写飞书模板</dd>
        </dl>}
      </WriteBox>
      {flow.phase === "preview" && what !== "create" && <p className="small muted">没确认之前，下面显示的是预览里的改动；<button type="button" className="link-btn" onClick={cancel}>撤回改动</button></p>}
      <PhaseSteps items={phases.map((p, i) => {
        const ok = p.nodes.filter((n) => n.done).length;
        if (isTemplate) return { key: p.name, name: p.name, state: "todo", note: `模板 · ${p.nodes.length} 个节点` };
        const state = ok === p.nodes.length ? "done" : i === curPhase ? "cur" : "todo";
        const next = p.nodes.find((n) => !n.done);
        return { key: p.name, name: p.name, state, note: `${ok}/${p.nodes.length} 节点${state === "done" ? " · 已完成" : next ? ` · 下一个：${next.t}${next.due ? ` ${next.due}` : ""}` : ""}` };
      })} />
      <div className="campaign-grid cols-9-3">
        <section className="card node-list">
          <div className="card-head"><h2><PixelIcon name="timeline" />节点清单</h2><span className="small muted">{isTemplate ? `模板 · ${nodes.length} 个节点，创建战役后才能勾选和填日期` : "门禁只提醒、不拦截 · 改一处就生成预览"}</span></div>
          <div className="node-cols" aria-hidden="true"><span /><span>编号</span><span>节点</span><span>负责人</span><span>截止</span><span>状态</span></div>
          {phases.map((p, i) => (
            <div key={p.name} className="phase">
              <div className="phase-name"><b>{String(i + 1).padStart(2, "0")}</b><strong>{p.name}</strong><span className="tnum small muted">{isTemplate ? `${p.nodes.length} 个` : `${p.nodes.filter((n) => n.done).length}/${p.nodes.length}`}</span></div>
              <ul className="phase-nodes">
                {p.nodes.map((n) => {
                  const left = n.done ? null : daysTo(n.due);
                  const kidsDone = n.kids ? n.kids.filter(([, ok]) => ok).length : 0;
                  return (
                    <li key={n.n} className={`node${n.done ? " is-done" : ""}${n.gate ? " is-gate" : ""}`}>
                      {isTemplate ? <span /> : <NodeCheck checked={!!n.done} onChange={() => editNode(n.n, { done: !n.done }, `「${n.t}」${n.done ? "改回未完成" : "标为已完成"}`)} label={`完成：${n.t}`} />}
                      <span className="tnum small muted">{n.n}</span>
                      <div className="node-main">
                        <span className="node-t">{n.t}{n.milestone && <Tag>里程碑</Tag>}{n.gate && <Tag tone={!isTemplate && !n.done ? "amber" : "neutral"}>{!isTemplate && !n.done ? "等你审核" : "门禁"}</Tag>}</span>
                        {n.kids && (
                          <ul className="node-kids">
                            <li className="node-kids-sum tnum">子项 {isTemplate ? n.kids.length : `${kidsDone}/${n.kids.length}`}</li>
                            {n.kids.map(([k, ok]) => <li key={k} className={ok ? "is-done" : ""}><i />{k}</li>)}
                          </ul>
                        )}
                      </div>
                      {isTemplate ? <span className="node-owner muted">—</span> : <CellInput className="node-owner-input" value={n.owner} placeholder="负责人" disabled={locked} onCommit={(v) => editNode(n.n, { owner: v }, `「${n.t}」负责人改为「${v || "空"}」`)} />}
                      {isTemplate ? <span className="muted small">—</span> : <CellInput className="node-due" value={n.due} placeholder="MM-DD" pattern={/^(\d{2}-\d{2})?$/} disabled={locked} onCommit={(v) => editNode(n.n, { due: v }, `「${n.t}」截止日期改为 ${v || "空"}`)} />}
                      <span className="node-left">{isTemplate ? <span className="muted">模板</span> : n.done ? <span className="ok-text">已完成</span> : left === null ? <span className="muted">—</span> : left < 0 ? <span className="risk-text">逾期 {-left} 天</span> : left === 0 ? <span className="risk-text">今天到期</span> : <span className={left <= 2 ? "warn-text" : "muted"}>还有 {left} 天</span>}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
        <div className="stack">
          <Card title={<><PixelIcon name="image" />常规物料决定</>}>
            {!routine.length ? <p className="small muted">{isTemplate ? "创建战役后逐项决定。" : "这个战役还没有物料决定项。"}</p> : (
              <table className="grid compact routine">
                <tbody>{routine.map(([type, choice], i) => (
                  <tr key={type}><td>{type}</td><td><Segmented options={CHOICES} value={choice} onChange={(v) => !locked && propose(phases, routine.map((r, j) => (j === i ? [type, v] : r)), `${type}：${CHOICES.find(([k]) => k === v)[1]}`)} /></td></tr>
                ))}</tbody>
              </table>
            )}
          </Card>
          <Card title={<><PixelIcon name="calendar" />挂在哪些月</>}>
            {!c.months.length ? <p className="small muted">还没有创建战役，没有关联月份。</p> : <ul className="list month-hooks">{c.months.map((m) => <li key={m}><div className="month-hook-top"><span className="tnum">{m}</span><a className="link" href={href("marketing", "plans", m)}>月度促销<PixelIcon name="right" /></a></div></li>)}</ul>}
          </Card>
          <Card title={<><PixelIcon name="archive" />复盘</>}>
            <textarea className="review-box" disabled placeholder="复盘的保存接口还没有（见 V3 接口清单），先写在飞书文档里。" />
          </Card>
        </div>
      </div>
    </>
  );
}

// 表格里的小输入框：回车或离开时提交，格式不对不提交。
function CellInput({ value, onCommit, pattern, ...rest }) {
  const [v, setV] = useState(value || "");
  const bad = pattern && !pattern.test(v);
  const commit = () => { if (!bad && v !== (value || "")) onCommit(v); };
  return <input {...rest} className={`${rest.className || ""}${bad ? " is-bad" : ""}`} value={v} onChange={(e) => setV(e.target.value.trim())} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setV(value || ""); }} />;
}

// 月底交付倒计时：本月每天一格，已过为墨、今天为橙、月底交付日空心；右边是交付月 6 个环节的完成数。
function DeadlineBar() {
  const month = useApi(`/api/v3/months/${deliveryMonth()}`);
  const plans = useApi("/api/plans");
  const now = new Date();
  const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();
  const steps = month.data ? deliverySteps(month.data.steps, plans.data, deliveryMonth()) : null;
  const m = now.getMonth() + 1;
  return (
    <div className="deadline-bar">
      <div className="dl-num"><span className="label">距月底交付</span><span className="dl-big"><FlipNumber value={total - day} /><small>天</small></span></div>
      <div className="dl-main">
        <div className="dl-meta label"><span>{m} 月 · 已过 {day - 1} 天</span><span>{String(m).padStart(2, "0")}-{total} 交付</span></div>
        <div className="dl-track" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {Array.from({ length: total }, (_, i) => <i key={i} className={i + 1 < day ? "is-past" : i + 1 === day ? "is-today" : i + 1 === total ? "is-end" : undefined} title={`${String(m).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`} />)}
        </div>
      </div>
      <div className="dl-num is-right"><span className="label">完成</span><span className="dl-done" title={month.error || ""}>{steps ? `${steps.filter((st) => st.state === "done").length}/${steps.length}` : month.error ? "读取失败" : "…"}</span></div>
    </div>
  );
}
