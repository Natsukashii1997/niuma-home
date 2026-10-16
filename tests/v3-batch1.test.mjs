import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { routes } from '../server/routes/workspace.mjs';
import * as fallback from '../server/routes/v3.mjs';
import { match, json } from '../server/http.mjs';
import { codexResetView, createCodexResetReader } from '../server/codex-reset.mjs';
import { parseTimelineDate, parseTimeline, parseAnnotatedCsv, readTimelineSheets, REGION_SHEETS } from '../server/timeline.mjs';
import { deriveNeeds } from '../server/needs.mjs';

const makeSheet = (name, rows) => ({ name, cols: ['A', 'B', 'C', 'D'], rows: rows.map((values, i) => ({ row: i + 1, values })) });
function sheets() { return [
  makeSheet(REGION_SHEETS[0], [['美西','Fall学期开始','Final时间','Winter学期选课'], ['UW','9.30','12.12-12.18','11.5-2027.1.10']]),
  makeSheet(REGION_SHEETS[1], [['英国（semester1/2）','S2 Final 时间','出分时间（预估）','补考时间'], ['卡迪夫大学','2026.5.11-2025.6.12','2026.11.20','2026.8.3-']]),
  makeSheet(REGION_SHEETS[2], [['澳洲（semester1/2）','Semester 2学期开学','Final时间','出分时间'], ['昆士兰大学UQ','7.27','11.7-11.21','12.2'], ['新西兰（semester1/2）','','Final时间','出分时间'], ['新西兰-奥克兰大学Auckland','7.20','10.29-11.16','']]),
  makeSheet(REGION_SHEETS[3], [['香港（Term1/2）','Term 1学期开学','Final时间','出分时间'], ['香港大学HKU','2026.8.31（AI推测）','2026.12.8-12.23（AI推测）','2027.1.15（AI推测）']]),
]; }
const signal = (id, action, at) => ({ id, action, publishedAt: at, kind: 'event_update', text: `中译${id}`, originalText: `original ${id}`, url: `https://x.com/thsottiaux/status/${id}` });
const resetSource = () => ({ checkedAt: '2026-10-16T12:30:42+08:00', events: [{ id: 'e', status: 'confirmed', schedule: { from: '2026-10-13T15:00:00+08:00', through: '2026-10-13T15:00:00+08:00', label: '旧预告' } }], activities: [signal('1', 'confirm', '2026-10-15T14:28:13+08:00')] });

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须隔离');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'v3-'));
  const db = openDb(dir); let data = sheets(), readError, instant = Date.parse('2026-10-16T14:00:00+08:00'), reads = 0;
  const all = [...routes(db, undefined, undefined, { timeline: { readSheets: async () => { reads++; if (readError) throw readError; return structuredClone(data); }, now: () => instant }, needs: { now: () => instant }, codex: { fetcher: async () => Response.json(resetSource()) } }), ...fallback.routes()];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), found = match(all, req.method, url.pathname);
    if (!found) return json(res, 404, { error: '接口不存在' });
    try { await found.handler(req, res, { params: found.params, url }); } catch { json(res, 500, { error: '异常' }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, endpoint, body) => { const r = await fetch(base + endpoint, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  return { db, request, base, setData: v => data = v, setError: e => readError = e, advance: n => instant += n, reads: () => reads };
}

test('V3 日期严格补年、跨年、推测与不完整范围，不修来源年份', () => {
  assert.deepEqual(parseTimelineDate('11.7-11.21'), { from: '2026-11-07', to: '2026-11-21' });
  assert.deepEqual(parseTimelineDate('12.19-2027.1.3'), { from: '2026-12-19', to: '2027-01-03' });
  assert.equal(parseTimelineDate('2026.4.25-2025.5.9').flag, 'conflict');
  assert.equal(parseTimelineDate('2026.8.3-').from, undefined);
  assert.equal(parseTimelineDate('11.17-2.8').from, undefined);
  assert.equal(parseTimelineDate('2026.12.8-12.23（AI推测）').flag, 'guess');
  assert.equal(parseTimelineDate('2026.11.20', '出分时间（预估）').flag, 'guess');
  assert.equal(parseTimelineDate('11.2-11.3\n11.8-11.9').from, undefined);
  assert.equal(parseTimelineDate('2026.2.30').from, undefined);
  assert.equal(parseTimelineDate('2026年1月上旬').from, undefined);
  assert.equal(parseTimelineDate('1.16\nhttps://x.edu/2025/12/31').from, '2026-01-16');
});

test('V3 时间线重复表头不串列、完整起止与来源、推测不得生成需求', () => {
  const tl = parseTimeline(sheets(), '2026-10-16 14:00');
  assert.equal(tl.agenda.find(e => e.school === '昆士兰大学 UQ' && e.type === 'Final').from, '2026-11-07');
  assert.ok(tl.agenda.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.from) && /^\d{4}-\d{2}-\d{2}$/.test(e.to) && e.src.includes('!')));
  assert.ok(tl.anomalies.some(a => a.issue.includes('列标题缺失')));
  assert.ok(tl.anomalies.some(a => a.a === '2026.5.11-2025.6.12'));
  const needs = deriveNeeds(tl, '2026-11');
  assert.ok(needs.some(n => n.need.seg === '澳洲 · 本科'));
  assert.ok(!needs.some(n => n.need.seg === '香港 · 本科'));
  assert.ok(deriveNeeds(tl, '2026-10').some(n => n.need.seg === '澳洲 · 本科' && n.need.node === 'Final'), '提前14天跨月');
  assert.deepEqual(deriveNeeds(tl, '2026-11').map(n => n.need.id), needs.map(n => n.need.id));
});

