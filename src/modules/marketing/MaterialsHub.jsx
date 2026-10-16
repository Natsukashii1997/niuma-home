import { useEffect, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Loadable, Modal, SampleBadge, Segmented, Tag, useToast } from "../../ui/components.jsx";
import Thumb from "../../ui/Thumb.jsx";
import { deliveryMonth } from "../../constants.js";
import { SAMPLE_NAS, SAMPLE_REFS } from "../../samples/v3.js";
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
  return <Loadable state={state}>{(nas) => <NasBoard nas={nas} view={view} sample={state.isSample ? state.task : null} />}</Loadable>;
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
              {nas.months.map((m) => <WallCell key={m} cell={nas.cells[`${m}|${t.key}`]} type={t.key} month={m} isDm={m === dm} onOpen={() => setOpen({ month: m, type: t.key, cell: nas.cells[`${m}|${t.key}`] })} />)}
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
          <Button onClick={() => showToast("NAS 不在内网时无法打开原图（示例）")}><PixelIcon name="external" />打开原图</Button>
          <Button variant="primary" onClick={() => { setOpen(null); showToast(`已在 ${dm} brief 中标记沿用（示例，未写入）`); }}><PixelIcon name="brief" />在 {dm.slice(5)} 月 brief 中沿用</Button>
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

function WallCell({ cell, isDm, onOpen, type, month }) {
  if (!cell) return <div className="wall-c"><span className="wall-empty">本月未出</span></div>;
  if (cell.state === "pending") return <div className={`wall-c${isDm ? " is-dm" : ""}`}><button type="button" className="wall-empty is-pending" onClick={onOpen}><PixelIcon name="clock" />待交付<span className="small">{cell.note}</span></button></div>;
  if (cell.state === "skip") return <div className={`wall-c${isDm ? " is-dm" : ""}`}><span className="wall-empty"><PixelIcon name="close" />本月不出</span></div>;
  if (cell.state === "reuse") return <div className={`wall-c${isDm ? " is-dm" : ""}`}><button type="button" className="wall-empty is-reuse" onClick={onOpen}><PixelIcon name="refresh" />沿用 {cell.from.slice(5)} 月</button></div>;
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
function RefCanvas() {
  const state = useApi("/api/v3/refs", SAMPLE_REFS);
  return <Loadable state={state}>{(data) => <Canvas data={data} sample={state.isSample ? state.task : null} />}</Loadable>;
}

function Canvas({ data, sample }) {
  const [items, setItems] = useState(data.items);
  const [sel, setSel] = useState(null);
  const [tag, setTag] = useState("");
  const [zoom, setZoom] = useState(1);
  const [toast, showToast] = useToast();
  const wrap = useRef(null), drag = useRef(null);
  const tags = [...new Set(items.flatMap((i) => i.tags))];
  const selected = items.find((i) => i.id === sel);
  const addImage = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const id = `p${Date.now()}`;
    const box = wrap.current.getBoundingClientRect();
    setItems((old) => [...old, { id, x: Math.round((wrap.current.scrollLeft + box.width / 2 - 90) / zoom / 8) * 8, y: Math.round((wrap.current.scrollTop + 80) / zoom / 8) * 8, w: 180, src: url, title: file.name || "粘贴的图片", tags: ["未分类"], source: "刚粘贴" }]);
    setSel(id);
    showToast("已放到画布（示例：仅本次会话，未上传）");
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
    const dx = (e.clientX - d.sx) / zoom, dy = (e.clientY - d.sy) / zoom;
    d.moved = d.moved || Math.abs(dx) + Math.abs(dy) > 3;
    setItems((old) => old.map((i) => i.id === d.id ? { ...i, x: Math.round((d.ox + dx) / 8) * 8, y: Math.round((d.oy + dy) / 8) * 8 } : i));
  };
  const up = () => { const d = drag.current; drag.current = null; if (d && !d.pan && !d.moved) setSel(d.id); if (d?.pan) setSel(null); };
  return (
    <>
      <div className="toolbar">
        <span className="label"><PixelIcon name="filter" /> 标签</span>
        <button type="button" className={`chip${!tag ? " is-on" : ""}`} onClick={() => setTag("")}>全部 <span className="tnum">{items.length}</span></button>
        {tags.map((t) => <button key={t} type="button" className={`chip${tag === t ? " is-on" : ""}`} onClick={() => setTag(tag === t ? "" : t)}>{t}</button>)}
        <span className="spacer" />
        {sample && <SampleBadge task={sample} />}
        <span className="small muted"><kbd>⌘V</kbd> 粘贴截图 · 拖入图片 · 拖动卡片移动（吸附 8px）</span>
        <label className="btn"><PixelIcon name="upload" />上传<input type="file" accept="image/*" hidden onChange={(e) => addImage(e.target.files[0])} /></label>
        <Button onClick={() => showToast("将从数码世界收藏导入（接口待实现）")}><PixelIcon name="star" />从数码世界收藏导入</Button>
      </div>
      <div className="canvas-wrap" ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); addImage(e.dataTransfer.files[0]); }}>
        <div className="canvas-board" style={{ transform: `scale(${zoom})` }}>
          {data.zones.map((z) => <div key={z.name} className="zone" style={{ left: z.x, top: z.y, width: z.w, height: z.h }}><span>{z.name}</span></div>)}
          {items.map((i) => (
            <figure key={i.id} data-id={i.id} className={`ref${sel === i.id ? " is-sel" : ""}${tag && !i.tags.includes(tag) ? " is-dim" : ""}`} style={{ left: i.x, top: i.y, width: i.w }}>
              <Thumb src={i.src} kind={i.kind || "poster"} title={i.title} big={i.big} accent={i.accent} />
              <figcaption><span>{i.title}</span><span className="mono">{i.tags[0]}</span></figcaption>
            </figure>
          ))}
        </div>
        {selected && (
          <div className="canvas-info">
            <div className="row"><strong>{selected.title}</strong>{selected.tags.map((t) => <Tag key={t}>{t}</Tag>)}</div>
            <div className="row"><span className="small muted">{selected.source}</span><span className="spacer" /><a className="btn btn-xs" href={href("marketing", "brief")}><PixelIcon name="brief" />加入 brief 参考</a></div>
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
