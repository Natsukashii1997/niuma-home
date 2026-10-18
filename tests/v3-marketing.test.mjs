import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, saveSetting, savePromo } from '../server/db.mjs';
import { match, json } from '../server/http.mjs';
import { routes } from '../server/routes/v3-marketing.mjs';
import { getRecord, putRecord, fingerprint } from '../server/local-records.mjs';
import { campaignTemplate, createCampaignService, readMarketingTable, CAMPAIGN_FIELDS, MARKETING_BASE } from '../server/campaigns.mjs';
import { acceptedMarketingNeeds } from '../server/price.mjs';
import { deriveNeeds } from '../server/needs.mjs';
import { saveSnapshot } from '../server/v3-common.mjs';
import { TIMELINE_SOURCE, REGION_SHEETS, createTimelineReader } from '../server/timeline.mjs';
import { recordSource } from '../server/source-status.mjs';

const templateRows = () => [
  { id: 'a', 模板序号: 10, 任务事项: '立项', 节点类型: ['普通任务'], 环节阶段: ['启动阶段'], 父记录: null },
  { id: 'b', 模板序号: 20, 任务事项: '制定方案', 节点类型: ['普通任务'], 环节阶段: ['计划阶段'], 父记录: null },
  { id: 'c', 模板序号: 30, 任务事项: '调研子项', 节点类型: ['普通任务'], 环节阶段: ['计划阶段'], 父记录: [{ id: 'b' }] },
  { id: 'd', 模板序号: 40, 任务事项: '定稿', 节点类型: ['里程碑', '审核门禁'], 环节阶段: ['监控阶段'], 父记录: [{ id: 'b' }] },
];
const catalogRows = () => [
  { id: 'lite', SKU名称: '灵活学Lite', 业务线: ['大学辅导', '国际课程'], 产品类别: '1V1辅导', SKU状态: ['使用中'] },
  { id: 'max', SKU名称: '安心学Max', 业务线: ['大学辅导', '国际课程'], 产品类别: '稳分保障', SKU状态: ['使用中'] },
  { id: 'class', SKU名称: '先修班课', 业务线: ['大学辅导'], 产品类别: '班课', SKU状态: ['使用中'] },
];
const normal = () => ({ unitOrig: 990, tiers: [5, 10], schemes: [{ id: 'verified', name: '已核对价格', kind: '常规', status: '生效中', from: '2026-11-01', to: '', prices: [6000, 10000], gifts: [0, 0] }] });

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '营销测试必须指定隔离数据目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'marketing-')), db = openDb(dir);
  let instant = Date.parse('2026-10-16T12:00:00+08:00'), campaignReads = 0, priceReads = 0, sourceFailure = false;
  const options = {
    price: { now: () => instant, readSource: async () => { priceReads++; if (sourceFailure) throw new Error('source unavailable'); return { rows: catalogRows(), rev: 5 }; } },
    campaign: { now: () => instant, readSource: async () => { campaignReads++; if (sourceFailure) throw new Error('source unavailable'); return { rows: templateRows(), rev: 143 }; } },
    briefs: { now: () => instant },
  };
  const all = routes(db, options);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), found = match(all, req.method, url.pathname);
    if (!found) return json(res, 404, { error: '接口不存在' });
    await found.handler(req, res, { params: found.params, url });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, endpoint, body) => {
    const result = await fetch(base + endpoint, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: result.status, body: await result.json(), origin: result.headers.get('x-workdesk-data-origin') };
  };
  return { db, request, options, advance: n => instant += n, counts: () => ({ campaignReads, priceReads }), failSource: () => sourceFailure = true };
}
function adopted(db, { id = 'need1', month = '2026-11', status = '已采纳', goal = '安排考前复习' } = {}) {
  const value = { id, seg: '澳洲 · 本科', node: 'Final', need: '期末冲刺', pain: '连考压力', todo: '整理考试日程', status, strategy: { goal, actions: { 营销: [], 产品: [], 运营: [] } } };
  const source = { id: `message-${id}`, month, need: { ...value, status: '草稿' } };
  putRecord(db, 'selftalk-need', source.id, source);
  db.prepare('INSERT OR REPLACE INTO v3_needs(id,month,source_fingerprint,payload,updated_at) VALUES(?,?,?,?,?)').run(id, month, fingerprint(source), JSON.stringify(value), new Date().toISOString());
  return value;
}

