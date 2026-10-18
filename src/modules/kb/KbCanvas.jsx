import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button, Loadable, Modal } from "../../ui/components.jsx";
import { ROOT, applyOps, canvasModel, countDocs, fromReceipt, keepOrder, locate, pose, remapOp, reorder } from "./kb-canvas.js";
import { CollectRecent } from "./CollectPage.jsx";

// 知识库画布 · 档案夹（用户 2026-10-18 从三版草稿里选定 B，草稿见 docs/design/kb-canvas/）：
// - 一级目录是一个文件夹：组名写在黑色页签上，夹子里露出前两篇的标题，底部写篇数和最近更新。一行放满为止。
// - 点文件夹，在这一行下面拉出整行抽屉（箭头指向被打开的文件夹），里面是横版卡片；子目录是文件夹卡，可以逐层进入。
// - 根目录下没进任何分组的文档是散卡，排在最上面一条（收藏时归类不明确的也在这）。
// - 拖卡片到文件夹 / 抽屉 / 散卡条 = 在飞书里移动；新建分组 = 在飞书根目录新建目录；页签改名 = 飞书改名。
//   拖完就写飞书（用户确认，不走预览）：本地先显示，后台按顺序一项一项提交，每项回读核对；失败退回；
//   结果不明就锁住画布，只能只读核对，绝不重发。
// - 拖页签给分组排序：只存本机（飞书不支持调同级顺序）。

const TYPE = { docx: "DOC", doc: "DOC", sheet: "SHT", bitable: "BASE", file: "FILE", slides: "PPT", mindnote: "MIND" };
const TYPE_ZH = { docx: "文档", doc: "旧文档", sheet: "表格", bitable: "多维表", file: "文件", slides: "幻灯片", mindnote: "思维笔记" };
const FOLDER_MIN = 240, GAP = 26;
const PATTERNS = ["var(--dither-1)", "var(--dither-2)", "var(--dither-3)"];
const patternOf = (id) => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.codePointAt(0)) >>> 0; return PATTERNS[h % PATTERNS.length]; };

export default function KbCanvas() {
  const tree = useApi("/api/v3/kb/tree");
  const layout = useApi("/api/v3/kb/layout");
  const settings = useApi("/api/v3/settings");
  const ruleIds = useMemo(() => { try { return JSON.parse(settings.data?.values?.kb_collect_rules || "[]").map((r) => r.nodeToken); } catch { return []; } }, [settings.data]);
  return (
    <Loadable state={tree} name="知识库目录" big>
      {(kb) => <Canvas key={kb.readAt} kb={kb} initialOrder={layout.data?.order || []} ruleIds={ruleIds} reload={tree.reload} />}
    </Loadable>
  );
}

// 画布宽度能放几个文件夹（抽屉要插在这一行后面）。
function useColumns(ref) {
  const [cols, setCols] = useState(4);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const fit = () => setCols(Math.max(1, Math.floor((el.clientWidth + GAP) / (FOLDER_MIN + GAP))));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return cols;
}

