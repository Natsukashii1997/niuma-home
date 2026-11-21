import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { openDb, saveAssistant, saveSetting } from '../server/db.mjs';
import { match, unmatched } from '../server/http.mjs';
import { createMentorService, mentorView, datedHeadings } from '../server/mentor.mjs';
import { projectRoutes } from '../server/routes/projects.mjs';
import { mentorRoutes } from '../server/routes/mentor.mjs';
import { routes as knowledgeRoutes } from '../server/routes/assistant-knowledge.mjs';
import { routes as referenceRoutes } from '../server/routes/references.mjs';
import { routes as selftalkRoutes } from '../server/routes/selftalk.mjs';
import { userRoutes } from '../server/routes/user.mjs';
import { referenceDir } from '../server/references.mjs';
import { parseTimeline, REGION_SHEETS } from '../server/timeline.mjs';
import { anomalyKey, createRulingService, withRulings } from '../server/timeline-rulings.mjs';
import { createProjectService } from '../server/projects.mjs';
import { createNeedsService } from '../server/needs.mjs';
import { createStrategyExportService, literalMarkdown } from '../server/feishu-export.mjs';
import { listRecords, putRecord } from '../server/local-records.mjs';

const instant = Date.parse('2026-10-18T10:00:00+08:00');
const noModel = async () => assert.fail('T10 写入核查不得调用模型');

function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, 'T10 补测必须显式使用隔离数据目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 't10-extra-'));
  const db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}

// 走生产路由的参数解析、请求体读取与错误响应；无真实监听端口或外部请求。
async function invoke(routes, method, endpoint, body) {
  const url = new URL(endpoint, 'http://127.0.0.1');
  const found = match(routes, method, url.pathname);
  assert.ok(found, `${method} ${endpoint} 必须匹配真实路由`);
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  let status, output;
  const res = { writeHead(code) { status = code; }, end(value) { output = value; } };
  await found.handler(req, res, { params: found.params, url });
  return { status, body: JSON.parse(output) };
}

function mentorFixture(t) {
  const db = database(t), clock = { value: instant };
  const source = { name: '合成人员甲', role: '管培生', year: 2026, url: 'https://example.feishu.cn/docx/t10syntheticmentor' };
  saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  const mentor = createMentorService(db, {
    now: () => clock.value,
    generate: noModel,
    readLogs: async person => mentorView(person, datedHeadings('<h1 id="synthetic">10.18 合成日志</h1>', 2026), '<h1 id="synthetic">10.18 合成日志</h1><p id="para0abcd">合成卡点：待确认下一步。</p>', clock.value),
  });
  return { db, clock, source, routes: mentorRoutes({ mentor }), base: `/api/v3/mentor/${encodeURIComponent(source.name)}/records` };
}

test('T10 带教记录预览到期后拒绝确认，回读没有新增记录', async t => {
  const { clock, routes, base } = mentorFixture(t);
  const preview = await invoke(routes, 'POST', `${base}/preview`, { week: '2026-W42', note: '到期后不得保存' });
  assert.equal(preview.status, 200);
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/mentor')).body[0].history, []);
  clock.value = Date.parse(preview.body.expiresAt);
  const denied = await invoke(routes, 'POST', base, { week: '2026-W42', previewId: preview.body.previewId, confirm: true });
  assert.equal(denied.status, 409);
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/mentor')).body[0].history, []);
});

test('T10 带教记录重复确认返回原回执，回读只有一条周记录', async t => {
  const { routes, base } = mentorFixture(t);
  const preview = await invoke(routes, 'POST', `${base}/preview`, { week: '2026-W42', note: '已确认的带教结论' });
  assert.equal(preview.status, 200);
  const body = { week: '2026-W42', previewId: preview.body.previewId, confirm: true };
  const first = await invoke(routes, 'POST', base, body);
  assert.equal(first.status, 200);
  assert.equal(first.body.note, '已确认的带教结论');
  assert.deepEqual(await invoke(routes, 'POST', base, body), first);
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/mentor')).body[0].history, ['2026-W42']);
});

