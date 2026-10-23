import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Loadable, Modal, MonthSwitch, StatusMark, Tag, useToast } from "../../ui/components.jsx";
import { BriefAttachments } from "./BriefAttachments.jsx";
import { BriefSync } from "./BriefSync.jsx";
import Thumb from "../../ui/Thumb.jsx";
import { currentMonth } from "../../constants.js";
import { BRIEF_SECTIONS as SECTIONS, BRIEF_HEADS, BRIEF_WIDTHS, BRIEF_NUMBERS, briefRows, syncBriefMaterials, normalizeMaterialName } from "../../../server/brief-template.mjs";
import { briefText } from "./brief-edit.js";
import { createBriefAttachmentQueue, protectBriefAttachmentQueues } from './brief-attachment-queue.js';


import { acquireBriefJournal, createBriefAutosave } from './brief-autosave.js';
import { DismissibleNote } from "../../ui/dismissible.jsx";

const attachmentQueues = new Map(); // Failed uploads survive internal navigation.
const releaseAttachmentGuard=protectBriefAttachmentQueues(attachmentQueues,window);
if(import.meta.hot)import.meta.hot.dispose(releaseAttachmentGuard);
const STATUS = [["todo", "待写"], ["part", "写了一部分"], ["done", "完成"]];
export default function BriefView() {
  const [month, setMonth] = useState(currentMonth());
  const state = useApi(`/api/v3/briefs/${month}`);
  const [journal,setJournal]=useState(null);
  useEffect(()=>{
    let alive=true,release=()=>{};
    acquireBriefJournal({locks:navigator.locks,session:sessionStorage,local:localStorage}).then(owner=>{
      if(!alive){owner.release();return;}release=owner.release;setJournal(owner);
    }).catch(()=>{if(alive)setJournal({storage:sessionStorage,journalId:'fallback'});});
    return()=>{alive=false;release();};
  },[]);
  return <Loadable state={state} name="设计 brief" big>{b=>b.month===month && journal?<Brief journal={journal} key={month} brief={b} month={month} setMonth={setMonth}/>:<p className="muted">正在读取 {month} 的 Brief…</p>}</Loadable>;
}

const Source = ({ children }) => <span className="source-tag"><PixelIcon name="link" />{children}</span>;

// 看起来像正文的输入框：多行自动撑高。
function Text({ value, onChange, placeholder = "待写", className = "" }) {
  return <textarea className={`doc-input ${className}`} rows={1} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
    ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } }} />;
}

