import { useEffect, useRef, useState } from "react";
import { MarkText, MarkType, PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, DateCommit, Loadable, NodeCheck, PageHeader, Placeholder, Segmented, StatStrip, Tabs, Tag } from "../../ui/components.jsx";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { DeletedList, useSoftRemove } from "../../ui/soft-delete.jsx";
import { localDate } from "../../constants.js";
import { nodeState, projectSummary } from "./project-view.js";
import { mentorReplyTime } from "./mentor-view.js";
import CampaignView from "../marketing/CampaignView.jsx";
import MentorPath from "./MentorPath.jsx";

// 项目（v3）：项目推进读飞书「AI管培工作台 / 任务事项」；管培带教读两位管培生近 30 天日志，回复确认后挂回飞书原话。
// 节点改动只存工作台本地（不回写飞书），每次都走「预览 → 确认 → 回读」。来源没填的完成状态、截止日期、当前阶段显示「未填写 / 未知」，不当成未完成。
// 页签（用户 2026-10-19）：项目推进 · 营销战役（从营销移来）· 项目看板（所有项目总览，先留空位，放最后）。管培带教单列为侧栏「带教」。
const TABS = [
  ["board", "项目推进", "各项目的阶段、节点和负责人；节点改动只存在工作台，不回写飞书"],
  ["campaign", "营销战役", "本月战役的节点、物料决定与复盘"],
  ["overview", "项目看板", "所有项目的总览：怎么呈现回头再讨论，先留空位"],
].map(([key, label, desc]) => ({ key, label, desc, href: href("projects", key) }));

export default function ProjectsPage({ route }) {
  const [tab = "board", ...rest] = route;
  if (tab === "mentor") { location.replace(href("mentor")); return null; } // 旧地址：管培带教已单列为「带教」
  const key = TABS.some((t) => t.key === tab) ? tab : "board";
  return (
    <>
      <PageHeader title="项目" />
      <Tabs items={TABS} active={key} />
      {key === "overview" ? <Placeholder icon="project" title="项目看板 · 待设计">所有项目的总览放在这里，具体怎么做回头再讨论。</Placeholder>
        : key === "campaign" ? <CampaignView route={rest} /> : <Board />}
    </>
  );
}

// 带教（侧栏单列）：带教答疑 = 管培生近 30 天日志里的提问；培养路径 = 两条培养线的远征地图（用户 2026-10-23 定稿 V7）。
const MENTOR_TABS = [
  ["qa", "带教答疑", "管培生近 30 天日志里的提问：在右侧回复或让机械邪龙兽回答，确认后作为评论挂回飞书原话"],
  ["path", "培养路径", "业务线和 AI 线两条培养路径：营地、进度和本周攀登"],
].map(([key, label, desc]) => ({ key, label, desc, href: key === "qa" ? href("mentor") : href("mentor", key) }));

export function MentorPage({ route = [] }) {
  if (route[0] === "path") return <MentorPath tabs={MENTOR_TABS} />;
  return <><PageHeader title="带教" /><Tabs items={MENTOR_TABS} active="qa" /><Mentor /></>;
}

const STATE_TEXT = { done: "已完成", open: "未完成", unknown: "未填写" };
const LOCAL_API = { base: "/api/v3/local-projects", active: "/api/v3/projects" };
const nodeCount = (x) => `${x.nodes.length} 个节点，已完成 ${x.nodes.filter((n) => n.done).length}`;

function Board() {
  const state = useApi("/api/v3/projects");
  return <Loadable state={state} name="项目" big>{(list) => <ProjectBoard initial={list} />}</Loadable>;
}

// 项目推进 · 阶段看板（用户 2026-10-19 从三版草稿里选定 B，草稿见 docs/design/projects-board/）：
// 顶部项目页签 + 摘要；主要阶段各一列，每个一级节点一张卡（勾选、负责人、开始→截止、子项、交付物、飞书逾期状态）；
// 贯穿全程的「监控」审核门禁单独放在底部一条泳道，按截止日期排。勾选和改期仍只存工作台，走「预览 → 确认 → 回读」。
const lateOf = (n) => /已逾期/.test(n.overdue || "");
const md = (d) => (d ? d.slice(5).replace("-", ".") : "—");

