import { useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { Button } from "../../ui/components.jsx";
import { SavedNote } from "../../ui/write-flow.jsx";

// Attachments stay local; Feishu receives only the saved filename list.
const ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.docx,.xlsx,.pptx,.txt,.md";
const sizeText = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
const readFile = file => new Promise((resolve, reject) => {
  const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(Error("读取本地文件失败")); r.readAsDataURL(file);
});

export function BriefAttachments({ month, queue, state, disabled = false }) {
  const [over, setOver] = useState(false), input = useRef(null);
  const { items: list, pending, busy, error, notice } = state;
  const base = `/api/v3/briefs/${month}/attachments`, locked = disabled || state.locked || !!error;
  const pick = files => { if (!locked) for (const file of files) queue.upload(file.name, () => readFile(file)); };
  return <div className="brief-files">
    <SavedNote text={notice} identity={notice} onClose={() => queue.clearNotice()} />
    {list.length > 0 && <ul className="brief-file-list">{list.map(a => {
      const url = `${base}/${encodeURIComponent(a.id)}/file`;
      return <li key={a.id}>
        {a.type.startsWith('image/') ? <img src={url} alt="" /> : <span className="brief-file-icon"><PixelIcon name="file" /></span>}
        <span className="brief-file-main"><strong>{a.name}</strong><span className="small muted tnum">{sizeText(a.size)} · {a.addedText}</span></span>
        <a className="link" href={url} target="_blank" rel="noreferrer">打开</a><a className="link" href={`${url}?download=1`}>下载</a>
        <button type="button" className="link-btn" disabled={locked || busy} onClick={() => queue.remove(a)}>删除</button>
      </li>;
    })}</ul>}
    <div className={`dashed-drop is-live${over ? ' is-over' : ''}`} role="button" tabIndex={0} aria-disabled={locked}
      onClick={() => !locked && input.current?.click()} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!locked) input.current?.click(); } }}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); pick(Array.from(e.dataTransfer.files)); }}>
      <PixelIcon name="upload" /><span>{list.length ? '再加附件' : '选择文件，或拖到这里'}<span className="small muted"> · 自动保存到本机；单个 15 MB 以内。导出飞书时只写文件名，不上传文件</span></span>
      <input ref={input} type="file" multiple accept={ACCEPT} disabled={locked} hidden onChange={e => { pick(Array.from(e.target.files)); e.target.value = ''; }} />
    </div>
    {pending.length > 0 && <p className="small muted" role="status">{error ? '待完成' : '正在保存'}：{pending.map(j => `${j.kind === 'remove' ? '删除 ' : ''}${j.name}`).join('、')}</p>}
    {error && <div className="write-box is-error" role="alert"><span>附件未保存完成：{error}。同步飞书前需先完成附件保存。</span><Button disabled={busy} onClick={() => queue.recover().catch(() => {})}>核对并继续保存</Button>{queue.canDiscard() && <Button disabled={busy} onClick={() => queue.discard()}>移除未保存项</Button>}</div>}
  </div>;
}
