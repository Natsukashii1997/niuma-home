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

test('双向同步受控接纳新版本，更新输入框后仍可自动保存',async t=>{
 const {make,service,data}=fixture(t),saver=make();
 service.autosave(month,{baseVersion:'v0',requestId:'cloud-import',patch:{background:{text:'飞书补写文案\n第二行'}}});
 const imported=await saver.acceptSync();
 assert.equal(imported.version,'v1');assert.equal(saver.state().saved.version,'v1');
 assert.equal(saver.state().draft.background.text,'飞书补写文案\n第二行');assert.equal(saver.state().dirty,false);assert.equal(data.size,0);
 saver.update(d=>{d.background.text+='\n工作台继续填写';});await saver.flush();
 assert.equal(service.read(month).version,'v2');assert.equal(service.read(month).background.text,'飞书补写文案\n第二行\n工作台继续填写');
});
test('双向同步回读不能接管尚未保存的本页草稿',async t=>{
 const {make,service,data}=fixture(t);let reads=0;
 const saver=make({read:async()=>{reads++;return service.read(month);}});
 saver.update(d=>{d.title='本页尚未保存';});
 await assert.rejects(saver.acceptSync(),e=>e.code==='BRIEF_SAVE_CONFLICT'&&e.status===409);
 assert.equal(reads,0);assert.equal(saver.state().draft.title,'本页尚未保存');assert.equal(saver.state().saved.version,'v0');
 assert.equal(data.size,1);assert.equal(service.read(month).version,'v0');await saver.resolve(false);
});
test('双向同步回读不能越过正在执行的自动保存',async t=>{
 const {make,service}=fixture(t),hold=gate();let reads=0;
 const saver=make({send:async b=>{await hold.promise;return service.autosave(month,b);},read:async()=>{reads++;return service.read(month);}});
 saver.update(d=>{d.title='正在保存的文字';});const writing=saver.flush();await Promise.resolve();
 await assert.rejects(saver.acceptSync(),e=>e.code==='BRIEF_SAVE_CONFLICT'&&e.status===409);
 assert.equal(reads,0);assert.equal(saver.state().draft.title,'正在保存的文字');hold.release();await writing;
 assert.equal(service.read(month).title,'正在保存的文字');await saver.resolve(false);
});
test('双向同步回读不能绕过已有的多页面冲突',async t=>{
 const {make,service}=fixture(t),saver=make();
 service.autosave(month,{baseVersion:'v0',requestId:'other-tab',patch:{title:'另一页内容'}});
 await assert.rejects(saver.verify(),e=>e.code==='BRIEF_SAVE_CONFLICT');
 await assert.rejects(saver.acceptSync(),e=>e.code==='BRIEF_SAVE_CONFLICT');
 assert.equal(saver.state().saved.version,'v0');assert.notEqual(saver.state().draft.title,'另一页内容');await saver.resolve(false);
});
test('双向同步读取途中继续输入时，保留草稿而不覆盖',async t=>{
 const {make,service,data}=fixture(t),hold=gate();
 service.autosave(month,{baseVersion:'v0',requestId:'cloud-import',patch:{title:'云端同步版本'}});
 const initial=service.read(month);initial.version='v0';initial.title='原版本';
 const saver=make({initial,read:async()=>{const value=service.read(month);await hold.promise;return value;}});
 const adopting=saver.acceptSync();saver.update(d=>{d.title='请求途中继续写';});hold.release();
 await assert.rejects(adopting,e=>e.code==='BRIEF_SAVE_CONFLICT');
 assert.equal(saver.state().draft.title,'请求途中继续写');assert.equal(saver.state().saved.version,'v0');assert.equal(data.size,1);
 assert.equal(service.read(month).title,'云端同步版本');await saver.resolve(false);
});
test('双向同步读取途中已完成另一保存，也不接纳旧回读',async t=>{
 const {make,service}=fixture(t),hold=gate();
 const saver=make({read:async()=>{const value=service.read(month);await hold.promise;return value;}});
 const adopting=saver.acceptSync();saver.update(d=>{d.title='后来已经保存的新稿';});await saver.flush();hold.release();
 await assert.rejects(adopting,e=>e.code==='BRIEF_SAVE_CONFLICT');
 assert.equal(saver.state().draft.title,'后来已经保存的新稿');assert.equal(saver.state().saved.version,'v1');
 assert.equal(service.read(month).title,'后来已经保存的新稿');await saver.resolve(false);
});
test('双向同步只接纳同月份的有效版本，回读错误保留当前内容',async t=>{
 const {make,service}=fixture(t),saver=make({read:async()=>({...service.read(month),month:'2026-11',title:'错月内容'})});
 await assert.rejects(saver.acceptSync(),e=>e.code==='BRIEF_SYNC_READBACK_INVALID');
 assert.equal(saver.state().draft.month,month);assert.equal(saver.state().saved.version,'v0');
 const offline=make({read:async()=>{throw new Error('读取断线');}});
 await assert.rejects(offline.acceptSync(),/读取断线/);assert.equal(offline.state().saved.version,'v0');assert.equal(offline.state().dirty,false);
});
test('重开旧pending时，历史requestId不能证明较新云端导入属于原保存',async t=>{
 const {make,service,data}=fixture(t);let requestId,writes=0;
 const first=make({send:async body=>{requestId=body.requestId;service.autosave(month,body);throw new Error('保存回包丢失');},read:async()=>{throw new Error('回读也断线');}});
 first.update(d=>{d.title='本页已提交标题';});await assert.rejects(first.flush());
 service.autosave(month,{baseVersion:'v1',requestId:'cloud-import',patch:{background:{text:'刚从飞书回填的文案'}}});
 const staleMetadata={...service.read(month),saveRequestId:requestId};
 const restored=make({initial:staleMetadata,send:async body=>{writes++;return service.autosave(month,body);}});
 assert.equal(restored.state().error?.code,'BRIEF_SAVE_CONFLICT');assert.equal(restored.state().saved.version,'v0');
 assert.equal(restored.state().draft.title,'本页已提交标题');await assert.rejects(restored.flush(),e=>e.code==='BRIEF_SAVE_CONFLICT');
 assert.equal(writes,0);assert.equal(service.read(month).background.text,'刚从飞书回填的文案');
 const journal=JSON.parse([...data.values()][0]);assert.equal(journal.pending.requestId,requestId);assert.equal(journal.pending.baseVersion,'v0');
 await restored.resolve(false);await first.resolve(false).catch(()=>{});
});
test('丢包回读同requestId但版本超过base+1时，停止重放并保留草稿日志',async t=>{
 const {make,service,data}=fixture(t);let requestId,writes=0;
 const saver=make({send:async body=>{
   writes++;requestId=body.requestId;service.autosave(month,body);
   service.autosave(month,{baseVersion:'v1',requestId:'cloud-import',patch:{background:{text:'飞书回填新内容'}}});
   throw new Error('保存回包丢失');
 },read:async()=>({...service.read(month),saveRequestId:requestId})});
 saver.update(d=>{d.title='当前页待核对标题';});await assert.rejects(saver.flush(),e=>e.code==='BRIEF_SAVE_CONFLICT');
 assert.equal(saver.state().saved.version,'v0');assert.equal(saver.state().draft.title,'当前页待核对标题');assert.equal(writes,1);
 assert.equal(service.read(month).version,'v2');assert.equal(service.read(month).background.text,'飞书回填新内容');
 const journal=JSON.parse([...data.values()][0]);assert.equal(journal.pending.requestId,requestId);assert.equal(journal.pending.baseVersion,'v0');
 await assert.rejects(saver.flush(),e=>e.code==='BRIEF_SAVE_CONFLICT');assert.equal(writes,1);await saver.resolve(false);
});