test('T10 带教来源配置变更使旧记录预览失效，新旧来源均不误写', async t => {
  const { db, source, routes, base } = mentorFixture(t);
  const preview = await invoke(routes, 'POST', `${base}/preview`, { week: '2026-W42', note: '旧来源结论' });
  assert.equal(preview.status, 200);
  saveSetting(db, 'mentor_sources', JSON.stringify([{ ...source, url: 'https://example.feishu.cn/docx/t10newsyntheticsource' }]));
  assert.equal((await invoke(routes, 'POST', base, { week: '2026-W42', previewId: preview.body.previewId, confirm: true })).status, 409);
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/mentor')).body[0].history, []);
  saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/mentor')).body[0].history, [], '原来源也没有被旧预览写入');
});

function knowledgeFixture(t) {
  const db = database(t), clock = { value: instant };
  const assistant = saveAssistant(db, { name: 'T10 合成助手', instructions: '只用于隔离测试' });
  return { clock, routes: knowledgeRoutes(db, { now: () => clock.value }), base: `/api/v3/assistants/${assistant.id}/knowledge` };
}

async function addKnowledge(routes, base, title = '合成知识') {
  const preview = await invoke(routes, 'POST', `${base}/preview`, { title, body: `${title}正文` });
  assert.equal(preview.status, 200);
  const saved = await invoke(routes, 'POST', base, { previewId: preview.body.previewId, confirm: true });
  assert.equal(saved.status, 200);
  return saved.body;
}

test('T10 助手知识新增预览到期后拒绝确认，回读仍为空', async t => {
  const { clock, routes, base } = knowledgeFixture(t);
  const preview = await invoke(routes, 'POST', `${base}/preview`, { title: '到期知识', body: '不得保存' });
  assert.equal(preview.status, 200);
  clock.value = Date.parse(preview.body.expiresAt);
  assert.equal((await invoke(routes, 'POST', base, { previewId: preview.body.previewId, confirm: true })).status, 409);
  assert.deepEqual((await invoke(routes, 'GET', base)).body.docs, []);
});

test('T10 助手知识删除预览到期后拒绝确认，原文仍可回读', async t => {
  const { clock, routes, base } = knowledgeFixture(t);
  const saved = await addKnowledge(routes, base);
  const before = await invoke(routes, 'GET', base);
  const preview = await invoke(routes, 'POST', `${base}/preview`, { action: 'delete', docId: saved.id });
  assert.equal(preview.status, 200);
  clock.value = Date.parse(preview.body.expiresAt);
  assert.equal((await invoke(routes, 'DELETE', base, { previewId: preview.body.previewId, confirm: true })).status, 409);
  assert.deepEqual(await invoke(routes, 'GET', base), before);
});

test('T10 助手知识重复删除确认返回原回执，不删除其他知识', async t => {
  const { routes, base } = knowledgeFixture(t);
  const removed = await addKnowledge(routes, base, '待删除知识');
  const retained = await addKnowledge(routes, base, '保留知识');
  const preview = await invoke(routes, 'POST', `${base}/preview`, { action: 'delete', docId: removed.id });
  assert.equal(preview.status, 200);
  assert.equal((await invoke(routes, 'GET', base)).body.docs.length, 2, '删除预览不写入');
  const body = { previewId: preview.body.previewId, confirm: true };
  const first = await invoke(routes, 'DELETE', base, body);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, { ok: true, id: removed.id });
  assert.deepEqual(await invoke(routes, 'DELETE', base, body), first);
  assert.deepEqual((await invoke(routes, 'GET', base)).body.docs.map(doc => doc.id), [retained.id]);
});

test('T10 参考画布预览到期后拒绝确认，不写入记录或预备图片', async t => {
  const db = database(t), clock = { value: instant };
  let compressed = 0;
  const routes = referenceRoutes(db, { now: () => clock.value, compress: async () => { compressed++; return Buffer.from([255, 216, 255, 0]); } });
  const before = await invoke(routes, 'GET', '/api/v3/refs');
  const preview = await invoke(routes, 'POST', '/api/v3/refs/preview', {
    zones: [], items: [{ id: 't10-reference', x: 20, y: 20, w: 180, title: '合成参考', tags: [], imageDataUrl: 'data:image/png;base64,c3ludGhldGlj' }],
  });
  assert.equal(preview.status, 200);
  assert.equal(compressed, 1, '压缩通过替身执行，没有调用外部工具');
  assert.equal(existsSync(referenceDir(db)), false, '预览不落图片文件');
  clock.value = Date.parse(preview.body.expiresAt);
  assert.equal((await invoke(routes, 'POST', '/api/v3/refs', { previewId: preview.body.previewId, confirm: true })).status, 409);
  assert.deepEqual(await invoke(routes, 'GET', '/api/v3/refs'), before);
  assert.equal(existsSync(referenceDir(db)), false, '到期拒绝后也不落图片文件');
});

