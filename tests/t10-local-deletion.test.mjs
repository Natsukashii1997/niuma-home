import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { match } from '../server/http.mjs';
import { createProjectService } from '../server/projects.mjs';
import { projectRoutes } from '../server/routes/projects.mjs';
import { routes as marketingRoutes } from '../server/routes/v3-marketing.mjs';
import { getRecord, putRecord } from '../server/local-records.mjs';

const instant = Date.parse('2026-10-18T12:00:00+08:00');
const confirmed = preview => ({ previewId: preview.previewId, confirm: true });

function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '删除测试必须使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 't10-delete-'));
  const db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}
async function request(routes, method, endpoint, body) {
  const url = new URL(endpoint, 'http://127.0.0.1'), found = match(routes, method, url.pathname);
  assert.ok(found, `缺少真实路由：${method} ${endpoint}`);
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  let status, data;
  const res = { setHeader() {}, writeHead(value) { status = value; }, end(value) { data = JSON.parse(value); } };
  await found.handler(req, res, { params: found.params, url });
  return { status, body: data };
}
async function ok(routes, method, endpoint, body) {
  const response = await request(routes, method, endpoint, body);
  assert.equal(response.status, 200, `${method} ${endpoint}: ${JSON.stringify(response.body)}`);
  return response.body;
}

function fixture(t, kind) {
  const db = database(t), clock = { value: instant }, source = { fail: false, reads: 0 };
  const projectSource = { projects: [{ id: 'remote-project', 项目名称: '飞书模板项目', 状态: ['推进中'] }], people: [], nodes: [
    { id: 'remote-node', 所属项目: [{ id: 'remote-project' }], 任务事项: '保留节点', 节点类型: [], 环节阶段: ['实施阶段'], 是否完成: false, 截止时间: null },
  ] };
  const campaignRows = [{ id: 'remote-campaign-node', 模板序号: 1, 任务事项: '保留战役节点', 节点类型: ['普通任务'], 环节阶段: ['实施阶段'], 父记录: [] }];
  const projectOptions = { now: () => clock.value, readSource: async () => {
    source.reads++; if (source.fail) throw new Error('合成外部读取不可用'); return structuredClone(projectSource);
  } };
  const campaignOptions = {
    now: () => clock.value, readSource: async () => { source.reads++; if (source.fail) throw new Error('合成外部读取不可用'); return { rows: structuredClone(campaignRows), rev: 1 }; },
  };
  const rebuild = () => kind === 'project' ? projectRoutes({ projects: createProjectService(db, projectOptions) }) : marketingRoutes(db, { campaign: campaignOptions });
  const routes = rebuild();
  const root = kind === 'project' ? '/api/v3/local-projects' : '/api/v3/campaigns/history';
  const base = id => `${root}/${id}`;
  const create = async (name = '本地对象') => {
    if (kind === 'project') {
      const preview = await ok(routes, 'POST', `${root}/preview`, { name, basedOn: 'remote-project' });
      const value = await ok(routes, 'POST', `${root}/confirm`, confirmed(preview));
      return { value, creation: preview };
    }
    const creation = await ok(routes, 'POST', '/api/v3/campaigns/current/preview', { name, start: '2026-10-01', end: '2026-10-31', desc: '合成战役说明' });
    await ok(routes, 'PATCH', '/api/v3/campaigns/current', confirmed(creation));
    const edit = await ok(routes, 'POST', '/api/v3/campaigns/current/preview', { review: '完整保留的复盘正文' });
    await ok(routes, 'PATCH', '/api/v3/campaigns/current', confirmed(edit));
    const archive = await ok(routes, 'POST', '/api/v3/campaigns/current/archive-preview', {});
    const receipt = await ok(routes, 'POST', '/api/v3/campaigns/current/archive', confirmed(archive));
    return { value: receipt.archived, creation, edit, archive };
  };
  const preview = (id, action) => ok(routes, 'POST', `${base(id)}/${action === 'remove' ? 'remove-preview' : 'restore-preview'}`, {});
  const commit = (id, action, p) => request(routes, action === 'remove' ? 'DELETE' : 'POST', `${base(id)}${action === 'remove' ? '' : '/restore'}`, confirmed(p));
  const change = async (id, action) => { const p = await preview(id, action), r = await commit(id, action, p); assert.equal(r.status, 200, JSON.stringify(r.body)); return { preview: p, receipt: r.body }; };
  return { db, clock, source, projectSource, campaignRows, routes, rebuild, root, base, create, preview, commit, change };
}

