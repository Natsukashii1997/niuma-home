import { useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";

// brief 第 7 节「附件」：文件存在工作台本地（每月最多 30 个，单个 15 MB 以内）。
// 上传、删除都先预览再确认，回读列表核对一致才算保存；导出飞书时这一节只写文件名清单，不上传文件。
const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.txt,.md";
const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error("读取本地文件失败"));
  r.readAsDataURL(file);
});

export function BriefAttachments({ month, onChanged }) {
  const state = useApi(`/api/v3/briefs/${month}/attachments`);
  const [items, setItems] = useState(null); // 保存后用回读到的列表
  const [what, setWhat] = useState(""); // "upload" / "remove"
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const flow = useWriteFlow();
  const list = items || state.data?.items || [];
  const locked = flow.busy || flow.phase === "unknown";
  const base = `/api/v3/briefs/${month}/attachments`;
  const reread = async () => { const back = await apiSend("GET", base); setItems(back.items); await onChanged?.(); return back.items; };

  async function pick(file) {
    if (!file || locked) return;
    setWhat("upload"); flow.reset();
    flow.preview(async () => apiSend("POST", `${base}/preview`, { name: file.name, dataUrl: await readFile(file) }));
  }
  const remove = (a) => { if (locked) return; setWhat("remove"); flow.reset(); flow.preview(() => apiSend("POST", `${base}/${encodeURIComponent(a.id)}/remove-preview`)); };
  const confirm = () => flow.confirm(
    (pv) => apiSend("POST", `${base}/confirm`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      const back = await reread();
      const got = back.find((x) => x.id === pv.value.id);
      return what === "remove" ? !got : JSON.stringify(got) === JSON.stringify(pv.value);
    },
  );
  const resolve = async () => { await reread(); flow.resolve(); };
  if (state.loading && !items) return <p className="small muted">读取附件…</p>;
  if (state.error && !items) return <p className="small risk-text">附件读取失败：{state.error}</p>;
  return (
    <div className="brief-files">
      {list.length > 0 && (
        <ul className="brief-file-list">
          {list.map((a) => {
            const url = `${base}/${encodeURIComponent(a.id)}/file`;
            return (
              <li key={a.id}>
                {a.type.startsWith("image/") ? <img src={url} alt="" /> : <span className="brief-file-icon"><PixelIcon name="file" /></span>}
                <span className="brief-file-main"><strong>{a.name}</strong><span className="small muted tnum">{sizeText(a.size)} · {a.addedText}</span></span>
                <a className="link" href={url} target="_blank" rel="noreferrer">打开</a>
                <a className="link" href={`${url}?download=1`}>下载</a>
                <button type="button" className="link-btn" disabled={locked} onClick={() => remove(a)}>删除</button>
              </li>
            );
          })}
        </ul>
      )}
      <div className={`dashed-drop is-live${over ? " is-over" : ""}`} role="button" tabIndex={0} aria-disabled={locked}
        onClick={() => !locked && input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (!locked) input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
        <PixelIcon name="upload" />
        <span>{list.length ? "再加一个附件" : "选择文件，或拖到这里"}<span className="small muted"> · 图片、PDF、Word / Excel / PPT、文本；单个 15 MB 以内。导出飞书时只写文件名，不上传文件</span></span>
        <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { pick(e.target.files[0]); e.target.value = ""; }} />
      </div>
      <WriteBox flow={flow} title={what === "remove" ? "删除附件预览" : "上传附件预览"} confirmLabel={what === "remove" ? "确认删除" : "确认上传"} onConfirm={confirm}
        savedText={`${what === "remove" ? "已删除" : "已上传"}附件「${flow.pv?.value.name || ""}」，回读核对一致`}
        onRepreview={() => (what === "remove" ? remove(flow.pv.value) : input.current?.click())} onReread={resolve}>
        {(pv) => <dl className="kv">
          <dt>{what === "remove" ? "删除" : "文件"}</dt><dd>{pv.value.name}</dd>
          <dt>大小</dt><dd className="tnum">{sizeText(pv.value.size)}</dd>
          <dt>月份</dt><dd className="tnum">{month} brief · 第 7 节附件</dd>
          <dt>写到哪里</dt><dd>{what === "remove" ? "从工作台本地删除这个文件，不影响飞书" : "存到工作台本地；导出飞书时只写文件名清单"}</dd>
        </dl>}
      </WriteBox>
    </div>
  );
}