function rulingFixture(t) {
  const db = database(t), clock = { value: instant };
  const timeline = parseTimeline([{ name: REGION_SHEETS[2], cols: ['A', 'B', 'C', 'D'], rows: [
    { row: 1, values: ['澳洲（semester1/2）', 'Semester 2学期开学', 'Final时间', '出分时间'] },
    { row: 2, values: ['昆士兰大学UQ', '7.27', '11.7-11.21（预估）', '12.2'] },
  ] }], '2026-10-18 10:00');
  const anomaly = timeline.anomalies.find(item => item.src.endsWith('C2'));
  assert.ok(anomaly, '合成来源必须包含待裁定日期异常');
  const rulings = createRulingService(db, async () => timeline, { now: () => clock.value });
  return { clock, routes: userRoutes({ rulings, timeline: async () => withRulings(db, timeline) }), key: anomalyKey(anomaly) };
}

test('T10 时间线裁定预览到期后拒绝确认，回读异常保持未裁定', async t => {
  const { clock, routes, key } = rulingFixture(t);
  const preview = await invoke(routes, 'POST', `/api/v3/timeline/anomalies/${key}/preview`, { decision: 'adopt' });
  assert.equal(preview.status, 200);
  clock.value = Date.parse(preview.body.expiresAt);
  assert.equal((await invoke(routes, 'POST', '/api/v3/timeline/anomalies/confirm', { previewId: preview.body.previewId, confirm: true })).status, 409);
  const readback = (await invoke(routes, 'GET', '/api/v3/timeline')).body;
  assert.equal(readback.anomalies.find(item => item.key === key).ruling, undefined);
  assert.deepEqual(readback.rulings, { applied: 0, stale: 0 });
});

test('T10 时间线裁定重复确认返回原回执，回读只应用一次', async t => {
  const { routes, key } = rulingFixture(t);
  const preview = await invoke(routes, 'POST', `/api/v3/timeline/anomalies/${key}/preview`, { decision: 'adopt', note: '合成确认依据' });
  assert.equal(preview.status, 200);
  const body = { previewId: preview.body.previewId, confirm: true };
  const first = await invoke(routes, 'POST', '/api/v3/timeline/anomalies/confirm', body);
  assert.equal(first.status, 200);
  assert.deepEqual(await invoke(routes, 'POST', '/api/v3/timeline/anomalies/confirm', body), first);
  const readback = (await invoke(routes, 'GET', '/api/v3/timeline')).body;
  assert.deepEqual(readback.rulings, { applied: 1, stale: 0 });
  assert.equal(readback.anomalies.find(item => item.key === key).ruling.note, '合成确认依据');
  assert.equal(readback.agenda.filter(item => item.ruled && item.src.endsWith('C2')).length, 1);
});

test('T10 自言自语 PATCH :id 路由完成预览确认与回读', async t => {
  const db = database(t);
  const routes = selftalkRoutes(db, { now: () => instant, generate: noModel, readMessages: async () => [
    { id: 'om_t10_synthetic', createdAt: '2026-10-18T01:00:00.000Z', text: '合成事项', type: 'text', link: false },
  ] });
  assert.equal((await invoke(routes, 'POST', '/api/v3/selftalk/sync')).status, 200);
  const preview = await invoke(routes, 'POST', '/api/v3/selftalk/om_t10_synthetic/preview', { tag: 'star' });
  assert.equal(preview.status, 200);
  const confirmed = await invoke(routes, 'PATCH', '/api/v3/selftalk/om_t10_synthetic', { previewId: preview.body.previewId, confirm: true });
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.body.tag, 'star');
  const saved = (await invoke(routes, 'GET', '/api/v3/selftalk')).body.items.find(item => item.id === 'om_t10_synthetic');
  assert.equal(saved.tag, 'star');
  assert.equal(saved.text, '合成事项');
});

for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
  test(`T10 V3 未实现写接口 ${method} 返回501及派单标识`, async () => {
    const fallback = [{ method, re: /^\/api\/v3\/t10-synthetic-unimplemented$/, keys: [], handler: unmatched(method, '/api/v3/t10-synthetic-unimplemented') }];
    const response = await invoke(fallback, method, '/api/v3/t10-synthetic-unimplemented', { confirm: true });
    assert.equal(response.status, 501);
    assert.deepEqual(response.body, { error: '未实现，见 docs/tasks/V3-接口清单.md', task: 'V3-接口清单' });
  });
}

