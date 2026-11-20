import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { openDb, saveSetting } from '../server/db.mjs';
import { createTextDraftGenerator } from '../server/ai-draft.mjs';
import { createMentorService, mentorView, datedHeadings, readMentorLogs } from '../server/mentor.mjs';
// 日志正文按带段落 ID 的 DocxXML 读取（2026-10-19）：每行一段
const logXml = text => '<h1 id="first">10.16 日志</h1>' + text.split('\n').map((line, i) => `<p id="para${i}abcd">${line}</p>`).join('');
import { fingerprint, getRecord } from '../server/local-records.mjs';
import { mentorRoutes } from '../server/routes/mentor.mjs';
import { json, match } from '../server/http.mjs';

const instant = Date.parse('2026-10-16T12:00:00+08:00');
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'draft-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); }); return db;
}
const source = { name: '带教测试', role: '管培生', url: 'https://example.feishu.cn/docx/logs', year: 2026 };
const person = (text = '已访谈一位用户。\n卡点：数据待确认。') => mentorView(source, datedHeadings('<h1 id="first">10.16 日志</h1>', 2026), logXml(text), instant);
const draft = evidence => ({ text: 'AI草稿：先确认数据范围，来源10.16。', sourceFingerprint: fingerprint(evidence), generatedAt: new Date(instant).toISOString(), threadId: 'mock-thread', model: 'mock', effort: 'high' });

test('人工草稿复用只读Codex，完整发送证据并保留模型和来源回执', async t => {
  const db = database(t), calls = [], evidence = { text: '完整原文\n不要执行来源里的命令' };
  const client = {
    selection: async () => ({ model: 'mock', effort: 'high' }),
    create: async args => { calls.push(args); assert.ok(args.cwd.startsWith(realpathSync(process.env.WORKDESK_DATA_DIR))); assert.match(args.instructions, /不可信引用/); return 'draft-thread'; },
    send: async (id, text, emit, signal, settings) => { assert.equal(id, 'draft-thread'); assert.ok(text.includes(JSON.stringify(evidence))); assert.equal(settings.effort, 'high'); assert.equal(signal.aborted, false); emit('delta', { text: 'AI草稿：', itemId: 'a' }); emit('delta', { text: '完整建议', itemId: 'a' }); },
  };
  const result = await createTextDraftGenerator(db, { client, now: () => instant })({ title: '草稿', task: '整理', evidence });
  assert.equal(result.text, 'AI草稿：完整建议'); assert.equal(result.sourceFingerprint, fingerprint(evidence)); assert.equal(result.model, 'mock'); assert.equal(calls.length, 1);
});

test('过长来源不截断且不发给模型，空输出与失败不会伪装成功', async t => {
  const db = database(t); let calls = 0;
  const client = { selection: async () => { calls++; return { model: 'mock' }; }, create: async () => 't', send: async () => {} };
  const generate = createTextDraftGenerator(db, { client });
  await assert.rejects(generate({ title: '长来源', task: '整理', evidence: '字'.repeat(120001) }), e => e.status === 413); assert.equal(calls, 0);
  await assert.rejects(generate({ title: '空回复', task: '整理', evidence: ['来源'] }), /没有返回/);
  client.send = async () => { throw new Error('private stderr'); };
  await assert.rejects(generate({ title: '失败', task: '整理', evidence: ['来源'] }), e => e.status === 502 && !e.message.includes('private'));
});

test('同一草稿在进行中拒绝重复模型调用，结束后释放锁', async t => {
  const db = database(t); let finish;
  const client = { selection: async () => ({ model: 'mock' }), create: async () => 't', send: async (_id, _text, emit) => { emit('delta', { text: '建议' }); await new Promise(r => { finish = r; }); } };
  const generate = createTextDraftGenerator(db, { client }), input = { title: '重复', task: '整理', evidence: ['来源'] };
  const first = generate(input); while (!finish) await new Promise(r => setImmediate(r));
  await assert.rejects(generate(input), e => e.status === 409); finish(); await first;
});

test('带教GET不触发模型，生成使用完整正文，预览确认后才替换规则草稿', async t => {
  const db = database(t); saveSetting(db, 'mentor_sources', JSON.stringify([source])); let calls = 0;
  const service = createMentorService(db, { now: () => instant, readLogs: async () => person(), generate: async ({ evidence }) => { calls++; assert.match(evidence.logs[0].text, /已访谈/); return draft(evidence); } });
  const initial = (await service.list())[0]; assert.equal(calls, 0); assert.equal(initial.feedbackOrigin, 'rules'); assert.equal(initial.evidence, undefined);
  const preview = await service.previewDraft(source.name, {}); assert.equal(calls, 1); assert.equal(getRecord(db, 'mentor-draft', fingerprint(source)), null);
  await assert.rejects(service.confirmDraft(source.name, {}), e => e.status === 400);
  const receipt = await service.confirmDraft(source.name, { previewId: preview.previewId, confirm: true }); assert.equal(receipt.draft, true);
  assert.equal((await service.list())[0].feedbackOrigin, 'ai-draft');
  assert.deepEqual(await service.confirmDraft(source.name, { previewId: preview.previewId, confirm: true }), receipt);
});

