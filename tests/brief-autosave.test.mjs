import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {openDb} from '../server/db.mjs';
import {createBriefService} from '../server/briefs.mjs';
import {acquireBriefJournal,createBriefAutosave} from '../src/modules/marketing/brief-autosave.js';
const month='2026-10';
function fixture(t){
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'brief-autosave-')),db=openDb(dir);
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
  const service=createBriefService(db,{strategy:{get:()=>({month})}});
  const data=new Map(),storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
  let serial=0;
  const make=(overrides={})=>createBriefAutosave({initial:service.read(month),storage,delay:100000,makeId:()=>`save-${++serial}`,send:async b=>service.autosave(month,b),read:async()=>service.read(month),...overrides});
  return{service,make,storage,data};
}
const gate=()=>{let release;const promise=new Promise(r=>release=r);return{promise,release};};
test('自动保存串行：保存中继续输入，立即导出等待最新文本且不回退界面',async t=>{
  const {service,make}=fixture(t),hold=gate();let calls=0,active=0,max=0;
  const saver=make({send:async b=>{active++;max=Math.max(max,active);if(++calls===1)await hold.promise;const value=service.autosave(month,b);active--;return value;}});
  saver.update(d=>{d.title='第一版';});const first=saver.flush();await Promise.resolve();
  saver.update(d=>{d.title='刚输入的最终版';});const exportFlush=saver.flush();
  assert.equal(first,exportFlush);hold.release();await exportFlush;
  assert.equal(calls,2);assert.equal(max,1);assert.equal(service.read(month).title,'刚输入的最终版');
  assert.equal(saver.state().draft.title,'刚输入的最终版');assert.equal(saver.state().dirty,false);
});
test('响应丢失后先回读确认，不重复保存；可继续编辑',async t=>{
  const {service,make}=fixture(t);let calls=0;
  const saver=make({send:async b=>{calls++;service.autosave(month,b);throw new Error('断线');}});
  saver.update(d=>{d.title='已落盘';});await saver.flush();assert.equal(calls,1);assert.equal(service.read(month).version,'v1');
  saver.update(d=>{d.title='下一版';});await saver.flush();assert.equal(service.read(month).version,'v2');
});
test('多页面冲突停止保存与导出，草稿保留，明确选择后才覆盖',async t=>{
  const {service,make}=fixture(t),a=make(),b=make();
  a.update(d=>{d.title='另一页面';});await a.flush();
  b.update(d=>{d.title='我的未保存内容';});await assert.rejects(b.flush(),e=>e.code==='BRIEF_SAVE_CONFLICT');
  assert.equal(service.read(month).title,'另一页面');assert.equal(b.state().draft.title,'我的未保存内容');
  await b.resolve(true);assert.equal(service.read(month).title,'我的未保存内容');
});
test('刷新前输入的草稿从本地恢复；服务未收到请求时可以安全重试',async t=>{
  const {service,make}=fixture(t),first=make();first.update(d=>{d.title='刷新前填写';});
  const restored=make({send:async()=>{throw new Error('网络离线');}});
  assert.equal(restored.state().draft.title,'刷新前填写');await assert.rejects(restored.flush());
  const again=make();await again.flush();assert.equal(service.read(month).title,'刷新前填写');
  await first.resolve(false); // cancel the inactive editor's pending timer
});
test('已保存但回读也断线，重开识别请求编号并保存较新的输入',async t=>{
  const {service,make}=fixture(t),hold=gate();
  const first=make({send:async b=>{service.autosave(month,b);await hold.promise;throw new Error('断线');},read:async()=>{throw new Error('回读断线');}});
  first.update(d=>{d.title='已保存第一版';});const writing=first.flush();await Promise.resolve();
  first.update(d=>{d.title='后续输入';});hold.release();await assert.rejects(writing);
  const restored=make();await restored.flush();assert.equal(service.read(month).title,'后续输入');
  await first.resolve(false).catch(()=>{});
});
test('保存接口绑定基线和请求编号、拒绝坏输入，同请求回读不增加版本',t=>{
  const {service}=fixture(t),body={requestId:'a',baseVersion:'v0',patch:{title:'标题'}};
  assert.equal(service.autosave(month,body).version,'v1');assert.equal(service.autosave(month,body).version,'v1');
  assert.throws(()=>service.autosave(month,{...body,patch:{title:'偷换内容'}}),e=>e.status===400);
  assert.throws(()=>service.autosave(month,{...body,requestId:'b'}),e=>e.status===409);
  assert.throws(()=>service.autosave(month,{requestId:'c',baseVersion:'v1',patch:{title:''}}),e=>e.status===400);
  assert.equal(service.read(month).title,'标题');
});
test('每个编辑页面独立恢复日志，另一个页面保存不删除我的草稿',async t=>{
 const {make,service,data}=fixture(t),a=make({journalId:'tab-a'}),b=make({journalId:'tab-b'});
 a.update(d=>{d.title='A未保存';});b.update(d=>{d.title='B保存';});await b.flush();
 assert.equal(data.size,1);const restored=make({journalId:'tab-a'});
 assert.equal(restored.state().draft.title,'A未保存');assert.equal(restored.state().error.code,'BRIEF_SAVE_CONFLICT');
 await a.resolve(false);await restored.resolve(false);assert.equal(service.read(month).title,'B保存');
});
test('导出前即使没有新输入也核对版本；恢复期间不接受会被覆盖的输入',async t=>{
 const {make,service}=fixture(t),a=make({journalId:'a'}),b=make({journalId:'b'});
 b.update(d=>{d.title='另一页新内容';});await b.flush();await assert.rejects(a.verify(),e=>e.code==='BRIEF_SAVE_CONFLICT');
 const hold=gate();const restoring=make({read:async()=>{await hold.promise;return service.read(month);}});
 const task=restoring.resolve(false);assert.equal(restoring.state().resolving,true);
 restoring.update(d=>{d.title='不应接受的输入';});hold.release();await task;
 assert.equal(restoring.state().draft.title,'另一页新内容');await a.resolve(false);
});

test('复制标签页的相同session ID会分配独立日志，刷新可重新取得原ID',async()=>{
 const held=new Set(),locks={async request(id,opts,fn){if(held.has(id))return fn(null);held.add(id);try{return await fn({name:id});}finally{held.delete(id);}}};
 const session=()=>{let id='copied-id';return{getItem:()=>id,setItem:(k,v)=>{id=v;}};};
 const sa=session(),sb=session(),a=await acquireBriefJournal({locks,session:sa,local:{}}),b=await acquireBriefJournal({locks,session:sb,local:{},makeId:()=> 'second-tab'});
 assert.notEqual(a.journalId,b.journalId);a.release();await Promise.resolve();await Promise.resolve();
 const reloaded=await acquireBriefJournal({locks,session:sa,local:{}});assert.equal(reloaded.journalId,a.journalId);reloaded.release();b.release();
});