test('V3 CSV 多行/引号保留真实行号，截断/少列不当成功', () => {
  const data = { annotated_csv: '[row=4] "校,名","11.2-11.3\n备注"\n[row=5] 学校,"说""明"\n', col_indices: ['A','B'], row_indices: [4,5], has_more: false };
  const rows = parseAnnotatedCsv(data);
  assert.deepEqual(rows, [{row:4,values:['校,名','11.2-11.3\n备注']},{row:5,values:['学校','说"明']}]);
  assert.throws(() => parseAnnotatedCsv({ ...data, has_more: true }));
  assert.throws(() => parseAnnotatedCsv({ ...data, row_indices: [4,6] }));
  assert.throws(() => parseAnnotatedCsv({ ...data, col_indices: ['A'] }));
});

test('V3 Codex 四阶段严格取 action；撤回、空时间、进展、已读', () => {
  const source = resetSource();
  source.activities.push(signal('2','announce','2026-10-14T14:00:00+08:00'), signal('3','amend','2026-10-15T16:00:00+08:00'), signal('4','withdraw','2026-10-15T18:00:00+08:00'), signal('5',null,'2026-10-16T12:00:00+08:00'));
  let c = codexResetView(source);
  assert.equal(c.stage, '撤回'); assert.equal(c.next, null); assert.equal(c.pushed, false); assert.equal(c.checked, '2026-10-16 12:30');
  assert.deepEqual(c.history.map(h => h.stage), ['修正','确认','预告']);
  assert.equal(codexResetView(source, { seen: new Set(['1','2','3','4']) }).isNew, false);
  source.events = [{ status:'announced', schedule:{from:'2026-10-18T08:00:00+08:00',through:'2026-10-18T09:00:00+08:00',label:'官方预告窗口'} }];
  c = codexResetView(source, { now: Date.parse('2026-10-16T14:00:00+08:00') }); assert.equal(c.next, '2026-10-18T09:00:00+08:00');
});

test('V3 Codex 合并并发、ETag 304、失败不伪装成功或推进水位', async () => {
  let now = 0, calls = 0, mode = 'ok', headers;
  const read = createCodexResetReader({ now: () => now, fetcher: async (url, init) => { calls++; headers = init.headers; if (mode === 'fail') throw new Error('network'); return mode === '304' ? new Response(null, { status:304 }) : Response.json(resetSource(), { headers:{etag:'v1'} }); } });
  const [a,b] = await Promise.all([read(),read()]); assert.deepEqual(a,b); assert.equal(calls,1);
  await read(); assert.equal(calls,1);
  now = 600001; mode = '304'; assert.deepEqual(await read(),a); assert.equal(headers['If-None-Match'],'v1');
  now += 600001; mode = 'fail'; await assert.rejects(read(), /最后成功核验/); await assert.rejects(read()); assert.equal(calls,3);
});

test('V3 新 GET 覆盖501且保持形状，后续批次仍501，月份校验', async t => {
  const { request } = await setup(t);
  for (const endpoint of ['/api/v3/timeline','/api/v3/codex-reset','/api/v3/needs?month=2026-11','/api/v3/months/2026-11']) assert.equal((await request('GET',endpoint)).status,200);
  const tl = (await request('GET','/api/v3/timeline')).body;
  assert.deepEqual(Object.keys(tl).sort(), ['source','syncedAt','stage','countries','terms','nodes','table','agenda','anomalies'].sort());
  const month = (await request('GET','/api/v3/months/2026-11')).body;
  assert.equal(month.steps.length,5); assert.equal(month.campaign,null); assert.ok(month.steps.every(s=>s.key!=='plans')); assert.equal(month.steps.find(s=>s.key==='materials').state,'pending');
  for (const value of ['', '2026-00','2026-13','26-11']) assert.equal((await request('GET',`/api/v3/needs?month=${value}`)).status,400);
  assert.equal((await request('GET','/api/v3/months/2026-13')).status,400);
  assert.equal((await request('GET','/api/v3/nas')).status,501);
});

