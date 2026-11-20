import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { openDb, saveSetting, voiceDbFor } from '../server/db.mjs';
import { createInternalVoice, lastWeek, lastMonth, checkRange, contentOf, lineOf } from '../server/internal-voice.mjs';
import { match, unmatched } from '../server/http.mjs';
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
  const ids = voiceDbFor(db).prepare('SELECT msg_id FROM chat_messages ORDER BY msg_id').all().map(r => r.msg_id);
  assert.deepEqual(ids, ['g-m1', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']);
  assert.ok(!ids.includes('g-m2'), '群里员工的话不存');
  assert.ok(!ids.includes('m-shensu'), '申诉部门不拉');
  assert.ok(!api.calls.some(c => c.includes('u-shensu') || c.includes('u-ops') || c.includes('u-idle')), '不该拉的员工不发请求');
  assert.ok(!api.calls.some(c => c.includes('c-old')), '列表里早于开始日期的会话不拉消息');
  assert.equal(api.calls.filter(c => c.includes('group_chat_id=g1')).length, 1, '两个销售都在的群只拉一次');
  const m3 = voiceDbFor(db).prepare('SELECT * FROM chat_messages WHERE msg_id=?').get('m3');
  assert.equal(m3.content, '');
  assert.equal(m3.file_url, 'https://x.lumiclass.com/api/chats/media/file?msg_id=m3');
  assert.equal(voiceDbFor(db).prepare('SELECT msg_time FROM chat_messages WHERE msg_id=?').get('m6').msg_time, '2026-11-08 23:59:59', '结束日当天 23:59:59 也拉到');
  const c1 = voiceDbFor(db).prepare('SELECT * FROM chat_conversations WHERE id=?').get('c1');
  assert.deepEqual([c1.kind, c1.staff_dept, c1.customer_name, c1.customer_remark], ['single', '大学销售企微-小王组', '学生一', '学生一-澳洲']);
  assert.equal(voiceDbFor(db).prepare('SELECT kind FROM chat_conversations WHERE id=?').get('g1').kind, 'group');
  const dump = JSON.stringify(voiceDbFor(db).prepare('SELECT * FROM chat_messages').all()) + JSON.stringify(voiceDbFor(db).prepare('SELECT * FROM chat_pull_runs').all());
  assert.ok(!dump.includes(TOKEN), 'token 不进库');
  // 再拉一次：一条都不新增
  const again = voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' });
  await again.done;
  assert.equal(voice.status().runs[0].stats.messages, 0);
  assert.equal(voiceDbFor(db).prepare('SELECT COUNT(*) n FROM chat_messages').get().n, 7);
});

test('单个会话重试 3 次仍失败记 partial，其余照常；偶发失败重试后成功', async t => {
  const db = database(t), voice = voiceFor(db, fakeApi({ failAlways: new Set(['c2']), failOnce: new Set(['c1']) }));
  const { done } = voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' });
  await done;
  const run = voice.status().runs[0];
  assert.equal(run.state, 'partial');
  assert.equal(run.stats.conversationsFailed, 1);
  assert.match(run.error, /1 个会话/);
  assert.ok(voiceDbFor(db).prepare("SELECT 1 FROM chat_messages WHERE msg_id='m1'").get(), 'c1 第二次重试成功');
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
  assert.equal(voiceDbFor(db).prepare('SELECT COUNT(*) n FROM chat_pull_runs').get().n, 0);
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
  voiceDbFor(db).prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('manual','2026-11-01','2026-11-02','running','x')").run();
  voiceFor(db, api);
  assert.equal(voiceDbFor(db).prepare("SELECT state FROM chat_pull_runs WHERE range_from='2026-11-01'").get().state, 'failed');
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
  assert.equal(voiceDbFor(db).prepare("SELECT COUNT(*) n FROM chat_messages WHERE conversation_id='cv000'").get().n, 600);
});

test('翻页期间会话来了新消息跳到第 1 页：翻完重读第 1 页补上', async t => {
  const db = database(t), voice = voiceFor(db, bigApi({ reorder: true }));
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  assert.ok(voiceDbFor(db).prepare("SELECT 1 FROM chat_conversations WHERE id='cv-moved'").get(), '挪到最前的会话没有漏');
});

