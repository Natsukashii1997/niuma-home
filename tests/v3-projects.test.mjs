import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { openDb, saveSetting } from '../server/db.mjs';
import { createProjectService, matrixRows, projectView, readProjectSource, runLark } from '../server/projects.mjs';
import { createMentorService, datedHeadings, mentorView, mentorQuestions, readMentorLogs } from '../server/mentor.mjs';
import { createKnowledgeTreeService, knowledgeView, previewKnowledgeChanges, readKnowledgeSource } from '../server/knowledge-tree.mjs';
import { createProjectServices, projectRoutes } from '../server/routes/projects.mjs';
import { match, json } from '../server/http.mjs';

const instant = Date.parse('2026-10-16T14:00:00+08:00');
function dbFor(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '测试必须使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'v3-projects-'));
  const db = openDb(dir); t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); }); return db;
}
function projectSource() {
  return { projects: [{ id: 'p1', '项目名称': '真实项目', '状态': ['推进中'] }], people: [{ id: 'u1', '成员名': '人员甲' }], nodes: [
    { id: 'n1', '所属项目': [{ id: 'p1' }], '任务事项': '设计', '节点类型': ['里程碑', '审核门禁'], '环节阶段': ['实施阶段', '监控阶段'], '主责任人': [{ id: 'u1' }], '是否完成': null, '截止时间': '2027-01-02T00:00:00.000+08:00' },
    { id: 'n2', '所属项目': [{ id: 'p1' }], '任务事项': '子任务', '父记录': [{ id: 'n1' }], '环节阶段': ['实施阶段'], '是否完成': true, '截止时间': null },
  ] };
}
const source = { name: '人员甲', role: '管培生', year: 2026, url: 'https://example.feishu.cn/docx/abc' };
const outline = '<fragment><h1 id="a">10.16 工作进展</h1><h1 id="b">9.17 调研</h1><h1 id="c">9.16 旧日志</h1></fragment>';
const headings = () => datedHeadings(outline, 2026);
const logXml = '<fragment><h1 id="a">10.16 工作进展</h1><h2 id="h2four">四、疑问/结论</h2><p id="pBlock0001">卡点：尚未取得<b>数据</b></p><ul><li id="pAsk000001"><b>困惑 1：</b>下一步找谁确认？</li></ul><h1 id="b">9.17 调研</h1><p id="pDone00001">完成访谈</p><h1 id="c">9.16 旧日志</h1><p id="pOld000001">旧的卡点</p></fragment>';
function kbSource() {
  const content = '这是一篇真实文档正文用于核验目录节点和正文信息同时保留。'.repeat(3);
  return { nodes: [
    { node_token: 'root', obj_token: 'doc1', parent_node_token: '', obj_type: 'docx', title: '真实目录', has_child: true },
    { node_token: 'child', obj_token: 'doc2', parent_node_token: 'root', obj_type: 'docx', title: '真实目录（副本）', has_child: false },
    { node_token: 'binary', obj_token: 'file1', parent_node_token: '', obj_type: 'file', title: '附件', has_child: false },
  ], metadata: { doc1: { latest_modify_time: '1792108800', url: 'https://example.feishu.cn/docx/doc1' }, doc2: { latest_modify_time: '1792108800' }, file1: { latest_modify_time: '1792108800' } }, contents: { root: content, child: content }, errors: { binary: 'file 正文暂不支持字数、摘要及相似度读取' } };
}

