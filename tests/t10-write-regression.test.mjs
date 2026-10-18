import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import fs, { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { match } from '../server/http.mjs';
import { createProjectService } from '../server/projects.mjs';
import { projectRoutes } from '../server/routes/projects.mjs';
import { routes as marketingRoutes } from '../server/routes/v3-marketing.mjs';
import { routes as workspaceRoutes } from '../server/routes/workspace.mjs';
import { createManualNeeds } from '../server/manual-needs.mjs';
import { createNeedsService } from '../server/needs.mjs';
import { userRoutes } from '../server/routes/user.mjs';

// T10 的公共边界是路由处理器：真实解析请求、预览、确认，再经 GET 回读。
// 时钟与飞书来源使用合成数据；数据库和附件文件均在每例独立目录。
// 附件故障用例仅在文件系统边界注入一次删除失败，不改内部业务逻辑。
const instant = Date.parse('2026-10-18T10:00:00+08:00');
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, 'T10 测试必须显式使用隔离数据目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 't10-write-'));
  const db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  let clock = instant;
  return { db, dir, now: () => clock, expire: () => { clock += 600001; } };
}

async function invoke(routes, method, endpoint, body) {
  const url = new URL(endpoint, 'http://127.0.0.1');
  const found = match(routes, method, url.pathname);
  assert.ok(found, `接口须存在：${method} ${endpoint}`);
  let status, value;
  const headers = {};
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method; req.url = endpoint; req.headers = { 'content-type': 'application/json' };
  const res = {
    setHeader(name, content) { headers[name.toLowerCase()] = content; },
    writeHead(code, values = {}) { status = code; Object.assign(headers, values); },
    end(content) { value = content; },
  };
  await found.handler(req, res, { params: found.params, url });
  return { status, headers, body: headers['content-type']?.includes('application/json') ? JSON.parse(value) : value };
}

const confirmed = preview => ({ previewId: preview.body.previewId, confirm: true });
const projectSource = () => ({
  projects: [{ id: 'p1', 项目名称: '合成飞书模板', 状态: ['推进中'] }], people: [],
  nodes: [{ id: 'n1', 所属项目: [{ id: 'p1' }], 任务事项: '确认目标', 节点类型: ['普通任务'], 环节阶段: ['启动阶段'], 是否完成: false }],
});
function projectsFor(t) {
  const context = database(t);
  const projects = createProjectService(context.db, { now: context.now, readSource: async () => projectSource() });
  return { ...context, routes: projectRoutes({ projects }) };
}
async function addProject(routes, name = '合成本地项目') {
  const preview = await invoke(routes, 'POST', '/api/v3/local-projects/preview', { name, basedOn: 'p1' });
  assert.equal(preview.status, 200);
  const result = await invoke(routes, 'POST', '/api/v3/local-projects/confirm', confirmed(preview));
  assert.equal(result.status, 200);
  return result.body;
}

test('T10 本地项目 HTTP 新建绑定预览内容、重复确认不重复创建并可回读', async t => {
  const { routes } = projectsFor(t);
  assert.equal((await invoke(routes, 'POST', '/api/v3/local-projects/confirm', { name: '绕过预览' })).status, 400);
  const preview = await invoke(routes, 'POST', '/api/v3/local-projects/preview', { name: '只保存预览名', basedOn: 'p1' });
  assert.equal(preview.status, 200);
  assert.equal((await invoke(routes, 'GET', '/api/v3/projects')).body.length, 1);
  const receipt = await invoke(routes, 'POST', '/api/v3/local-projects/confirm', { ...confirmed(preview), name: '确认时替换无效' });
  assert.equal(receipt.status, 200); assert.equal(receipt.body.name, '只保存预览名');
  assert.deepEqual((await invoke(routes, 'POST', '/api/v3/local-projects/confirm', confirmed(preview))).body, receipt.body);
  const local = (await invoke(routes, 'GET', '/api/v3/projects')).body.filter(row => row.local);
  assert.deepEqual(local, [receipt.body]);
});

