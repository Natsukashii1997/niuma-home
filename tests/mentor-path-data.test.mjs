import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { getRecord, putRecord } from '../server/local-records.mjs';
import { CAMP_KIND, PATH_KIND, createMentorPathService, derivePath, validatePath } from '../server/mentor-path.mjs';
import { projectRoutes } from '../server/routes/projects.mjs';
import { match } from '../server/http.mjs';
import { isLate, lineStars, pendingReviews, seasonClock } from '../src/modules/projects/mentor-path.js';

const seed = JSON.parse(readFileSync('docs/培养路径/胡贵兰.json', 'utf8'));
const def = validatePath(seed);
const node = (p, id) => p.lines.flatMap(l => l.nodes).find(n => n.id === id);
// 按定义的评分项给分；scores 依次对应各评分项
const camp = (id, scores, extra = {}) => {
  const n = node(def, id);
  return { name: '胡贵兰', node: id, rubric: Object.fromEntries(n.rubric.map((x, i) => [x.name, { score: scores[i] }])), scoredAt: '2026-09-12T02:00:00.000Z', ...extra };
};
const camps = list => Object.fromEntries(list.map(c => [c.node, c]));

function fixture(t, now = () => Date.parse('2026-10-22T16:30:00Z')) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'mentor-path-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, db, service: createMentorPathService(db, { now }) };
}

test('路径定义：两份种子都合格；只留约定字段；常见错误给出具体原因', () => {
  assert.deepEqual(validatePath(JSON.parse(readFileSync('docs/培养路径/林瑶.json', 'utf8'))), def);
  assert.equal(def.lines[0].nodes.length + def.lines[1].nodes.length, 13);
  assert.equal(validatePath({ ...seed, extra: 1, lines: seed.lines.map(l => ({ ...l, nodes: l.nodes.map(n => ({ ...n, status: 'done', score: 99 })) })) }).lines[0].nodes[0].status, undefined);
  const broken = (fn) => { const d = structuredClone(seed); fn(d); return () => validatePath(d); };
  assert.throws(broken(d => { d.lines[0].nodes[0].rubric[0].weight = 41; }), /权重为正整数且合计 100/);
  assert.throws(broken(d => { d.lines[0].nodes[1].week = [2, 4]; }), /排在上一关之后/);
  assert.throws(broken(d => { d.lines[1].nodes[5].week = [17, 25]; }), /第 1–24 周内/);
  assert.throws(broken(d => { d.links.push({ from: 'B1', to: 'B2', note: '业务地图' }); }), /连接两条线/);
  assert.throws(broken(d => { d.season.start = '2026-02-30'; }), /start/);
  assert.throws(broken(d => { d.lines[1].nodes[0].id = 'B1'; }), /不重复/);
  assert.throws(broken(d => { d.lines.reverse(); }), /biz（业务线）和 ai（AI 线）/);
});

test('推导：没有记录时两条线第一关进行中、其余未解锁，没有分数，不算待评分', () => {
  const p = derivePath(def);
  assert.deepEqual(p.lines.map(l => l.nodes.map(n => n.status)), [['doing', 'locked', 'locked', 'locked', 'locked', 'locked', 'locked'], ['doing', 'locked', 'locked', 'locked', 'locked', 'locked']]);
  assert.equal(node(p, 'B1').score, undefined);
  assert.equal(node(p, 'B1').at, undefined);
  assert.deepEqual([node(p, 'B1').todoDone, node(p, 'B1').outDone, node(p, 'B1').outLinks], [0, 0, [null, null]]);
  assert.equal(pendingReviews(p), 0);
  // 今天第 8 周：B1（W1–2）还没通关 = 超期 6 周
  assert.equal(isLate(node(p, 'B1'), seasonClock(p.season, '2026-10-23').week), true);
});

