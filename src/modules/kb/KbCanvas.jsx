import { useEffect, useMemo, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button, Loadable } from "../../ui/components.jsx";
import { ROOT, applyOps, canvasModel, countDocs, fromReceipt, locate, pose, remapOp, reorder } from "./kb-canvas.js";
import { CollectRecent } from "./CollectPage.jsx";

// 知识库画布（用户 2026-10-18，复刻数码宝贝「个人收藏」的桌面，换成位图风）：
// - 一级目录是分组：折叠时是一叠纸 + 下方铭牌；点铭牌或纸堆就地展开成网格，子目录是文件夹卡，可以逐层进入。
// - 根目录下没进任何分组的文档是散卡，排在画布顶部（收藏时归类不明确的也在这）。
// - 拖卡片到分组 / 文件夹 / 散卡区 = 在飞书里移动；新建分组 = 在飞书根目录新建目录；改名 = 飞书改名。
//   拖完就写飞书（用户确认，不走预览）：本地先显示，后台按顺序一项一项提交，每项回读核对；失败退回；
//   结果不明就锁住画布，只能只读核对，绝不重发。
// - 拖铭牌给分组排序：只存本机（飞书不支持调同级顺序）。

const TYPE = { docx: "文档", doc: "旧文档", sheet: "表格", bitable: "多维表", file: "文件", slides: "幻灯片", mindnote: "思维笔记" };
const MAX_STACK = 4;

export default function KbCanvas() {
  const tree = useApi("/api/v3/kb/tree");
  const layout = useApi("/api/v3/kb/layout");
  const settings = useApi("/api/v3/settings");
  const ruleIds = useMemo(() => { try { return JSON.parse(settings.data?.values?.kb_collect_rules || "[]").map((r) => r.nodeToken); } catch { return []; } }, [settings.data]);
  return (
    <div className="kbc">
      <Loadable state={tree} name="知识库目录" big>
        {(kb) => <Canvas key={kb.readAt} kb={kb} initialOrder={layout.data?.order || []} ruleIds={ruleIds} reload={tree.reload} />}
      </Loadable>
      <aside className="kbc-side"><CollectRecent onVerified={tree.reload} /></aside>
    </div>
  );
}

