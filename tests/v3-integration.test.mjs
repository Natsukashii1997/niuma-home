import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { openDb, saveSetting } from '../server/db.mjs';
import { match } from '../server/http.mjs';
import { routes } from '../server/routes/workspace.mjs';
import { sourceStatus, recordSource } from '../server/source-status.mjs';
import { TIMELINE_SOURCE } from '../server/timeline.mjs';
import { createSettingsChanges, validateV3Setting } from '../server/v3-settings.mjs';
import { createLocalChanges, getRecord, putRecord } from '../server/local-records.mjs';
import { createReferenceService, compressReference, referenceDir } from '../server/references.mjs';
import { todoView, createTodoReader } from '../server/home-todo.mjs';
import { createNeedsService } from '../server/needs.mjs';

const instant = Date.parse('2026-10-16T12:00:00+08:00'), link = 'https://example.feishu.cn/docx/test';
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'integration-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive:true, force:true }); }); return { db, dir };
}
async function invoke(all, method, endpoint, body) {
  const url = new URL(endpoint, 'http://127.0.0.1'), found = match(all, method, url.pathname); assert.ok(found, endpoint);
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]); req.method=method; req.url=endpoint;
  let status, text; const headers = {};
  const res = { setHeader:(key,value)=>headers[key]=value, writeHead:(code,values)=>{status=code;Object.assign(headers,values);}, end:value=>{text=value;} };
  await found.handler(req,res,{params:found.params,url});
  return { status, headers, body: headers['content-type']?.startsWith('application/json') ? JSON.parse(text) : text };
}

test('状态接口零外部读取，日报/周报成功时间落库且重开数据库保留', async t => {
  const {db,dir}=database(t); let reads=0;
  saveSetting(db,'report_doc_url',link+'/?from=sheet#part');
  const options={readDocument:async()=>{reads++;return '## 周报 2026-10-14\n周正文\n## 日报 2026-10-13\n日正文';},now:()=>instant};
  const all=routes(db,options,{}, {timeline:{readSheets:()=>{throw Error('不应读时间线');}}, kb:{readSource:()=>{throw Error('不应读知识库');}}});
  assert.equal((await invoke(all,'GET','/api/v3/status')).body.sources.daily.state,'never'); assert.equal(reads,0);
  assert.equal((await invoke(all,'GET','/api/reports')).status,200); assert.equal(reads,1);
  const first=(await invoke(all,'GET','/api/v3/status')).body;
  assert.equal(first.sources.daily.at,'2026-10-16 12:00');assert.equal(first.sources.weekly.at,first.sources.daily.at);assert.equal(reads,1);
  const reopened=openDb(dir);try { assert.deepEqual(sourceStatus(reopened).sources,first.sources); } finally {reopened.close();}
  assert.equal((await invoke(all,'GET','/api/v3/status')).body.sources.nas.state,'never');assert.equal(reads,1);
});

test('状态失败保留成功水位，切换配置不沿用旧来源成功；旧请求不能覆盖新请求', t=>{
  const {db}=database(t);saveSetting(db,'report_doc_url',link);
  recordSource(db,'daily',{identity:link,attemptAt:10,at:new Date(instant).toISOString()});
  recordSource(db,'daily',{identity:link,attemptAt:12,error:'读取失败'});
  recordSource(db,'daily',{identity:link,attemptAt:11,at:new Date(instant+60000).toISOString()});
  assert.deepEqual(sourceStatus(db).sources.daily,{state:'error',at:'2026-10-16 12:00',error:'读取失败'});
  saveSetting(db,'report_doc_url',link+'2');assert.equal(sourceStatus(db).sources.daily.state,'never');
  recordSource(db,'timeline',{identity:JSON.stringify(TIMELINE_SOURCE),at:new Date(instant).toISOString()});
  saveSetting(db,'timeline_source',JSON.stringify({...TIMELINE_SOURCE,token:'otherSource123'}));assert.equal(sourceStatus(db).sources.timeline.state,'never');
  recordSource(db,'kb',{identity:'7620758074885835965',at:new Date(instant).toISOString()});saveSetting(db,'kb_space_id','1234567890123');assert.equal(sourceStatus(db).sources.kb.state,'never');
  recordSource(db,'voice',{identity:'/tmp/trial',at:new Date(instant).toISOString(),extra:{used:0,limit:10}});saveSetting(db,'voice_budget','5');assert.equal(sourceStatus(db,{implemented:['voice'],voiceIdentity:'/tmp/trial'}).sources.voice.limit,5);
});

test('恢复数据库缺状态行时，时间线成功快照仍须核对来源身份',t=>{
  const{db}=database(t);
  db.prepare('INSERT INTO v3_snapshots(kind,payload,updated_at) VALUES(?,?,?)').run('timeline',JSON.stringify({identity:'other',value:{agenda:[]}}),new Date(instant).toISOString());
  assert.equal(sourceStatus(db).sources.timeline.state,'never');
  db.prepare('UPDATE v3_snapshots SET payload=? WHERE kind=?').run(JSON.stringify({identity:JSON.stringify(TIMELINE_SOURCE),value:{agenda:[]}}),'timeline');
  assert.deepEqual(sourceStatus(db).sources.timeline,{state:'ok',at:'2026-10-16 12:00'});
});