test('T10 本地项目 HTTP 新建预览过期或并发同名时拒绝且不产生额外项目', async t => {
  const { routes, expire } = projectsFor(t);
  const expired = await invoke(routes, 'POST', '/api/v3/local-projects/preview', { name: '过期项目', basedOn: 'p1' });
  expire();
  assert.equal((await invoke(routes, 'POST', '/api/v3/local-projects/confirm', confirmed(expired))).status, 409);
  const a = await invoke(routes, 'POST', '/api/v3/local-projects/preview', { name: '并发同名项目', basedOn: 'p1' });
  const b = await invoke(routes, 'POST', '/api/v3/local-projects/preview', { name: '并发同名项目', basedOn: 'p1' });
  assert.equal((await invoke(routes, 'POST', '/api/v3/local-projects/confirm', confirmed(a))).status, 200);
  assert.equal((await invoke(routes, 'POST', '/api/v3/local-projects/confirm', confirmed(b))).status, 409);
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/projects')).body.filter(row => row.local).map(row => row.name), ['并发同名项目']);
});

test('T10 本地项目 HTTP 节点修改拒绝过期与并发旧预览、兼容确认入口幂等', async t => {
  const { routes, expire } = projectsFor(t), project = await addProject(routes);
  const endpoint = `/api/v3/projects/${project.id}`, nodeId = project.nodes[0].id;
  const expired = await invoke(routes, 'POST', `${endpoint}/preview`, { nodeId, done: true });
  expire();
  assert.equal((await invoke(routes, 'PATCH', endpoint, confirmed(expired))).status, 409);
  const a = await invoke(routes, 'POST', `${endpoint}/preview`, { nodeId, done: true, due: '2026-11-20' });
  const b = await invoke(routes, 'POST', `${endpoint}/preview`, { nodeId, done: false, due: '2026-11-21' });
  const receipt = await invoke(routes, 'PATCH', '/api/v3/projects', { id: project.id, ...confirmed(a) });
  assert.equal(receipt.status, 200);
  assert.equal((await invoke(routes, 'PATCH', endpoint, confirmed(b))).status, 409);
  assert.deepEqual((await invoke(routes, 'PATCH', endpoint, confirmed(a))).body, receipt.body);
  const back = (await invoke(routes, 'GET', '/api/v3/projects')).body.find(row => row.id === project.id);
  assert.equal(back.nodes[0].done, true); assert.equal(back.nodes[0].dueDate, '2026-11-20');
});

function marketingFor(t) {
  const context = database(t);
  const blocked = async () => { throw new Error('T10 测试禁止真实外部调用'); };
  const routes = marketingRoutes(context.db, {
    campaign: { now: context.now, readSource: async () => ({ rows: [{ id: 'template-1', 模板序号: 10, 任务事项: '确认目标', 节点类型: ['普通任务'], 环节阶段: ['启动阶段'], 父记录: null }], rev: 1 }) },
    briefs: { now: context.now, exports: { run: blocked } },
    price: { now: context.now, readSource: blocked },
  });
  return { ...context, routes };
}
async function addCampaign(routes, name = '合成测试战役') {
  const preview = await invoke(routes, 'POST', '/api/v3/campaigns/current/preview', { name, start: '2026-10-01', end: '2026-11-30', desc: '隔离回归测试' });
  assert.equal(preview.status, 200);
  const receipt = await invoke(routes, 'PATCH', '/api/v3/campaigns/current', confirmed(preview));
  assert.equal(receipt.status, 200);
  return receipt.body;
}

test('T10 当前战役 HTTP 保存拒绝过期预览、重复确认回执稳定且不覆盖新修改', async t => {
  const { routes, expire } = marketingFor(t), endpoint = '/api/v3/campaigns/current';
  const campaign = await addCampaign(routes);
  const expired = await invoke(routes, 'POST', `${endpoint}/preview`, { review: '过期内容' });
  expire();
  assert.equal((await invoke(routes, 'PATCH', endpoint, confirmed(expired))).status, 409);
  assert.deepEqual((await invoke(routes, 'GET', endpoint)).body, campaign);
  const a = await invoke(routes, 'POST', `${endpoint}/preview`, { review: '第一版复盘' });
  const receipt = await invoke(routes, 'PATCH', endpoint, confirmed(a));
  assert.equal(receipt.status, 200);
  const b = await invoke(routes, 'POST', `${endpoint}/preview`, { review: '第二版复盘' });
  assert.equal((await invoke(routes, 'PATCH', endpoint, confirmed(b))).status, 200);
  assert.deepEqual((await invoke(routes, 'PATCH', endpoint, confirmed(a))).body, receipt.body);
  assert.equal((await invoke(routes, 'GET', endpoint)).body.review, '第二版复盘');
});