test('推导：分数是各项之和，≥ 通关线才通关；缺一项不算分；星数按真实分数', () => {
  const p = derivePath(def, camps([camp('B1', [36, 25, 25]), camp('B2', [30, 27, 25]), camp('B3', [21, 28, 25]), camp('B4', [28, 22, 12]), camp('A1', [38, 27])]));
  assert.deepEqual(['B1', 'B2', 'B3', 'B4', 'B5'].map(id => [node(p, id).status, node(p, id).score]), [['done', 86], ['done', 82], ['done', 74], ['doing', 62], ['locked', undefined]]);
  assert.equal(node(p, 'B1').at, '09-12');
  assert.deepEqual(node(p, 'B4').rubric.map(x => x.score), [28, 22, 12]);
  assert.deepEqual([node(p, 'A1').status, node(p, 'A1').score, node(p, 'A1').rubric.map(x => x.score ?? null)], ['doing', undefined, [38, 27, null]]);
  assert.equal(lineStars(p.lines[0], p.season.pass), 2 + 2 + 1);
  // 恰好 70 分通关
  assert.equal(node(derivePath(def, camps([camp('B1', [30, 20, 20])])), 'B1').status, 'done');
  assert.equal(node(derivePath(def, camps([camp('B1', [30, 20, 19])])), 'B1').status, 'doing');
});

test('推导：绳桥依赖没通关时后一关不解锁；评分项改了措辞就不再计分', () => {
  const ai = [camp('A1', [38, 27, 25]), camp('A2', [25, 30, 23])];
  assert.equal(node(derivePath(def, camps(ai)), 'A3').status, 'locked');
  const all = derivePath(def, camps([...ai, camp('B1', [36, 25, 25]), camp('B2', [30, 27, 25]), camp('B3', [21, 28, 25])]));
  assert.equal(node(all, 'A3').status, 'doing');
  const renamed = structuredClone(def);
  renamed.lines[0].nodes[0].rubric[0].name = '准确';
  assert.equal(node(derivePath(renamed, camps([camp('B1', [36, 25, 25])])), 'B1').score, undefined);
});

test('推导：要做的事按原文对上；产出物有链接才算交；待评分看产出和评分的先后', () => {
  const b1 = node(def, 'B1');
  const base = { name: '胡贵兰', node: 'B1', todoDone: [b1.todo[0], '已经删掉的事'], outLinks: { [b1.output[1]]: 'https://example.feishu.cn/docx/a' } };
  let p = derivePath(def, camps([{ ...base, outAt: '2026-09-10T02:00:00.000Z' }]));
  assert.deepEqual([node(p, 'B1').todoDone, node(p, 'B1').outDone, node(p, 'B1').outLinks], [1, 1, [null, 'https://example.feishu.cn/docx/a']]);
  assert.equal(node(p, 'B1').review, true);
  assert.equal(pendingReviews(p), 1);
  p = derivePath(def, camps([{ ...camp('B1', [30, 20, 10]), ...base, outAt: '2026-09-10T02:00:00.000Z' }]));
  assert.equal(node(p, 'B1').review, false, '评过分之后没再交产出');
  p = derivePath(def, camps([{ ...camp('B1', [30, 20, 10]), ...base, outAt: '2026-09-13T02:00:00.000Z' }]));
  assert.equal(node(p, 'B1').review, true, '评分之后又更新了产出');
  p = derivePath(def, camps([{ ...camp('B1', [36, 25, 25]), ...base, outAt: '2026-09-13T02:00:00.000Z' }]));
  assert.equal(node(p, 'B1').review, false, '已通关的不算待评分');
});

