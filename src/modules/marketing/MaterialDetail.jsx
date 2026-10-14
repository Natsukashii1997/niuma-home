import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { apiSend } from "../../api.js";
import { Button, Empty } from "../../ui/components.jsx";
import MaterialEditor, { MaterialSummary } from "./MaterialEditor.jsx";

const types = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
export default function MaterialDetail({ item, write, disabled, onSaved, onDeleted }) {
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [removal, setRemoval] = useState(null);
  const [queue, setQueue] = useState([]);
  const [message, setMessage] = useState("");
  const picker = useRef(null);
  const position = Math.min(index, Math.max(0, item.images.length - 1));
  const current = item.images[position];
  useEffect(() => () => queue.forEach((entry) => URL.revokeObjectURL(entry.url)), [queue]);
  const choose = (files) => {
    if (disabled) return;
    const selected = [...files];
    if (!selected.length) return;
    const bad = selected.find((file) => !types[file.name.split(".").at(-1).toLowerCase()] || !file.size || file.size > 20 * 1024 * 1024);
    if (bad) { setMessage(`未加入图片：「${bad.name}」须为 PNG / JPG / JPEG / WEBP / GIF，且每张大于 0、不超过 20MB。`); return; }
    setQueue(selected.map((file) => ({ file, url: URL.createObjectURL(file) })));
    setMessage(""); setRemoval(null);
  };
  const upload = async () => {
    let completed = 0;
    const ok = await write(async (refresh) => {
      for (const { file } of queue) {
        const response = await fetch(`/api/materials/${item.id}/images?name=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "content-type": file.type || types[file.name.split(".").at(-1).toLowerCase()] }, body: file });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "图片上传失败");
        const saved = (await refresh()).find((row) => row.id === item.id);
        if (!saved?.images.some((image) => image.id === data.id && image.url === data.url)) throw new Error("图片记录回读失败");
        const image = await fetch(data.url);
        if (!image.ok || (await image.blob()).size !== file.size) throw new Error("图片文件回读失败");
        completed++;
        setMessage(`本批次已上传并回读 ${completed} / ${queue.length} 张。`);
      }
    });
    if (ok) { setQueue([]); setIndex(item.images.length); }
    else setMessage(`本批次已确认 ${completed} / ${queue.length} 张；其余状态未确认，已停止后续上传，请刷新核对，勿整批重复上传。`);
  };
  const remove = () => write(async (refresh) => {
    const urls = removal === "material" ? item.images.map((image) => image.url) : [removal.url];
    await apiSend("DELETE", removal === "material" ? `/api/materials/${item.id}` : `/api/materials/${item.id}/images/${removal.id}`);
    const saved = (await refresh()).find((row) => row.id === item.id);
    if (removal === "material" ? !!saved : !saved || saved.images.some((image) => image.id === removal.id)) throw new Error("删除后的记录回读不一致");
    for (const url of urls) if ((await fetch(url)).status !== 404) throw new Error("图片删除未能确认");
    if (removal === "material") onDeleted();
    else { setRemoval(null); setMessage("已删除所选图片。"); }
  });
  if (editing) return <MaterialEditor item={item} disabled={disabled} write={write} onCancel={() => setEditing(false)} onSaved={(saved) => { setEditing(false); onSaved(saved); }} />;
  return <div className="stack">
    <MaterialSummary value={item} />
    <div className="material-viewer">
      {current ? <img src={current.url} alt={`${item.name}，第 ${position + 1} 张`} /> : <Empty>还没有图片，保存后可在下方选择或拖入多张图片。</Empty>}
      <div className="row">
        <Button aria-label="上一张图片" disabled={!position} onClick={() => setIndex(position - 1)}><ChevronLeft size={16} /></Button>
        <span className="small">{item.images.length ? position + 1 : 0} / {item.images.length} 张</span>
        <Button aria-label="下一张图片" disabled={position >= item.images.length - 1} onClick={() => setIndex(position + 1)}><ChevronRight size={16} /></Button>
        <div className="spacer" /><Button disabled={!current || disabled || !!queue.length} onClick={() => setRemoval(current)}>删除当前图片</Button>
      </div>
    </div>
    {removal ? <div className="material-confirm">
      <strong>{removal === "material" ? `确认删除「${item.name}」？` : `确认删除「${item.name}」的第 ${item.images.findIndex((image) => image.id === removal.id) + 1} 张图片？`}</strong>
      <p>{removal === "material" ? `将删除此物料及其 ${item.images.length} 张图片文件，无法撤销。` : "将删除这张图片文件，无法撤销。"}</p>
      <div className="row"><Button disabled={disabled} onClick={() => setRemoval(null)}>取消删除</Button><Button disabled={disabled} onClick={remove}>{removal === "material" ? "确认删除物料" : "确认删除图片"}</Button></div>
    </div> : <>
      {!queue.length && <div className="material-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); choose(event.dataTransfer.files); }}>
        <Upload size={20} /><p>拖入多张图片，或选择图片；预览确认后上传。</p><p className="muted small">PNG / JPG / JPEG / WEBP / GIF，单张不超过 20MB</p>
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