test('T10 战役 HTTP 归档拒绝过期与变化预览、重复确认不影响下一场且历史可回读', async t => {
  const { routes, expire } = marketingFor(t), endpoint = '/api/v3/campaigns/current';
  const first = await addCampaign(routes, '第一场');
  assert.equal((await invoke(routes, 'POST', `${endpoint}/archive`, {})).status, 400);
  const expired = await invoke(routes, 'POST', `${endpoint}/archive-preview`);
  expire();
  assert.equal((await invoke(routes, 'POST', `${endpoint}/archive`, confirmed(expired))).status, 409);
  assert.equal((await invoke(routes, 'GET', endpoint)).body.id, first.id);
  const stale = await invoke(routes, 'POST', `${endpoint}/archive-preview`);
  const edit = await invoke(routes, 'POST', `${endpoint}/preview`, { review: '补充复盘' });
  assert.equal((await invoke(routes, 'PATCH', endpoint, confirmed(edit))).status, 200);
  assert.equal((await invoke(routes, 'POST', `${endpoint}/archive`, confirmed(stale))).status, 409);
  const preview = await invoke(routes, 'POST', `${endpoint}/archive-preview`);
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/campaigns/history')).body.items, []);
  const receipt = await invoke(routes, 'POST', `${endpoint}/archive`, confirmed(preview));
  assert.equal(receipt.status, 200);
  assert.equal((await invoke(routes, 'GET', endpoint)).body.id, 'template');
  const second = await addCampaign(routes, '第二场');
  assert.deepEqual((await invoke(routes, 'POST', `${endpoint}/archive`, confirmed(preview))).body, receipt.body);
  assert.equal((await invoke(routes, 'GET', endpoint)).body.id, second.id);
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/campaigns/history')).body.items.map(row => [row.id, row.review]), [[first.id, '补充复盘']]);
});

test('T10 brief HTTP 保存拒绝过期及并发旧预览、绑定月份并重复确认回读一致', async t => {
  const { routes, expire } = marketingFor(t), endpoint = '/api/v3/briefs/2026-11';
  const original = (await invoke(routes, 'GET', endpoint)).body;
  const expired = await invoke(routes, 'POST', `${endpoint}/preview`, { patch: { title: '过期 brief' } });
  assert.equal(expired.status, 200); expire();
  assert.equal((await invoke(routes, 'PUT', endpoint, confirmed(expired))).status, 409);
  assert.deepEqual((await invoke(routes, 'GET', endpoint)).body, original);
  const a = await invoke(routes, 'POST', `${endpoint}/preview`, { patch: { title: '确认的 brief' } });
  const b = await invoke(routes, 'POST', `${endpoint}/preview`, { patch: { title: '并发旧 brief' } });
  assert.equal((await invoke(routes, 'PUT', '/api/v3/briefs/2026-12', confirmed(a))).status, 409);
  const receipt = await invoke(routes, 'PUT', endpoint, { ...confirmed(a), title: '不能替换' });
  assert.equal(receipt.status, 200); assert.equal(receipt.body.title, '确认的 brief');
  assert.equal((await invoke(routes, 'PUT', endpoint, confirmed(b))).status, 409);
  assert.deepEqual((await invoke(routes, 'PUT', endpoint, confirmed(a))).body, receipt.body);
  assert.deepEqual((await invoke(routes, 'GET', endpoint)).body, receipt.body);
});

const attachmentText = 'T10 合成附件，仅供隔离回归。';
const attachmentBody = { name: '回归说明.txt', dataUrl: `data:text/plain;base64,${Buffer.from(attachmentText).toString('base64')}` };
const attachmentsEndpoint = '/api/v3/briefs/2026-11/attachments';
async function addAttachment(routes) {
  const preview = await invoke(routes, 'POST', `${attachmentsEndpoint}/preview`, attachmentBody);
  assert.equal(preview.status, 200);
  const receipt = await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(preview));
  assert.equal(receipt.status, 200);
  return { preview, receipt };
}

