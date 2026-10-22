import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { sourceStatus } from '../server/source-status.mjs';
import { createNasMaterials } from '../server/nas-materials.mjs';
import { createCanvasAutosave, protectCanvasDrafts } from '../src/ui/canvas-autosave.js';
import { createBriefAttachmentQueue, protectBriefAttachmentQueues } from '../src/modules/marketing/brief-attachment-queue.js';
import { briefText } from '../src/modules/marketing/brief-edit.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const clone = value => structuredClone(value);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };

test('NAS 深层读取失败不覆盖完整快照或推进成功时间，可恢复重试', async t => {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = fs.mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'nas-failure-'));
  const db = openDb(path.join(dir,'data')); t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
  const root = path.join(dir,'nas'), nested = path.join(root,'2026-11月/大学辅导/产品物料');
  fs.mkdirSync(nested,{recursive:true});fs.writeFileSync(path.join(nested,'双11活动海报.jpg'),'image');saveSetting(db,'nas_root',root);
  let now=Date.parse('2026-10-22T09:00:00+08:00');
  const service=createNasMaterials(db,{now:()=>now,makeThumb:async(src,out)=>fs.copyFileSync(src,out)});
  const before=await service.scan();now+=60000;
  const original=fs.readdirSync;
  const mock=t.mock.method(fs,'readdirSync',(p,...args)=>{if(p===nested)throw Object.assign(Error('offline child'),{code:'EIO'});return original(p,...args);});
  await assert.rejects(service.scan(),/目录读取失败/);
  const after=await service.read();assert.deepEqual(after.lines,before.lines);assert.equal(after.lastScanAt,before.lastScanAt);
  assert.equal(sourceStatus(db).sources.nas.state,'error');assert.equal(sourceStatus(db).sources.nas.at,before.lastScanAt);
  mock.mock.restore();assert.equal((await service.scan()).lastScanAt,'2026-10-22 09:01');assert.equal(sourceStatus(db).sources.nas.state,'ok');
});

function canvasFixture() {
  let back={value:{items:[],zones:[]},revision:'r0'},stored=null,calls=0,fail=true;const receipts=new Map();
  const options={
    initial:clone(back), journal:{read:async()=>clone(stored),write:async value=>{stored=clone(value);}},
    read:async()=>clone(back),operation:async id=>receipts.has(id)?{status:'saved'}:{status:'absent'},receipt:async id=>receipts.get(id),
    send:async body=>{calls++;if(fail)throw Object.assign(Error('offline'),{status:409});back={value:clone(body.value),revision:`r${calls}`};receipts.set(body.requestId,clone(back));return clone(back);},
  };
  return {options, get stored(){return stored;},get back(){return back;},get calls(){return calls;},set fail(v){fail=v;},set back(v){back=v;}, receipts};
}
const add = (id,extra={}) => value=>({...value,items:[...value.items,{id,title:id,x:0,...extra}]});

test('大图片保存失败后重新创建编辑器仍恢复草稿，并保留他页新增内容', async()=>{
  const f=canvasFixture(),first=createCanvasAutosave(f.options);await first.ready;
  first.change(add('mine',{imageDataUrl:'data:image/png;base64,'+'a'.repeat(6*1024*1024)}));await first.flush();
  assert.match(first.state().error,/草稿已保留/);assert.ok(f.stored.queue[0].delta.items.changes[0].add.imageDataUrl.length>5*1024*1024);
  f.back={value:{items:[{id:'theirs',title:'另一页面'}],zones:[]},revision:'another'};
  const returned=createCanvasAutosave({...f.options,initial:clone(f.back)});await returned.ready;
  assert.equal(returned.state().canRetry,true);assert.deepEqual(returned.state().value.items.map(i=>i.id),['theirs','mine']);
  f.fail=false;await returned.retry();assert.deepEqual(f.back.value.items.map(i=>i.id),['theirs','mine']);assert.equal(f.stored,null);
});

test('画布未知回包重开只核对原收据，不重复新增，并继续后续排队编辑',async()=>{
  const f=canvasFixture();f.fail=false;let readBroken=false, entered=deferred(), release=deferred();
  const options={...f.options,read:async()=>{if(readBroken)throw Error('response unavailable');return clone(f.back);},send:async body=>{const saved=await f.options.send(body);entered.resolve();await release.promise;readBroken=true;throw Error('lost response');},receipt:async()=>{throw Error('receipt unavailable');}};
  const first=createCanvasAutosave(options);await first.ready;first.change(add('one'));await entered.promise;
  first.change(value=>({...value,items:value.items.map(i=>({...i,x:24}))}));release.resolve();await first.flush();assert.equal(f.calls,1);
  readBroken=false;const returned=createCanvasAutosave({...f.options,initial:clone(f.back)});await returned.ready;
  assert.equal(returned.state().value.items.length,1);assert.equal(returned.state().value.items[0].x,24);
  await returned.retry();assert.equal(f.calls,2);assert.equal(f.back.value.items[0].x,24);assert.equal(f.stored,null);
});