function ProjectBoard({ initial }) {
  const [projects, setProjects] = useState(initial);
  const [sel, setSel] = useState(initial[0]?.id);
  const [sync, setSync] = useState({ busy: false, error: "" });
  const [edit, setEdit] = useState(null); // { node, done?, due? }：正在预览的那一处改动
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState(""); // 新建后表单关闭，结果放在外层
  const flow = useWriteFlow();
  const [deleted, setDeleted] = useState([]); // 已删除的本地项目（软删除，可恢复）
  const [deletedError, setDeletedError] = useState("");
  const placed = (r) => { setProjects(r.active); setDeleted(r.deleted); };
  const remover = useSoftRemove(LOCAL_API, placed);
  const p = projects.find((x) => x.id === sel) || projects[0];
  const today = localDate();
  useEffect(() => { apiSend("GET", `${LOCAL_API.base}?deleted=true`).then((d) => setDeleted(d.items || []), (e) => setDeletedError(e.message)); }, []);
  const removeLocked = remover.flow.busy || remover.flow.phase === "unknown";
  // 看板很长：从下面的卡片勾选或改期时，预览框在上方，生成后滚到它那里。
  const editBox = useRef(null);
  useEffect(() => { if (flow.phase === "preview" || flow.phase === "unknown") editBox.current?.scrollIntoView({ block: "nearest" }); }, [flow.phase]);

  async function refresh() {
    setSync({ busy: true, error: "" });
    try { const list = await apiSend("POST", "/api/v3/projects/sync"); setProjects(list); setSync({ busy: false, error: "" }); }
    catch (e) { setSync({ busy: false, error: e.message }); }
  }
  // 改一处就重新预览；旧预览随之作废。
  function propose(node, patch) {
    if (flow.phase === "unknown" || flow.phase === "confirming") return;
    const body = { nodeId: node.id, ...patch };
    setEdit({ node, ...patch });
    flow.reset();
    flow.preview(() => apiSend("POST", `/api/v3/projects/${encodeURIComponent(p.id)}/preview`, body));
  }
  const confirm = () => flow.confirm(
    (pv) => apiSend("PATCH", `/api/v3/projects/${encodeURIComponent(p.id)}`, { previewId: pv.previewId, confirm: true }),
    async () => {
      const list = await apiSend("GET", "/api/v3/projects");
      setProjects(list);
      const node = list.find((x) => x.id === p.id)?.nodes.find((n) => n.id === edit.node.id);
      if (!node) return false;
      return ("done" in edit ? node.done === edit.done && node.statusKnown : true) && ("due" in edit ? (node.dueDate || "") === edit.due : true);
    },
  );
  const reread = async () => { try { setProjects(await apiSend("GET", "/api/v3/projects")); flow.resolve(); setEdit(null); } catch (e) { setSync({ busy: false, error: e.message }); } };

  const actions = <>
    <Button onClick={refresh} disabled={sync.busy}><PixelIcon name="refresh" />{sync.busy ? "读取中" : "重新读取飞书"}</Button>
    <Button onClick={() => { setCreating(true); setNote(""); }} disabled={creating}><PixelIcon name="plus" />新建项目</Button>
  </>;
  if (!projects.length) return (
    <Placeholder icon="project" title="项目表里还没有项目" action={<Button onClick={refresh} disabled={sync.busy}><PixelIcon name="refresh" />重新读取飞书</Button>}>
      来源是飞书「AI管培工作台 / 任务事项」。{sync.error && <span className="risk-text">读取失败：{sync.error}</span>}
    </Placeholder>
  );
  const locked = flow.busy || flow.phase === "unknown";
  const all = [...p.nodes, ...p.nodes.flatMap((n) => n.childNodes || [])];
  const taskTotal = p.taskCount ?? all.length, taskDone = p.taskDone ?? all.filter((n) => n.done).length;
  const rate = p.completion ?? (taskTotal ? taskDone / taskTotal : 0);
  const daysTo = projectSummary(p, today).daysTo;
  const week = p.nodes.filter((n) => !n.done && (daysTo(n) ?? 99) <= 7);
  const lateCount = all.filter(lateOf).length;
  const main = p.phases.filter((ph) => ph !== "监控");
  const colOf = (n) => n.phases?.find((ph) => ph !== "监控") || (n.phases?.includes("监控") ? null : main[0]);
  const gates = p.nodes.filter((n) => !colOf(n)).sort((a, b) => (a.dueDate || "9").localeCompare(b.dueDate || "9"));

  const status = (n) => {
    if (n.done) return lateOf(n) ? <Tag tone="amber">已勾选 · 未填完成日</Tag> : <Tag tone="green">已完成</Tag>;
    if (lateOf(n)) return <Tag tone="red">已逾期</Tag>;
    const left = daysTo(n);
    if (left === null) return <Tag tone="blue">进行中</Tag>;
    if (left < 0) return <Tag tone="red">逾期 {-left} 天</Tag>;
    return <Tag tone={left <= 2 ? "amber" : "blue"}>{left === 0 ? "今天到期" : `还有 ${left} 天`}</Tag>;
  };
  const links = (n) => (n.deliverables || []).filter((d) => d.url);
  const card = (n, lane = false) => (
    <article key={n.id} className={`pb-card${n.done ? " is-done" : lateOf(n) ? " is-late" : " is-open"}${lane ? " is-gate" : ""}`}>
      <div className="pb-card-t">
        <NodeCheck checked={n.done} onChange={() => !locked && propose(n, { done: !n.done })} label={`完成：${n.t}`} />
        <strong>{n.t}</strong>
      </div>
      <div className="pb-card-meta">
        <span>{n.owner}</span>
        <span className="tnum">{md(n.startDate)} → <DueInput key={`${n.id}-${n.dueDate}`} node={n} disabled={locked} onCommit={(due) => propose(n, { due })} /></span>
      </div>
      <div className="pb-card-tags">{status(n)}{n.milestone && <Tag tone="frame">里程碑</Tag>}{n.gate && !lane && <Tag tone="neutral">审核</Tag>}{n.doneDate && <span className="small muted tnum">完成 {md(n.doneDate)}</span>}</div>
      {n.childNodes?.length > 0 && <ul className="pb-kids">
        {n.childNodes.map((k) => <li key={k.id} className={k.done ? "is-done" : ""}><i />{k.t.split(" / ").pop()}{lateOf(k) && !k.done && <em className="risk-text">逾期</em>}</li>)}
      </ul>}
      {links(n).length > 0 && <div className="pb-links">{links(n).map((d, i) => <a key={i} href={d.url} target="_blank" rel="noreferrer"><PixelIcon name="link" />{d.title}</a>)}</div>}
    </article>
  );

  return (
    <div className="pb">
      <div className="pb-top">
        <div className="pb-tabs" role="tablist" aria-label="项目">
          {projects.map((x) => {
            const s = projectSummary(x, today);
            return (
              <button key={x.id} type="button" role="tab" aria-selected={x.id === p.id} className={x.id === p.id ? "active" : ""} onClick={() => { if (removeLocked) return; setSel(x.id); flow.reset(); remover.flow.reset(); }}>
                <strong>{x.name}</strong>
                <span className="small">{x.status}{x.local ? " · 本地" : ""} · 任务 {x.taskDone ?? s.done}/{x.taskCount ?? s.total}</span>
              </button>
            );
          })}
        </div>
        <span className="spacer" />
        {p.local && <Button onClick={() => { flow.reset(); remover.preview(p.id); }} disabled={removeLocked || flow.busy || flow.phase === "unknown"}><PixelIcon name="close" />删除本地项目</Button>}
        {actions}
      </div>
      <SavedNote text={note} onClose={() => setNote("")} />
      {creating && <NewProject projects={projects} onClose={() => setCreating(false)} onReread={async () => setProjects(await apiSend("GET", "/api/v3/projects"))}
        onSaved={async (pv) => {
          const list = await apiSend("GET", "/api/v3/projects"); const got = list.find((x) => x.id === pv.value.id);
          if (!got || JSON.stringify(got) !== JSON.stringify(pv.value)) return false;
          setProjects(list); setSel(got.id); flow.reset(); setCreating(false); setNote(`已新建本地项目「${got.name}」，回读核对一致`);
          return true;
        }} />}
      {sync.busy && <StepProgress label="只读同步飞书项目表" />}
      {sync.error && <p className="risk-text small">读取失败：{sync.error}（页面仍显示上次读到的内容）</p>}
      {deletedError && <p className="risk-text small">已删除列表读取失败：{deletedError}</p>}
      <DeletedList api={LOCAL_API} deleted={deleted} onPlaced={(r) => { placed(r); setDeletedError(""); if (remover.flow.phase === "saved") remover.flow.resolve(); }} noun="本地项目"
        describe={(x) => ({ name: x.name, meta: `${x.basedOn?.name ? `按「${x.basedOn.name}」生成 · ` : ""}${nodeCount(x)}` })}>
        {(pv) => <dl className="kv">
          <dt>项目</dt><dd>{pv.value.name}</dd>
          <dt>内容</dt><dd className="tnum">{nodeCount(pv.value)}；节点改动原样保留</dd>
          <dt>恢复后</dt><dd>按原编号回到项目列表，从已删除列表移出</dd>
          <dt>写到哪里</dt><dd>工作台本地；不影响飞书项目表</dd>
        </dl>}
      </DeletedList>

      <StatStrip items={[
        { label: p.completion != null ? "任务完成度（飞书）" : "任务完成度", value: Math.round(rate * 100), unit: "%", foot: p.completion != null ? "飞书公式，含子项" : "按工作台节点计算" },
        { label: "任务", value: taskDone, unit: `/${taskTotal}`, foot: `含子项 · 一级节点 ${p.nodes.filter((n) => n.done).length}/${p.nodes.length}` },
        { label: "当前阶段", value: p.phases[p.phase] || (p.nodes.every((n) => n.done) ? "已全部完成" : "—"), foot: "第一个还有未完成节点的阶段" },
        { label: "飞书标「逾期」", value: lateCount, tone: lateCount ? "risk" : "", foot: "按飞书「逾期状态」公式" },
        { label: "7 天内到期", value: week.length, tone: week.length ? "warn" : "", foot: week.map((n) => n.t).join("、") || "没有" },
      ]} />

      <WriteBox flow={remover.flow} className="soft-delete" title="删除本地项目预览" confirmLabel="确认删除" savedText="已删除，回读核对：项目列表里不再有它，已在「已删除的本地项目」里，可恢复" onConfirm={remover.confirm} onRepreview={remover.repreview} onReread={remover.reread}>
        {(pv) => <dl className="kv">
          <dt>删除</dt><dd>{pv.value.name}</dd>
          <dt>内容</dt><dd className="tnum">{nodeCount(pv.value)}</dd>
          <dt>方式</dt><dd>软删除：项目和节点改动全部保留，可在「已删除的本地项目」里按原编号恢复</dd>
          <dt>影响</dt><dd>只影响工作台本地；不删除飞书项目表里的任何内容</dd>
        </dl>}
      </WriteBox>
      <div ref={editBox} className="pb-anchor" />
      <WriteBox flow={flow} title="节点改动预览" onConfirm={confirm} onRepreview={() => edit && propose(edit.node, "due" in edit ? { due: edit.due } : { done: edit.done })} onReread={reread}>
        {() => edit && <dl className="kv">
          <dt>项目</dt><dd>{p.name}</dd>
          <dt>节点</dt><dd>{edit.node.t}</dd>
          {"done" in edit && <><dt>完成状态</dt><dd><span className="diff-old">{STATE_TEXT[nodeState(edit.node)]}</span> → <span className="diff-new">{edit.done ? "已完成" : "未完成"}</span></dd></>}
          {"due" in edit && <><dt>截止日期</dt><dd><span className="diff-old">{edit.node.dueDate || "未设"}</span> → <span className="diff-new">{edit.due || "清空"}</span></dd></>}
          <dt>写到哪里</dt><dd>工作台本地记录（不回写飞书项目表）</dd>
        </dl>}
      </WriteBox>

      <div className="pb-board" style={{ "--cols": Math.max(main.length, 1) }}>
        {main.map((ph) => {
          const nodes = p.nodes.filter((n) => colOf(n) === ph);
          const ok = nodes.filter((n) => n.done).length;
          const state = nodes.length && ok === nodes.length ? "is-done" : p.phases[p.phase] === ph ? "is-cur" : "";
          return (
            <section key={ph} className={`pb-col ${state}`}>
              <div className="pb-col-head"><span><b className="tnum">{String(p.phases.indexOf(ph) + 1).padStart(2, "0")}</b>{ph}</span><span className="tnum">{ok}/{nodes.length}</span></div>
              {nodes.map((n) => card(n))}
              {!nodes.length && <p className="small muted pb-empty">这一阶段没有节点</p>}
            </section>
          );
        })}
      </div>
      {gates.length > 0 && <section className="pb-lane">
        <div className="pb-lane-head"><b>监控</b><span className="small muted">审核门禁 · 按截止日期排，贯穿全程</span><span className="spacer" /><span className="tnum small">{gates.filter((n) => n.done).length}/{gates.length}</span></div>
        <div className="pb-lane-body">{gates.map((n) => card(n, true))}</div>
      </section>}
      <p className="small muted">勾选和改截止日期只存在工作台，不回写飞书；完成度、逾期状态以飞书为准。</p>
    </div>
  );
}