test('T10 附件 HTTP 上传过期拒绝、确认绑定月份并幂等、文件经下载回读一致', async t => {
  const { routes, expire } = marketingFor(t);
  const expired = await invoke(routes, 'POST', `${attachmentsEndpoint}/preview`, attachmentBody);
  assert.equal(expired.status, 200); expire();
  assert.equal((await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(expired))).status, 409);
  assert.deepEqual((await invoke(routes, 'GET', attachmentsEndpoint)).body.items, []);
  const { preview, receipt } = await addAttachment(routes);
  assert.equal((await invoke(routes, 'POST', '/api/v3/briefs/2026-12/attachments/confirm', confirmed(preview))).status, 409);
  assert.deepEqual((await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(preview))).body, receipt.body);
  assert.deepEqual((await invoke(routes, 'GET', attachmentsEndpoint)).body.items, [receipt.body]);
  const file = await invoke(routes, 'GET', `${attachmentsEndpoint}/${receipt.body.id}/file`);
  assert.equal(file.status, 200); assert.equal(file.body.toString('utf8'), attachmentText);
});

test('T10 附件 HTTP 删除过期拒绝、并发旧预览拒绝、重复确认后列表与文件均不存在', async t => {
  const { routes, expire } = marketingFor(t), { receipt } = await addAttachment(routes);
  const endpoint = `${attachmentsEndpoint}/${receipt.body.id}`;
  const expired = await invoke(routes, 'POST', `${endpoint}/remove-preview`);
  expire();
  assert.equal((await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(expired))).status, 409);
  assert.equal((await invoke(routes, 'GET', `${endpoint}/file`)).status, 200);
  const a = await invoke(routes, 'POST', `${endpoint}/remove-preview`);
  const b = await invoke(routes, 'POST', `${endpoint}/remove-preview`);
  assert.equal((await invoke(routes, 'GET', attachmentsEndpoint)).body.items.length, 1);
  const removal = await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(a));
  assert.equal(removal.status, 200);
  assert.equal((await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(b))).status, 409);
  assert.deepEqual((await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(a))).body, removal.body);
  assert.deepEqual((await invoke(routes, 'GET', attachmentsEndpoint)).body.items, []);
  assert.equal((await invoke(routes, 'GET', `${endpoint}/file`)).status, 404);
});

// 已复现：第一次 EACCES 后记录已删除，第二次回执为 ok，文件仍遗留。
// T11-1 保留首败，并正式断言失败后的一致性与同令牌重试。
test('T10 附件删除文件失败后重试不得返回文件仍遗留的成功回执', async t => {
  const { routes, dir } = marketingFor(t), { receipt } = await addAttachment(routes);
  const target = fs.realpathSync(path.join(dir, 'brief-attachments', '2026-11', receipt.body.file));
  const endpoint = `${attachmentsEndpoint}/${receipt.body.id}`;
  const preview = await invoke(routes, 'POST', `${endpoint}/remove-preview`);
  assert.equal(preview.status, 200); assert.equal(fs.existsSync(target), true);

  // 不依赖进程用户权限：仅使这一个隔离文件第一次删除返回 EACCES。
  // 文件系统恢复正常后再次确认，业务应完成清理或继续报告失败，不能假报成功。
  let injected = false;
  const originalRemove = fs.rmSync;
  const removalMock = t.mock.method(fs, 'rmSync', (file, options) => {
    if (file === target && !injected) {
      injected = true;
      throw Object.assign(new Error('T10 合成文件删除失败'), { code: 'EACCES' });
    }
    return originalRemove(file, options);
  });
  let observations;
  try {
    const first = await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(preview));
    const afterFirst = await invoke(routes, 'GET', attachmentsEndpoint);
    const firstFileStillExists = fs.existsSync(target);
    const retry = await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(preview));
    const afterRetry = await invoke(routes, 'GET', attachmentsEndpoint);
    const fileEndpoint = await invoke(routes, 'GET', `${endpoint}/file`);
    observations = {
      faultInjected: injected,
      firstStatus: first.status, firstBody: first.body,
      recordsAfterFirst: afterFirst.body.items.length, fileExistsAfterFirst: firstFileStillExists,
      retryStatus: retry.status, retryBody: retry.body,
      recordsAfterRetry: afterRetry.body.items.length, fileExistsAfterRetry: fs.existsSync(target),
      fileEndpointAfterRetry: fileEndpoint.status,
    };
  } finally { removalMock.mock.restore(); }
  t.diagnostic(`附件隔离故障实测：${JSON.stringify(observations)}`);
  assert.equal(observations.faultInjected, true, '须实际命中文件系统故障');
  assert.equal(observations.firstStatus, 500, '首次应报告删除失败');
  assert.equal(observations.recordsAfterFirst, 1);
  assert.equal(observations.fileExistsAfterFirst, true);
  assert.equal(observations.retryStatus, 200);
  assert.equal(observations.recordsAfterRetry, 0);
  assert.equal(observations.fileExistsAfterRetry, false);
  assert.equal(observations.fileEndpointAfterRetry, 404);
});