function Canvas({ kb, initialOrder, ruleIds, reload }) {
  const docs = kb.docs || {};
  const [base, setBase] = useState(kb.tree);            // 飞书最近一次回读到的目录
  const [queue, setQueue] = useState([]);               // 待写入飞书的变更：{ key, op, label }
  const [running, setRunning] = useState(null);         // 正在写的那一项
  const [lock, setLock] = useState(null);               // 结果不明：{ error, operationId }
  const [note, setNote] = useState(null);               // 最近一条结果：{ tone, text }
  const [order, setOrder] = useState(initialOrder);
  const [open, setOpen] = useState(null);               // 展开的分组 id
  const [path, setPath] = useState([]);                 // 展开分组里逐层进入的文件夹 id
  const [drag, setDrag] = useState(null);               // { kind: "card" | "group", id }
  const [over, setOver] = useState(null);               // 拖到哪个目标上
  const [q, setQ] = useState("");
  const [naming, setNaming] = useState(null);           // { id | "new", value }
  const ops = useMemo(() => [...(running ? [running] : []), ...queue].map((x) => x.op), [running, queue]);
  const shown = useMemo(() => applyOps(base, ops), [base, ops]);
  const model = useMemo(() => canvasModel(shown, { ruleIds, order }), [shown, ruleIds, order]);
  const busyIds = useMemo(() => new Set(ops.map((o) => o.id)), [ops]);
  const ql = q.trim().toLowerCase();
  const hit = (n) => !ql || n.name.toLowerCase().includes(ql) || (docs[n.id]?.excerpt || "").toLowerCase().includes(ql);
  const hits = (n) => (n.kids ? n.kids.reduce((s, k) => s + hits(k), 0) : hit(n) ? 1 : 0);

  // 队列：一次只写一项；写完回读，以飞书为准再写下一项。
  useEffect(() => {
    if (running || lock || !queue.length) return;
    const [item, ...rest] = queue;
    setRunning(item); setQueue(rest);
    (async () => {
      try {
        const r = await apiSend("POST", "/api/v3/kb/quick", { ops: [item.op] });
        if (r.state !== "verified") throw Object.assign(new Error("飞书没有执行这项变更"), { status: 409 });
        setBase(fromReceipt(r.tree));
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
      if (r.tree) setBase(fromReceipt(r.tree));
      setQueue((qs) => qs.slice(1)); // 挂着的那一项已按飞书实际情况落定，不重发
      setLock(null);
      setNote({ tone: r.state === "verified" ? "ok" : "warn", text: r.state === "verified" ? `已核对：${lock.label} 已在飞书完成` : `已核对：${lock.label} 没有完成，画布已按飞书刷新` });
    } catch (e) { setNote({ tone: "error", text: `仍未能核实：${e.message}。保持锁定，不会重试。` }); }
  }

  // ---- 拖放 ----
  const dragProps = (kind, id) => ({
    draggable: !lock,
    onDragStart: (e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); setDrag({ kind, id }); },
    onDragEnd: () => { setDrag(null); setOver(null); },
  });
  const nameOf = (id) => (id === ROOT ? "散卡区" : locate(shown, id)?.node.name || "目录");
  const moveTo = (parentId) => {
    if (!drag || drag.kind !== "card") return;
    const here = locate(shown, drag.id);
    if (!here || here.parentId === parentId || drag.id === parentId || (here.node.kids && locate(here.node.kids, parentId))) return;
    push({ type: "move", id: drag.id, parentId }, `「${here.node.name}」移到「${nameOf(parentId)}」`);
  };
  const dropZone = (key, onDrop, accept = "card") => ({
    onDragOver: (e) => { if (drag?.kind === accept) { e.preventDefault(); if (over !== key) setOver(key); } },
    onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o === key ? null : o)); },
    onDrop: (e) => { e.preventDefault(); onDrop(); setDrag(null); setOver(null); },
  });
  const groupDrop = (g) => (drag?.kind === "group"
    ? dropZone(`plate:${g.id}`, () => { const next = reorder(model.groups.map((x) => x.id), drag.id, g.id); setOrder(next); saveOrder(next); }, "group")
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
    <input className="kbc-name-input" autoFocus aria-label={label} value={naming.value} maxLength={200}
      onChange={(e) => setNaming({ ...naming, value: e.target.value })}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) commitName(); if (e.key === "Escape") setNaming(null); }}
      onBlur={commitName} />
  );

  // ---- 卡片 ----
  const card = (n, style) => {
    const d = docs[n.id] || {};
    const dim = ql && !hit(n);
    if (n.kids) return (
      <div key={n.id} className={`kbc-card is-folder${over === `group:${n.id}` ? " is-over" : ""}${busyIds.has(n.id) ? " is-busy" : ""}`} style={style}
        {...dragProps("card", n.id)} {...dropZone(`group:${n.id}`, () => moveTo(n.id))}>
        <button type="button" className="kbc-card-hit" onClick={() => setPath((p) => [...p, n.id])} aria-label={`进入文件夹：${n.name}`}>
          <PixelIcon name="folder" size={28} />
          <strong>{n.name}</strong>
          <span className="kbc-card-foot"><span>文件夹</span><span className="tnum">{countDocs(n)} 篇</span></span>
        </button>
      </div>
    );
    return (
      <div key={n.id} className={`kbc-card${dim ? " is-dim" : ""}${busyIds.has(n.id) ? " is-busy" : ""}${drag?.id === n.id ? " is-dragging" : ""}`} style={style} {...dragProps("card", n.id)}>
        <a className="kbc-card-hit" href={d.url || undefined} target="_blank" rel="noreferrer" title={d.excerpt || n.name} onClick={(e) => { if (!d.url) e.preventDefault(); }}>
          <span className="kbc-card-type">{d.shortcut && <PixelIcon name="link" />}{TYPE[d.type] || "文档"}</span>
          <strong>{n.name}</strong>
          <span className="kbc-card-foot"><span className="tnum">{d.updated?.slice(5) || "—"}</span>{busyIds.has(n.id) ? <span className="kbc-sync">同步中</span> : d.url ? <PixelIcon name="external" /> : null}</span>
        </a>
      </div>
    );
  };

  // ---- 分组 ----
  const plate = (g) => {
    const editing = naming?.id === g.id;
    const n = countDocs(g), h = ql ? hits(g) : 0;
    return (
      <div className={`kbc-plate${over === `plate:${g.id}` ? " is-over" : ""}${open === g.id ? " is-open" : ""}`} {...(editing ? {} : dragProps("group", g.id))}>
        {editing ? nameInput("分组名称") : <>
          <button type="button" className="kbc-plate-name" onClick={() => { setOpen(open === g.id ? null : g.id); setPath([]); }} title="点击展开，拖动排序">
            <strong>{g.name}</strong>
            <span className="tnum">{g.kids ? n : 0}</span>
            {ql && h > 0 && <span className="kbc-hit">命中 {h}</span>}
          </button>
          <button type="button" className="icon-btn" title="改名（写入飞书）" disabled={!!lock} onClick={() => setNaming({ id: g.id, value: g.name })}><PixelIcon name="edit" /></button>
        </>}
      </div>
    );
  };

  const stack = (g) => {
    const kids = g.kids || [];
    const top = kids.slice(0, MAX_STACK);
    return (
      <div className={`kbc-group${over === `group:${g.id}` ? " is-over" : ""}`} {...groupDrop(g)}>
        <button type="button" className="kbc-stack" onClick={() => { setOpen(g.id); setPath([]); }} aria-label={`展开分组：${g.name}`}>
          {top.length ? top.map((k, i) => {
            const [rot, x, y] = pose(k.id, top.length - 1 - i);
            return <span key={k.id} className={`kbc-sheet${k.kids ? " is-folder" : ""}`} style={{ transform: `translate(${x}px, ${y}px) rotate(${rot}deg)`, zIndex: i }}><strong>{k.name}</strong></span>;
          }) : <span className="kbc-empty">拖文档进来</span>}
          {kids.length > MAX_STACK && <span className="kbc-more tnum">+{kids.length - MAX_STACK}</span>}
        </button>
        {plate(g)}
      </div>
    );
  };

  const expanded = (g) => {
    let folder = g; const trail = [g];
    for (const id of path) { const f = folder.kids?.find((k) => k.id === id); if (!f) break; folder = f; trail.push(f); }
    const kids = folder.kids || [];
    const sorted = [...kids.filter((k) => k.kids), ...kids.filter((k) => !k.kids)];
    return (
      <div className={`kbc-open${over === `group:${folder.id}` ? " is-over" : ""}`} {...(drag?.kind === "group" ? groupDrop(g) : dropZone(`group:${folder.id}`, () => moveTo(folder.id)))}>
        <div className="kbc-open-head">
          {plate(g)}
          {trail.length > 1 && <nav className="kbc-trail" aria-label="文件夹路径">
            {trail.map((f, i) => <span key={f.id}>{i > 0 && <PixelIcon name="right" />}<button type="button" className="link-btn" disabled={i === trail.length - 1} onClick={() => setPath(path.slice(0, i))}>{f.name}</button></span>)}
          </nav>}
          <span className="spacer" />
          <span className="small muted">拖卡片到上方其他分组或散卡区即可移动</span>
          <Button onClick={() => { setOpen(null); setPath([]); }}><PixelIcon name="up" />收起</Button>
        </div>
        <div className="kbc-grid">{sorted.length ? sorted.map((k) => card(k)) : <p className="kbc-empty-line">这个{trail.length > 1 ? "文件夹" : "分组"}还是空的，把文档拖进来</p>}</div>
      </div>
    );
  };

  const openGroup = model.groups.find((g) => g.id === open);
  const total = model.groups.reduce((s, g) => s + (g.kids ? countDocs(g) : 0), 0) + model.loose.length;
  const pending = ops.length;

  return (
    <section className="kbc-main" aria-label="知识库画布">
      <div className="kbc-toolbar">
        <label className="search-box kbc-search"><PixelIcon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜标题或摘要" aria-label="搜索知识库" /></label>
        <span className="small muted tnum">{model.groups.length} 个分组 · {total} 篇 · 散卡 {model.loose.length}</span>
        <span className="spacer" />
        {pending > 0 && !lock && <span className="kbc-syncing"><StepProgress label={`正在写入飞书 · 还剩 ${pending} 项`} /></span>}
        <Button disabled={!!lock || pending > 0} onClick={reload} title="按飞书重新读取（约 20 秒）"><PixelIcon name="refresh" />刷新</Button>
        <Button variant="primary" disabled={!!lock || !!naming} onClick={() => setNaming({ id: "new", value: "" })}><PixelIcon name="plus" />新建分组</Button>
      </div>
      {lock && <div className="write-box is-unknown" role="alert">
        <div className="write-head"><PixelIcon name="alert" /><strong>结果不明，画布已锁住</strong></div>
        <p className="write-msg">{lock.label}：{lock.error}。不会自动重发；先只读核对飞书里实际有没有改成，再继续。</p>
        <div className="write-actions"><Button variant="primary" onClick={reconcile}><PixelIcon name="refresh" />只读核对</Button></div>
      </div>}
      {note && !lock && <p className={`kbc-note is-${note.tone}`} role="status"><PixelIcon name={note.tone === "ok" ? "check" : "alert"} />{note.text}<button type="button" className="icon-btn" aria-label="关闭" onClick={() => setNote(null)}><PixelIcon name="close" /></button></p>}

      <div className="kbc-board" data-dragging={drag?.kind || undefined}>
        <div className={`kbc-loose${over === "loose" ? " is-over" : ""}`} {...dropZone("loose", () => moveTo(ROOT))}>
          <span className="label">散卡 · 没进分组的文档，拖进下面的分组就会在飞书里移动</span>
          <div className="kbc-loose-cards">
            {model.loose.length ? model.loose.map((n) => { const [rot] = pose(n.id, 1); return card(n, { transform: `rotate(${rot / 3}deg)` }); })
              : <p className="kbc-empty-line">没有散卡：文档都在分组里</p>}
          </div>
        </div>

        {openGroup && expanded(openGroup)}

        <div className="kbc-groups">
          {model.groups.filter((g) => g.id !== open).map((g) => <div key={g.id} className="kbc-cell">{stack(g)}</div>)}
          {naming?.id === "new" && <div className="kbc-cell"><div className="kbc-group is-new"><div className="kbc-stack"><span className="kbc-empty">新分组会在飞书根目录新建一个目录</span></div><div className="kbc-plate">{nameInput("新分组名称")}</div></div></div>}
        </div>
      </div>
    </section>
  );
}
