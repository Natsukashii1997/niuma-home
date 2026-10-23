import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "./bitmap.jsx";
import { apiSend } from "../api.js";
import { beijingTime } from "../constants.js";
import { Button } from "./components.jsx";
import { WriteBox, useWriteFlow } from "./write-flow.jsx";

// Brief 按月同步原文档；已采纳需求的策略继续只新建文档。
// 预览写清楚目标文件夹（真实名称和链接）、新文档标题和全文，确认后才创建；创建后由后端回读全文核对，页面再读一次操作记录确认成功。
// 结果不明（EXPORT_RESULT_UNKNOWN）时保留操作记录，只提供「只读核对」，绝不自动重试创建。
export function FeishuExport({ what, previewPath, confirmPath, statusBase, extra = {}, disabled = false, disabledNote = "", oneClick = false, fixedTarget = null, onLockChange, beforeCreate, syncExisting=false, linkedDocument=null }) {
  const [open, setOpen] = useState(oneClick);
  const [target, setTarget] = useState("");
  const [check, setCheck] = useState({ busy: false, note: "", error: "" });
  const [done, setDone] = useState(null); // 只读核对后确认成功的收据
  const [remoteConflict,setRemoteConflict]=useState(null);
  const flow = useWriteFlow();
  const creating=useRef(false);
  useEffect(()=>{onLockChange?.(flow.busy || flow.phase==='unknown');},[flow.busy,flow.phase,onLockChange]);
  const previewBody = () => ({ ...(fixedTarget ? {} : { targetUrl: target.trim() }), ...extra });
  const preview = () => { setDone(null); flow.preview(() => apiSend("POST", previewPath, previewBody())); };
  const confirm = () => flow.confirm(
    (pv) => apiSend("POST", confirmPath, { previewId: pv.previewId, confirm: true }),
    async (receipt) => {
      if (!receipt?.operationId) return false;
      const s = await apiSend("GET", `${statusBase}/${encodeURIComponent(receipt.operationId)}`);
      const ok=s.status === "success" && Boolean(s.document?.url);
      if(ok)setDone(s);
      return ok;
    },
  );
  const createOnce=async(overrides={})=>{
    if(disabled || creating.current || flow.busy || flow.phase==='unknown')return;
    creating.current=true;onLockChange?.(true);setDone(null);setRemoteConflict(null);
    try {
      const pv=await flow.preview(async()=>{const prepared=await beforeCreate?.();try{return await apiSend('POST',previewPath,{...previewBody(),...prepared,...overrides});}catch(e){if(e.body?.conflict)setRemoteConflict(e.body.conflict);throw e;}});
      if(pv)await confirm();
    }finally{creating.current=false;}
  };
  // 结果不明：只读核对原操作记录里的文档，不再调用创建。
  async function reconcile() {
    const id = flow.receipt?.operationId;
    if (!id) { setCheck({ busy: false, note: "", error: "没有拿到操作记录编号，无法自动核对。请到目标文件夹人工检查是否已经有这篇文档；工作台不会自动重试。" }); return; }
    setCheck({ busy: true, note: "", error: "" });
    try {
      const r = await apiSend("POST", `${statusBase}/${encodeURIComponent(id)}/reconcile`, {});
      if (r.status === "success") { setDone(r); flow.resolve(); setCheck({ busy: false, note: "", error: "" }); }
      else setCheck({ busy: false, note: `${r.verificationNote || "仍未能确认"}${r.sourceChanged ? "；配置已变化，核对仍针对原文档" : ""}`, error: "" });
    } catch (e) { setCheck({ busy: false, note: "", error: e.message }); }
  }
  const receipt = done || (flow.phase === "saved" ? flow.receipt : null);
  const shownDocument=receipt?.document || linkedDocument;
  return (
    <div className="feishu-export">
      {!open ? (
        <Button onClick={() => setOpen(true)} disabled={disabled} title={disabled ? disabledNote : ""}><PixelIcon name="external" />导出到飞书</Button>
      ) : (
        <div className="export-form">
          <div className="row">
            {fixedTarget ? <span className="export-target small muted">{syncExisting?"同步位置":"默认创建到"} <a className="link" href={fixedTarget.url} target="_blank" rel="noreferrer">{fixedTarget.label}</a></span> : <label className="export-target"><span className="small muted">目标文件夹链接</span>
              <input value={target} onChange={(e) => { setTarget(e.target.value); flow.reset(); }} placeholder="https://租户.feishu.cn/drive/folder/…" disabled={disabled || flow.busy || flow.phase === "unknown"} />
            </label>}
            <Button onClick={oneClick?()=>createOnce():preview} disabled={disabled || (!fixedTarget && !target.trim()) || flow.busy || flow.phase === "unknown"}><PixelIcon name="external" />{oneClick?(syncExisting?"同步到飞书":"一键创建飞书文档"):"预览导出"}</Button>
            {!oneClick && <button type="button" className="link-btn" onClick={() => { if (!flow.busy && flow.phase !== "unknown") { setOpen(false); flow.reset(); } }}>收起</button>}
          </div>
          <p className="small muted">{syncExisting?"首次创建文档，之后更新本月同一篇；先自动保存最新内容，飞书里补充的未改章节会保留。":oneClick?"点击后先自动保存最新填写内容，再创建新文档；相同内容重复点击会返回原文档链接。":`只在这个文件夹里新建一篇${what}文档，确认前不会写飞书。`}</p>
        </div>
      )}
      {oneClick && flow.busy && <p className="small muted">{syncExisting?"正在核对并同步原文档… 同步期间请暂缓编辑飞书原文档。":"正在核对目录、创建并回读文档…"}</p>}
      {!remoteConflict && (!oneClick || !["previewing","preview","confirming"].includes(flow.phase)) && <WriteBox flow={flow} title={`导出${what}预览`} confirmLabel="确认在飞书新建文档" savedText={syncExisting?(flow.receipt?.mode==="unchanged"?"内容已是最新，未重复写入":"已同步到飞书，回读核对一致"):"已在飞书新建文档，回读核对一致"} onConfirm={confirm} onRepreview={oneClick?()=>createOnce():preview} onReread={reconcile}>
        {(pv) => (
          <>
            <dl className="kv">
              <dt>目标文件夹</dt><dd>{pv.target?.title || "（未读到名称）"} · <a className="link" href={pv.target?.url} target="_blank" rel="noreferrer">{pv.target?.url}</a></dd>
              <dt>新文档标题</dt><dd><strong>{pv.title}</strong></dd>
              <dt>方式</dt><dd>{pv.mode === "new-only" ? "只新建，不覆盖旧文档" : pv.mode}</dd>
            </dl>
            <span className="small muted">全文（共 {pv.markdown?.length || 0} 字）</span>
            <pre>{pv.markdown}</pre>
          </>
        )}
      </WriteBox>}
      {remoteConflict && <div className="write-box brief-conflicts"><strong>以下章节两边都有修改，请核对</strong>
        <p className="small">飞书原文档：<a className="link" href={remoteConflict.document.url} target="_blank" rel="noreferrer">打开查看</a>。未发生冲突的飞书补充内容会保留。</p>
        {remoteConflict.sections.map(s=><details key={s.key}><summary>{s.label}</summary><p className="small muted">工作台内容</p><pre>{s.local||'（空白）'}</pre><p className="small muted">飞书当前内容</p><pre>{s.remote||'（空白）'}</pre></details>)}
        <div className="row"><Button disabled={flow.busy} onClick={()=>createOnce({resolveConflict:remoteConflict.id})}>用工作台更新这些冲突章节</Button><Button onClick={()=>{setRemoteConflict(null);flow.resolve();}}>保留飞书，暂不同步</Button></div>
      </div>}
      {check.busy && <p className="small muted">正在只读核对…</p>}
      {check.note && <p className="small warn-text">{check.note}。可以稍后再核对一次；不会重新创建。</p>}
      {check.error && <p className="small risk-text">{check.error}</p>}
      {shownDocument?.url && <p className="small ok-text">文档：<a className="link" href={shownDocument.url} target="_blank" rel="noreferrer">{receipt?.title || linkedDocument?.title || shownDocument.url}</a>{receipt?.verifiedAt ? ` · 核对于 ${beijingTime(receipt.verifiedAt)}` : ""}</p>}
    </div>
  );
}