test('接口：名单沿用带教来源，没导入的人 path 为 null；today 按北京时间；导入后返回推导结果', async t => {
  const { db, service } = fixture(t);
  const get = async () => {
    const found = match(projectRoutes({ mentorPath: service }), 'GET', '/api/v3/mentor/path');
    let status, body;
    await found.handler({}, { writeHead: s => (status = s), end: b => (body = JSON.parse(b)) }, { params: found.params });
    return { status, body };
  };
  let { status, body } = await get();
  assert.equal(status, 200);
  assert.equal(body.today, '2026-10-23', 'UTC 10-22 16:30 = 北京 10-23 00:30');
  assert.deepEqual(body.trainees, [{ name: '林瑶', role: '管培生', path: null }, { name: '胡贵兰', role: '管培生', path: null }]);

  const pv = service.importPreview('胡贵兰', seed, 'docs/培养路径/胡贵兰.json');
  assert.equal(pv.before, null);
  assert.equal(pv.inMentorList, true);
  assert.equal(getRecord(db, PATH_KIND, '胡贵兰'), null, '预览不写入');
  service.importConfirm('胡贵兰', pv.previewId);
  assert.deepEqual(service.importConfirm('胡贵兰', pv.previewId), getRecord(db, PATH_KIND, '胡贵兰'), '重复确认返回同一回执');
  putRecord(db, CAMP_KIND, '胡贵兰:B1', camp('B1', [36, 25, 25]));
  putRecord(db, CAMP_KIND, '林瑶:B1', { ...camp('B1', [10, 10, 10]), name: '林瑶' });

  ({ body } = await get());
  assert.equal(body.trainees[0].path, null);
  const p = body.trainees[1].path;
  assert.deepEqual(p.season, def.season);
  assert.equal(p.source, undefined);
  assert.deepEqual([node(p, 'B1').status, node(p, 'B1').score, node(p, 'B2').status], ['done', 86, 'doing']);
});

test('导入：再导入时列出改动和失去对应关卡的营地记录；预览后内容变了要重新预览', t => {
  const { db, service } = fixture(t);
  service.importConfirm('胡贵兰', service.importPreview('胡贵兰', seed, 'a.json').previewId);
  putRecord(db, CAMP_KIND, '胡贵兰:A6', { name: '胡贵兰', node: 'A6' });
  const fewer = structuredClone(seed);
  fewer.lines[1].nodes.pop();
  fewer.links = fewer.links.filter(k => k.to !== 'A6');
  const pv = service.importPreview('胡贵兰', fewer, 'b.json');
  assert.deepEqual(pv.orphans, ['A6']);
  assert.equal(pv.before.source, 'a.json');
  service.importConfirm('胡贵兰', service.importPreview('胡贵兰', seed, 'c.json').previewId);
  assert.throws(() => service.importConfirm('胡贵兰', pv.previewId), e => e.status === 409);
  assert.equal(getRecord(db, PATH_KIND, '胡贵兰').source, 'c.json');
  assert.equal(service.importPreview('张三', seed, 'a.json').inMentorList, false);
});

test('导入脚本：默认只预览不写入；--confirm 写入并回读；缺文件报错退出', t => {
  const { dir } = fixture(t);
  const run = (...args) => execFileSync(process.execPath, ['scripts/import-mentor-path.mjs', ...args], { env: { ...process.env, WORKDESK_DATA_DIR: dir }, encoding: 'utf8' });
  const read = () => { const db = openDb(dir); try { return getRecord(db, PATH_KIND, '林瑶'); } finally { db.close(); } };
  assert.match(run('林瑶'), /现有定义　无，新建[\s\S]*只预览，没有写入/);
  assert.equal(read(), null);
  assert.match(run('林瑶', '--confirm'), /已写入，回读核对一致/);
  assert.equal(read().source, 'docs/培养路径/林瑶.json');
  assert.match(run('林瑶', '--file', 'docs/培养路径/胡贵兰.json'), /有，内容相同，没有变化/);
  assert.throws(() => execFileSync(process.execPath, ['scripts/import-mentor-path.mjs', '林瑶', '--file', 'nope.json'], { env: { ...process.env, WORKDESK_DATA_DIR: dir }, stdio: 'pipe' }), e => e.status === 1 && /没有完成/.test(e.stderr));
});

