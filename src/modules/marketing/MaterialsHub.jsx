import { useEffect, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import PastMarketingCanvas from "./PastMarketingCanvas.jsx";
import DesignReferences from "./DesignReferences.jsx";
import { href } from "../../router.js";
import { Button, Loadable, Modal, Segmented } from "../../ui/components.jsx";
import Thumb from "../../ui/Thumb.jsx";
import MaterialsView from "./MaterialsView.jsx";
import CacheImageWarning from "../../ui/CacheImageWarning.jsx";


// 物料（v3）：原件在公司 NAS（用户在 Finder 用 SMB 挂载），工作台只读扫描、本地只存缩略图。
// 页签：月度物料 · 过往营销图片画布 · 设计参考帖子收藏。旧本地物料地址保留兼容。
const VIEWS = [["wall", "月度物料"], ["refs", "过往营销"], ["design", "设计参考"]];
const NAS_LINES = [["大学辅导", "大学辅导"], ["国际课程", "国际课程"]];
// 物料上传走网页中台（群晖 File Station），直接打开「月度物料」文件夹；工作台本身不写 NAS。
const NAS_WEB = "https://172-16-1-10.lumistedu.direct.quickconnect.cn:10001/";
const NAS_UPLOAD_URL = `${NAS_WEB}?launchApp=SYNO.SDS.App.FileStation3.Instance&launchParam=${encodeURIComponent(`openfile=${encodeURIComponent("/跨部门综合资料/8.月度物料/")}`)}`;

export default function MaterialsHub({ route = [] }) {
  const view = route[0] === "local" || VIEWS.some(([k]) => k === route[0]) ? route[0] : "wall";
  return (
    <>
      <div className="toolbar">
        <Segmented options={VIEWS} value={view} onChange={(v) => { location.hash = href("marketing", "materials", v); }} />
      </div>
      {view === "local" ? <MaterialsView /> : view === "refs" ? <PastMarketingCanvas /> : view === "design" ? <DesignReferences /> : <NasWall />}
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
  const [dismissed, setDismissed] = useState("");
  useEffect(() => { setDismissed(""); }, [nas.warning]);
  const data = nas.lines[line];
  return (
    <>
      <NasBar nas={nas} onScanned={onScanned} />
      <CacheImageWarning text={dismissed === nas.warning ? "" : nas.warning} onClose={() => setDismissed(nas.warning)} />
      <div className="toolbar">
        <Segmented options={NAS_LINES} value={line} onChange={setLine} />
        <span className="small muted">按文件名关键词识别：{data.types.map((t) => `${t.key}「${t.keyword}」`).join(" · ")}；同名活动只留第一张，不扫「营销物料」文件夹</span>
      </div>
      <div className="wall-wrap"><div className="wall" style={{ "--cols": nas.months.length }}>
        <div className="wall-h">类型</div>
        {nas.months.map((m) => <div key={m} className="wall-h"><span className="tnum">{m}</span></div>)}
        {data.types.map((t) => (
          <Row key={t.key}>
            <div className="wall-t"><strong>{t.key}</strong><span className="small muted">关键词「{t.keyword}」{t.many ? " · 每个活动一张" : ""}</span></div>
            {nas.months.map((m) => <WallCell key={m} items={data.cells[`${m}|${t.key}`] || []} many={t.many} onOpen={(item) => setOpen({ month: m, type: t.key, item })} />)}
          </Row>
        ))}
      </div>
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
      {many ? <div className={`wall-acts${items.length === 1 ? " is-single" : ""}`} role="region" aria-label="活动海报" tabIndex={0}>{items.map((item) => <PosterCard key={item.id} item={item} label={item.name} onOpen={() => onOpen(item)} />)}</div>
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
