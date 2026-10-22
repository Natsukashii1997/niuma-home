import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button, Empty, FilterBar, Loadable, Segmented, Select, Tag } from "../../ui/components.jsx";
import { LINES, monthLabel } from "../../constants.js";
import MaterialEditor from "./MaterialEditor.jsx";
import MaterialDetail from "./MaterialDetail.jsx";
import { legacyImageRequest, legacyWrite, pendingLegacyIn, recoverLegacy, retryLegacy } from "../../ui/legacy-write.js";
import { verifyMaterialWrite } from "./material-write.js";
import { uploadImage } from "./upload-image.js";

export default function MaterialsView() {
  const state = useApi("/api/materials");
  return <Loadable state={state} name="本地物料" big>{(items) => <MaterialWorkspace initialItems={items} />}</Loadable>;
}

function MaterialWorkspace({ initialItems }) {
  const [initialWrite] = useState(() => {
    try { return { operations: pendingLegacyIn("material") }; }
    catch (error) { return { operations: [], error: error.message }; }
  });
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState({ month: "", line: "", type: "" });
  const [view, setView] = useState("list");
  const [selected, setSelected] = useState(initialWrite.operations[0]?.path === "/api/materials" ? "new" : Number(initialWrite.operations[0]?.path.match(/^\/api\/materials\/(\d+)/)?.[1]) || null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(initialWrite.error || (initialWrite.operations.length ? "上次物料操作尚未核对，原操作已保留，请重新读取。" : ""));
  const [notice, setNotice] = useState("");
  const [recoveredRequests, setRecoveredRequests] = useState([]);
  const [retryOperation, setRetryOperation] = useState(null);
  const recoveryPicker = useRef(null);
  const lock = useRef(false);
  const item = items.find((item) => item.id === selected);
  const set = (key) => (value) => setFilter((old) => ({ ...old, [key]: value }));
  const shown = items.filter((m) => (view === "compare" || !filter.month || m.month === filter.month)
    && (!filter.line || m.line === filter.line) && (!filter.type || m.type === filter.type));
  const months = [...new Set(shown.map((m) => m.month))].sort().reverse();
  const refresh = async () => {
    const next = await apiSend("GET", "/api/materials");
    if (!Array.isArray(next)) throw new Error("物料回读内容无效");
    setItems(next);
    setFilter((old) => ({ ...old,
      month: next.some((item) => item.month === old.month) ? old.month : "",
      type: next.some((item) => item.type === old.type) ? old.type : "",
    }));
    return next;
  };
  // 错误或回读失败后锁住写操作，先刷新核对；不自动重发可能已经落库的请求。
  const write = async (action) => {
    if (lock.current || uncertain) return false;
    lock.current = true; setBusy(true); setNotice("");
    try { await action(refresh); return true; }
    catch (error) {
      setUncertain(`${error.message}。原草稿已保留，请重新读取核对当前物料与图片。`);
      if (error.code === "WRITE_RECEIPT_UNKNOWN") setRetryOperation(pendingLegacyIn("material")[0] || null);
      else setRetryOperation(null);
      return false;
    }
    finally { lock.current = false; setBusy(false); }
  };
  const recover = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setRetryOperation(null);
    try {
      const operations = pendingLegacyIn("material");
      for (const op of operations) {
        try { await recoverLegacy(op.scope, (result, request) => verifyMaterialWrite(refresh, result, request)); }
        catch (error) { if (error.code === "WRITE_RECEIPT_UNKNOWN") setRetryOperation(op); throw error; }
        setRecoveredRequests(previous => [...previous, op]);
        if (op.path === "/api/materials") setSelected(null);
      }
      if (!operations.length) await refresh(); setUncertain(""); setNotice("已重新读取并核对物料与图片。");
      if (operations.some(op => op.path === "/api/materials")) setSelected(null);
    } catch (error) { setUncertain(`${error.message}。原操作已保留，不会重复提交。`); }
    finally { lock.current = false; setBusy(false); }
  };
  const retryOriginal = async (file) => {
    if (lock.current || !retryOperation) return;
    const op = retryOperation;
    lock.current = true; setBusy(true); setRetryOperation(null);
    try {
      if (op.path.includes("/images?")) {
        if (!file) throw new Error("请重新选择上次上传的原图片");
        const id = Number(op.path.match(/^\/api\/materials\/(\d+)/)[1]);
        const request = await legacyImageRequest(id, file, op.body.contentType, op.baseVersion);
        await legacyWrite(op.scope, request, (result, original) => verifyMaterialWrite(refresh, result, original),
          headers => uploadImage(id, file, op.body.contentType, () => {}, headers));
      } else await retryLegacy(op.scope, (result, original) => verifyMaterialWrite(refresh, result, original));
      setRecoveredRequests(previous => [...previous, op]);
      if (op.path === "/api/materials") setSelected(null);
      const remaining = pendingLegacyIn("material");
      setUncertain(remaining.length ? "仍有其他操作尚未核对，请继续重新读取。" : "");
      setNotice("原操作已保存并核对，没有重复提交。");
      if (op.path === "/api/materials") setSelected(null);
    } catch (error) {
      setUncertain(`${error.message}。原操作已保留，请重新读取核对。`);
      if (["WRITE_RECEIPT_UNKNOWN", "WRITE_PENDING_CHANGED"].includes(error.code)) setRetryOperation(op);
    } finally { lock.current = false; setBusy(false); }
  };
  const warning = uncertain && <div className="warn" role="alert"><span>{uncertain}</span><Button disabled={busy} onClick={recover}>刷新页面核对</Button>
    {retryOperation && (retryOperation.path.includes("/images?") ? <><input ref={recoveryPicker} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.gif" aria-label="重新选择原上传图片" onChange={event => { const file = event.target.files[0]; event.target.value = ""; if (file) retryOriginal(file); }} /><Button disabled={busy} onClick={() => recoveryPicker.current.click()}>选择原图片并重试</Button></>
      : <Button disabled={busy} onClick={() => retryOriginal()}>重试原操作</Button>)}
  </div>;
  const onSaved = (saved) => {
    setFilter({ month: saved.month, line: saved.line, type: saved.type });
    setSelected(saved.id); setNotice(`已保存「${saved.name}」，可继续上传图片。`);
  };
  return <>
    <FilterBar>
      <Segmented value={view} options={[["list", "物料列表"], ["compare", "同类跨月对比"]]} onChange={setView} />
      {view === "list" && <Select label="月份" value={filter.month} options={[...new Set(items.map((m) => m.month))].sort().reverse()} onChange={set("month")} />}
      <Select label="业务线" value={filter.line} options={LINES} onChange={set("line")} />
      <Select label="类型" value={filter.type} options={[...new Set(items.map((m) => m.type))]} onChange={set("type")} />
      <div className="spacer" />
      <Button variant="primary" disabled={!!uncertain} onClick={() => { setNotice(""); setSelected("new"); }}><PixelIcon name="plus" size={14} />新建物料</Button>
    </FilterBar>
    {!selected && warning}
    <p className="muted small" role="status">{notice || (view === "compare" ? "选择物料类型后，按月份并排比较第一张图片；月份筛选在此视图不生效。" : `共 ${shown.length} 个物料，点击卡片查看详情与图片。`)}</p>
    {view === "compare" && !filter.type ? <Empty>请先选择要对比的物料类型</Empty> : <>
      {!months.length && <Empty>没有符合条件的物料</Empty>}
      <div className={view === "compare" ? "material-compare" : "stack"}>
        {months.map((month) => <section key={month} className={view === "compare" ? "material-month" : ""}>
          <h3 className="section-title">{monthLabel(month)}</h3>
          <div className={view === "compare" ? "stack" : "material-grid"}>
            {shown.filter((m) => m.month === month).map((m) => <button key={m.id} className="material-card" data-dither="" onClick={() => { setNotice(""); setSelected(m.id); }} aria-label={`查看物料：${m.name}`}>
              <div className="material-thumb">
                {m.images[0] ? <img src={m.images[0].url} alt={m.name} loading="lazy" /> : <PixelIcon name="image" size={28} />}
                <span className="material-count">{m.images.length} 张图</span>
              </div>
              <div className="material-info"><strong>{m.name}</strong><div className="tag-row"><Tag tone="blue">{m.type}</Tag><Tag>{m.line}</Tag>{m.skus.map((sku) => <Tag key={sku}>{sku}</Tag>)}</div>{m.note && <p className="muted small pre">{m.note}</p>}</div>
            </button>)}
          </div>
        </section>)}
      </div>
    </>}
    {selected !== null && <MaterialDialog busy={busy} title={selected === "new" ? "新建物料" : item?.name || "物料详情"} onClose={() => setSelected(null)}>
      {warning}
      {selected === "new" ? <MaterialEditor write={write} disabled={busy || !!uncertain} onSaved={onSaved} onCancel={() => setSelected(null)} />
        : item && <MaterialDetail key={item.id} item={item} recoveredRequests={recoveredRequests} write={write} disabled={busy || !!uncertain} onSaved={onSaved} onDeleted={() => { setSelected(null); setNotice(`已删除「${item.name}」及其图片。`); }} />}
      {busy && <p role="status" className="muted small">正在保存并回读，请稍候…</p>}
    </MaterialDialog>}
  </>;
}

function MaterialDialog({ title, busy, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="material-dialog" aria-labelledby="material-dialog-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="card-head"><h2 id="material-dialog-title">{title}</h2><Button disabled={busy} aria-label="关闭弹窗" onClick={onClose}><PixelIcon name="close" size={16} /></Button></div>
    <div className="card-body">{children}</div>
  </dialog>;
}