test('画布重新核对后只重放改动字段，保留其他页面修改的标题',async()=>{
  const f=canvasFixture();f.back={value:{items:[{id:'one',title:'旧标题',x:0}],zones:[]},revision:'r0'};
  const first=createCanvasAutosave({...f.options,initial:clone(f.back)});await first.ready;first.change(v=>({...v,items:v.items.map(i=>({...i,x:8}))}));await first.flush();
  f.back={value:{items:[{id:'one',title:'另一页人工标题',x:0}],zones:[]},revision:'r1'};await first.reread();f.fail=false;await first.retry();
  assert.equal(f.back.value.items[0].title,'另一页人工标题');assert.equal(f.back.value.items[0].x,8);
});

test('草稿存储异常不假称持久化，仍可完成服务器保存',async()=>{
  const f=canvasFixture(),editor=createCanvasAutosave({...f.options,journal:{read:async()=>null,write:async()=>{throw Error('quota');}}});await editor.ready;
  editor.change(add('one'));await editor.flush();assert.match(editor.state().error,/仅保留在当前窗口/);
  await editor.reread();f.fail=false;await editor.retry();assert.equal(editor.state().error,'');assert.equal(f.back.value.items.length,1);
});

function attachmentsFixture() {
  let items=[],previews=0,confirms=0,fail=null;const values=new Map();
  const options={read:async()=>({items:clone(items)}),preview:async({name})=>{const id=`a${++previews}`,value={id,name,sha256:id};values.set(id,value);return{previewId:id,value};},
    removePreview:async id=>({previewId:`remove:${id}`,value:items.find(a=>a.id===id)}),confirm:async({previewId})=>{
      confirms++;if(fail==='before')throw Error('offline');
      if(previewId.startsWith('remove:'))items=items.filter(a=>a.id!==previewId.slice(7));else if(!items.some(a=>a.id===previewId))items.push(values.get(previewId));
      if(fail==='after')throw Error('response lost');
    }};
  return {options,get items(){return items;},get previews(){return previews;},get confirms(){return confirms;},set fail(v){fail=v;}};
}