test('V3 项目矩阵完整性、真实阶段、多值门禁与跨年日期不推断', () => {
  assert.throws(() => matrixRows({ fields: ['a'], data: [[1]], record_id_list: [], has_more: false }), /不完整/);
  assert.throws(() => matrixRows({ fields: ['a'], data: [[1]], record_id_list: ['a'], has_more: true }), /不完整/);
  const [project] = projectView(projectSource());
  assert.equal(project.phase, 0); assert.equal(project.status, '推进中'); assert.deepEqual(project.phases, ['实施', '监控']);
  assert.equal(project.nodes[0].ph, '实施 / 监控'); assert.equal(project.nodes[0].gate, true);
  // 勾选框为空 = 未完成（与飞书「任务完成度」同一口径）
  assert.equal(project.nodes[0].gateReady, false); assert.equal(project.nodes[0].statusKnown, true); assert.equal(project.nodes[0].done, false);
  assert.equal(project.taskCount, 2); assert.equal(project.taskDone, 1);
  assert.equal(project.nodes[0].dueDate, '2027-01-02'); assert.equal(project.nodes[0].due, '01-02');
  assert.deepEqual(project.nodes[0].kids, [['子任务', true]]);
  // 阶段按飞书选项顺序；交付物解析链接；营销战役不进项目推进
  const real = projectSource();
  real.stages = ['启动阶段', '计划阶段', '实施阶段', '监控阶段'];
  real.nodes[1]['交付物'] = '[PRD 文档](https://example.feishu.cn/docx/a) [测试用例](https://example.feishu.cn/docx/b)';
  real.nodes[0]['逾期状态'] = '进行中·已逾期'; real.nodes[0]['开始时间'] = '2026-12-20T00:00:00.000+08:00';
  real.projects.push({ id: 'p2', '项目名称': '双十一', '状态': ['推进中'], '项目类型': ['营销战役'] });
  real.projects[0]['项目类型'] = ['产品项目']; real.projects[0]['任务完成度'] = 0.5;
  const shown = projectView(real);
  assert.deepEqual(shown.map(p => p.name), ['真实项目']); assert.equal(shown[0].completion, 0.5);
  assert.equal(shown[0].nodes[0].overdue, '进行中·已逾期'); assert.equal(shown[0].nodes[0].startDate, '2026-12-20');
  assert.deepEqual(shown[0].nodes[0].childNodes[0].deliverables, [{ title: 'PRD 文档', url: 'https://example.feishu.cn/docx/a' }, { title: '测试用例', url: 'https://example.feishu.cn/docx/b' }]);
  const bad = projectSource(); bad.nodes[0]['截止时间'] = '2026-02-30'; assert.throws(() => projectView(bad), /日期无效/);
  bad.nodes[0]['截止时间'] = null; bad.nodes[0]['父记录'] = [{ id: 'n2' }]; assert.throws(() => projectView(bad), /循环/);
});

test('V3 飞书读取强制codex/user并拒绝非用户身份、截断结果', async () => {
  let called;
  const run = async (command, args, options) => { called = { command, args, options }; return { stdout: JSON.stringify({ ok: true, identity: 'user', data: { items: [] } }) }; };
  assert.deepEqual(await runLark(['wiki', '+node-list'], run), { items: [] });
  assert.deepEqual(called.args.slice(0, 2), ['--profile', 'codex']); assert.ok(called.args.includes('user')); assert.equal(called.options.shell, false);
  await assert.rejects(runLark([], async () => ({ stdout: JSON.stringify({ ok: true, identity: 'bot', data: {} }) })), /用户身份/);
});

test('V3 项目真实CLI读取使用JSON上限200并完整分页关联读取', async () => {
  const calls = [];
  const run = async (_file, args) => {
    calls.push(args); let data;
    if (args.includes('+field-list')) data = { fields: [{ name: '所属项目', link_table: 'projects' }, { name: '主责任人', link_table: 'people' }] };
    else if (args.includes('+record-list')) {
      assert.equal(args[args.indexOf('--limit') + 1], '200');
      const offset = args[args.indexOf('--offset') + 1];
      data = { fields: ['所属项目', '主责任人'], data: offset === '0' ? [[[{ id: 'p' }], [{ id: 'u' }]]] : [[[{ id: 'p' }], []]], record_id_list: [offset === '0' ? 'n1' : 'n2'], has_more: offset === '0', rev: 2 };
    } else data = args.includes('projects') ? { fields: ['项目名称', '状态'], data: [['项目', ['推进中']]], record_id_list: ['p'], has_more: false } : { fields: ['成员名'], data: [['人员甲']], record_id_list: ['u'], has_more: false };
    return { stdout: JSON.stringify({ ok: true, identity: 'user', data }) };
  };
  const result = await readProjectSource({ url: 'https://example.feishu.cn/base/test', table: 'tbltest' }, { run });
  assert.equal(result.nodes.length, 2); assert.equal(result.people[0]['成员名'], '人员甲'); assert.equal(calls.length, 5);
});

