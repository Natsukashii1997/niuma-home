import { useState } from "react";
import { PixelIcon, TypeText } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Card, Loadable, PageHeader, PhaseSteps, Placeholder, SampleBadge, Segmented, StatStrip, Tabs, Tag, useToast } from "../../ui/components.jsx";
import { SAMPLE_MENTOR, SAMPLE_PROJECTS } from "../../samples/v3.js";

// 项目（v3）：项目推进按多维表格的标准流程模板；管培带教读两位管培生的日志，带教 Agent 只出草稿。
// 节点到期前 2 天在工作台提醒，不做机器人推送；门禁只提醒、不拦截。
const TABS = [["board", "项目推进"], ["mentor", "管培带教"]].map(([key, label]) => ({ key, label, href: href("projects", key) }));

export default function ProjectsPage({ route }) {
  const [tab = "board"] = route;
  return <><PageHeader title="项目" /><Tabs items={TABS} active={tab === "mentor" ? "mentor" : "board"} />{tab === "mentor" ? <Mentor /> : <Board />}</>;
}

const today = new Date();
const daysTo = (due) => { if (!/^\d{2}-\d{2}$/.test(due || "")) return null; const d = new Date(today.getFullYear(), Number(due.slice(0, 2)) - 1, Number(due.slice(3))); return Math.round((d - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000); };
const STATUS_TONE = { 已结项: "green", 实施中: "blue", 调研中: "blue" };

function Board() {
  const state = useApi("/api/v3/projects", SAMPLE_PROJECTS);
  return <Loadable state={state} name="项目" big>{(list) => <ProjectBoard list={list} sample={state.isSample ? state.task : null} />}</Loadable>;
}

// 每个项目的摘要：进度、下一个未完成节点、待审门禁、2 天内到期（soonest 是其中最早到期的一条）。
function summary(p) {
  if (!p.nodes) return null;
  const open = p.nodes.filter((n) => !n.done);
  const soon = open.filter((n) => { const d = daysTo(n.due); return d !== null && d <= 2; });
  return {
    done: p.nodes.length - open.length, total: p.nodes.length,
    next: open[0],
    gates: open.filter((n) => n.gate).length,
    soon: soon.length,
    soonest: [...soon].sort((a, b) => daysTo(a.due) - daysTo(b.due))[0],
    undated: open.filter((n) => !n.due).length,
  };
}

function ProjectBoard({ list, sample }) {
  const [sel, setSel] = useState(list[0].id);
  const [projects, setProjects] = useState(list);
  const [filter, setFilter] = useState("all");
  const [toast, showToast] = useToast();
  const p = projects.find((x) => x.id === sel);
  const sum = summary(p);
  const update = (i, patch) => setProjects((old) => old.map((x) => x.id !== sel ? x : { ...x, nodes: x.nodes.map((n, j) => j === i ? { ...n, ...patch } : n) }));
  const keep = (n) => filter === "all" || (filter === "gate" ? n.gate && !n.done : filter === "soon" ? !n.done && daysTo(n.due) !== null && daysTo(n.due) <= 2 : !n.done);
  return (
    <div className="proj-layout cols-3-9">
      <section className="card proj-list">
        <div className="card-head"><h2><PixelIcon name="project" />项目<span className="tnum small muted">{projects.length}</span></h2><div className="card-extra">{sample && <SampleBadge task={sample} />}<Button><PixelIcon name="plus" />新建项目</Button></div></div>
        <div className="proj-items">
        {projects.map((x) => {
          const s = summary(x);
          return (
            <button key={x.id} type="button" className={`proj-card${x.id === sel ? " active" : ""}`} onClick={() => (x.link ? (location.hash = x.link) : setSel(x.id))}>
              <span className="proj-card-top"><strong>{x.name}</strong><Tag tone={STATUS_TONE[x.status] || "neutral"}>{x.status}</Tag></span>
              <span className="small muted">模板：{x.template}</span>
              {s ? (
                <>
                  <span className="proj-bar"><i style={{ width: `${(s.done / s.total) * 100}%` }} /></span>
                  <span className="proj-card-meta small"><span className="tnum">{s.done}/{s.total} 节点</span>{s.gates > 0 && <span className="warn-text">待审 {s.gates}</span>}{s.soon > 0 && <span className="risk-text">2 天内 {s.soon}</span>}</span>
                  {s.next && <span className="proj-next small">下一步：{s.next.t}{s.next.due ? ` · ${s.next.due}` : ""}</span>}
                </>
              ) : x.link ? <span className="proj-next small">在营销战役页管理 <PixelIcon name="right" /></span> : <span className="small muted">已归档，无节点数据</span>}
            </button>
          );
        })}
        </div>
      </section>
      {!p?.nodes ? <Placeholder icon="project" title="这个项目没有节点数据">已结项的项目只保留名称和模板。</Placeholder> : (
        <section className="proj-main">
          <StatStrip items={[
            { label: `项目推进 · 模板 ${p.template}`, value: p.name, foot: <Tag tone={STATUS_TONE[p.status] || "neutral"}>{p.status}</Tag> },
            { label: "节点完成", value: sum.done, unit: `/${sum.total}`, foot: `当前阶段：${p.phases[p.phase]}` },
            { label: "等你审核", value: sum.gates, tone: sum.gates ? "warn" : "", foot: "门禁只提醒、不拦截" },
            { label: "2 天内到期", value: sum.soon, tone: sum.soon ? "risk" : "", foot: sum.soonest ? `${sum.soonest.t} · ${sum.soonest.due}` : "—" },
            { label: "未设日期", value: sum.undated, tone: sum.undated ? "muted" : "", foot: "没日期的节点不提醒" },
          ]} />
          <PhaseSteps items={p.phases.map((ph, i) => {
            const nodes = p.nodes.filter((n) => n.ph === ph);
            const ok = nodes.filter((n) => n.done).length;
            // 按节点算：全部完成才算完成；当前阶段之前还有没做完的，标「遗留」。
            const state = i === p.phase ? "cur" : nodes.length === ok ? "done" : i < p.phase ? "left" : "todo";
            const next = nodes.find((n) => !n.done);
            return { key: ph, name: ph, state, note: <>{ok}/{nodes.length} 节点{state === "done" ? " · 已完成" : state === "left" ? <> · <span className="warn-text">{nodes.length - ok} 个遗留</span></> : next ? ` · 下一个：${next.t}` : ""}</> };
          })} />
          <div className="toolbar">
            <Segmented options={[["all", "全部节点"], ["open", "未完成"], ["gate", `等你审核 ${sum.gates}`], ["soon", `2 天内到期 ${sum.soon}`]]} value={filter} onChange={setFilter} />
            <span className="spacer" /><span className="small muted">门禁只提醒、不拦截 · 未设日期的节点不提醒</span>
          </div>
          <section className="card node-list">
            <div className="node-cols" aria-hidden="true"><span /><span>序号</span><span>节点</span><span>负责人</span><span>截止</span><span>状态</span></div>
            {p.phases.map((ph, k) => {
              const nodes = p.nodes.map((n, i) => ({ ...n, i })).filter((n) => n.ph === ph && keep(n));
              if (!nodes.length) return null;
              return (
                <div key={ph} className="phase">
                  <div className="phase-name"><b>{String(k + 1).padStart(2, "0")}</b><strong>{ph}</strong><span className="tnum small muted">{p.nodes.filter((n) => n.ph === ph && n.done).length}/{p.nodes.filter((n) => n.ph === ph).length}</span></div>
                  <ul className="phase-nodes">
                    {nodes.map((n) => {
                      const left = n.done ? null : daysTo(n.due);
                      const kidsDone = n.kids ? n.kids.filter(([, ok]) => ok).length : 0;
                      return (
                        <li key={n.i} className={`node${n.done ? " is-done" : ""}${n.gate ? " is-gate" : ""}`}>
                          <input type="checkbox" checked={!!n.done} onChange={() => { update(n.i, { done: !n.done }); showToast("已更新（示例，未写入）"); }} aria-label={`完成：${n.t}`} />
                          <span className="tnum small muted">{n.i + 1}</span>
                          <div className="node-main">
                            <span className="node-t">{n.t}{n.gate && <Tag tone={n.done ? "neutral" : "amber"}>{n.done ? "门禁" : "等你审核"}</Tag>}</span>
                            {n.kids && (
                              <ul className="node-kids">
                                <li className="node-kids-sum tnum">子项 {kidsDone}/{n.kids.length}</li>
                                {n.kids.map(([kid, ok]) => <li key={kid} className={ok ? "is-done" : ""}><i />{kid}</li>)}
                              </ul>
                            )}
                          </div>
                          <span className="node-owner">{n.owner}</span>
                          <input className="node-due" type="text" value={n.due} placeholder="未设日期" onChange={(e) => update(n.i, { due: e.target.value })} aria-label="截止日期 MM-DD" />
                          <span className="node-left">{n.done ? <span className="ok-text">已完成</span> : left === null ? <span className="muted">—</span> : left < 0 ? <span className="risk-text">逾期 {-left} 天</span> : left === 0 ? <span className="risk-text">今天到期</span> : <span className={left <= 2 ? "warn-text" : "muted"}>还有 {left} 天</span>}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </section>
        </section>
      )}
      {toast}
    </div>
  );
}

function Mentor() {
  const state = useApi("/api/v3/mentor", SAMPLE_MENTOR);
  return <Loadable state={state} name="带教日志" big>{(list) => <MentorBoard list={list} sample={state.isSample ? state.task : null} />}</Loadable>;
}

const FLAG_TONE = { 卡点: "red", 提问: "blue" };

function MentorBoard({ list, sample }) {
  const [i, setI] = useState(0);
  const [asked, setAsked] = useState(false);
  const [toast, showToast] = useToast();
  const p = list[i];
  const count = (x, f) => x.logs.filter((l) => l.flag === f).length;
  return (
    <>
      <div className="toolbar">
        <div className="person-tabs">
          {list.map((x, k) => (
            <button key={x.name} type="button" className={k === i ? "active" : ""} onClick={() => { setI(k); setAsked(false); }}>
              <span><strong>{x.name}</strong><span className="small">{x.role}</span></span>
              {count(x, "卡点") > 0 && <em>卡点 {count(x, "卡点")}</em>}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {sample && <SampleBadge task={sample} />}
        <span className="small muted">读飞书日志 · 最近 30 天 · 带教 Agent 只出草稿，不自动发送</span>
        <Button><PixelIcon name="refresh" />刷新日志</Button>
      </div>
      <StatStrip items={[
        { label: "日志", value: p.logs.length, unit: " 篇", foot: "最近 30 天" },
        { label: "卡点", value: count(p, "卡点"), tone: count(p, "卡点") ? "risk" : "", foot: "日志里标了「卡点」的" },
        { label: "提问", value: count(p, "提问"), foot: "日志里标了「提问」的" },
        { label: "最近一篇", value: p.logs[0]?.d || "—", foot: p.history.length ? `已有 ${p.history.length} 周带教记录` : "还没有带教记录" },
      ]} />
      <div className="mentor-layout cols-6-6">
        <Card title={<><PixelIcon name="reports" />{p.name} · 日志</>} extra={<button type="button" className="link-btn">加载更早</button>}>
          <ol className="logs">{p.logs.map((l) => <li key={l.d} className={l.flag === "卡点" ? "is-block" : ""}><span className="tnum small muted">{l.d}</span><i /><span>{l.t}{l.flag && <> <Tag tone={FLAG_TONE[l.flag] || "neutral"}>{l.flag}</Tag></>}</span></li>)}</ol>
        </Card>
        <section className="card coach">
          <div className="card-head"><h2><PixelIcon name="mentor" />带教 Agent · 本周建议</h2><span className="row"><Tag tone="amber">草稿</Tag><a className="link" href={href("assistants")}>对话</a></span></div>
          <div className="coach-block"><h4><PixelIcon name="alert" />发现的卡点</h4><ul>{p.blocks.map((b) => <li key={b}>{b}</li>)}</ul></div>
          <div className="coach-block"><h4><PixelIcon name="search" />建议追问<span className="spacer" /><button type="button" className="link-btn" onClick={() => setAsked(true)}><PixelIcon name="spark" />再生成</button></h4>
            <ul>{p.asks.map((a) => <li key={a}>{a}<button type="button" className="icon-btn" title="复制" onClick={() => showToast("已复制追问")}><PixelIcon name="copy" /></button></li>)}</ul>
            {asked && <p className="small"><TypeText text="补一问：这周哪件事你最想让我拍板？" /></p>}
            <p className="small muted"><PixelIcon name="link" /> 可引用 Q&A 合集 · {p.qa} 条相关</p>
          </div>
          <div className="coach-block"><h4><PixelIcon name="send" />反馈草稿</h4><div className="ai-box"><TypeText key={p.name} text={p.feedback} /></div>
            <div className="row"><Button className="btn btn-xs" onClick={() => showToast("已复制反馈草稿，去飞书发送")}><PixelIcon name="copy" />复制</Button></div></div>
          <div className="coach-block"><h4><PixelIcon name="edit" />你的结论</h4>
            <textarea className="review-box" placeholder={`写下这周对 ${p.name} 的判断和下周重点`} />
            <div className="row"><span className="small muted">历史：{p.history.join(" · ")}</span><span className="spacer" /><Button variant="primary" onClick={() => showToast("已保存本周带教记录（存在工作台，不回写飞书，示例）")}>保存本周记录</Button></div></div>
        </section>
      </div>
      {toast}
    </>
  );
}