test('中途 token 失效：整次记 failed 且不被后续进度改回 running，其余任务不再取新会话', async t => {
  const db = database(t), api = bigApi({ unauthorizedAfter: 20 }), voice = voiceFor(db, api);
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  const run = voice.status().runs[0];
  assert.equal(run.state, 'failed');
  assert.match(run.error, /token/);
  assert.ok(api.calls() < 30, `失败后很快停下（实际 ${api.calls()} 次请求）`);
});

test('自动拉取遇到 partial：先让未尝试的月窗口执行，再重拉同一周补齐', async t => {
  const db = database(t);
  saveSetting(db, 'internal_voice_auto', '1');
  const flaky = voiceFor(db, fakeApi({ failAlways: new Set(['c2']) }));
  await flaky.tick().done;
  assert.equal(flaky.status().runs[0].state, 'partial');
  assert.deepEqual(flaky.status().schedule[0].pulled, false);
  const healthy = voiceFor(db, fakeApi());
  await healthy.tick().done; // 月窗口不能被失败的周窗口饿死
  const next = healthy.tick();
  assert.ok(next, 'partial 不算拉过');
  await next.done;
  assert.deepEqual([healthy.status().runs[0].trigger, healthy.status().runs[0].state], ['weekly', 'done']);
  assert.ok(voiceDbFor(db).prepare("SELECT 1 FROM chat_messages WHERE msg_id='m6'").get(), '上次没拉到的会话补上了');
});

test('没匹配上的 /api/v3/* 回 501 写在路由表外：内部原声接口不会被抢走，和注册顺序无关（L-20、#73）', async t => {
  const db = database(t);
  const all = routes(db, { fetchImpl: fakeApi().fetchImpl, token: () => TOKEN, now: () => NOW });
  assert.ok(match(all, 'GET', '/api/v3/internal-voice/status'), '内部原声接口在路由表里');
  const reply = (method, pathname) => { let status, body; unmatched(method, pathname)({}, { writeHead: s => status = s, end: v => body = JSON.parse(v) }); return { status, body }; };
  assert.deepEqual(reply('GET', '/api/v3/not-implemented-yet'), { status: 501, body: { error: '未实现，见 docs/tasks/V3-接口清单.md', task: 'V3-接口清单' } });
  assert.equal(reply('GET', '/api/v3/').status, 404);
  assert.equal(reply('OPTIONS', '/api/v3/not-implemented-yet').status, 404);
  assert.equal(reply('GET', '/api/plans-typo').status, 404);
});

test('自动补拉跨周、跨月遗留的 partial / failed，不重拉已有 done 的窗口，不自动重放手动范围', async t => {
  const db = database(t);
  saveSetting(db, 'internal_voice_auto', '1');
  const seed = voiceDbFor(db).prepare('INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES (?,?,?,?,?)');
  seed.run('weekly', '2026-10-19', '2026-10-25', 'failed', '2026-10-26T00:00:00Z');
  seed.run('monthly', '2026-10-01', '2026-10-31', 'partial', '2026-11-01T00:00:00Z');
  seed.run('weekly', '2026-10-12', '2026-10-18', 'failed', '2026-10-19T00:00:00Z');
  seed.run('weekly', '2026-10-12', '2026-10-18', 'done', '2026-10-20T00:00:00Z');
  seed.run('manual', '2026-10-02', '2026-10-03', 'failed', '2026-10-04T00:00:00Z');
  const voice = voiceFor(db, fakeApi(), { now: () => Date.parse('2026-12-01T10:00:00+08:00') });
  const retried = [];
  for (let i = 0; i < 5; i++) {
    const job = voice.tick();
    if (!job) break;
    await job.done;
    const r = voice.status().runs.find(r => r.id === job.runId);
    retried.push([r.trigger, r.from, r.to, r.state]);
  }
  assert.ok(retried.some(r => r.join() === 'weekly,2026-10-19,2026-10-25,done'), JSON.stringify(retried));
  assert.ok(retried.some(r => r.join() === 'monthly,2026-10-01,2026-10-31,done'), JSON.stringify(retried));
  assert.equal(retried.length, 4, '两个当前窗口、两个历史失败窗口');
  assert.equal(voice.tick(), null);
});

