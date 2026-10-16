import { useEffect, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { href } from "../../router.js";
import { Button, Loadable, Modal, PendingButton, SampleBadge, Segmented, Tag, useToast } from "../../ui/components.jsx";
import Thumb from "../../ui/Thumb.jsx";
import { deliveryMonth } from "../../constants.js";
import { SAMPLE_NAS } from "../../samples/v3.js";
import MaterialsView from "./MaterialsView.jsx";

// 物料（v3）：原件在公司 NAS，工作台只读扫描、本地只存缩略图。
// 页签：物料墙（产品物料，类型 × 月份）· 营销物料（朋友圈，按场景）· 设计参考（画布）· 本地物料（原 T03，NAS 不可用时的兜底）。
const VIEWS = [["wall", "物料墙"], ["marketing", "营销物料"], ["refs", "设计参考"], ["local", "本地物料"]];

export default function MaterialsHub({ route = [] }) {
  const view = VIEWS.some(([k]) => k === route[0]) ? route[0] : "wall";
  return (
    <>
      <div className="toolbar">
        <Segmented options={VIEWS} value={view} onChange={(v) => { location.hash = href("marketing", "materials", v); }} />
      </div>
      {view === "local" ? <MaterialsView /> : view === "refs" ? <RefCanvas /> : <NasViews view={view} />}
    </>
  );
}

function NasViews({ view }) {
  const state = useApi("/api/v3/nas", SAMPLE_NAS);
  return <Loadable state={state} name="物料墙" big>{(nas) => <NasBoard nas={nas} view={view} sample={state.isSample ? state.task : null} />}</Loadable>;
}

function NasBar({ nas, sample }) {
  const [scan, setScan] = useState(null);
  return (
    <div className="nas-bar">
      <span className={`nas-state${nas.reachable ? "" : " is-off"}`}>{nas.reachable ? `NAS 已连接 · ${nas.network}` : "NAS 不可达 · 显示缓存缩略图"}</span>
      <span className="mono small"><PixelIcon name="folder" /> {nas.root}/YYYY-MM/产品物料｜营销物料/类型/</span>
      <span className="small muted">缩略图缓存 {Math.round(nas.thumbBytes / 1024 / 1024)} MB · 只存缩略图</span>
      <span className="small muted">上次扫描 {nas.lastScanAt}</span>
      <span className="spacer" />
      {scan ? <div className="nas-scan"><StepProgress label="扫描 NAS" done={scan === "done"} /></div> : null}
      {sample && <SampleBadge task={sample} />}
      <Button onClick={() => { setScan("run"); setTimeout(() => setScan("done"), 2600); }}><PixelIcon name="refresh" />重新扫描</Button>
    </div>
  );
}

function NasBoard({ nas, view, sample }) {
  const [open, setOpen] = useState(null);
  const [toast, showToast] = useToast();
  const dm = deliveryMonth();
  return (
    <>
      <NasBar nas={nas} sample={sample} />
      {view === "wall" ? (
        <div className="wall" style={{ "--cols": nas.months.length }}>
          <div className="wall-h">类型</div>
          {nas.months.map((m) => <div key={m} className={`wall-h${m === dm ? " is-dm" : ""}`}><span className="tnum">{m}</span>{m === dm && <em className="month-flag">交付月</em>}</div>)}
          {nas.types.map((t) => (
            <Row key={t.key}>
              <div className="wall-t"><strong>{t.key}</strong><span className="small muted">{t.fixed ? "每月固定" : "活动时出"}</span></div>
              {nas.months.map((m) => <WallCell key={m} cell={nas.cells[`${m}|${t.key}`]} source={nas.cells[`${nas.cells[`${m}|${t.key}`]?.from}|${t.key}`]} type={t.key} month={m} isDm={m === dm} onOpen={() => setOpen({ month: m, type: t.key, cell: nas.cells[`${m}|${t.key}`] })} />)}
            </Row>
          ))}
        </div>
      ) : (
        <div className="mk-grid">
          {nas.marketing.map((x, i) => (
            <button key={i} type="button" className="mk-card" data-dither="" onClick={() => setOpen({ month: x.month, type: x.scene, cell: { state: "file", kind: x.kind === "九宫格" ? "grid9" : "grid3", path: `${x.month}/营销物料/${x.scene}/`, count: x.count } })}>
              <Thumb kind={x.kind === "九宫格" ? "grid9" : "grid3"} title={x.scene} big={i === 0 ? "冲分" : ""} accent={i === 0} />
              <span className="mk-info"><strong>{x.scene}</strong><span className="row"><span className="tnum small muted">{x.month} · {x.kind} · {x.count} 张</span><span className="spacer" /><Tag tone={x.state === "已交付" ? "green" : "orange"}>{x.state}</Tag></span></span>
            </button>
          ))}
        </div>
      )}
      <Modal open={!!open} onClose={() => setOpen(null)} wide icon="image" title={open ? `${open.month} · ${open.type}` : ""}
        footer={open?.cell?.state === "file" && <>
          <PendingButton task="V3-接口清单"><PixelIcon name="external" />打开原图（NAS 暂缓接入）</PendingButton>
          <PendingButton task="V3-接口清单" variant="primary"><PixelIcon name="brief" />在 {dm.slice(5)} 月 brief 中沿用</PendingButton>
        </>}>
        {open && (
          <div className="viewer">
            <div className="viewer-stage"><Thumb kind={open.cell?.kind || "poster"} title={open.type} big={open.cell?.big} accent={open.cell?.accent} /></div>
            <dl className="kv">
              <dt>NAS 路径</dt><dd className="mono small">{nas.root}/{open.cell?.path || "—"}</dd>
              <dt>状态</dt><dd>{{ file: "已上传", pending: "待交付", reuse: `沿用 ${open.cell?.from}`, skip: "本月不出" }[open.cell?.state] || "未出"}</dd>
              {open.cell?.version && <><dt>版本</dt><dd>{Array.from({ length: open.cell.version }, (_, i) => <Tag key={i} tone={i === open.cell.version - 1 ? "green" : "neutral"}>v{i + 1}</Tag>)}</dd></>}
              {open.cell?.count && <><dt>张数</dt><dd>{open.cell.count} 张</dd></>}
              <dt>说明</dt><dd className="small muted">本地只缓存缩略图；不在公司内网时可以看缩略图，原图需要连公司网络。</dd>
            </dl>
          </div>
        )}
      </Modal>
      {toast}
    </>
  );
}

const Row = ({ children }) => <>{children}</>;

function WallCell({ cell, source, isDm, onOpen, type, month }) {
  if (!cell) return <div className="wall-c"><span className="wall-empty">本月未出</span></div>;
  if (cell.state === "pending") return <div className={`wall-c${isDm ? " is-dm" : ""}`}><button type="button" className="wall-empty is-pending" onClick={onOpen}><PixelIcon name="clock" />待交付<span className="small">{cell.note}</span></button></div>;
  if (cell.state === "skip") return <div className={`wall-c${isDm ? " is-dm" : ""}`}><span className="wall-empty"><PixelIcon name="close" />本月不出</span></div>;
  // 沿用：画被沿用那张的线框缩略图，写明来自哪个月、哪一版（二次评审 P2-7）
  if (cell.state === "reuse") return (
    <div className={`wall-c${isDm ? " is-dm" : ""}`}>
      <button type="button" className="wall-file" data-dither="" onClick={onOpen} aria-label={`${month} ${type} 沿用 ${cell.from}`}>
        <Thumb kind="poster" title={type} big={source?.big} outline />
        <span className="wall-meta"><span>沿用 {cell.from.slice(5)} 月{source?.version ? ` · v${source.version}` : ""}</span></span>
      </button>
    </div>
  );
  return (
    <div className={`wall-c${isDm ? " is-dm" : ""}`}>
      <button type="button" className="wall-file" data-dither="" onClick={onOpen} aria-label={`${month} ${type}`}>
        <Thumb kind="poster" title={type} big={cell.big} accent={cell.accent} />
        <span className="wall-meta"><span>v{cell.version}</span><span>新做</span></span>
      </button>
    </div>
  );
}

/* ---------- 设计参考：自由画布 ---------- */
// 粘贴、拖入、上传的图片和挪动位置先只在页面上；点「预览保存」把整张画布（分区 + 全部参考项）生成预览，
// 新图片在预览时压缩，确认后才写入本地并回读。只收 PNG、JPEG、WEBP，小于 8MB。
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
const REF_KEYS = ["id", "x", "y", "w", "kind", "title", "tags", "source", "big", "accent", "src", "imageDataUrl"];
const cleanRef = (i) => Object.fromEntries(REF_KEYS.filter((k) => i[k] !== undefined && !(k === "src" && i.imageDataUrl)).map((k) => [k, i[k]]));

function RefCanvas() {
  const state = useApi("/api/v3/refs");
  const [fresh, setFresh] = useState(null);
  const [notice, setNotice] = useState("");
  return <Loadable state={state} name="设计参考" big>{(data) => { const d = fresh || data; return <><SavedNote text={notice} onClose={() => setNotice("")} /><Canvas key={JSON.stringify(d).length + (fresh ? 1 : 0)} data={d} onSaved={(back, text = "") => { setFresh(back); setNotice(text); }} onEdit={() => setNotice("")} /></>; }}</Loadable>;
}

function Canvas({ data, onSaved, onEdit }) {
  const [items, setItemsRaw] = useState(data.items);
  const [sel, setSel] = useState(null);
  const [tag, setTag] = useState("");
  const [zoom, setZoom] = useState(1);
  const [toast, showToast] = useToast();
  const flow = useWriteFlow();
  const wrap = useRef(null), drag = useRef(null);
  const locked = flow.busy || flow.phase === "unknown";
  const setItems = (fn) => { if (locked) return; setItemsRaw(fn); flow.reset(); onEdit(); };
  const tags = [...new Set(items.flatMap((i) => i.tags))];
  const selected = items.find((i) => i.id === sel);
  const dirty = JSON.stringify(items.map(cleanRef)) !== JSON.stringify(data.items.map(cleanRef));
  const addImage = (file) => {
    if (!file || locked) return;
    if (!IMG_TYPES.includes(file.type)) { showToast("只收 PNG、JPEG、WEBP 图片"); return; }
    if (file.size > 8 * 1024 * 1024) { showToast("图片要小于 8MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const id = `p${Date.now()}`;
      const box = wrap.current.getBoundingClientRect();
      setItems((old) => [...old, { id, x: Math.round((wrap.current.scrollLeft + box.width / 2 - 90) / zoom / 8) * 8, y: Math.round((wrap.current.scrollTop + 80) / zoom / 8) * 8, w: 180, imageDataUrl: reader.result, title: file.name || "粘贴的图片", tags: ["未分类"], source: "本机粘贴" }]);
      setSel(id);
    };
    reader.readAsDataURL(file);
  };
  useEffect(() => {
    const paste = (e) => { const f = [...(e.clipboardData?.files || [])][0]; if (f) { e.preventDefault(); addImage(f); } };
    addEventListener("paste", paste);
    return () => removeEventListener("paste", paste);
  });
  const down = (e) => {
    const el = e.target.closest(".ref");
    if (e.target.closest(".canvas-zoom, .canvas-info")) return;
    if (el) { const it = items.find((i) => i.id === el.dataset.id); drag.current = { id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, moved: false }; }
    else drag.current = { pan: true, sx: e.clientX, sy: e.clientY, ox: wrap.current.scrollLeft, oy: wrap.current.scrollTop };
    wrap.current.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    if (d.pan) { wrap.current.scrollLeft = d.ox - (e.clientX - d.sx); wrap.current.scrollTop = d.oy - (e.clientY - d.sy); return; }
    if (locked) return;
    const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom;
    d.moved = d.moved || Math.abs(dx) + Math.abs(dy) > 3;
    if (d.moved) setItems((old) => old.map((i) => i.id === d.id ? { ...i, x: Math.round((d.ox + dx) / 8) * 8, y: Math.round((d.oy + dy) / 8) * 8 } : i));
  };
  const up = () => { const d = drag.current; drag.current = null; if (d && !d.pan && !d.moved) setSel(d.id); if (d?.pan) setSel(null); };
  const added = items.filter((i) => i.imageDataUrl).length;
  const removed = data.items.filter((o) => !items.some((i) => i.id === o.id)).length;
  const preview = () => flow.preview(() => apiSend("POST", "/api/v3/refs/preview", { zones: data.zones, items: items.map(cleanRef) }));
  const confirm = () => flow.confirm(
    (pv) => apiSend("POST", "/api/v3/refs", { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      const back = await apiSend("GET", "/api/v3/refs");
      const ok = JSON.stringify(back) === JSON.stringify(pv.value);
      if (ok) onSaved(back, `画布已保存（${back.items.length} 个参考项），回读核对一致`);
      return ok;
    },
  );
  const reread = async () => { const back = await apiSend("GET", "/api/v3/refs"); flow.resolve(); onSaved({ ...back }); };
  return (
    <>
      <div className="toolbar">
        <span className="label"><PixelIcon name="filter" /> 标签</span>
        <button type="button" className={`chip${!tag ? " is-on" : ""}`} onClick={() => setTag("")}>全部 <span className="tnum">{items.length}</span></button>
        {tags.map((t) => <button key={t} type="button" className={`chip${tag === t ? " is-on" : ""}`} onClick={() => setTag(tag === t ? "" : t)}>{t}</button>)}
        <span className="spacer" />
        <span className="small muted"><kbd>⌘V</kbd> 粘贴截图 · 拖入图片 · 拖动卡片移动（吸附 8px）</span>
        <label className="btn"><PixelIcon name="upload" />上传<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { addImage(e.target.files[0]); e.target.value = ""; }} /></label>
        <PendingButton task="V3-接口清单"><PixelIcon name="star" />从数码世界收藏导入</PendingButton>
        <Button variant="primary" disabled={!dirty || locked} onClick={preview}><PixelIcon name="eye" />预览保存</Button>
      </div>
      {dirty && flow.phase === "idle" && <p className="small warn-text">画布有改动还没保存（新图片 {added} 张）；点「预览保存」确认后才写入。</p>}
      <WriteBox flow={flow} title="参考画布保存预览" onConfirm={confirm} onRepreview={preview} onReread={reread}>
        {(pv) => <dl className="kv">
          <dt>参考项</dt><dd>{pv.value.items.length} 个（原 {data.items.length} 个{removed ? `，去掉 ${removed} 个` : ""}）</dd>
          <dt>新图片</dt><dd>{added} 张，压缩后共 {Math.round((pv.imageBytes || 0) / 1024)} KB</dd>
          <dt>写到哪里</dt><dd>工作台本地；图片只存本机，只有画布引用的图片能读</dd>
        </dl>}
      </WriteBox>
      <div className="canvas-wrap" ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addImage(e.dataTransfer.files[0]); }}>
        <div className="canvas-board" style={{ transform: `scale(${zoom})` }}>
          {data.zones.map((z) => <div key={z.name} className="zone" style={{ left: z.x, top: z.y, width: z.w, height: z.h }}><span>{z.name}</span></div>)}
          {!items.length && <div className="canvas-empty"><PixelIcon name="canvas" size={28} /><strong>画布是空的</strong><span>粘贴截图、拖入或上传图片；保存前会先预览。</span></div>}
          {items.map((i) => (
            <figure key={i.id} data-id={i.id} className={`ref${sel === i.id ? " is-sel" : ""}${tag && !i.tags.includes(tag) ? " is-dim" : ""}${i.imageDataUrl ? " is-new" : ""}`} style={{ left: i.x, top: i.y, width: i.w }}>
              <Thumb src={i.imageDataUrl || i.src} kind={i.kind || "poster"} title={i.title} big={i.big} accent={i.accent} />
              <figcaption><span>{i.title}</span><span className="mono">{i.imageDataUrl ? "未保存" : i.tags[0]}</span></figcaption>
            </figure>
          ))}
        </div>
        {selected && (
          <div className="canvas-info">
            <div className="row"><strong>{selected.title}</strong>{selected.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
            <div className="row"><span className="small muted">{selected.source}</span><span className="spacer" />
              <Button className="btn btn-xs" onClick={() => { setItems((old) => old.filter((x) => x.id !== selected.id)); setSel(null); }} disabled={locked}><PixelIcon name="close" />从画布拿掉</Button></div>
          </div>
        )}
        <div className="canvas-zoom">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} aria-label="缩小">−</button>
          <span className="tnum">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(1.5, z + 0.25))} aria-label="放大">+</button>
        </div>
      </div>
      {toast}
    </>
  );
}
