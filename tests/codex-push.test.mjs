import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { codexPushStatus, createCodexPush, pushCandidates, resetCard, PUSH_INTERVAL } from '../server/codex-push.mjs';
import { validateV3Setting } from '../server/v3-settings.mjs';
import { routes } from '../server/routes/workspace.mjs';
import { match } from '../server/http.mjs';

const hour = 3600_000;
const signal = (id, event, action, at, text = `中译${id}`) => ({ id, eventIds: [event], action, publishedAt: at, kind: 'event_update', text, originalText: `original ${id}`, url: `https://x.com/thsottiaux/status/${id}` });
const event = (id, status, createdAt, extra = {}) => ({ id, status, createdAt, ...(status === 'confirmed' ? { confirmedAt: createdAt } : {}), ...extra });
const source = (events, activities) => ({ checkedAt: '2026-10-18T05:00:00+08:00', events, activities });
const old = () => source([event('e1', 'confirmed', '2026-10-15T14:28:13+08:00')], [signal('1', 'e1', 'confirm', '2026-10-15T14:28:13+08:00')]);

function setup() {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须隔离');
  const db = openDb(mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'push-')));
  const env = { instant: Date.parse('2026-10-18T10:00:00+08:00'), body: old(), fetches: 0, sends: [], reply: null };
  env.make = () => createCodexPush(db, {
    now: () => env.instant,
    fetcher: async () => { env.fetches++; if (env.body instanceof Error) throw env.body; return Response.json(env.body); },
    run: async (command, args) => { env.sends.push({ command, args }); if (env.reply instanceof Error) throw env.reply; return { stdout: JSON.stringify(env.reply || { ok: true, identity: 'bot', data: { message_id: `om_${env.sends.length}` } }) }; },
  });
  return { db, env };
}
const rows = db => Object.fromEntries(db.prepare('SELECT * FROM codex_push').all().map(r => [r.event_id, r]));

test('推送关着时不读数据源、不发送', async () => {
  const { db, env } = setup();
  await env.make().tick();
  assert.equal(env.fetches, 0); assert.equal(env.sends.length, 0);
  assert.equal(codexPushStatus(db).enabled, false);
  assert.equal(codexPushStatus(db).lastCheck, null);
});

test('开启后第一次检查只记基线不推；满 4 小时才再查；新事件只推最新一条，重启后不重推', async () => {
  const { db, env } = setup();
  saveSetting(db, 'codex_push_enabled', '1');
  const push = env.make();
  await push.tick();
  assert.equal(env.fetches, 1); assert.equal(env.sends.length, 0);
  assert.equal(rows(db).e1.status, 'skipped');
  assert.equal(codexPushStatus(db).baseline, false);
  env.instant += hour; await push.tick();
  assert.equal(env.fetches, 1, '不满 4 小时不检查');

  env.body = source([...old().events, event('e2', 'announced', '2026-10-18T11:00:00+08:00'), event('e3', 'confirmed', '2026-10-18T12:00:00+08:00')],
    [...old().activities, signal('2', 'e2', 'announce', '2026-10-18T11:00:00+08:00'), signal('3', 'e3', 'confirm', '2026-10-18T12:00:00+08:00')]);
  env.instant += PUSH_INTERVAL; await push.tick();
  assert.equal(env.fetches, 2); assert.equal(env.sends.length, 1);
  const args = env.sends[0].args;
  assert.equal(env.sends[0].command, 'lark-cli');
  assert.deepEqual(args.slice(0, 10), ['--profile', 'cli_a96f5f9ac63adcd4', 'im', '+messages-send', '--as', 'bot', '--user-id', 'ou_5ad2ac4359de95dc41b5e89edd68ae6a', '--msg-type', 'interactive']);
  assert.match(args[args.indexOf('--idempotency-key') + 1], /^codex-reset-[0-9a-f]{32}$/);
  assert.equal(JSON.parse(args[args.indexOf('--content') + 1]).header.text_tag_list[0].text.content, '已确认');
  assert.equal(rows(db).e3.status, 'sent'); assert.equal(rows(db).e3.message_id, 'om_1');
  assert.equal(rows(db).e2.status, 'skipped');
  assert.equal(codexPushStatus(db).lastPush.summary, '已确认：中译3');

  env.instant += PUSH_INTERVAL; await env.make().tick();
  assert.equal(env.fetches, 3); assert.equal(env.sends.length, 1, '服务重启后同一事件不重推');
});

test('飞书明确拒绝：记原因，之后每次检查再试，最多 3 次', async () => {
  const { db, env } = setup();
  saveSetting(db, 'codex_push_enabled', '1');
  const push = env.make();
  await push.tick();
  env.body = source([...old().events, event('e2', 'confirmed', '2026-10-18T11:00:00+08:00')], [...old().activities, signal('2', 'e2', 'confirm', '2026-10-18T11:00:00+08:00')]);
  env.reply = Object.assign(new Error('exit 1'), { stdout: JSON.stringify({ ok: false, error: { message: 'Bot has NO availability to this user' } }) });
  for (let i = 0; i < 5; i++) { env.instant += PUSH_INTERVAL; await push.tick(); }
  assert.equal(env.sends.length, 3);
  const r = rows(db).e2;
  assert.equal(r.status, 'failed'); assert.equal(r.attempts, 3);
  assert.match(r.error, /飞书拒绝：Bot has NO availability.*不再重试/);
  assert.equal(codexPushStatus(db).lastPush.status, 'failed');
});