test('V3 项目缓存懒加载、配置失效、失败不返回旧快照', async t => {
  const db = dbFor(t); let reads = 0, fail = false;
  const service = createProjectService(db, { now: () => instant, readSource: async () => { reads++; if (fail) throw new Error('读取失败'); return projectSource(); } });
  assert.equal(reads, 0); await service.list(); await service.list(); assert.equal(reads, 1);
  saveSetting(db, 'project_table_id', 'tblChanged'); await service.list(); assert.equal(reads, 2);
  fail = true; await assert.rejects(service.list({ refresh: true }), /读取失败/); await assert.rejects(service.list(), /读取失败/);
  assert.equal(reads, 3);
});

test('V3 项目勾选和改期先预览后确认、并发与旧回执稳定', async t => {
  const db = dbFor(t), service = createProjectService(db, { now: () => instant, readSource: async () => projectSource() });
  await assert.rejects(service.confirm('p1', { nodeId: 'n1', done: true }), /先预览/);
  const first = await service.preview('p1', { nodeId: 'n1', done: true, due: '2027-02-01' });
  assert.equal((await service.list())[0].nodes[0].done, false);
  const confirmed = await service.confirm('p1', { confirm: true, previewId: first.previewId, done: false });
  assert.equal(confirmed.nodes[0].done, true); assert.equal(confirmed.nodes[0].due, '02-01');
  const second = await service.preview('p1', { nodeId: 'n1', done: false });
  await service.confirm('p1', { confirm: true, previewId: second.previewId });
  assert.deepEqual(await service.confirm('p1', { confirm: true, previewId: first.previewId }), confirmed);
  const a = await service.preview('p1', { nodeId: 'n1', done: true }), b = await service.preview('p1', { nodeId: 'n2', done: false });
  const result = await Promise.allSettled([service.confirm('p1', { confirm: true, previewId: a.previewId }), service.confirm('p1', { confirm: true, previewId: b.previewId })]);
  assert.deepEqual(result.map(r => r.status).sort(), ['fulfilled', 'rejected']);
});

test('V3 近30天日志按明确年份及倒序跨年、只提取提问而不提取卡点陈述', () => {
  const person = mentorView(source, headings(), logXml, instant);
  assert.deepEqual(person.logs.map(l => l.date), ['2026-10-16', '2026-09-17']);
  assert.equal(person.logs[0].flag, '提问'); assert.equal(person.logs[1].flag, '');
  assert.equal(person.qa, null); assert.equal(person.draft, true); assert.equal(person.blocks.length, 0);
  // 原话逐句保留段落 ID，能跳回飞书那一段
  assert.deepEqual(person.items.map(i => [i.kind, i.text, i.id]), [['提问', '困惑 1：下一步找谁确认？', 'pAsk000001']]);
  assert.equal(person.items[0].src, `${source.url}#pAsk000001`);
  assert.deepEqual(datedHeadings('<h1 id="a">1.2 新年</h1><h1 id="b">12.30 年末</h1>', 2027).map(h => h.date), ['2027-01-02', '2026-12-30']);
  assert.throws(() => datedHeadings('<h1 id="a">9.2 后文</h1><h1 id="b">10.1 前文</h1>', 2026), /无法可靠补全年份/);
  assert.throws(() => mentorView(source, headings(), '<h1 id="a">10.16 工作进展</h1><p id="pBody00001">正文</p>', instant), /未完整读取/);
});