function needsFor(t) {
  const context = database(t);
  const timeline = async () => ({ stage: '本科', agenda: [] });
  const needs = createNeedsService(context.db, timeline, { now: context.now });
  const manualNeeds = createManualNeeds(context.db, { now: context.now });
  return { ...context, routes: userRoutes({ timeline, needs, manualNeeds }) };
}
async function addManualNeed(routes, need = '合成需求') {
  const preview = await invoke(routes, 'POST', '/api/v3/manual-needs/preview', { month: '2026-11', need });
  assert.equal(preview.status, 200);
  const receipt = await invoke(routes, 'POST', '/api/v3/manual-needs/confirm', confirmed(preview));
  assert.equal(receipt.status, 200);
  return receipt.body;
}

test('T10 手写需求 HTTP 删除过期拒绝、并发旧预览拒绝、重复确认后两处列表均无草稿', async t => {
  const { routes, expire } = needsFor(t), need = await addManualNeed(routes);
  const endpoint = `/api/v3/manual-needs/${need.id}/remove-preview`;
  const expired = await invoke(routes, 'POST', endpoint);
  expire();
  assert.equal((await invoke(routes, 'POST', '/api/v3/manual-needs/confirm', confirmed(expired))).status, 409);
  assert.equal((await invoke(routes, 'GET', '/api/v3/manual-needs')).body.records.length, 1);
  const a = await invoke(routes, 'POST', endpoint), b = await invoke(routes, 'POST', endpoint);
  assert.equal((await invoke(routes, 'POST', '/api/v3/manual-needs/confirm', { previewId: a.body.previewId })).status, 400);
  const receipt = await invoke(routes, 'POST', '/api/v3/manual-needs/confirm', confirmed(a));
  assert.equal(receipt.status, 200);
  assert.equal((await invoke(routes, 'POST', '/api/v3/manual-needs/confirm', confirmed(b))).status, 409);
  assert.deepEqual((await invoke(routes, 'POST', '/api/v3/manual-needs/confirm', confirmed(a))).body, receipt.body);
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/manual-needs')).body.records, []);
  assert.deepEqual((await invoke(routes, 'GET', '/api/v3/needs?month=2026-11')).body.needs, []);
});

test('T10 需求策略 HTTP PATCH 拒绝过期和并发旧预览、重复确认不覆盖较新策略', async t => {
  const { routes, expire } = needsFor(t), need = await addManualNeed(routes);
  const endpoint = `/api/v3/needs/${need.need.id}`;
  const adoption = await invoke(routes, 'POST', `${endpoint}/preview`, { month: '2026-11' });
  assert.equal((await invoke(routes, 'POST', `${endpoint}/adopt`, confirmed(adoption))).status, 200);
  const strategy = goal => ({ month: '2026-11', strategy: { goal, actions: { 营销: [['核实需求', '避免错误转化']], 产品: [], 运营: [] } } });
  const expired = await invoke(routes, 'POST', `${endpoint}/preview`, strategy('过期策略'));
  assert.equal(expired.status, 200); expire();
  assert.equal((await invoke(routes, 'PATCH', `${endpoint}/strategy`, confirmed(expired))).status, 409);
  const a = await invoke(routes, 'POST', `${endpoint}/preview`, strategy('第一版策略'));
  const stale = await invoke(routes, 'POST', `${endpoint}/preview`, strategy('并发旧策略'));
  const receipt = await invoke(routes, 'PATCH', `${endpoint}/strategy`, confirmed(a));
  assert.equal(receipt.status, 200);
  assert.equal((await invoke(routes, 'PATCH', `${endpoint}/strategy`, confirmed(stale))).status, 409);
  const b = await invoke(routes, 'POST', `${endpoint}/preview`, strategy('第二版策略'));
  assert.equal((await invoke(routes, 'PATCH', `${endpoint}/strategy`, confirmed(b))).status, 200);
  assert.deepEqual((await invoke(routes, 'PATCH', `${endpoint}/strategy`, confirmed(a))).body, receipt.body);
  const back = (await invoke(routes, 'GET', '/api/v3/needs?month=2026-11')).body.needs;
  assert.equal(back.length, 1); assert.equal(back[0].strategy.goal, '第二版策略');
});