test('周窗口持续失败时月窗口仍能执行，月窗口持续失败时历史周窗口仍能重试', async t => {
  const db = database(t);
  saveSetting(db, 'internal_voice_auto', '1');
  const voice = voiceFor(db, fakeApi({ status: 401 }));
  const triggers = [];
  for (let i = 0; i < 4; i++) {
    const job = voice.tick();
    assert.ok(job);
    await job.done;
    triggers.push(voice.status().runs.find(r => r.id === job.runId).trigger);
  }
  assert.deepEqual(triggers, ['weekly', 'monthly', 'weekly', 'monthly']);
});

test('收尾 done 和 failed 连续写库失败后，同一服务实例在库恢复时核对状态并自动补拉', async t => {
  const db = database(t);
  saveSetting(db, 'internal_voice_auto', '1');
  voiceDbFor(db).prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('monthly','2026-10-01','2026-10-31','done','x')").run();
  voiceDbFor(db).exec(`CREATE TABLE fault_switch (enabled INTEGER); INSERT INTO fault_switch VALUES (1);
    CREATE TRIGGER fail_finish BEFORE UPDATE OF state ON chat_pull_runs
    WHEN NEW.state != 'running' AND (SELECT enabled FROM fault_switch)=1
    BEGIN SELECT RAISE(ABORT, 'synthetic finish failure'); END;`);
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  const voice = voiceFor(db, fakeApi());
  const job = voice.tick();
  await job.done;
  assert.equal(voiceDbFor(db).prepare('SELECT state FROM chat_pull_runs WHERE id=?').get(job.runId).state, 'running', '两个收尾写入确实均失败');
  assert.ok(errors.length > 0, '故障有明确日志');
  assert.equal(voice.status().schedule[0].pulled, false, '已结束但未写回的 running 不算覆盖');
  const before = voice.status().stored.messages;
  assert.ok(before > 0, '消息已提交');
  assert.equal(voice.tick(), null, '库未恢复时不启动新拉取');
  voiceDbFor(db).exec('UPDATE fault_switch SET enabled=0');
  const retry = voice.tick();
  assert.ok(retry, '无需重启即可补拉');
  await retry.done;
  const runs = voice.status().runs;
  assert.equal(runs.find(r => r.id === job.runId).state, 'failed', '悬空 running 已核对为失败');
  assert.equal(runs.find(r => r.id === retry.runId).state, 'done');
  assert.equal(voice.status().stored.messages, before, '已提交消息重拉不重复');
});

// 在假接口边界篡改单个响应，覆盖所有分页入口（包括会话第一页补扫）。
function changedApi(change) {
  const api = fakeApi();
  return { fetchImpl: async (...args) => {
    const res = await api.fetchImpl(...args), body = structuredClone(await res.json());
    change(new URL(args[0]), body);
    return { ...res, json: async () => body };
  } };
}

for (const [name, change] of [
  ['员工列表缺少 items', (u, b) => { if (u.pathname === '/api/staff/list') delete b.data.items; }],
  ['会话列表缺少 total_page', (u, b) => { if (u.pathname.endsWith('/customer/conversation/list')) delete b.data.total_page; }],
  ['消息总数超过当前一页却缺少 total_page', (u, b) => { if (u.searchParams.get('conversation_id') === 'c1') { b.data.total = 501; delete b.data.total_page; } }],
  ['消息页码不符', (u, b) => { if (u.searchParams.get('conversation_id') === 'c1') b.data.page = 2; }],
  ['消息总页数不合法', (u, b) => { if (u.searchParams.get('conversation_id') === 'c1') b.data.total_page = -1; }],
  ['消息总数与页内容不符', (u, b) => { if (u.searchParams.get('conversation_id') === 'c1') b.data.items.pop(); }],
  ['消息 items 为非数组', (u, b) => { if (u.searchParams.get('conversation_id') === 'c1') b.data.items = {}; }],
]) {
  test(`异常分页不能记为完整成功：${name}`, async t => {
    const db = database(t), voice = voiceFor(db, changedApi(change));
    await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
    assert.ok(['partial', 'failed'].includes(voice.status().runs[0].state), JSON.stringify(voice.status().runs[0]));
  });
}

