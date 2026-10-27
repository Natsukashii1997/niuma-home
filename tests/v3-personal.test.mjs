import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, saveAssistant } from '../server/db.mjs';
import { match, json } from '../server/http.mjs';
import { getRecord, listRecords } from '../server/local-records.mjs';
import { composeKnowledgeInstructions, createKnowledgeService } from '../server/assistant-knowledge.mjs';
import { createSelfTalkService, readSelfTalkMessages, selfTalkWindow, SELF_APP_ID, SELF_USER_ID } from '../server/selftalk.mjs';
import { routes as knowledgeRoutes } from '../server/routes/assistant-knowledge.mjs';
import { routes as selftalkRoutes } from '../server/routes/selftalk.mjs';

const instant = Date.parse('2026-10-16T15:00:00+08:00');
const identity = { profile: 'cli_a96f5f9ac63adcd4', appId: SELF_APP_ID, identity: 'user', onBehalfOf: { openId: SELF_USER_ID } };
const raw = (id, content = '真实路径的合成测试文字', extra = {}) => ({ message_id: id, msg_type: 'text', create_time: '2026-10-16 11:07', sender: { id: SELF_USER_ID, sender_type: 'user' }, content, deleted: false, ...extra });
const normalized = (id = 'om_personal') => ({ id, createdAt: '2026-10-16T03:07:00.000Z', text: '跟进测试事项', type: 'text', link: false });
function cli(pages, who = identity) {
  let calls = 0;
  const run = async (exe, args, options) => {
    assert.equal(exe, 'lark-cli');
    assert.deepEqual(args.slice(0, 4), ['--profile', 'cli_a96f5f9ac63adcd4', '--as', 'user']);
    assert.equal(options.shell, false);
    if (args[4] === 'whoami') return { stdout: JSON.stringify(who) };
    assert.ok(args.includes('--no-reactions')); assert.ok(!args.includes('--download-resources'));
    assert.equal(args[args.indexOf('--user-id') + 1], SELF_USER_ID);
    const response = pages[calls++];
    if (response instanceof Error) throw response;
    return { stdout: JSON.stringify(response) };
  };
  return { run, calls: () => calls };
}
const page = (messages, next = null) => ({ ok: true, identity: 'user', data: { messages, has_more: !!next, page_token: next }, meta: { pagination: { complete: !next } } });

function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '个人接口测试必须显式使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'personal-'));
  const db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}

test('自言自语固定身份，最近十个北京日逐页完整读取并正确保留非文本类型', async () => {
  assert.deepEqual(selfTalkWindow(instant), { start: '2026-10-07T00:00:00+08:00', end: '2026-10-16T07:00:00.000Z' });
  const source = cli([page([raw('om_text', '{"text":"https://example.test/事项"}')], 'p2'), page([raw('om_image', '不读取图片内容', { msg_type: 'image' }), raw('om_old', '太早', { create_time: '2026-10-06 12:00' }), raw('om_deleted', '撤回', { deleted: true })])]);
  const rows = await readSelfTalkMessages({ run: source.run, now: instant });
  assert.equal(source.calls(), 2); assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.id === 'om_text').link, true);
  assert.equal(rows.find(row => row.id === 'om_image').text, '[图片消息]');
});

test('自言自语拒绝其他App/用户/机器人、外国发送者和不完整分页', async () => {
  for (const who of [{ ...identity, appId: 'other' }, { ...identity, identity: 'bot' }, { ...identity, onBehalfOf: { openId: 'other' } }]) {
    const source = cli([], who);
    await assert.rejects(readSelfTalkMessages({ run: source.run, now: instant }), error => error.status === 403);
    assert.equal(source.calls(), 0);
  }
  for (const pages of [
    [page([raw('om_foreign', '不能读', { sender: { id: 'another', sender_type: 'user' } })])],
    [page([], 'same'), page([], 'same')],
    [{ ok: true, identity: 'user', data: { messages: [], has_more: true } }],
    [{ ...page([]), meta: { pagination: { complete: false } } }],
    [page([], 'p2'), new Error('not shown private stderr')],
  ]) await assert.rejects(readSelfTalkMessages({ run: cli(pages).run, now: instant }));
});

test('自言自语分页重复消息去重，分页时正文变化拒绝整轮', async () => {
  const source = cli([page([raw('om_same')], 'p2'), page([raw('om_same')])]);
  assert.equal((await readSelfTalkMessages({ run: source.run, now: instant })).length, 1);
  const changed = cli([page([raw('om_same')], 'p2'), page([raw('om_same', '改过的正文')])]);
  await assert.rejects(readSelfTalkMessages({ run: changed.run, now: instant }), /分页期间/);
});

