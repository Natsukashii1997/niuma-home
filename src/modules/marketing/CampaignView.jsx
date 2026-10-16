import { useState } from "react";
import { FlipNumber, PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Card, Loadable, SampleBadge, Segmented, Tag, useToast } from "../../ui/components.jsx";
import { SAMPLE_CAMPAIGN, SAMPLE_MONTH } from "../../samples/v3.js";
import { deliveryMonth } from "../../constants.js";

// 营销战役（v3）：大节点（如双11）才开，可跨月。节点来自多维表格模板，节点说明暂空（共识 Q45）。
// 顶部：战役横条 → 月底交付倒计时条（本月每天一格）→ 阶段卡；下面是节点清单。
// 门禁只提醒、不拦截；没日期的节点不提醒。节点可以就地勾选、改日期。
const CHOICES = [["reuse", "沿用常规"], ["campaign", "用战役版替代"], ["skip", "本月不出"]];
const DAY = 86400000;

const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

export default function CampaignView() {
  const state = useApi("/api/v3/campaigns/current", SAMPLE_CAMPAIGN);
  return <Loadable state={state}>{(c) => <Campaign c={c} sample={state.isSample ? state.task : null} />}</Loadable>;
}

function Campaign({ c, sample }) {
  const [phases, setPhases] = useState(c.phases);
  const [routine, setRoutine] = useState(c.routine);
  const [toast, showToast] = useToast();
  const nodes = phases.flatMap((p) => p.nodes);
  const done = nodes.filter((n) => n.done).length;
  const toggle = (num) => { setPhases((old) => old.map((p) => ({ ...p, nodes: p.nodes.map((n) => n.n === num ? { ...n, done: !n.done } : n) }))); showToast("已更新节点状态（示例，未写入）"); };
  const setDue = (num, due) => setPhases((old) => old.map((p) => ({ ...p, nodes: p.nodes.map((n) => n.n === num ? { ...n, due } : n) })));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const year = parseDay(c.start).getFullYear();
  const dueDate = (due) => /^\d{2}-\d{2}$/.test(due || "") ? new Date(year, Number(due.slice(0, 2)) - 1, Number(due.slice(3))) : null;
  const daysTo = (due) => { const d = dueDate(due); return d ? Math.round((d - today) / DAY) : null; };
  const curPhase = phases.findIndex((p) => p.nodes.some((n) => !n.done));
  return (
    <>
      <div className="campaign-strip">
        <PixelIcon name="bolt" />
        <span className="label">营销战役</span>
        <strong>{c.name}</strong>
        <span className="mono small muted">{c.start} → {c.end.slice(5)}</span>
        {c.desc && <span className="small">{c.desc}</span>}
        <span className="spacer" />
        {sample && <SampleBadge task={sample} />}
        <Button><PixelIcon name="plus" />新开战役</Button>
      </div>
      <DeadlineBar />
      <ol className="phase-steps">
        {phases.map((p, i) => {
          const ok = p.nodes.filter((n) => n.done).length;
          const state = ok === p.nodes.length ? "done" : i === curPhase ? "cur" : "todo";
          const next = p.nodes.find((n) => !n.done);
          return (
            <li key={p.name} className={`is-${state}`}>
              <div className="phase-step-no"><b>{String(i + 1).padStart(2, "0")}</b><i aria-hidden="true" /></div>
              <strong>{p.name}</strong>
              <span className="small muted">{ok}/{p.nodes.length} 节点{state === "done" ? " · 已完成" : next ? ` · 下一个：${next.t}${next.due ? ` ${next.due}` : ""}` : ""}</span>
            </li>
          );
        })}
      </ol>
      <div className="campaign-grid cols-9-3">
        <section className="card node-list">
          <div className="card-head"><h2><PixelIcon name="timeline" />节点清单</h2><span className="small muted">门禁只提醒、不拦截 · 日期可直接改 · 节点说明待补</span></div>
          <div className="node-cols" aria-hidden="true"><span /><span>编号</span><span>节点</span><span>负责人</span><span>截止</span><span>状态</span></div>
          {phases.map((p, i) => (
            <div key={p.name} className="phase">
              <div className="phase-name"><b>{String(i + 1).padStart(2, "0")}</b><strong>{p.name}</strong><span className="tnum small muted">{p.nodes.filter((n) => n.done).length}/{p.nodes.length}</span></div>
              <ul className="phase-nodes">
                {p.nodes.map((n) => {
                  const left = n.done ? null : daysTo(n.due);
                  const kidsDone = n.kids ? n.kids.filter(([, ok]) => ok).length : 0;
                  return (
                    <li key={n.n} className={`node${n.done ? " is-done" : ""}${n.gate ? " is-gate" : ""}`}>
                      <input type="checkbox" checked={!!n.done} onChange={() => toggle(n.n)} aria-label={`完成：${n.t}`} />
                      <span className="tnum small muted">{n.n}</span>
                      <div className="node-main">
                        <span className="node-t">{n.t}{n.milestone && <Tag>里程碑</Tag>}{n.gate && <Tag tone={n.done ? "neutral" : "amber"}>{n.done ? "门禁" : "等你审核"}</Tag>}</span>
                        {n.kids && (
                          <ul className="node-kids">
                            <li className="node-kids-sum tnum">子项 {kidsDone}/{n.kids.length}</li>
                            {n.kids.map(([k, ok]) => <li key={k} className={ok ? "is-done" : ""}><i />{k}</li>)}
                          </ul>
                        )}
                      </div>
                      <span className="node-owner">{n.owner}</span>
                      <input className="node-due" type="text" value={n.due} placeholder="未设日期" onChange={(e) => setDue(n.n, e.target.value)} aria-label="截止日期 MM-DD" />
                      <span className="node-left">{n.done ? <span className="ok-text">已完成</span> : left === null ? <span className="muted">—</span> : left < 0 ? <span className="risk-text">逾期 {-left} 天</span> : left === 0 ? <span className="risk-text">今天到期</span> : <span className={left <= 2 ? "warn-text" : "muted"}>还有 {left} 天</span>}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>
        <div className="stack">
          <Card title={<><PixelIcon name="image" />常规物料怎么处理</>}>
            <table className="grid compact routine">
              <tbody>{routine.map(([type, choice], i) => (
                <tr key={type}><td>{type}</td><td><Segmented options={CHOICES} value={choice} onChange={(v) => { setRoutine((old) => old.map((r, j) => j === i ? [type, v] : r)); showToast(`${type}：${CHOICES.find(([k]) => k === v)[1]}（物料墙同步，示例）`); }} /></td></tr>
              ))}</tbody>
            </table>
            <p className="small muted">每次开战役逐项决定；结果同步到物料墙的交付月。</p>
          </Card>
          <Card title={<><PixelIcon name="calendar" />挂在哪些月</>}>
            <ul className="list">{c.months.map((m) => <li key={m}><span className="tnum">{m}</span><span className="small muted">{m === c.months[0] ? "预热：价格图沿用常规" : "战役价格 · 九宫格 · 价格图战役版"}</span><span className="spacer" /><a className="link" href={href("marketing", "plans", m)}>月度促销</a></li>)}</ul>
          </Card>
          <Card title={<><PixelIcon name="archive" />复盘</>}>
            <textarea className="review-box" placeholder="战役结束后写复盘：目标达成、有效的物料与玩法、下次要改的地方。保存后归档到对应月份。" />
          </Card>
        </div>
      </div>
      {toast}
    </>
  );
}

// 月底交付倒计时：本月每天一格，已过为墨、今天为橙、月底交付日空心；右边是交付月 6 个环节的完成数。
function DeadlineBar() {
  const month = useApi(`/api/v3/months/${deliveryMonth()}`, SAMPLE_MONTH);
  const now = new Date();
  const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = now.getDate();
  const steps = month.data?.steps || SAMPLE_MONTH.steps;
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
      <div className="dl-num is-right"><span className="label">完成</span><span className="dl-big"><b>{steps.filter((st) => st.state === "done").length}</b><small>/{steps.length}</small></span></div>
    </div>
  );
}
