import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { getSettings, openDb, saveSetting } from '../server/db.mjs';
import { getRecord, putRecord } from '../server/local-records.mjs';
import { PATH_KIND, STAGE_KIND, createMentorPathService, derivePath, pathFromPlan, validatePath } from '../server/mentor-path.mjs';
import { mentorConfig } from '../server/mentor.mjs';
import { validateV3Setting } from '../server/v3-settings.mjs';
import { dayIndex, isWorkday, missingYears, workdays } from '../server/workdays.mjs';
import { projectRoutes } from '../server/routes/projects.mjs';
import { match } from '../server/http.mjs';

const START = '2026-05-12';
const stage = (p, id) => p.lines.flatMap(l => l.stages).find(s => s.id === id);

function fixture(t, now = () => Date.parse('2026-10-26T02:00:00Z')) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'mentor-path-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, db, service: createMentorPathService(db, { now }) };
}
// 走生产路由的参数解析、请求体读取与错误响应
async function invoke(routes, method, endpoint, body) {
  const found = match(routes, method, new URL(endpoint, 'http://127.0.0.1').pathname);
  assert.ok(found, `${method} ${endpoint} 必须匹配真实路由`);
  let status, output;
  await found.handler(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), { writeHead: s => (status = s), end: v => (output = v) }, { params: found.params });
  return { status, body: JSON.parse(output) };
}
const withPath = (f, name = '林瑶') => f.service.importConfirm(name, f.service.importPreview(name, { start: START }).previewId);

test('工作日历：周末和 2026 法定节假日不算，调休上班日算；D1 = 入职日，V2.4 排到 D65 = 08-11', () => {
  assert.equal(isWorkday('2026-06-19'), false, '端午');
  assert.equal(isWorkday('2026-09-20'), true, '国庆调休上班（周日）');
  assert.equal(isWorkday('2026-10-10'), true, '国庆调休上班（周六）');
  assert.equal(isWorkday('2026-10-05'), false);
  const d = workdays(START, 65);
  assert.deepEqual([d[0], d[13], d[23], d[43], d[63], d[64]], ['2026-05-12', '2026-05-29', '2026-06-12', '2026-07-13', '2026-08-10', '2026-08-11']);
  assert.equal(dayIndex(START, '2026-10-26'), 115);
  assert.equal(dayIndex(START, '2026-05-16'), 4, '周六算到它之前的周五');
  assert.equal(dayIndex(START, '2026-05-01'), 0, '入职前为 0');
  assert.deepEqual(missingYears('2026-11-02', '2027-02-01'), [2027]);
});

test('路径：从 V2.4 模板生成合格；常见错误给出具体原因', () => {
  const p = pathFromPlan('v2.4', START);
  assert.deepEqual(p.lines.map(l => l.stages.map(s => s.id).join(',')), ['P1,P2,P3,P4,P5,P6,P7,P8,P9,P10', 'T1,T2,T3,T4,T5,T6']);
  assert.deepEqual(p.lines[0].stages.filter(s => s.review).map(s => `${s.review}@D${s.d[1]}`), ['初轮筛选@D2', '二轮筛选@D14', '侧边栏 Demo 评审@D24', '首课项目结项@D44', '师资侧评审@D64', '结业答辩@D65']);
  assert.equal(stage(p, 'T6').with, 'P7');
  const bad = (edit, re) => { const x = structuredClone(p); edit(x); assert.throws(() => validatePath(x), e => e.status === 400 && re.test(e.message)); };
  bad(x => { stage(x, 'P3').d = [3, 4]; }, /P3：工作日须是 \[起, 止\].*排在上一段之后/);
  bad(x => { stage(x, 'P4').steps[0].d = [4, 5]; }, /「平台客服」的日期须在本段 D5–D11 之内/);
  bad(x => { delete stage(x, 'P5').pass; }, /P5：评审节点须写名称和合格标准/);
  bad(x => { stage(x, 'T2').with = 'T1'; }, /T2：同期业务阶段须是业务线上已有的段/);
  bad(x => { x.start = '2026-5-12'; }, /入职日须是 YYYY-MM-DD/);
  assert.throws(() => pathFromPlan('v9', START), e => e.status === 400);
});