test('营销真实模板拆多值、保留普通子项并提升门禁，不生成运行时间或完成状态', async t => {
  const { request, db, options, counts, failSource } = await setup(t);
  const first = await request('GET', '/api/v3/campaigns/current');
  assert.equal(first.status, 200); assert.equal(first.body.start, ''); assert.equal(first.body.end, ''); assert.deepEqual(first.body.months, []);
  const nodes = first.body.phases.flatMap(p => p.nodes), gate = nodes.find(n => n.n === 40);
  assert.equal(gate.gate, true); assert.equal(gate.milestone, true);
  assert.deepEqual(nodes.find(n => n.n === 20).kids, [['调研子项', false]]);
  assert.ok(nodes.every(n => n.done === false && n.due === '' && n.owner === ''));
  assert.equal(getRecord(db, 'campaign', 'current'), null);
  failSource(); assert.deepEqual(await createCampaignService(db, options.campaign).current(), first.body); assert.equal(counts().campaignReads, 1);
  const multi = templateRows(); multi[3].节点类型 = ['里程碑、审核门禁']; multi[3].环节阶段 = ['监控阶段,实施阶段'];
  assert.equal(campaignTemplate(multi).filter(p => p.nodes.some(n => n.n === 40)).length, 2);
  const cycle = templateRows(); cycle[1].父记录 = [{ id: 'c' }]; assert.throws(() => campaignTemplate(cycle), /循环/);
});