test('设置接口先预览后确认，绑定内容、拒绝并发旧值，固定机械邪龙兽身份',async t=>{
  const {db}=database(t),all=routes(db);
  assert.equal((await invoke(all,'GET','/api/v3/settings')).body.values.voice_budget,'10');
  assert.equal((await invoke(all,'PUT','/api/settings/voice_budget',{value:'5'})).status,400);
  const a=(await invoke(all,'POST','/api/settings/voice_budget/preview',{value:'5'})).body;
  const b=(await invoke(all,'POST','/api/settings/voice_budget/preview',{value:'3'})).body;
  const result=await invoke(all,'PUT','/api/settings/voice_budget',{previewId:a.previewId,confirm:true,value:'1'});assert.equal(result.status,200);
  assert.equal((await invoke(all,'GET','/api/v3/settings')).body.saved.voice_budget,'5');
  assert.equal((await invoke(all,'PUT','/api/settings/voice_budget',{previewId:b.previewId,confirm:true})).status,409);
  assert.deepEqual((await invoke(all,'PUT','/api/settings/voice_budget',{previewId:a.previewId,confirm:true})).body,result.body);
  for(const [key,value] of [['lark_profile','claude'],['lark_app_id','other'],['voice_budget','11'],['nas_root','/'],['nas_root','/tmp/../private'],['price_floor_margin','1']])assert.throws(()=>validateV3Setting(key,value),{status:400});
  let clock=0;const settings=createSettingsChanges(db,{now:()=>clock}),p=settings.preview('voice_budget',{value:'4'});clock=600001;assert.throws(()=>settings.confirm('voice_budget',{previewId:p.previewId,confirm:true}),{status:409});
});

