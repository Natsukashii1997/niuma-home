import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { getRecord, listRecords } from '../server/local-records.mjs';
import { parseTimeline, REGION_SHEETS } from '../server/timeline.mjs';
import { deriveNeeds } from '../server/needs.mjs';
import { applyRulings, createRulingService, RULING_KIND, withRulings } from '../server/timeline-rulings.mjs';
import { createProjectService } from '../server/projects.mjs';
import { createCampaignService } from '../server/campaigns.mjs';

const instant = Date.parse('2026-10-17T10:00:00+08:00');
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '第 2 批测试必须显式使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'batch2-'));
  const db = openDb(dir); t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); }); return db;
}
const sheet = (name, rows) => ({ name, cols: ['A', 'B', 'C', 'D'], rows: rows.map((values, i) => ({ row: i + 1, values })) });
// 合成时间线：Final 标了「预估」（能解析、带推测标记），出分缺结束日期（不能解析）
const sheets = (final = '11.7-11.21（预估）') => [sheet(REGION_SHEETS[2], [['澳洲（semester1/2）', 'Semester 2学期开学', 'Final时间', '出分时间'], ['昆士兰大学UQ', '7.27', final, '2026.12.2-']])];
const finalOf = tl => tl.anomalies.find(a => a.src.endsWith('C2'));
const resultOf = tl => tl.anomalies.find(a => a.src.endsWith('D2'));

test('日期类异常带单元格定位；校名类异常没有', () => {
  const tl = parseTimeline(sheets(), '2026-10-17 10:00');
  assert.deepEqual(finalOf(tl).cell, { code: 'AU', row: 0, c: '澳洲', type: 'Final', header: 'Final时间', cells: [{ src: `${REGION_SHEETS[2]}!C2`, slot: 1, from: '2026-11-07', to: '2026-11-21' }] });
  assert.deepEqual(resultOf(tl).cell.cells, [{ src: `${REGION_SHEETS[2]}!D2`, slot: 2 }]);
  const names = parseTimeline([sheet(REGION_SHEETS[0], [['美西', 'Final时间'], ['ABC', '12.1']])], 'x');
  assert.equal(names.anomalies[0].cell, undefined);
});

test('裁定先预览后确认；采用后这一格参与需求推导，原格一改自动失效', async t => {
  const db = database(t); let data = parseTimeline(sheets(), '2026-10-17 10:00');
  const rulings = createRulingService(db, async () => data, { now: () => instant });
  const needsOf = () => deriveNeeds(withRulings(db, data), '2026-11').map(n => n.need.node);
  assert.deepEqual(needsOf(), [], '推测日期不参与推导');
  const key = withRulings(db, data).anomalies.find(a => a.src.endsWith('C2')).key;
  await assert.rejects(async () => rulings.preview('missing', { decision: 'exclude' }), e => e.status === 404);
  await assert.rejects(async () => rulings.preview(key, { decision: 'guess' }), e => e.status === 400);
  await assert.rejects(async () => rulings.preview(key, { decision: 'adopt', cell: 3 }), e => e.status === 400);
  await assert.rejects(async () => rulings.preview(key, { decision: 'clear' }), e => e.status === 400, '没裁定过不能撤销');
  const p = await rulings.preview(key, { decision: 'adopt', note: '官网校历确认' });
  assert.equal(listRecords(db, RULING_KIND).length, 0, '预览不写入');
  const saved = await rulings.confirm({ previewId: p.previewId, confirm: true });
  assert.deepEqual([saved.decision, saved.from, saved.to, saved.note], ['adopt', '2026-11-07', '2026-11-21', '官网校历确认']);
  const ruled = withRulings(db, data);
  assert.deepEqual(ruled.agenda.find(e => e.src.endsWith('C2')), { from: '2026-11-07', to: '2026-11-21', c: '澳洲', school: '昆士兰大学 UQ', type: 'Final', src: `${REGION_SHEETS[2]}!C2`, ruled: true });
  assert.deepEqual(ruled.table.AU[0].cells[1], ['11-07', '11-21', `${REGION_SHEETS[2]}!C2`, 'ruled']);
  assert.equal(finalOf(ruled).ruling.decision, 'adopt');
  assert.deepEqual(ruled.rulings, { applied: 1, stale: 0 });
  assert.deepEqual(needsOf(), ['Final'], '裁定后参与推导');
  // 飞书原格改了：旧裁定不再生效，回到待确认
  data = parseTimeline(sheets('11.8-11.22（预估）'), '2026-10-17 11:00');
  const changed = withRulings(db, data);
  assert.equal(finalOf(changed).ruling, undefined);
  assert.deepEqual(changed.rulings, { applied: 0, stale: 1 });
  assert.deepEqual(needsOf(), []);
});