test('推导：没有记录时两条线第一段在做，按今天算超期；评审通过或确认完成才算完成，限期复核仍在做', () => {
  const p = pathFromPlan('v2.4', START);
  let v = derivePath(p, {}, '2026-10-26');
  assert.deepEqual([v.days, v.end, v.todayD, v.calendar.length], [65, '2026-08-11', 115, 115]);
  assert.deepEqual([stage(v, 'P1').status, stage(v, 'P1').late, stage(v, 'P2').status, stage(v, 'T1').status], ['doing', 113, 'todo', 'doing']);
  assert.deepEqual(stage(v, 'P7').dates, ['2026-06-15', '2026-07-13']);
  assert.deepEqual(stage(v, 'P7').steps[1], { d: [31, 35], text: '报告方案设计', dates: ['2026-06-24', '2026-06-30'] }, '端午 06-19 不算');
  v = derivePath(p, { P1: { kind: 'review', score: 82, result: 'pass' }, P2: { kind: 'complete' }, P3: { kind: 'complete' }, P4: { kind: 'complete' }, P5: { kind: 'review', score: 64, result: 'retest' } }, '2026-05-29');
  assert.deepEqual(v.lines[0].stages.slice(0, 6).map(s => s.status), ['done', 'done', 'done', 'done', 'doing', 'todo']);
  assert.equal(stage(v, 'P5').record.result, 'retest');
  assert.equal(stage(v, 'P5').late, 0, '还没过计划结束日');
  assert.equal(derivePath(p, {}, '2026-05-01').todayD, 0);
});

test('接口：名单沿用带教来源，没有路径或旧版路径时 path 为 null（旧版标 legacy）；有路径时返回推导结果', async t => {
  const f = fixture(t), routes = projectRoutes({ mentorPath: f.service });
  putRecord(f.db, PATH_KIND, '胡贵兰', { season: { start: '2026-09-01', weeks: 24 }, lines: [], links: [] });
  withPath(f);
  const { status, body } = await invoke(routes, 'GET', '/api/v3/mentor/path');
  assert.equal(status, 200);
  assert.equal(body.today, '2026-10-26');
  assert.deepEqual(body.plans, [{ id: 'v2.4', name: '管培生培养路径 V2.4' }]);
  assert.deepEqual(body.trainees.map(x => [x.name, x.hasLog, Boolean(x.path), x.legacy ?? false]), [['林瑶', true, true, false], ['胡贵兰', true, false, true]]);
  assert.equal(body.trainees[0].path.todayD, 115);
});