for (const kind of ['project', 'campaign']) {
  test(`B2 ${kind} 软删除与恢复保留完整对象，离线本地列表可回读`, async t => {
    const f = fixture(t, kind), { value } = await f.create();
    if (kind === 'project') {
      const p = await ok(f.routes, 'POST', `/api/v3/projects/${value.id}/preview`, { nodeId: value.nodes[0].id, done: true });
      await ok(f.routes, 'PATCH', `/api/v3/projects/${value.id}`, confirmed(p));
    }
    const before = await ok(f.routes, 'GET', f.root), reads = f.source.reads;
    f.source.fail = true;
    const p = await f.preview(value.id, 'remove');
    assert.equal((await ok(f.routes, 'GET', f.root)).items.length, 1, '预览不删除');
    const deleted = await f.commit(value.id, 'remove', p);
    assert.equal(deleted.status, 200);
    assert.equal(deleted.body.deleted, true);
    assert.deepEqual((await ok(f.routes, 'GET', f.root)).items, []);
    if (kind === 'project') assert.ok(!(await ok(f.routes, 'GET', '/api/v3/projects')).some(item => item.id === value.id), '默认项目列表隐藏已删除本地项目');
    const trash = (await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items;
    assert.equal(trash.length, 1); assert.equal(trash[0].id, value.id); assert.equal(trash[0].deletion.deleted, true);
    assert.ok(getRecord(f.db, kind === 'project' ? 'local-project' : 'campaign-archive', value.id), '原始记录不硬删除');
    assert.deepEqual((await ok(f.rebuild(), 'GET', `${f.root}?deleted=true`)).items, trash, '重建服务后删除状态和完整内容仍可回读');
    await f.change(value.id, 'restore');
    assert.deepEqual(await ok(f.routes, 'GET', f.root), before);
    assert.deepEqual((await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items, []);
    assert.equal(f.source.reads, reads, '删除恢复和本地列表不新增外部读取');
  });

  test(`B2 ${kind} 删除及恢复到期预览均拒绝且状态不变`, async t => {
    const f = fixture(t, kind), { value } = await f.create();
    let p = await f.preview(value.id, 'remove'); f.clock.value = Date.parse(p.expiresAt);
    let denied = await f.commit(value.id, 'remove', p);
    assert.equal(denied.status, 409); assert.equal(denied.body.code, 'LOCAL_DELETE_PREVIEW_STALE');
    assert.equal((await ok(f.routes, 'GET', f.root)).items.length, 1);
    await f.change(value.id, 'remove');
    p = await f.preview(value.id, 'restore'); f.clock.value = Date.parse(p.expiresAt);
    denied = await f.commit(value.id, 'restore', p);
    assert.equal(denied.status, 409); assert.equal(denied.body.code, 'LOCAL_DELETE_PREVIEW_STALE');
    assert.equal((await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items.length, 1);
  });

  test(`B2 ${kind} 重复确认幂等且旧删除恢复令牌不能跨生命周期重放`, async t => {
    const f = fixture(t, kind), { value } = await f.create();
    const removed = await f.change(value.id, 'remove');
    assert.deepEqual((await f.commit(value.id, 'remove', removed.preview)).body, removed.receipt);
    const restored = await f.change(value.id, 'restore');
    assert.deepEqual((await f.commit(value.id, 'restore', restored.preview)).body, restored.receipt);
    const stale = await f.commit(value.id, 'remove', removed.preview);
    assert.equal(stale.status, 409); assert.equal(stale.body.code, 'LOCAL_DELETE_PREVIEW_STALE');
    assert.equal((await ok(f.routes, 'GET', f.root)).items.length, 1);
    await f.change(value.id, 'remove');
    assert.equal((await f.commit(value.id, 'restore', restored.preview)).body.code, 'LOCAL_DELETE_PREVIEW_STALE');
    assert.equal((await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items.length, 1);
  });

  test(`B2 ${kind} 并发内容变化及并发删除令牌均失效`, async t => {
    const f = fixture(t, kind), { value } = await f.create();
    const stale = await f.preview(value.id, 'remove');
    const storage = kind === 'project' ? 'local-project' : 'campaign-archive';
    putRecord(f.db, storage, value.id, { ...getRecord(f.db, storage, value.id), name: '并发修改后的名称' });
    const denied = await f.commit(value.id, 'remove', stale);
    assert.equal(denied.status, 409); assert.equal(denied.body.code, 'LOCAL_DELETE_PREVIEW_STALE');
    const first = await f.preview(value.id, 'remove'), second = await f.preview(value.id, 'remove');
    assert.equal((await f.commit(value.id, 'remove', first)).status, 200);
    assert.equal((await f.commit(value.id, 'remove', second)).body.code, 'LOCAL_DELETE_PREVIEW_STALE');
  });

  test(`B2 ${kind} 预览绑定对象与动作且确认不接受额外字段`, async t => {
    const f = fixture(t, kind), { value } = await f.create();
    const p = await f.preview(value.id, 'remove');
    assert.equal((await f.commit('other', 'remove', p)).body.code, 'LOCAL_DELETE_PREVIEW_STALE');
    assert.equal((await f.commit(value.id, 'restore', p)).body.code, 'LOCAL_DELETE_PREVIEW_STALE');
    assert.equal((await request(f.routes, 'DELETE', f.base(value.id), { ...confirmed(p), local: true })).body.code, 'LOCAL_DELETE_INPUT_INVALID');
    assert.equal((await request(f.routes, 'DELETE', f.base(value.id), { previewId: p.previewId, confirm: false })).body.code, 'LOCAL_DELETE_INPUT_INVALID');
    assert.equal((await request(f.routes, 'POST', `${f.base(value.id)}/remove-preview`, { local: true })).body.code, 'LOCAL_DELETE_INPUT_INVALID');
    assert.equal((await ok(f.routes, 'GET', f.root)).items.length, 1);
  });

  test(`B2 ${kind} ${kind === 'project' ? '恢复同名冲突拒绝，不覆盖新对象' : '删除后新增同名归档仍可恢复两条独立对象'}`, async t => {
    const f = fixture(t, kind), { value } = await f.create('同名对象');
    await f.change(value.id, 'remove');
    const other = (await f.create('同名对象')).value;
    const preview = await request(f.routes, 'POST', `${f.base(value.id)}/restore-preview`, {});
    if (kind === 'project') {
      assert.equal(preview.status, 409); assert.equal(preview.body.code, 'LOCAL_RESTORE_CONFLICT');
      assert.deepEqual((await ok(f.routes, 'GET', f.root)).items.map(item => item.id), [other.id]);
      assert.deepEqual((await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items.map(item => item.id), [value.id]);
    } else {
      assert.equal(preview.status, 200);
      assert.equal((await f.commit(value.id, 'restore', preview.body)).status, 200);
      const restored = (await ok(f.routes, 'GET', f.root)).items;
      assert.equal(restored.length, 2);
      assert.deepEqual(restored.find(item => item.id === value.id), value);
      assert.deepEqual(restored.find(item => item.id === other.id), other);
    }
  });

  test(`B2 ${kind} 生命周期保存失败回滚，不能假报删除成功`, async t => {
    const f = fixture(t, kind), { value } = await f.create();
    const p = await f.preview(value.id, 'remove');
    f.db.exec("CREATE TRIGGER t10_reject_delete BEFORE INSERT ON v3_documents WHEN NEW.kind='local-deletion' BEGIN SELECT RAISE(ABORT,'synthetic write failure'); END;");
    assert.equal((await f.commit(value.id, 'remove', p)).status, 500);
    assert.equal((await ok(f.routes, 'GET', f.root)).items.length, 1);
    assert.deepEqual((await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items, []);
    f.db.exec('DROP TRIGGER t10_reject_delete');
    assert.equal((await f.commit(value.id, 'remove', p)).status, 200, '失败后同预览可安全重试');
  });

  test(`B2 ${kind} 删除期间原始内容变化不能被恢复覆盖`, async t => {
    const f = fixture(t, kind), { value } = await f.create();
    await f.change(value.id, 'remove');
    const storage = kind === 'project' ? 'local-project' : 'campaign-archive';
    putRecord(f.db, storage, value.id, { ...getRecord(f.db, storage, value.id), name: '删除后发生独立修改' });
    const denied = await request(f.routes, 'POST', `${f.base(value.id)}/restore-preview`, {});
    assert.equal(denied.status, 409); assert.equal(denied.body.code, 'LOCAL_RESTORE_CONFLICT');
    assert.equal((await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items[0].name, '删除后发生独立修改');
    assert.deepEqual((await ok(f.routes, 'GET', f.root)).items, []);
  });

  test(`B2 ${kind} ${kind === 'project' ? '恢复预览后新增同名对象会在确认前再次拒绝' : '恢复预览后新增同名归档不影响原ID恢复'}`, async t => {
    const f = fixture(t, kind), { value } = await f.create('恢复竞态名称');
    await f.change(value.id, 'remove');
    const p = await f.preview(value.id, 'restore');
    const other = (await f.create('恢复竞态名称')).value;
    const restored = await f.commit(value.id, 'restore', p);
    if (kind === 'project') {
      assert.equal(restored.status, 409); assert.equal(restored.body.code, 'LOCAL_RESTORE_CONFLICT');
      assert.deepEqual((await ok(f.routes, 'GET', f.root)).items.map(item => item.id), [other.id]);
      assert.equal((await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items[0].id, value.id);
    } else {
      assert.equal(restored.status, 200);
      const items = (await ok(f.routes, 'GET', f.root)).items;
      assert.equal(items.length, 2);
      assert.deepEqual(items.find(item => item.id === value.id), value);
      assert.deepEqual(items.find(item => item.id === other.id), other);
      assert.deepEqual((await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items, []);
    }
  });
}

test('B2 项目来源必须由持久化本地记录证明，飞书同ID冲突保守拒绝', async t => {
  const f = fixture(t, 'project'), { value } = await f.create();
  const remote = await request(f.routes, 'POST', `${f.root}/remote-project/remove-preview`, {});
  assert.equal(remote.status, 403); assert.equal(remote.body.code, 'LOCAL_SOURCE_REQUIRED');
  assert.equal((await request(f.routes, 'POST', `${f.root}/local-forged/remove-preview`, {})).status, 404);
  putRecord(f.db, 'local-project', 'local-forged', { ...value, id: 'local-forged', origin: 'feishu' });
  assert.equal((await request(f.routes, 'POST', `${f.root}/local-forged/remove-preview`, {})).body.code, 'LOCAL_SOURCE_REQUIRED');
  const p = await f.preview(value.id, 'remove');
  f.projectSource.projects.push({ id: value.id, 项目名称: '来源身份冲突', 状态: ['推进中'] });
  await ok(f.routes, 'POST', '/api/v3/projects/sync');
  const conflict = await f.commit(value.id, 'remove', p);
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'LOCAL_SOURCE_CONFLICT');
});

test('B2 项目删除恢复后旧节点编辑与创建令牌仍拒绝，覆盖内容保持原样', async t => {
  const f = fixture(t, 'project'), { value, creation } = await f.create();
  const edit = await ok(f.routes, 'POST', `/api/v3/projects/${value.id}/preview`, { nodeId: value.nodes[0].id, done: true });
  await f.change(value.id, 'remove');
  assert.equal((await request(f.routes, 'PATCH', `/api/v3/projects/${value.id}`, confirmed(edit))).body.code, 'LOCAL_OBJECT_DELETED');
  assert.equal((await request(f.routes, 'POST', `${f.root}/confirm`, confirmed(creation))).body.code, 'LOCAL_OBJECT_DELETED');
  await f.change(value.id, 'restore');
  assert.equal((await request(f.routes, 'PATCH', `/api/v3/projects/${value.id}`, confirmed(edit))).body.code, 'LOCAL_DELETE_PREVIEW_STALE');
  assert.equal((await request(f.routes, 'POST', `${f.root}/confirm`, confirmed(creation))).body.code, 'LOCAL_DELETE_PREVIEW_STALE');
  assert.equal((await ok(f.routes, 'GET', f.root)).items[0].nodes[0].done, false);
});

test('B2 历史战役拒绝当前对象、飞书模板及外部来源标记', async t => {
  const f = fixture(t, 'campaign'), { value } = await f.create();
  const p = await ok(f.routes, 'POST', '/api/v3/campaigns/current/preview', { name: '当前战役', start: '2026-10-01', end: '2026-10-31', desc: '保护当前对象' });
  const current = await ok(f.routes, 'PATCH', '/api/v3/campaigns/current', confirmed(p));
  assert.equal((await request(f.routes, 'POST', `${f.base(current.id)}/remove-preview`, {})).body.code, 'CAMPAIGN_CURRENT_PROTECTED');
  assert.equal((await request(f.routes, 'POST', `${f.base('remote-campaign-node')}/remove-preview`, {})).body.code, 'LOCAL_SOURCE_REQUIRED');
  assert.equal((await request(f.routes, 'POST', `${f.base('template')}/remove-preview`, {})).body.code, 'LOCAL_SOURCE_REQUIRED');
  putRecord(f.db, 'campaign-archive', value.id, { ...value, origin: 'feishu' });
  assert.equal((await request(f.routes, 'POST', `${f.base(value.id)}/remove-preview`, {})).body.code, 'LOCAL_SOURCE_REQUIRED');
  assert.equal((await ok(f.routes, 'GET', '/api/v3/campaigns/current')).id, current.id);
});

test('B2 历史战役删除恢复后旧编辑与归档令牌不能重建或覆盖对象', async t => {
  const f = fixture(t, 'campaign'), { value, creation, edit, archive } = await f.create();
  await f.change(value.id, 'remove');
  assert.equal((await request(f.routes, 'PATCH', '/api/v3/campaigns/current', confirmed(creation))).status, 409);
  await f.change(value.id, 'restore');
  assert.equal((await request(f.routes, 'PATCH', '/api/v3/campaigns/current', confirmed(edit))).status, 409);
  assert.equal((await request(f.routes, 'POST', '/api/v3/campaigns/current/archive', confirmed(archive))).body.code, 'LOCAL_DELETE_PREVIEW_STALE');
  assert.equal(getRecord(f.db, 'campaign', 'current'), null);
  assert.deepEqual(getRecord(f.db, 'campaign-archive', value.id), value);
});

test('B2 项目另一服务持有的已确认和待确认编辑令牌也受生命周期隔离', async t => {
  const f = fixture(t, 'project'), { value } = await f.create(), other = f.rebuild();
  const saved = await ok(other, 'POST', `/api/v3/projects/${value.id}/preview`, { nodeId: value.nodes[0].id, done: true });
  await ok(other, 'PATCH', `/api/v3/projects/${value.id}`, confirmed(saved));
  const pending = await ok(other, 'POST', `/api/v3/projects/${value.id}/preview`, { nodeId: value.nodes[0].id, done: false });
  await f.change(value.id, 'remove'); await f.change(value.id, 'restore');
  for (const p of [saved, pending]) {
    const denied = await request(other, 'PATCH', `/api/v3/projects/${value.id}`, confirmed(p));
    assert.equal(denied.status, 409); assert.equal(denied.body.code, 'LOCAL_DELETE_PREVIEW_STALE');
  }
  assert.equal((await ok(f.routes, 'GET', f.root)).items[0].nodes[0].done, true);
});

test('B2 历史战役预览后出现飞书同ID记录会拒绝确认', async t => {
  const f = fixture(t, 'campaign'), { value } = await f.create();
  const p = await f.preview(value.id, 'remove');
  const cache = getRecord(f.db, 'marketing-source', 'campaign-template');
  putRecord(f.db, 'marketing-source', 'campaign-template', { ...cache, rows: [...cache.rows, { ...cache.rows[0], id: value.id }] });
  const denied = await f.commit(value.id, 'remove', p);
  assert.equal(denied.status, 409); assert.equal(denied.body.code, 'LOCAL_SOURCE_CONFLICT');
  assert.equal((await ok(f.routes, 'GET', f.root)).items[0].id, value.id);
});

test('B2 已存在的不同ID同名历史战役删除其一后可以原ID完整恢复', async t => {
  const f = fixture(t, 'campaign');
  const first = (await f.create('允许重复的历史名称')).value;
  const second = (await f.create('允许重复的历史名称')).value;
  assert.notEqual(first.id, second.id);
  await f.change(first.id, 'remove');
  assert.deepEqual((await ok(f.routes, 'GET', f.root)).items, [second]);
  await f.change(first.id, 'restore');
  const restored = (await ok(f.routes, 'GET', f.root)).items;
  assert.equal(restored.length, 2);
  assert.deepEqual(restored.find(item => item.id === first.id), first);
  assert.deepEqual(restored.find(item => item.id === second.id), second);
  assert.deepEqual((await ok(f.routes, 'GET', `${f.root}?deleted=true`)).items, []);
});