test('附件选择即入保存队列，同步等待读文件、确认与回读，复制包含附件名',async()=>{
  const f=attachmentsFixture(),queue=createBriefAttachmentQueue(f.options),file=deferred();await queue.ready;
  queue.upload('参考海报.png',()=>file.promise);let finished=false;const exporting=queue.flush().then(()=>{finished=true;});await tick();assert.equal(finished,false);assert.equal(f.previews,0);
  file.resolve('data');await exporting;assert.equal(f.previews,1);assert.equal(f.confirms,1);assert.equal(queue.state().items[0].name,'参考海报.png');
  const brief={title:'Brief',background:{text:'人工内容',goals:[]},audience:[],timeline:[],items:[],specs:[],owners:[]};
  assert.match(briefText(brief,queue.state().items),/## 7\. 附件\n\n- 参考海报.png/);assert.match(briefText(brief,queue.state().items),/人工内容/);
});

test('附件确认回包丢失读取原 ID，不重复创建；删除也自动完成',async()=>{
  const f=attachmentsFixture();f.fail='after';const queue=createBriefAttachmentQueue(f.options);await queue.ready;
  queue.upload('参考.pdf',async()=>'data');await queue.flush();assert.equal(queue.state().error,'');assert.equal(f.previews,1);assert.equal(f.items.length,1);
  queue.remove(f.items[0]);await queue.flush();assert.equal(f.items.length,0);assert.equal(f.confirms,2);
});

test('附件未完成阻止导出，核对后以同一个预览继续，批量后一项不会漏',async()=>{
  const f=attachmentsFixture();f.fail='before';const queue=createBriefAttachmentQueue(f.options);await queue.ready;
  queue.upload('一.pdf',async()=>'data');queue.upload('二.pdf',async()=>'data');await assert.rejects(queue.flush(),/offline/);
  assert.equal(queue.state().pending.length,2);assert.equal(queue.canDiscard(),false);assert.equal(f.items.length,0);
  f.fail=null;await queue.recover();assert.equal(f.previews,2);assert.deepEqual(f.items.map(a=>a.name),['一.pdf','二.pdf']);assert.equal(queue.state().pending.length,0);
});

test('未知画布写入不能放弃，核对后仅移除失败首项，不删除已保存内容',async()=>{
  const f=canvasFixture();const editor=createCanvasAutosave({...f.options,operation:async()=>({status:'pending'})});await editor.ready;
  editor.change(add('failed'));editor.change(add('later'));await editor.flush();await editor.discard();assert.equal(editor.state().pending,2);
  await editor.reread();await editor.discard();assert.equal(editor.state().pending,2,'仍处理中不能放弃');
  const returned=createCanvasAutosave(f.options);await returned.ready;assert.equal(returned.state().canRetry,true);await returned.discard();
  assert.deepEqual(returned.state().value.items.map(i=>i.id),['later']);f.fail=false;await returned.retry();assert.deepEqual(f.back.value.items.map(i=>i.id),['later']);
});

test('旧草稿未读回时锁住编辑，不能覆盖或删除未知草稿，重读后恢复',async()=>{
  const f=canvasFixture(),old=createCanvasAutosave(f.options);await old.ready;old.change(add('older'));await old.flush();
  const original=clone(f.stored);let readFails=true,writes=0;
  const journal={read:async()=>{if(readFails)throw Error('temporary storage error');return clone(f.stored);},write:async value=>{writes++;return f.options.journal.write(value);}};
  const editor=createCanvasAutosave({...f.options,journal});await editor.ready;
  assert.equal(editor.state().locked,true);assert.match(editor.state().error,/尚未读回/);editor.change(add('newer'));await editor.flush();
  assert.equal(writes,0);assert.deepEqual(f.stored,original);
  readFails=false;await editor.reread();assert.deepEqual(editor.state().value.items.map(v=>v.id),['older']);assert.equal(editor.state().canRetry,true);
});

test('远端删除了本地正在修改的图片时保留冲突草稿，不能静默报保存成功',async()=>{
  const f=canvasFixture();f.back={value:{items:[{id:'one',title:'需保留的草稿',x:0}],zones:[]},revision:'r0'};
  const editor=createCanvasAutosave({...f.options,initial:clone(f.back)});await editor.ready;
  editor.change(v=>({...v,items:v.items.map(i=>({...i,x:8}))}));await editor.flush();f.back={value:{items:[],zones:[]},revision:'deleted'};
  await editor.reread();assert.equal(editor.state().canRetry,false);assert.equal(editor.state().canDiscard,true);assert.match(editor.state().error,/已删除/);
  assert.equal(editor.state().value.items[0].title,'需保留的草稿');assert.equal(editor.state().value.items[0].x,8);
  await editor.retry();assert.equal(f.calls,1);assert.equal(f.stored.queue.length,1);
  await editor.discard();assert.equal(editor.state().value.items.length,0);assert.equal(f.stored,null);
});

test('Brief 同步锁期间不可通过拖入新增附件，已有队列正常完成后才解锁',async()=>{
  const f=attachmentsFixture(),queue=createBriefAttachmentQueue(f.options),file=deferred();await queue.ready;
  queue.upload('已选.pdf',()=>file.promise);queue.setLocked(true);queue.upload('同步中拖入.pdf',async()=>'data');
  assert.equal(queue.state().pending.length,1);file.resolve('data');await queue.flush();assert.equal(f.items.length,1);
  queue.setLocked(false);queue.upload('同步后.pdf',async()=>'data');await queue.flush();assert.deepEqual(f.items.map(a=>a.name),['已选.pdf','同步后.pdf']);
});


test('离开 Brief 后其他板块刷新仍保护附件失败队列，保存完自动不再阻拦',async()=>{
  const f=attachmentsFixture();f.fail='before';const queue=createBriefAttachmentQueue(f.options);await queue.ready;
  const listeners=new Map(), target={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const release=protectBriefAttachmentQueues(new Map([['2026-10',queue]]),target);
  const unsubscribe=queue.subscribe(()=>{});queue.upload('仍未保存.pdf',async()=>'data');await assert.rejects(queue.flush());
  unsubscribe(); // Simulate leaving Brief for another module.
  const event={blocked:false,preventDefault(){this.blocked=true;}};listeners.get('beforeunload')(event);assert.equal(event.blocked,true);
  f.fail=null;await queue.recover();const done={blocked:false,preventDefault(){this.blocked=true;}};listeners.get('beforeunload')(done);assert.equal(done.blocked,false);
  release();assert.equal(listeners.has('beforeunload'),false);
});


test('画布存储失败后离开页面，全局保护仍阻止刷新丢稿，成功后不再提示',async()=>{
  const f=canvasFixture(),editor=createCanvasAutosave({...f.options,journal:{read:async()=>null,write:async()=>{throw Error('quota');}}});await editor.ready;
  const listeners=new Map(),target={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const release=protectCanvasDrafts(new Map([['canvas',editor]]),target),unsubscribe=editor.subscribe(()=>{});
  editor.change(add('draft'));await editor.flush();unsubscribe();
  const event={blocked:false,preventDefault(){this.blocked=true;}};listeners.get('beforeunload')(event);assert.equal(event.blocked,true);
  await editor.reread();f.fail=false;await editor.retry();const saved={blocked:false,preventDefault(){this.blocked=true;}};
  listeners.get('beforeunload')(saved);assert.equal(saved.blocked,false);release();assert.equal(listeners.size,0);
});