test('带教兼容旧快照：真实问句保留原文及回复，普通卡点不改名冒充提问', () => {
  const original = mentorView(source, headings(), logXml, instant);
  const legacy = { ...original, blocks: ['卡点陈述'], items: [
    ...original.items,
    { id: 'legacyAsk1', kind: '卡点', text: '卡点：下一步找谁确认？', date: '2026-10-16', src: `${source.url}#legacyAsk1`, reply: { state: 'sent', text: '历史回复' } },
    { id: 'legacyBlock', kind: '卡点', text: '卡点：数据未拿到', date: '2026-10-16' },
  ] };
  const normalized = mentorQuestions(legacy);
  assert.deepEqual(normalized.items.map(i => i.id), ['pAsk000001', 'legacyAsk1']);
  assert.ok(normalized.items.every(i => i.kind === '提问'));
  assert.equal(normalized.items[1].text, '卡点：下一步找谁确认？');
  assert.deepEqual(normalized.items[1].reply, legacy.items[1].reply);
  assert.equal(normalized.items[1].src, legacy.items[1].src);
  assert.deepEqual(normalized.evidence, legacy.evidence);
  assert.deepEqual(normalized.blocks, []);
  assert.equal(legacy.items.length, 3, '不改写旧快照或删除原文');
});

test('带教长段提问截短后仍保留，不能因末尾问号不在摘要里而丢失', () => {
  const xml = logXml.replace('<b>困惑 1：</b>下一步找谁确认？', '目前的方案说明。'.repeat(80) + '下一步找谁确认？');
  const person = mentorView(source, headings(), xml, instant);
  assert.equal(person.items.length, 1);
  assert.equal(person.items[0].id, 'pAsk000001');
  assert.equal(person.items[0].text.length, 500);
  assert.equal(mentorQuestions(person).items.length, 1);
});

test('V3 带教目录先读XML并固定版本范围读取，无近30天时不拉全文', async () => {
  const calls = [];
  const run = async (_command, args) => {
    calls.push(args);
    return { stdout: JSON.stringify({ ok: true, identity: 'user', data: { document: { revision_id: 7, content: args.includes('outline') ? outline : logXml } } }) };
  };
  const person = await readMentorLogs(source, { run, now: () => instant });
  assert.equal(person.logs.length, 2); assert.equal(calls.length, 2);
  assert.ok(calls[0].includes('xml')); assert.ok(calls[1].includes('--revision-id')); assert.ok(calls[1].includes('c'));
  calls.length = 0; await readMentorLogs({ ...source, year: 2025 }, { run, now: () => instant }); assert.equal(calls.length, 1);
});

test('V3 带教结论仅本地预览确认回读，来源变更不混用历史', async t => {
  const db = dbFor(t); saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  let reads = 0;
  const service = createMentorService(db, { now: () => instant, readLogs: async s => { reads++; return mentorView(s, headings(), logXml, instant); } });
  const preview = service.preview(source.name, { week: '2026-W42', note: '先核实卡点' });
  assert.equal(reads, 0); assert.deepEqual((await service.list())[0].history, []);
  assert.throws(() => service.confirm(source.name, { week: '2026-W42' }), /先预览/);
  const receipt = service.confirm(source.name, { week: '2026-W42', previewId: preview.previewId, confirm: true, note: '替换无效' });
  assert.equal(receipt.note, '先核实卡点'); assert.deepEqual((await service.list())[0].history, ['2026-W42']);
  saveSetting(db, 'mentor_sources', JSON.stringify([{ ...source, url: 'https://example.feishu.cn/docx/newdoc' }]));
  assert.deepEqual((await service.list())[0].history, []); assert.equal(reads, 2);
});