async function strategyExportFixture(t) {
  const db = database(t), clock = { value: instant }, state = { creates: 0, calls: 0 };
  const folder = 'https://example.feishu.cn/drive/folder/T10Folder', appId = 'cli_a965c429ef785bd3';
  const docs = new Map();
  const run = async (command, args, options) => {
    state.calls++;
    assert.equal(command, 'lark-cli');
    assert.deepEqual(args.slice(0, 2), ['--profile', 'cli_a965c429ef785bd3']);
    assert.deepEqual(args.slice(-2), ['--as', 'user']);
    assert.equal(options.shell, false);
    const arg = flag => args[args.indexOf(flag) + 1];
    const result = data => ({ stdout: JSON.stringify({ ok: true, identity: 'user', data }) });
    if (args.includes('whoami')) return { stdout: JSON.stringify({ profile: 'cli_a965c429ef785bd3', appId, identity: 'user', available: true, tokenStatus: 'ready', onBehalfOf: { openId: 'ou_t10_synthetic' } }) };
    if (args.includes('+inspect')) {
      const url = arg('--url');
      if (url === folder) return result({ type: 'folder', token: 'T10Folder', title: '合成导出目录', url });
      const id = url.split('/').at(-1);
      assert.ok(docs.has(id), '只能回读替身实际创建的文档');
      return result({ type: 'docx', token: id, title: docs.get(id).title, url });
    }
    if (args.includes('+create')) {
      assert.equal(arg('--parent-token'), 'T10Folder');
      assert.equal(arg('--content'), '-');
      if (args.includes('--dry-run')) return { stdout: JSON.stringify({ ok: true, identity: 'user', dry_run: true, data: {
        context: { app_id: appId, user_open_id: 'ou_t10_synthetic' },
        api: [{ method: 'POST', url: '/open-apis/docs_ai/v1/documents', body: { parent_token: 'T10Folder', format: 'markdown', content: `<title>${arg('--title')}</title>\n${options.input}` } }],
      } }) };
      state.creates++;
      const id = `T10Doc${state.creates}`;
      const title = arg('--title').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      docs.set(id, { title, content: `# ${literalMarkdown(title)}\n\n${options.input}` });
      return result({ document: { document_id: id, url: `https://example.feishu.cn/docx/${id}`, revision_id: 1 } });
    }
    if (args.includes('+fetch')) {
      const id = arg('--doc');
      assert.equal(arg('--scope'), 'full');
      assert.ok(docs.has(id));
      return result({ document: { document_id: id, content: docs.get(id).content, revision_id: 1 } });
    }
    assert.fail('不得执行替身未定义的外部操作');
  };
  const timeline = async () => ({ stage: '本科', agenda: [] });
  putRecord(db, 'selftalk-need', 't10syntheticsource', { id: 't10syntheticsource', month: '2026-11', need: {
    id: 't10syntheticneed', seg: '澳洲 · 本科', node: 'Final', need: '合成复习需求', source: '合成自言自语', status: '草稿',
  } });
  const needs = createNeedsService(db, timeline, { now: () => clock.value });
  const strategyExports = createStrategyExportService(db, needs, { run, now: () => clock.value });
  const routes = userRoutes({ timeline, needs, strategyExports });
  // 采纳接口已下线（#84），夹具直接用服务造一条已采纳需求。
  const preview = await needs.preview('t10syntheticneed', { month: '2026-11', strategy: {
    goal: '合成策略目标', actions: { 营销: [['核对日程', '避免遗漏']], 产品: [], 运营: [] },
  } });
  assert.equal((await needs.confirm('t10syntheticneed', { previewId: preview.previewId, confirm: true })).status, '已采纳');
  return { db, clock, state, routes, folder, base: '/api/v3/needs/t10syntheticneed/strategy' };
}

test('T10 策略导出路由预览到期后拒绝确认，不调用创建或写收据', async t => {
  const { db, clock, state, routes, folder, base } = await strategyExportFixture(t);
  const preview = await invoke(routes, 'POST', `${base}/export-preview`, { month: '2026-11', targetUrl: folder });
  assert.equal(preview.status, 200);
  assert.equal(state.creates, 0);
  const callsBefore = state.calls;
  clock.value = Date.parse(preview.body.expiresAt);
  const denied = await invoke(routes, 'POST', `${base}/export`, { previewId: preview.body.previewId, confirm: true });
  assert.equal(denied.status, 409);
  assert.equal(denied.body.code, 'EXPORT_PREVIEW_EXPIRED');
  assert.equal(state.creates, 0);
  assert.equal(state.calls, callsBefore, '到期确认无需再调用外部替身');
  assert.deepEqual(listRecords(db, 'feishu-export'), []);
});