test('手填日期补上不能解析的格子；不采用不参与；撤销裁定；同步后旧预览被拒', async t => {
  const db = database(t); let data = parseTimeline(sheets(), '2026-10-17 10:00');
  const rulings = createRulingService(db, async () => data, { now: () => instant });
  const key = applyRulings(data, []).anomalies.find(a => a.src.endsWith('D2')).key;
  await assert.rejects(async () => rulings.preview(key, { decision: 'adopt' }), e => e.status === 400, '没有解析出日期不能直接采用');
  await assert.rejects(async () => rulings.preview(key, { decision: 'manual', from: '2026-12-09', to: '2026-12-02' }), e => e.status === 400);
  await assert.rejects(async () => rulings.preview(key, { decision: 'manual', from: '2026-02-30', to: '2026-03-01' }), e => e.status === 400);
  const manual = await rulings.preview(key, { decision: 'manual', from: '2026-12-02', to: '2026-12-09' });
  await rulings.confirm({ previewId: manual.previewId, confirm: true });
  const ruled = withRulings(db, data);
  assert.equal(ruled.agenda.find(e => e.src.endsWith('D2')).type, '出分');
  assert.deepEqual(ruled.table.AU[0].cells[2], ['12-02', '12-09', `${REGION_SHEETS[2]}!D2`, 'ruled']);
  const exclude = await rulings.preview(key, { decision: 'exclude' });
  await rulings.confirm({ previewId: exclude.previewId, confirm: true });
  assert.equal(withRulings(db, data).agenda.some(e => e.src.endsWith('D2')), false);
  const clear = await rulings.preview(key, { decision: 'clear' });
  await rulings.confirm({ previewId: clear.previewId, confirm: true });
  assert.equal(getRecord(db, RULING_KIND, key), null);
  const late = await rulings.preview(key, { decision: 'exclude' });
  data = parseTimeline(sheets(), '2026-10-17 12:00'); data.anomalies = data.anomalies.filter(a => !a.src.endsWith('D2'));
  await assert.rejects(async () => rulings.confirm({ previewId: late.previewId, confirm: true }), e => e.status === 409);
});

function projectSource() {
  return { projects: [{ id: 'p1', '项目名称': '飞书项目', '状态': ['推进中'] }], people: [{ id: 'u1', '成员名': '人员甲' }], nodes: [
    { id: 'n1', '所属项目': [{ id: 'p1' }], '任务事项': '设计', '节点类型': ['审核门禁'], '环节阶段': ['实施阶段'], '主责任人': [{ id: 'u1' }], '是否完成': true, '截止时间': '2026-11-02T00:00:00' },
    { id: 'n2', '所属项目': [{ id: 'p1' }], '任务事项': '子任务', '父记录': [{ id: 'n1' }], '环节阶段': ['实施阶段'], '是否完成': true, '截止时间': null },
  ] };
}