// 新建项目：只存工作台，不在飞书项目表新建。按选中的飞书项目复制阶段和节点（含子项），全部未完成、没有负责人和日期。
function NewProject({ projects, onSaved, onReread, onClose }) {
  const sources = projects.filter((x) => !x.local);
  const [name, setName] = useState("");
  const [basedOn, setBasedOn] = useState(sources[0]?.id || "");
  const flow = useWriteFlow();
  const locked = flow.busy || flow.phase === "unknown";
  const ok = name.trim() && basedOn;
  const preview = () => flow.preview(() => apiSend("POST", "/api/v3/local-projects/preview", { name: name.trim(), basedOn }));
  const confirm = () => flow.confirm((pv) => apiSend("POST", "/api/v3/local-projects/confirm", { previewId: pv.previewId, confirm: true }), (receipt, pv) => onSaved(pv));
  const reread = async () => { await onReread(); flow.resolve(); };
  if (!sources.length) return <div className="proj-new"><p className="small muted">飞书项目表里没有可用作模板的项目，暂时不能新建。</p><Button onClick={onClose}>关闭</Button></div>;
  return (
    <div className="proj-new">
      <label><span className="label">项目名称</span><input value={name} maxLength={100} disabled={locked} placeholder="如：T2 价格方案复盘" onChange={(e) => { setName(e.target.value); flow.reset(); }} /></label>
      <label><span className="label">按哪个项目的阶段和节点生成</span>
        <select value={basedOn} disabled={locked} onChange={(e) => { setBasedOn(e.target.value); flow.reset(); }}>{sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <div className="row"><span className="small muted">只存工作台，不回写飞书</span><span className="spacer" /><Button onClick={onClose} disabled={locked}>取消</Button><Button variant="primary" disabled={!ok || locked} onClick={preview}><PixelIcon name="eye" />预览新建</Button></div>
      <WriteBox flow={flow} title="新建项目预览" confirmLabel="确认新建" onConfirm={confirm} onRepreview={preview} onReread={reread}>
        {(pv) => <dl className="kv">
          <dt>名称</dt><dd>{pv.value.name}</dd>
          <dt>模板</dt><dd>按「{pv.value.basedOn.name}」的结构</dd>
          <dt>阶段</dt><dd>{pv.value.phases.join(" → ")}</dd>
          <dt>节点</dt><dd className="tnum">{pv.value.nodes.length} 个，子项 {pv.value.nodes.reduce((n, x) => n + (x.childNodes?.length || 0), 0)} 个；全部未完成，没有负责人和日期</dd>
          <dt>写到哪里</dt><dd>工作台本地，标「本地」；不在飞书项目表新建</dd>
        </dl>}
      </WriteBox>
    </div>
  );
}

// 截止日期：浏览器自带日期选择器，存完整 YYYY-MM-DD；选好后和原值不同才生成预览。
function DueInput({ node, disabled, onCommit }) {
  return <DateCommit className="node-due" value={node.dueDate || ""} disabled={disabled} title="选好日期后生成预览" onCommit={onCommit} aria-label={`截止日期：${node.t}`} />;
}

/* ================= 管培带教 ================= */
// 管培带教（用户 2026-10-19 重做）：左侧是日志里的提问原话（可跳回飞书那一段），右侧是反馈栏。
// 点左侧一条，右侧打开反馈：人工填写，或让机械邪龙兽回答（逐字打出）；预览确认后作为评论挂在飞书原话那一段，回读核对。
// 人工回复用常浩本人身份，机械邪龙兽的回答用应用身份；结果不明时锁住这一条，只能只读核对，不自动重发。
function Mentor() {
  const state = useApi("/api/v3/mentor");
  return <Loadable state={state} name="带教日志" big>{(list) => <MentorBoard initial={list} />}</Loadable>;
}

const KIND_TONE = { 提问: "blue" };
const AS_TEXT = { user: "常浩", bot: "机械邪龙兽" };

function MentorBoard({ initial }) {
  const [list, setList] = useState(initial);
  const [i, setI] = useState(0);
  const [selId, setSelId] = useState(null);
  const [sync, setSync] = useState({ busy: false, error: "" });
  const p = list[i];
  if (!p) return <Placeholder icon="mentor" title="还没有管培生日志">设置里配置管培生日志来源后，这里显示最近 30 天的日志。</Placeholder>;
  const items = (p.items || []).filter(it => it.kind === "提问");
  const count = (x, k) => (x.items || []).filter((it) => it.kind === k).length;
  const sel = items.find((it) => it.id === selId) || null;
  async function refresh() {
    setSync({ busy: true, error: "" });
    try { setList(await apiSend("POST", "/api/v3/mentor/refresh")); setSync({ busy: false, error: "" }); }
    catch (e) { setSync({ busy: false, error: e.message }); }
  }
  const reread = async () => { const fresh = await apiSend("GET", "/api/v3/mentor"); setList(fresh); return fresh; };
  return (
    <>
      <div className="toolbar">
        <div className="person-tabs">
          {list.map((x, k) => (
            <button key={x.name} type="button" className={k === i ? "active" : ""} onClick={() => { setI(k); setSelId(null); }}>
              <span><strong>{x.name}</strong><span className="small">{x.role} · {x.logs.length} 篇日志</span></span>
              <b className="mq-count is-ask tnum" title="提问">{count(x, "提问")}</b>
            </button>
          ))}
        </div>
        <span className="spacer" />
        {sync.error && <span className="risk-text small">读取失败：{sync.error}</span>}
        <span className="small muted">最近 30 天 · 飞书日志</span>
        <Button onClick={refresh} disabled={sync.busy}><PixelIcon name="refresh" />{sync.busy ? "读取中" : "刷新日志"}</Button>
      </div>
      {sync.busy && <StepProgress label="读取飞书日志" />}
      <div className="mentor-v4">
        <section className="card mq-list">
          <div className="card-head">
            <h2><PixelIcon name="reports" />{p.name} · 提问</h2>
            <span className="small muted">{items.length} 条提问</span>
          </div>
          {items.length ? <ol className="mq-items">
            {items.map((it) => (
              <li key={it.id} className={`mq-item${it.id === selId ? " active" : ""}`}>
                <button type="button" onClick={() => setSelId(it.id)}>
                  <span className="mq-meta"><Tag tone={KIND_TONE[it.kind]}>{it.kind}</Tag><span className="tnum">{it.date.slice(5)}</span><span className="mq-log">{it.log}</span>
                    {it.reply?.state === "sent" && <span className="mq-replied"><PixelIcon name="check" />已回复 · {AS_TEXT[it.reply.as]}</span>}
                    {it.reply && it.reply.state !== "sent" && <span className="risk-text">结果不明</span>}</span>
                  <span className="mq-text">{it.text}</span>
                </button>
                <a className="mq-src" href={it.src} target="_blank" rel="noreferrer" title="在飞书打开这句原话">原文<PixelIcon name="link" /></a>
              </li>
            ))}
          </ol> : <p className="small muted mq-empty">最近 30 天的日志里没有提问。</p>}
        </section>
        <Feedback key={`${p.name}:${selId || ""}`} person={p} item={sel} onReread={reread} />
      </div>
    </>
  );
}

function Feedback({ person, item, onReread }) {
  const [text, setText] = useState("");
  const [as, setAs] = useState("user");
  const [typing, setTyping] = useState(false); // 机械邪龙兽的回答正在逐字打出
  const [editing, setEditing] = useState(true);
  const [ai, setAi] = useState({ busy: false, error: "" });
  const [check, setCheck] = useState({ busy: false, error: "" });
  const flow = useWriteFlow();
  if (!item) return (
    <section className="card mq-feedback">
      <Placeholder icon="mentor" title="点左侧一条提问">右侧写回复，或让机械邪龙兽回答；确认后作为评论挂在飞书原话那一段。</Placeholder>
    </section>
  );
  const base = `/api/v3/mentor/${encodeURIComponent(person.name)}/items/${encodeURIComponent(item.id)}`;
  const reply = item.reply;
  const locked = Boolean(reply && reply.state !== "sent");
  const busy = ai.busy || typing || flow.busy || flow.phase === "unknown";
  const change = (v) => { setText(v); flow.reset(); };
  async function askAi() {
    if (busy || locked) return;
    flow.reset(); setAi({ busy: true, error: "" });
    try {
      const r = await apiSend("POST", `${base}/answer`, {});
      setText(r.text); setAs("bot"); setEditing(false); setTyping(true); setAi({ busy: false, error: "" });
    } catch (e) { setAi({ busy: false, error: e.message }); }
  }
  const preview = () => flow.preview(() => apiSend("POST", `${base}/reply/preview`, { text, as }));
  const confirm = () => flow.confirm(
    (pv) => apiSend("POST", `${base}/reply`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => { const fresh = await onReread(); const r = fresh.find((x) => x.name === person.name)?.items?.find((x) => x.id === item.id)?.reply; return r?.state === "sent" && r.text === pv.value.text && r.commentId === receipt?.commentId; },
  );
  async function reconcile() {
    setCheck({ busy: true, error: "" });
    try { await apiSend("POST", `${base}/reply/reconcile`, {}); await onReread(); flow.resolve(); setCheck({ busy: false, error: "" }); }
    catch (e) { setCheck({ busy: false, error: e.message }); }
  }
  return (
    <section className="card mq-feedback">
      <div className="card-head"><h2><PixelIcon name="send" />反馈</h2><span className="row"><Tag tone={KIND_TONE[item.kind]}>{item.kind}</Tag><span className="small muted tnum">{item.date} · {item.log}</span></span></div>
      <div className="card-body mq-body">
      <blockquote className="mq-quote">
        <p>{item.text}</p>
        <a className="link" href={item.src} target="_blank" rel="noreferrer">在飞书打开原话<PixelIcon name="link" /></a>
      </blockquote>
      {reply?.state === "sent" && <div className="mq-sent">
        <div className="small"><PixelIcon name="check" /> 已挂在飞书原话那一段 · {AS_TEXT[reply.as]} · <span className="tnum" title="北京时间">{mentorReplyTime(reply.at)}</span></div>
        <p><MarkText text={reply.display || reply.text} /></p>
        <span className="small muted">再发一条会作为新评论挂在同一段。</span>
      </div>}
      {locked && <div className="write-box is-unknown" role="alert">
        <div className="write-head"><PixelIcon name="alert" /><strong>上一次发送结果不明，已锁住这一条</strong></div>
        <p className="write-msg">{reply.error || "发送后没有回读确认"}。不会自动重发；先只读核对飞书里有没有这条评论：有就记为已回复，没有就可以重新发送。</p>
        {check.error && <p className="write-msg risk-text">核对失败：{check.error}</p>}
        <div className="write-actions"><Button variant="primary" onClick={reconcile} disabled={check.busy}><PixelIcon name="refresh" />{check.busy ? "核对中…" : "只读核对"}</Button></div>
      </div>}
      <div className="mq-editor">
        <div className="mq-editor-head">
          <span className="label">{typing ? "机械邪龙兽正在回答" : as === "bot" && !editing ? "机械邪龙兽的回答" : "回复内容"}</span>
          <span className="spacer" />
          {!editing && !typing && <button type="button" className="link-btn" onClick={() => setEditing(true)}><PixelIcon name="edit" />编辑</button>}
        </div>
        {typing || !editing
          ? <div className="ai-box mq-answer">{typing ? <MarkType text={text} onDone={() => setTyping(false)} /> : <MarkText text={text} />}</div>
          : <textarea className="review-box" value={text} disabled={locked || flow.busy} onChange={(e) => change(e.target.value)} placeholder={`写给 ${person.name} 的回复：会作为评论挂在飞书里这句原话旁边。**两个星号**包住的是重点`} />}
        {ai.busy && <StepProgress label="机械邪龙兽正在读这一天的日志" />}
        {ai.error && <p className="risk-text small">没有拿到回答：{ai.error}（不会自动重试）</p>}
        <div className="row">
          <Button onClick={askAi} disabled={busy || locked}><PixelIcon name="spark" />机械邪龙兽回答</Button>
          <span className="spacer" />
          <span className="small muted">发送身份</span>
          <Segmented options={[["user", "常浩"], ["bot", "机械邪龙兽"]]} value={as} onChange={(v) => { if (!busy) { setAs(v); flow.reset(); } }} />
          <Button variant="primary" disabled={!text.trim() || busy || locked} onClick={preview}><PixelIcon name="eye" />预览发送</Button>
        </div>
        <p className="small muted">机械邪龙兽点一次调用一次本机 Codex，只读这一天的日志；回答先显示在这里，确认后才发到飞书。</p>
      </div>
      <WriteBox flow={flow} title="发送到飞书预览" confirmLabel="确认发送" savedText="已发到飞书，回读核对：评论挂在原话那一段，内容一致" onConfirm={confirm} onRepreview={preview} onReread={reconcile}>
        {(pv) => <dl className="kv">
          <dt>文档</dt><dd>{person.name} 的日志 · {pv.value.date} {pv.value.log}</dd>
          <dt>原话</dt><dd>「{pv.value.quote}」</dd>
          <dt>位置</dt><dd>评论挂在这句原话所在的那一段</dd>
          <dt>身份</dt><dd>{AS_TEXT[pv.value.as]}{pv.value.as === "bot" ? "（飞书应用）" : "（你本人）"}</dd>
          <dt>回复</dt><dd className="pre">{pv.value.text}</dd>
        </dl>}
      </WriteBox>
      </div>
    </section>
  );
}