function Canvas({ kb, initialOrder, ruleIds, reload }) {
  const docs = kb.docs || {};
  const [base, setBase] = useState(kb.tree);            // 飞书最近一次回读到的目录
  const [queue, setQueue] = useState([]);               // 待写入飞书的变更：{ key, op, label }
  const [running, setRunning] = useState(null);         // 正在写的那一项
  const [lock, setLock] = useState(null);               // 结果不明：{ error, operationId, label }
  const [note, setNote] = useState(null);               // 最近一条结果：{ tone, text }
  const [order, setOrder] = useState(initialOrder);
  const [open, setOpen] = useState(null);               // 拉开抽屉的分组 id
  const [path, setPath] = useState([]);                 // 抽屉里逐层进入的子目录 id
  const [drag, setDrag] = useState(null);               // { kind: "card" | "group", id }
  const [over, setOver] = useState(null);               // 拖到哪个目标上
  const [q, setQ] = useState("");
  const [naming, setNaming] = useState(null);           // { id | "new", value }
  const [recentOpen, setRecentOpen] = useState(false);
  const recent = useApi("/api/v3/kb/collect/recent");
  const gridRef = useRef(null), drawerRef = useRef(null);
  const cols = useColumns(gridRef);
  const ops = useMemo(() => [...(running ? [running] : []), ...queue].map((x) => x.op), [running, queue]);
  const shown = useMemo(() => applyOps(base, ops), [base, ops]);
  const model = useMemo(() => canvasModel(shown, { ruleIds, order }), [shown, ruleIds, order]);
  const busyIds = useMemo(() => new Set(ops.map((o) => o.id)), [ops]);
  const ql = q.trim().toLowerCase();
  const hit = (n) => !ql || n.name.toLowerCase().includes(ql) || (docs[n.id]?.excerpt || "").toLowerCase().includes(ql);
  const hits = (n) => (n.kids ? n.kids.reduce((s, k) => s + hits(k), 0) : hit(n) ? 1 : 0);
  const latest = (n) => (n.kids ? n.kids.reduce((m, k) => { const v = latest(k); return v > m ? v : m; }, "") : docs[n.id]?.updated || "");
  const unknownCount = (recent.data?.items || []).filter((x) => x.status === "unknown").length;

  // 队列：一次只写一项；写完回读，以飞书为准再写下一项。
  useEffect(() => {
    if (running || lock || !queue.length) return;
    const [item, ...rest] = queue;
    setRunning(item); setQueue(rest);
    (async () => {
      try {
        const r = await apiSend("POST", "/api/v3/kb/quick", { ops: [item.op] });
        if (r.state !== "verified") throw Object.assign(new Error("飞书没有执行这项变更"), { status: 409 });
        setBase((b) => keepOrder(fromReceipt(r.tree), b));
        if (r.created && Object.keys(r.created).length) {
          setQueue((qs) => qs.map((x) => ({ ...x, op: remapOp(x.op, r.created) })));
          setOrder((o) => { const next = o.map((id) => r.created[id] || id); saveOrder(next); return next; });
          setOpen((id) => r.created[id] || id);
        }
        setNote({ tone: "ok", text: `${item.label}：已写入飞书，回读一致` });
      } catch (e) {
        // 结果不明（后端带操作编号，或请求中断没有回应）：锁住，只读核对。其余是没有执行：本地退回。
        if (e.code === "KB_RESULT_UNKNOWN" || !e.status || e.status >= 500) {
          setLock({ error: e.message, operationId: e.receipt?.operationId || "", label: item.label });
          setQueue((qs) => [item, ...qs]); // 先挂着，核对后按飞书实际情况决定
        } else setNote({ tone: "error", text: `${item.label}：没有写入，已退回。${e.message}` });
      } finally { setRunning(null); }
    })();
  }, [queue, running, lock]);

  function push(op, label) {
    if (lock) return;
    setQueue((qs) => [...qs, { key: `${Date.now()}-${Math.random()}`, op, label }]);
  }
  function saveOrder(next) { apiSend("PUT", "/api/v3/kb/layout", { order: next }).catch(() => setNote({ tone: "error", text: "分组顺序没保存到本机，刷新后会恢复原顺序" })); }

  async function reconcile() {
    if (!lock?.operationId) { setLock(null); setQueue([]); setNote({ tone: "warn", text: "没有操作编号：已按飞书重新读取目录；后续变更暂停，请核对后重新拖动" }); reload(); return; }
    setNote({ tone: "warn", text: "正在只读核对…" });
    try {
      const r = await apiSend("POST", `/api/v3/kb/operations/${encodeURIComponent(lock.operationId)}/reconcile`, {});
      if (r.tree) setBase((b) => keepOrder(fromReceipt(r.tree), b));
      setQueue((qs) => qs.slice(1)); // 挂着的那一项已按飞书实际情况落定，不重发
      setLock(null);
      setNote({ tone: r.state === "verified" ? "ok" : "warn", text: r.state === "verified" ? `已核对：${lock.label} 已在飞书完成` : `已核对：${lock.label} 没有完成，画布已按飞书刷新` });
    } catch (e) { setNote({ tone: "error", text: `仍未能核实：${e.message}。保持锁定，不会重试。` }); }
  }

  function openGroup(id) {
    setOpen((cur) => (cur === id ? null : id)); setPath([]);
  }
  useEffect(() => { if (open) drawerRef.current?.scrollIntoView({ block: "nearest" }); }, [open]);

  // ---- 拖放 ----
  const dragProps = (kind, id) => ({
    draggable: !lock,
    onDragStart: (e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); setDrag({ kind, id }); },
    onDragEnd: () => { setDrag(null); setOver(null); },
  });
  const nameOf = (id) => (id === ROOT ? "散卡" : locate(shown, id)?.node.name || "目录");
  const moveTo = (parentId) => {
    if (!drag || drag.kind !== "card") return;
    const here = locate(shown, drag.id);
    if (!here || here.parentId === parentId || drag.id === parentId || (here.node.kids && locate(here.node.kids, parentId))) return;
    push({ type: "move", id: drag.id, parentId }, `「${here.node.name}」移到「${nameOf(parentId)}」`);
  };
  const dropZone = (key, onDrop, accept = "card") => ({
    onDragOver: (e) => { if (drag?.kind === accept) { e.preventDefault(); e.stopPropagation(); if (over !== key) setOver(key); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o === key ? null : o)); },
    onDrop: (e) => { if (drag?.kind !== accept) return; e.preventDefault(); e.stopPropagation(); onDrop(); setDrag(null); setOver(null); },
  });
  const folderDrop = (g) => (drag?.kind === "group"
    ? dropZone(`tab:${g.id}`, () => { const next = reorder(model.groups.map((x) => x.id), drag.id, g.id); setOrder(next); saveOrder(next); }, "group")
    : dropZone(`group:${g.id}`, () => moveTo(g.id)));

  // ---- 新建 / 改名 ----
  function commitName() {
    const name = naming?.value.trim();
    if (!name) { setNaming(null); return; }
    if (naming.id === "new") {
      const id = `g${Date.now().toString(36)}`;
      push({ type: "mkdir", id, name, parentId: ROOT }, `新建分组「${name}」`);
      setOrder([...model.groups.map((g) => g.id), id]); // 临时 id 不存；飞书建好换成真实 id 后再存
    } else {
      const n = locate(shown, naming.id)?.node;
      if (n && n.name !== name) push({ type: "rename", id: naming.id, name }, `「${n.name}」改名为「${name}」`);
    }
    setNaming(null);
  }
  const nameInput = (label) => (
    <input className="kbf-name-input" autoFocus aria-label={label} value={naming.value} maxLength={200}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setNaming({ ...naming, value: e.target.value })}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) commitName(); if (e.key === "Escape") setNaming(null); }}
      onBlur={commitName} />
  );

  // ---- 横版卡：左侧网点小封面 + 标题 + 类型日期 ----
  const card = (n) => {
    const d = docs[n.id] || {};
    const cls = `kbf-card${n.kids ? " is-folder" : ""}${ql && !n.kids && !hit(n) ? " is-dim" : ""}${busyIds.has(n.id) ? " is-busy" : ""}${drag?.id === n.id ? " is-dragging" : ""}${over === `group:${n.id}` ? " is-over" : ""}`;
    const cover = <span className="kbf-cover" style={n.kids ? undefined : { backgroundImage: patternOf(n.id) }}>{d.shortcut && <i className="kbf-sc">快捷</i>}<b>{n.kids ? "DIR" : TYPE[d.type] || "DOC"}</b></span>;
    const foot = <span className="kbf-meta"><span className="tnum">{n.kids ? `${countDocs(n)} 篇` : `${TYPE_ZH[d.type] || "文档"} · ${d.updated?.slice(5) || "—"}`}</span>{busyIds.has(n.id) ? <span className="kbf-sync">同步中</span> : !n.kids && d.url ? <PixelIcon name="external" /> : null}</span>;
    if (n.kids) return (
      <div key={n.id} className={cls} {...dragProps("card", n.id)} {...dropZone(`group:${n.id}`, () => moveTo(n.id))}>
        <button type="button" className="kbf-card-hit" onClick={() => setPath((p) => [...p, n.id])} aria-label={`进入文件夹：${n.name}`}>{cover}<span className="kbf-card-body"><strong>{n.name}</strong>{foot}</span></button>
      </div>
    );
    return (
      <div key={n.id} className={cls} {...dragProps("card", n.id)}>
        <a className="kbf-card-hit" href={d.url || undefined} target="_blank" rel="noreferrer" title={d.excerpt || n.name} onClick={(e) => { if (!d.url) e.preventDefault(); }}>{cover}<span className="kbf-card-body"><strong>{n.name}</strong>{foot}</span></a>
      </div>
    );
  };

  // ---- 文件夹 ----
  const folder = (g, i) => {
    const kids = g.kids || [], n = g.kids ? countDocs(g) : 0, h = ql ? hits(g) : 0, isOpen = open === g.id, editing = naming?.id === g.id;
    const cls = `kbf-folder${isOpen ? " is-open" : ""}${over === `group:${g.id}` ? " is-over" : ""}${over === `tab:${g.id}` ? " is-over-tab" : ""}${ql && !h ? " is-dim" : ""}`;
    const peeks = kids.slice(0, 2);
    return (
      <div key={g.id} className={cls} style={{ "--col": i % cols }} {...folderDrop(g)}>
        <div className="kbf-tab" {...(editing ? {} : dragProps("group", g.id))} title="拖动排序">
          {editing ? nameInput("分组名称") : <>
            <button type="button" className="kbf-tab-name" onClick={() => openGroup(g.id)} aria-expanded={isOpen}><strong>{g.name}</strong><i className="tnum">{n}</i></button>
            <button type="button" className="kbf-tab-edit" title="改名（写入飞书）" aria-label={`改名：${g.name}`} disabled={!!lock} onClick={() => setNaming({ id: g.id, value: g.name })}><PixelIcon name="edit" /></button>
          </>}
        </div>
        <button type="button" className="kbf-case" onClick={() => openGroup(g.id)} aria-label={`${isOpen ? "收起" : "打开"}分组：${g.name}`}>
          {peeks.length ? peeks.map((k, j) => (
            <span key={k.id} className={`kbf-peek${k.kids ? " is-folder" : ""}`} style={{ top: 14 + j * 26, transform: `rotate(${pose(k.id, 1)[0] / 5}deg)`, zIndex: j }}>
              <strong>{k.name}</strong>
              <span className="kbf-meta"><span>{k.kids ? `文件夹 · ${countDocs(k)} 篇` : TYPE_ZH[docs[k.id]?.type] || "文档"}</span><span className="tnum">{(k.kids ? latest(k) : docs[k.id]?.updated)?.slice(5) || ""}</span></span>
            </span>
          )) : <span className="kbf-peek is-empty" style={{ top: 22 }}><strong>空文件夹 · 把文档拖进来</strong></span>}
          <span className="kbf-lip"><span className="tnum">{n} 篇{h ? ` · 命中 ${h}` : ""}</span><span className="tnum">更新 {(g.kids ? latest(g).slice(5) : "") || "—"}</span></span>
        </button>
      </div>
    );
  };

  const drawer = (g, col) => {
    let dir = g; const trail = [g];
    for (const id of path) { const f = dir.kids?.find((k) => k.id === id); if (!f) break; dir = f; trail.push(f); }
    const kids = dir.kids || [];
    const sorted = [...kids.filter((k) => k.kids), ...kids.filter((k) => !k.kids)];
    return (
      <div key={`drawer-${g.id}`} ref={drawerRef} className={`kbf-drawer${over === `group:${dir.id}` ? " is-over" : ""}`}
        style={{ "--notch": `calc(${col} * (100% + ${GAP}px) / ${cols} + 48px)` }} {...dropZone(`group:${dir.id}`, () => moveTo(dir.id))}>
        <div className="kbf-drawer-head">
          <h3>{trail.map((f, i) => <span key={f.id}>{i > 0 && <PixelIcon name="right" />}{i < trail.length - 1 ? <button type="button" className="link-btn" onClick={() => setPath(path.slice(0, i))}>{f.name}</button> : f.name}</span>)}</h3>
          <span className="small muted tnum">{countDocs(dir)} 篇 · 文件夹在前 · 把卡片拖到别的文件夹或散卡条就是移动</span>
          <span className="spacer" />
          <Button disabled={!!lock} onClick={() => setNaming({ id: g.id, value: g.name })}><PixelIcon name="edit" />改名</Button>
          <Button onClick={() => { setOpen(null); setPath([]); }}><PixelIcon name="up" />收起</Button>
        </div>
        <div className="kbf-drawer-grid">{sorted.length ? sorted.map(card) : <p className="kbf-empty">这个{trail.length > 1 ? "文件夹" : "分组"}还是空的，把文档拖进来</p>}</div>
      </div>
    );
  };

  // 文件夹按行排，被打开的那一行后面插抽屉。
  const cells = [];
  model.groups.forEach((g, i) => {
    cells.push(folder(g, i));
    const rowEnd = i % cols === cols - 1 || i === model.groups.length - 1;
    if (rowEnd) {
      const start = i - (i % cols), at = model.groups.slice(start, i + 1).findIndex((x) => x.id === open);
      if (at >= 0) cells.push(drawer(model.groups[start + at], at));
    }
  });
  if (naming?.id === "new") cells.push(
    <div key="new" className="kbf-folder is-new">
      <div className="kbf-tab">{nameInput("新分组名称")}</div>
      <div className="kbf-case"><span className="kbf-peek is-empty" style={{ top: 22 }}><strong>回车后在飞书根目录新建这个目录</strong></span><span className="kbf-lip"><span>0 篇</span></span></div>
    </div>,
  );

  const total = model.groups.reduce((s, g) => s + (g.kids ? countDocs(g) : 0), 0) + model.loose.length;
  const pending = ops.length;

  return (
    <section className="kbf" aria-label="知识库画布">
      <div className="kbf-bar">
        <button type="button" className={`kbf-chip${open ? "" : " is-on"}`} onClick={() => { setOpen(null); setPath([]); }}>全部 <i className="tnum">{total}</i></button>
        {model.groups.map((g) => <button key={g.id} type="button" className={`kbf-chip${open === g.id ? " is-on" : ""}`} onClick={() => openGroup(g.id)}>{g.name} <i className="tnum">{g.kids ? countDocs(g) : 0}</i></button>)}
        <button type="button" className="kbf-chip is-add" disabled={!!lock || !!naming} onClick={() => setNaming({ id: "new", value: "" })}><PixelIcon name="plus" />分组</button>
        <span className="spacer" />
        <label className="search-box kbf-search"><PixelIcon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`搜 ${total} 篇的标题或摘要`} aria-label="搜索知识库" /></label>
        <Button onClick={() => setRecentOpen(true)}><PixelIcon name="clock" />最近收藏{unknownCount > 0 && <span className="kbf-badge tnum">{unknownCount}</span>}</Button>
        <Button disabled={!!lock || pending > 0} onClick={reload} title="按飞书重新读取（约 20 秒）"><PixelIcon name="refresh" />刷新</Button>
      </div>
      {pending > 0 && !lock && <div className="kbf-syncing"><StepProgress label={`正在写入飞书 · 还剩 ${pending} 项`} /></div>}
      {lock && <div className="write-box is-unknown" role="alert">
        <div className="write-head"><PixelIcon name="alert" /><strong>结果不明，画布已锁住</strong></div>
        <p className="write-msg">{lock.label}：{lock.error}。不会自动重发；先只读核对飞书里实际有没有改成，再继续。</p>
        <div className="write-actions"><Button variant="primary" onClick={reconcile}><PixelIcon name="refresh" />只读核对</Button></div>
      </div>}
      {note && !lock && <p className={`kbf-note is-${note.tone}`} role="status"><PixelIcon name={note.tone === "ok" ? "check" : "alert"} />{note.text}<button type="button" className="icon-btn" aria-label="关闭" onClick={() => setNote(null)}><PixelIcon name="close" /></button></p>}

      <div className="kbf-board" data-dragging={drag?.kind || undefined}>
        <div className={`kbf-loose${over === "loose" ? " is-over" : ""}`} {...dropZone("loose", () => moveTo(ROOT))}>
          <span className="kbf-loose-label"><b className="tnum">散卡 {model.loose.length}</b>收藏时归类不明确的放这里</span>
          <div className="kbf-loose-cards">{model.loose.length ? model.loose.map(card) : <p className="kbf-empty">没有散卡，文档都在分组里</p>}</div>
          {model.loose.length > 0 && <span className="kbf-loose-hint"><PixelIcon name="down" />拖进下面的文件夹</span>}
        </div>
        <div className="kbf-grid" ref={gridRef} style={{ "--cols": cols }}>{cells}</div>
      </div>

      <Modal open={recentOpen} onClose={() => setRecentOpen(false)} icon="clock" title="最近收藏">
        <CollectRecent bare onVerified={() => { recent.reload(); reload(); }} />
      </Modal>
    </section>
  );
}