// 走生产路由的参数解析、请求体读取与错误响应
async function invoke(routes, method, endpoint, body) {
  const found = match(routes, method, new URL(endpoint, 'http://127.0.0.1').pathname);
  assert.ok(found, `${method} ${endpoint} 必须匹配真实路由`);
  let status, output;
  await found.handler(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), { writeHead: s => (status = s), end: v => (output = v) }, { params: found.params });
  return { status, body: JSON.parse(output) };
}
const scoreBody = (id, scores, extra = {}) => ({ rubric: Object.fromEntries(node(def, id).rubric.map((x, i) => [x.name, { score: scores[i], note: '' }])), ...extra });

function recordFixture(t) {
  let at = Date.parse('2026-10-23T02:00:00Z');
  const f = fixture(t, () => at);
  f.service.importConfirm('胡贵兰', f.service.importPreview('胡贵兰', seed, 'docs/培养路径/胡贵兰.json').previewId);
  for (const [id, s] of [['B1', [36, 25, 25]], ['B2', [30, 27, 25]], ['B3', [21, 28, 25]]]) putRecord(f.db, CAMP_KIND, `胡贵兰:${id}`, camp(id, s));
  const routes = projectRoutes({ mentorPath: f.service }), base = id => `/api/v3/mentor/path/${encodeURIComponent('胡贵兰')}/nodes/${id}/record`;
  const nodeNow = async id => node((await invoke(routes, 'GET', '/api/v3/mentor/path')).body.trainees[1].path, id);
  return { ...f, routes, base, nodeNow, tick: ms => { at += ms; } };
}

test('营地记录：预览不写入；确认后回读一致；通关后列出状态变化，绳桥没满足的关仍锁着', async t => {
  const { db, routes, base, nodeNow } = recordFixture(t);
  const b4 = node(def, 'B4');
  const body = scoreBody('B4', [32, 26, 14], { todoDone: [b4.todo[0], b4.todo[1]], outLinks: { [b4.output[0]]: ' https://example.feishu.cn/docx/plan ' } });
  const pv = await invoke(routes, 'POST', `${base('B4')}/preview`, body);
  assert.equal(pv.status, 200);
  assert.equal(getRecord(db, CAMP_KIND, '胡贵兰:B4'), null, '预览不写入');
  assert.equal(pv.body.scored, true);
  assert.deepEqual([pv.body.node.status, pv.body.node.score, pv.body.node.todoDone, pv.body.node.outLinks], ['done', 72, 2, ['https://example.feishu.cn/docx/plan', null]]);
  assert.deepEqual(pv.body.effects, [{ id: 'B4', title: b4.title, from: 'doing', to: 'done' }], 'B5 还要等 A4，不算解锁');
  const ok = await invoke(routes, 'POST', base('B4'), { previewId: pv.body.previewId, confirm: true });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, getRecord(db, CAMP_KIND, '胡贵兰:B4'));
  assert.deepEqual(ok.body.outLinks, { [b4.output[0]]: 'https://example.feishu.cn/docx/plan' });
  assert.equal(ok.body.scoredAt, '2026-10-23T02:00:00.000Z');
  const now = await nodeNow('B4');
  assert.deepEqual([now.status, now.score, now.at, now.review, now.todoChecked], ['done', 72, '10-23', false, [true, true, false]]);
  assert.deepEqual((await invoke(routes, 'POST', base('B4'), { previewId: pv.body.previewId, confirm: true })).body, ok.body, '重复确认返回同一回执，不再写');
});

