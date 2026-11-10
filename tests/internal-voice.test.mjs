import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { openDb, saveSetting } from '../server/db.mjs';
import { createInternalVoice, lastWeek, lastMonth, checkRange, contentOf, lineOf } from '../server/internal-voice.mjs';
import { match } from '../server/http.mjs';
import { routes } from '../server/routes/internal-voice.mjs';

// 全部是合成数据；假接口按 x.lumiclass.com 的返回形状造，不连真实接口、不读钥匙串。
const NOW = Date.parse('2026-11-10T10:00:00+08:00'); // 周二
const TOKEN = 'lst_fake_token_for_tests_only';

function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'internal-voice-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}

const staff = [
  { userid: 'u-daxue', name: '大学销售甲', department_name: '大学销售企微-小王组', has_conversation: true },
  { userid: 'u-guoke', name: '国课销售乙', department_name: '国课销售企微-大王组', has_conversation: true },
  { userid: 'u-shensu', name: '申诉老师丙', department_name: '销售企微申诉部', has_conversation: true },
  { userid: 'u-idle', name: '没会话的', department_name: '大学销售企微-元帅组', has_conversation: false },
  { userid: 'u-ops', name: '运营丁', department_name: '产品运营部', has_conversation: true },
];
const customerConvs = {
  'u-daxue': [
    { id: 'c1', external_userid: 'wm-s1', external_name: '学生一', staff_remark: '学生一-澳洲', last_msg_time: '2026-11-07 20:00:00.1' },
    { id: 'c-old', external_userid: 'wm-s9', external_name: '老学生', staff_remark: '', last_msg_time: '2026-10-20 09:00:00' },
  ],
  'u-guoke': [{ id: 'c2', external_userid: 'wm-s2', external_name: '学生二', staff_remark: '', last_msg_time: '2026-11-09 08:00:00' }],
  'u-shensu': [{ id: 'c-shensu', external_userid: 'wm-s3', external_name: '申诉学生', staff_remark: '', last_msg_time: '2026-11-05 08:00:00' }],
};
const rooms = {
  'u-daxue': [{ id: 'r-id', chat_id: 'g1', name: '资料群', last_msg_time: '2026-11-06 10:00:00' }],
  'u-guoke': [{ id: 'r-id', chat_id: 'g1', name: '资料群', last_msg_time: '2026-11-06 10:00:00' }],
};
const cust = { name: 'Customer', value: 1 }, emp = { name: 'Staff', value: 2 };
const messages = {
  c1: [
    { msg_id: 'm1', msg_time: '2026-11-03 10:00:00', msg_type: 'text', from: 'wm-s1', from_role: cust, from_detail: { external_name: '学生一' }, msg_content: '这个课多少钱？' },
    { msg_id: 'm2', msg_time: '2026-11-03 10:01:00', msg_type: 'text', from: 'u-daxue', from_role: emp, from_detail: { name: '大学销售甲' }, msg_content: '早鸟价 2999' },
    { msg_id: 'm3', msg_time: '2026-11-03 10:02:00', msg_type: 'voice', from: 'wm-s1', from_role: cust, from_detail: { external_name: '学生一' }, msg_content: 'https://oss.invalid/1h', file_url: 'https://x.lumiclass.com/api/chats/media/file?msg_id=m3' },
    { msg_id: 'm4', msg_time: '2026-11-03 10:03:00', msg_type: 'revoke', from: 'wm-s1', from_role: cust, from_detail: [], raw_content: { pre_msgid: 'm1' } },
    { msg_id: 'm5', msg_time: '2026-11-04 11:00:00', msg_type: 'chatrecord', from: 'wm-s1', from_role: cust, from_detail: { external_name: '学生一' }, raw_content: { title: '和同学的聊天', item: [{ content: JSON.stringify({ content: '他们说太贵了' }) }, { content: '"再看看"' }] } },
  ],
  c2: [{ msg_id: 'm6', msg_time: '2026-11-08 23:59:59', msg_type: 'link', from: 'wm-s2', from_role: cust, from_detail: { external_name: '学生二' }, raw_content: { title: '课程表', description: '春季', link_url: 'https://example.invalid/a' } }],
  g1: [
    { msg_id: 'g-m1', msg_time: '2026-11-05 09:00:00', msg_type: 'text', from: 'wm-s1', from_role: cust, from_detail: { external_name: '学生一' }, msg_content: '群里问：什么时候开课' },
    { msg_id: 'g-m2', msg_time: '2026-11-05 09:01:00', msg_type: 'text', from: 'u-daxue', from_role: emp, from_detail: { name: '大学销售甲' }, msg_content: '下周一' },
  ],
  'c-shensu': [{ msg_id: 'm-shensu', msg_time: '2026-11-05 08:00:00', msg_type: 'text', from: 'wm-s3', from_role: cust, msg_content: '申诉' }],
};

