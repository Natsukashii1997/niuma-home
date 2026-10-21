import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { getRecord, listRecords, putRecord, fingerprint } from '../server/local-records.mjs';
import { createFeishuExporter, createStrategyExportService, canonicalMarkdown, literalMarkdown } from '../server/feishu-export.mjs';
import { createBriefService } from '../server/briefs.mjs';
import { BRIEF_DESTINATION as WIKI } from '../server/brief-destination.mjs';
import { syncBriefMaterials } from '../server/brief-template.mjs';
import { createNeedsService } from '../server/needs.mjs';
import { routes as marketingRoutes } from '../server/routes/v3-marketing.mjs';
import { userRoutes } from '../server/routes/user.mjs';
import { match } from '../server/http.mjs';

const FOLDER = 'https://example.feishu.cn/drive/folder/Folder123', APP = 'cli_aacf58ab61b85beb';
const confirmBody = p => ({ previewId: p.previewId, confirm: true });
function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '导出测试必须使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'export-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  let clock = Date.parse('2026-10-16T12:00:00+08:00');
  const state = { calls: [], creates: 0, user: 'ou_test', app: APP, profile: 'codex', identity: 'user', folderTitle: '已确认交付目录', fail: '', content: null, warnings: [], onDry: null, onCreate: null };
  const documents = new Map();
  const run = async (command, args, options) => {
    assert.equal(command, 'lark-cli'); assert.deepEqual(args.slice(0, 2), ['--profile', 'codex']);
    assert.deepEqual(args.slice(-2), ['--as', 'user']); assert.equal(options.shell, false);
    const arg = flag => args[args.indexOf(flag) + 1];
    const result = data => ({ stdout: JSON.stringify({ ok: true, identity: state.identity, data }) });
    state.calls.push({ args: [...args], input: options.input });
    if (args.includes('whoami')) return { stdout: JSON.stringify({ profile: state.profile, appId: state.app, identity: state.identity, available: true, tokenStatus: 'ready', onBehalfOf: { openId: state.user } }) };
    if (args.includes('+node-get')) {
      const token = arg('--node-token');
      const doc = documents.get(token);
      return result(doc ? { node_token:'Wiki'+token, obj_token:token, obj_type:'docx', node_type:'origin', title:doc.title, space_id:state.createdSpace || WIKI.spaceId, parent_node_token:state.createdParent || WIKI.token }
        : { node_token:state.targetToken || WIKI.token, space_id:state.targetSpace || WIKI.spaceId, obj_token:'ParentDoc', obj_type:'docx', node_type:'origin', title:state.wikiTitle || WIKI.title });
    }
    if (args.includes('+inspect')) {
      const url = arg('--url');
      if (url === FOLDER) return result({ type: 'folder', token: 'Folder123', title: state.folderTitle, url });
      const id = url.split('/').at(-1), doc = documents.get(id);
      return result({ type: 'docx', token: id, title: doc?.title, url });
    }
    if (args.includes('+create')) {
      assert.equal(arg('--content'), '-'); assert.ok(['Folder123',WIKI.token].includes(arg('--parent-token')));
      assert.ok(!args.includes(options.input), '内容只通过stdin传入');
      if (args.includes('--dry-run')) {
        state.onDry?.();
        return { stdout: JSON.stringify({ ok: true, identity: state.identity, dry_run: true, data: { context: { app_id: state.app, user_open_id: state.user }, api: [{ method: 'POST', url: '/open-apis/docs_ai/v1/documents', body: { parent_token: arg('--parent-token'), format: arg('--doc-format'), content: arg('--doc-format')==='xml'?options.input:`<title>${arg('--title')}</title>\n${options.input}` } }] } }) };
      }
      state.creates++;
      assert.equal(listRecords(db, 'feishu-export').filter(r => r.status === 'started').length, 1, '外部写入前先落started收据');
      state.onCreate?.();
      if (state.fail === 'create') throw new Error('timeout; result unknown');
      const id = `Doc${state.creates}`, title = (arg('--doc-format')==='xml'?options.input.match(/^<title>(.*?)<\/title>/)[1]:arg('--title')).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      documents.set(id, { title, content: arg('--doc-format')==='xml'?options.input:`# ${literalMarkdown(title)}\n\n${options.input}` });
      return result({ document: { document_id: id, url: arg('--parent-token')===WIKI.token ? `${new URL(WIKI.url).origin}/${state.wikiUrl?'wiki/Wiki':'docx/'}${id}` : `https://example.feishu.cn/docx/${id}`, revision_id: 1 }, warnings: state.warnings });
    }
    if (args.includes('+fetch')) {
      assert.equal(arg('--scope'),'full'); assert.ok(['xml','markdown'].includes(arg('--doc-format')));
      if (state.fail === 'fetch') throw new Error('readback timeout');
      const id = arg('--doc');
      return result({ document: { document_id: id, content: state.content ?? documents.get(id)?.content, revision_id: 1 } });
    }
    assert.fail(`未模拟的CLI命令 ${args.join(' ')}`);
  };
  const options = { run, now: () => clock };
  const load = async () => ({ title: '测试交付', sections: ['目标'], markdown: '# 测试交付\n\n## 1. 目标\n\n核对目标与完整正文。\n' });
  const service = () => createFeishuExporter(db, options);
  return { db, state, options, load, service, advance: n => clock += n };
}
async function request(routes, method, endpoint, body) {
  const url = new URL(endpoint, 'http://127.0.0.1'), found = match(routes, method, url.pathname);
  assert.ok(found, `${method} ${endpoint} 路由存在`);
  const req = Readable.from([Buffer.from(JSON.stringify(body ?? {}))]);
  let status, data; const res = { setHeader() {}, writeHead(n) { status = n; }, end(value) { data = JSON.parse(value); } };
  await found.handler(req, res, { params: found.params, url }); return { status, body: data };
}

