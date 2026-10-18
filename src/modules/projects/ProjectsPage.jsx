import { useEffect, useState } from "react";
import { PixelBar, PixelIcon, StepProgress, TypeText } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Card, Loadable, NodeCheck, PageHeader, PhaseSteps, Placeholder, Segmented, StatStrip, Tabs, Tag, useToast } from "../../ui/components.jsx";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { DeletedList, useSoftRemove } from "../../ui/soft-delete.jsx";
import { isoWeek, localDate } from "../../constants.js";
import { nodeState, projectSummary } from "./project-view.js";

// 项目（v3）：项目推进读飞书「AI管培工作台 / 项目推进」；管培带教读两位管培生近 30 天日志，带教草稿只在人工点击时生成。
// 节点改动只存工作台本地（不回写飞书），每次都走「预览 → 确认 → 回读」。来源没填的完成状态、截止日期、当前阶段显示「未填写 / 未知」，不当成未完成。
const TABS = [
  ["board", "项目推进", "各项目的阶段、节点和负责人；节点改动只存在工作台，不回写飞书"],
  ["mentor", "管培带教", "管培生近 30 天的飞书日志、卡点与提问；AI 草稿只在你点击时生成，不自动发送"],
].map(([key, label, desc]) => ({ key, label, desc, href: href("projects", key) }));

export default function ProjectsPage({ route }) {
  const [tab = "board"] = route;
  return <><PageHeader title="项目" /><Tabs items={TABS} active={tab === "mentor" ? "mentor" : "board"} />{tab === "mentor" ? <Mentor /> : <Board />}</>;
}

const STATUS_TONE = { 已结项: "green", 实施中: "blue", 推进中: "blue", 调研中: "blue" };
const STATE_TEXT = { done: "已完成", open: "未完成", unknown: "未填写" };
const LOCAL_API = { base: "/api/v3/local-projects", active: "/api/v3/projects" };
const nodeCount = (x) => `${x.nodes.length} 个节点，已完成 ${x.nodes.filter((n) => n.done).length}`;

function Board() {
  const state = useApi("/api/v3/projects");
  return <Loadable state={state} name="项目" big>{(list) => <ProjectBoard initial={list} />}</Loadable>;
}