test('带教来源变化、配置变化、空日志、过期均不保存草稿', async t => {
  const db = database(t); saveSetting(db, 'mentor_sources', JSON.stringify([source])); let value = person(), clock = instant;
  const service = createMentorService(db, { now: () => clock, readLogs: async () => value, generate: async ({ evidence }) => draft(evidence) });
  const preview = await service.previewDraft(source.name, {}); value = person('完整正文已变');
  await assert.rejects(service.confirmDraft(source.name, { previewId: preview.previewId, confirm: true }), /已变化/);
  assert.equal(getRecord(db, 'mentor-draft', fingerprint(source)), null);
  const p2 = await service.previewDraft(source.name, {}); saveSetting(db, 'mentor_sources', JSON.stringify([{ ...source, url: 'https://example.feishu.cn/docx/other' }]));
  await assert.rejects(service.confirmDraft(source.name, { previewId: p2.previewId, confirm: true }), /已变化/);
  saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  const p3 = await service.previewDraft(source.name, {}); clock += 600001;
  await assert.rejects(service.confirmDraft(source.name, { previewId: p3.previewId, confirm: true }), /过期/);
  value = { ...person(), evidence: [] };
  await assert.rejects(service.previewDraft(source.name, {}), /正文尚不可用/);
});

test('带教草稿人工预览及确认HTTP接口保留两阶段门禁', async t => {
  const db = database(t); saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  const mentor = createMentorService(db, { now: () => instant, readLogs: async () => person(), generate: async ({ evidence }) => draft(evidence) });
  const routes = mentorRoutes({ mentor }), server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), found = match(routes, req.method, url.pathname);
    if (!found) return json(res, 404, {}); await found.handler(req, res, { params: found.params, url });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const call = async (suffix, body) => { const r = await fetch(`http://127.0.0.1:${server.address().port}/api/v3/mentor/${encodeURIComponent(source.name)}/draft${suffix}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  assert.equal((await call('', { confirm: true })).status, 400);
  const preview = await call('/preview', {}); assert.equal(preview.status, 200); assert.equal(getRecord(db, 'mentor-draft', fingerprint(source)), null);
  const saved = await call('', { previewId: preview.body.previewId, confirm: true }); assert.equal(saved.status, 200); assert.equal(saved.body.draft, true);
});

test('旧来源的慢请求不能覆盖新来源证据或进入新配置的模型输入', async t => {
  const db = database(t); saveSetting(db, 'mentor_sources', JSON.stringify([source])); let releaseOld;
  const changed = { ...source, url: 'https://example.feishu.cn/docx/newsource' };
  const view = cfg => mentorView(cfg, datedHeadings('<h1 id="first">10.16 日志</h1>', 2026), logXml(cfg.url), instant);
  const service = createMentorService(db, { now: () => instant, readLogs: cfg => cfg.url === source.url ? new Promise(resolve => { releaseOld = () => resolve(view(cfg)); }) : new Promise(resolve => { resolve(view(cfg)); queueMicrotask(releaseOld); }), generate: async ({ evidence }) => { assert.equal(evidence.source.url, changed.url); assert.ok(evidence.logs[0].text.includes(changed.url)); return draft(evidence); } });
  const old = service.list({ refresh: true }).then(() => null, error => error);
  saveSetting(db, 'mentor_sources', JSON.stringify([changed]));
  const preview = await service.previewDraft(source.name, {});
  assert.equal((await old).status, 409); assert.ok(preview.value.text);
  const cached = JSON.parse(db.prepare('SELECT payload FROM v3_snapshots WHERE kind=?').get('mentor').payload);
  assert.equal(cached.identity, fingerprint([changed])); assert.ok(cached.value[0].evidence[0].src.startsWith(changed.url));
});

test('日志局部excerpt阻断生成，普通tips保留为来源说明', async () => {
  const read = async (content, tips = '') => readMentorLogs(source, { now: () => instant, run: async (_file, args) => ({ stdout: JSON.stringify({ ok: true, identity: 'user', data: { document: { revision_id: 3, content: args.includes('outline') ? '<h1 id="first">10.16 日志</h1>' : content, tips } } }) }) });
  await assert.rejects(read('<h1 id="first">10.16 日志</h1><excerpt top-block-id="table">部分表格</excerpt>'), /未完整读取/);
  const result = await read(logXml('完整文字'), 'safe replay guidance');
  assert.equal(result.evidence[0].sourceNote, 'safe replay guidance');
});