function Brief({ brief, month, setMonth, journal }) {
  const [sec, setSec] = useState(1);
  const [all, setAll] = useState(true);
  const [removing, setRemoving] = useState(null); // 待删物料的序号：用公共 Modal 确认，不用浏览器原生弹窗（2026-10-23）
  const saverRef=useRef(null);
  if(!saverRef.current)saverRef.current=createBriefAutosave({initial:brief,storage:journal.storage,journalId:journal.journalId,
    send:body=>apiSend('POST',`/api/v3/briefs/${month}/autosave`,body),read:()=>apiSend('GET',`/api/v3/briefs/${month}`)});
  const saver=saverRef.current;
  const attachmentRef=useRef(null);
  if(!attachmentRef.current){
    const path=`/api/v3/briefs/${month}/attachments`;
    const existing=attachmentQueues.get(month);
    attachmentRef.current=existing && (existing.state().pending.length || existing.state().busy || existing.state().error) ? existing : createBriefAttachmentQueue({
      read:()=>apiSend('GET',path), preview:body=>apiSend('POST',`${path}/preview`,body),
      removePreview:id=>apiSend('POST',`${path}/${encodeURIComponent(id)}/remove-preview`),
      confirm:body=>apiSend('POST',`${path}/confirm`,body),
    });
    attachmentQueues.set(month,attachmentRef.current);
  }
  const attachments=attachmentRef.current;
  const [attachmentState,setAttachmentState]=useState(attachments.state());
  useEffect(()=>{
    attachments.setOnChanged(()=>saver.verify());
    const unsubscribe=attachments.subscribe(setAttachmentState);
    return()=>{unsubscribe();attachments.setOnChanged(null);};
  },[attachments,saver]);
  const [saving,setSaving]=useState(saver.state());
  const {draft,saved}=saving;
  const strategySource=saved.strategySource || brief.strategySource;
  useEffect(()=>{
    const unsub=saver.subscribe(setSaving);
    if(saver.state().draft.materials.some(m=>m.name!==normalizeMaterialName(m.name)))saver.update(d=>Object.assign(d,syncBriefMaterials(d,d.materials)));
    const flush=()=>{saver.flush().catch(()=>{});};
    window.addEventListener('pagehide',flush);
    return()=>{unsub();window.removeEventListener('pagehide',flush);flush();};
  },[saver]);
  const [rewrite, setRewrite] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generation, setGeneration] = useState(null);
  const [generationError, setGenerationError] = useState("");
  const [exportLocked, setExportLocked] = useState(false);
  const [toast, showToast] = useToast();
  const edit = (fn) => { if (generating || exportLocked || saving.resolving) return; saver.update(fn); };
  const locked=generating || exportLocked || saving.resolving;
  const materialChange=(materials)=>edit(d=>Object.assign(d,syncBriefMaterials(d,materials)));
  const generate=async(overwrite=false)=>{
    if(locked)return;
    setGenerating(true);setGenerationError('');setRewrite(false);
    try {
      await saver.flush();
      const result=await apiSend('POST',`/api/v3/briefs/${month}/generate`,{patch:{},overwrite});
      saver.update(d=>Object.assign(d,result.value));await saver.flush();setGeneration(result);
    }catch(e){setGenerationError(e.message);}finally{setGenerating(false);}
  };
  const copyBrief=async()=>{
    try { await attachments.flush(); await copy(briefText(saver.state().draft,attachments.state().items)," brief 全文"); }
    catch(e){showToast(`附件未保存完成，暂不能复制全文：${e.message}`);}
  };
  const show = (n) => all || sec === n;
  const copy = async (text, label) => { try { await navigator.clipboard.writeText(text); showToast(`已复制${label}`); } catch { showToast("复制失败：浏览器不允许写剪贴板"); } };
  const head = (n, extra) => (
    <><h3><span className="tnum">{BRIEF_NUMBERS[n-1]}、</span>{SECTIONS[n - 1]}{extra}
      <span className="spacer" />
      <select className="sec-status" value={draft.status[n] || "todo"} onChange={(e) => edit((d) => { d.status[n] = e.target.value; })} aria-label={`第 ${n} 节状态`}>{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </h3><CloudSupplement entries={(saved.feishuSupplement||[]).filter(x=>x.section===n)} documentUrl={saved.feishuDocument?.url}/></>
  );
  return (
    <>
      <BriefSync month={month} attachments={attachments} saver={saver} saving={saving} disabled={generating||saving.resolving} onLockChange={setExportLocked}>
        <MonthSwitch month={month} onChange={async m=>{if(!locked){try{await attachments.flush();await saver.flush();setMonth(m);}catch{/* Preserve draft. */}}}} mark={month===currentMonth()?"本月":""}/>
        <Button onClick={copyBrief} title="复制全文"><PixelIcon name="copy"/></Button>
      </BriefSync>
      <Modal open={removing !== null} onClose={() => setRemoving(null)} icon="alert" title="删除物料"
        footer={<><Button onClick={() => setRemoving(null)}>取消</Button><Button variant="primary" onClick={() => { materialChange(draft.materials.filter((_, k) => k !== removing)); setRemoving(null); }}>确认删除</Button></>}>
        <p>删除物料「{(removing !== null && draft.materials[removing]?.name) || "未命名"}」及对应的受众、交付安排和文案框架。只改本地草稿，同步到飞书前都可以再改。</p>
      </Modal>
      {saving.error && <div className="brief-save-error" role="alert"><span>{saving.error.message} 填写内容仍在当前页面。</span>
        {saving.error.code==='BRIEF_SAVE_CONFLICT'?<><Button disabled={saving.resolving} onClick={()=>saver.resolve(true).catch(()=>{})}>保存我的草稿</Button><Button disabled={saving.resolving} onClick={()=>saver.resolve(false).catch(()=>{})}>使用另一页面的版本</Button></>:<Button onClick={()=>saver.flush().catch(()=>{})}>重试自动保存</Button>}
      </div>}
      <div className="brief-layout">
        <nav className="brief-outline" aria-label="章节">
          <button type="button" className={`outline-all${all ? " active" : ""}`} onClick={() => setAll(true)}><PixelIcon name="menu" />全部展开</button>
          {SECTIONS.map((t, i) => (
            <button key={t} type="button" className={!all && sec === i + 1 ? "active" : ""} onClick={() => { setAll(false); setSec(i + 1); }}>
              <span className="tnum">{i + 1}</span><span>{t}</span><StatusMark state={draft.status[i + 1] || "todo"} />
            </button>
          ))}
        </nav>

        <article className="doc"><fieldset className="brief-edit-fields" disabled={locked}>
          <span className="label">design brief · {month}</span>
          <h2><Text value={draft.title} onChange={(v) => edit((d) => { d.title = v; })} placeholder="标题" className="is-title" /></h2>
          {show(1) && <section>{head(1)}{draft.background.from && <p className="small muted">来源：{draft.background.from}</p>}
            <Text value={draft.background.text} onChange={(v) => edit((d) => { d.background.text = v; })} placeholder="根据同月用户策略生成一段背景，也可以直接填写" />
            <ol className="goals">{draft.background.goals.map((g, k) => <li key={k}><Text value={g} onChange={(v) => edit((d) => { d.background.goals[k] = v; })} /><button type="button" className="icon-btn" title="删掉这条目标" aria-label="删掉这条目标" onClick={() => edit((d) => { d.background.goals.splice(k, 1); })}><PixelIcon name="close" /></button></li>)}</ol>
            <button type="button" className="link-btn" onClick={() => edit((d) => { d.background.goals.push(""); })}><PixelIcon name="plus" />加一条目标</button></section>}
          {show(2) && <section>{head(2)}
            <p className="small muted">先填写物料名称，再点右侧「内部生成建议」。名称会同步到第三、四部分。</p>
            <RowsTable widths={BRIEF_WIDTHS.audience} cols={BRIEF_HEADS.audience} rows={draft.audience} onChange={fn=>edit(d=>{const ms=[...d.materials];while(ms.length<3)ms.push({id:crypto.randomUUID(),name:''});Object.assign(d,syncBriefMaterials(d,ms));fn(d.audience);})} allowRows={false}
              onName={(i,name)=>{const ms=[...draft.materials];while(ms.length<=i)ms.push({id:crypto.randomUUID(),name:''});ms[i]={...ms[i],name};materialChange(ms);}}
              onRemove={i=>setRemoving(i)} />
            <Button disabled={locked} onClick={()=>materialChange([...draft.materials,{id:crypto.randomUUID(),name:''}])}><PixelIcon name="plus"/>添加物料</Button>
          </section>}
          {show(3) && <section>{head(3)}<RowsTable widths={BRIEF_WIDTHS.timeline} cols={BRIEF_HEADS.timeline} rows={draft.timeline} onChange={fn=>edit(d=>{const ms=[...d.materials];while(ms.length<3)ms.push({id:crypto.randomUUID(),name:''});Object.assign(d,syncBriefMaterials(d,ms));fn(d.timeline);})} allowRows={false} fixedFirst /></section>}
          {show(4) && <section>{head(4)}
            {!draft.items.length ? <p className="small muted">在第二部分填写物料名称后，这里会为每份物料创建独立框架；可直接带到飞书继续填写。</p>
              : draft.items.map((it,k)=>({it,k})).filter(({it})=>it.title.trim()).map(({it,k},index) => <BriefItem key={it.id} it={it} index={index} onChange={(fn) => edit((d) => fn(d.items[k]))} />)}</section>}
          {show(5) && <section>{head(5)}<RowsTable widths={draft.specs[0]?.length===4?[140,140,140,140]:BRIEF_WIDTHS.specs} cols={draft.specs[0]?.length===4?['物料','比例','尺寸','格式']:BRIEF_HEADS.specs} rows={draft.specs} onChange={fn=>edit(d=>fn(d.specs))} /></section>}
          {show(6) && <section>{head(6)}<RowsTable widths={draft.owners[0]?.length===3?[135,350,195]:BRIEF_WIDTHS.owners} cols={draft.owners[0]?.length===3?['角色','负责人','状态']:BRIEF_HEADS.owners} header={false} rows={draft.owners} onChange={fn=>edit(d=>fn(d.owners))} allowRows={false} fixedFirst /></section>}
          {show(7) && <section>{head(7)}<BriefAttachments month={month} queue={attachments} state={attachmentState} disabled={locked} /></section>}
          {!all && (
            <div className="doc-pager">
              <Button disabled={sec === 1} onClick={() => setSec(sec - 1)}><PixelIcon name="left" />{sec > 1 ? SECTIONS[sec - 2] : "上一节"}</Button>
              <Button disabled={sec === 7} onClick={() => setSec(sec + 1)}>{sec < 7 ? SECTIONS[sec] : "下一节"}<PixelIcon name="right" /></Button>
            </div>
          )}
        </fieldset></article>

        <aside className="brief-rail">
          <section className="card">
            <div className="card-head"><h2><PixelIcon name="agent" />Brief 内容建议</h2></div>
            <div className="card-body stack-sm">
              <p className="small muted">读取 {month} 的用户策略，综合物料名称补充背景、目的、面向人群与当前待办。已有文字保留。</p>
              <p className="small muted">工作台内部规则生成，可按实际需求修改。交付时间、负责人、详细文案及后三节可留空。</p>
              {strategySource?.timelineEvidence?.status==='changed' && <DismissibleNote id={`brief-evidence:${month}`} stamp={strategySource.timelineEvidence.fingerprint || strategySource.timelineEvidence.message} className="small warn-text" role="status">{strategySource.timelineEvidence.message} 请先核对用户策略，再按需重新生成第一、二部分；已有 Brief 文字不会自动改写。</DismissibleNote>}
              <Button variant="primary" disabled={locked || !strategySource?.available} onClick={()=>generate()}>{generating?'正在生成…':'内部生成建议'}</Button>
              {strategySource?.available && <button className="link-btn" disabled={locked} onClick={()=>setRewrite(!rewrite)}>重新生成第一、二部分</button>}
              {rewrite && <div className="stack-sm"><p className="small warn-text">将替换背景、目的和受众文字，其他部分保留。</p><Button disabled={locked} onClick={()=>generate(true)}>确认重新生成</Button><button className="link-btn" onClick={()=>setRewrite(false)}>取消</button></div>}
              {!strategySource?.available && <p className="small warn-text">这个月份还没有用户策略，请先在用户策略页补充。</p>}
              {generation && <p className="small muted">已补充草稿 · 来源：{generation.source.month} 用户策略。已保存到工作台，可在顶部同步到飞书。</p>}
              {generation?.warnings.map(w=><p className="small warn-text" key={w}>{w}</p>)}
              {generationError && <p role="alert" className="small risk-text">{generationError}</p>}
              <a className="link" href={href('user','strategy')}>查看用户策略</a>
            </div>
          </section>
        </aside>
      </div>
      {toast}
    </>
  );
}