function ProjectBoard({ initial }) {
  const [projects, setProjects] = useState(initial);
  const [sel, setSel] = useState(initial[0]?.id);
  const [filter, setFilter] = useState("all");
  const [sync, setSync] = useState({ busy: false, error: "" });
  const [edit, setEdit] = useState(null); // { nodeId, done?, due? }：正在预览的那一处改动
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

  if (!projects.length) return (
    <Placeholder icon="project" title="项目表里还没有项目" action={<Button onClick={refresh} disabled={sync.busy}><PixelIcon name="refresh" />重新读取飞书</Button>}>
      来源是飞书「AI管培工作台 / 项目推进」。{sync.error && <span className="risk-text">读取失败：{sync.error}</span>}
    </Placeholder>
  );
  const sum = projectSummary(p, today);
  const keep = (n) => {
    const st = nodeState(n);
    if (filter === "open") return st !== "done";
    if (filter === "gate") return n.gateReady && st !== "done";
    if (filter === "soon") return st !== "done" && sum.daysTo(n) !== null && sum.daysTo(n) <= 2;
    if (filter === "unknown") return st === "unknown";
    return true;
  };
  const inPhase = (n, ph) => (n.phases?.length ? n.phases : [n.ph]).includes(ph);
  return (
    <div className="proj-layout cols-3-9">
      <section className="card proj-list">
        <div className="card-head"><h2><PixelIcon name="project" />项目<span className="tnum small muted">{projects.length}</span></h2>
          <div className="card-extra"><Button onClick={refresh} disabled={sync.busy}><PixelIcon name="refresh" />{sync.busy ? "读取中" : "重新读取"}</Button><Button onClick={() => { setCreating(true); setNote(""); }} disabled={creating}><PixelIcon name="plus" />新建项目</Button></div></div>
        <SavedNote text={note} onClose={() => setNote("")} />
        {creating && <NewProject projects={projects} onClose={() => setCreating(false)} onReread={async () => setProjects(await apiSend("GET", "/api/v3/projects"))}
          onSaved={async (pv) => {
            const list = await apiSend("GET", "/api/v3/projects"); const got = list.find((x) => x.id === pv.value.id);
            if (!got || JSON.stringify(got) !== JSON.stringify(pv.value)) return false;
            setProjects(list); setSel(got.id); flow.reset(); setCreating(false); setNote(`已新建本地项目「${got.name}」，回读核对一致`);
            return true;
          }} />}
        {sync.busy && <div className="proj-sync"><StepProgress label="只读同步飞书项目表" /></div>}
        {sync.error && <p className="proj-sync risk-text small">读取失败：{sync.error}（页面仍显示上次读到的内容）</p>}
        {/* 放在列表上方：.proj-items 吸顶，排在它后面的内容滚动时会被盖住 */}
        {deletedError && <p className="proj-sync risk-text small">已删除列表读取失败：{deletedError}</p>}
        <DeletedList api={LOCAL_API} deleted={deleted} onPlaced={(r) => { placed(r); setDeletedError(""); }} noun="本地项目"
          describe={(x) => ({ name: x.name, meta: `${x.basedOn?.name ? `按「${x.basedOn.name}」生成 · ` : ""}${nodeCount(x)}` })}>
          {(pv) => <dl className="kv">
            <dt>项目</dt><dd>{pv.value.name}</dd>
            <dt>内容</dt><dd className="tnum">{nodeCount(pv.value)}；节点改动原样保留</dd>
            <dt>恢复后</dt><dd>按原编号回到项目列表，从已删除列表移出</dd>
            <dt>写到哪里</dt><dd>工作台本地；不影响飞书项目表</dd>
          </dl>}
        </DeletedList>
        <div className="proj-items">
          {projects.map((x) => {
            const s = projectSummary(x, today);
            return (
              <button key={x.id} type="button" className={`proj-card${x.id === p.id ? " active" : ""}`} onClick={() => { if (removeLocked) return; setSel(x.id); flow.reset(); remover.flow.reset(); }}>
                <span className="proj-card-top"><strong>{x.name}</strong><Tag tone={STATUS_TONE[x.status] || "neutral"}>{x.status}</Tag></span>
                <span className="small muted">模板：{x.template}{x.local && <> · <Tag tone="frame">本地</Tag> 按「{x.basedOn.name}」生成</>}</span>
                <PixelBar className="proj-bar" value={s.total ? s.done / s.total : 0} label={`已完成 ${s.done}/${s.total}`} />
                <span className="proj-card-meta small"><span className="tnum">{s.done}/{s.total} 已完成</span>{s.unknown > 0 && <span className="muted">{s.unknown} 未填写</span>}{s.gates > 0 && <span className="warn-text">待审 {s.gates}</span>}{s.soon > 0 && <span className="risk-text">2 天内 {s.soon}</span>}</span>
                {s.next && <span className="proj-next small">下一个：{s.next.t}{s.next.dueDate ? ` · ${s.next.dueDate}` : ""}</span>}
              </button>
            );
          })}
        </div>
      </section>
      <section className="proj-main">
        <StatStrip items={[
          { label: `项目推进 · 模板 ${p.template}`, value: p.name, foot: <Tag tone={STATUS_TONE[p.status] || "neutral"}>{p.status}</Tag> },
          { label: "节点完成", value: sum.done, unit: `/${sum.total}`, foot: p.phase >= 0 && p.phases[p.phase] ? `当前阶段：${p.phases[p.phase]}` : "当前阶段：未知（来源未填写）" },
          { label: "状态未填写", value: sum.unknown, tone: sum.unknown ? "muted" : "", foot: "来源没填完成状态，不算未完成" },
          { label: "等你审核", value: sum.gates, tone: sum.gates ? "warn" : "", foot: "只算来源标了「可审核」的门禁" },
          { label: "2 天内到期", value: sum.soon, tone: sum.soon ? "risk" : "", foot: sum.soonest ? `${sum.soonest.t} · ${sum.soonest.dueDate}` : `${sum.undated} 个节点没有日期` },
        ]} />
        <PhaseSteps items={p.phases.map((ph, i) => {
          const nodes = p.nodes.filter((n) => inPhase(n, ph));
          const ok = nodes.filter((n) => nodeState(n) === "done").length;
          const unk = nodes.filter((n) => nodeState(n) === "unknown").length;
          // 当前阶段未知（phase = -1）时不标「进行中 / 遗留」，只按节点状态说明。
          const state = nodes.length && ok === nodes.length ? "done" : p.phase === i ? "cur" : p.phase > i ? "left" : "todo";
          return { key: ph, name: ph, state, note: <>{ok}/{nodes.length} 已完成{unk ? ` · ${unk} 未填写` : ""}</> };
        })} />
        <div className="toolbar">
          <Segmented options={[["all", "全部节点"], ["open", "未完成"], ["unknown", `未填写 ${sum.unknown}`], ["gate", `等你审核 ${sum.gates}`], ["soon", `2 天内到期 ${sum.soon}`]]} value={filter} onChange={setFilter} />
          <span className="spacer" />
          <span className="small muted">改动只存在工作台，不回写飞书</span>
          {p.local && <Button onClick={() => { flow.reset(); remover.preview(p.id); }} disabled={removeLocked || flow.busy || flow.phase === "unknown"}><PixelIcon name="close" />删除本地项目</Button>}
        </div>
        <WriteBox flow={remover.flow} className="soft-delete" title="删除本地项目预览" confirmLabel="确认删除" savedText="已删除，回读核对：项目列表里不再有它，已在「已删除的本地项目」里，可恢复" onConfirm={remover.confirm} onRepreview={remover.repreview} onReread={remover.reread}>
          {(pv) => <dl className="kv">
            <dt>删除</dt><dd>{pv.value.name}</dd>
            <dt>内容</dt><dd className="tnum">{nodeCount(pv.value)}</dd>
            <dt>方式</dt><dd>软删除：项目和节点改动全部保留，可在左侧「已删除的本地项目」里按原编号恢复</dd>
            <dt>影响</dt><dd>只影响工作台本地；不删除飞书项目表里的任何内容</dd>
          </dl>}
        </WriteBox>
        <WriteBox flow={flow} title="节点改动预览" onConfirm={confirm} onRepreview={() => edit && propose(edit.node, "due" in edit ? { due: edit.due } : { done: edit.done })} onReread={reread}>
          {() => edit && <dl className="kv">
            <dt>项目</dt><dd>{p.name}</dd>
            <dt>节点</dt><dd>{edit.node.t}</dd>
            {"done" in edit && <><dt>完成状态</dt><dd><span className="diff-old">{STATE_TEXT[nodeState(edit.node)]}</span> → <span className="diff-new">{edit.done ? "已完成" : "未完成"}</span></dd></>}
            {"due" in edit && <><dt>截止日期</dt><dd><span className="diff-old">{edit.node.dueDate || "未设"}</span> → <span className="diff-new">{edit.due || "清空"}</span></dd></>}
            <dt>写到哪里</dt><dd>工作台本地记录（不回写飞书项目表）</dd>
          </dl>}
        </WriteBox>
        <section className="card node-list">
          <div className="node-cols" aria-hidden="true"><span /><span>序号</span><span>节点</span><span>负责人</span><span>截止</span><span>状态</span></div>
          {p.phases.map((ph, k) => {
            const nodes = p.nodes.map((n, i) => ({ ...n, i })).filter((n) => inPhase(n, ph) && keep(n));
            if (!nodes.length) return null;
            const all = p.nodes.filter((n) => inPhase(n, ph));
            return (
              <div key={ph} className="phase">
                <div className="phase-name"><b>{String(k + 1).padStart(2, "0")}</b><strong>{ph}</strong><span className="tnum small muted">{all.filter((n) => nodeState(n) === "done").length}/{all.length}</span></div>
                <ul className="phase-nodes">
                  {nodes.map((n) => {
                    const st = nodeState(n);
                    const left = st === "done" ? null : sum.daysTo(n);
                    const kidsDone = n.kids ? n.kids.filter(([, ok]) => ok).length : 0;
                    const locked = flow.busy || flow.phase === "unknown";
                    return (
                      <li key={n.id} className={`node${st === "done" ? " is-done" : ""}${n.gate ? " is-gate" : ""}${st === "unknown" ? " is-unknown" : ""}`}>
                        <NodeCheck checked={st === "done"} onChange={() => !locked && propose(n, { done: st !== "done" })} label={`完成：${n.t}`} />
                        <span className="tnum small muted">{n.i + 1}</span>
                        <div className="node-main">
                          <span className="node-t">{n.t}{n.gate && <Tag tone={n.gateReady && st !== "done" ? "amber" : "neutral"}>{n.gateReady && st !== "done" ? "等你审核" : "门禁"}</Tag>}</span>
                          {n.kids && (
                            <ul className="node-kids">
                              <li className="node-kids-sum tnum">子项 {kidsDone}/{n.kids.length}{n.childNodes?.some((c) => !c.statusKnown) ? " · 状态未填写" : ""}</li>
                              {n.kids.map(([kid, ok], j) => <li key={`${kid}-${j}`} className={ok ? "is-done" : ""}><i />{kid}</li>)}
                            </ul>
                          )}
                        </div>
                        <span className="node-owner">{n.owner}</span>
                        <DueInput key={`${n.id}-${n.dueDate}`} node={n} disabled={locked} onCommit={(due) => propose(n, { due })} />
                        <span className="node-left">{st === "done" ? <span className="ok-text">已完成</span> : st === "unknown" ? <span className="muted">未填写</span> : left === null ? <span className="muted">未完成</span> : left < 0 ? <span className="risk-text">逾期 {-left} 天</span> : left === 0 ? <span className="risk-text">今天到期</span> : <span className={left <= 2 ? "warn-text" : "muted"}>还有 {left} 天</span>}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      </section>
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

// 截止日期：完整 YYYY-MM-DD；回车或离开输入框时，和原值不同才生成预览。格式不对时提示，不发请求。
function DueInput({ node, disabled, onCommit }) {
  const [v, setV] = useState(node.dueDate || "");
  const bad = v !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(v);
  const commit = () => { if (!bad && v !== (node.dueDate || "")) onCommit(v); };
  return <input className={`node-due${bad ? " is-bad" : ""}`} value={v} placeholder="未设日期" disabled={disabled} title={bad ? "日期要写成 2026-10-31" : "回车或离开输入框后生成预览"}
    onChange={(e) => setV(e.target.value.trim())} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setV(node.dueDate || ""); }} aria-label={`截止日期：${node.t}`} />;
}

/* ================= 管培带教 ================= */
function Mentor() {
  const state = useApi("/api/v3/mentor");
  return <Loadable state={state} name="带教日志" big>{(list) => <MentorBoard initial={list} />}</Loadable>;
}

const FLAG_TONE = { 卡点: "red", 提问: "blue" };

function MentorBoard({ initial }) {
  const [list, setList] = useState(initial);
  const [i, setI] = useState(0);
  const [note, setNote] = useState("");
  const [week, setWeek] = useState(isoWeek());
  const [sync, setSync] = useState({ busy: false, error: "" });
  const [toast, showToast] = useToast();
  const record = useWriteFlow();
  const draft = useWriteFlow();
  const p = list[i];
  if (!p) return <Placeholder icon="mentor" title="还没有管培生日志">设置里配置管培生日志来源后，这里显示最近 30 天的日志。</Placeholder>;
  const count = (x, f) => x.logs.filter((l) => l.flag === f).length;
  const isAi = p.feedbackOrigin === "ai-draft";
  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); showToast(`已复制${label}`); } catch { showToast("复制失败：浏览器不允许写剪贴板"); } };
  const pick = (k) => { if (record.busy || draft.busy) return; setI(k); setNote(""); record.reset(); draft.reset(); };
  async function refresh() {
    setSync({ busy: true, error: "" });
    try { setList(await apiSend("POST", "/api/v3/mentor/refresh")); setSync({ busy: false, error: "" }); }
    catch (e) { setSync({ busy: false, error: e.message }); }
  }
  const reread = async (flow) => { try { setList(await apiSend("GET", "/api/v3/mentor")); flow.resolve(); } catch (e) { setSync({ busy: false, error: e.message }); } };
  const previewRecord = () => record.preview(() => apiSend("POST", `/api/v3/mentor/${encodeURIComponent(p.name)}/records/preview`, { week, note }));
  const confirmRecord = () => record.confirm(
    (pv) => apiSend("POST", `/api/v3/mentor/${encodeURIComponent(p.name)}/records`, { previewId: pv.previewId, confirm: true, week: pv.value.week }),
    async (receipt, pv) => { const fresh = await apiSend("GET", "/api/v3/mentor"); setList(fresh); return fresh.find((x) => x.name === p.name)?.history.includes(pv.value.week) && receipt?.note === pv.value.note; },
  );
  // AI 草稿：只在点击时调用本机 Codex 生成；预览确认后才保存成「AI 草稿（待核对）」。
  const previewDraft = () => draft.preview(() => apiSend("POST", `/api/v3/mentor/${encodeURIComponent(p.name)}/draft/preview`, {}));
  const confirmDraft = () => draft.confirm(
    (pv) => apiSend("POST", `/api/v3/mentor/${encodeURIComponent(p.name)}/draft`, { previewId: pv.previewId, confirm: true }),
    async () => { const fresh = await apiSend("GET", "/api/v3/mentor"); setList(fresh); return fresh.find((x) => x.name === p.name)?.feedbackOrigin === "ai-draft"; },
  );
  return (
    <>
      <div className="toolbar">
        <div className="person-tabs">
          {list.map((x, k) => (
            <button key={x.name} type="button" className={k === i ? "active" : ""} onClick={() => pick(k)}>
              <span><strong>{x.name}</strong><span className="small">{x.role}</span></span>
              {count(x, "卡点") > 0 && <em>卡点 {count(x, "卡点")}</em>}
            </button>
          ))}
        </div>
        <span className="spacer" />
        {sync.error && <span className="risk-text small">读取失败：{sync.error}</span>}
        <span className="small muted">最近 30 天 · 只读飞书</span>
        <Button onClick={refresh} disabled={sync.busy}><PixelIcon name="refresh" />{sync.busy ? "读取中" : "刷新日志"}</Button>
      </div>
      <StatStrip items={[
        { label: "日志", value: p.logs.length, unit: " 篇", foot: "最近 30 天" },
        { label: "卡点", value: count(p, "卡点"), tone: count(p, "卡点") ? "risk" : "", foot: "日志里标了「卡点」的" },
        { label: "提问", value: count(p, "提问"), foot: "日志里标了「提问」的" },
        { label: "最近一篇", value: p.logs[0]?.date || "—", foot: p.history.length ? `已存 ${p.history.length} 周带教记录` : "还没有带教记录" },
      ]} />
      <div className="mentor-layout cols-6-6">
        <Card title={<><PixelIcon name="reports" />{p.name} · 日志</>}>
          {p.logs.length ? <ol className="logs">{p.logs.map((l) => <li key={`${l.date}-${l.src}`}><span className="tnum small muted">{l.date || l.d}</span>{l.src ? <a href={l.src} target="_blank" rel="noreferrer">{l.t}</a> : <span>{l.t}</span>}{l.flag && <Tag tone={FLAG_TONE[l.flag] || "neutral"}>{l.flag}</Tag>}</li>)}</ol>
            : <p className="small muted">最近 30 天没有日志。</p>}
        </Card>
        <section className="card coach">
          <div className="card-head"><h2><PixelIcon name="mentor" />带教建议</h2><span className="row">{isAi ? <Tag tone="amber">AI 草稿 · 待核对</Tag> : <Tag tone="neutral">规则草稿</Tag>}<a className="link" href={href("assistants")}>对话</a></span></div>
          <div className="coach-block"><h4><PixelIcon name="alert" />日志里的卡点（规则提取）</h4>{p.blocks.length ? <ul>{p.blocks.map((b, k) => <li key={k}>{b}</li>)}</ul> : <p className="small muted">没有提取到卡点。</p>}</div>
          <div className="coach-block"><h4><PixelIcon name="search" />日志里的提问（规则提取）</h4>
            {p.asks.length ? <ul>{p.asks.map((a, k) => <li key={k}>{a}<button type="button" className="icon-btn" title="复制" onClick={() => copy(a, "这条提问")}><PixelIcon name="copy" /></button></li>)}</ul> : <p className="small muted">没有提取到提问。</p>}
            <p className="small muted"><PixelIcon name="link" /> Q&A 合集：{p.qa == null ? (p.qaNote || "未建立关联") : `${p.qa} 条相关`}</p>
          </div>
          <div className="coach-block"><h4><PixelIcon name="send" />{isAi ? "AI 草稿" : "规则草稿"}{isAi && p.generatedAt && <span className="small muted">生成于 {String(p.generatedAt).slice(0, 16).replace("T", " ")}</span>}</h4>
            <div className="ai-box"><TypeText key={`${p.name}-${p.feedbackOrigin}`} text={p.feedback} /></div>
            <div className="row">
              <Button className="btn btn-xs" onClick={() => copy(p.feedback, "草稿")}><PixelIcon name="copy" />复制</Button>
              <span className="spacer" />
              <Button className="btn btn-xs" onClick={previewDraft} disabled={draft.busy || draft.phase === "unknown"}><PixelIcon name="spark" />用 AI 生成草稿</Button>
            </div>
            <p className="small muted">点一次调用一次本机 Codex，只读这位管培生最近 30 天的完整日志；不会自动运行，也不回写日志、不发消息。</p>
            <WriteBox flow={draft} title="AI 草稿预览" confirmLabel="保存为 AI 草稿" savedText="已保存为 AI 草稿，回读核对一致" onConfirm={confirmDraft} onRepreview={previewDraft} onReread={() => reread(draft)}>
              {(pv) => <><p className="small muted">AI 生成，待人工核对；保存后替换上面的草稿，不代表已确认的结论。</p><pre>{pv.value?.text}</pre></>}
            </WriteBox>
          </div>
          <div className="coach-block"><h4><PixelIcon name="edit" />你的结论（人工确认）</h4>
            <div className="row"><label className="small muted">周次 <input className="week-input" value={week} onChange={(e) => { setWeek(e.target.value.trim()); record.reset(); }} aria-label="周次 YYYY-Www" /></label></div>
            <textarea className="review-box" value={note} onChange={(e) => { setNote(e.target.value); record.reset(); }} placeholder={`写下这周对 ${p.name} 的判断和下周重点`} />
            <div className="row"><span className="small muted">已存：{p.history.length ? p.history.join(" · ") : "无"}</span><span className="spacer" /><Button variant="primary" disabled={!note.trim() || record.busy || record.phase === "unknown"} onClick={previewRecord}>预览保存</Button></div>
            <WriteBox flow={record} title="带教记录预览" onConfirm={confirmRecord} onRepreview={previewRecord} onReread={() => reread(record)}>
              {(pv) => <dl className="kv"><dt>管培生</dt><dd>{p.name}</dd><dt>周次</dt><dd className="tnum">{pv.value.week}{p.history.includes(pv.value.week) ? "（覆盖这一周已存的记录）" : ""}</dd><dt>结论</dt><dd>{pv.value.note}</dd><dt>写到哪里</dt><dd>工作台本地记录，不回写飞书</dd></dl>}
            </WriteBox>
          </div>
        </section>
      </div>
      {toast}
    </>
  );
}