for (const [name, change] of [
  ['缺少 msg_id', m => { delete m.msg_id; }],
  ['缺少 msg_time', m => { delete m.msg_time; }],
  ['缺少 msg_type', m => { delete m.msg_type; }],
  ['缺少 from_role', m => { delete m.from_role; }],
  ['msg_id 为对象', m => { m.msg_id = {}; }],
  ['日期不存在', m => { m.msg_time = '2026-11-31 10:00:00'; }],
  ['时间超出 24 小时', m => { m.msg_time = '2026-11-03 25:00:00'; }],
  ['日期早于预览范围', m => { m.msg_time = '2026-10-01 10:00:00'; }],
  ['日期晚于预览范围', m => { m.msg_time = '2026-11-09 00:00:00'; }],
  ['不支持的时区格式', m => { m.msg_time = '2026-11-03T10:00:00Z'; }],
]) {
  test(`异常消息不能静默跳过或超范围入库：${name}`, async t => {
    const db = database(t), voice = voiceFor(db, changedApi((u, b) => {
      if (u.searchParams.get('conversation_id') === 'c1') change(b.data.items[0]);
    }));
    await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
    const status = voice.status();
    assert.equal(status.runs[0].state, 'partial');
    assert.equal(status.runs[0].stats.conversationsFailed, 1);
    assert.equal(voiceDbFor(db).prepare("SELECT COUNT(*) n FROM chat_messages WHERE conversation_id='c1'").get().n, 0, '整个异常会话待补拉，不存不完整消息');
    assert.ok(status.stored.earliest >= '2026-11-02 00:00:00');
    assert.ok(status.stored.latest <= '2026-11-08 23:59:59');
  });
}

test('合法空列表允许零页或一页；合法消息接受北京时间小数秒与 T 分隔，保留两端日期边界', async t => {
  for (const total_page of [0, 1]) {
    const db = database(t), voice = voiceFor(db, { fetchImpl: async () => ({ status: 200, json: async () => ({ status: 'success', data: { items: [], total: 0, total_page } }) }) });
    await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
    assert.equal(voice.status().runs[0].state, 'done', `空列表 total_page=${total_page}`);
    assert.equal(voice.status().stored.messages, 0);
  }
  const db = database(t), voice = voiceFor(db, changedApi((u, b) => {
    if (u.searchParams.get('conversation_id') === 'c1') {
      b.data.items[0].msg_time = '2026-11-02T00:00:00.001';
      b.data.items[1].msg_time = '2026-11-08 23:59:59.999';
    }
  }));
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  assert.equal(voice.status().runs[0].state, 'done');
  assert.equal(voice.status().stored.earliest, '2026-11-02 00:00:00');
  assert.equal(voice.status().stored.latest, '2026-11-08 23:59:59');
});

test('会话第一页补扫也校验响应结构，群消息先校验再过滤角色', async t => {
  let reads = 0;
  const db = database(t), voice = voiceFor(db, changedApi((u, b) => {
    if (u.pathname.endsWith('/customer/conversation/list') && u.searchParams.get('staff_userid') === 'u-daxue' && ++reads === 2) delete b.data.items;
  }));
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  assert.equal(voice.status().runs[0].state, 'failed');
  const groupDb = database(t), groupVoice = voiceFor(groupDb, changedApi((u, b) => {
    if (u.searchParams.get('group_chat_id') === 'g1') delete b.data.items[0].from_role;
  }));
  await groupVoice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  assert.equal(groupVoice.status().runs[0].state, 'partial');
  assert.equal(voiceDbFor(groupDb).prepare("SELECT COUNT(*) n FROM chat_messages WHERE kind='group'").get().n, 0);
});