function settingsFor(t) {
  const context = database(t);
  const blocked = async () => { throw new Error('T10 配置测试禁止真实外部调用'); };
  const routes = workspaceRoutes(context.db, { readDocument: blocked }, { run: blocked }, {
    settings: { now: context.now }, projects: { readSource: blocked }, mentor: { readLogs: blocked },
    kb: { readSource: blocked }, timeline: { readSheets: blocked }, voice: { run: blocked },
  });
  return { ...context, routes };
}

test('T10 V3 配置 HTTP 拒绝过期、跨键和并发旧预览，重复确认不改回新值', async t => {
  const { routes, expire } = settingsFor(t), endpoint = '/api/settings/voice_budget';
  const expired = await invoke(routes, 'POST', `${endpoint}/preview`, { value: '4' });
  assert.equal(expired.status, 200); expire();
  assert.equal((await invoke(routes, 'PUT', endpoint, confirmed(expired))).status, 409);
  assert.deepEqual((await invoke(routes, 'GET', '/api/settings')).body, {});
  const a = await invoke(routes, 'POST', `${endpoint}/preview`, { value: '5' });
  const stale = await invoke(routes, 'POST', `${endpoint}/preview`, { value: '3' });
  assert.equal((await invoke(routes, 'PUT', '/api/settings/price_cost_per_hour', confirmed(a))).status, 409);
  const receipt = await invoke(routes, 'PUT', endpoint, { ...confirmed(a), value: '1' });
  assert.equal(receipt.status, 200); assert.equal(receipt.body.value, '5');
  assert.equal((await invoke(routes, 'PUT', endpoint, confirmed(stale))).status, 409);
  const b = await invoke(routes, 'POST', `${endpoint}/preview`, { value: '2' });
  assert.equal((await invoke(routes, 'PUT', endpoint, confirmed(b))).status, 200);
  assert.deepEqual((await invoke(routes, 'PUT', endpoint, confirmed(a))).body, receipt.body);
  assert.equal((await invoke(routes, 'GET', '/api/settings')).body.voice_budget, '2');
  assert.equal((await invoke(routes, 'GET', '/api/v3/settings')).body.saved.voice_budget, '2');
});

// 2026-10-18 首败已复现：四键预览均 400，直接 PUT 均 200 且 GET 可读。
// T11-1 将原失败目标转为正式断言；旧首败保留在 T10 交接。
test('T10 旧配置四键应拒绝未预览确认的直接 PUT', async t => {
  const { routes } = settingsFor(t);
  const values = {
    brand_base_url: 'https://example.feishu.cn/base/T10Synthetic',
    report_doc_url: 'https://example.feishu.cn/docx/T10SyntheticDaily',
    weekly_doc_url: 'https://example.feishu.cn/docx/T10SyntheticWeekly',
    material_types: '["合成测试物料"]',
  };
  const observations = [];
  for (const [key, value] of Object.entries(values)) {
    const preview = await invoke(routes, 'POST', `/api/settings/${key}/preview`, { value });
    const result = await invoke(routes, 'PUT', `/api/settings/${key}`, { value });
    const back = await invoke(routes, 'GET', '/api/settings');
    observations.push({ key, previewStatus: preview.status, directPutStatus: result.status, savedWithoutPreview: back.body[key] === value });
  }
  assert.ok(observations.every(item => item.previewStatus === 200), '四键预览须成功且不写入');
  t.diagnostic(`隔离数据实测：${JSON.stringify(observations)}`);
  assert.ok(observations.every(item => item.directPutStatus === 400 && !item.savedWithoutPreview), 'T10 要求全部写入先预览确认；旧配置仍允许直接保存，待 Claude 判定兼容迁移方案');
});