test('V3 知识树目录保留正文、不可读不伪造0、重复需标题及正文双证据', () => {
  const view = knowledgeView({ ...kbSource(), space: { space_id: '7672588453183261977', name: '路觅策略知识库' } }, instant);
  assert.equal(view.space, '路觅策略知识库');
  assert.equal(view.spaceId, '7672588453183261977');
  assert.equal(view.tree[0].kids[0].id, 'child'); assert.ok(view.docs.root.chars > 40);
  assert.equal(view.docs.child.dupOf, 'root'); assert.equal(view.docs.binary.chars, null);
  assert.equal(view.docs.root.referencesComplete, false);
  const changed = kbSource(); changed.contents.child = '完全不同的内容。'.repeat(20);
  assert.equal(knowledgeView(changed, instant).docs.child.dupOf, undefined);
});

test('V3 知识树变更只预览，禁止同名目录猜测、删除与循环', () => {
  const kb = knowledgeView(kbSource(), instant);
  const result = previewKnowledgeChanges(kb, { ops: [{ type: 'mkdir', id: 'new1', name: '归档', parentId: '' }, { type: 'move', id: 'child', parentId: 'new1' }, { type: 'rename', id: 'child', name: '新名称' }] });
  assert.equal(result.writeEnabled, false); assert.equal(result.operations.length, 3); assert.equal(kb.tree[0].kids[0].name, '真实目录（副本）');
  assert.throws(() => previewKnowledgeChanges(kb, { ops: [{ type: 'move', id: 'child', to: '归档' }] }), /父节点ID/);
  assert.throws(() => previewKnowledgeChanges(kb, { ops: [{ type: 'move', id: 'root', parentId: 'child' }] }), /子节点/);
  assert.throws(() => previewKnowledgeChanges(kb, { ops: [{ type: 'delete', id: 'child' }] }), /仅支持/);
});

test('V3 知识树分页与来源身份校验，失败不保存成功水位', async t => {
  const db = dbFor(t); let reads = 0;
  const service = createKnowledgeTreeService(db, { now: () => instant, readSource: async () => { reads++; return kbSource(); } });
  assert.equal(reads, 0); await service.list(); assert.equal(reads, 1);
  assert.equal(db.prepare('SELECT identity FROM v3_source_status WHERE kind=?').get('kb').identity, '7620758074885835965');
  saveSetting(db, 'kb_space_id', '999'); await service.list(); assert.equal(reads, 2);
  await assert.rejects(readKnowledgeSource({ spaceId: '1' }, { run: async (_file,args) => ({ stdout: JSON.stringify({ ok: true, identity: 'user', data: args.includes('spaces') ? { space: { space_id:'1', name:'测试库' } } : { nodes: [], has_more: true, page_token: '' } }) }) }), /游标/);
  await assert.rejects(readKnowledgeSource({ spaceId: '1' }, { run: async () => ({ stdout: JSON.stringify({ ok: true, identity: 'user', data: { space: { space_id:'2', name:'错误库' } } }) }) }), /空间身份/);
});

test('V3 知识库遇限流有限退避，权限错误不重试', async () => {
  let calls = 0, waits = [];
  const run = async (_file, args) => {
    if (args.includes('spaces')) return { stdout: JSON.stringify({ ok: true, identity:'user', data:{ space:{space_id:'1',name:'测试库'} } }) };
    if (args.includes('+node-list')) return { stdout: JSON.stringify({ ok: true, identity: 'user', data: { nodes: [{ node_token: 'n', obj_token: 'd', obj_type: 'docx', parent_node_token: '', space_id: '1', title: '文档', has_child: false }], has_more: false } }) };
    if (args.includes('batch_query')) return { stdout: JSON.stringify({ ok: true, identity: 'user', data: { metas: [{ doc_token: 'd', latest_modify_time: '1792108800' }] } }) };
    if (++calls === 1) throw { stderr: JSON.stringify({ error: { subtype: 'rate_limit' } }) };
    return { stdout: JSON.stringify({ ok: true, identity: 'user', data: { document: { content: '正文' } } }) };
  };
  const result = await readKnowledgeSource({ spaceId: '1' }, { run, wait: async ms => waits.push(ms) });
  assert.equal(calls, 2); assert.ok(waits.some(ms => ms >= 3000)); assert.equal(result.contents.n, '正文');
  calls = 0;
  const denied = await readKnowledgeSource({ spaceId: '1' }, { run: async (file, args) => { if (args.includes('+fetch')) { calls++; throw { stderr: JSON.stringify({ error: { subtype: 'permission_denied' } }) }; } return run(file, args); } });
  assert.equal(calls, 1); assert.match(denied.errors.n, /无权读取/); assert.equal(denied.contents.n, undefined);
});