test('消息分页第二页缺失或页间总数变化时，会话整体留待补拉', async t => {
  for (const change of [d => { delete d.items; }, d => { d.total++; }]) {
    const db = database(t), api = bigApi(), voice = voiceFor(db, { fetchImpl: async (...args) => {
      const res = await api.fetchImpl(...args), b = await res.json(), u = new URL(args[0]);
      if (u.searchParams.get('conversation_id') === 'cv000' && u.searchParams.get('page') === '2') change(b.data);
      return { ...res, json: async () => b };
    } });
    await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
    assert.equal(voice.status().runs[0].state, 'partial');
    assert.equal(voiceDbFor(db).prepare("SELECT COUNT(*) n FROM chat_messages WHERE conversation_id='cv000'").get().n, 0);
  }
});

test('resetInterrupted=false 不回收其他实例的 running；本实例真正运行时 tick 不重入', async t => {
  const db = database(t);
  saveSetting(db, 'internal_voice_auto', '1');
  voiceDbFor(db).prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('weekly','2026-11-02','2026-11-08','running','x')").run();
  voiceDbFor(db).prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('monthly','2026-10-01','2026-10-31','done','x')").run();
  const voice = voiceFor(db, fakeApi(), { resetInterrupted: false });
  assert.equal(voice.tick(), null);
  assert.equal(voice.status().schedule[0].pulled, true);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const api = fakeApi(), active = voiceFor(db, { fetchImpl: async (...args) => { await held; return api.fetchImpl(...args); } }, { resetInterrupted: false });
  const job = active.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' });
  assert.equal(active.tick(), null);
  assert.throws(() => active.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }), e => e.code === 'PULL_RUNNING');
  release();
  await job.done;
  assert.equal(voiceDbFor(db).prepare('SELECT state FROM chat_pull_runs WHERE id=1').get().state, 'running');
});

// 交叉审查返修：通过 start / tick / status 观察不完整响应的失败与恢复，不连真实接口。
for (const [name, pathEnd, field, value] of [
  ['员工缺部门', '/staff/list', 'department_name', undefined],
  ['员工缺会话标志', '/staff/list', 'has_conversation', undefined],
  ['员工缺标识', '/staff/list', 'userid', undefined],
  ['员工部门为对象', '/staff/list', 'department_name', {}],
  ['员工会话标志为字符串', '/staff/list', 'has_conversation', 'false'],
  ['员工标识为对象', '/staff/list', 'userid', {}],
  ...['customer', 'room'].flatMap(kind => [
    [`${kind}缺最近消息时间`, `/${kind}/conversation/list`, 'last_msg_time', undefined],
    [`${kind}最近消息日期不存在`, `/${kind}/conversation/list`, 'last_msg_time', '2026-02-30 10:00:00'],
    [`${kind}最近消息月份无效`, `/${kind}/conversation/list`, 'last_msg_time', '2026-99-01 10:00:00'],
    [`${kind}最近消息小时无效`, `/${kind}/conversation/list`, 'last_msg_time', '2026-11-06 25:00:00'],
    [`${kind}最近消息时间为数字`, `/${kind}/conversation/list`, 'last_msg_time', 1],
    [`${kind}缺标识`, `/${kind}/conversation/list`, kind === 'customer' ? 'id' : 'chat_id', undefined],
  ]),
]) {
  test(`[XR1] 列表记录先校验再筛选：${name}`, async t => {
    const db = database(t);
    saveSetting(db, 'internal_voice_auto', '1');
    voiceDbFor(db).prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('monthly','2026-10-01','2026-10-31','done','x')").run();
    let corrupt = true;
    const voice = voiceFor(db, changedApi((u, b) => {
      if (corrupt && u.pathname.endsWith(pathEnd) && b.data.items.length) {
        if (value === undefined) delete b.data.items[0][field];
        else b.data.items[0][field] = value;
      }
    }));
    const first = voice.tick();
    await first.done;
    const status = voice.status();
    assert.equal(status.runs.find(r => r.id === first.runId).state, 'failed');
    assert.equal(status.schedule[0].pulled, false, '异常列表不能把窗口标为已完成');
    assert.equal(status.stored.messages, 0, '列表未核验完整前不拉消息');
    corrupt = false;
    const retry = voice.tick();
    assert.ok(retry, '窗口保留补拉资格');
    await retry.done;
    assert.equal(voice.status().runs[0].state, 'done');
    assert.equal(voice.status().stored.messages, 7);
  });
}

