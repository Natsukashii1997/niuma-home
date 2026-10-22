import { useEffect, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { legacyImageRequest, legacyState, legacyWrite, pendingLegacy } from "../../ui/legacy-write.js";
import { removeConfirmedUploads, verifyMaterialWrite } from "./material-write.js";
import { Button, Empty } from "../../ui/components.jsx";
import MaterialEditor, { MaterialSummary } from "./MaterialEditor.jsx";
import { uploadImage } from "./upload-image.js";

const types = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
export default function MaterialDetail({ item, write, disabled, onSaved, onDeleted, recoveredRequests = [] }) {
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(() => !!legacyState(`material:${item.id}:edit`).pending);
  const [removal, setRemoval] = useState(null);
  const [queue, setQueue] = useState([]);
  const [message, setMessage] = useState("");
  const [uploadState, setUploadState] = useState(null);
  const picker = useRef(null), queueRef = useRef([]), recoveredRef = useRef(new Set(recoveredRequests.map(op => op.requestId)));
  const position = Math.min(index, Math.max(0, item.images.length - 1));
  const current = item.images[position];
  useEffect(() => {
    queueRef.current.filter(entry => !queue.some(next => next.url === entry.url)).forEach(entry => URL.revokeObjectURL(entry.url));
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => () => queueRef.current.forEach(entry => URL.revokeObjectURL(entry.url)), []);
  useEffect(() => {
    const own = recoveredRequests.filter(op => !recoveredRef.current.has(op.requestId) && (op.path === `/api/materials/${item.id}` || op.path.startsWith(`/api/materials/${item.id}/`)));
    own.forEach(op => recoveredRef.current.add(op.requestId));
    const ids = own.map(op => op.requestId);
    if (queueRef.current.some(entry => entry.requestId && ids.includes(entry.requestId))) {
      setQueue(current => removeConfirmedUploads(current, ids));
      setUploadState(null); setMessage("已核对上次上传；已保存图片已移出队列，可继续剩余图片。");
    }
    if (own.some(op => op.method === "PATCH")) setEditing(false);
    if (own.some(op => op.method === "DELETE")) setRemoval(null);
  }, [recoveredRequests, item.id]);
  const choose = (files) => {
    if (disabled) return;
    const selected = [...files];
    if (!selected.length) return;
    setUploadState(null);
    const bad = selected.find((file) => !types[file.name.split(".").at(-1).toLowerCase()] || !file.size || file.size > 20 * 1024 * 1024);
    if (bad) { setMessage(`未加入图片：「${bad.name}」须为 PNG / JPG / JPEG / WEBP / GIF，且每张大于 0、不超过 20MB。`); return; }
    setQueue(selected.map((file) => ({ file, url: URL.createObjectURL(file) })));
    setMessage(""); setRemoval(null);
  };
  const upload = async () => {
    let completed = 0;
    const batch = queue, total = batch.length;
    setUploadState({ progress: 0 });
    const ok = await write(async (refresh) => {
      let baseVersion = item.writeVersion;
      for (const entry of batch) {
        const { file } = entry;
        const contentType = file.type || types[file.name.split(".").at(-1).toLowerCase()];
        const scope = `material:${item.id}:upload`;
        const pending = pendingLegacy(scope);
        const request = await legacyImageRequest(item.id, file, contentType, pending?.baseVersion || baseVersion);
        const data = await legacyWrite(scope, request, (result, op) => verifyMaterialWrite(refresh, result, op),
          headers => {
            setQueue(current => current.map(row => row.url === entry.url ? { ...row, requestId: headers["X-Workdesk-Request-Id"] } : row));
            return uploadImage(item.id, file, contentType, (fraction) => setUploadState({ progress: (completed + fraction) / total }), headers);
          });
        baseVersion = data.writeVersion;
        setQueue(current => current.filter(row => row.url !== entry.url));
        completed++;
        setUploadState({ progress: completed / total });
        setMessage(`本批次已上传并回读 ${completed} / ${total} 张。`);
      }
    });
    if (ok) { setUploadState({ progress: 1, done: true }); setQueue([]); setIndex(item.images.length); }
    else {
      setUploadState((old) => ({ ...old, error: "上传结果未完全确认，已停止，请刷新核对" }));
      setMessage(`本批次已确认 ${completed} / ${total} 张；后续上传已停止，请重新读取核对，确认后只继续队列中的剩余图片。`);
    }
  };
  const remove = () => write(async (refresh) => {
    const urls = removal === "material" ? item.images.map((image) => image.url) : [removal.url];
    await legacyWrite(`material:${item.id}:delete`, { method: "DELETE", path: removal === "material" ? `/api/materials/${item.id}` : `/api/materials/${item.id}/images/${removal.id}`, baseVersion: item.writeVersion, context: { urls } },
      (result, op) => verifyMaterialWrite(refresh, result, op));
    if (removal === "material") onDeleted();
    else { setRemoval(null); setMessage("已删除所选图片。"); }
  });
  if (editing) return <MaterialEditor item={item} disabled={disabled} write={write} onCancel={() => setEditing(false)} onSaved={(saved) => { setEditing(false); onSaved(saved); }} />;
  return <div className="stack">
    <MaterialSummary value={item} />
    {uploadState && <StepProgress label="图片上传与回读核对" {...uploadState} />}
    <div className="material-viewer">
      {current ? <img src={current.url} alt={`${item.name}，第 ${position + 1} 张`} /> : <Empty>还没有图片，保存后可在下方选择或拖入多张图片。</Empty>}
      <div className="row">
        <Button aria-label="上一张图片" disabled={!position} onClick={() => setIndex(position - 1)}><PixelIcon name="left" size={16} /></Button>
        <span className="small">{item.images.length ? position + 1 : 0} / {item.images.length} 张</span>
        <Button aria-label="下一张图片" disabled={position >= item.images.length - 1} onClick={() => setIndex(position + 1)}><PixelIcon name="right" size={16} /></Button>
        <div className="spacer" /><Button disabled={!current || disabled || !!queue.length} onClick={() => setRemoval(current)}>删除当前图片</Button>
      </div>
    </div>
    {removal ? <div className="material-confirm">
      <strong>{removal === "material" ? `确认删除「${item.name}」？` : `确认删除「${item.name}」的第 ${item.images.findIndex((image) => image.id === removal.id) + 1} 张图片？`}</strong>
      <p>{removal === "material" ? `将删除此物料及其 ${item.images.length} 张图片文件，无法撤销。` : "将删除这张图片文件，无法撤销。"}</p>
      <div className="row"><Button disabled={disabled} onClick={() => setRemoval(null)}>取消删除</Button><Button disabled={disabled} onClick={remove}>{removal === "material" ? "确认删除物料" : "确认删除图片"}</Button></div>
    </div> : <>
      {!queue.length && <div className="material-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files); }}>
        <PixelIcon name="upload" size={20} /><p>拖入多张图片，或选择图片；预览确认后上传。</p><p className="muted small">PNG / JPG / JPEG / WEBP / GIF，单张不超过 20MB</p>
        <input ref={picker} type="file" multiple accept=".png,.jpg,.jpeg,.webp,.gif" aria-label="选择上传图片" hidden onChange={(event) => { choose(event.target.files); event.target.value = ""; }} />
        <Button disabled={disabled} onClick={() => picker.current.click()}>选择图片</Button>
      </div>}
      {!!queue.length && <section className="material-upload-preview"><h3 className="section-title">待上传预览 · {queue.length} 张</h3><div className="material-upload-grid">{queue.map(({ file, url }, i) => <figure key={url}><img src={url} alt={`待上传：${file.name}`} /><figcaption>{i + 1}. {file.name}<br /><span className="muted small">{(file.size / 1024 / 1024).toFixed(2)} MB</span></figcaption></figure>)}</div>
        <div className="row"><Button disabled={disabled} onClick={() => { setQueue([]); setMessage(""); }}>取消上传</Button><Button variant="primary" disabled={disabled} onClick={upload}>确认上传 {queue.length} 张图片</Button></div>
      </section>}
      <div className="row"><Button disabled={disabled || !!queue.length} onClick={() => { setRemoval(null); setEditing(true); }}>编辑物料</Button><div className="spacer" /><Button disabled={disabled || !!queue.length} onClick={() => setRemoval("material")}>删除物料</Button></div>
    </>}
    {message && <p role="status" className="muted small">{message}</p>}
  </div>;
}
