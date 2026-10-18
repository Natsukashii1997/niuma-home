import { useEffect, useMemo, useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { toBackendOps } from "./kb-ops.js";
import { Button, Loadable, PageHeader, Segmented, StatStrip, Tabs, Tag, useToast } from "../../ui/components.jsx";
import { href } from "../../router.js";
import KbCanvas from "./KbCanvas.jsx";

// 知识库整理（v3）：一棵可编辑的树 + 暂存区。拖动、多选、剪切粘贴、重命名、新建目录都先进暂存，可撤销；
// 预览确认后一次同步到飞书（第一批只做移动、重命名、新建目录；不删除，要删的先移到「99 待清理」）。
// 第 3 轮：搜索（标题 / 标签 / 正文摘要）、详情面板（位置、更新、标签、摘要、被谁引用）、健康检查（点一项只看这类问题）。
// 路由：kb = 画布（默认）；kb/tree = 目录树整理；kb/<文档 id>（⌘K 打开某篇文档）进目录树并选中它，右栏显示详情。
// 旧地址 kb/collect 并入画布：收藏只走 Chrome 扩展按钮，不再粘贴链接（用户 2026-10-18）。
const TABS = [
  ["canvas", "画布", "按分组拖动整理：拖完就写入飞书，每项回读核对", href("kb")],
  ["tree", "目录树", "多层目录、批量规则、健康检查：先暂存，预览确认后才同步飞书", href("kb", "tree")],
].map(([key, label, desc, to]) => ({ key, label, desc, href: to }));

export default function KnowledgePage({ route = [] }) {
  const tree = route[0] && route[0] !== "collect";
  return <><PageHeader title="知识库" subtitle="「常浩的知识库」：分组就是飞书一级目录，在这里拖动就是在飞书里整理" />
    <Tabs items={TABS} active={tree ? "tree" : "canvas"} />
    {tree ? <OrganizeTab route={route[0] === "tree" ? route.slice(1) : route} /> : <KbCanvas />}</>;
}

function OrganizeTab({ route }) {
  const state = useApi("/api/v3/kb/tree");
  return <Loadable state={state} name="知识库目录" big>{(kb) => <Organizer key={route[0] || ""} initialKb={kb} initialSel={route[0]} />}</Loadable>;
}

// 上一次确认同步的操作记录编号：页面刷新后也能只读核对（结果不明时后端会锁住整个空间的写入）。
const LAST_OP = "work-desk:kb-last-op";
const rememberOp = (id) => { try { localStorage.setItem(LAST_OP, id); } catch { /* 存不了就只在本页保留 */ } };
const lastOp = () => { try { return localStorage.getItem(LAST_OP) || ""; } catch { return ""; } };

const clone = (t) => JSON.parse(JSON.stringify(t));
function find(tree, id, parent = null) {
  for (const n of tree) {
    if (n.id === id) return { node: n, parent };
    if (n.kids) { const r = find(n.kids, id, n); if (r) return r; }
  }
  return null;
}
function detach(tree, id) {
  const i = tree.findIndex((n) => n.id === id);
  if (i >= 0) return tree.splice(i, 1)[0];
  for (const n of tree) if (n.kids) { const r = detach(n.kids, id); if (r) return r; }
  return null;
}
const contains = (node, id) => node.id === id || (node.kids || []).some((k) => contains(k, id));
const pathOf = (tree, id) => { const r = find(tree, id); return r?.parent ? r.parent.name : "根目录"; };
const chainOf = (tree, id) => { const out = []; let r = find(tree, id); while (r?.parent) { out.unshift(r.parent.name); r = find(tree, r.parent.id); } return ["根目录", ...out]; };
const filesIn = (node) => (node.kids || []).flatMap((k) => (k.file ? [k.id] : filesIn(k)));
const daysAgo = (date) => Math.round((new Date() - new Date(`${date}T00:00:00`)) / 86400000);

// 健康检查：都是从目录树和文档信息直接看得出的问题；疑似重复由后端判断（dupOf）。
const STALE_DAYS = 180;
const ISSUES = [
  ["root", "未归类", "放在根目录，没进任何目录", "拖进一个目录，或用右侧「规则批量」整理"],
  ["unnamed", "未命名", "标题还是默认名", "改个名字（F2），或移到「99 待清理」"],
  ["dup", "疑似重复", "标题和正文与另一篇很像", "保留一份，另一份移到「99 待清理」"],
  ["stale", "半年未更新", `超过 ${STALE_DAYS} 天没改过`, "只是提醒：确认内容是否还有效"],
  ["empty", "空目录", "目录里没有文档", "同步不删除目录，确认没用后在飞书手动删"],
  ["error", "正文没读到", "这篇的正文读取失败或类型不支持，字数和摘要未知", "到飞书打开确认；不是空文档"],
];
function healthOf(tree, docs) {
  const map = new Map();
  const add = (id, k) => map.set(id, [...(map.get(id) || []), k]);
  const walk = (nodes, parent) => nodes.forEach((n) => {
    if (n.kids) { if (!n.kids.length && n.name !== "99 待清理") add(n.id, "empty"); walk(n.kids, n); return; }
    const d = docs[n.id] || {};
    if (d.error) add(n.id, "error");
    if (!parent) add(n.id, "root");
    if (/^未命名/.test(n.name)) add(n.id, "unnamed");
    if (d.dupOf) add(n.id, "dup");
    if (d.updated && daysAgo(d.updated) > STALE_DAYS) add(n.id, "stale");
  });
  walk(tree, null);
  return map;
}

function Mark({ text, q }) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

function Organizer({ initialKb, initialSel }) {
  const [kb, setKb] = useState(initialKb);
  const [tree, setTree] = useState(() => clone(initialKb.tree));
  const kbTree = kb.tree;
  const [history, setHistory] = useState([]);
  const [ops, setOps] = useState([]);
  const [sel, setSel] = useState(() => new Set(initialSel && find(initialKb.tree, initialSel) ? [initialSel] : []));
  const [open, setOpen] = useState(() => new Set(initialKb.tree.filter((n) => n.kids).map((n) => n.id)));
  const [renaming, setRenaming] = useState(null);
  const [clip, setClip] = useState(null);
  const [toast, showToast] = useToast();
  const flow = useWriteFlow();
  const preview = flow.phase !== "idle";
  const origin = useMemo(() => { const m = new Map(); const walk = (ns, p) => ns.forEach((n) => { m.set(n.id, p); n.kids && walk(n.kids, n.name); }); walk(kbTree, "根目录"); return m; }, [kbTree]);
  const [check, setCheck] = useState("");
  const syncBox = useRef(null);
  useEffect(() => { if (flow.phase !== "idle") syncBox.current?.scrollIntoView({ block: "nearest" }); }, [flow.phase]);
  const [observed, setObserved] = useState("");
  // 用飞书回读到的目录替换页面：暂存清空，以飞书为准。
  const refresh = (fresh) => { setKb(fresh); setTree(clone(fresh.tree)); setOps([]); setHistory([]); };
  const nameOf = (id) => (id === "" ? "根目录" : find(tree, id)?.node.name || find(kbTree, id)?.node.name || id);
  const previewSync = () => { setCheck(""); flow.preview(() => apiSend("POST", "/api/v3/kb/preview", { ops: toBackendOps(ops) })); };
  const confirmSync = () => flow.confirm(
    async (pv) => {
      rememberOp(pv.previewId);
      try { return await apiSend("POST", "/api/v3/kb/confirm", { previewId: pv.previewId, confirm: true }); }
      catch (e) {
        // 结果尚未核实时后端带 code = KB_RESULT_UNKNOWN 和操作编号；其余 409（如目录已变化）是预览失效。
        if (e.code === "KB_RESULT_UNKNOWN" && !e.receipt) e.receipt = { operationId: pv.previewId, status: "unknown" };
        throw e;
      }
    },
    async (receipt) => {
      const fresh = await apiSend("GET", "/api/v3/kb/tree");
      refresh(fresh);
      if (receipt.state === "verified") return true;
      return `只完成了 ${receipt.completed?.length || 0} / ${(receipt.completed?.length || 0) + (receipt.remaining?.length || 0)} 项（${receipt.state === "partial" ? "部分完成" : "没有执行"}）。页面已按飞书当前目录刷新；剩下的要重新暂存、预览`;
    },
  );
  // 结果不明：只读核对原操作记录，绝不重新发送写入。新建目录的响应丢了时，要你在飞书里看到新目录、填上它的节点 token 才能核对。
  async function reconcile(extra = {}) {
    const id = flow.receipt?.operationId || lastOp();
    if (!id) { setCheck("没有操作记录编号，无法自动核对；请到飞书目录人工检查。工作台不会重试。"); return; }
    setCheck("正在只读核对…");
    try {
      const r = await apiSend("POST", `/api/v3/kb/operations/${encodeURIComponent(id)}/reconcile`, extra);
      if (r.state === "preview") { setCheck("这条记录还没开始执行，不需要核对。"); flow.resolve(); return; }
      refresh(await apiSend("GET", "/api/v3/kb/tree"));
      flow.resolve();
      setCheck(r.state === "verified" ? `已核对：${r.completed.length} 项都已完成` : `已核对：完成 ${r.completed?.length || 0} 项，${r.remaining?.length || 0} 项没做（${r.state === "partial" ? "部分完成" : "没有执行"}）；剩下的要重新预览`);
    } catch (e) { setCheck(`仍未能核实：${e.message}。保持锁定，不会重试。`); }
  }
  const box = useRef(null);
  const docs = kb.docs || {};
  const [q, setQ] = useState("");
  const [issue, setIssue] = useState("");
  const [side, setSide] = useState("detail"); // 右栏页签：详情 / 规则批量 · 暂存明细
  const health = useMemo(() => healthOf(tree, docs), [tree, docs]);
  const issueCount = (k) => [...health.values()].filter((v) => v.includes(k)).length;
  const ql = q.trim().toLowerCase();
  const hitOf = (n) => {
    if (!ql) return "title";
    if (n.name.toLowerCase().includes(ql)) return "title";
    const d = docs[n.id];
    if (d?.tags?.some((t) => t.toLowerCase().includes(ql))) return "tag";
    if (d?.excerpt?.toLowerCase().includes(ql)) return "body";
    return null;
  };
  const filtering = Boolean(ql || issue);
  const shown = useMemo(() => {
    if (!filtering) return tree;
    const keep = (n) => hitOf(n) && (!issue || (health.get(n.id) || []).includes(issue));
    const filt = (nodes) => nodes.flatMap((n) => {
      if (n.kids) { const kids = filt(n.kids); return kids.length || keep(n) ? [{ ...n, kids }] : []; }
      return keep(n) ? [n] : [];
    });
    return filt(tree);
  }, [tree, ql, issue, health]);
  const hits = useMemo(() => { const c = (ns) => ns.reduce((a, n) => a + (n.kids ? c(n.kids) + (n.kids.length ? 0 : 1) : 1), 0); return c(shown); }, [shown]);

  const commit = (next, op) => { setHistory((h) => [...h, { tree, ops }]); setTree(next); setOps((o) => [...o, ...[].concat(op)]); };
  const undo = () => { const last = history.at(-1); if (!last) return; setTree(last.tree); setOps(last.ops); setHistory((h) => h.slice(0, -1)); showToast("已撤销上一步"); };
  const move = (ids, folderId) => {
    const next = clone(tree);
    const target = folderId ? find(next, folderId)?.node : null;
    const moved = [];
    for (const id of ids) {
      const hit = find(next, id);
      if (!hit || (target && contains(hit.node, folderId)) || hit.parent?.id === (folderId || undefined)) continue;
      const node = detach(next, id);
      (target ? (target.kids ||= []) : next).push(node);
      moved.push({ type: "move", id, name: node.name, from: hit.parent?.name || "根目录", to: target?.name || "根目录", parentId: folderId || "" });
    }
    if (moved.length) { commit(next, moved); if (folderId) setOpen((o) => new Set(o).add(folderId)); showToast(`已暂存：移动 ${moved.length} 项到「${target?.name || "根目录"}」`); }
  };
  const rename = (id, name) => {
    setRenaming(null);
    const next = clone(tree); const hit = find(next, id);
    if (!hit || !name.trim() || hit.node.name === name.trim()) return;
    const from = hit.node.name; hit.node.name = name.trim();
    commit(next, { type: "rename", id, name: name.trim(), from });
  };
  const mkdir = () => {
    const next = clone(tree); const id = `n${Date.now()}`;
    const target = [...sel].map((s) => find(next, s)?.node).find((n) => n && n.kids);
    const node = { id, name: "新建目录", kids: [], isNew: true };
    (target ? target.kids : next).push(node);
    commit(next, { type: "mkdir", id, name: node.name, to: target?.name || "根目录", parentId: target?.id || "" });
    setOpen((o) => new Set(o).add(id).add(target?.id)); setRenaming(id);
  };
  const toTrash = () => {
    let next = clone(tree);
    let trash = next.find((n) => n.name === "99 待清理");
    const extra = [];
    if (!trash) { trash = { id: `t${Date.now()}`, name: "99 待清理", kids: [], isNew: true }; next.push(trash); extra.push({ type: "mkdir", id: trash.id, name: trash.name, to: "根目录", parentId: "" }); }
    const moved = [];
    for (const id of sel) { const hit = find(next, id); if (!hit || hit.node === trash) continue; const node = detach(next, id); trash.kids.push(node); moved.push({ type: "move", id, name: node.name, from: hit.parent?.name || "根目录", to: trash.name, parentId: trash.id }); }
    if (moved.length) { commit(next, [...extra, ...moved]); setSel(new Set()); showToast(`已移到「99 待清理」${moved.length} 项，需要在飞书里手动删除`); }
  };
  const applyRules = () => {
    const next = clone(tree); const staged = [];
    const folderFor = (name) => { let f = next.find((n) => n.name === name); if (!f) { f = { id: `r${Date.now()}${staged.length}`, name, kids: [], isNew: true }; next.push(f); staged.push({ type: "mkdir", id: f.id, name, to: "根目录", parentId: "" }); } return f; };
    const files = []; const walk = (ns) => ns.forEach((n) => { if (n.file) files.push(n.id); if (n.kids) walk(n.kids); }); walk(next);
    for (const id of files) {
      const hit = find(next, id); const t = hit.node.name;
      const dest = /brief/i.test(t) ? "01 营销月档案" : /日志|Q&A/.test(t) ? "03 管培带教" : /^未命名/.test(t) ? "99 待清理" : /会议纪要/.test(t) ? "04 会议纪要" : null;
      if (!dest || hit.parent?.name === dest) continue;
      const f = folderFor(dest); const node = detach(next, id); f.kids.push(node);
      staged.push({ type: "move", id, name: node.name, from: hit.parent?.name || "根目录", to: dest, parentId: f.id });
    }
    if (staged.length) { commit(next, staged); setOpen(new Set(next.filter((n) => n.kids).map((n) => n.id))); showToast(`规则命中 ${staged.filter((o) => o.type === "move").length} 个文档，已暂存，可撤销`); }
  };

  useEffect(() => {
    const key = (e) => {
      if (!box.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      if (renaming || preview) return; // 预览或同步期间不改暂存
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return; // 在搜索框里打字时不触发树的快捷键
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === "n") { e.preventDefault(); mkdir(); }
      else if (mod && e.key.toLowerCase() === "x" && sel.size) { e.preventDefault(); setClip([...sel]); showToast(`已剪切 ${sel.size} 项，选中一个目录后 ⌘V 粘贴`); }
      else if (mod && e.key.toLowerCase() === "v" && clip) { e.preventDefault(); const t = [...sel].map((s) => find(tree, s)?.node).find((n) => n?.kids); move(clip, t?.id || null); setClip(null); }
      else if (e.key === "F2" && sel.size === 1) { e.preventDefault(); setRenaming([...sel][0]); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  useEffect(() => { if (sel.size) setSide("detail"); }, [sel]); // 点选了文档就回到详情
  const pick = (e, id) => {
    setSel((old) => { const s = new Set(e.metaKey || e.ctrlKey || e.shiftKey ? old : []); if (s.has(id) && (e.metaKey || e.ctrlKey)) s.delete(id); else s.add(id); return s; });
  };
  // 用渲染函数而不是在这里定义组件：内部定义的组件每次渲染都是新类型，点一下整棵树就重建，双击改名、拖动都会失效。
  const renderNode = (n, depth) => {
    const isOpen = filtering || open.has(n.id);
    const hit = hitOf(n);
    const probs = health.get(n.id) || [];
    const movedFrom = origin.get(n.id) && origin.get(n.id) !== pathOf(tree, n.id) ? origin.get(n.id) : null;
    const renamed = ops.find((o) => o.type === "rename" && o.id === n.id);
    return (
      <li key={n.id}>
        <div className={`kb-node${sel.has(n.id) ? " is-sel" : ""}${movedFrom ? " is-moved" : ""}${n.isNew ? " is-new" : ""}`} style={{ paddingLeft: 8 + depth * 18 }}
          draggable onDragStart={(e) => { e.dataTransfer.setData("text/plain", JSON.stringify(sel.has(n.id) ? [...sel] : [n.id])); }}
          onDragOver={(e) => { if (n.kids) { e.preventDefault(); e.currentTarget.classList.add("is-drop"); } }}
          onDragLeave={(e) => e.currentTarget.classList.remove("is-drop")}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("is-drop"); if (n.kids) move(JSON.parse(e.dataTransfer.getData("text/plain")), n.id); }}
          onClick={(e) => pick(e, n.id)} onDoubleClick={() => setRenaming(n.id)}>
          {n.kids ? <button type="button" className="kb-toggle" onClick={(e) => { e.stopPropagation(); setOpen((o) => { const s = new Set(o); s.has(n.id) ? s.delete(n.id) : s.add(n.id); return s; }); }} aria-label={isOpen ? "收起" : "展开"}><PixelIcon name={isOpen ? "down" : "right"} /></button> : <span className="kb-toggle" />}
          <PixelIcon name={n.kids ? "folder" : "file"} />
          {renaming === n.id ? <input className="kb-rename" autoFocus defaultValue={n.name} onClick={(e) => e.stopPropagation()} onBlur={(e) => rename(n.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") rename(n.id, e.target.value); if (e.key === "Escape") setRenaming(null); }} /> : <span className="kb-name"><Mark text={n.name} q={q.trim()} /></span>}
          {ql && hit === "tag" && <span className="kb-hit">标签命中</span>}
          {ql && hit === "body" && <span className="kb-hit">正文命中</span>}
          {probs.map((k) => <span key={k} className={`kb-issue is-${k}`}>{ISSUES.find(([key]) => key === k)[1]}</span>)}
          {n.isNew && <span className="kb-op">新建</span>}
          {renamed && <span className="kb-op">原名：{renamed.from}</span>}
          {movedFrom && <span className="kb-op is-move">← {movedFrom}</span>}
          {n.kids && <span className="tnum small muted kb-count">{n.kids.length}</span>}
        </div>
        {n.kids && isOpen && n.kids.length > 0 && <ul>{n.kids.map((k) => renderNode(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div ref={box}>
      <StatStrip items={[
        { label: "健康检查", value: health.size, unit: " 项待看", foot: "点右边一项，左侧只看这类" },
        ...ISSUES.map(([k, label, why]) => {
          const n = issueCount(k);
          return { label, value: n, foot: why, tone: n ? (k === "stale" ? "muted" : "warn") : "ok", active: issue === k, disabled: !n, onClick: () => setIssue(issue === k ? "" : k) };
        }),
      ]} />
      {(kb.sourceError || kb.limitations?.length > 0) && (
        <div className="warn kb-source-note"><PixelIcon name="alert" /><span>{kb.sourceError ? `${kb.sourceError}：读不到的文档字数和摘要未知，不算空文档，健康检查里标「正文没读到」。` : ""}{kb.limitations?.length ? `来源限制：${kb.limitations.join("；")}。` : ""}{kb.scopeNote ? ` ${kb.scopeNote}` : ""}</span></div>
      )}
      <div className="kb-layout cols-5-7">
      <section className="card kb-tree-card">
        <div className="card-head">
          <h2><PixelIcon name="kb" />{kb.space}</h2>
          <div className="row">
            <span className="small muted">读取于 {kb.readAt}</span>
          </div>
        </div>
        <div className="kb-actions">
          <Button onClick={mkdir}><PixelIcon name="folder" />新建目录</Button>
          <Button disabled={!sel.size} onClick={toTrash}><PixelIcon name="archive" />移到待清理</Button>
          <Button disabled={!history.length} onClick={undo}><PixelIcon name="left" />撤销</Button>
        </div>
        <div className="kb-search">
          <label className="search-box"><PixelIcon name="search" /><input placeholder="搜索标题、标签、正文摘要" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button type="button" className="icon-btn" onClick={() => setQ("")} aria-label="清除搜索"><PixelIcon name="close" /></button>}</label>
          {filtering && <span className="kb-filter-note small">{issue && <>只看「{ISSUES.find(([k]) => k === issue)[1]}」</>}{issue && ql && " · "}{ql && <>搜索「{q.trim()}」</>} · {hits} 项<button type="button" className="link-btn" onClick={() => { setQ(""); setIssue(""); }}>清除</button></span>}
          <span className="kb-keys" tabIndex={0}><kbd>⌘</kbd>快捷键
            <span className="kb-keys-pop small" role="tooltip">拖动到目录即可移动 · <kbd>⌘</kbd>/<kbd>⇧</kbd> 多选 · <kbd>⌘X</kbd> <kbd>⌘V</kbd> 剪切粘贴 · <kbd>F2</kbd> 或双击重命名 · <kbd>⌘⇧N</kbd> 新建目录 · <kbd>⌘Z</kbd> 撤销</span>
          </span>
        </div>
        <ul className="kb-tree" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { if (e.target.closest(".kb-node")) return; e.preventDefault(); move(JSON.parse(e.dataTransfer.getData("text/plain") || "[]"), null); }}>
          {shown.length ? shown.map((n) => renderNode(n, 0)) : <li className="kb-none small muted">没有符合条件的文档</li>}
        </ul>
        <div className={`kb-stage${ops.length ? " has-ops" : ""}`}>
          <span><b className="tnum">{ops.length}</b> 项暂存 · 同步前不改飞书</span>
          <span className="spacer" />
          <Button variant="primary" disabled={!ops.length || flow.busy || flow.phase === "unknown"} onClick={previewSync}><PixelIcon name="send" />预览并同步</Button>
        </div>
      </section>
      <div className="stack kb-side">
        <div className="kb-sync" ref={syncBox}>
          <WriteBox flow={flow} title="同步到飞书 · 预览" confirmLabel={`确认同步 ${flow.pv?.operations?.length || ops.length} 项`} savedText="已同步到飞书，逐项回读核对一致" onConfirm={confirmSync} onRepreview={previewSync} onReread={() => reconcile()}>
            {(pv) => (
              <>
                <dl className="kv">
                  <dt>知识空间</dt><dd>{kb.space}（{pv.spaceId}）</dd>
                  <dt>写入身份</dt><dd>固定的 codex 飞书用户身份；确认后执行前会再核对一次</dd>
                  <dt>说明</dt><dd>{pv.note}</dd>
                </dl>
                <table className="grid compact"><thead><tr><th>#</th><th>操作</th><th>内容</th></tr></thead>
                  <tbody>{pv.operations.map((o, i) => <tr key={i}><td className="tnum">{i + 1}</td><td>{{ move: "移动", rename: "重命名", mkdir: "新建目录" }[o.type]}</td>
                    <td>{o.type === "rename" ? <>「{o.before}」→「{o.name}」</> : o.type === "mkdir" ? <>「{o.name}」，放在「{nameOf(o.parentId)}」下</> : <>「{nameOf(o.id)}」：「{nameOf(o.before)}」→「{nameOf(o.parentId)}」</>}</td></tr>)}</tbody></table>
                <p className="small muted">移动和重命名后，飞书文档链接不变；「99 待清理」里的文档需要你在飞书手动删除。</p>
              </>
            )}
          </WriteBox>
          {flow.phase === "unknown" && (
            <div className="write-box is-unknown kb-observed">
              <span className="small">如果是「新建目录」的结果丢了：先在飞书里找到这个新目录，把它的节点 token 填在这里再核对。工作台不会按名字去猜。</span>
              <div className="row"><input className="kb-title" value={observed} onChange={(e) => setObserved(e.target.value.trim())} placeholder="飞书里看到的新目录节点 token" /><Button disabled={!observed} onClick={() => reconcile({ confirmObserved: true, nodeId: observed })}>我已在飞书核对，提交核对</Button></div>
            </div>
          )}
          {check && <p className={`small ${/仍未能|无法/.test(check) ? "warn-text" : "muted"}`}>{check}</p>}
        </div>
        <Segmented options={[["detail", "详情"], ["ops", `规则批量 · 暂存明细${ops.length ? ` ${ops.length}` : ""}`]]} value={side} onChange={setSide} />
        {side === "detail" ? <Detail tree={tree} docs={docs} health={health} sel={sel} setSel={setSel} onRename={setRenaming} onTrash={toTrash} showToast={showToast} /> : <>
        <section className="card">
          <div className="card-head"><h2><PixelIcon name="filter" />规则批量</h2></div>
          <div className="card-body stack-sm">
            <p className="small muted">按标题把一批文档放进固定目录。命中结果先进暂存，可以撤销。</p>
            <table className="grid compact"><tbody>{kb.rules.map(([r, d]) => <tr key={r}><td className="small">{r}</td><td className="small">→ {d}</td></tr>)}</tbody></table>
            <Button onClick={applyRules}><PixelIcon name="spark" />按规则整理</Button>
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2><PixelIcon name="clock" />暂存明细</h2><span className="tnum small muted">{ops.length}</span></div>
          <ol className="list kb-ops">{ops.length ? ops.map((o, i) => <li key={i} className="small"><span className="kb-op-type">{{ move: "移动", rename: "重命名", mkdir: "新建" }[o.type]}</span><span>{o.type === "rename" ? `${o.from} → ${o.name}` : o.type === "mkdir" ? `${o.name}（在 ${o.to}）` : `${o.name}：${o.from} → ${o.to}`}</span></li>) : <li className="small muted">还没有改动</li>}</ol>
        </section>
        </>}
      </div>
      </div>
      {toast}
    </div>
  );
}

// 详情面板：选中一个文档看它在哪、多久没改、标签、摘要、被谁引用和健康提示；选中目录看目录概况；多选看批量操作。
function Detail({ tree, docs, health, sel, setSel, onRename, onTrash, showToast }) {
  const ids = [...sel];
  if (!ids.length) return <section className="card kb-detail"><div className="card-head"><h2><PixelIcon name="eye" />详情</h2></div><div className="kb-detail-empty small muted">点选左侧一个文档或目录，这里显示详情。<br />按住 <kbd>⌘</kbd> 可多选。</div></section>;
  if (ids.length > 1) {
    return (
      <section className="card kb-detail">
        <div className="card-head"><h2><PixelIcon name="eye" />已选 {ids.length} 项</h2><button type="button" className="link-btn" onClick={() => setSel(new Set())}>取消选择</button></div>
        <div className="card-body stack-sm">
          <ul className="list small">{ids.map((id) => { const n = find(tree, id)?.node; return n ? <li key={id}><PixelIcon name={n.kids ? "folder" : "file"} />{n.name}</li> : null; })}</ul>
          <p className="small muted">拖到一个目录即可一起移动，或 <kbd>⌘X</kbd> 后选中目录 <kbd>⌘V</kbd>。</p>
          <Button onClick={onTrash}><PixelIcon name="archive" />一起移到待清理</Button>
        </div>
      </section>
    );
  }
  const hit = find(tree, ids[0]);
  if (!hit) return null;
  const n = hit.node;
  const chain = chainOf(tree, n.id).join(" / ");
  const probs = (health.get(n.id) || []).map((k) => ISSUES.find(([key]) => key === k));
  if (n.kids) {
    const files = filesIn(n);
    const latest = files.map((id) => docs[id]?.updated).filter(Boolean).sort().at(-1);
    const inner = files.filter((id) => (health.get(id) || []).length).length;
    return (
      <section className="card kb-detail">
        <div className="card-head"><h2><PixelIcon name="folder" />{n.name}</h2><span className="small muted">目录</span></div>
        <div className="card-body stack-sm">
          <dl className="kv"><dt>位置</dt><dd>{chain}</dd><dt>文档</dt><dd className="tnum">{files.length} 篇 · 子目录 {n.kids.filter((k) => k.kids).length} 个</dd><dt>最近更新</dt><dd className="tnum">{latest ? `${latest}（${daysAgo(latest)} 天前）` : "—"}</dd><dt>有问题</dt><dd>{inner ? <span className="warn-text">{inner} 篇</span> : "无"}</dd></dl>
          {probs.map(([k, label, why, tip]) => <div key={k} className="kb-tip"><strong>{label}</strong><span>{why}。{tip}</span></div>)}
          {docs[n.id] && <DocBody d={docs[n.id]} title="这个目录本身也是一篇文档" />}
          <div className="row"><Button disabled={!files.length} onClick={() => setSel(new Set(files))}><PixelIcon name="check" />选中目录内全部文档</Button><Button onClick={() => onRename(n.id)}><PixelIcon name="edit" />重命名</Button></div>
        </div>
      </section>
    );
  }
  const d = docs[n.id] || {};
  const dup = d.dupOf ? find(tree, d.dupOf)?.node : null;
  return (
    <section className="card kb-detail">
      <div className="card-head"><h2><PixelIcon name="file" />{n.name}</h2>{d.url ? <a className="link" href={d.url} target="_blank" rel="noreferrer"><PixelIcon name="external" />飞书打开</a> : <span className="small muted">没有链接</span>}</div>
      <div className="card-body stack-sm">
        <dl className="kv">
          <dt>位置</dt><dd>{chain}</dd>
          <dt>更新</dt><dd className="tnum">{d.updated ? <>{d.updated}<span className={daysAgo(d.updated) > STALE_DAYS ? " warn-text" : " muted"}>（{daysAgo(d.updated)} 天前）</span></> : "—"}</dd>
          <dt>字数</dt><dd className="tnum">{d.chars != null ? d.chars.toLocaleString("en-US") : <span className="muted">未知</span>}{d.chars === 0 && !d.error && <span className="warn-text"> · 空文档</span>}</dd>
          {d.type && <><dt>类型</dt><dd>{d.type}</dd></>}
          <dt>标签</dt><dd>{d.tags?.length ? <span className="tag-row">{d.tags.map((t) => <Tag key={t}>{t}</Tag>)}</span> : <span className="muted">无</span>}</dd>
        </dl>
        {probs.map(([k, label, why, tip]) => (
          <div key={k} className={`kb-tip is-${k}`}>
            <strong>{label}</strong>
            <span>{k === "dup" && dup ? <>与「{dup.name}」很像（在 {chainOf(tree, dup.id).slice(1).join(" / ") || "根目录"}）。</> : `${why}。`}{tip}</span>
            {k === "dup" && dup && <button type="button" className="link-btn" onClick={() => setSel(new Set([dup.id]))}>看另一篇</button>}
          </div>
        ))}
        {d.error && <div className="kb-tip is-error"><strong>正文没读到</strong><span>{d.error}。字数和摘要未知，不是空文档。</span></div>}
        <div className="label">正文摘要</div>
        {d.excerpt ? <p className="kb-excerpt">{d.excerpt}</p> : <p className="small muted">{d.error ? "读取失败，没有摘要" : d.chars === 0 ? "空文档" : "没有摘要"}</p>}
        <div className="label">被谁引用 · {d.refs?.length || 0}</div>
        {d.refs?.length ? <ul className="list small">{d.refs.map((r) => <li key={r}><PixelIcon name="link" />{r}</li>)}</ul> : <p className="small muted">{d.referencesComplete === false ? "工作台只核对已登记的来源；没登记不等于没有引用。" : "没有被 Agent 或页面引用。"}</p>}
        <div className="row"><Button onClick={() => onRename(n.id)}><PixelIcon name="edit" />重命名</Button><Button onClick={onTrash}><PixelIcon name="archive" />移到待清理</Button></div>
      </div>
    </section>
  );
}

// 目录节点本身也可能是一篇有正文的文档：在目录详情里一起显示它的正文信息。
function DocBody({ d, title }) {
  return (
    <div className="kb-dir-doc">
      <div className="label">{title}</div>
      <dl className="kv">
        <dt>更新</dt><dd className="tnum">{d.updated || "—"}</dd>
        <dt>字数</dt><dd className="tnum">{d.chars != null ? d.chars.toLocaleString("en-US") : <span className="muted">未知</span>}</dd>
        {d.url && <><dt>链接</dt><dd><a className="link" href={d.url} target="_blank" rel="noreferrer">飞书打开</a></dd></>}
      </dl>
      {d.error ? <p className="small warn-text">正文没读到：{d.error}</p> : d.excerpt ? <p className="kb-excerpt">{d.excerpt}</p> : <p className="small muted">没有摘要</p>}
    </div>
  );
}