test('[XR1] 第一页补扫的记录也必须校验，不能把缺失时间当旧会话', async t => {
  let reads = 0;
  const db = database(t), voice = voiceFor(db, changedApi((u, b) => {
    if (u.pathname.endsWith('/customer/conversation/list') && u.searchParams.get('staff_userid') === 'u-daxue' && ++reads === 2)
      delete b.data.items[0].last_msg_time;
  }));
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  assert.equal(voice.status().runs[0].state, 'failed');
  assert.equal(voice.status().stored.messages, 0);
});

for (const duplicate of ['页内', '跨页']) {
  test(`[XR2] 消息${duplicate}重复不能用条数掩盖缺口，正常补拉按响应唯一数核验`, async t => {
    const db = database(t), api = bigApi();
    saveSetting(db, 'internal_voice_auto', '1');
    voiceDbFor(db).prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('monthly','2026-10-01','2026-10-31','done','x')").run();
    let corrupt = true, firstPage;
    const voice = voiceFor(db, { fetchImpl: async (...args) => {
      const res = await api.fetchImpl(...args), b = structuredClone(await res.json()), u = new URL(args[0]);
      if (corrupt && u.searchParams.get('conversation_id') === 'cv000') {
        if (u.searchParams.get('page') === '1') {
          firstPage = structuredClone(b.data.items);
          if (duplicate === '页内') b.data.items[1] = structuredClone(b.data.items[0]);
        } else if (duplicate === '跨页') b.data.items = firstPage.slice(0, 100);
      }
      return { ...res, json: async () => b };
    } });
    const first = voice.tick();
    await first.done;
    const status = voice.status();
    assert.equal(status.runs[0].state, 'partial');
    assert.equal(status.runs[0].stats.conversationsFailed, 1);
    assert.equal(status.schedule[0].pulled, false);
    assert.equal(voiceDbFor(db).prepare("SELECT COUNT(*) n FROM chat_messages WHERE conversation_id='cv000'").get().n, 0, '有重复的会话整批不入库');
    assert.equal(status.stored.messages, 119, '其余会话保留');
    corrupt = false;
    const retry = voice.tick();
    assert.ok(retry);
    await retry.done;
    assert.equal(voice.status().runs[0].state, 'done');
    assert.equal(voice.status().stored.messages, 719);
    assert.equal(voice.status().runs[0].stats.messages, 600, '已存的 119 条不是本次新增，仍能核验完整');
    await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
    assert.equal(voice.status().runs[0].state, 'done', '完整重复拉取仍成功');
    assert.equal(voice.status().runs[0].stats.messages, 0);
    assert.equal(voice.status().stored.messages, 719);
  });
}

test('[XR2] 群聊中会被过滤的员工消息重复也要使会话待补拉', async t => {
  const db = database(t), voice = voiceFor(db, changedApi((u, b) => {
    if (u.searchParams.get('group_chat_id') === 'g1') b.data.items[1] = structuredClone(b.data.items[0]);
  }));
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  assert.equal(voice.status().runs[0].state, 'partial');
  assert.equal(voice.status().runs[0].stats.conversationsFailed, 1);
  assert.equal(voiceDbFor(db).prepare("SELECT COUNT(*) n FROM chat_messages WHERE kind='group'").get().n, 0);
});

