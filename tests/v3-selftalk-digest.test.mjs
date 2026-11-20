import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { fingerprint, getRecord, putRecord } from '../server/local-records.mjs';
import { createSelfTalkService, selfTalkWeek, SELF_APP_ID, SELF_USER_ID } from '../server/selftalk.mjs';
import { routes } from '../server/routes/selftalk.mjs';
import { json, match } from '../server/http.mjs';

const instant = Date.parse('2026-10-14T15:00:00+08:00'), week = '2026-W41';
const row = (id = 'om_week', text = '合成测试：本周需要核对进度', createdAt = '2026-10-07T03:00:00.000Z', type = 'text') => ({ id, text, createdAt, type, link: false });
const draft = (evidence, text = 'AI 草稿：整理原文中的待核对事项') => ({ text, generatedAt: new Date(instant).toISOString(), sourceFingerprint: fingerprint(evidence), threadId: 'test-thread', model: 'test-model', effort: 'high' });
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '周汇总测试必须使用隔离数据目录');
  const directory = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'selftalk-digest-'));
  const db = openDb(directory);
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  return db;
}
const saved = db => getRecord(db, 'selftalk-digest', week);

test('周编号使用ISO自然周和北京时间，跨年正确并拒绝不存在的第53周', () => {
  assert.deepEqual(selfTalkWeek(week), { week, start: '2026-10-04T16:00:00.000Z', end: '2026-10-11T16:00:00.000Z' });
  assert.deepEqual(selfTalkWeek('2020-W53'), { week: '2020-W53', start: '2020-12-27T16:00:00.000Z', end: '2021-01-03T16:00:00.000Z' });
  for (const bad of ['2021-W53', '2026-W00', '2026-W54', '2026-W1', '2026-41', '', null]) assert.throws(() => selfTalkWeek(bad), error => error.status === 400);
});

test('GET和同步不生成AI；完整自然周只生成预览，确认后回读，忽略篡改正文', async t => {
  const db = database(t); let calls = 0, reads = 0, evidence;
  const source = [row(), row('om_image', '[图片消息]', '2026-10-08T03:00:00.000Z', 'image')];
  const service = createSelfTalkService(db, { now: () => instant, readMessages: async () => { reads++; return source; }, generate: async input => { calls++; evidence = input.evidence; return draft(input.evidence); } });
  assert.equal((await service.list()).digest, '');
  assert.equal((await service.list({ refresh: true })).digest, '');
  assert.equal(calls, 0);
  const preview = await service.previewDigest({ week });
  assert.equal(calls, 1); assert.equal(saved(db), null); assert.equal((await service.list()).digest, '');
  assert.equal(evidence.source.userId, SELF_USER_ID); assert.equal(evidence.source.profile, 'cli_a96f5f9ac63adcd4');
  assert.deepEqual(evidence.counts, { total: 2, text: 1, nonText: 1 });
  assert.match(preview.value.text, /非文本 1 条/); assert.match(preview.value.text, /附件内容未读取/);
  const readsBefore = reads;
  const result = await service.confirmDigest({ week, previewId: preview.previewId, confirm: true, text: '不得写入的篡改正文' });
  assert.equal(reads, readsBefore + 1); assert.equal(result.threadId, 'test-thread');
  assert.deepEqual(saved(db), result); assert.ok(!result.text.includes('篡改正文'));
  assert.equal((await service.list()).digest, result.text);
  assert.deepEqual(await service.confirmDigest({ week, previewId: preview.previewId, confirm: true }), result);
  assert.equal(calls, 1);
});

test('周一00:00包含，下周一00:00不包含，原文排序稳定且不因周外消息失效', async t => {
  const db = database(t); let evidence, source = [
    row('om_end', '下周内容', '2026-10-11T16:00:00.000Z'),
    row('om_last', '周日最后一秒', '2026-10-11T15:59:59.000Z'),
    row('om_start', '周一第一秒', '2026-10-04T16:00:00.000Z'),
  ];
  const service = createSelfTalkService(db, { now: () => instant, readMessages: async () => source, generate: async input => { evidence = input.evidence; return draft(evidence); } });
  const p = await service.previewDigest({ week });
  assert.deepEqual(evidence.messages.map(message => message.id), ['om_start', 'om_last']);
  const result = await service.confirmDigest({ week, previewId: p.previewId, confirm: true });
  source = source.map(message => message.id === 'om_end' ? { ...message, text: '下周消息编辑' } : message).reverse();
  assert.equal((await service.list({ refresh: true })).digest, result.text);
});