test('导出预览精确目录与全文，确认只创建一次并核对元数据+全文，重启可回放成功收据', async t => {
  const { db, service, load, state, advance } = setup(t), s = service();
  const p = await s.preview('brief', '2026-11', {}, { targetUrl: FOLDER }, load);
  assert.equal(p.target.title, '已确认交付目录'); assert.equal(p.target.url, FOLDER); assert.equal(p.mode, 'new-only');
  assert.match(p.markdown, /完整正文/); assert.equal(state.creates, 0); assert.equal(listRecords(db, 'feishu-export').length, 0);
  const receipt = await s.confirm('brief', '2026-11', confirmBody(p), load);
  assert.equal(receipt.status, 'success'); assert.match(receipt.document.url, /\/docx\/Doc1$/);
  assert.ok(state.calls.some(c => c.args.includes('whoami'))); assert.ok(state.calls.some(c => c.args.includes('+fetch')));
  advance(600001);
  assert.deepEqual(await service().confirm('brief', '2026-11', confirmBody(p), load), receipt);
  const repeat = await service().preview('brief', '2026-11', {}, { targetUrl: FOLDER }, load);
  assert.deepEqual(repeat.receipt, receipt); assert.deepEqual(await service().confirm('brief', '2026-11', confirmBody(repeat), load), receipt);
  assert.equal(state.creates, 1);
});

test('目标必须为文件夹，确认不得替换对象、内容或目标，过期无写入', async t => {
  const { service, load, state, advance } = setup(t), s = service();
  for (const body of [{}, { targetUrl: 'https://example.feishu.cn/docx/OldDoc' }, { targetUrl: 'https://evil.test/drive/folder/Folder123' }, { targetUrl: FOLDER + '?x=1' }, { targetUrl: FOLDER, content: 'override' }]) {
    await assert.rejects(s.preview('brief', '2026-11', {}, body, load), e => e.status === 400);
  }
  assert.equal(state.calls.length, 0);
  const p = await s.preview('brief', '2026-11', {}, { targetUrl: FOLDER }, load);
  await assert.rejects(s.confirm('brief', '2026-12', confirmBody(p), load), e => e.status === 409);
  await assert.rejects(s.confirm('brief', '2026-11', { ...confirmBody(p), targetUrl: FOLDER }, load), e => e.status === 400);
  advance(600000); await assert.rejects(s.confirm('brief', '2026-11', confirmBody(p), load), e => e.code === 'EXPORT_PREVIEW_EXPIRED');
  assert.equal(state.creates, 0);
});