test('添加带教对象：预览不写；确认时名单和路径一起写入并回读；没有日志链接的人不进带教答疑；重名 409', async t => {
  const f = fixture(t), routes = projectRoutes({ mentorPath: f.service });
  const req = { name: '王一', role: '管培生', start: '2026-11-02', plan: 'v2.4' };
  const pv = await invoke(routes, 'POST', '/api/v3/mentor/path/trainees/preview', req);
  assert.equal(pv.status, 200);
  assert.deepEqual(pv.body.entry, { name: '王一', role: '管培生', year: 2026 });
  assert.equal(pv.body.view.start, '2026-11-02');
  assert.deepEqual(pv.body.view.missingYears, [2027], '排到 2027 年，提示节假日没录');
  assert.equal(getRecord(f.db, PATH_KIND, '王一'), null);
  assert.equal(mentorConfig(getSettings(f.db)).length, 2);
  const ok = await invoke(routes, 'POST', '/api/v3/mentor/path/trainees', { previewId: pv.body.previewId, confirm: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, getRecord(f.db, PATH_KIND, '王一'));
  assert.deepEqual(mentorConfig(getSettings(f.db)).map(s => [s.name, s.url]), [['林瑶', 'https://vm94j8bzy7.feishu.cn/docx/GcwKdGzljozUeUxesWhctBQXnpe'], ['胡贵兰', 'https://vm94j8bzy7.feishu.cn/docx/FZfXdpxL9oKs6jxW1T7cVisdnIb'], ['王一', null]]);
  assert.deepEqual((await invoke(routes, 'POST', '/api/v3/mentor/path/trainees', { previewId: pv.body.previewId, confirm: true })).body, ok.body, '重复确认返回同一回执');
  assert.equal((await invoke(routes, 'POST', '/api/v3/mentor/path/trainees/preview', req)).status, 409);
  assert.equal((await invoke(routes, 'POST', '/api/v3/mentor/path/trainees/preview', { ...req, name: '李二', logUrl: 'https://example.com/x' })).status, 400);
  assert.equal((await invoke(routes, 'POST', '/api/v3/mentor/path/trainees/preview', { ...req, name: '' })).status, 400);
  // 预览之后别人抢先加了同名的人：确认 409，不重复写
  const p2 = f.service.addPreview({ ...req, name: '赵三' });
  saveSetting(f.db, 'mentor_sources', JSON.stringify([...mentorConfig(getSettings(f.db)).map(({ url, ...s }) => ({ ...s, ...(url && { url }) })), { name: '赵三', role: '管培生', year: 2026 }]));
  assert.throws(() => f.service.addConfirm({ previewId: p2.previewId, confirm: true }), e => e.status === 409);
});

test('设置：带教名单 1–20 人、日志链接可不填', () => {
  const v = JSON.parse(validateV3Setting('mentor_sources', JSON.stringify([{ name: '甲', year: 2026 }, { name: '乙', year: 2026, url: 'https://vm94j8bzy7.feishu.cn/docx/abc123' }])));
  assert.deepEqual(v, [{ name: '甲', role: '管培生', year: 2026 }, { name: '乙', role: '管培生', year: 2026, url: 'https://vm94j8bzy7.feishu.cn/docx/abc123' }]);
  assert.throws(() => validateV3Setting('mentor_sources', '[]'), e => e.status === 400);
  assert.throws(() => validateV3Setting('mentor_sources', JSON.stringify([{ name: '甲', year: 2026 }, { name: '甲', year: 2026 }])), e => e.status === 400);
});

test('调整安排：改日期列出挪动的段和新结业日；只改文字列在 edited；段落不能增删换序；没改动 400；预览后记录变了 409', async t => {
  const f = fixture(t), routes = projectRoutes({ mentorPath: f.service }), base = `/api/v3/mentor/path/${encodeURIComponent('林瑶')}/plan`;
  withPath(f);
  const cur = structuredClone(getRecord(f.db, PATH_KIND, '林瑶'));
  // P7 晚 3 天结束，后面各段一起顺延 3 天（页面默认这样提交）
  const shifted = structuredClone(cur);
  const after = shifted.lines[0].stages.slice(6);
  after[0].d[1] += 3; after[0].steps.at(-1).d[1] += 3;
  after.slice(1).forEach(s => { s.d = s.d.map(x => x + 3); s.steps.forEach(x => { if (x.d) x.d = x.d.map(y => y + 3); }); });
  const pv = await invoke(routes, 'POST', `${base}/preview`, { lines: shifted.lines });
  assert.equal(pv.status, 200);
  assert.deepEqual(pv.body.moved, ['P7', 'P8', 'P9', 'P10']);
  assert.deepEqual(pv.body.edited, []);
  assert.deepEqual([pv.body.endBefore, pv.body.endAfter, pv.body.startChanged], ['2026-08-11', '2026-08-14', false]);
  assert.equal(getRecord(f.db, PATH_KIND, '林瑶').lines[0].stages[9].d[0], 65, '预览不写');
  const ok = await invoke(routes, 'POST', base, { previewId: pv.body.previewId, confirm: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, getRecord(f.db, PATH_KIND, '林瑶'));
  assert.deepEqual(ok.body.lines[0].stages[9].d, [68, 68]);
  assert.equal(ok.body.history.length, 1, '旧版留在 history');
  // 改入职日：各段日期跟着平移，D 不变
  const moved = f.service.planPreview('林瑶', { start: '2026-05-18' });
  assert.deepEqual([moved.startChanged, moved.moved, moved.view.lines[0].stages[0].dates[0]], [true, [], '2026-05-18']);
  // 只改文字
  const words = structuredClone(ok.body); words.lines[0].stages[3].steps[0].text = '平台客服（含夜班）';
  assert.deepEqual(f.service.planPreview('林瑶', { lines: words.lines }).edited, ['P4']);
  const fewer = structuredClone(ok.body); fewer.lines[1].stages.pop();
  assert.throws(() => f.service.planPreview('林瑶', { lines: fewer.lines }), e => e.status === 400 && /段落不能增删/.test(e.message));
  assert.throws(() => f.service.planPreview('林瑶', { lines: ok.body.lines }), e => e.status === 400 && /没有改动/.test(e.message));
  const stale = f.service.planPreview('林瑶', { lines: words.lines });
  putRecord(f.db, STAGE_KIND, '林瑶:P2', { name: '林瑶', stage: 'P2', kind: 'complete', at: '2026-05-14' });
  assert.throws(() => f.service.planConfirm('林瑶', { previewId: stale.previewId, confirm: true }), e => e.status === 409);
  assert.equal((await invoke(routes, 'POST', `/api/v3/mentor/path/${encodeURIComponent('张三')}/plan/preview`, { start: START })).status, 404);
});

test('记录进度：评审段记分数和结论、其余段确认完成；预览不写，确认后回读；列出状态变化；可以撤销；校验不过 400', async t => {
  let at = Date.parse('2026-10-26T02:00:00Z');
  const f = fixture(t, () => at), routes = projectRoutes({ mentorPath: f.service });
  const url = id => `/api/v3/mentor/path/${encodeURIComponent('林瑶')}/stages/${id}/record`;
  withPath(f);
  const pv = await invoke(routes, 'POST', `${url('P1')}/preview`, { kind: 'review', score: 82, result: 'pass', note: '赛道判断清楚', at: '2026-05-13' });
  assert.equal(pv.status, 200);
  assert.deepEqual(pv.body.effects, [{ id: 'P1', title: '入职培训与初轮筛选', from: 'doing', to: 'done' }, { id: 'P2', title: '业务流程认知与 AI 通识培训', from: 'todo', to: 'doing' }]);
  assert.equal(getRecord(f.db, STAGE_KIND, '林瑶:P1'), null, '预览不写');
  const ok = await invoke(routes, 'POST', url('P1'), { previewId: pv.body.previewId, confirm: true });
  assert.deepEqual(ok.body, { name: '林瑶', stage: 'P1', kind: 'review', at: '2026-05-13', note: '赛道判断清楚', score: 82, result: 'pass', recordedAt: '2026-10-26T02:00:00.000Z' });
  assert.deepEqual(ok.body, getRecord(f.db, STAGE_KIND, '林瑶:P1'));
  f.service.recordConfirm('林瑶', 'P2', { previewId: f.service.recordPreview('林瑶', 'P2', { kind: 'complete', at: '2026-05-14' }).previewId, confirm: true });
  const g = (await invoke(routes, 'GET', '/api/v3/mentor/path')).body.trainees[0].path;
  assert.deepEqual([stage(g, 'P1').status, stage(g, 'P2').status, stage(g, 'P3').status, stage(g, 'P3').late], ['done', 'done', 'doing', 111]);
  // 改结论留历史
  at += 60_000;
  f.service.recordConfirm('林瑶', 'P1', { previewId: f.service.recordPreview('林瑶', 'P1', { kind: 'review', score: 68, result: 'retest', at: '2026-05-13' }).previewId, confirm: true });
  assert.deepEqual([getRecord(f.db, STAGE_KIND, '林瑶:P1').result, getRecord(f.db, STAGE_KIND, '林瑶:P1').history[0].score], ['retest', 82]);
  // 撤销
  // P1 改成限期复核后 P2 仍有完成记录（补录可以不按顺序）；撤销后 P2 回到未开始
  const clear = f.service.recordPreview('林瑶', 'P2', { clear: true });
  assert.deepEqual(clear.effects, [{ id: 'P2', title: '业务流程认知与 AI 通识培训', from: 'done', to: 'todo' }]);
  f.service.recordConfirm('林瑶', 'P2', { previewId: clear.previewId, confirm: true });
  assert.equal(getRecord(f.db, STAGE_KIND, '林瑶:P2'), null);
  const bad = async (id, body, status = 400) => assert.equal((await invoke(routes, 'POST', `${url(id)}/preview`, body)).status, status);
  await bad('P1', { kind: 'review', score: 65, result: 'pass', at: '2026-05-13' });
  await bad('P1', { kind: 'complete', at: '2026-05-13' });
  await bad('P2', { kind: 'review', score: 80, result: 'pass', at: '2026-05-13' });
  await bad('P2', { kind: 'complete', at: '2026-10-27' });
  await bad('P2', { kind: 'complete', at: '2026-05-14', note: 'x'.repeat(201) });
  await bad('P1', { kind: 'review', score: 68, result: 'retest', at: '2026-05-13' });
  await bad('P2', { clear: true });
  await bad('X9', { kind: 'complete', at: '2026-05-14' }, 404);
});

test('按方案生成路径：旧版或没有路径的人预览不写、确认后回读；已有新版路径 409；名单里没有 404', async t => {
  const f = fixture(t), routes = projectRoutes({ mentorPath: f.service });
  putRecord(f.db, PATH_KIND, '胡贵兰', { season: { start: '2026-09-01', weeks: 24 }, lines: [], links: [] });
  withPath(f);
  const base = `/api/v3/mentor/path/${encodeURIComponent('胡贵兰')}/generate`;
  const pv = await invoke(routes, 'POST', `${base}/preview`, { start: START, plan: 'v2.4' });
  assert.equal(pv.status, 200);
  assert.equal(pv.body.view.end, '2026-08-11');
  assert.equal(getRecord(f.db, PATH_KIND, '胡贵兰').version, undefined, '预览不写');
  const ok = await invoke(routes, 'POST', base, { previewId: pv.body.previewId, confirm: true });
  assert.equal(ok.status, 200);
  const got = (await invoke(routes, 'GET', '/api/v3/mentor/path')).body.trainees.find(x => x.name === '胡贵兰');
  assert.deepEqual(got.path, pv.body.view, '回读与预览一致');
  assert.equal(got.legacy, undefined);
  assert.equal((await invoke(routes, 'POST', `${base}/preview`, { start: START })).status, 409);
  assert.equal((await invoke(routes, 'POST', `/api/v3/mentor/path/${encodeURIComponent('林瑶')}/generate/preview`, { start: START })).status, 409);
  assert.equal((await invoke(routes, 'POST', `/api/v3/mentor/path/${encodeURIComponent('张三')}/generate/preview`, { start: START })).status, 404);
});

test('导入脚本：默认只预览不写入；--confirm 写入并回读；旧版按周的路径换成新版；缺参数退出码 2', t => {
  const { dir } = fixture(t);
  const env = { ...process.env, WORKDESK_DATA_DIR: dir };
  const run = (...args) => execFileSync(process.execPath, ['scripts/import-mentor-path.mjs', ...args], { env, encoding: 'utf8' });
  const read = () => { const db = openDb(dir); try { return getRecord(db, PATH_KIND, '林瑶'); } finally { db.close(); } };
  { const db = openDb(dir); putRecord(db, PATH_KIND, '林瑶', { season: { start: '2026-09-01' }, lines: [] }); db.close(); }
  const out = run('林瑶', '--start', START);
  assert.match(out, /排期　　2026-05-12 入职（D1）→ D65 结业（2026-08-11）/);
  assert.match(out, /评审　　D2 初轮筛选（2026-05-13）、D14 二轮筛选（2026-05-29）/);
  assert.match(out, /现有路径　旧版按周的路径，换成按工作日的新版[\s\S]*只预览，没有写入/);
  assert.equal(read().version, undefined);
  assert.match(run('林瑶', '--start', START, '--confirm'), /已写入，回读核对一致/);
  assert.equal(read().start, START);
  assert.throws(() => execFileSync(process.execPath, ['scripts/import-mentor-path.mjs', '林瑶'], { env, stdio: 'pipe' }), e => e.status === 2);
  assert.throws(() => execFileSync(process.execPath, ['scripts/import-mentor-path.mjs', '张三', '--start', START], { env, stdio: 'pipe' }), e => e.status === 1 && /带教名单里没有这个人/.test(e.stderr));
});
