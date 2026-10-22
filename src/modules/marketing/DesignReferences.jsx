import { useEffect, useRef, useState } from "react";
import { apiSend, useApi } from "../../api.js";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { Button, Loadable, Modal } from "../../ui/components.jsx";
import { SavedNote } from "../../ui/write-flow.jsx";
import { useLocalCanvas } from "../../ui/use-local-canvas.js";
import CacheImageWarning from "../../ui/CacheImageWarning.jsx";

const groupOf = i => i.tags[0] || "未分组";
const zone = name => ({ name, x: 0, y: 0, w: 300, h: 280 });
export default function DesignReferences() {
  const state = useApi("/api/v3/design-refs/state");
  return <Loadable state={state} name="设计参考" big>{data => <Desk initial={data} />}</Loadable>;
}
function Desk({ initial }) {
  const [notice, setNotice] = useState(null), [q, setQ] = useState(""), [filter, setFilter] = useState("");
  const [opened, setOpened] = useState(() => { try { return JSON.parse(localStorage.getItem("niuma-design-expanded") || "[]"); } catch { return []; } });
  const [naming, setNaming] = useState(null), [importing, setImporting] = useState(false), [selected, setSelected] = useState(null), [image, setImage] = useState(0), [over, setOver] = useState(null);
  const drag = useRef(null), ignoreClick = useRef(false);
  const [moving, setMoving] = useState(null);
  const { value, change, busy, locked, error, warning, dismissWarning, reread, retry, discard, canRetry, canDiscard } = useLocalCanvas(initial, "/api/v3/design-refs", text => setNotice({ text, id: crypto.randomUUID() }));
  const groups = [...value.zones.map(z => z.name), "未分组"], items = value.items;
  useEffect(() => { localStorage.setItem("niuma-design-expanded", JSON.stringify(opened)); }, [opened]);
  const toggle = name => setOpened(old => old.includes(name) ? old.filter(n => n !== name) : [...old, name]);
  const terms = q.normalize("NFKC").toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = i => terms.every(t => `${i.title} ${i.post?.author || ""} ${i.post?.content || ""} ${i.tags.join(" ")}`.normalize("NFKC").toLowerCase().includes(t));
  const moveNote = (id, group) => change(old => ({ ...old, items: old.items.map(i => i.id === id ? { ...i, tags: [group] } : i) }));
  const drop = group => ({ onDragOver: e => { if (drag.current && !locked) { e.preventDefault(); setOver(group); } }, onDragLeave: e => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(null); }, onDrop: e => {
    e.preventDefault(); const d = drag.current; drag.current = null; setOver(null); if (!d || locked) return;
    if (d.kind === "note") moveNote(d.id, group);
    else if (group !== "未分组" && group !== d.name) change(old => { const zones = old.zones.filter(z => z.name !== d.name), from = old.zones.find(z => z.name === d.name); zones.splice(zones.findIndex(z => z.name === group), 0, from); return { ...old, zones }; });
  } });
  const pointerDrag = payload => ({
    onPointerDown: e => {
      if (locked || e.button !== 0 || e.target.closest('.ref-delete')) return;
      drag.current = { ...payload, sx: e.clientX, sy: e.clientY, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: e => {
      const d = drag.current; if (!d) return;
      if (Math.abs(e.clientX-d.sx)+Math.abs(e.clientY-d.sy)>6) d.moved=true;
      if (!d.moved) return;
      setMoving(d.id || d.name);
      setOver(document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-design-group]')?.dataset.designGroup || null);
    },
    onPointerUp: e => {
      const d = drag.current, group = document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-design-group]')?.dataset.designGroup;
      drag.current=null; setMoving(null); setOver(null);
      if (!d?.moved) return;
      ignoreClick.current=true;
      if (group === undefined) return;
      if (d.kind==='note') moveNote(d.id,group);
      else if (group!=='未分组' && group!==d.name) change(old=>{const zones=old.zones.filter(z=>z.name!==d.name),from=old.zones.find(z=>z.name===d.name);zones.splice(zones.findIndex(z=>z.name===group),0,from);return {...old,zones};});
    },
    onPointerCancel: () => {drag.current=null;setMoving(null);setOver(null);},
  });
  const stopDragClick = e => {if(ignoreClick.current){ignoreClick.current=false;e.preventDefault();e.stopPropagation();}};
  const nameGroup = e => {
    e.preventDefault(); const name = naming.value.trim().slice(0, 50);
    if (!name || groups.includes(name) && name !== naming.old) return;
    if (naming.old) {
      change(old => ({ zones: old.zones.map(z => z.name === naming.old ? { ...z, name } : z), items: old.items.map(i => groupOf(i) === naming.old ? { ...i, tags: [name] } : i) }));
      setOpened(old => old.map(g => g === naming.old ? name : g)); if (filter === naming.old) setFilter(name);
    } else change(old => ({ ...old, zones: [...old.zones, zone(name)] }));
    setNaming(null);
  };
  const open = i => { setSelected(i.id); setImage(0); };
  const current = items.find(i => i.id === selected), gallery = current?.gallery || [];
  const remove = i => { change(old => ({ ...old, items: old.items.filter(n => n.id !== i.id) })); if (selected === i.id) setSelected(null); };
  const card = i => <article key={i.id} className={`design-card${moving===i.id ? " is-moving" : ""}`} {...pointerDrag({kind:"note",id:i.id})} onClickCapture={stopDragClick} onDragStart={e=>e.preventDefault()}>
    <button className="design-card-open" onClick={() => open(i)} aria-label={`查看帖子：${i.title}`}>
      <div className="design-cover">{i.src ? <img src={i.src} alt="" loading="lazy" draggable={false} /> : <PixelIcon name="image" size={28} />}{i.post?.type === "video" && <span className="design-video"><PixelIcon name="play" size={12} />视频</span>}<span className="design-image-count">{i.gallery?.length || 0} 图</span></div>
      <span className="design-card-title">{i.title}</span><span className="design-author">{i.post?.author || "小红书收藏"}</span>
    </button>
    <button className="ref-delete" aria-label={`删除收藏：${i.title}`} title="删除本地收藏及图片副本" disabled={locked} onClick={() => remove(i)}><PixelIcon name="close" size={12} /></button>
  </article>;
  return <>
    <SavedNote text={notice?.text} identity={notice?.id} onClose={() => setNotice(null)} />
    <CacheImageWarning text={warning} onClose={dismissWarning} />
    <div className="design-toolbar">
      <div className="design-filters"><button className={`chip${!filter ? " is-on" : ""}`} onClick={() => setFilter("")}>全部 {items.length}</button>
        {groups.filter(g => g !== "未分组" || items.some(i => groupOf(i) === g)).map(g => <button key={g} data-design-group={g} className={`chip${filter === g ? " is-on" : ""}${over === g ? " is-over" : ""}`} {...drop(g)} onClick={() => { setFilter(filter === g ? "" : g); setOpened(old => old.includes(g) ? old : [...old, g]); }}>{g} <span className="tnum">{items.filter(i => groupOf(i) === g).length}</span></button>)}
        <Button disabled={locked} onClick={() => setNaming({ value: "" })}><PixelIcon name="plus" />分组</Button>
      </div>
      <div className="design-tools"><label className="search-box"><PixelIcon name="search" /><input aria-label="搜索设计参考" placeholder={`搜索 ${items.length} 篇收藏`} value={q} onChange={e => { setQ(e.target.value); setFilter(""); }} /></label><Button onClick={() => setImporting(true)} disabled={busy || locked}><PixelIcon name="star" />从数码世界收藏导入</Button></div>
    </div>
    {naming && <form className="design-naming" onSubmit={nameGroup}><input autoFocus aria-label="分组名称" maxLength={50} placeholder="输入分组名称" value={naming.value} onChange={e => setNaming({ ...naming, value: e.target.value })} /><Button type="submit" disabled={!naming.value.trim() || groups.includes(naming.value.trim()) && naming.value.trim() !== naming.old}>保存</Button><Button onClick={() => setNaming(null)} type="button">取消</Button></form>}
    {error && <div className="write-box is-error" role="alert">{error}<Button disabled={busy} onClick={reread}>重新读取核对</Button>{canRetry && <Button disabled={busy} onClick={retry}>继续保存草稿</Button>}{canDiscard && <Button disabled={busy} onClick={discard}>移除失败的这一项</Button>}</div>}
    <p className="small muted design-hint">点击分组展开或收起 · 拖动卡片归类 · 拖动组名排序 · 点击卡片看完整帖子</p>
    <div className="design-desk">
      {!items.length && !value.zones.length && <div className="design-empty"><PixelIcon name="star" size={32} /><strong>收好每一篇设计灵感</strong><p>从数码世界「设计参考」分组导入，一篇帖子一张卡，完整图片保存在本机。</p><Button onClick={() => setImporting(true)}>导入收藏</Button></div>}
      {groups.filter(g => (!filter || filter === g) && (g !== "未分组" || items.some(i => groupOf(i) === g))).map(g => {
        const all = items.filter(i => groupOf(i) === g), list = all.filter(matches), expanded = opened.includes(g) || !!q;
        if (q && !list.length) return null;
        return <section key={g} data-design-group={g} className={`design-group${expanded ? " is-expanded" : ""}${over === g ? " is-over" : ""}`} {...drop(g)}>
          <div className="design-group-head"><button className="design-group-name" aria-expanded={expanded} onClick={() => toggle(g)} {...(g !== "未分组" ? pointerDrag({kind:"group",name:g}) : {})} onClickCapture={stopDragClick} onDragStart={e=>e.preventDefault()}><PixelIcon name={expanded ? "down" : "right"} />{g}<span className="tnum">{list.length}</span></button>{g !== "未分组" && <button className="icon-btn" aria-label={`重命名分组：${g}`} onClick={() => setNaming({ old: g, value: g })} disabled={locked}><PixelIcon name="edit" size={12} /></button>}</div>
          {expanded ? <div className="design-cards">{list.map(card)}{!list.length && <div className="design-drop">把卡片拖到这里</div>}</div> : <button className="design-stack" onClick={() => toggle(g)} aria-label={`展开分组：${g}`}>
            {list.slice(0,3).reverse().map((i,k) => <span key={i.id} className="design-stack-card" style={{ transform: `translate(${(2-k)*7}px, ${(2-k)*-5}px) rotate(${(k-1)*4}deg)` }}><span className="design-cover">{i.src ? <img src={i.src} alt="" loading="lazy" draggable={false} /> : <PixelIcon name="image" size={28} />}</span><span className="design-card-title">{i.title}</span></span>)}{!list.length && <span className="design-drop">把卡片拖到这里</span>}
          </button>}
        </section>;
      })}
      {!!q && !items.some(matches) && <div className="empty">没有匹配的收藏</div>}
    </div>
    <Modal open={!!current} onClose={() => setSelected(null)} title={current?.title || "帖子"} icon="image" wide footer={current && <><label className="select">分组<select aria-label="帖子分组" value={groupOf(current)} disabled={locked} onChange={e => moveNote(current.id, e.target.value)}>{groups.map(g => <option key={g}>{g}</option>)}</select></label><span className="spacer" />{current.post?.url && <a className="link" href={current.post.url} target="_blank" rel="noreferrer">打开小红书原帖 <PixelIcon name="external" /></a>}</>}>
      {current && <div className="design-detail"><div className="design-gallery"><div className="design-gallery-main">{gallery.length ? <img src={gallery[Math.min(image,gallery.length-1)]} alt={`${current.title} · 第 ${image+1} 张`} /> : <span>这篇帖子没有本地图片</span>}</div>{gallery.length > 1 && <div className="design-gallery-nav"><Button disabled={image===0} onClick={() => setImage(i=>i-1)}>上一张</Button><span>{image+1} / {gallery.length}</span><Button disabled={image===gallery.length-1} onClick={() => setImage(i=>i+1)}>下一张</Button></div>}<div className="design-thumbnails">{gallery.map((src,k) => <button key={src} className={image===k ? "is-on" : ""} aria-label={`查看第${k+1}张图片`} onClick={() => setImage(k)}><img src={src} alt="" /></button>)}</div></div><div className="design-post-text"><strong>{current.post?.author || "小红书收藏"}</strong>{current.post?.type === "video" && <p className="small muted">视频收藏保留封面，播放请打开原帖。</p>}<p>{current.post?.content || "暂无正文，可打开原帖查看。"}</p></div></div>}
    </Modal>
    {importing && <ImportPosts onClose={() => setImporting(false)} onSaved={async count => { await reread(); setNotice({ text: `已导入 ${count} 篇收藏`, id: crypto.randomUUID() }); }} />}
  </>;
}
function ImportPosts({ onClose, onSaved }) {
  const state = useApi("/api/v3/design-refs/source"), [cat, setCat] = useState(null), [picked, setPicked] = useState([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const notes = state.data?.notes || [];
  useEffect(() => { if (!state.data || cat !== null) return; setCat(state.data.defaultGroup); setPicked(notes.filter(n=>n.group===state.data.defaultGroup && !n.imported).slice(0,20).map(n=>n.id)); }, [state.data]);
  async function run() {
    setBusy(true); setError("");
    const id = crypto.randomUUID();
    try {
      const current = await apiSend("GET", "/api/v3/design-refs/state");
      let saved;
      try { saved = await apiSend("POST", "/api/v3/design-refs/import", { ids:picked, baseRevision:current.revision, requestId:id }); }
      catch(e) { if (e.status && e.status<500) throw e; saved=await apiSend("GET", `/api/v3/design-refs/saves/${id}`); if(!saved) throw e; }
      const back=await apiSend("GET", "/api/v3/design-refs/state");
      if (saved.revision !== back.revision) throw new Error("导入后内容发生变化，请关闭后重新读取核对");
      await onSaved(picked.length); onClose();
    } catch(e) { setError(`${e.message}；未自动重试。可关闭后重新读取核对已导入项目。`); }
    finally { setBusy(false); }
  }
  return <Modal open onClose={() => { if (!busy) onClose(); }} title="导入小红书帖子" icon="star" wide footer={<><span className="small muted">已选 {picked.length} 篇 · 完整图片保存到牛马之家</span><span className="spacer" /><Button disabled={busy} onClick={onClose}>取消</Button><Button variant="primary" disabled={!picked.length || busy || !!error} onClick={run}>{busy ? "正在保存…" : "导入收藏"}</Button></>}>
    <p className="small muted">默认选择数码世界「设计参考」分组；保留帖子、正文和图片，不改动数码世界。</p>
    {state.loading ? <StepProgress label="读取收藏" /> : state.error ? <p className="risk-text">{state.error}</p> : <><div className="toolbar"><button className={`chip${cat==="" ? " is-on" : ""}`} onClick={()=>setCat("")}>全部</button>{[...(state.data?.groups || []), "未分组"].map(g=><button className={`chip${cat===g ? " is-on" : ""}`} key={g} onClick={()=>setCat(g)}>{g}</button>)}</div><ul className="dw-list">{notes.filter(n=>!cat || (n.group || "未分组")===cat).map(n=><li key={n.id}><label><input type="checkbox" disabled={busy || n.imported || picked.length>=20 && !picked.includes(n.id)} checked={picked.includes(n.id)} onChange={()=>setPicked(old=>old.includes(n.id)?old.filter(id=>id!==n.id):[...old,n.id])} />{n.images>0 && <img src={`/api/v3/refs/digiworld/${encodeURIComponent(n.id)}/images/0`} alt="" loading="lazy" />}<span className="dw-main"><strong>{n.title}</strong><span className="small muted">{n.author} · {n.images} 张图{n.imported ? " · 已导入" : ""}</span></span></label></li>)}</ul>{!notes.some(n=>!cat || (n.group || "未分组")===cat) && <p className="empty">这个分组暂时没有收藏，可选择其他分组。</p>}</>}
    {error && <p className="risk-text" role="alert">{error}</p>}
  </Modal>;
}
