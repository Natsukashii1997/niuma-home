import { useEffect, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { Button, Modal, Tag } from "../../ui/components.jsx";

// 从数码世界收藏导入：只读列出数码世界（personal-ai-workbench）插件收来的笔记，由你勾选，不做 AI 判断。
// 图文笔记取全部图片，视频笔记只取封面。勾选的图片先加到画布（未保存），再走画布原有的「预览保存」：压缩、确认、回读。
// 「已导入」= 画布里已保存的参考项来源是这条笔记；「已在画布」= 刚加进来还没保存。
// 默认（用户 10-17 约定）：打开时筛到数码世界桌面上的「设计参考」分组，并勾选其中还没导入的；仍要你点「加到画布」和「预览保存」。
export const digiworldSource = (id) => `数码世界笔记 ${id}`;
const toDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error("读取图片失败")); r.readAsDataURL(blob); });

export function DigiworldImport({ open, onClose, items, onAdd }) {
  const state = useApi(open ? "/api/v3/refs/digiworld" : null);
  const [picked, setPicked] = useState(() => new Set());
  const [cat, setCat] = useState(null); // 分组筛选；null = 还没按默认分组初始化
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const notes = state.data?.notes || [];
  const pending = (n) => items.some((i) => i.imageDataUrl && i.source?.startsWith(digiworldSource(n.id)));
  const can = (n) => n.images > 0 && !n.imported && !pending(n);
  const groupOf = (n) => n.group || "未分组";
  const def = state.data?.groups?.includes(state.data.defaultGroup) ? state.data.defaultGroup : "";
  const cats = [...(state.data?.groups || []), ...(notes.some((n) => !n.group) ? ["未分组"] : [])];
  useEffect(() => {
    if (!open || !state.data || cat !== null) return;
    setCat(def);
    setPicked(new Set(notes.filter((n) => def && n.group === def && can(n)).map((n) => n.id)));
  }, [open, state.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = notes.filter((n) => !cat || groupOf(n) === cat);
  const inDef = def ? notes.filter((n) => n.group === def) : [];
  const chosen = notes.filter((n) => picked.has(n.id));
  const count = chosen.reduce((s, n) => s + n.images, 0);
  const toggle = (id) => setPicked((old) => { const s = new Set(old); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  const close = () => { if (busy) return; setPicked(new Set()); setCat(null); setError(""); onClose(); };
  async function add() {
    setBusy(true); setError("");
    try {
      const out = [];
      for (const n of chosen) for (let k = 0; k < n.images; k++) {
        const r = await fetch(`/api/v3/refs/digiworld/${encodeURIComponent(n.id)}/images/${k}`);
        if (!r.ok) throw new Error(`「${n.title}」第 ${k + 1} 张图读不到（${r.status}）`);
        out.push({ dataUrl: await toDataUrl(await r.blob()), title: `${n.title}${n.images > 1 ? ` · ${k + 1}/${n.images}` : ""}`.slice(0, 200), tags: [n.group || n.category || "数码世界收藏"], source: `${digiworldSource(n.id)}${n.sourceUrl ? ` · ${n.sourceUrl}` : ""}` });
      }
      onAdd(out); setBusy(false); setPicked(new Set()); setCat(null); onClose();
    } catch (e) { setBusy(false); setError(`${e.message}；没有加到画布`); }
  }
  return (
    <Modal open={open} onClose={close} wide icon="star" title="从数码世界收藏导入"
      footer={<>
        <span className="small muted">{busy ? "" : chosen.length ? `已选 ${chosen.length} 条 · ${count} 张图` : "勾选要放进画布的收藏"} · 加到画布后还要「预览保存」确认才写入</span>
        <span className="spacer" />
        {busy ? <div style={{ width: 180 }}><StepProgress label="读取收藏图片" /></div> : <>
          <Button onClick={close}>取消</Button>
          <Button variant="primary" disabled={!chosen.length} onClick={add}><PixelIcon name="plus" />加到画布（{count} 张）</Button>
        </>}
      </>}>
      <p className="small muted">只读数码世界的收藏，不改它的数据。图文笔记取全部图片，视频笔记只取封面；来源记小红书原链接和笔记编号。</p>
      {state.data && (def
        ? <p className="small">默认显示数码世界「{def}」分组：{inDef.length ? `${inDef.length} 条，其中 ${inDef.filter(can).length} 条还没导入，已帮你勾选。` : "这个分组还是空的；在数码世界把卡片拖进「设计参考」后，这里会自动勾选。"}</p>
        : <p className="small muted">数码世界里还没有「{state.data.defaultGroup}」分组；建好并把卡片拖进去后，这里会默认勾选它。</p>)}
      {state.loading ? <StepProgress label="只读读取数码世界收藏" />
        : state.error ? <p className="risk-text small">读取失败：{state.error}</p>
        : !notes.length ? <p className="small muted">数码世界里还没有收藏。</p> : <>
          <div className="toolbar">
            <span className="label">分组</span>
            <button type="button" className={`chip${!cat ? " is-on" : ""}`} onClick={() => setCat("")}>全部 <span className="tnum">{notes.length}</span></button>
            {cats.map((c) => <button key={c} type="button" className={`chip${cat === c ? " is-on" : ""}`} onClick={() => setCat(cat === c ? "" : c)}>{c} <span className="tnum">{notes.filter((n) => groupOf(n) === c).length}</span></button>)}
            <span className="spacer" /><span className="small muted tnum">收藏版本 {state.data.revision}</span>
          </div>
          <ul className="dw-list">
            {list.map((n) => {
              const done = n.imported || pending(n), on = picked.has(n.id);
              return (
                <li key={n.id} className={`${on ? "is-on" : ""}${done ? " is-done" : ""}`}>
                  <label>
                    <input type="checkbox" checked={on} disabled={done || busy || !n.images} onChange={() => toggle(n.id)} />
                    {n.images ? <img src={`/api/v3/refs/digiworld/${encodeURIComponent(n.id)}/images/0`} alt="" loading="lazy" /> : <span className="dw-noimg"><PixelIcon name="image" /></span>}
                    <span className="dw-main">
                      <strong>{n.title}</strong>
                      <span className="tag-row"><Tag tone="frame">{n.type === "video" ? "视频 · 只取封面" : `图文 · ${n.images} 张`}</Tag><Tag>{groupOf(n)}</Tag>{n.category && n.category !== n.group && <Tag>{n.category}</Tag>}
                        {n.imported ? <Tag tone="green">已导入</Tag> : pending(n) ? <Tag tone="amber">已在画布，未保存</Tag> : null}{!n.images && <Tag tone="red">本地没有图片</Tag>}</span>
                    </span>
                  </label>
                  {n.sourceUrl && <a className="link small" href={n.sourceUrl} target="_blank" rel="noreferrer">原帖<PixelIcon name="external" /></a>}
                </li>
              );
            })}
          </ul>
        </>}
      {error && <p className="risk-text small">{error}</p>}
    </Modal>
  );
}