test('自言自语合并并发，失败保留快照和成功水位，不编造摘要', async t => {
  const db = database(t); let clock = instant, calls = 0, fail = false;
  const service = createSelfTalkService(db, { now: () => clock, readMessages: async () => { calls++; if (fail) throw new Error('private source text'); return [normalized()]; } });
  const [a, b] = await Promise.all([service.list(), service.list()]);
  assert.deepEqual(a, b); assert.equal(calls, 1); assert.equal(a.digest, '');
  const before = db.prepare('SELECT * FROM v3_snapshots WHERE kind=?').get('selftalk');
  const source = db.prepare('SELECT * FROM v3_source_status WHERE kind=?').get('selftalk');
  fail = true; clock += 300001;
  await assert.rejects(service.list(), error => !error.message.includes('private source text'));
  assert.deepEqual(db.prepare('SELECT * FROM v3_snapshots WHERE kind=?').get('selftalk'), before);
  assert.equal(db.prepare('SELECT * FROM v3_source_status WHERE kind=?').get('selftalk').success_at, source.success_at);
  const restarted = createSelfTalkService(db, { now: () => instant + 1, readMessages: async () => { throw new Error('still unavailable'); } });
  await assert.rejects(restarted.list(), '重建读取器后仍不得把失败前的缓存伪装成成功');
});

test('自言自语本地操作先预览后确认、绑定目标与内容、重复确认幂等', async t => {
  const db = database(t), service = createSelfTalkService(db, { now: () => instant, readMessages: async () => [normalized()] });
  await service.list();
  assert.throws(() => service.confirm('om_personal', { confirm: true }), error => error.status === 400);
  const preview = service.preview('om_personal', { tag: 'star' });
  assert.equal(getRecord(db, 'selftalk-tag', 'om_personal'), null);
  assert.throws(() => service.confirm('om_other', { previewId: preview.previewId, confirm: true }), error => error.status === 409);
  const saved = service.confirm('om_personal', { previewId: preview.previewId, confirm: true, tag: 'need', text: '篡改' });
  assert.equal(saved.tag, 'star'); assert.equal(saved.text, '跟进测试事项');
  assert.deepEqual(service.confirm('om_personal', { previewId: preview.previewId, confirm: true }), saved);
  assert.equal((await service.list()).items[0].tag, 'star');
});

test('自言自语转待办/需求是独立本地记录，跨操作冲突与过期预览被拒绝', async t => {
  const db = database(t); let clock = instant;
  const service = createSelfTalkService(db, { now: () => clock, readMessages: async () => [normalized()] });
  await service.list();
  assert.throws(() => service.preview('om_personal', { tag: 'need' }), error => error.status === 400);
  const need = service.preview('om_personal', { tag: 'need', month: '2026-11' });
  const star = service.preview('om_personal', { tag: 'star' });
  const converted = service.confirm('om_personal', { previewId: need.previewId, confirm: true });
  assert.equal(converted.need.status, '草稿'); assert.equal(converted.month, '2026-11');
  assert.equal(listRecords(db, 'selftalk-need').length, 1);
  assert.throws(() => service.confirm('om_personal', { previewId: star.previewId, confirm: true }), error => error.status === 409);
  const todo = service.preview('om_personal', { tag: 'todo' });
  service.confirm('om_personal', { previewId: todo.previewId, confirm: true });
  assert.equal(listRecords(db, 'selftalk-todo')[0].done, false);
  assert.equal((await service.list()).items[0].tag, 'todo');
  const stale = service.preview('om_personal', { tag: 'archived' }); clock += 600001;
  assert.throws(() => service.confirm('om_personal', { previewId: stale.previewId, confirm: true }), error => error.status === 409);
});

test('自言自语不把附件占位转需求，来源修改后旧预览失效', async t => {
  const db = database(t); let rows = [normalized(), { ...normalized('om_image'), type: 'image', text: '[图片消息]' }];
  const service = createSelfTalkService(db, { now: () => instant, readMessages: async () => rows });
  await service.list();
  assert.throws(() => service.preview('om_image', { tag: 'need', month: '2026-11' }), error => error.status === 400);
  const preview = service.preview('om_personal', { tag: 'star' });
  rows = [{ ...normalized(), text: '来源已编辑' }]; await service.list({ refresh: true });
  assert.throws(() => service.confirm('om_personal', { previewId: preview.previewId, confirm: true }), error => error.status === 409);
});