test('新建本地项目按飞书项目结构生成、全部清空，节点改动照常预览确认', async t => {
  const db = database(t); let reads = 0;
  const projects = createProjectService(db, { readSource: async () => { reads++; return projectSource(); }, now: () => instant });
  await assert.rejects(async () => projects.createPreview({ name: ' ', basedOn: 'p1' }), e => e.status === 400);
  await assert.rejects(async () => projects.createPreview({ name: '新项目', basedOn: 'missing' }), e => e.status === 400);
  await assert.rejects(async () => projects.createPreview({ name: '飞书项目', basedOn: 'p1' }), e => e.status === 400, '不能与已有项目同名');
  const p = await projects.createPreview({ name: '本地项目', basedOn: 'p1' });
  assert.equal((await projects.list()).length, 1, '预览不写入');
  const v = p.value;
  assert.ok(v.id.startsWith('local-')); assert.equal(v.local, true); assert.deepEqual(v.basedOn, { id: 'p1', name: '飞书项目' });
  assert.deepEqual(v.nodes.map(n => [n.t, n.done, n.owner, n.dueDate, n.gate]), [['设计', false, '—', '', true]]);
  assert.deepEqual(v.nodes[0].kids, [['子任务', false]]);
  assert.notEqual(v.nodes[0].id, 'n1');
  const saved = projects.createConfirm({ previewId: p.previewId, confirm: true });
  assert.deepEqual((await projects.list()).find(x => x.id === v.id), saved);
  assert.throws(() => projects.createConfirm({ previewId: 'nope', confirm: true }), e => e.status === 409);
  await assert.rejects(async () => projects.createPreview({ name: '本地项目', basedOn: 'p1' }), e => e.status === 400);
  const edit = await projects.preview(v.id, { nodeId: v.nodes[0].id, done: true, due: '2026-11-20' });
  const after = await projects.confirm(v.id, { previewId: edit.previewId, confirm: true });
  assert.equal(after.nodes[0].done, true); assert.equal(after.nodes[0].dueDate, '2026-11-20');
  assert.equal((await projects.list()).find(x => x.id === v.id).nodes[0].dueDate, '2026-11-20', '刷新后仍在');
  assert.equal((await projects.list()).find(x => x.id === 'p1').nodes[0].done, true, '飞书项目不受影响');
});

const templateRows = () => [
  { id: 'a', 模板序号: 10, 任务事项: '立项', 节点类型: ['普通任务'], 环节阶段: ['启动阶段'], 父记录: null },
  { id: 'd', 模板序号: 40, 任务事项: '定稿', 节点类型: ['审核门禁'], 环节阶段: ['监控阶段'], 父记录: null },
];

test('新开战役：当前战役整条归档为历史，再按模板新开；并发改动被拒', async t => {
  const db = database(t); let clock = instant;
  const campaign = createCampaignService(db, { now: () => clock, readSource: async () => ({ rows: templateRows(), rev: 1 }) });
  assert.throws(() => campaign.archivePreview(), e => e.status === 400, '没有战役不能新开');
  const create = async name => campaign.confirm({ previewId: (await campaign.preview({ name, start: '2026-10-01', end: '2026-11-30', desc: '目标' })).previewId, confirm: true });
  const first = await create('第一场');
  const reviewed = campaign.confirm({ previewId: (await campaign.preview({ review: '做得不错' })).previewId, confirm: true });
  const p = campaign.archivePreview();
  assert.deepEqual(p.value, reviewed);
  assert.ok(getRecord(db, 'campaign', 'current'), '预览不写入');
  const r = campaign.archiveConfirm({ previewId: p.previewId, confirm: true });
  assert.deepEqual(campaign.archiveConfirm({ previewId: p.previewId, confirm: true }), r, '重复确认幂等');
  assert.equal(getRecord(db, 'campaign', 'current'), null);
  assert.equal((await campaign.current()).id, 'template');
  assert.deepEqual(campaign.history().items.map(x => [x.id, x.name, x.review]), [[first.id, '第一场', '做得不错']]);
  const second = await create('第二场');
  assert.notEqual(second.id, first.id);
  const stale = campaign.archivePreview();
  campaign.confirm({ previewId: (await campaign.preview({ review: '改了' })).previewId, confirm: true });
  assert.throws(() => campaign.archiveConfirm({ previewId: stale.previewId, confirm: true }), e => e.status === 409);
  assert.equal(getRecord(db, 'campaign', 'current').name, '第二场', '被拒后当前战役不变');
  const expired = campaign.archivePreview(); clock += 600001;
  assert.throws(() => campaign.archiveConfirm({ previewId: expired.previewId, confirm: true }), e => e.status === 409);
});