test('V3 同步仅完整成功替换；失败不覆盖快照或返回旧成功', async t => {
  const { request, db, setError } = await setup(t);
  assert.equal((await request('POST','/api/v3/timeline/sync')).status,200);
  const before = db.prepare('SELECT * FROM v3_snapshots').all();
  setError(Object.assign(new Error('一个地区表不可读'), {status:502}));
  assert.equal((await request('POST','/api/v3/timeline/sync')).status,502);
  assert.equal((await request('GET','/api/v3/timeline')).status,502);
  assert.deepEqual(db.prepare('SELECT * FROM v3_snapshots').all(),before);
});

test('V3 采纳先预览后确认，防篡改、持久化回读、重复确认幂等，策略增改', async t => {
  const { request, db } = await setup(t);
  const listing = (await request('GET','/api/v3/needs?month=2026-11')).body, id = listing.needs[0].id;
  const endpoint = `/api/v3/needs/${id}`;
  assert.equal((await request('POST',`${endpoint}/adopt`,{confirm:true})).status,400);
  const preview = (await request('POST',`${endpoint}/preview`,{month:'2026-11'})).body;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM v3_needs').get().n,0);
  assert.equal((await request('POST',`${endpoint}/adopt`,{previewId:preview.previewId,confirm:false})).status,400);
  const body = {previewId:preview.previewId,confirm:true,strategy:{goal:'篡改'}};
  const saved = await request('POST',`${endpoint}/adopt`,body); assert.equal(saved.status,200); assert.equal(saved.body.strategy.goal,preview.need.strategy.goal); assert.ok(saved.body.strategy.goal.length > 0);
  assert.deepEqual((await request('POST',`${endpoint}/adopt`,body)).body,saved.body);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM v3_needs').get().n,1);
  const strategy = {goal:'安排考试冲刺',actions:{营销:[['通知考试日程','方便倒排复习']],产品:[],运营:[]}};
  const p2 = (await request('POST',`${endpoint}/preview`,{month:'2026-11',strategy})).body;
  assert.equal((await request('PATCH',`${endpoint}/strategy`,{previewId:p2.previewId,confirm:true})).status,200);
  assert.deepEqual((await request('GET','/api/v3/needs?month=2026-11')).body.needs.find(n=>n.id===id).strategy,strategy);
  assert.equal((await request('POST',`${endpoint}/preview`,{month:'2026-11',strategy:{goal:'x',actions:{营销:[['no why']],产品:[],运营:[]}}})).status,400);
});

test('V3 来源变化、并发旧预览、过期凭据均拒绝；已采纳来源消失显示待复核', async t => {
  const { request, setData, advance } = await setup(t);
  const id = (await request('GET','/api/v3/needs?month=2026-11')).body.needs.find(n=>n.seg.startsWith('澳洲')).id;
  const endpoint = `/api/v3/needs/${id}`;
  const preview = async () => (await request('POST',`${endpoint}/preview`,{month:'2026-11'})).body;
  const confirm = p => request('POST',`${endpoint}/adopt`,{previewId:p.previewId,confirm:true});
  const p = await preview(), changed = sheets(); changed[2].rows[1].values[2]='11.8-11.21'; setData(changed);
  assert.equal((await confirm(p)).status,409);
  const p1 = await preview(), p2 = await preview(); assert.equal((await confirm(p1)).status,200); assert.equal((await confirm(p2)).status,409);
  const p3 = await preview(); advance(600001); assert.equal((await confirm(p3)).status,409);
  changed[2].rows[1].values[2]='未公开'; setData(changed);
  await request('POST','/api/v3/timeline/sync');
  assert.equal((await request('GET','/api/v3/needs?month=2026-11')).body.needs.find(n=>n.id===id).status,'待复核');
});