test('价格记录固定4张表：两张Lite为演示矩阵，安心学Max与竞赛课时卡为空表；不读飞书、不写业务记录', async t => {
  const { request, db, counts } = await setup(t);
  const list = await request('GET', '/api/v3/price/skus');
  assert.equal(list.status, 200); assert.equal(list.origin, 'demo');
  assert.deepEqual(list.body.map(s => [s.id, s.line, s.name, s.label, s.origin]), [
    ['uni-lite', '大学辅导', '灵活学Lite', '灵活学Lite', 'demo'], ['uni-max', '大学辅导', '安心学Max', '安心学Max', 'empty'],
    ['intl-lite', '国际课程', '灵活学Lite', '课时卡', 'demo'], ['intl-comp', '国际课程', '竞赛课时卡', '竞赛课时卡', 'empty'],
  ]);
  assert.ok(list.body.every(s => JSON.stringify(s.tiers) === '[5,10,20,30,50,100,150,200]'));
  for (const sku of list.body.filter(s => s.origin === 'demo')) {
    assert.equal(sku.unitOrig, 990);
    const matrix = await request('GET', `/api/v3/price/schemes?sku=${sku.id}`);
    assert.equal(matrix.status, 200); assert.equal(matrix.origin, 'demo'); assert.equal(matrix.body.origin, 'demo'); assert.equal(matrix.body.sku, sku.id);
    assert.equal(matrix.body.floorMargin, .25); assert.equal(matrix.body.costPerHour, 440);
  }
  for (const sku of list.body.filter(s => s.origin === 'empty')) {
    assert.equal(sku.unitOrig, null);
    const matrix = await request('GET', `/api/v3/price/schemes?sku=${sku.id}`);
    assert.equal(matrix.status, 200); assert.equal(matrix.origin, null); assert.deepEqual(matrix.body.schemes, []); assert.equal(matrix.body.origin, 'empty');
  }
  assert.equal(counts().priceReads, 0);
  assert.equal(db.prepare("SELECT count(*) AS n FROM v3_documents WHERE kind='price-schemes'").get().n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM v3_needs').get().n, 0);
  assert.equal((await request('GET', '/api/v3/price/schemes')).status, 400);
  assert.equal((await request('GET', '/api/v3/price/schemes?sku=unknown')).status, 404);
  saveSetting(db, 'price_cost_per_hour', 'bad');
  const invalid = await request('GET', '/api/v3/price/schemes?sku=uni-lite'); assert.equal(invalid.status, 503); assert.equal(invalid.body.code, 'PRICE_SETTINGS_UNCONFIGURED');
});

test('空表填满后才能保存：缺格子指出方案和档数，保存后回读为本地记录', async t => {
  const { request, db } = await setup(t), previewPath = '/api/v3/price/schemes/preview?sku=uni-max';
  saveSetting(db, 'price_floor_margin', '.25'); saveSetting(db, 'price_cost_per_hour', '440');
  const value = normal(); value.schemes[0].prices = [6000, null];
  const blank = await request('POST', previewPath, value); assert.equal(blank.status, 400); assert.match(blank.body.error, /「已核对价格」还有 1 档总价没填/);
  const noOrig = normal(); noOrig.unitOrig = null; assert.match((await request('POST', previewPath, noOrig)).body.error, /原价/);
  assert.equal((await request('POST', previewPath, { ...normal(), schemes: [] })).status, 400);
  const p = await request('POST', previewPath, normal()); assert.equal(p.status, 200); assert.equal(getRecord(db, 'price-schemes', 'uni-max'), null);
  assert.equal((await request('PUT', '/api/v3/price/schemes?sku=uni-max', { previewId: p.body.previewId, confirm: true })).status, 200);
  const back = await request('GET', '/api/v3/price/schemes?sku=uni-max'); assert.equal(back.body.origin, 'local'); assert.deepEqual(back.body.schemes, normal().schemes);
  const sku = (await request('GET', '/api/v3/price/skus')).body.find(s => s.id === 'uni-max');
  assert.deepEqual([sku.origin, sku.unitOrig, sku.tiers], ['local', 990, [5, 10]]);
});

test('价格先预览后确认、破底线包含赠课成本、完整档位校验和已采纳需求关联', async t => {
  const { request, db } = await setup(t), endpoint = '/api/v3/price/schemes?sku=uni-lite', previewPath = '/api/v3/price/schemes/preview?sku=uni-lite';
  saveSetting(db, 'price_floor_margin', '.25'); saveSetting(db, 'price_cost_per_hour', '440');
  assert.equal((await request('PUT', endpoint, { confirm: true })).status, 400);
  const low = normal(); low.schemes[0].prices = [3000, 5000]; low.schemes[0].gifts = [5, 10];
  assert.match((await request('POST', previewPath, low)).body.error, /破底线原因/);
  low.schemes[0].breachReason = '已核对专项补贴'; assert.equal((await request('POST', previewPath, low)).status, 200);
  const incomplete = normal(); incomplete.schemes[0].prices.pop(); assert.equal((await request('POST', previewPath, incomplete)).status, 400);
  const badDate = normal(); badDate.schemes[0].from = '2026-02-30'; assert.equal((await request('POST', previewPath, badDate)).status, 400);
  const activity = normal(); activity.schemes[0].kind = '活动'; assert.equal((await request('POST', previewPath, activity)).status, 400);
  activity.schemes[0].needId = 'need1'; adopted(db, { status: '草稿' }); assert.equal((await request('POST', previewPath, activity)).status, 400);
  adopted(db); const p = await request('POST', previewPath, activity); assert.equal(p.status, 200); assert.equal(p.body.value.schemes[0].need, '澳洲 · 本科 · Final');
  assert.equal(getRecord(db, 'price-schemes', 'uni-lite'), null);
  const receipt = await request('PUT', endpoint, { previewId: p.body.previewId, confirm: true, schemes: [{ name: '篡改' }] });
  assert.equal(receipt.status, 200); assert.equal(receipt.body.schemes[0].name, '已核对价格');
  assert.deepEqual((await request('PUT', endpoint, { previewId: p.body.previewId, confirm: true })).body, receipt.body);
  const live = await request('GET', endpoint); assert.equal(live.body.origin, 'local'); assert.equal(live.body.schemes[0].needId, 'need1');
});

test('价格确认重新检查成本、需求状态和预览过期；数据库失败回滚', async t => {
  const { request, db, advance } = await setup(t), previewPath = '/api/v3/price/schemes/preview?sku=uni-lite';
  const preview = async value => (await request('POST', previewPath, value)).body;
  const confirm = p => request('PUT', '/api/v3/price/schemes?sku=uni-lite', { previewId: p.previewId, confirm: true });
  const p = await preview(normal()); saveSetting(db, 'price_cost_per_hour', '450'); assert.equal((await confirm(p)).status, 409);
  const expired = await preview(normal()); advance(600001); assert.equal((await confirm(expired)).status, 409);
  adopted(db); const value = normal(); value.schemes[0].kind = '活动'; value.schemes[0].needId = 'need1';
  const linked = await preview(value); adopted(db, { status: '待复核' }); assert.equal((await confirm(linked)).status, 400);
  const failed = await preview(normal());
  db.exec("CREATE TRIGGER reject_price BEFORE INSERT ON v3_documents WHEN NEW.kind='price-schemes' BEGIN SELECT RAISE(ABORT,'test fault'); END;");
  assert.equal((await confirm(failed)).status, 500); assert.equal(getRecord(db, 'price-schemes', 'uni-lite'), null);
});

test('模板实例只在本地预览确认后生成，物料决定持久化，门禁不可被状态编辑抹去', async t => {
  const { request, db } = await setup(t);
  const p = await request('POST', '/api/v3/campaigns/current/preview', { name: '已确认战役', start: '2026-10-01', end: '2026-11-30', desc: '已确认的目标', routine: [['价格图', 'campaign'], ['选课海报', 'skip']] });
  assert.equal(p.status, 200); assert.equal(getRecord(db, 'campaign', 'current'), null); assert.deepEqual(p.body.value.months, ['2026-10', '2026-11']);
  const saved = await request('PATCH', '/api/v3/campaigns/current', { previewId: p.body.previewId, confirm: true });
  assert.equal(saved.status, 200); assert.equal(saved.body.name, '已确认战役'); assert.deepEqual((await request('GET', '/api/v3/campaigns/current')).body, saved.body);
  const phases = structuredClone(saved.body.phases); phases[0].nodes[0].done = true; phases[0].nodes[0].due = '02-30';
  assert.equal((await request('POST', '/api/v3/campaigns/current/preview', { phases })).status, 400);
  phases[0].nodes[0].due = '10-20'; const edited = await request('POST', '/api/v3/campaigns/current/preview', { phases }); assert.equal(edited.status, 200);
  phases.flatMap(p => p.nodes).find(n => n.gate).gate = false;
  assert.equal((await request('POST', '/api/v3/campaigns/current/preview', { phases })).status, 400);
  assert.equal((await request('POST', '/api/v3/campaigns/current/preview', { routine: [['价格图', 'invented']] })).status, 400);
});

test('战役复盘只在已创建战役上预览确认后保存，节点改动不会冲掉复盘', async t => {
  const { request, db } = await setup(t);
  assert.equal((await request('POST', '/api/v3/campaigns/current/preview', { review: '没有战役时不能写' })).status, 400);
  const created = await request('POST', '/api/v3/campaigns/current/preview', { name: '复盘战役', start: '2026-10-01', end: '2026-11-30', desc: '目标' });
  await request('PATCH', '/api/v3/campaigns/current', { previewId: created.body.previewId, confirm: true });
  const p = await request('POST', '/api/v3/campaigns/current/preview', { review: '报名比预期多两成；海报晚了三天' });
  assert.equal(p.status, 200); assert.equal(getRecord(db, 'campaign', 'current').review, undefined);
  const saved = await request('PATCH', '/api/v3/campaigns/current', { previewId: p.body.previewId, confirm: true });
  assert.equal(saved.body.review, '报名比预期多两成；海报晚了三天');
  assert.deepEqual((await request('GET', '/api/v3/campaigns/current')).body, saved.body);
  const phases = structuredClone(saved.body.phases); phases[0].nodes[0].done = true;
  const edited = await request('POST', '/api/v3/campaigns/current/preview', { phases });
  assert.equal(edited.body.value.review, saved.body.review);
  assert.equal((await request('POST', '/api/v3/campaigns/current/preview', { review: 'x'.repeat(20001) })).status, 400);
  assert.equal((await request('POST', '/api/v3/campaigns/current/preview', { review: 42 })).status, 400);
  // 两个预览基于同一版本：先确认的生效，后一个按记录已变化拒绝
  const a = await request('POST', '/api/v3/campaigns/current/preview', { review: '甲' }), b = await request('POST', '/api/v3/campaigns/current/preview', { review: '乙' });
  assert.equal((await request('PATCH', '/api/v3/campaigns/current', { previewId: a.body.previewId, confirm: true })).status, 200);
  assert.equal((await request('PATCH', '/api/v3/campaigns/current', { previewId: b.body.previewId, confirm: true })).status, 409);
  assert.equal(getRecord(db, 'campaign', 'current').review, '甲');
});

test('brief只带入已采纳需求和正式保存价格；缺价格仍完整返回七节', async t => {
  const { request, db } = await setup(t);
  adopted(db, { id: 'draft', status: '草稿', goal: '不能带入' });
  let result = await request('GET', '/api/v3/briefs/2026-11'); assert.equal(result.status, 200); assert.equal(result.body.background.text, ''); assert.deepEqual(result.body.items, []); assert.equal(Object.keys(result.body.status).length, 7);
  adopted(db); result = await request('GET', '/api/v3/briefs/2026-11'); assert.match(result.body.background.text, /期末冲刺/); assert.deepEqual(result.body.background.goals, ['安排考前复习']);
  putRecord(db, 'price-schemes', 'uni-lite', { sku: 'uni-lite', line: '大学辅导', name: '灵活学Lite', ...normal() });
  result = await request('GET', '/api/v3/briefs/2026-11'); assert.equal(result.body.items.length, 1); assert.match(result.body.items[0].blocks[0][1], /6000元/);
  assert.equal((await request('GET', '/api/v3/briefs/2026-13')).status, 400);
});

test('brief逐字段保护人工编辑，源变更保留已改文字、更新未改目标；预览确认和导出无飞书写入', async t => {
  const { request, db, counts } = await setup(t); adopted(db);
  const p = await request('POST', '/api/v3/briefs/2026-11/preview', { patch: { background: { text: '人工写的背景' }, status: { 1: 'done' } } });
  assert.equal(p.status, 200); assert.equal(getRecord(db, 'brief', '2026-11'), null);
  const firstReceipt = await request('PUT', '/api/v3/briefs/2026-11', { previewId: p.body.previewId, confirm: true }); assert.equal(firstReceipt.status, 200);
  adopted(db, { goal: '重新核对复习时间' });
  const current = await request('GET', '/api/v3/briefs/2026-11'); assert.equal(current.body.background.text, '人工写的背景'); assert.deepEqual(current.body.background.goals, ['重新核对复习时间']); assert.equal(current.body.status[1], 'done');
  const p2 = await request('POST', '/api/v3/briefs/2026-11/preview', { patch: { title: '修改标题' } }); adopted(db, { goal: '再次变化' });
  assert.equal((await request('PUT', '/api/v3/briefs/2026-11', { previewId: p2.body.previewId, confirm: true })).status, 409);
  const exportResult = await request('POST', '/api/v3/briefs/2026-11/export-preview', {});
  assert.equal(exportResult.status, 400); assert.equal(exportResult.body.code, 'EXPORT_TARGET_REQUIRED');
  assert.equal((await request('POST', '/api/v3/briefs/2026-11/export', { confirm: true })).status, 400);
  assert.deepEqual(counts(), { campaignReads: 0, priceReads: 0 });
  assert.equal((await request('POST', '/api/v3/briefs/2026-11/preview', { patch: { items: [{ id: 'bad', kind: 'grid9', title: 'x', cells: ['only1'], refs: [], reuse: null }] } })).status, 400);
  const p3 = await request('POST', '/api/v3/briefs/2026-11/preview', { patch: { title: '第二次编辑' } });
  assert.equal((await request('PUT', '/api/v3/briefs/2026-11', { previewId: p3.body.previewId, confirm: true })).status, 200);
  assert.deepEqual(await request('PUT', '/api/v3/briefs/2026-11', { previewId: p.body.previewId, confirm: true }), firstReceipt);
  assert.equal((await request('GET', '/api/v3/briefs/2026-11')).body.title, '第二次编辑');
});

test('已采纳需求在时间线内容变化后不再成为营销价格或brief的确定事实', async t => {
  const { db } = await setup(t);
  const timeline = { stage: '本科', agenda: [{ c: '澳洲', school: '昆士兰大学 UQ', type: 'Final', from: '2026-11-07', to: '2026-11-21', src: '澳洲!B2' }] };
  const derived = deriveNeeds(timeline, '2026-11')[0];
  db.prepare('INSERT INTO v3_needs(id,month,source_fingerprint,payload,updated_at) VALUES(?,?,?,?,?)').run(derived.need.id, '2026-11', derived.fingerprint, JSON.stringify({ ...derived.need, status: '已采纳' }), new Date().toISOString());
  saveSnapshot(db, 'timeline', timeline, new Date().toISOString()); assert.equal(acceptedMarketingNeeds(db).length, 1);
  timeline.agenda[0].from = '2026-11-08'; saveSnapshot(db, 'timeline', timeline, new Date().toISOString()); assert.equal(acceptedMarketingNeeds(db).length, 0);
});

test('自言自语派生需求按完整来源指纹核对，支持已采纳项且排除变更与删除', async t => {
  const { db, request } = await setup(t);
  saveSnapshot(db, 'timeline', { stage: '本科', agenda: [] }, new Date().toISOString());
  adopted(db, { id: 'selftalk-message1' });
  assert.equal(acceptedMarketingNeeds(db, '2026-11').length, 1);
  assert.match((await request('GET', '/api/v3/briefs/2026-11')).body.background.text, /期末冲刺/);
  const source = getRecord(db, 'selftalk-need', 'message-selftalk-message1'); source.revision = 2;
  putRecord(db, 'selftalk-need', source.id, source);
  assert.equal(acceptedMarketingNeeds(db, '2026-11').length, 0);
  adopted(db, { id: 'selftalk-message1' }); db.prepare("DELETE FROM v3_documents WHERE kind='selftalk-need'").run();
  assert.equal(acceptedMarketingNeeds(db, '2026-11').length, 0);
});

test('时间线来源配置变更不能借旧快照接受需求；已采纳自言自语来源保持独立', async t => {
  const { db } = await setup(t);
  const timeline = { stage: '本科', agenda: [{ c: '澳洲', school: '昆士兰大学 UQ', type: 'Final', from: '2026-11-07', to: '2026-11-21', src: '澳洲!B2' }] };
  const derived = deriveNeeds(timeline, '2026-11')[0];
  db.prepare('INSERT INTO v3_needs(id,month,source_fingerprint,payload,updated_at) VALUES(?,?,?,?,?)').run(derived.need.id, '2026-11', derived.fingerprint, JSON.stringify({ ...derived.need, status: '已采纳' }), new Date().toISOString());
  saveSnapshot(db, 'timeline', timeline, new Date().toISOString());
  recordSource(db, 'timeline', { identity: JSON.stringify(TIMELINE_SOURCE), at: new Date().toISOString() });
  adopted(db, { id: 'selftalk-stable' }); assert.equal(acceptedMarketingNeeds(db).length, 2);
  saveSetting(db, 'timeline_source', JSON.stringify({ ...TIMELINE_SOURCE, token: 'DifferentSource' }));
  assert.deepEqual(acceptedMarketingNeeds(db).map(n => n.id), ['selftalk-stable']);
});

test('A成功快照在B读取失败后不会被冒认成B，配置切回A可继续核验原采纳需求', async t => {
  const { db } = await setup(t);
  const sourceA = { ...TIMELINE_SOURCE, token: 'SourceA' }, sourceB = { ...TIMELINE_SOURCE, token: 'SourceB' };
  const identityA = JSON.stringify(sourceA), identityB = JSON.stringify(sourceB);
  const sourceSheets = REGION_SHEETS.map((name, index) => ({ name, cols: ['A', 'B'], rows: index === 0 ? [{ row: 1, values: ['美西', 'Final时间'] }, { row: 2, values: ['UW', '11.7-11.21'] }] : [] }));
  const reader = createTimelineReader(db, { now: () => Date.parse('2026-10-16T12:00:00+08:00'), readSheets: async ({ source }) => {
    if (source.token === 'SourceB') throw Object.assign(new Error('B读取失败'), { status: 502 });
    return sourceSheets;
  }, onSource: event => recordSource(db, 'timeline', event) });
  saveSetting(db, 'timeline_source', identityA);
  const payload = await reader();
  assert.ok(Array.isArray(payload.agenda)); assert.equal(Object.hasOwn(payload, 'identity'), false); assert.equal(Object.hasOwn(payload, 'value'), false);
  const before = db.prepare("SELECT * FROM v3_snapshots WHERE kind='timeline'").get();
  assert.deepEqual(JSON.parse(before.payload), { identity: identityA, value: payload });
  const derived = deriveNeeds(payload, '2026-11')[0];
  db.prepare('INSERT INTO v3_needs(id,month,source_fingerprint,payload,updated_at) VALUES(?,?,?,?,?)').run(derived.need.id, '2026-11', derived.fingerprint, JSON.stringify({ ...derived.need, status: '已采纳' }), new Date().toISOString());
  assert.equal(acceptedMarketingNeeds(db).length, 1);
  saveSetting(db, 'timeline_source', identityB);
  await assert.rejects(reader(), /B读取失败/);
  assert.equal(db.prepare("SELECT identity FROM v3_source_status WHERE kind='timeline'").get().identity, identityB);
  assert.deepEqual(db.prepare("SELECT * FROM v3_snapshots WHERE kind='timeline'").get(), before);
  assert.equal(acceptedMarketingNeeds(db).length, 0);
  saveSetting(db, 'timeline_source', identityA);
  assert.equal(acceptedMarketingNeeds(db).length, 1, '不以最近B的失败尝试身份覆盖最后成功快照A的身份');
});

test('旧裸时间线快照仅兼容默认来源，不以失败尝试身份给自定义来源背书', async t => {
  const { db } = await setup(t);
  const timeline = { stage: '本科', agenda: [{ c: '澳洲', school: '昆士兰大学 UQ', type: 'Final', from: '2026-11-07', to: '2026-11-21', src: '澳洲!B2' }] };
  const derived = deriveNeeds(timeline, '2026-11')[0];
  db.prepare('INSERT INTO v3_needs(id,month,source_fingerprint,payload,updated_at) VALUES(?,?,?,?,?)').run(derived.need.id, '2026-11', derived.fingerprint, JSON.stringify({ ...derived.need, status: '已采纳' }), new Date().toISOString());
  saveSnapshot(db, 'timeline', timeline, new Date().toISOString());
  assert.equal(acceptedMarketingNeeds(db).length, 1);
  const other = JSON.stringify({ ...TIMELINE_SOURCE, token: 'SourceB' });
  saveSetting(db, 'timeline_source', other); recordSource(db, 'timeline', { identity: other, error: '来源不可读' });
  assert.equal(acceptedMarketingNeeds(db).length, 0);
  saveSetting(db, 'timeline_source', JSON.stringify(TIMELINE_SOURCE));
  assert.equal(acceptedMarketingNeeds(db).length, 1);
});

test('新战役预览绑定来源行指纹，同配置的新同步不允许旧预览确认', async t => {
  const { db, request } = await setup(t);
  const campaign = await request('POST', '/api/v3/campaigns/current/preview', { name: '新战役', start: '2026-10-01', end: '2026-11-30', desc: '目标' });
  const source = getRecord(db, 'marketing-source', 'campaign-template'); source.rows[0].任务事项 = '已改名'; putRecord(db, 'marketing-source', 'campaign-template', source);
  assert.equal((await request('PATCH', '/api/v3/campaigns/current', { previewId: campaign.body.previewId, confirm: true })).status, 409);
});

test('飞书读取使用codex/user，固定字段投影和完整分页，拒绝bot、半页和修订漂移', async () => {
  const source = { token: 'base123', table: 'tblCampaign', url: MARKETING_BASE };
  let calls = 0;
  const run = async (command, args, options) => {
    calls++; assert.equal(command, 'lark-cli'); assert.deepEqual(args.slice(0, 6), ['--profile', 'codex', 'base', '+record-list', '--as', 'user']); assert.equal(options.shell, false);
    return { stdout: JSON.stringify({ ok: true, identity: 'user', data: { fields: CAMPAIGN_FIELDS, data: [[10, '立项', ['普通任务'], ['启动阶段'], null, null, null]], record_id_list: ['r1'], rev: 4, has_more: false } }) };
  };
  const result = await readMarketingTable(source, CAMPAIGN_FIELDS, { run }); assert.equal(result.rows[0].任务事项, '立项'); assert.equal(calls, 1);
  await assert.rejects(readMarketingTable(source, CAMPAIGN_FIELDS, { run: async (...args) => { const raw = await run(...args); const body = JSON.parse(raw.stdout); body.identity = 'bot'; return { stdout: JSON.stringify(body) }; } }), /不完整/);
  await assert.rejects(readMarketingTable(source, CAMPAIGN_FIELDS, { run: async (...args) => { const raw = await run(...args); const body = JSON.parse(raw.stdout); body.data.has_more = true; return { stdout: JSON.stringify(body) }; } }), /分页不完整/);
});
