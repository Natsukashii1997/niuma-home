import { useEffect, useRef, useState } from "react";
import { useApi } from "../../api.js";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { Button, Loadable, Modal, useToast } from "../../ui/components.jsx";
import { SavedNote } from "../../ui/write-flow.jsx";
import { useLocalCanvas } from "../../ui/use-local-canvas.js";
import Thumb from "../../ui/Thumb.jsx";
import { DigiworldImport } from "./DigiworldImport.jsx";

const TYPES = ["image/png", "image/jpeg", "image/webp"];
const readFile = file => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("图片读取失败")); r.readAsDataURL(file); });
export default function PastMarketingCanvas() {
  const state = useApi("/api/v3/refs/state");
  return <Loadable state={state} name="过往营销" big>{data => <Canvas initial={data} />}</Loadable>;
}
function Canvas({ initial }) {
  const [notice, setNotice] = useState(null), [tag, setTag] = useState(""), [zoom, setZoom] = useState(1);
  const [importing, setImporting] = useState(false), [open, setOpen] = useState(null), [previewPos, setPreviewPos] = useState(null);
  const [toast, showToast] = useToast();
  const { value: data, change, busy, locked, error, reread, retry, canRetry } = useLocalCanvas(initial, "/api/v3/refs", text => setNotice({ text, id: crypto.randomUUID() }));
  const wrap = useRef(null), drag = useRef(null), items = data.items;
  const tags = [...new Set(items.flatMap(i => i.tags))];
  const add = list => {
    change(old => {
      const top = old.items.length ? Math.max(...old.items.map(i => i.y)) + 248 : 32;
      return { ...old, items: [...old.items, ...list.map((i, k) => ({ ...i, x: 40 + (k % 6) * 208, y: top + Math.floor(k / 6) * 248, w: 180 }))] };
    }, `已保存 ${list.length} 张图片`);
  };
  async function addFiles(files) {
    if (locked) return;
    const list = [];
    try {
      for (const file of files) {
        if (!TYPES.includes(file.type)) throw new Error("只收 PNG、JPEG、WEBP 图片");
        if (file.size > 8 * 1024 * 1024) throw new Error("每张图片要小于 8MB");
        // 分张提交，避免一次多图超出请求上限；队列确保先后保存。
        list.push({ id: crypto.randomUUID(), imageDataUrl: await readFile(file), title: file.name || "粘贴的图片", tags: [tag || "未分类"], source: "本机粘贴" });
      }
      for (const item of list) add([item]);
    } catch (e) { showToast(e.message); }
  }
  useEffect(() => {
    const paste = e => {
      if (e.target.closest?.('input,textarea,[contenteditable="true"]')) return;
      const files = Array.from(e.clipboardData?.files || []);
      if (files.length) { e.preventDefault(); void addFiles(files); }
    };
    addEventListener("paste", paste); return () => removeEventListener("paste", paste);
  });
  const down = e => {
    if (e.target.closest("button,input,.canvas-zoom") || locked) return;
    const el = e.target.closest(".ref");
    if (el) { const i = items.find(i => i.id === el.dataset.id); drag.current = { id: i.id, sx: e.clientX, sy: e.clientY, ox: i.x, oy: i.y }; }
    else drag.current = { pan: true, sx: e.clientX, sy: e.clientY, ox: wrap.current.scrollLeft, oy: wrap.current.scrollTop };
    wrap.current.setPointerCapture(e.pointerId);
  };
  const move = e => {
    const d = drag.current; if (!d) return;
    if (d.pan) { wrap.current.scrollLeft = d.ox - (e.clientX - d.sx); wrap.current.scrollTop = d.oy - (e.clientY - d.sy); return; }
    const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) { d.x = Math.max(0, Math.round((d.ox + dx) / 8) * 8); d.y = Math.max(0, Math.round((d.oy + dy) / 8) * 8); setPreviewPos({ id: d.id, x: d.x, y: d.y }); }
  };
  const up = () => {
    const d = drag.current; drag.current = null; setPreviewPos(null);
    if (d?.moved) change(old => ({ ...old, items: old.items.map(i => i.id === d.id ? { ...i, x: d.x, y: d.y } : i) }));
    else if (d?.id) setOpen(d.id);
  };
  const remove = id => { setNotice(""); change(old => ({ ...old, items: old.items.filter(i => i.id !== id) })); if (open === id) setOpen(null); };
  const selected = items.find(i => i.id === open);
  return <>
    <SavedNote text={notice?.text} identity={notice?.id} onClose={() => setNotice(null)} />
    <div className="toolbar">
      <span className="label"><PixelIcon name="filter" />分类</span>
      <button className={`chip${!tag ? " is-on" : ""}`} onClick={() => setTag("")}>全部 {items.length}</button>
      {tags.map(t => <button className={`chip${tag === t ? " is-on" : ""}`} key={t} onClick={() => setTag(t === tag ? "" : t)}>{t}</button>)}
      <span className="spacer" /><span className="small muted"><kbd>⌘V</kbd> 粘贴即保存 · 拖动整理 · 点击看大图</span>
      <label className="btn"><PixelIcon name="upload" />上传<input hidden type="file" multiple accept={TYPES.join(",")} disabled={locked} onChange={e => { void addFiles(Array.from(e.target.files)); e.target.value = ""; }} /></label>
      <Button onClick={() => setImporting(true)} disabled={locked}><PixelIcon name="star" />从数码世界导入图片</Button>
    </div>
    {error && <div className="write-box is-error" role="alert">{error}<Button disabled={busy} onClick={reread}>重新读取核对</Button>{canRetry && <Button disabled={busy} onClick={retry}>继续保存草稿</Button>}</div>}
    <div className="canvas-wrap past-canvas" ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; setPreviewPos(null); }} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)); }}>
      <div className="canvas-board" style={{ transform: `scale(${zoom})`, width: Math.max(1420, ...items.map(i => i.x + i.w + 40)), height: Math.max(660, ...items.map(i => i.y + 280)) }}>
        {data.zones.map(z => <div className="zone" key={z.name} style={{ left: z.x, top: z.y, width: z.w, height: z.h }}><span>{z.name}</span></div>)}
        {!items.length && <div className="canvas-empty"><PixelIcon name="canvas" size={28} /><strong>把营销图片粘贴到这里</strong><span>支持粘贴、拖入或上传，自动保存在本机。</span></div>}
        {items.map(i => <figure key={i.id} data-id={i.id} className={`ref${tag && !i.tags.includes(tag) ? " is-dim" : ""}`} style={{ left: previewPos?.id === i.id ? previewPos.x : i.x, top: previewPos?.id === i.id ? previewPos.y : i.y, width: i.w }}>
          <Thumb src={i.imageDataUrl || i.src} title={i.title} />
          <button type="button" className="ref-delete" aria-label={`删除图片：${i.title}`} title="删除图片和本地缓存" disabled={locked} onClick={() => remove(i.id)}><PixelIcon name="close" size={12} /></button>
          <figcaption><span>{i.tags[0] || "未分类"}</span></figcaption>
        </figure>)}
      </div>
      <div className="canvas-zoom"><button onClick={() => setZoom(z => Math.max(.5, z - .25))} aria-label="缩小">−</button><span>{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(z => Math.min(1.5, z + .25))} aria-label="放大">+</button></div>
    </div>
    <Modal open={!!selected} onClose={() => setOpen(null)} title="营销图片" icon="image" wide>
      {selected && <><div className="past-image"><img src={selected.imageDataUrl || selected.src} alt={selected.title} /></div><label className="select">分类<input aria-label="图片分类" defaultValue={selected.tags[0] || "未分类"} onBlur={e => { const t = e.target.value.trim().slice(0,50) || "未分类"; if (t !== selected.tags[0]) change(old => ({ ...old, items: old.items.map(i => i.id === selected.id ? { ...i, tags: [t] } : i) })); }} /></label></>}
    </Modal>
    {importing && <DigiworldImport open onClose={() => setImporting(false)} items={items} onAdd={list => { for (const x of list) add([{ id: crypto.randomUUID(), imageDataUrl: x.dataUrl, title: x.title, tags: x.tags, source: x.source }]); }} />}
    {toast}
  </>;
}
