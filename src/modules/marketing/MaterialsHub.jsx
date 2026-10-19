import { useEffect, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { href } from "../../router.js";
import { Button, Loadable, Modal, Segmented, Tag, useToast } from "../../ui/components.jsx";
import Thumb from "../../ui/Thumb.jsx";
import MaterialsView from "./MaterialsView.jsx";
import { DigiworldImport } from "./DigiworldImport.jsx";

// 物料（v3）：原件在公司 NAS（用户在 Finder 用 SMB 挂载），工作台只读扫描、本地只存缩略图。
// 页签：物料墙（大学辅导 / 国际课程，类型 × 月份，按文件名关键词识别）· 设计参考（画布）· 本地物料（原 T03，NAS 不可用时的兜底）。
const VIEWS = [["wall", "物料墙"], ["refs", "设计参考"], ["local", "本地物料"]];
const NAS_LINES = [["大学辅导", "大学辅导"], ["国际课程", "国际课程"]];
// 物料上传走网页中台（群晖 File Station），直接打开「月度物料」文件夹；工作台本身不写 NAS。
const NAS_WEB = "https://172-16-1-10.lumistedu.direct.quickconnect.cn:10001/";
const NAS_UPLOAD_URL = `${NAS_WEB}?launchApp=SYNO.SDS.App.FileStation3.Instance&launchParam=${encodeURIComponent(`openfile=${encodeURIComponent("/跨部门综合资料/8.月度物料/")}`)}`;

export default function MaterialsHub({ route = [] }) {
  const view = VIEWS.some(([k]) => k === route[0]) ? route[0] : "wall";
  return (
    <>
      <div className="toolbar">
        <Segmented options={VIEWS} value={view} onChange={(v) => { location.hash = href("marketing", "materials", v); }} />
      </div>
      {view === "local" ? <MaterialsView /> : view === "refs" ? <RefCanvas /> : <NasWall />}
    </>
  );
}

function NasWall() {
  const state = useApi("/api/v3/nas");
  const [fresh, setFresh] = useState(null);
  return <Loadable state={state} name="NAS 物料（首次会扫描 NAS，约半分钟）" big>{(data) => <NasBoard nas={fresh || data} onScanned={setFresh} />}</Loadable>;
}

function NasBar({ nas, onScanned }) {
  const [scan, setScan] = useState(null);
  const [error, setError] = useState("");
  const run = async () => {
    setScan("run"); setError("");
    try { onScanned(await apiSend("POST", "/api/v3/nas/scan")); setScan("done"); setTimeout(() => setScan(null), 1200); }
    catch (e) { setScan(null); setError(e.message); }
  };
  return (
    <div className="nas-bar">
      <span className={`nas-state${nas.reachable ? "" : " is-off"}`}>{nas.reachable ? "NAS 已挂载 · 只读" : "NAS 未挂载 · 显示上次扫描的缩略图"}</span>
      <span className="mono small" title={nas.root}><PixelIcon name="folder" /> {nas.root.split("/").slice(-2).join("/")}/YYYY-M月/</span>
      <span className="small muted">上次扫描 {nas.lastScanAt} · 缩略图 {(nas.thumbBytes / 1048576).toFixed(1)} MB</span>
      <span className="spacer" />
      {error && <span className="small nas-error">{error}</span>}
      {scan ? <div className="nas-scan"><StepProgress label="扫描 NAS" done={scan === "done"} /></div> : null}
      <Button onClick={run} disabled={scan === "run"}><PixelIcon name="refresh" />重新扫描</Button>
      <a className="btn btn-default" href={NAS_UPLOAD_URL} target="_blank" rel="noreferrer" title="在网页中台打开 跨部门综合资料/8.月度物料"><PixelIcon name="upload" />物料上传</a>
    </div>
  );
}

function NasBoard({ nas, onScanned }) {
  const [line, setLine] = useState("大学辅导");
  const [open, setOpen] = useState(null);
  const data = nas.lines[line];
  return (
    <>
      <NasBar nas={nas} onScanned={onScanned} />
      <div className="toolbar">
        <Segmented options={NAS_LINES} value={line} onChange={setLine} />
        <span className="small muted">按文件名关键词识别：{data.types.map((t) => `${t.key}「${t.keyword}」`).join(" · ")}；同名活动只留第一张，不扫「营销物料」文件夹</span>
      </div>
      <div className="wall" style={{ "--cols": nas.months.length }}>
        <div className="wall-h">类型</div>
        {nas.months.map((m) => <div key={m} className="wall-h"><span className="tnum">{m}</span></div>)}
        {data.types.map((t) => (
          <Row key={t.key}>
            <div className="wall-t"><strong>{t.key}</strong><span className="small muted">关键词「{t.keyword}」{t.many ? " · 每个活动一张" : ""}</span></div>
            {nas.months.map((m) => <WallCell key={m} items={data.cells[`${m}|${t.key}`] || []} many={t.many} onOpen={(item) => setOpen({ month: m, type: t.key, item })} />)}
          </Row>
        ))}
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} wide icon="image" title={open ? `${line} · ${open.month} · ${open.type}${open.item.name !== open.type ? ` · ${open.item.name}` : ""}` : ""}
        footer={open && (nas.reachable
          ? <a className="btn btn-default" href={`/api/v3/nas/original/${open.item.id}`} target="_blank" rel="noreferrer"><PixelIcon name="external" />打开原图</a>
          : <span className="small muted">NAS 未挂载，暂时打不开原图</span>)}>
        {open && (
          <div className="viewer">
            <div className="viewer-stage"><Thumb src={open.item.thumb} title={open.item.file} /></div>
            <dl className="kv">
              <dt>文件</dt><dd>{open.item.file}</dd>
              <dt>NAS 路径</dt><dd className="mono small">{open.item.path}</dd>
              <dt>大小</dt><dd className="tnum">{(open.item.size / 1048576).toFixed(1)} MB</dd>
              {open.item.others.length > 0 && <><dt>同类未选</dt><dd className="small muted">{open.item.others.map((p) => p.split("/").pop()).join("、")}</dd></>}
              <dt>说明</dt><dd className="small muted">本地只缓存缩略图；原图从 NAS 读取，需要连公司网络并挂载 NAS。</dd>
            </dl>
          </div>
        )}
      </Modal>
    </>
  );
}