test('营地记录：只交产出算待评分；评过分后不再待评分；改评分留历史，降到通关线下后面的关变回未解锁', async t => {
  const { service, db, tick, nodeNow } = recordFixture(t);
  const a1 = node(def, 'A1');
  let pv = service.recordPreview('胡贵兰', 'A1', { outLinks: { [a1.output[0]]: 'https://example.feishu.cn/docx/a1' } });
  assert.equal(pv.scored, false);
  service.recordConfirm('胡贵兰', 'A1', { previewId: pv.previewId, confirm: true });
  assert.equal((await nodeNow('A1')).review, true);
  assert.equal(pendingReviews(service.get().trainees[1].path), 1);
  tick(60_000);
  pv = service.recordPreview('胡贵兰', 'A1', scoreBody('A1', [30, 20, 10], { outLinks: { [a1.output[0]]: 'https://example.feishu.cn/docx/a1' } }));
  service.recordConfirm('胡贵兰', 'A1', { previewId: pv.previewId, confirm: true });
  assert.deepEqual([(await nodeNow('A1')).review, (await nodeNow('A1')).status], [false, 'doing']);
  assert.equal(getRecord(db, CAMP_KIND, '胡贵兰:A1').history.length, 1);

  pv = service.recordPreview('胡贵兰', 'B3', scoreBody('B3', [21, 12, 25]));
  assert.deepEqual(pv.effects.map(e => `${e.id}:${e.from}>${e.to}`), ['B3:done>doing', 'B4:doing>locked']);
  service.recordConfirm('胡贵兰', 'B3', { previewId: pv.previewId, confirm: true });
  assert.equal((await nodeNow('B4')).status, 'locked');
  assert.equal(getRecord(db, CAMP_KIND, '胡贵兰:B3').history[0].rubric[node(def, 'B3').rubric[1].name].score, 28);
});

test('营地记录：校验不过一律 400，没解锁的关 409；预览后别的记录变了要重新预览', async t => {
  const { service, routes, base, db } = recordFixture(t);
  const b4 = node(def, 'B4');
  const bad = async (body, re, id = 'B4', status = 400) => { const r = await invoke(routes, 'POST', `${base(id)}/preview`, body); assert.equal(r.status, status, JSON.stringify(body)); assert.match(r.body.error, re); };
  await bad(scoreBody('B4', [32, 26, null]), /每一项都打分/);
  await bad(scoreBody('B4', [41, 26, 14]), /0–40 的整数/);
  await bad(scoreBody('B4', [32.5, 26, 14]), /整数/);
  await bad({ todoDone: ['不是这一关的事'] }, /这一关里的事项/);
  await bad({ outLinks: { [b4.output[0]]: 'feishu.cn/docx/x' } }, /http/);
  await bad({ outLinks: { 别的产出: 'https://example.feishu.cn/x' } }, /这一关里的产出物/);
  await bad({ rubric: { 不存在: { score: 1 } } }, /这一关里的评分项/);
  await bad({}, /没有改动/);
  await bad([], /须是对象/);
  await bad(scoreBody('B5', [30, 40, 30]), /还没解锁/, 'B5', 409);
  assert.equal((await invoke(routes, 'POST', `/api/v3/mentor/path/${encodeURIComponent('胡贵兰')}/nodes/Z9/record/preview`, {})).status, 404);
  assert.equal((await invoke(routes, 'POST', `/api/v3/mentor/path/${encodeURIComponent('林瑶')}/nodes/B1/record/preview`, scoreBody('B1', [30, 20, 20]))).status, 404);

  const pv = service.recordPreview('胡贵兰', 'B4', scoreBody('B4', [32, 26, 14]));
  putRecord(db, CAMP_KIND, '胡贵兰:A1', camp('A1', [38, 27, 25]));
  assert.throws(() => service.recordConfirm('胡贵兰', 'B4', { previewId: pv.previewId, confirm: true }), e => e.status === 409 && /重新预览/.test(e.message));
  assert.equal(getRecord(db, CAMP_KIND, '胡贵兰:B4'), null);
  assert.throws(() => service.recordConfirm('胡贵兰', 'B4', { previewId: 'nope', confirm: true }), e => e.status === 409);
  assert.throws(() => service.recordConfirm('胡贵兰', 'B4', { previewId: pv.previewId }), e => e.status === 400);
});