test('助手知识库新增/删除均预览确认，稳定ID，助手隔离，重复确认幂等', t => {
  const db = database(t), first = saveAssistant(db, { name: '测试甲', instructions: '' }), second = saveAssistant(db, { name: '测试乙', instructions: '' });
  const service = createKnowledgeService(db, { now: () => instant });
  assert.deepEqual(service.list(first.id), { limit: 30000, docs: [] });
  assert.throws(() => service.confirm(first.id, { confirm: true }), error => error.status === 400);
  const preview = service.preview(first.id, { kind: '句式', title: '同名标题', body: '原始正文\n保留换行' });
  assert.equal(service.list(first.id).docs.length, 0);
  assert.throws(() => service.confirm(second.id, { previewId: preview.previewId, confirm: true }), error => error.status === 409);
  const saved = service.confirm(first.id, { previewId: preview.previewId, confirm: true, body: '不能篡改' });
  assert.equal(saved.body, '原始正文\n保留换行');
  assert.deepEqual(service.confirm(first.id, { previewId: preview.previewId, confirm: true }), saved);
  assert.equal(service.list(second.id).docs.length, 0);
  const duplicate = service.preview(first.id, { title: '同名标题', body: '另一篇' });
  const other = service.confirm(first.id, { previewId: duplicate.previewId, confirm: true });
  assert.notEqual(saved.id, other.id);
  const removal = service.preview(first.id, { action: 'delete', docId: saved.id });
  assert.equal(service.list(first.id).docs.length, 2);
  assert.throws(() => service.confirm(first.id, { previewId: removal.previewId, confirm: true }, 'add'), error => error.status === 409);
  service.confirm(first.id, { previewId: removal.previewId, confirm: true }, 'delete');
  assert.deepEqual(service.list(first.id).docs.map(doc => doc.id), [other.id]);
});

test('知识库超过30000字提醒但不截断；新会话指令保留原说明和完整正文', t => {
  const db = database(t), assistant = saveAssistant(db, { name: '完整知识', instructions: '保留原说明' });
  const service = createKnowledgeService(db, { now: () => instant }), text = '字'.repeat(30001) + '\n完整结尾';
  const preview = service.preview(assistant.id, { title: '长文', body: text });
  assert.ok(preview.warning); service.confirm(assistant.id, { previewId: preview.previewId, confirm: true });
  const kb = service.list(assistant.id); assert.ok(kb.warning); assert.equal(kb.docs[0].body, text);
  const instructions = composeKnowledgeInstructions(db, assistant.id, '保留原说明');
  assert.ok(instructions.startsWith('保留原说明')); assert.ok(instructions.includes(text));
  assert.throws(() => service.preview(assistant.id, { title: '二进制', body: '\u0000zip' }), error => error.status === 400);
  assert.throws(() => service.preview(assistant.id, { title: '对象', body: { text: '非纯文本' } }), error => error.status === 400);
  assert.throws(() => service.list('999999'), error => error.status === 404);
});

// 新动作契约：selftalk/:id/preview {tag,month?} → PATCH selftalk/:id {previewId,confirm:true}；
// knowledge/preview {action:add|delete,title,kind,body,docId?} → POST/DELETE knowledge {previewId,confirm:true}。
test('个人接口GET形状、同步和两阶段写入路径均可经HTTP使用', async t => {
  const db = database(t), assistant = saveAssistant(db, { name: '接口助手', instructions: '' });
  const options = { now: () => instant, readMessages: async () => [normalized()] };
  const all = [...selftalkRoutes(db, options), ...knowledgeRoutes(db, options)];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), found = match(all, req.method, url.pathname);
    if (!found) return json(res, 404, { error: '不存在' });
    await found.handler(req, res, { params: found.params, url });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (method, endpoint, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, { method, headers: { 'content-type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request('POST', '/api/v3/selftalk/sync')).status, 200);
  assert.deepEqual(Object.keys((await request('GET', '/api/v3/selftalk')).body).sort(), ['digest', 'items', 'pulledAt']);
  const p = await request('POST', '/api/v3/selftalk/om_personal/preview', { tag: 'archived' });
  assert.equal((await request('PATCH', '/api/v3/selftalk', { id: 'om_personal', previewId: p.body.previewId, confirm: true })).body.tag, 'archived');
  const base = `/api/v3/assistants/${assistant.id}/knowledge`;
  const k = await request('POST', `${base}/preview`, { title: 'API正文', body: '已确认知识' });
  const added = await request('POST', base, { previewId: k.body.previewId, confirm: true });
  assert.equal(added.status, 200); assert.equal((await request('GET', base)).body.docs[0].body, '已确认知识');
  const d = await request('POST', `${base}/preview`, { action: 'delete', docId: added.body.id });
  assert.equal((await request('DELETE', base, { previewId: d.body.previewId, confirm: true })).status, 200);
});