test('最近十天未覆盖整周、未结束周、无文本周拒绝生成，不扩读或调用模型', async t => {
  const db = database(t); let calls = 0;
  const cases = [
    { clock: Date.parse('2026-10-16T15:00:00+08:00'), target: week, source: [row()], message: /没有完整覆盖/ },
    { clock: instant, target: '2026-W42', source: [row()], message: /尚未结束/ },
    { clock: instant, target: week, source: [], message: /没有可汇总的文本/ },
    { clock: instant, target: week, source: [row('om_audio', '[语音消息]', '2026-10-07T03:00:00.000Z', 'audio')], message: /没有可汇总的文本/ },
  ];
  for (const scenario of cases) {
    const service = createSelfTalkService(db, { now: () => scenario.clock, readMessages: async () => scenario.source, generate: async () => { calls++; throw new Error('不应调用'); } });
    await assert.rejects(service.previewDigest({ week: scenario.target }), scenario.message);
  }
  assert.equal(calls, 0); assert.equal(saved(db), null);
});

test('不完整分页或身份未知时不以旧快照生成，原始错误不泄露', async t => {
  const db = database(t); let calls = 0, ok = true;
  const service = createSelfTalkService(db, { now: () => instant, readMessages: async () => { if (ok) return [row()]; throw new Error('private text must not escape'); }, generate: async () => { calls++; } });
  await service.list(); ok = false;
  await assert.rejects(service.previewDigest({ week }), error => error.status === 502 && !error.message.includes('private text'));
  const cli = createSelfTalkService(db, { now: () => instant, generate: async () => { calls++; }, run: async (_exe, args) => ({ stdout: JSON.stringify(args[4] === 'whoami' ? { profile: 'cli_a96f5f9ac63adcd4', appId: SELF_APP_ID, identity: 'user', onBehalfOf: { openId: SELF_USER_ID } } : { ok: true, identity: 'user', data: { messages: [], has_more: true } }) }) });
  await assert.rejects(cli.previewDigest({ week }), error => error.status === 502);
  assert.equal(calls, 0); assert.equal(saved(db), null);
});

test('超出完整来源上限明确413，不静默截断或调用AI', async t => {
  const db = database(t); let calls = 0;
  const service = createSelfTalkService(db, { now: () => instant, readMessages: async () => [row('om_long', '字'.repeat(120001))], generate: async () => { calls++; } });
  await assert.rejects(service.previewDigest({ week }), error => error.status === 413 && /未截断/.test(error.message));
  assert.equal(calls, 0); assert.equal(saved(db), null);
});

test('生成错误、空草稿或来源指纹不匹配均不保存，不自动重试', async t => {
  const db = database(t);
  for (const mode of ['error', 'empty', 'mismatch', 'too-long']) {
    let calls = 0;
    const service = createSelfTalkService(db, { now: () => instant, readMessages: async () => [row()], generate: async ({ evidence }) => {
      calls++;
      if (mode === 'error') throw new Error('private model output');
      return { ...draft(evidence, mode === 'empty' ? '' : mode === 'too-long' ? '字'.repeat(20001) : 'AI 草稿'), ...(mode === 'mismatch' ? { sourceFingerprint: 'other' } : {}) };
    } });
    await assert.rejects(service.previewDigest({ week }), error => error.status === 502 && !error.message.includes('private model'));
    assert.equal(calls, 1); assert.equal(saved(db), null);
  }
});

test('生成期间来源编辑或周汇总被另一个确认修改，拒绝提供过期预览', async t => {
  const db = database(t); let source = [row()];
  const changed = createSelfTalkService(db, { now: () => instant, readMessages: async () => source, generate: async ({ evidence }) => { source = [row('om_week', '已编辑')]; return draft(evidence); } });
  await assert.rejects(changed.previewDigest({ week }), error => error.status === 409 && /来源已变化/.test(error.message));
  assert.equal(saved(db), null);
  const confirmed = createSelfTalkService(db, { now: () => instant, readMessages: async () => [row()], generate: async ({ evidence }) => { putRecord(db, 'selftalk-digest', week, { text: '另一个已确认版本' }, instant); return draft(evidence); } });
  await assert.rejects(confirmed.previewDigest({ week }), error => error.status === 409 && /已确认汇总发生变化/.test(error.message));
  assert.equal(saved(db).text, '另一个已确认版本');
});

test('确认强制完整回读，来源编辑、撤回或读取失败后不能保存', async t => {
  const db = database(t); let source = [row()], fail = false;
  const service = createSelfTalkService(db, { now: () => instant, readMessages: async () => { if (fail) throw new Error('source unavailable'); return source; }, generate: async ({ evidence }) => draft(evidence) });
  const p = await service.previewDigest({ week });
  source = [row('om_week', '编辑后正文')];
  await assert.rejects(service.confirmDigest({ week, previewId: p.previewId, confirm: true }), error => error.status === 409);
  source = []; await assert.rejects(service.confirmDigest({ week, previewId: p.previewId, confirm: true }), error => error.status === 409);
  source = [row()]; fail = true;
  await assert.rejects(service.confirmDigest({ week, previewId: p.previewId, confirm: true }), error => error.status === 502);
  assert.equal(saved(db), null);
});