test('内容、来源配置、目录名称、user或固定应用变化均阻断写入', async t => {
  for (const change of ['content', 'source', 'folder', 'user', 'app', 'profile', 'identity']) await t.test(change, async t => {
    const { service, load, state, db } = setup(t), s = service();
    const p = await s.preview('brief', '2026-11', {}, { targetUrl: FOLDER }, load);
    let fresh = load;
    if (change === 'content') fresh = async () => ({ ...await load(), markdown: '内容变化' });
    if (change === 'source') saveSetting(db, 'price_cost_per_hour', '450');
    if (change === 'folder') state.folderTitle = '其他目录名称';
    if (change === 'user') state.user = 'ou_other';
    if (change === 'app') state.app = 'cli_other';
    if (change === 'profile') state.profile = 'claude';
    if (change === 'identity') state.identity = 'bot';
    await assert.rejects(s.confirm('brief', '2026-11', confirmBody(p), fresh)); assert.equal(state.creates, 0);
  });
});

test('异步预检期间来源变化仍会在创建前阻断', async t => {
  const { service, load, state, db } = setup(t), s = service();
  const p = await s.preview('brief', '2026-11', {}, { targetUrl: FOLDER }, load);
  state.onDry = () => saveSetting(db, 'price_sku_table_id', 'tblChanged');
  await assert.rejects(s.confirm('brief', '2026-11', confirmBody(p), load), e => e.code === 'EXPORT_SOURCE_CHANGED'); assert.equal(state.creates, 0);
});

test('并发确认由持久化started收据拦截，最多创建一次', async t => {
  const { service, load, state } = setup(t), s = service();
  const p = await s.preview('brief', '2026-11', {}, { targetUrl: FOLDER }, load);
  const values = await Promise.allSettled([s.confirm('brief', '2026-11', confirmBody(p), load), service().confirm('brief', '2026-11', confirmBody(p), load)]);
  assert.equal(values.filter(v => v.status === 'fulfilled').length, 1); assert.equal(state.creates, 1);
});

test('创建未知、回读失败、不一致或降级都保存unknown，重启和重新预览均不能重复创建', async t => {
  for (const issue of ['create', 'fetch', 'mismatch', 'warning']) await t.test(issue, async t => {
    const { service, load, state, db } = setup(t), s = service();
    const p = await s.preview('brief', '2026-11', {}, { targetUrl: FOLDER }, load);
    if (issue === 'mismatch') state.content = '# 测试交付\n\n## 1. 目标\n\n只有标题，丢失完整正文';
    else if (issue === 'warning') state.warnings = ['部分内容未导入']; else state.fail = issue;
    await assert.rejects(s.confirm('brief', '2026-11', confirmBody(p), load), e => e.status === 502 && e.receipt.status === 'unknown');
    const stored = listRecords(db, 'feishu-export')[0]; assert.equal(stored.status, 'unknown');
    if (issue !== 'create') assert.ok(stored.document.url);
    state.fail = ''; state.warnings = []; state.content = null;
    await assert.rejects(service().confirm('brief', '2026-11', confirmBody(p), load), e => e.code === 'EXPORT_RESULT_UNKNOWN');
    await assert.rejects(service().preview('brief', '2026-11', {}, { targetUrl: FOLDER }, async () => ({ ...await load(), title: '更改标题也不可绕过' })), e => e.code === 'EXPORT_RESULT_UNKNOWN');
    assert.equal(state.creates, 1);
  });
});

test('写后数据库故障保留started，重启不得再次创建；写前数据库故障不调用create', async t => {
  const { service, load, state, db } = setup(t), s = service();
  const p = await s.preview('brief', '2026-11', {}, { targetUrl: FOLDER }, load);
  state.onCreate = () => db.exec("CREATE TRIGGER reject_receipt BEFORE UPDATE ON v3_documents WHEN NEW.kind='feishu-export' BEGIN SELECT RAISE(ABORT,'simulated'); END;");
  await assert.rejects(s.confirm('brief', '2026-11', confirmBody(p), load), e => e.code === 'EXPORT_RESULT_UNKNOWN');
  assert.equal(listRecords(db, 'feishu-export')[0].status, 'started');
  await assert.rejects(service().confirm('brief', '2026-11', confirmBody(p), load), e => e.code === 'EXPORT_RESULT_UNKNOWN'); assert.equal(state.creates, 1);
  const p2 = await s.preview('brief', '2026-12', {}, { targetUrl: FOLDER }, load);
  db.exec("CREATE TRIGGER reject_start BEFORE INSERT ON v3_documents WHEN NEW.kind='feishu-export' BEGIN SELECT RAISE(ABORT,'simulated'); END;");
  await assert.rejects(s.confirm('brief', '2026-12', confirmBody(p2), load)); assert.equal(state.creates, 1);
});