test('V3 知识库引用只来自实际本地设置、Agent指令与已登记知识', async t => {
  const db = dbFor(t);
  saveSetting(db, 'report_doc_url', 'https://example.feishu.cn/wiki/root');
  db.prepare('INSERT INTO assistants(id,name,kind,instructions,created_at) VALUES(?,?,?,?,?)').run(901, '测试助手', 'custom', '参考 https://example.feishu.cn/docx/doc1', new Date(instant).toISOString());
  db.prepare('INSERT INTO v3_documents(kind,id,payload,updated_at) VALUES(?,?,?,?)').run('assistant-knowledge:901', 'entry', JSON.stringify({ body: '引用 https://example.feishu.cn/wiki/root' }), new Date(instant).toISOString());
  const view = await createKnowledgeTreeService(db, { now: () => instant, readSource: async () => kbSource() }).list();
  assert.deepEqual(view.docs.root.refs.sort(), ['测试助手 · 指令', '测试助手 · 知识库', '设置：report_doc_url'].sort());
  assert.deepEqual(view.docs.child.refs, []); assert.equal(view.docs.child.referencesComplete, false);
});

test('V3 项目带教知识库HTTP读取、同步及各写入预览门禁', async t => {
  const db = dbFor(t); saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  const services = createProjectServices(db, { projects: { readSource: async () => projectSource() }, mentor: { readLogs: async s => mentorView(s, headings(), logXml, instant) }, kb: { readSource: async () => kbSource() } });
  const routes = projectRoutes(services);
  const server = createServer(async (req, res) => { const url = new URL(req.url, 'http://localhost'), found = match(routes, req.method, url.pathname); if (!found) return json(res, 404, {}); await found.handler(req, res, { params: found.params, url }); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const request = async (method, url, value) => { const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method, headers: { 'content-type': 'application/json' }, body: value === undefined ? undefined : JSON.stringify(value) }); return { status: response.status, body: await response.json() }; };
  for (const route of ['/api/v3/projects', '/api/v3/mentor', '/api/v3/kb/tree']) assert.equal((await request('GET', route)).status, 200);
  for (const route of ['/api/v3/projects/sync', '/api/v3/mentor/refresh', '/api/v3/kb/refresh']) assert.equal((await request('POST', route)).status, 200);
  const p = (await request('POST', '/api/v3/projects/p1/preview', { nodeId: 'n1', done: true })).body;
  assert.equal((await request('PATCH', '/api/v3/projects/p1', { confirm: true, previewId: p.previewId })).status, 200);
  assert.equal((await request('PATCH', '/api/v3/projects', { id: 'p1', done: false })).status, 400);
  const name = encodeURIComponent(source.name), m = (await request('POST', `/api/v3/mentor/${name}/records/preview`, { week: '2026-W42', note: '结论' })).body;
  assert.equal((await request('POST', `/api/v3/mentor/${name}/records`, { week: '2026-W42', previewId: m.previewId, confirm: true })).status, 200);
  const k = await request('POST', '/api/v3/kb/preview', { ops: [{ type: 'rename', id: 'child', name: '待确认' }] });
  assert.equal(k.status, 200); assert.equal(k.body.writeEnabled, false);
});

