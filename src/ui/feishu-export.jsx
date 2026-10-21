import { useEffect, useState } from "react";
import { PixelIcon } from "./bitmap.jsx";
import { apiSend } from "../api.js";
import { Button } from "./components.jsx";
import { WriteBox, useWriteFlow } from "./write-flow.jsx";

// 导出到飞书（brief、已采纳需求的策略共用）：只新建文档，不覆盖旧文档。
// 预览写清楚目标文件夹（真实名称和链接）、新文档标题和全文，确认后才创建；创建后由后端回读全文核对，页面再读一次操作记录确认成功。
// 结果不明（EXPORT_RESULT_UNKNOWN）时保留操作记录，只提供「只读核对」，绝不自动重试创建。
export function FeishuExport({ what, previewPath, confirmPath, statusBase, extra = {}, disabled = false, disabledNote = "", oneClick = false, fixedTarget = null, onLockChange }) {
  const [open, setOpen] = useState(oneClick);
  const [target, setTarget] = useState("");
  const [check, setCheck] = useState({ busy: false, note: "", error: "" });
  const [done, setDone] = useState(null); // 只读核对后确认成功的收据
  const flow = useWriteFlow();
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
  const createOnce=async()=>{
    if(disabled || flow.busy || flow.phase==='unknown')return;
    setDone(null);
    const pv=await flow.preview(()=>apiSend('POST',previewPath,previewBody()));
    if(pv)await confirm();
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
  return (
    <div className="feishu-export">
      {!open ? (
        <Button onClick={() => setOpen(true)} disabled={disabled} title={disabled ? disabledNote : ""}><PixelIcon name="external" />导出到飞书</Button>
      ) : (
        <div className="export-form">
          <div className="row">
            {fixedTarget ? <span className="export-target small muted">默认创建到 <a className="link" href={fixedTarget.url} target="_blank" rel="noreferrer">{fixedTarget.label}</a></span> : <label className="export-target"><span className="small muted">目标文件夹链接</span>
              <input value={target} onChange={(e) => { setTarget(e.target.value); flow.reset(); }} placeholder="https://租户.feishu.cn/drive/folder/…" disabled={disabled || flow.busy || flow.phase === "unknown"} />
            </label>}
            <Button onClick={oneClick?createOnce:preview} disabled={disabled || (!fixedTarget && !target.trim()) || flow.busy || flow.phase === "unknown"}><PixelIcon name="external" />{oneClick?"一键创建飞书文档":"预览导出"}</Button>
            {!oneClick && <button type="button" className="link-btn" onClick={() => { if (!flow.busy && flow.phase !== "unknown") { setOpen(false); flow.reset(); } }}>收起</button>}
          </div>
          <p className="small muted">{oneClick?"点击后用当前已保存内容创建新文档，保留空白框架；相同内容重复点击会返回原文档链接。":`只在这个文件夹里新建一篇${what}文档，确认前不会写飞书。`}</p>
        </div>
      )}
      {oneClick && flow.busy && <p className="small muted">正在核对目录、创建并回读文档…</p>}
      {(!oneClick || !["previewing","preview","confirming"].includes(flow.phase)) && <WriteBox flow={flow} title={`导出${what}预览`} confirmLabel="确认在飞书新建文档" savedText="已在飞书新建文档，回读核对一致" onConfirm={confirm} onRepreview={preview} onReread={reconcile}>
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
      {check.busy && <p className="small muted">正在只读核对…</p>}
      {check.note && <p className="small warn-text">{check.note}。可以稍后再核对一次；不会重新创建。</p>}
      {check.error && <p className="small risk-text">{check.error}</p>}
      {receipt?.document?.url && <p className="small ok-text">文档：<a className="link" href={receipt.document.url} target="_blank" rel="noreferrer">{receipt.title || receipt.document.url}</a>{receipt.verifiedAt ? ` · 核对于 ${String(receipt.verifiedAt).slice(0, 16).replace("T", " ")}` : ""}</p>}
    </div>
  );
}
