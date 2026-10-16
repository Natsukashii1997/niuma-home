import { useState } from "react";
import { FlipNumber, PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Card, Loadable, SampleBadge, Segmented, Tag, useToast } from "../../ui/components.jsx";
import { SAMPLE_CAMPAIGN } from "../../samples/v3.js";

// 营销战役（v3）：大节点（如双11）才开，可跨月。节点来自多维表格模板，节点说明暂空（共识 Q45）。
// 顶部：战役横条 → 按天的进度轨道（标出节点截止日）→ 阶段卡；下面是节点清单。
// 门禁只提醒、不拦截；没日期的节点不提醒。节点可以就地勾选、改日期。
const CHOICES = [["reuse", "沿用常规"], ["campaign", "用战役版替代"], ["skip", "本月不出"]];
const DAY = 86400000;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
      <DayTrack c={c} nodes={nodes} today={today} dueDate={dueDate} done={done} />
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
      <div className="campaign-grid">
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

// 战役期间按天的轨道：已过为墨色，今天为橙色，有节点截止的日子下方加点（待审核门禁为琥珀）；月份交界处留缝。
function DayTrack({ c, nodes, today, dueDate, done }) {
  const start = parseDay(c.start), end = parseDay(c.end);
  const total = Math.round((end - start) / DAY) + 1;
  const passed = Math.min(total, Math.max(0, Math.round((today - start) / DAY)));
  const left = Math.max(0, Math.round((end - today) / DAY));
  const byDay = new Map();
  nodes.forEach((n) => { const d = dueDate(n.due); if (d) { const k = ymd(d); byDay.set(k, [...(byDay.get(k) || []), n]); } });
  const days = Array.from({ length: total }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  return (
    <div className="day-track-bar">
      <div className="dtb-num"><span className="label">距战役结束</span><span className="dtb-big"><FlipNumber value={left} /><small>天</small></span></div>
      <div className="dtb-main">
        <div className="dtb-meta label"><span>{c.start.slice(5)} 开始 · 已过 {passed} 天</span><span>{c.end.slice(5)} 结束</span></div>
        <div className="day-track" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}>
          {days.map((d) => {
            const k = ymd(d), list = byDay.get(k);
            const cls = [d < today ? "is-past" : +d === +today ? "is-today" : "", d.getDate() === 1 && +d !== +start ? "is-month" : "", list ? (list.some((n) => n.gate && !n.done) ? "has-gate" : "has-node") : ""].join(" ").trim();
            return <i key={k} className={cls || undefined} title={`${k.slice(5)}${list ? ` · ${list.map((n) => n.t).join("、")}` : ""}`} />;
          })}
        </div>
        <div className="dtb-legend small muted"><span><i className="lg-node" />节点截止</span><span><i className="lg-gate" />待你审核</span><span><i className="lg-today" />今天</span></div>
      </div>
      <div className="dtb-num is-right"><span className="label">节点完成</span><span className="dtb-done"><b>{done}</b><small>/{nodes.length}</small></span></div>
    </div>
  );
}