// 假接口：按 page / size（员工列表按 limit）分页；记下请求，便于断言没拉不该拉的。
function fakeApi({ status = 200, failOnce = new Set(), failAlways = new Set() } = {}) {
  const calls = [], tries = new Map();
  const page = (all, q, key = 'size') => {
    const size = Number(q.get(key) || 10), p = Number(q.get('page') || 1);
    return { items: all.slice((p - 1) * size, p * size), total: all.length, page: p, size, total_page: Math.max(1, Math.ceil(all.length / size)) };
  };
  const fetchImpl = async url => {
    const u = new URL(url), q = u.searchParams;
    calls.push(u.pathname + u.search);
    assert.equal(u.origin, 'https://x.lumiclass.com');
    const ok = data => ({ status: 200, json: async () => ({ status: 'success', error_code: 200, data }) });
    if (status !== 200) return { status, json: async () => ({ status: 'error', error_message: 'x' }) };
    const id = q.get('conversation_id') || q.get('group_chat_id');
    if (id && (failAlways.has(id) || (failOnce.has(id) && !tries.get(id)))) { tries.set(id, 1); throw new Error('network down'); }
    if (u.pathname === '/api/staff/list') return ok(page(staff, q, 'limit'));
    const m = /^\/api\/chats\/by\/staff\/(customer|room)\/conversation\/list$/.exec(u.pathname);
    if (m) return ok(page((m[1] === 'customer' ? customerConvs : rooms)[q.get('staff_userid')] || [], q));
    if (u.pathname === '/api/chats/by/conversation/message/list' || u.pathname === '/api/chats/by/group/message/list') {
      const from = q.get('msg_start_time'), to = q.get('msg_end_time');
      assert.ok(from && to, '时间范围两个都要传');
      return ok(page((messages[id] || []).filter(x => x.msg_time >= from && x.msg_time <= to).reverse(), q));
    }
    return { status: 404, json: async () => ({ status: 'error' }) };
  };
  return { fetchImpl, calls };
}
const voiceFor = (db, api, extra = {}) => createInternalVoice(db, { fetchImpl: api.fetchImpl, token: () => TOKEN, now: () => NOW, wait: async () => {}, ...extra });