function CloudSupplement({entries,documentUrl}) {
  if(!entries.length)return null;
  return <details className="small"><summary className="link">飞书补充内容 · {entries.length} 项</summary>
    <p className="muted">这些段落或富文本保留在飞书原文档中；同步时一起读取，不会被工作台空白覆盖。</p>
    {entries.map((entry,i)=><div key={i} className="stack-sm"><strong>{entry.label}</strong>{entry.text&&<p style={{whiteSpace:'pre-wrap'}}>{entry.text}</p>}
      {(entry.links||[]).filter(link=>/^https?:\/\//i.test(link.url)).map((link,j)=><a className="link" key={j} href={link.url} target="_blank" rel="noreferrer">{link.label||link.url}</a>)}
      {entry.hasResources&&<p className="muted">图片、附件或复杂内容请在原文档查看。</p>}</div>)}
    {documentUrl&&<a className="link" href={documentUrl} target="_blank" rel="noreferrer">打开飞书原文档</a>}
  </details>;
}

function RowsTable({ cols, rows, onChange, allowRows=true, fixedFirst=false, onName, onRemove, header=true, widths }) {
  const display=briefRows(rows,cols.length);
  const change=fn=>onChange(list=>{while(list.length<display.length)list.push(cols.map(()=>''));fn(list);});
  const weights=widths || cols.map(()=>1), sum=weights.reduce((a,b)=>a+b,0);
  return (
    <>
      <table className="grid compact brief-table">
        <colgroup>{weights.map((w,i)=><col key={i} style={{width:`${w/sum*100}%`}}/>)}{(allowRows||onRemove)&&<col style={{width:32}}/>}</colgroup>
        {header && <thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}{(allowRows || onRemove) && <th aria-label="操作" />}</tr></thead>}
        <tbody>
          {display.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{j===0 && fixedFirst?<span>{c}</span>:j===0&&onName?<MaterialName value={c} index={i} onChange={v=>onName(i,v)} />:<Text value={c} placeholder="" onChange={v=>change(list=>{list[i][j]=v;})}/>}</td>)}
              {(allowRows || onRemove) && <td className="row-del">{i<rows.length&&<button type="button" className="icon-btn" title="删掉这一行" aria-label="删掉这一行" onClick={() => onRemove?onRemove(i):onChange((list) => { list.splice(i, 1); })}><PixelIcon name="close" /></button>}</td>}</tr>
          ))}
        </tbody>
      </table>
      {allowRows && <button type="button" className="link-btn" onClick={() => change((list) => { list.push(cols.map(() => "")); })}><PixelIcon name="plus" />加一行</button>}
    </>
  );
}