const Row = ({ children }) => <>{children}</>;

// 活动海报一格多张：固定两列网格、统一尺寸，名字最多两行，按名称排序（与 NAS 里看到的顺序一致）。
function WallCell({ items, many, onOpen }) {
  if (!items.length) return <div className="wall-c"><span className="wall-empty"><PixelIcon name="close" />没识别到</span></div>;
  return (
    <div className={`wall-c${many ? " is-many" : ""}`}>
      {many ? <div className="wall-acts">{items.map((item) => <PosterCard key={item.id} item={item} label={item.name} onOpen={() => onOpen(item)} />)}</div>
        : items.map((item) => <PosterCard key={item.id} item={item} label={item.file.replace(/\.[^.]+$/, "")} onOpen={() => onOpen(item)} />)}
    </div>
  );
}

function PosterCard({ item, label, onOpen }) {
  return (
    <button type="button" className="wall-file" onClick={onOpen} aria-label={item.file} title={item.path}>
      <Thumb src={item.thumb} title={item.file} />
      <span className="wall-meta"><span className="wall-name">{label}</span>{item.others.length > 0 && <span className="tnum">+{item.others.length}</span>}</span>
    </button>
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
  const [importing, setImporting] = useState(false);
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
  // 从数码世界加进来的图：排在现有参考项下面新起一行（每行 6 张），和粘贴的图一样先不保存。
  const addImported = (list) => {
    const top = items.length ? Math.max(...items.map((i) => i.y)) + 320 : 40;
    const stamp = Date.now();
    setItems((old) => [...old, ...list.map((x, k) => ({ id: `dw${stamp}${k}`, x: 40 + (k % 6) * 200, y: top + Math.floor(k / 6) * 320, w: 180, imageDataUrl: x.dataUrl, title: x.title, tags: x.tags, source: x.source }))]);
    showToast(`已把 ${list.length} 张图加到画布，点「预览保存」确认后才写入`);
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
        <Button onClick={() => setImporting(true)} disabled={locked}><PixelIcon name="star" />从数码世界收藏导入</Button>
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
      {importing && <DigiworldImport open onClose={() => setImporting(false)} items={items} onAdd={addImported} />}{/* 每次打开重新挂载：重新读取收藏、重新按默认分组勾选 */}
      {toast}
    </>
  );
}