test('上一周取周一至周日、上个月取整月，按北京时间算；日期范围校验', () => {
  assert.deepEqual(lastWeek(NOW), { from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual(lastWeek(Date.parse('2026-11-09T00:30:00+08:00')), { from: '2026-11-02', to: '2026-11-08' }); // 周一凌晨（UTC 还是周日）
  assert.deepEqual(lastWeek(Date.parse('2026-11-08T23:30:00+08:00')), { from: '2026-10-26', to: '2026-11-01' }); // 周日晚上
  assert.deepEqual(lastMonth(NOW), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(lastMonth(Date.parse('2026-01-01T00:10:00+08:00')), { from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(lastMonth(Date.parse('2026-03-05T12:00:00+08:00')), { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(checkRange('2026-11-02', '2026-11-08', NOW), 7);
  assert.equal(checkRange('2026-10-01', '2026-10-31', NOW), 31);
  for (const [from, to, code] of [['2026-11-08', '2026-11-02', 'RANGE_INVALID'], ['2026-11-01', '2026-11-11', 'RANGE_INVALID'], ['2026-09-01', '2026-10-02', 'RANGE_TOO_LONG'], ['2026-02-30', '2026-03-01', 'RANGE_INVALID'], ['20261101', '2026-11-02', 'RANGE_INVALID']])
    assert.throws(() => checkRange(from, to, NOW), e => e.status === 400 && e.code === code);
  assert.equal(lineOf('大学销售企微-欣雅组'), '大学辅导');
  assert.equal(lineOf('国课销售企微-爱娃组'), '国际课程');
  assert.equal(lineOf('销售企微申诉部'), null);
});

test('消息正文：文字原文、链接、合并转发展平、撤回记被撤回的 id，媒体不存 1 小时地址', () => {
  assert.equal(contentOf(messages.c1[0]), '这个课多少钱？');
  assert.equal(contentOf(messages.c1[2]), '');
  assert.equal(contentOf(messages.c1[3]), 'm1');
  assert.equal(contentOf(messages.c1[4]), '[聊天记录·和同学的聊天]\n他们说太贵了\n再看看');
  assert.equal(contentOf(messages.c2[0]), '课程表\n春季\nhttps://example.invalid/a');
});

test('只拉大学辅导、国际课程：客户单聊全存，群里只存客户本人发言，群按 chat_id 去重；重复拉不重复入库', async t => {
  const db = database(t), api = fakeApi(), voice = voiceFor(db, api);
  const { runId, done } = voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' });
  await done;
  const run = voice.status().runs.find(r => r.id === runId);
  assert.equal(run.state, 'done');
  assert.deepEqual(run.stats, { staff: 2, singles: 2, groups: 1, conversationsDone: 3, conversationsFailed: 0, messages: 7, customerMessages: 6, voice: 1 });
  const ids = db.prepare('SELECT msg_id FROM chat_messages ORDER BY msg_id').all().map(r => r.msg_id);
  assert.deepEqual(ids, ['g-m1', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  assert.ok(!ids.includes('g-m2'), '群里员工的话不存');
  assert.ok(!ids.includes('m-shensu'), '申诉部门不拉');
  assert.ok(!api.calls.some(c => c.includes('u-shensu') || c.includes('u-ops') || c.includes('u-idle')), '不该拉的员工不发请求');
  assert.ok(!api.calls.some(c => c.includes('c-old')), '列表里早于开始日期的会话不拉消息');
  assert.equal(api.calls.filter(c => c.includes('group_chat_id=g1')).length, 1, '两个销售都在的群只拉一次');
  const m3 = db.prepare('SELECT * FROM chat_messages WHERE msg_id=?').get('m3');
  assert.equal(m3.content, '');
  assert.equal(m3.file_url, 'https://x.lumiclass.com/api/chats/media/file?msg_id=m3');
  assert.equal(db.prepare('SELECT msg_time FROM chat_messages WHERE msg_id=?').get('m6').msg_time, '2026-11-08 23:59:59', '结束日当天 23:59:59 也拉到');
  const c1 = db.prepare('SELECT * FROM chat_conversations WHERE id=?').get('c1');
  assert.deepEqual([c1.kind, c1.staff_dept, c1.customer_name, c1.customer_remark], ['single', '大学销售企微-小王组', '学生一', '学生一-澳洲']);
  assert.equal(db.prepare('SELECT kind FROM chat_conversations WHERE id=?').get('g1').kind, 'group');
  const dump = JSON.stringify(db.prepare('SELECT * FROM chat_messages').all()) + JSON.stringify(db.prepare('SELECT * FROM chat_pull_runs').all());
  assert.ok(!dump.includes(TOKEN), 'token 不进库');
  // 再拉一次：一条都不新增
  const again = voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' });
  await again.done;
  assert.equal(voice.status().runs[0].stats.messages, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM chat_messages').get().n, 7);
});

test('单个会话重试 3 次仍失败记 partial，其余照常；偶发失败重试后成功', async t => {
  const db = database(t), voice = voiceFor(db, fakeApi({ failAlways: new Set(['c2']), failOnce: new Set(['c1']) }));
  const { done } = voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' });
  await done;
  const run = voice.status().runs[0];
  assert.equal(run.state, 'partial');
  assert.equal(run.stats.conversationsFailed, 1);
  assert.match(run.error, /1 个会话/);
  assert.ok(db.prepare("SELECT 1 FROM chat_messages WHERE msg_id='m1'").get(), 'c1 第二次重试成功');
});

test('token 失效整次失败并说明原因；钥匙串没有 token 不开始', async t => {
  const db = database(t), voice = voiceFor(db, fakeApi({ status: 401 }));
  const { done } = voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' });
  await done;
  const run = voice.status().runs[0];
  assert.equal(run.state, 'failed');
  assert.match(run.error, /token/);
  const none = voiceFor(db, fakeApi(), { token: () => null });
  assert.throws(() => none.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }), e => e.code === 'LUMIST_TOKEN_MISSING');
  assert.equal(none.status().tokenConfigured, false);
});

test('手动拉取先预览（不连接口、不写数据）再确认；预览一次有效；同时只跑一次', async t => {
  const db = database(t), api = fakeApi(), voice = voiceFor(db, api);
  const p = voice.preview({ from: '2026-11-02', to: '2026-11-08' });
  assert.deepEqual([p.days, p.lines, p.existing, p.tokenConfigured], [7, ['大学辅导', '国际课程'], 0, true]);
  assert.equal(api.calls.length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM chat_pull_runs').get().n, 0);
  assert.throws(() => voice.confirm({ previewId: 'nope' }), e => e.code === 'PREVIEW_EXPIRED');
  const { runId } = voice.confirm({ previewId: p.previewId });
  assert.ok(runId);
  assert.throws(() => voice.confirm({ previewId: p.previewId }), e => e.code === 'PREVIEW_EXPIRED');
  const p2 = voice.preview({ from: '2026-11-02', to: '2026-11-08' });
  assert.throws(() => voice.confirm({ previewId: p2.previewId }), e => e.status === 409 && e.code === 'PULL_RUNNING');
  assert.throws(() => voice.preview({ from: '2026-09-01', to: '2026-11-08' }), e => e.code === 'RANGE_TOO_LONG');
  for (let i = 0; i < 100 && voice.status().runs[0].state === 'running'; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal(voice.status().runs[0].state, 'done');
});

test('自动拉取：开关关着不动；开着先拉上一周再拉上个月，拉过的不再拉；服务重启把中断的标为失败', async t => {
  const db = database(t), api = fakeApi(), voice = voiceFor(db, api);
  assert.equal(voice.tick(), null);
  assert.equal(api.calls.length, 0);
  saveSetting(db, 'internal_voice_auto', '1');
  await voice.tick().done;
  await voice.tick().done;
  assert.equal(voice.tick(), null);
  const runs = voice.status().runs.map(r => [r.trigger, r.from, r.to, r.state]);
  assert.deepEqual(runs, [['monthly', '2026-10-01', '2026-10-31', 'done'], ['weekly', '2026-11-02', '2026-11-08', 'done']]);
  assert.deepEqual(voice.status().schedule.map(s => s.pulled), [true, true]);
  db.prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('manual','2026-11-01','2026-11-02','running','x')").run();
  voiceFor(db, api);
  assert.equal(db.prepare("SELECT state FROM chat_pull_runs WHERE range_from='2026-11-01'").get().state, 'failed');
});

test('接口：状态、预览、确认走同源路由，错误带 code', async t => {
  const db = database(t), api = fakeApi();
  const all = routes(db, { fetchImpl: api.fetchImpl, token: () => TOKEN, now: () => NOW, wait: async () => {} });
  async function invoke(method, endpoint, payload) {
    const found = match(all, method, endpoint); assert.ok(found, endpoint);
    let status, text; const req = Readable.from(payload ? [Buffer.from(JSON.stringify(payload))] : []), res = { setHeader() {}, writeHead(code) { status = code; }, end(v) { text = v; } };
    req.method = method; req.url = endpoint; req.headers = { 'content-type': 'application/json' };
    await found.handler(req, res, { params: found.params, url: new URL(endpoint, 'http://127.0.0.1') });
    return { status, body: JSON.parse(text) };
  }
  const s = await invoke('GET', '/api/v3/internal-voice/status');
  assert.equal(s.status, 200);
  assert.deepEqual([s.body.auto, s.body.tokenConfigured, s.body.stored.messages], [false, true, 0]);
  assert.ok(!JSON.stringify(s.body).includes(TOKEN));
  const bad = await invoke('POST', '/api/v3/internal-voice/pull/preview', { from: '2026-11-08', to: '2026-11-02' });
  assert.deepEqual([bad.status, bad.body.code], [400, 'RANGE_INVALID']);
  const p = await invoke('POST', '/api/v3/internal-voice/pull/preview', { from: '2026-11-02', to: '2026-11-08' });
  const c = await invoke('POST', '/api/v3/internal-voice/pull/confirm', { previewId: p.body.previewId });
  assert.equal(c.status, 200);
  assert.ok(c.body.runId);
  // 拉取在后台跑：等它结束再收尾（不然关库后它还在写）
  for (let i = 0; i < 100 && (await invoke('GET', '/api/v3/internal-voice/status')).body.runs[0].state === 'running'; i++) await new Promise(r => setTimeout(r, 10));
  assert.equal((await invoke('GET', '/api/v3/internal-voice/status')).body.runs[0].state, 'done');
});

// 多页场景（#49 审查补测）：员工 130 人（按 limit 分 2 页）、一个销售 150 个客户会话（120 个在范围内，跨页才遇到更早的）、
// 一个会话 600 条消息（消息 2 页）；可选在第 1 页读过后把第 2 页的一个会话挪到最前（来了新消息）。
function bigApi({ reorder = false, unauthorizedAfter = Infinity } = {}) {
  const pad = n => String(n).padStart(3, '0');
  const many = Array.from({ length: 130 }, (_, i) => ({ userid: `s${pad(i)}`, name: `销售${i}`, department_name: i === 129 ? '大学销售企微-小王组' : '产品运营部', has_conversation: true }));
  let convs = Array.from({ length: 150 }, (_, i) => ({ id: `cv${pad(i)}`, external_userid: `wm${i}`, external_name: `学生${i}`, staff_remark: '', last_msg_time: i < 120 ? `2026-11-08 ${pad(i).slice(1)}:00:00`.replace(/ (\d\d):/, (m, h) => ` ${String(23 - Math.floor(i / 6)).padStart(2, '0')}:`) : '2026-10-01 00:00:00' }));
  const msgs = id => id === 'cv000' ? Array.from({ length: 600 }, (_, k) => ({ msg_id: `${id}-${k}`, msg_time: `2026-11-05 10:${String(Math.floor(k / 60)).padStart(2, '0')}:${String(k % 60).padStart(2, '0')}`, msg_type: 'text', from: 'wm', from_role: { value: 1 }, msg_content: `第${k}条` }))
    : [{ msg_id: `${id}-only`, msg_time: '2026-11-05 09:00:00', msg_type: 'text', from: 'wm', from_role: { value: 1 }, msg_content: '你好' }];
  let calls = 0, firstPageRead = false;
  const page = (all, q, key = 'size') => { const size = Number(q.get(key) || 10), p = Number(q.get('page') || 1); return { items: all.slice((p - 1) * size, p * size), total: all.length, total_page: Math.max(1, Math.ceil(all.length / size)) }; };
  const fetchImpl = async url => {
    const u = new URL(url), q = u.searchParams, ok = data => ({ status: 200, json: async () => ({ status: 'success', data }) });
    if (++calls > unauthorizedAfter) return { status: 401, json: async () => ({}) };
    if (u.pathname === '/api/staff/list') return ok(page(many, q, 'limit'));
    if (u.pathname.endsWith('/room/conversation/list')) return ok(page([], q));
    if (u.pathname.endsWith('/customer/conversation/list')) {
      const result = ok(page(convs, q));
      if (reorder && q.get('page') === '1' && !firstPageRead) { firstPageRead = true; const moved = { ...convs[110], id: 'cv-moved', last_msg_time: '2026-11-10 09:00:00' }; convs = [moved, ...convs.filter((_, i) => i !== 110)]; }
      return result;
    }
    if (u.pathname === '/api/chats/by/conversation/message/list') return ok(page(msgs(q.get('conversation_id')).reverse(), q));
    return { status: 404, json: async () => ({}) };
  };
  return { fetchImpl, calls: () => calls };
}

test('多页：员工按 limit 翻页、会话列表跨页遇到更早的才停、消息多页拉全', async t => {
  const db = database(t), voice = voiceFor(db, bigApi());
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  const run = voice.status().runs[0];
  assert.equal(run.state, 'done');
  assert.equal(run.stats.staff, 1, '第 2 页最后一个员工也筛到');
  assert.equal(run.stats.singles, 120);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE conversation_id='cv000'").get().n, 600);
});

test('翻页期间会话来了新消息跳到第 1 页：翻完重读第 1 页补上', async t => {
  const db = database(t), voice = voiceFor(db, bigApi({ reorder: true }));
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  assert.ok(db.prepare("SELECT 1 FROM chat_conversations WHERE id='cv-moved'").get(), '挪到最前的会话没有漏');
});

test('中途 token 失效：整次记 failed 且不被后续进度改回 running，其余任务不再取新会话', async t => {
  const db = database(t), api = bigApi({ unauthorizedAfter: 20 }), voice = voiceFor(db, api);
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  const run = voice.status().runs[0];
  assert.equal(run.state, 'failed');
  assert.match(run.error, /token/);
  assert.ok(api.calls() < 30, `失败后很快停下（实际 ${api.calls()} 次请求）`);
});

test('自动拉取遇到 partial：下次 tick 重拉同一周补齐', async t => {
  const db = database(t);
  saveSetting(db, 'internal_voice_auto', '1');
  const flaky = voiceFor(db, fakeApi({ failAlways: new Set(['c2']) }));
  await flaky.tick().done;
  assert.equal(flaky.status().runs[0].state, 'partial');
  assert.deepEqual(flaky.status().schedule[0].pulled, false);
  const healthy = voiceFor(db, fakeApi());
  const next = healthy.tick();
  assert.ok(next, 'partial 不算拉过');
  await next.done;
  assert.deepEqual([healthy.status().runs[0].trigger, healthy.status().runs[0].state], ['weekly', 'done']);
  assert.ok(db.prepare("SELECT 1 FROM chat_messages WHERE msg_id='m6'").get(), '上次没拉到的会话补上了');
});