function BriefItem({ it, index, onChange }) {
  if (it.kind === 'framework') return <div className="brief-item"><h4>4.{index+1} {it.title || '待填写物料名称'}</h4><RowsTable widths={BRIEF_WIDTHS.blocks} cols={BRIEF_HEADS.blocks} rows={it.blocks} onChange={fn=>onChange(x=>fn(x.blocks))}/></div>;
  if (it.kind === "skip") return <div className="brief-item"><h4>{it.title}</h4><Text value={it.note} onChange={(v) => onChange((x) => { x.note = v; })} /></div>;
  return (
    <div className="brief-item">
      <h4>{it.title}{it.priceFrom && <Source>{it.priceFrom}</Source>}</h4>
      {it.blocks && (
        <table className="grid compact brief-blocks"><thead><tr><th>涉及板块</th><th>内容</th><th>说明 · 示例</th></tr></thead>
          <tbody>{it.blocks.map((b, i) => <tr key={i}><td className="k">{b[0]}</td><td><Text value={b[1]} onChange={(v) => onChange((x) => { x.blocks[i][1] = v; })} /></td><td><Text value={b[2]} className="muted" onChange={(v) => onChange((x) => { x.blocks[i][2] = v; })} /></td></tr>)}</tbody></table>
      )}
      {it.cells && (
        <div className="p9">
          {it.cells.map((c, i) => <div key={i} className={`p9-cell${c ? "" : " is-empty"}`}><b>P{i + 1}</b><Text value={c} onChange={(v) => onChange((x) => { x.cells[i] = v; })} /></div>)}
        </div>
      )}
      <div className="ref-strip">
        {(it.refs || []).map((r) => <figure key={r.title} className="ref-slot"><Thumb kind={r.kind} big={r.big} title={r.title} accent={r.accent} /><figcaption>参考 · {r.title}</figcaption></figure>)}
        {it.reuse ? <figure className="ref-slot is-reuse"><Thumb kind="poster" big={it.reuse.big} title={it.reuse.title} /><figcaption>沿用往期 · {it.reuse.month} {it.reuse.title}</figcaption></figure> : null}
        <a className="ref-slot is-add" href={href("marketing", "materials", "design")}><PixelIcon name="canvas" />去设计参考</a>
      </div>
      {it.kind === "price" && <Tag tone="neutral">价格来自生效中的价格方案</Tag>}
    </div>
  );
}

function MaterialName({value,index,onChange}){
  const [typing,setTyping]=useState(value);
  useEffect(()=>{setTyping(current=>normalizeMaterialName(current)===value?current:value);},[value]);
  return <input className="doc-input" aria-label={`物料名称 ${index+1}`} value={typing} placeholder="输入物料名称" onChange={e=>{setTyping(e.target.value);onChange(e.target.value);}} onBlur={()=>setTyping(normalizeMaterialName(typing))}/>;
}
