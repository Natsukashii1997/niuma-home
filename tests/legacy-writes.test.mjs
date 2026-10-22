import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { routes as assistantRoutes } from '../server/routes/assistants.mjs';
import { routes as marketingRoutes } from '../server/routes/marketing.mjs';
import { match, json } from '../server/http.mjs';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=', 'base64');
const material = { month: '2026-11', line: '大学辅导', name: '临时防重验收', type: '海报', skus: [], note: '保留内容' };
const headers = (base, id = randomUUID()) => ({ 'x-workdesk-request-id': id, ...(base && { 'x-workdesk-base-version': base }) });

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'legacy-writes-'));
  let db = openDb(dir), handlers;
  const client = { listSessions: async () => [{ threadId: 'thread-test', name: '测试会话' }] };
  const rebuild = () => { handlers = [...assistantRoutes(db, client), ...marketingRoutes(db)]; };
  rebuild();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), found = match(handlers, req.method, url.pathname);
    if (!found) return json(res, 404, {});
    try { await found.handler(req, res, { params: found.params, url }); }
    catch (error) { json(res, error.status || 500, { error: error.message, code: error.code }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = async (method, url, body, extra = {}, type = 'application/json') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${url}`, { method, headers: { 'content-type': type, ...extra }, body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body });
    return { status: response.status, body: await response.json() };
  };
  return { request, dir, get db() { return db; }, client, restart() { db.close(); db = openDb(dir); rebuild(); } };
}

test('助手创建并发和重启后重复只保留一份，异体同ID拒绝；回执可单独只读恢复', async t => {
  const h = await setup(t), operation = headers(), body = { name: '一次助手', instructions: '原始说明' };
  assert.equal((await h.request('POST', '/api/assistants', body)).status, 428);
  const [first, repeated] = await Promise.all([h.request('POST', '/api/assistants', body, operation), h.request('POST', '/api/assistants', body, operation)]);
  assert.equal(first.status, 201); assert.deepEqual(repeated, first);
  h.restart();
  assert.deepEqual(await h.request('POST', '/api/assistants', body, operation), first);
  assert.equal((await h.request('GET', '/api/assistants')).body.filter(a => a.name === body.name).length, 1);
  const changed = await h.request('POST', '/api/assistants', { ...body, instructions: '不同内容' }, operation);
  assert.equal(changed.status, 409); assert.equal(changed.body.code, 'WRITE_ID_REUSED');
  const receipt = await h.request('GET', `/api/legacy-writes/${operation['x-workdesk-request-id']}`);
  assert.equal(receipt.status, 200); assert.deepEqual(receipt.body.result, first.body);
  assert.equal((await h.request('GET', '/api/legacy-writes/no-receipt')).body.code, 'WRITE_RECEIPT_UNKNOWN');
});

test('助手编辑基线不随模型/网络等待自动更新；导入重放无需再次发现源会话', async t => {
  const h = await setup(t), a = (await h.request('GET', '/api/assistants')).body[0];
  assert.equal((await h.request('PATCH', `/api/assistants/${a.id}`, { name: '缺少版本' }, headers())).status, 428);
  const editHeaders = headers(a.writeVersion), updated = await h.request('PATCH', `/api/assistants/${a.id}`, { name: '已有编辑' }, editHeaders);
  assert.equal(updated.status, 200);
  const conflict = await h.request('PATCH', `/api/assistants/${a.id}`, { instructions: '陈旧草稿' }, headers(a.writeVersion));
  assert.equal(conflict.status, 409); assert.equal(conflict.body.code, 'WRITE_CONFLICT');
  assert.equal((await h.request('GET', '/api/assistants')).body[0].instructions, a.instructions);
  assert.deepEqual(await h.request('PATCH', `/api/assistants/${a.id}`, { name: '已有编辑' }, editHeaders), updated);
  const operation = headers(), input = { threadIds: ['thread-test'] }, imported = await h.request('POST', '/api/assistants/import', input, operation);
  assert.equal(imported.status, 200);
  h.client.listSessions = async () => { throw Error('源不可用'); };
  assert.deepEqual(await h.request('POST', '/api/assistants/import', input, operation), imported);
});

test('物料和图片重复、陈旧编辑、删除后重放均不增行；跨接口复用操作ID被拒绝', async t => {
  const h = await setup(t), create = headers(), first = await h.request('POST', '/api/materials', material, create), id = first.body.id;
  assert.equal(first.status, 201);
  assert.deepEqual(await h.request('POST', '/api/materials', material, create), first);
  assert.equal((await h.request('POST', '/api/assistants', material, create)).body.code, 'WRITE_ID_REUSED');
  const upload = headers(first.body.writeVersion), image = await h.request('POST', `/api/materials/${id}/images?name=test.png`, png, upload, 'image/png');
  assert.equal(image.status, 201);
  assert.deepEqual(await h.request('POST', `/api/materials/${id}/images?name=test.png`, png, upload, 'image/png'), image);
  assert.equal(readdirSync(path.join(h.dir, 'images')).length, 1);
  assert.equal((await h.request('PATCH', `/api/materials/${id}`, { note: '陈旧' }, headers(first.body.writeVersion))).body.code, 'WRITE_CONFLICT');
  const removeImage = headers(image.body.writeVersion), deletedImage = await h.request('DELETE', `/api/materials/${id}/images/${image.body.id}`, undefined, removeImage);
  assert.equal(deletedImage.status, 200);
  h.restart();
  assert.deepEqual(await h.request('DELETE', `/api/materials/${id}/images/${image.body.id}`, undefined, removeImage), deletedImage);
  const remove = headers(deletedImage.body.writeVersion), deleted = await h.request('DELETE', `/api/materials/${id}`, undefined, remove);
  assert.equal(deleted.status, 200);
  assert.deepEqual(await h.request('DELETE', `/api/materials/${id}`, undefined, remove), deleted);
  assert.deepEqual((await h.request('GET', '/api/materials')).body, []);
  assert.deepEqual(readdirSync(path.join(h.dir, 'images')), []);
});

test('回执插入失败时助手/物料数据及图片创建删除都原子回滚，不留孤立文件', async t => {
  const h = await setup(t);
  const m = (await h.request('POST', '/api/materials', material, headers())).body;
  const image = (await h.request('POST', `/api/materials/${m.id}/images`, png, headers(m.writeVersion), 'image/png')).body;
  const originalFile = path.join(h.dir, 'images', path.basename(image.url));
  h.db.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON v3_documents WHEN NEW.kind='legacy-write-receipt' BEGIN SELECT RAISE(ABORT,'test receipt failure'); END");
  assert.equal((await h.request('POST', '/api/assistants', { name: '不能留下的助手' }, headers())).status, 500);
  assert.equal((await h.request('POST', '/api/materials', { ...material, name: '不能留下的物料' }, headers())).status, 500);
  assert.equal((await h.request('POST', `/api/materials/${m.id}/images`, png, headers(image.writeVersion), 'image/png')).status, 500);
  assert.equal((await h.request('DELETE', `/api/materials/${m.id}/images/${image.id}`, undefined, headers(image.writeVersion))).status, 500);
  assert.deepEqual(readFileSync(originalFile), png);
  assert.equal((await h.request('DELETE', `/api/materials/${m.id}`, undefined, headers(image.writeVersion))).status, 500);
  assert.deepEqual(readFileSync(originalFile), png);
  assert.equal(readdirSync(path.join(h.dir, 'images')).length, 1);
  const list = (await h.request('GET', '/api/materials')).body;
  assert.equal(list.length, 1); assert.equal(list[0].images.length, 1); assert.equal(list[0].note, material.note);
  assert.equal((await h.request('GET', '/api/assistants')).body.length, 4);
});

test('月度方案用预览版本防覆盖，重复回执保持原统计，回执失败保留原促销和原文', async t => {
  const h = await setup(t), rawText = '【大学辅导板块】\n1. 灵活学Lite\n正价：120', month = '2026-11', line = '大学辅导';
  const preview = (await h.request('POST', '/api/plans/parse', { month, line, rawText })).body;
  const input = { rawText, rows: preview.rows, special: preview.special }, url = `/api/plans/${month}/${encodeURIComponent(line)}`, op = headers(preview.writeVersion);
  assert.equal((await h.request('PUT', url, input, headers())).status, 428);
  const saved = await h.request('PUT', url, input, op);
  assert.equal(saved.status, 200);
  assert.deepEqual(await h.request('PUT', url, input, op), saved);
  const stale = await h.request('PUT', url, input, headers(preview.writeVersion));
  assert.equal(stale.status, 409); assert.equal(stale.body.code, 'WRITE_CONFLICT');
  const before = (await h.request('GET', url)).body, promos = (await h.request('GET', '/api/promos')).body;
  const nextText = rawText.replace('120', '140'), next = (await h.request('POST', '/api/plans/parse', { month, line, rawText: nextText })).body;
  h.db.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON v3_documents WHEN NEW.kind='legacy-write-receipt' BEGIN SELECT RAISE(ABORT,'test receipt failure'); END");
  assert.equal((await h.request('PUT', url, { rawText: nextText, rows: next.rows, special: next.special }, headers(next.writeVersion))).status, 500);
  assert.deepEqual((await h.request('GET', url)).body, before);
  assert.deepEqual((await h.request('GET', '/api/promos')).body, promos);
});