const legacySettings = {
  brand_base_url: 'https://example.feishu.cn/base/T11Synthetic',
  report_doc_url: 'https://example.feishu.cn/base/T11DailyLegacy',
  weekly_doc_url: 'https://example.feishu.cn/docx/T11Weekly',
  material_types: '["海报","社群图"]',
};
test('T11 旧四键预览形状与TTL拒绝、不写入', async t => {
  const { routes, expire } = settingsFor(t);
  const previews = [];
  for (const [key, value] of Object.entries(legacySettings)) {
    const p = await invoke(routes, 'POST', `/api/settings/${key}/preview`, { value });
    assert.equal(p.status, 200);
    assert.deepEqual(Object.keys(p.body).sort(), ['before', 'expiresAt', 'key', 'previewId', 'value']);
    assert.equal(p.body.key, key); assert.equal(p.body.before, null); assert.equal(p.body.value, value);
    assert.equal(Date.parse(p.body.expiresAt), instant + 600000);
    previews.push([key, p]);
  }
  assert.deepEqual((await invoke(routes, 'GET', '/api/settings')).body, {});
  expire();
  for (const [key, p] of previews) assert.equal((await invoke(routes, 'PUT', `/api/settings/${key}`, confirmed(p))).status, 409);
  assert.deepEqual((await invoke(routes, 'GET', '/api/settings')).body, {});
});
test('T11 旧四键旧值变化后拒绝，确认不可夹带替换内容', async t => {
  const { routes } = settingsFor(t);
  for (const [key, value] of Object.entries(legacySettings)) {
    const endpoint = `/api/settings/${key}`;
    const a = await invoke(routes, 'POST', `${endpoint}/preview`, { value });
    const b = await invoke(routes, 'POST', `${endpoint}/preview`, { value });
    assert.equal((await invoke(routes, 'PUT', endpoint, { ...confirmed(a), value })).status, 400);
    assert.equal((await invoke(routes, 'PUT', endpoint, confirmed(a))).status, 200);
    assert.equal((await invoke(routes, 'PUT', endpoint, confirmed(b))).status, 409);
    assert.equal((await invoke(routes, 'GET', '/api/settings')).body[key], value);
  }
});
test('T11 旧四键重复确认返回原回执、不重复写或覆盖新值', async t => {
  const { routes, db } = settingsFor(t);
  for (const [key, value] of Object.entries(legacySettings)) {
    const endpoint = `/api/settings/${key}`;
    const a = await invoke(routes, 'POST', `${endpoint}/preview`, { value });
    const receipt = await invoke(routes, 'PUT', endpoint, confirmed(a));
    assert.equal(receipt.status, 200);
    const next = key === 'material_types' ? '["新物料"]' : value + 'Next';
    const b = await invoke(routes, 'POST', `${endpoint}/preview`, { value: next });
    assert.equal((await invoke(routes, 'PUT', endpoint, confirmed(b))).status, 200);
    const writes = db.prepare('SELECT total_changes() AS n').get().n;
    assert.deepEqual((await invoke(routes, 'PUT', endpoint, confirmed(a))).body, receipt.body);
    assert.equal(db.prepare('SELECT total_changes() AS n').get().n, writes);
    assert.equal((await invoke(routes, 'GET', '/api/settings')).body[key], next);
  }
});
test('T11 清空周报来源删除行并回读缺键，重复确认不再写', async t => {
  const { routes, db } = settingsFor(t), endpoint = '/api/settings/weekly_doc_url';
  const a = await invoke(routes, 'POST', `${endpoint}/preview`, { value: legacySettings.weekly_doc_url });
  assert.equal((await invoke(routes, 'PUT', endpoint, confirmed(a))).status, 200);
  const clear = await invoke(routes, 'POST', `${endpoint}/preview`, { value: '' });
  assert.equal(clear.status, 200); assert.equal(clear.body.before, legacySettings.weekly_doc_url);
  assert.equal((await invoke(routes, 'GET', '/api/settings')).body.weekly_doc_url, legacySettings.weekly_doc_url);
  const receipt = await invoke(routes, 'PUT', endpoint, confirmed(clear));
  assert.equal(receipt.status, 200); assert.deepEqual(receipt.body, { key: 'weekly_doc_url', value: '' });
  assert.equal(Object.hasOwn((await invoke(routes, 'GET', '/api/settings')).body, 'weekly_doc_url'), false);
  const writes = db.prepare('SELECT total_changes() AS n').get().n;
  assert.deepEqual((await invoke(routes, 'PUT', endpoint, confirmed(clear))).body, receipt.body);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n, writes);
});