test('超时或输出无法确认：记为结果不明，不自动重发', async () => {
  const { db, env } = setup();
  saveSetting(db, 'codex_push_enabled', '1');
  const push = env.make();
  await push.tick();
  env.body = source([...old().events, event('e2', 'confirmed', '2026-10-18T11:00:00+08:00')], [...old().activities, signal('2', 'e2', 'confirm', '2026-10-18T11:00:00+08:00')]);
  env.reply = Object.assign(new Error('timeout'), { killed: true });
  env.instant += PUSH_INTERVAL; await push.tick();
  env.reply = null;
  env.instant += PUSH_INTERVAL; await push.tick();
  assert.equal(env.sends.length, 1);
  assert.equal(rows(db).e2.status, 'unknown');
  assert.match(rows(db).e2.error, /结果不明/);
});

test('数据源失败：记下检查时间和原因，不发送，4 小时后再查', async () => {
  const { db, env } = setup();
  saveSetting(db, 'codex_push_enabled', '1');
  env.body = new Error('网络断开');
  const push = env.make();
  await push.tick();
  assert.equal(codexPushStatus(db).lastCheck.error, '网络断开');
  assert.equal(codexPushStatus(db).baseline, true);
  env.instant += hour; await push.tick();
  assert.equal(env.fetches, 1);
  env.body = old(); env.instant += PUSH_INTERVAL; await push.tick();
  assert.equal(env.fetches, 2); assert.equal(env.sends.length, 0, '恢复后的第一次成功检查仍只记基线');
  assert.equal(codexPushStatus(db).lastCheck.error, null);
});

test('关掉再开：关闭期间出现的事件当作基线，不补推', async () => {
  const { db, env } = setup();
  saveSetting(db, 'codex_push_enabled', '1');
  const push = env.make();
  await push.tick();
  saveSetting(db, 'codex_push_enabled', '0');
  await push.tick();
  assert.equal(codexPushStatus(db).enabledSince, null);
  env.body = source([...old().events, event('e2', 'confirmed', '2026-10-18T11:00:00+08:00')], [...old().activities, signal('2', 'e2', 'confirm', '2026-10-18T11:00:00+08:00')]);
  env.instant += hour;
  saveSetting(db, 'codex_push_enabled', '1');
  await push.tick();
  assert.equal(env.fetches, 2, '重新开启立即检查'); assert.equal(env.sends.length, 0);
  assert.equal(rows(db).e2.status, 'skipped');
});

test('候选与卡片：撤回不推；已确认但只有预告帖时主句写已重置；正文转义', () => {
  const s = source([event('a', 'confirmed', '2026-10-18T05:12:00+08:00'), event('w', 'announced', '2026-10-18T06:00:00+08:00')],
    [signal('1', 'a', 'announce', '2026-10-18T00:21:00+08:00', '今天之内<落地>'), signal('2', 'w', 'announce', '2026-10-18T06:00:00+08:00'), signal('3', 'w', 'withdraw', '2026-10-18T07:00:00+08:00')]);
  const list = pushCandidates(s);
  assert.deepEqual(list.map(c => c.id), ['a']);
  const card = resetCard(list[0]);
  assert.equal(card.schema, '2.0');
  const lines = card.body.elements[0].columns[0].elements.map(e => e.content);
  assert.equal(lines[0], '**Codex 额度已重置**');
  assert.match(lines[1], /预告原话：今天之内&#60;落地&#62;/);
  assert.equal(card.body.elements[2].behaviors[0].default_url, 'https://x.com/thsottiaux/status/1');
  assert.throws(() => pushCandidates({ events: [] }), /结构不完整/);
});

test('开关配置只接受 0 / 1，默认关；状态接口可读', async () => {
  assert.equal(validateV3Setting('codex_push_enabled', '1'), '1');
  assert.throws(() => validateV3Setting('codex_push_enabled', 'true'), /只能是 0/);
  const { db } = setup();
  const all = routes(db);
  const call = async (method, url, body) => {
    const found = match(all, method, url); let status, payload;
    const res = { setHeader() {}, writeHead(s) { status = s; }, end(b) { payload = JSON.parse(b); } };
    const req = { [Symbol.asyncIterator]: async function* () { if (body) yield Buffer.from(JSON.stringify(body)); } };
    await found.handler(req, res, { params: found.params, url: new URL(url, 'http://x') });
    return { status, body: payload };
  };
  assert.equal((await call('GET', '/api/v3/settings')).body.values.codex_push_enabled, '0');
  const pv = (await call('POST', '/api/settings/codex_push_enabled/preview', { value: '1' })).body;
  assert.equal(pv.before, null); assert.equal(pv.value, '1');
  assert.equal((await call('PUT', '/api/settings/codex_push_enabled', { previewId: pv.previewId, confirm: true })).status, 200);
  const status = (await call('GET', '/api/v3/codex-push')).body;
  assert.equal(status.enabled, true); assert.equal(status.nextCheck, '10 分钟内');
  assert.equal(status.baseline, true, '已开启、还没做第一次检查时提示只记基线');
  assert.match(status.sender, /cli_a96f5f9ac63adcd4/);
});
