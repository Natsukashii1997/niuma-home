import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { match } from '../server/http.mjs';
import { getRecord, listRecords } from '../server/local-records.mjs';
import { createManualNeeds, MANUAL_NEED_KIND } from '../server/manual-needs.mjs';
import { createNeedsService } from '../server/needs.mjs';
import { acceptedMarketingNeeds } from '../server/price.mjs';
import { userRoutes } from '../server/routes/user.mjs';

const instant = Date.parse('2026-10-17T10:00:00+08:00');
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '手写需求测试必须显式使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'manual-needs-'));
  const db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}
// 时间线里没有事件：列表只剩手写 / Voice 转来的草稿
const emptyTimeline = async () => ({ stage: '本科', agenda: [] });
// 仅为验证契约的合成话题，不是真实采集
const voice = async () => ({ updatedAt: '2026-10-17 09:00', hot: [{ id: 'topic-1', title: '合成话题：选课系统崩溃', summary: '合成摘要' }] });

test('手写需求先预览后确认，以草稿进入需求列表，可以照常采纳', async t => {
  const db = database(t), clock = () => instant;
  const manual = createManualNeeds(db, { now: clock }), needs = createNeedsService(db, emptyTimeline, { now: clock });
  await assert.rejects(async () => manual.preview({ month: '2026-11', need: '   ' }), e => e.status === 400);
  await assert.rejects(async () => manual.preview({ month: '2026-13', need: '选课指导' }), e => e.status === 400);
  await assert.rejects(async () => manual.preview({ month: '2026-11', need: '选课指导', extra: 1 }), e => e.status === 400);
  await assert.rejects(async () => manual.preview({ month: '2026-11', need: 'x'.repeat(501) }), e => e.status === 400);
  const p = await manual.preview({ month: '2026-11', need: '  选课指导 ', pain: '怕选错课' });
  assert.equal(listRecords(db, MANUAL_NEED_KIND).length, 0, '预览不写入');
  assert.deepEqual(p.value.need, { id: `manual-${p.value.id}`, seg: '待确认', node: '手写', when: '2026-11 全月', schools: 0, need: '选课指导', pain: '怕选错课', todo: '', source: '手写 · 2026-10-17 10:00', status: '草稿', links: '' });
  assert.throws(() => manual.confirm({ previewId: p.previewId }), e => e.status === 400);
  const saved = manual.confirm({ previewId: p.previewId, confirm: true });
  assert.deepEqual(saved, p.value);
  assert.deepEqual(manual.confirm({ previewId: p.previewId, confirm: true }), saved, '重复确认幂等');
  const list = await needs.list('2026-11');
  assert.deepEqual(list.needs, [saved.need]);
  assert.deepEqual((await needs.list('2026-12')).needs, [], '只出现在所选月份');
  const adopt = await needs.preview(saved.need.id, { month: '2026-11' });
  await needs.confirm(saved.need.id, { previewId: adopt.previewId, confirm: true });
  assert.equal((await needs.list('2026-11')).needs[0].status, '已采纳');
  assert.deepEqual(acceptedMarketingNeeds(db, '2026-11').map(n => n.id), [saved.need.id], '采纳后可被价格方案关联');
});

test('只能删除没采纳的草稿；删除也先预览，过期或已变化的预览被拒绝', async t => {
  const db = database(t); let clock = instant;
  const manual = createManualNeeds(db, { now: () => clock }), needs = createNeedsService(db, emptyTimeline, { now: () => clock });
  const add = async need => manual.confirm({ previewId: (await manual.preview({ month: '2026-11', need })).previewId, confirm: true });
  const keep = await add('保留'), drop = await add('删除');
  assert.throws(() => manual.removePreview('missing'), e => e.status === 404);
  const removal = manual.removePreview(drop.id);
  assert.ok(getRecord(db, MANUAL_NEED_KIND, drop.id), '删除预览不写入');
  assert.deepEqual(manual.confirm({ previewId: removal.previewId, confirm: true }), { ok: true, id: drop.id });
  assert.equal(getRecord(db, MANUAL_NEED_KIND, drop.id), null);
  assert.deepEqual((await needs.list('2026-11')).needs.map(n => n.need), ['保留']);
  // 删除预览之后又被采纳：确认时拒绝
  const late = manual.removePreview(keep.id);
  const adopt = await needs.preview(keep.need.id, { month: '2026-11' });
  await needs.confirm(keep.need.id, { previewId: adopt.previewId, confirm: true });
  assert.throws(() => manual.confirm({ previewId: late.previewId, confirm: true }), e => e.status === 409);
  assert.throws(() => manual.removePreview(keep.id), e => e.status === 409);
  const stale = await manual.preview({ month: '2026-11', need: '过期' }); clock += 600001;
  assert.throws(() => manual.confirm({ previewId: stale.previewId, confirm: true }), e => e.status === 409);
  assert.throws(() => manual.confirm({ previewId: 'unknown', confirm: true }), e => e.status === 409);
});