test('旧摘要与来源不匹配时GET返回空，恢复服务后只用已确认的匹配记录', async t => {
  const db = database(t); let source = [row()], calls = 0;
  const options = { now: () => instant, readMessages: async () => source, generate: async ({ evidence }) => { calls++; return draft(evidence); } };
  const first = createSelfTalkService(db, options), p = await first.previewDigest({ week });
  const confirmed = await first.confirmDigest({ week, previewId: p.previewId, confirm: true });
  const restarted = createSelfTalkService(db, options);
  assert.equal((await restarted.list()).digest, confirmed.text);
  source = [row('om_week', '变更的事实')];
  assert.equal((await restarted.list({ refresh: true })).digest, '');
  assert.equal(saved(db).text, confirmed.text, '保留历史确认记录但不当作有效摘要展示');
  assert.equal(calls, 1);
});

test('预览绑定周与令牌，未明确确认、过期和服务重启均不能写入', async t => {
  const db = database(t); let clock = instant;
  const options = { now: () => clock, readMessages: async () => [row()], generate: async ({ evidence }) => draft(evidence) };
  const service = createSelfTalkService(db, options), p = await service.previewDigest({ week });
  await assert.rejects(service.confirmDigest({ week, previewId: p.previewId }), error => error.status === 400);
  await assert.rejects(service.confirmDigest({ week: '2026-W40', previewId: p.previewId, confirm: true }), error => error.status === 409);
  await assert.rejects(createSelfTalkService(db, options).confirmDigest({ week, previewId: p.previewId, confirm: true }), error => error.status === 409);
  clock += 600001;
  await assert.rejects(service.confirmDigest({ week, previewId: p.previewId, confirm: true }), error => error.status === 409);
  assert.equal(saved(db), null);
});

test('同一周并发生成只允许一次，避免重复模型调用', async t => {
  const db = database(t); let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  let calls = 0;
  const service = createSelfTalkService(db, { now: () => instant, readMessages: async () => [row()], generate: async ({ evidence }) => { calls++; entered(); await new Promise(resolve => { release = resolve; }); return draft(evidence); } });
  const first = service.previewDigest({ week }); await started;
  await assert.rejects(service.previewDigest({ week }), error => error.status === 409);
  release(); await first;
  assert.equal(calls, 1); assert.equal(saved(db), null);
});

test('已成功确认的同令牌重试固定返回原回执，来源后来失败不再回读或重写', async t => {
  const db = database(t); let failed = false, reads = 0;
  const service = createSelfTalkService(db, { now: () => instant, readMessages: async () => { reads++; if (failed) throw new Error('source unavailable after confirmed save'); return [row()]; }, generate: async ({ evidence }) => draft(evidence) });
  const preview = await service.previewDigest({ week }), request = { week, previewId: preview.previewId, confirm: true };
  const first = await service.confirmDigest(request), expected = structuredClone(first), readsBefore = reads;
  failed = true; first.text = '调用者修改返回对象不影响原回执';
  assert.deepEqual(await service.confirmDigest(request), expected);
  assert.deepEqual(saved(db), expected); assert.equal(reads, readsBefore);
  await assert.rejects(service.confirmDigest({ ...request, week: '2026-W40' }), error => error.status === 409);
});

// 新增人工动作：POST selftalk/digest/preview {week} → POST selftalk/digest {week,previewId,confirm:true}。
// GET selftalk 的既有 {pulledAt,digest,items} shape 保持不变，GET/sync 绝不调用模型。
test('周汇总HTTP路径优先于消息id预览，预览确认后GET保持原shape', async t => {
  const db = database(t); let calls = 0;
  const all = routes(db, { now: () => instant, readMessages: async () => [row()], generate: async ({ evidence }) => { calls++; return draft(evidence); } });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), found = match(all, req.method, url.pathname);
    if (!found) return json(res, 404, { error: '不存在' });
    await found.handler(req, res, { params: found.params, url });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (method, endpoint, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, body: await response.json() };
  };
  const p = await request('POST', '/api/v3/selftalk/digest/preview', { week });
  assert.equal(p.status, 200); assert.equal(saved(db), null);
  assert.equal((await request('POST', '/api/v3/selftalk/digest', { week, previewId: p.body.previewId })).status, 400);
  const confirmed = await request('POST', '/api/v3/selftalk/digest', { week, previewId: p.body.previewId, confirm: true });
  assert.equal(confirmed.status, 200);
  const result = await request('GET', '/api/v3/selftalk');
  assert.deepEqual(Object.keys(result.body).sort(), ['digest', 'digestTrace', 'items', 'pulledAt']);
  assert.equal(result.body.digest, confirmed.body.text); assert.equal(calls, 1);
});