test('brief导出路由用已保存七节全文，用户文字不能形成附件上传或XML指令', async t => {
  const { db, options, state } = setup(t), brief = createBriefService(db, { now: options.now, exports: options });
  const text = '原文 ![图片](@/private/secret.png) <image token="x"/> ${{danger}}';
  const p = brief.preview('2026-11', { patch: { background: { text } } }); brief.confirm('2026-11', confirmBody(p));
  const routes = marketingRoutes(db, { briefs: { now: options.now, exports: options } });
  const result = await request(routes, 'POST', '/api/v3/briefs/2026-11/export-preview', {});
  assert.equal(result.status, 200); assert.equal(result.body.sections.length, 7); assert.match(result.body.markdown, /## 7\. 附件/);
  assert.ok(result.body.markdown.includes('\\!\\[图片\\]\\(@/private/secret.png\\)')); assert.ok(result.body.markdown.includes('&lt;image'));
  assert.ok(canonicalMarkdown(result.body.markdown).includes(text));
  const saved = await request(routes, 'POST', '/api/v3/briefs/2026-11/export', confirmBody(result.body));
  assert.equal(saved.status, 200); assert.equal(saved.body.status, 'success'); assert.equal(state.creates, 1);
});

test('策略导出路由只接受当前有效已采纳需求，绑定月份和策略内容并回读', async t => {
  const { db, options, state } = setup(t), timeline = async () => ({ stage: '本科', agenda: [] });
  const need = { id: 'need1', seg: '澳洲 · 本科', node: 'Final', need: '复习', source: '已确认自言自语', status: '草稿' };
  const source = { id: 'self1', month: '2026-11', need };
  putRecord(db, 'selftalk-need', source.id, source);
  const needs = createNeedsService(db, timeline, { now: options.now });
  const strategyExports = createStrategyExportService(db, needs, options), routes = userRoutes({ timeline, needs, strategyExports });
  const endpoint = '/api/v3/needs/need1/strategy/export-preview';
  assert.equal((await request(routes, 'POST', endpoint, { month: '2026-11', targetUrl: FOLDER })).status, 409);
  const strategy = { goal: '核对真实考试日程', actions: { 营销: [['发复习提示', '避免错过复习窗口']], 产品: [], 运营: [] } };
  const adoption = await needs.preview('need1', { month: '2026-11', strategy }); await needs.confirm('need1', confirmBody(adoption));
  const p = await request(routes, 'POST', endpoint, { month: '2026-11', targetUrl: FOLDER }); assert.equal(p.status, 200); assert.match(p.body.markdown, /发复习提示/);
  source.need.need = '需求发生变化'; putRecord(db, 'selftalk-need', source.id, source);
  assert.equal((await request(routes, 'POST', '/api/v3/needs/need1/strategy/export', confirmBody(p.body))).status, 409); assert.equal(state.creates, 0);
  source.need.need = '复习'; putRecord(db, 'selftalk-need', source.id, source);
  const receipt = await request(routes, 'POST', '/api/v3/needs/need1/strategy/export', confirmBody(p.body));
  assert.equal(receipt.status, 200); assert.equal(receipt.body.status, 'success'); assert.equal(state.creates, 1);
  assert.equal(getRecord(db, 'feishu-export', receipt.body.operationId).fingerprint, fingerprint({ title: p.body.title, sections: p.body.sections, markdown: p.body.markdown }));
  const statusPath = `/api/v3/needs/need1/strategy/exports/${receipt.body.operationId}`;
  assert.equal((await request(routes, 'GET', statusPath)).body.status, 'success');
  assert.equal((await request(routes, 'POST', `${statusPath}/reconcile`)).body.status, 'success'); assert.equal(state.creates, 1);
});

test('创建成功但首次回读失败可只读恢复，来源已变仍核对原预览，确认重放不再创建', async t => {
  const { db, options, state } = setup(t), routes = marketingRoutes(db, { briefs: { now: options.now, exports: options } });
  const p = await request(routes, 'POST', '/api/v3/briefs/2026-11/export-preview', {});
  state.fail = 'fetch';
  const failed = await request(routes, 'POST', '/api/v3/briefs/2026-11/export', confirmBody(p.body));
  assert.equal(failed.status, 502); const operation = failed.body.receipt.operationId;
  const statusPath = `/api/v3/briefs/2026-11/exports/${operation}`;
  let result = await request(routes, 'GET', statusPath); assert.equal(result.status, 200); assert.equal(result.body.status, 'unknown');
  assert.equal((await request(routes, 'GET', `/api/v3/briefs/2026-12/exports/${operation}`)).status, 404);
  assert.equal((await request(routes, 'POST', `/api/v3/briefs/2026-12/exports/${operation}/reconcile`)).status, 404);
  state.fail = ''; saveSetting(db, 'price_cost_per_hour', '451');
  const brief = createBriefService(db); const edit = brief.preview('2026-11', { patch: { title: '当前标题已改变' } }); brief.confirm('2026-11', confirmBody(edit));
  const before = state.calls.length;
  result = await request(routes, 'POST', `${statusPath}/reconcile`);
  assert.equal(result.status, 200); assert.equal(result.body.status, 'success'); assert.equal(result.body.sourceChanged, true);
  assert.equal(result.body.title, p.body.title); assert.equal(result.body.source.price_cost_per_hour, '440');
  assert.ok(state.calls.slice(before).every(c => !c.args.includes('+create')), '恢复连dry-run create也不调用');
  assert.equal(state.creates, 1);
  const replay = await request(routes, 'POST', '/api/v3/briefs/2026-11/export', confirmBody(p.body));
  assert.equal(replay.body.status, 'success'); assert.equal(replay.body.operationId, operation); assert.equal(replay.body.document.id, 'Doc1');
  assert.deepEqual(await request(routes, 'POST', '/api/v3/briefs/2026-11/export', confirmBody(p.body)), replay);
  assert.equal(state.creates, 1);
});

test('无文档地址的未知结果不猜标题、不重发；有地址但核对失败仍未知', async t => {
  const { service, load, state } = setup(t), s = service();
  const p = await s.preview('brief', '2026-11', {}, { targetUrl: FOLDER }, load);
  state.fail = 'create'; let receipt;
  await assert.rejects(s.confirm('brief', '2026-11', confirmBody(p), load), e => { receipt = e.receipt; return true; });
  const before = state.calls.length;
  assert.equal(service().status('brief', '2026-11', receipt.operationId).status, 'unknown');
  await assert.rejects(service().reconcile('brief', '2026-11', receipt.operationId), e => e.code === 'EXPORT_RESULT_UNKNOWN' && /人工检查原目标文件夹/.test(e.message));
  assert.equal(state.calls.length, before); assert.equal(state.creates, 1);
  state.fail = ''; const p2 = await s.preview('brief', '2026-12', {}, { targetUrl: FOLDER }, load);
  state.fail = 'fetch'; await assert.rejects(s.confirm('brief', '2026-12', confirmBody(p2), load), e => { receipt = e.receipt; return true; });
  await assert.rejects(s.reconcile('brief', '2026-12', receipt.operationId), e => e.code === 'EXPORT_RESULT_UNKNOWN');
  assert.equal(s.status('brief', '2026-12', receipt.operationId).status, 'unknown'); assert.equal(state.creates, 2);
});

test('Brief原生XML丢失表头列不能报成功，恢复后只读核对不再创建', async t => {
  const {db,options,state}=setup(t), service=createBriefService(db,{exports:options});
  const p=await service.exportPreview('2026-11',{});
  const xml=state.calls.find(c=>c.args.includes('+create')).input;
  state.content=xml.replace('<th background-color="light-gray"><p>面向人群</p></th>','');
  await assert.rejects(service.exportConfirm('2026-11',confirmBody(p)),e=>e.code==='EXPORT_RESULT_UNKNOWN');
  const receipt=listRecords(db,'feishu-export')[0];assert.equal(state.creates,1);
  state.content=null;const reconciled=await service.exportReconcile('2026-11',receipt.operationId);assert.equal(reconciled.status,'success');assert.equal(state.creates,1);
  assert.ok(state.calls.filter(c=>c.args.includes('+create')).every(c=>!c.args.includes('--title')));
});


test('Brief固定Wiki目录无需链接，拒绝覆盖目标；空占位行跳过且不改本地草稿', async t=>{
 const {db,options,state}=setup(t), s=createBriefService(db,{exports:options});
 const draft=syncBriefMaterials(s.read('2026-11'),[{id:'a',name:'冲刺海报'},{id:'b',name:''}]);
 const p=s.preview('2026-11',{patch:Object.fromEntries(['materials','audience','timeline','items'].map(k=>[k,draft[k]]))});s.confirm('2026-11',confirmBody(p));
 await assert.rejects(s.exportPreview('2026-11',{targetUrl:FOLDER}),e=>e.status===400);
 const pv=await s.exportPreview('2026-11',{});
 assert.equal(pv.target.token,WIKI.token);assert.equal(pv.target.spaceId,WIKI.spaceId);assert.equal(s.read('2026-11').materials.length,2);
 const content=state.calls.find(c=>c.args.includes('+create')).input;assert.match(content,/4.1 冲刺海报/);assert.ok(!content.includes('4.2'));
 const receipt=await s.exportConfirm('2026-11',confirmBody(pv));assert.equal(receipt.status,'success');
 const again=await s.exportPreview('2026-11',{});await s.exportConfirm('2026-11',confirmBody(again));assert.equal(state.creates,1);
 draft.audience[1][1]='已填写的受众';const edit=s.preview('2026-11',{patch:{audience:draft.audience}});s.confirm('2026-11',confirmBody(edit));
 await assert.rejects(s.exportPreview('2026-11',{}),/未命名/);assert.equal(state.creates,1);
});

test('Wiki节点或空间不符禁止创建，确认前改名也禁止创建',async t=>{
 const {db,options,state}=setup(t),s=createBriefService(db,{exports:options});
 for(const field of ['targetToken','targetSpace']){state[field]='wrong';await assert.rejects(s.exportPreview('2026-11',{}),e=>e.code==='EXPORT_TARGET_CHANGED');delete state[field];}
 const pv=await s.exportPreview('2026-11',{});state.wikiTitle='已改名';await assert.rejects(s.exportConfirm('2026-11',confirmBody(pv)),e=>e.code==='EXPORT_TARGET_CHANGED');assert.equal(state.creates,0);
});

test('物料主表为空但存在正文时拒绝导出，不静默清空正文',async t=>{
 const {db,options,state}=setup(t),s=createBriefService(db,{exports:options});
 const p=s.preview('2026-11',{patch:{materials:[],audience:[['旧物料','已写受众','待办']]}});s.confirm('2026-11',confirmBody(p));
 await assert.rejects(s.exportPreview('2026-11',{}),/未对应/);assert.equal(state.calls.length,0);
 assert.equal(s.read('2026-11').audience[0][1],'已写受众');
});

test('Wiki创建回读必须核对父节点和空间，未知只读恢复且兼容Wiki返回地址',async t=>{
 const {db,options,state}=setup(t),s=createBriefService(db,{exports:options});state.wikiUrl=true;
 const pv=await s.exportPreview('2026-11',{});state.createdParent='WrongParent';let receipt;
 await assert.rejects(s.exportConfirm('2026-11',confirmBody(pv)),e=>{receipt=e.receipt;return e.code==='EXPORT_RESULT_UNKNOWN';});
 state.createdParent=null;state.createdSpace='123';await assert.rejects(s.exportReconcile('2026-11',receipt.operationId),e=>e.code==='EXPORT_RESULT_UNKNOWN');
 state.createdSpace=null;assert.equal((await s.exportReconcile('2026-11',receipt.operationId)).status,'success');assert.equal(state.creates,1);
});

test('Brief只修标题尾部换行继续返回原文档，实际正文变化仍可新建',async t=>{
 const {db,service,state}=setup(t),s=service();
 const document={title:'测试交付',sections:['详细文案框架'],markdown:'# 测试交付\n\n### 4.1 海报\n\n正文',format:'xml',xml:'<title>测试交付</title><h2>4.1 海报<br/></h2><p>正文</p>'};
 const before=await s.preview('brief','2026-11',{}, {targetUrl:FOLDER},async()=>document);
 const original=await s.confirm('brief','2026-11',confirmBody(before),async()=>document);
 const corrected={...document,xml:document.xml.replace('<br/>','')};
 const after=await s.preview('brief','2026-11',{}, {targetUrl:FOLDER},async()=>corrected);
 assert.equal(after.receipt.document.id,original.document.id);
 const again=await s.confirm('brief','2026-11',confirmBody(after),async()=>corrected);assert.equal(again.operationId,original.operationId);assert.equal(state.creates,1);
 const changed={...corrected,xml:corrected.xml.replace('正文','新正文')};
 const fresh=await s.preview('brief','2026-11',{}, {targetUrl:FOLDER},async()=>changed);assert.equal(fresh.receipt,undefined);
 await s.confirm('brief','2026-11',confirmBody(fresh),async()=>changed);assert.equal(state.creates,2);
 assert.equal(listRecords(db,'feishu-export').length,2);
});