test('Voice 话题转草稿：来源由后端按榜单写，同月同话题不重复转', async t => {
  const db = database(t), clock = () => instant;
  const manual = createManualNeeds(db, { voice, now: clock });
  await assert.rejects(async () => manual.preview({ month: '2026-11', need: '选课', voiceId: 'missing' }), e => e.status === 404);
  await assert.rejects(async () => createManualNeeds(db).preview({ month: '2026-11', need: '选课', voiceId: 'topic-1' }), e => e.status === 503);
  const a = await manual.preview({ month: '2026-11', need: '选课系统崩溃后的补选指导', voiceId: 'topic-1' });
  const b = await manual.preview({ month: '2026-11', need: '另一种写法', voiceId: 'topic-1' });
  assert.equal(a.value.origin, 'voice');
  assert.deepEqual(a.value.voice, { id: 'topic-1', title: '合成话题：选课系统崩溃', updatedAt: '2026-10-17 09:00' });
  assert.equal(a.value.need.source, '留学之声 · 合成话题：选课系统崩溃 · 2026-10-17 09:00 榜单');
  assert.equal(a.value.need.node, 'Voice 话题');
  manual.confirm({ previewId: a.previewId, confirm: true });
  assert.throws(() => manual.confirm({ previewId: b.previewId, confirm: true }), e => e.status === 409, '并发的第二个预览在确认时被拒');
  await assert.rejects(async () => manual.preview({ month: '2026-11', need: '再转一次', voiceId: 'topic-1' }), e => e.status === 400 && /已转为/.test(e.message));
  const other = await manual.preview({ month: '2026-12', need: '下个月再跟进', voiceId: 'topic-1' });
  assert.equal(other.value.month, '2026-12', '不同月份可以再转');
});

async function invoke(all, method, endpoint, body) {
  const url = new URL(endpoint, 'http://127.0.0.1'), found = match(all, method, url.pathname); assert.ok(found, endpoint);
  let status, text; const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), res = { setHeader() {}, writeHead(code) { status = code; }, end(value) { text = value; } };
  req.method = method; req.url = endpoint; req.headers = { 'content-type': 'application/json' };
  await found.handler(req, res, { params: found.params, url }); return { status, body: JSON.parse(text) };
}

test('手写需求接口经 HTTP 可用，路径不与 /api/v3/needs/:id 冲突', async t => {
  const db = database(t), clock = () => instant;
  const services = { timeline: emptyTimeline, needs: createNeedsService(db, emptyTimeline, { now: clock }), strategyExports: {}, manualNeeds: createManualNeeds(db, { voice, now: clock }) };
  const all = userRoutes(services);
  assert.deepEqual((await invoke(all, 'GET', '/api/v3/manual-needs')).body, { records: [] });
  const p = await invoke(all, 'POST', '/api/v3/manual-needs/preview', { month: '2026-11', need: '经接口添加' });
  assert.equal(p.status, 200);
  const saved = await invoke(all, 'POST', '/api/v3/manual-needs/confirm', { previewId: p.body.previewId, confirm: true });
  assert.equal(saved.status, 200);
  assert.deepEqual((await invoke(all, 'GET', '/api/v3/manual-needs')).body.records, [saved.body]);
  assert.equal((await invoke(all, 'GET', '/api/v3/needs?month=2026-11')).body.needs[0].need, '经接口添加');
  const removal = await invoke(all, 'POST', `/api/v3/manual-needs/${saved.body.id}/remove-preview`);
  assert.equal(removal.status, 200);
  assert.deepEqual((await invoke(all, 'POST', '/api/v3/manual-needs/confirm', { previewId: removal.body.previewId, confirm: true })).body, { ok: true, id: saved.body.id });
  assert.equal((await invoke(all, 'POST', '/api/v3/manual-needs/confirm', { previewId: 'nope', confirm: true })).status, 409);
});