test('带教回复：AI 回答只读当天日志；预览确认后只发一次评论并回读，结果不明锁住只读核对', async t => {
  const db = dbFor(t); saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  const calls = [], comments = [];
  let failNext = false;
  const lark = async (args, _run, { as = 'user' } = {}) => {
    calls.push({ cmd: args[1], as, args });
    if (args[1] === '+add-comment') {
      if (failNext) { failNext = false; throw Object.assign(new Error('网络中断'), { status: 502 }); }
      const text = JSON.parse(args[args.indexOf('--content') + 1])[0].text;
      const c = { comment_id: `c${comments.length + 1}`, extra: { content_anchor_id: args[args.indexOf('--block-id') + 1] }, reply_list: { replies: [{ content: { elements: [{ type: 'text_run', text_run: { text } }] } }] } };
      comments.push(c); return { comment_id: c.comment_id };
    }
    if (args[1] === '+batch-query-comments') return { items: comments.filter(c => c.comment_id === args[args.indexOf('--comment-ids') + 1]) };
    if (args[1] === '+list-comments') return { items: comments, has_more: false };
    throw new Error('unexpected');
  };
  let asked;
  const generate = async input => { asked = input; return { text: '先找**教务**确认数据口径。', generatedAt: 'now', model: 'm' }; };
  const service = createMentorService(db, { now: () => instant, lark, generate, readLogs: async s => mentorView(s, headings(), logXml, instant) });
  await service.list();
  const answer = await service.answer(source.name, 'pAsk000001');
  assert.equal(answer.text, '先找**教务**确认数据口径。'); assert.match(asked.task, /困惑 1：下一步找谁确认？/);
  assert.equal(asked.evidence.log.date, '2026-10-16'); assert.equal(calls.length, 0);
  await assert.rejects(service.answer(source.name, 'notExist01'), /不在最近读取/);

  // 预览不写飞书；确认后用应用身份挂在原话那一段，去掉 ** 记号，回读一致
  const pv = service.previewReply(source.name, 'pAsk000001', { text: answer.text, as: 'bot' });
  assert.equal(calls.length, 0); assert.equal(pv.value.text, '先找教务确认数据口径。'); assert.equal(pv.value.quote, '困惑 1：下一步找谁确认？');
  await assert.rejects(service.confirmReply(source.name, 'pAsk000001', { previewId: pv.previewId }), /明确确认/);
  const receipt = await service.confirmReply(source.name, 'pAsk000001', { previewId: pv.previewId, confirm: true });
  assert.equal(receipt.state, 'sent'); assert.equal(receipt.commentId, 'c1');
  const add = calls.find(c => c.cmd === '+add-comment');
  assert.equal(add.as, 'bot'); assert.equal(add.args[add.args.indexOf('--block-id') + 1], 'pAsk000001');
  // 重复确认返回同一回执，不重发
  assert.deepEqual(await service.confirmReply(source.name, 'pAsk000001', { previewId: pv.previewId, confirm: true }), receipt);
  assert.equal(calls.filter(c => c.cmd === '+add-comment').length, 1);
  assert.equal((await service.list())[0].items.find(i => i.id === 'pAsk000001').reply.state, 'sent');

  // 人工回复：发送失败结果不明 → 锁住，不能再预览；只读核对没找到 → 清掉，可重新发送
  failNext = true;
  const manual = service.previewReply(source.name, 'pAsk000001', { text: '周三前把数据需求发我', as: 'user' });
  await assert.rejects(service.confirmReply(source.name, 'pAsk000001', { previewId: manual.previewId, confirm: true }), /结果不明/);
  assert.throws(() => service.previewReply(source.name, 'pAsk000001', { text: '再试', as: 'user' }), /只读核对/);
  assert.deepEqual(await service.reconcileReply(source.name, 'pAsk000001'), { state: 'none', checked: true });
  const again = service.previewReply(source.name, 'pAsk000001', { text: '周三前把数据需求发我', as: 'user' });
  const ok = await service.confirmReply(source.name, 'pAsk000001', { previewId: again.previewId, confirm: true });
  assert.equal(ok.state, 'sent'); assert.equal(calls.filter(c => c.cmd === '+add-comment').at(-1).as, 'user');
  assert.throws(() => service.previewReply(source.name, 'pAsk000001', { text: '', as: 'user' }), /2000 字以内/);
});