test('本地写入单事务、写后回读、固定回执、冲突与数据库故障回滚',t=>{
  const {db}=database(t),changes=createLocalChanges(db),a=changes.preview('test','a',{value:1}),b=changes.preview('test','a',{value:2});
  assert.equal(getRecord(db,'test','a'),null);assert.throws(()=>changes.confirm('test','a',{previewId:a.previewId}),{status:400});
  const receipt=changes.confirm('test','a',{previewId:a.previewId,confirm:true});assert.deepEqual(receipt,{value:1});
  assert.throws(()=>changes.confirm('test','a',{previewId:b.previewId,confirm:true}),{status:409});
  putRecord(db,'test','a',{value:3});assert.deepEqual(changes.confirm('test','a',{previewId:a.previewId,confirm:true}),{value:1});
  const p=changes.preview('test','b',{value:4});db.exec("CREATE TRIGGER failed_document BEFORE INSERT ON v3_documents BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.throws(()=>changes.confirm('test','b',{previewId:p.previewId,confirm:true}));assert.equal(getRecord(db,'test','b'),null);db.exec('DROP TRIGGER failed_document');
  const d=changes.preview('test','a',null,{remove:true});assert.deepEqual(changes.confirm('test','a',{previewId:d.previewId,confirm:true}),{ok:true,id:'a'});assert.equal(getRecord(db,'test','a'),null);
});

test('参考画布接口图片先压缩预览再确认，重试幂等且路径限制，旧预览不会留下孤立新图',async t=>{
  const {db}=database(t),jpeg=Buffer.from([255,216,255,217]),all=routes(db,undefined,undefined,{refs:{compress:async()=>jpeg}});
  assert.deepEqual((await invoke(all,'GET','/api/v3/refs')).body,{zones:[],items:[]});
  const value={zones:[],items:[{id:'a',x:1,y:2,w:100,kind:'poster',title:'参考',tags:['test'],source:'本机',imageDataUrl:'injected'}]};
  const a=(await invoke(all,'POST','/api/v3/refs/preview',value)).body,b=(await invoke(all,'POST','/api/v3/refs/preview',value)).body;
  assert.equal(existsSync(referenceDir(db)),false);assert.equal((await invoke(all,'POST','/api/v3/refs',{previewId:a.previewId,confirm:false})).status,400);assert.equal(existsSync(referenceDir(db)),false);
  const body={previewId:a.previewId,confirm:true},saved=(await invoke(all,'POST','/api/v3/refs',body)).body;
  assert.deepEqual((await invoke(all,'POST','/api/v3/refs',body)).body,saved);assert.deepEqual((await invoke(all,'GET',saved.items[0].src)).body,jpeg);
  assert.equal((await invoke(all,'POST','/api/v3/refs',{previewId:b.previewId,confirm:true})).status,409);assert.equal(readdirSync(referenceDir(db)).length,1);
  const refs=createReferenceService(db);assert.throws(()=>refs.image('../secret'),{status:404});
  await assert.rejects(refs.preview({...value,items:[{...value.items[0],imageDataUrl:undefined,src:'https://outside.test/x.jpg'}]}),{status:400});
});

test('参考图片实际系统压缩为JPEG，拒绝伪造格式',async()=>{
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aMGQAAAAASUVORK5CYII=';
  const bytes=await compressReference(png);assert.equal(bytes[0],255);assert.equal(bytes[1],216);
  await assert.rejects(compressReference('data:image/png;base64,SGVsbG8='),{status:415});
});

test('首页待办使用完整年份和异常，空门禁不误报，不再列主线需求，外部失败不返回假空',async t=>{
  const {db}=database(t),input={timeline:{anomalies:[{},{verification:{status:'confirmed'}},{ruling:{decision:'exclude'}}]},needs:{needs:[{status:'草稿'},{status:'待复核'}]},projects:[{name:'项目',nodes:[{t:'明年节点',due:'01-01',dueDate:'2027-01-01',done:false,owner:'人'},{t:'空门禁',gate:true,done:false},{t:'待审',gate:true,gateReady:true}]}],campaign:null,matrices:[],settings:{costPerHour:440,floorMargin:.25}};
  const list=todoView(input,Date.parse('2026-12-31T12:00:00+08:00'));assert.ok(!list.some(x=>x.kind==='需求'));assert.equal(list.filter(x=>x.kind==='审核').length,1);assert.match(list.find(x=>x.kind==='项目').sub,/1天内/);assert.equal(list.find(x=>x.kind==='项目').dueDate,'2027-01-01');
  assert.equal(list.find(x=>x.kind==='时间线').text,'1 条 AI 推测');
  const read=createTodoReader(db,{timeline:async()=>input.timeline,projects:{list:async()=>input.projects},now:()=>Date.parse('2026-12-31T12:00:00+08:00')});assert.equal((await read()).find(x=>x.kind==='项目').dueDate,'2027-01-01');
  await assert.rejects(createTodoReader(db,{timeline:async()=>{throw Error('source failed');},projects:{list:async()=>[]}})(),/source failed/);
});

test('自言自语转需求进入采纳流程，消息草稿变动会撤销原采纳有效性',async t=>{
  const {db}=database(t),manual={id:'message',month:'2026-11',text:'请求',need:{id:'selftalk-message',seg:'待确认',node:'自言自语',when:'2026-11',schools:0,need:'请求',pain:'',todo:'梳理',source:'本人消息',status:'草稿',links:''}};
  putRecord(db,'selftalk-need','message',manual);const service=createNeedsService(db,async()=>({agenda:[],stage:'本科'}));
  assert.equal((await service.list('2026-11')).needs.length,1);const p=await service.preview(manual.need.id,{month:'2026-11'});await service.confirm(manual.need.id,{previewId:p.previewId,confirm:true});assert.equal((await service.list('2026-11')).needs[0].status,'已采纳');
  putRecord(db,'selftalk-need','message',{...manual,text:'更改'});assert.equal((await service.list('2026-11')).needs[0].status,'待复核');
});

test('营收读飞书仪表盘，200 且不再带演示标记',async t=>{
  const {db}=database(t),value={period:'2026 年 10 月',timePct:0.5,updatedAt:'10-20 18:40',groups:[{label:'总进度',items:[]},{label:'业务线',items:[]}]};
  const result=await invoke(routes(db,undefined,undefined,{revenue:{readSource:async()=>value}}),'GET','/api/v3/business/revenue');assert.equal(result.status,200);assert.equal(result.body.origin,undefined);assert.equal(result.headers['x-workdesk-data-origin'],undefined);const { stale, refreshing, sourceError, fetchedAt, ...body } = result.body;assert.deepEqual(body,value);assert.equal(stale,false);assert.equal(refreshing,false);assert.equal(sourceError,'');assert.ok(Date.parse(fetchedAt));
});

test('图表接口复用缓存，显式刷新回报失败且不影响营收卡', async t => {
  const { db } = database(t);
  let reads = 0, fail = false;
  const value = { source: 'test', period: '2026-10', updatedAt: '2026-10-16 12:00', charts: [] };
  const all = routes(db, undefined, undefined, {
    businessCharts: { now: () => instant, readSource: async () => { reads++; if (fail) throw Object.assign(new Error('图表读取失败'), { status: 502 }); return value; } },
    revenue: { readSource: async () => ({ groups: [{ label: '总进度', items: [] }] }) },
  });
  const first = await invoke(all, 'GET', '/api/v3/business/charts');
  assert.equal(first.status, 200);
  assert.equal(first.body.stale, false);
  await invoke(all, 'GET', '/api/v3/business/charts');
  assert.equal(reads, 1);
  fail = true;
  assert.equal((await invoke(all, 'GET', '/api/v3/business/charts?refresh=1')).status, 502);
  const last = await invoke(all, 'GET', '/api/v3/business/charts');
  assert.equal(last.body.updatedAt, value.updatedAt);
  assert.equal(last.body.sourceError, '图表读取失败');
  assert.equal((await invoke(all, 'GET', '/api/v3/business/revenue')).status, 200);
});