for (const mode of ['hash', 'read']) {
  test(`T11 附件新增${mode === 'hash' ? '哈希不一致' : '读文件抛错'}不留记录或文件，重试不得假成功`, async t => {
    const { routes, dir } = marketingFor(t);
    const preview = await invoke(routes, 'POST', `${attachmentsEndpoint}/preview`, attachmentBody);
    assert.equal(preview.status, 200);
    const target = path.join(fs.realpathSync(dir), 'brief-attachments', '2026-11', preview.body.value.file);
    const originalRead = fs.readFileSync;
    let hits = 0;
    const mocked = t.mock.method(fs, 'readFileSync', (file, ...args) => {
      if (file === target) {
        hits++;
        if (mode === 'read') throw Object.assign(new Error('T11 合成读取错误'), { code: 'EIO' });
        return Buffer.from('T11 与原附件不一致');
      }
      return originalRead(file, ...args);
    });
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(preview));
        const records = (await invoke(routes, 'GET', attachmentsEndpoint)).body.items.length;
        const file = fs.existsSync(target);
        t.diagnostic(JSON.stringify({ mode, attempt, status: result.status, records, file, hits }));
        assert.equal(result.status, 500); assert.equal(records, 0); assert.equal(file, false);
      }
      assert.equal(hits, 2);
    } finally { mocked.mock.restore(); }
    const retry = await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(preview));
    assert.equal(retry.status, 200);
    assert.equal((await invoke(routes, 'GET', attachmentsEndpoint)).body.items.length, 1);
    assert.equal(fs.readFileSync(target, 'utf8'), attachmentText);
    assert.deepEqual((await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(preview))).body, retry.body);
  });
}

for (const action of ['upload', 'remove']) {
  test(`T11 附件${action}提交失败补偿文件与记录，同令牌可重试`, async t => {
    const { routes, dir, db } = marketingFor(t);
    let preview, target;
    if (action === 'remove') {
      const { receipt } = await addAttachment(routes);
      target = path.join(fs.realpathSync(dir), 'brief-attachments', '2026-11', receipt.body.file);
      preview = await invoke(routes, 'POST', `${attachmentsEndpoint}/${receipt.body.id}/remove-preview`);
    } else {
      preview = await invoke(routes, 'POST', `${attachmentsEndpoint}/preview`, attachmentBody);
      target = path.join(fs.realpathSync(dir), 'brief-attachments', '2026-11', preview.body.value.file);
    }
    assert.equal(preview.status, 200);
    const originalExec = db.exec.bind(db);
    let injected = false;
    const mocked = t.mock.method(db, 'exec', sql => {
      if (sql === 'COMMIT' && !injected) { injected = true; throw new Error('T11 合成COMMIT失败'); }
      return originalExec(sql);
    });
    try {
      const result = await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(preview));
      assert.equal(injected, true); assert.equal(result.status, 500);
      assert.equal((await invoke(routes, 'GET', attachmentsEndpoint)).body.items.length, action === 'remove' ? 1 : 0);
      assert.equal(fs.existsSync(target), action === 'remove');
      if (action === 'remove') assert.equal(fs.readFileSync(target, 'utf8'), attachmentText);
    } finally { mocked.mock.restore(); }
    const retry = await invoke(routes, 'POST', `${attachmentsEndpoint}/confirm`, confirmed(preview));
    assert.equal(retry.status, 200);
    assert.equal((await invoke(routes, 'GET', attachmentsEndpoint)).body.items.length, action === 'remove' ? 0 : 1);
    assert.equal(fs.existsSync(target), action === 'upload');
  });
}
