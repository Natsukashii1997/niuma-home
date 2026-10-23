import { SuccessNotice } from "../../ui/SuccessNotice.jsx";
import { useEffect, useMemo, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button, Loadable, Modal } from "../../ui/components.jsx";
import { ROOT, applyOps, canvasModel, countDocs, fromReceipt, keepOrder, locate, remapOp, reorder } from "./kb-canvas.js";
import { CollectRecent } from "./CollectPage.jsx";
import KbShelf from "./KbShelf.jsx";

// 知识库画布 · 书架（用户 2026-10-23 从三轮设计稿里选定「V4 书架精修」；书柜见 KbShelf.jsx）：
// - 工具栏一行：搜索、新建分组、上次同步时间、同步飞书、最近收藏；下面是书柜。
// - 拖书到层 / 盒 / 柜顶 = 在飞书里移动；新建分组 = 在飞书根目录新建目录；层名、盒子改名 = 飞书改名。
//   拖完就写飞书（用户确认，不走预览）：本地先显示，后台按顺序一项一项提交，每项回读核对；失败退回；
//   结果不明就锁住画布，只能只读核对，绝不重发。
// - 拖层名给分组排序：只存本机（飞书不支持调同级顺序）。

// focus：⌘K 打开某篇文档时（地址 kb/<文档 id>），书柜打开它所在的盒子、抽出这本。
export default function KbCanvas({ focus = "", onSpace }) {
  const tree = useApi("/api/v3/kb/tree");
  const layout = useApi("/api/v3/kb/layout");
  const settings = useApi("/api/v3/settings");
  useEffect(() => { onSpace?.(tree.data?.space || ""); }, [tree.data?.space, onSpace]);
  const ruleIds = useMemo(() => { try { return JSON.parse(settings.data?.values?.kb_collect_rules || "[]").map((r) => r.nodeToken); } catch { return []; } }, [settings.data]);
  return (
    <Loadable state={tree} name="知识库目录" big>
      {(kb) => <Canvas key={`${kb.spaceId}:${kb.readAt}`} kb={kb} focus={focus} initialOrder={layout.data?.order || []} ruleIds={ruleIds} reload={tree.reload} onSpace={onSpace} />}
    </Loadable>
  );
}