for (const [name, msgId, role] of [
  ['员工角色为布尔值对象', 'g-m2', { value: true }],
  ['员工角色为裸布尔值', 'g-m2', true],
  ['员工角色为数组对象', 'g-m2', { value: [1] }],
  ['员工角色为裸数组', 'g-m2', [1]],
  ['客户角色为未知枚举对象', 'g-m1', { value: 999 }],
  ['客户角色为未知枚举', 'g-m1', 999],
  ['客户角色为未知字符串枚举', 'g-m1', { value: '999' }],
  ['客户角色为负数', 'g-m1', -1],
]) {
  test(`[XR3] 角色必须先验原始类型和枚举：${name}`, async t => {
    const db = database(t);
    saveSetting(db, 'internal_voice_auto', '1');
    voiceDbFor(db).prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('monthly','2026-10-01','2026-10-31','done','x')").run();
    let corrupt = true;
    const voice = voiceFor(db, changedApi((u, b) => {
      if (corrupt && u.searchParams.get('group_chat_id') === 'g1') b.data.items.find(m => m.msg_id === msgId).from_role = role;
    }));
    await voice.tick().done;
    const status = voice.status();
    assert.equal(status.runs[0].state, 'partial');
    assert.equal(status.runs[0].stats.conversationsFailed, 1);
    assert.equal(status.schedule[0].pulled, false);
    assert.equal(voiceDbFor(db).prepare("SELECT COUNT(*) n FROM chat_messages WHERE kind='group'").get().n, 0, '不猜角色，不部分入库');
    corrupt = false;
    const retry = voice.tick();
    assert.ok(retry);
    await retry.done;
    assert.equal(voice.status().runs[0].state, 'done');
    assert.equal(voice.status().stored.messages, 7);
    assert.equal(voiceDbFor(db).prepare("SELECT COUNT(*) n FROM chat_messages WHERE msg_id='g-m2'").get().n, 0, '员工群消息不能当客户入库');
  });
}

test('[XR3] 兼容明确的数字和数字字符串角色，保留单聊员工与群聊客户筛选', async t => {
  for (const wrap of [n => n, n => String(n), n => ({ value: String(n) })]) {
    const db = database(t), voice = voiceFor(db, changedApi((u, b) => {
      if (u.pathname.endsWith('/message/list')) for (const m of b.data.items) m.from_role = wrap(m.from_role.value);
    }));
    await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
    assert.equal(voice.status().runs[0].state, 'done');
    assert.equal(voice.status().stored.messages, 7);
    assert.equal(voiceDbFor(db).prepare("SELECT from_role FROM chat_messages WHERE msg_id='m2'").get().from_role, 2);
    assert.equal(voiceDbFor(db).prepare("SELECT COUNT(*) n FROM chat_messages WHERE msg_id='g-m2'").get().n, 0);
  }
});

for (const target of ['员工列表', '单聊消息']) {
  test(`[XR4] HTTP 500 即使正文完整且声明 success，${target}也只有限重试并保留补拉`, async t => {
    const db = database(t), api = fakeApi(), waits = [];
    saveSetting(db, 'internal_voice_auto', '1');
    voiceDbFor(db).prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('monthly','2026-10-01','2026-10-31','done','x')").run();
    let attempts = 0;
    const voice = voiceFor(db, { fetchImpl: async (...args) => {
      const res = await api.fetchImpl(...args), u = new URL(args[0]);
      if (target === '员工列表' ? u.pathname === '/api/staff/list' : u.searchParams.get('conversation_id') === 'c1') {
        attempts++;
        return { ...res, status: 500 }; // json() 仍是结构合法的成功正文
      }
      return res;
    } }, { wait: async ms => waits.push(ms) });
    await voice.tick().done;
    assert.equal(voice.status().runs[0].state, target === '员工列表' ? 'failed' : 'partial');
    assert.equal(voice.status().schedule[0].pulled, false);
    assert.equal(attempts, 3, '最多三次尝试');
    assert.deepEqual(waits, [1000, 2000]);
    if (target === '员工列表') assert.equal(voice.status().stored.messages, 0);
    else assert.equal(voiceDbFor(db).prepare("SELECT COUNT(*) n FROM chat_messages WHERE conversation_id='c1'").get().n, 0);
  });
}

test('[XR4] HTTP 429 搭配 success 正文不能提前成功，有限重试后 200 才完成', async t => {
  const db = database(t), api = fakeApi(), waits = [];
  let attempts = 0;
  const voice = voiceFor(db, { fetchImpl: async (...args) => {
    const res = await api.fetchImpl(...args);
    if (new URL(args[0]).pathname === '/api/staff/list' && ++attempts < 3) return { ...res, status: 429 };
    return res;
  } }, { wait: async ms => waits.push(ms) });
  await voice.start({ from: '2026-11-02', to: '2026-11-08', trigger: 'manual' }).done;
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [1000, 2000]);
  assert.equal(voice.status().runs[0].state, 'done');
  assert.equal(voice.status().stored.messages, 7);
});