test('T10 策略导出路由重复确认只创建一次，过期后仍回放成功收据', async t => {
  const { clock, state, routes, folder, base } = await strategyExportFixture(t);
  const preview = await invoke(routes, 'POST', `${base}/export-preview`, { month: '2026-11', targetUrl: folder });
  assert.equal(preview.status, 200);
  const body = { previewId: preview.body.previewId, confirm: true };
  const first = await invoke(routes, 'POST', `${base}/export`, body);
  assert.equal(first.status, 200);
  assert.equal(first.body.status, 'success');
  assert.equal(state.creates, 1);
  const callsBefore = state.calls;
  assert.deepEqual(await invoke(routes, 'POST', `${base}/export`, body), first);
  clock.value = Date.parse(preview.body.expiresAt) + 1;
  assert.deepEqual(await invoke(routes, 'POST', `${base}/export`, body), first);
  assert.equal(state.creates, 1);
  assert.equal(state.calls, callsBefore, '重复确认只回放持久化收据');
  const readback = await invoke(routes, 'GET', `${base}/exports/${first.body.operationId}`);
  assert.equal(readback.status, 200);
  assert.equal(readback.body.status, 'success');
  assert.deepEqual(readback.body.document, first.body.document);
});

function projectEditFixture(t) {
  const db = database(t);
  saveSetting(db, 'project_base_url', 'https://example.feishu.cn/base/T10SyntheticBase');
  saveSetting(db, 'project_table_id', 'tblT10Initial');
  const source = { projects: [{ id: 't10project', 项目名称: '合成飞书项目', 状态: ['推进中'] }], people: [], nodes: [
    { id: 't10node', 所属项目: [{ id: 't10project' }], 任务事项: '合成原节点', 节点类型: [], 环节阶段: ['实施阶段'], 是否完成: false, 截止时间: null },
  ] };
  const projects = createProjectService(db, { now: () => instant, readSource: async () => structuredClone(source) });
  return { db, source, routes: projectRoutes({ projects }) };
}

test('T10 飞书项目同步后节点来源变化使旧编辑预览失效', async t => {
  const { db, source, routes } = projectEditFixture(t);
  const preview = await invoke(routes, 'POST', '/api/v3/projects/t10project/preview', { nodeId: 't10node', done: true });
  assert.equal(preview.status, 200);
  source.nodes[0].任务事项 = '合成来源已修改的节点';
  assert.equal((await invoke(routes, 'POST', '/api/v3/projects/sync')).status, 200);
  const denied = await invoke(routes, 'PATCH', '/api/v3/projects/t10project', { previewId: preview.body.previewId, confirm: true });
  assert.equal(denied.status, 409);
  assert.match(denied.body.error, /来源或节点已变化/);
  assert.deepEqual(listRecords(db, 'project-state'), []);
  const project = (await invoke(routes, 'GET', '/api/v3/projects')).body.find(item => item.id === 't10project');
  assert.equal(project.nodes[0].t, '合成来源已修改的节点');
  assert.equal(project.nodes[0].done, false);
});

test('T10 飞书项目来源配置变化使旧编辑预览失效且不误写新旧来源', async t => {
  const { db, routes } = projectEditFixture(t);
  const preview = await invoke(routes, 'POST', '/api/v3/projects/t10project/preview', { nodeId: 't10node', done: true });
  assert.equal(preview.status, 200);
  saveSetting(db, 'project_table_id', 'tblT10Changed');
  const denied = await invoke(routes, 'PATCH', '/api/v3/projects', { id: 't10project', previewId: preview.body.previewId, confirm: true });
  assert.equal(denied.status, 409);
  assert.deepEqual(listRecords(db, 'project-state'), []);
  assert.equal((await invoke(routes, 'GET', '/api/v3/projects')).body[0].nodes[0].done, false);
  saveSetting(db, 'project_table_id', 'tblT10Initial');
  assert.equal((await invoke(routes, 'GET', '/api/v3/projects')).body[0].nodes[0].done, false);
});