function Canvas({ kb: initialKb, focus, initialOrder, ruleIds, reload, onSpace }) {
  const [kb, setKb] = useState(initialKb);
  const [syncing, setSyncing] = useState(false);
  const syncInFlight = useRef(false);
  const docs = kb.docs || {};
  const [base, setBase] = useState(kb.tree);            // 飞书最近一次回读到的目录
  const [queue, setQueue] = useState([]);               // 待写入飞书的变更：{ key, op, label }
  const [running, setRunning] = useState(null);         // 正在写的那一项
  const [lock, setLock] = useState(null);               // 结果不明：{ error, operationId, label }
  const [note, setNote] = useState(null);               // 最近一条结果：{ tone, text }
  const [order, setOrder] = useState(initialOrder);
  const [q, setQ] = useState("");
  const [naming, setNaming] = useState(null);           // { id | "new", value }
  const [recentOpen, setRecentOpen] = useState(false);
  const recent = useApi("/api/v3/kb/collect/recent");
  const ops = useMemo(() => [...(running ? [running] : []), ...queue].map((x) => x.op), [running, queue]);
  const shown = useMemo(() => applyOps(base, ops), [base, ops]);
  const model = useMemo(() => canvasModel(shown, { ruleIds, order }), [shown, ruleIds, order]);
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
    if (lock || syncInFlight.current) return;
    setQueue((qs) => [...qs, { key: `${Date.now()}-${Math.random()}`, op, label }]);
  }
  function saveOrder(next) { apiSend("PUT", "/api/v3/kb/layout", { order: next }).catch(() => setNote({ tone: "error", text: "分组顺序没保存到本机，刷新后会恢复原顺序" })); }

  async function syncFromFeishu() {
    if (syncInFlight.current || lock || ops.length || naming) return;
    syncInFlight.current = true;
    setSyncing(true); setNote(null);
    try {
      const next = await apiSend("POST", "/api/v3/kb/refresh", {});
      // 直接采用强制读取的结果，同一分钟内也更新目录和详情，不再走可能命中旧缓存的 GET。
      setKb(next); setBase(next.tree);
      onSpace?.(next.space || "");
      setNote({ tone: next.sourceError ? "warn" : "ok", text: next.sourceError ? `飞书目录已同步；${next.sourceError}` : "已同步飞书，当前显示最新读取的目录和文档信息" });
    } catch (error) {
      setNote({ tone: "error", text: `同步飞书失败，已保留上次内容。${error.message}` });
    } finally {
      syncInFlight.current = false; setSyncing(false);
      window.dispatchEvent(new Event("workdesk:kb-synced"));
    }
  }

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

  // ---- 整理操作：书柜的拖放、改名、新建分组调用这几项 ----
  const nameOf = (id) => (id === ROOT ? "待上架" : locate(shown, id)?.node.name || "目录");
  // 把一本书 / 一个盒子移到 parentId（ROOT = 柜顶待上架）。原地放下、放进自己或子孙都不算。
  function move(id, parentId) {
    const here = locate(shown, id);
    if (!here || here.parentId === parentId || id === parentId || (here.node.kids && locate(here.node.kids, parentId))) return;
    push({ type: "move", id, parentId }, `「${here.node.name}」移到「${nameOf(parentId)}」`);
  }
  function reorderGroups(id, beforeId) { const next = reorder(model.groups.map((x) => x.id), id, beforeId); setOrder(next); saveOrder(next); }
  function commitName() {
    if (syncInFlight.current) return;
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

  const total = model.groups.reduce((s, g) => s + (g.kids ? countDocs(g) : 0), 0) + model.loose.length;
  const pending = ops.length;

  return (
    <section className="kbf" aria-label="知识库画布">
      {/* 一行：搜索、新建分组，右侧上次同步时间、同步飞书、最近收藏。同步只读取飞书，不改原文。 */}
      <div className="kbs-tools">
        <label className="search-box kbs-search"><PixelIcon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`搜 ${total} 篇的标题或摘要`} aria-label="搜索知识库" />{q && <button type="button" className="icon-btn" onClick={() => setQ("")} aria-label="清除搜索"><PixelIcon name="close" /></button>}</label>
        <button type="button" className="btn kbs-new" disabled><PixelIcon name="plus" />新建分组</button>
        <span className="spacer" />
        <span className="kbs-sync-at">上次同步飞书 {kb.readAt || "—"}</span>
        <Button disabled={!!lock || pending > 0 || !!naming || syncing} onClick={syncFromFeishu} title={`上次同步飞书 ${kb.readAt || "—"}。重新读取飞书的最新目录、文档名称和详情；完成后更新当前页面`}><PixelIcon name="refresh" />{syncing ? "同步中…" : "同步飞书"}</Button>
        <Button onClick={() => setRecentOpen(true)}><PixelIcon name="clock" />最近收藏{unknownCount > 0 && <span className="kbf-badge tnum">{unknownCount}</span>}</Button>
      </div>
      {syncing && <div className="kbf-syncing"><StepProgress label="正在读取飞书最新目录和文档信息，请稍候" /></div>}
      {pending > 0 && !lock && <div className="kbf-syncing"><StepProgress label={`正在写入飞书 · 还剩 ${pending} 项`} /></div>}
      {lock && <div className="write-box is-unknown" role="alert">
        <div className="write-head"><PixelIcon name="alert" /><strong>结果不明，画布已锁住</strong></div>
        <p className="write-msg">{lock.label}：{lock.error}。不会自动重发；先只读核对飞书里实际有没有改成，再继续。</p>
        <div className="write-actions"><Button variant="primary" onClick={reconcile}><PixelIcon name="refresh" />只读核对</Button></div>
      </div>}
      {note?.tone === "ok" && !lock && <SuccessNotice className="kbf-note is-ok" identity={note} onClose={() => setNote(null)}><PixelIcon name="check" />{note.text}</SuccessNotice>}
      {note && note.tone !== "ok" && !lock && <p className={`kbf-note is-${note.tone}`} role="status"><PixelIcon name={note.tone === "ok" ? "check" : "alert"} />{note.text}<button type="button" className="icon-btn" aria-label="关闭" onClick={() => setNote(null)}><PixelIcon name="close" /></button></p>}

      <KbShelf model={model} docs={docs} q={q} focus={focus} />

      <Modal open={recentOpen} onClose={() => setRecentOpen(false)} icon="clock" title="最近收藏">
        <CollectRecent bare onVerified={() => { recent.reload(); syncFromFeishu(); }} />
      </Modal>
    </section>
  );
}