test('V3 数据库写入故障回滚，不污染其他需求', async t => {
  const { request, db } = await setup(t);
  const id = (await request('GET','/api/v3/needs?month=2026-11')).body.needs[0].id;
  const p = (await request('POST',`/api/v3/needs/${id}/preview`,{month:'2026-11'})).body;
  db.exec("CREATE TRIGGER fail_needs BEFORE INSERT ON v3_needs BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.equal((await request('POST',`/api/v3/needs/${id}/adopt`,{previewId:p.previewId,confirm:true})).status,500);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM v3_needs').get().n,0);
});

test('V3 飞书读取固定 codex user、四张地区表和完整范围，不导入月历', async () => {
  const calls = [], info = {title:'2026海外大学时间线',revision:8,sheets:REGION_SHEETS.map((name,i)=>({sheet_name:name,sheet_id:`s${i}`,resource_type:'sheet',is_hidden:false,row_count:2,column_count:2}))};
  const run = async (command,args,options) => {
    calls.push(args); assert.equal(command,'lark-cli'); assert.equal(options.shell,false); assert.equal(args[1],'codex'); assert.equal(args[5],'user');
    return {stdout:JSON.stringify({ok:true,identity:'user',data:args[3]==='+workbook-info'?info:{actual_range:'A1:B2',revision:8,row_count:2,col_count:2,col_indices:['A','B'],row_indices:[1,2],has_more:false,annotated_csv:'[row=1] 澳洲,Final\n[row=2] 学校,11.1\n'}})};
  };
  assert.equal((await readTimelineSheets({run})).length,4); assert.equal(calls.length,6);
  assert.equal(calls.filter(a=>a[3]==='+csv-get').length,4);
  await assert.rejects(readTimelineSheets({run:async()=>({stdout:JSON.stringify({ok:true,identity:'bot',data:info})})}));
  await assert.rejects(readTimelineSheets({run:async(c,a,o)=>{ const r=await run(c,a,o); const j=JSON.parse(r.stdout); if(a[3]==='+csv-get')j.data.has_more=true;return{stdout:JSON.stringify(j)}; }}));
});

test('V3 Codex 合法空水位/译文、过期预告/推断时间、429退避', async () => {
  const s=resetSource(); s.checkedAt=null; s.activities[0].text=null;
  const now=Date.parse('2026-10-16T14:00:00+08:00');
  assert.equal(codexResetView(s,{now}).quoteZh,'');
  assert.equal(codexResetView(s,{now}).checked,'尚无完整核验时间');
  s.events=[{status:'announced',schedule:{from:'2026-10-15T12:00:00+08:00',through:'2026-10-15T13:00:00+08:00'}},{status:'announced',schedule:{from:'2026-10-18T12:00:00+08:00',through:'2026-10-18T13:00:00+08:00'}}];
  assert.equal(codexResetView(s,{now}).next,'2026-10-18T13:00:00+08:00');
  s.events[1].presentation={timeInferred:true}; assert.equal(codexResetView(s,{now}).next,null);
  let instant=now,calls=0;
  const read=createCodexResetReader({now:()=>instant,fetcher:async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}});}});
  await assert.rejects(read()); instant+=61000; await assert.rejects(read()); assert.equal(calls,1);
  instant+=60000; await assert.rejects(read()); assert.equal(calls,2);
});

test('V3 括号内研究生限定不成为本科确定日期；并发确认保持幂等', async t => {
  assert.equal(parseTimelineDate('7.10（夏季学期研究生）').flag,'guess');
  const {request,db}=await setup(t);
  const id=(await request('GET','/api/v3/needs?month=2026-11')).body.needs[0].id;
  const endpoint=`/api/v3/needs/${id}`;
  const p=(await request('POST',`${endpoint}/preview`,{month:'2026-11'})).body;
  const body={previewId:p.previewId,confirm:true};
  const results=await Promise.all([request('POST',`${endpoint}/adopt`,body),request('POST',`${endpoint}/adopt`,body)]);
  assert.deepEqual(results[0],results[1]); assert.equal(results[0].status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM v3_needs').get().n,1);
  const edited={goal:'新目标',actions:{营销:[],产品:[],运营:[]}};
  const p2=(await request('POST',`${endpoint}/preview`,{month:'2026-11',strategy:edited})).body;
  await request('PATCH',`${endpoint}/strategy`,{previewId:p2.previewId,confirm:true});
  assert.deepEqual(await request('POST',`${endpoint}/adopt`,body),results[0]);
  assert.equal((await request('GET','/api/v3/needs?month=2026-11')).body.needs.find(n=>n.id===id).strategy.goal,'新目标');
});

test('V3 同一显式学期冲突双向标记，不误伤不同学期', () => {
  const source=[makeSheet('香港 澳门 新加坡 马来西亚',[
    ['新加坡','Semester 1开学时间','Semester 1学期开学','Semester 2开学'],
    ['新加坡理工大学SIT','2026.5.4','2026.8.31','2026.1.5'],
  ])];
  const tl=parseTimeline(source,'2026-10-16 14:00');
  assert.ok(tl.agenda.filter(e=>e.src.endsWith('B2')||e.src.endsWith('C2')).every(e=>e.flag==='conflict'));
  assert.equal(tl.agenda.find(e=>e.src.endsWith('D2')).flag,undefined);
  assert.ok(tl.anomalies.some(a=>a.src.includes('B2 /')&&a.src.endsWith('C2')));
});
