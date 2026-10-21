import {useEffect,useRef,useState} from 'react';
import {apiSend} from '../../api.js';
import {Button} from '../../ui/components.jsx';
import {PixelIcon} from '../../ui/bitmap.jsx';
import {SuccessNotice} from '../../ui/SuccessNotice.jsx';
import {BRIEF_DESTINATION} from '../../../server/brief-destination.mjs';

export function briefSyncTime(iso){
  if(!iso)return '';
  const date=new Date(iso);
  return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
}
// One controller owns save, preflight, sync and recovery. Only its short action
// bar is sticky; differences and recovery details stay in the document flow.
export function BriefSync({month,saver,saving,disabled,onLockChange,children}){
  const path=`/api/v3/briefs/${month}`,busyRef=useRef(false),toolbar=useRef(null);
  useEffect(()=>{
    const node=toolbar.current,parent=node.parentElement,old=parent.style.getPropertyValue('--brief-toolbar-height');
    const update=()=>parent.style.setProperty('--brief-toolbar-height',`${node.getBoundingClientRect().height}px`);
    const observer=new ResizeObserver(update);observer.observe(node);update();
    return()=>{observer.disconnect();if(old)parent.style.setProperty('--brief-toolbar-height',old);else parent.style.removeProperty('--brief-toolbar-height');};
  },[]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(null),[choices,setChoices]=useState({}),[pending,setPending]=useState(null),[notice,setNotice]=useState(null),[settled,setSettled]=useState(null);
  const link=saving.saved.feishuDocument,unfinished=pending||(link?.pending?.operationId!==settled&&link?.pending),locked=busy||Boolean(unfinished);
  useEffect(()=>{onLockChange(locked);},[locked,onLockChange]);
  const status=unfinished?(unfinished.status==='resumable'?'部分已同步，可继续':'同步待核对'):busy?'正在同步飞书…':saving.dirty||saving.busy||!link?.synced?(link?.url?'有更新待同步':'尚未生成飞书文档'):'已完成同步';
  const savedStatus=saving.error?'自动保存失败':saving.busy?'正在保存…':saving.dirty?'等待保存…':'已保存到工作台';
  const done=async receipt=>{
    const back=await apiSend('GET',`${path}/exports/${receipt.operationId}`);
    if(back.status!=='success'||!back.document?.url)throw Error('同步结果还需要核对');
    setPending(null);setSettled(back.operationId);setConflict(null);await saver.verify();
    setNotice(back.mode==='unchanged'?'内容已是最新':'已同步到飞书');
  };
  async function sync(resolution){
    if(busyRef.current||disabled||unfinished)return;
    busyRef.current=true;setBusy(true);setError('');let preview,submitted=false;
    try{
      const prepared=await saver.verify();
      preview=await apiSend('POST',`${path}/export-preview`,{...prepared,...resolution});
      setConflict(null);submitted=true;
      const receipt=await apiSend('POST',`${path}/export`,{previewId:preview.previewId,confirm:true});
      await done(receipt);
    }catch(e){
      if(e.body?.conflict){setConflict(e.body.conflict);setChoices({});}
      else if(e.receipt||e.body?.receipt){setPending(e.receipt||e.body.receipt);setError(e.message);}
      else if(submitted&&(!e.status||e.status>=500)){
        // Even if the confirmation response was lost, the durable preview id
        // identifies the original attempt. Never issue a replacement create.
        setPending({operationId:preview.operationId||preview.previewId,status:'unknown'});setError('同步回包未收到，先核对这次操作的实际结果。');
      }else setError(e.message);
    }finally{setBusy(false);busyRef.current=false;}
  }
  async function recover(resume=false){
    if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');
    const id=unfinished?.operationId||'pending';
    try{
      const r=await apiSend('POST',`${path}/exports/${encodeURIComponent(id)}/${resume?'resume':'reconcile'}`,{});
      if(r.status==='success')await done(r);
      else if(r.status==='aborted'){setPending(null);setSettled(r.operationId);setError('上次操作未写入飞书，可以重新同步。');}
      else setPending(r);
    }catch(e){if(e.receipt||e.body?.receipt)setPending(e.receipt||e.body.receipt);setError(e.message);}
    finally{setBusy(false);busyRef.current=false;}
  }
  return <>
    <div ref={toolbar} className="brief-sync-toolbar toolbar">
      {children}
      <div className="brief-sync-status small" role="status"><span className={saving.error?'risk-text':'muted'}>{savedStatus}</span><span>{status}</span>{link?.syncedAt&&<span className="muted">上次同步 {briefSyncTime(link.syncedAt)}（北京时间）</span>}</div>
      <span className="spacer" />
      {link?.url&&<a className="link small" href={link.url} target="_blank" rel="noreferrer">打开飞书文档<PixelIcon name="external"/></a>}
      <Button variant="primary" disabled={disabled||busy||Boolean(unfinished)} onClick={()=>sync()}><PixelIcon name="external"/>{busy?'同步中…':link?.url?'同步到飞书':'生成飞书文档'}</Button>
    </div>
    {notice&&<SuccessNotice identity={notice} onClose={()=>setNotice(null)}><span>{notice}</span></SuccessNotice>}
    {busy&&<p className="small muted">正在核对并同步，同步期间请暂缓编辑飞书原文档。</p>}
    {error&&<p className="small risk-text" role="alert">{error}</p>}
    {unfinished&&<div className="write-box is-warn" role="alert"><strong>{unfinished.status==='resumable'?'已核对完成的部分，可以继续':'上次同步需要核对'}</strong><p className="small">{unfinished.verificationNote||'原文档和操作记录已保留。先只读核对，继续时只完成上次提交的内容；之后的新草稿会保留待同步。'}</p><div className="row"><Button disabled={busy} onClick={()=>recover()}>重新读取核对</Button>{unfinished.status==='resumable'&&<Button disabled={busy} variant="primary" onClick={()=>recover(true)}>继续未完成部分</Button>}</div></div>}
    {conflict&&<div className="write-box brief-conflicts"><strong>以下内容两边都有修改，请逐项选择</strong><p className="small muted">未涉及的物料和飞书补写内容会保留。保留飞书后，本次取舍会被记住。</p>
      {conflict.sections.map(s=><div key={s.key} className="brief-conflict-item"><details><summary>{s.label}</summary><div className="brief-conflict-columns"><div><b>工作台</b><pre>{s.local||'（删除或空白）'}</pre></div><div><b>飞书</b><pre>{s.remote||'（空白）'}</pre></div></div></details><div className="row small">{[['local','采用工作台'],['remote','保留飞书']].map(([value,label])=><label key={value}><input type="radio" name={`conflict-${s.key}`} checked={choices[s.key]===value} onChange={()=>setChoices(c=>({...c,[s.key]:value}))}/>{label}</label>)}</div></div>)}
      <div className="row"><Button disabled={busy||conflict.sections.some(s=>!choices[s.key])} onClick={()=>sync({resolveConflict:conflict.id,resolutions:choices})}>按选择同步</Button><Button onClick={()=>setConflict(null)}>暂不同步</Button></div>
    </div>}
    <p className="small muted brief-sync-destination">位置：<a className="link" href={BRIEF_DESTINATION.url} target="_blank" rel="noreferrer">{BRIEF_DESTINATION.label}</a> · 每月固定一篇，修改后同步到原文档。</p>
  </>;
}
