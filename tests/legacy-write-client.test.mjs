import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyWrite, recoverLegacy, pendingLegacy, pendingLegacyIn, legacyImageRequest, retryLegacy } from '../src/ui/legacy-write.js';

function setup(t, handler) {
  const previous = { storage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), fetch: globalThis.fetch };
  const storage = {};
  Object.defineProperties(storage, {
    getItem: { value(key) { return this[key] ?? null; } },
    setItem: { value(key, value) { this[key] = String(value); } },
    removeItem: { value(key) { delete this[key]; } },
  });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = previous.fetch;
    if (previous.storage) Object.defineProperty(globalThis, 'localStorage', previous.storage);
    else delete globalThis.localStorage;
  });
  return storage;
}
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const request = { method: 'POST', path: '/api/materials', body: { name: '待保存草稿' } };
const result = { id: 42, name: '待保存草稿', writeVersion: 'verified' };
const receipt = op => ({ id: op.requestId, scope: `${op.method} ${op.path.split('?')[0]}`, result, completedAt: '2026-10-22T00:00:00Z' });

test('断网后刷新仍有原草稿与操作编号；只读回执和业务回读一致后才能清除', async t => {
  const calls = [];
  setup(t, async (path, options) => { calls.push({ path, options }); throw new Error('网络中断'); });
  await assert.rejects(legacyWrite('materials:create', request, () => true), /网络中断/);
  const op = pendingLegacy('materials:create');
  assert.deepEqual(op.body, request.body);
  assert.equal(calls[0].options.headers['X-Workdesk-Request-Id'], op.requestId);
  assert.equal(pendingLegacyIn('material').length, 1);
  let verified = false;
  globalThis.fetch = async path => { assert.equal(path, `/api/legacy-writes/${op.requestId}`); return json(receipt(op)); };
  assert.deepEqual(await recoverLegacy('materials:create', actual => { verified = true; return actual.id === 42; }), result);
  assert.equal(verified, true);
  assert.equal(pendingLegacy('materials:create'), null);
});

test('结果未知时显式重试复用原编号；改变内容不得偷偷用新编号提交', async t => {
  setup(t, async () => { throw Error('离线'); });
  await assert.rejects(legacyWrite('materials:create', request, () => true), /离线/);
  const original = pendingLegacy('materials:create');
  await assert.rejects(legacyWrite('materials:create', { ...request, body: { name: '另一份' } }, () => true), { code: 'WRITE_PENDING_CHANGED' });
  assert.equal(pendingLegacy('materials:create').requestId, original.requestId);
  const sends = [];
  globalThis.fetch = async (path, options) => {
    if (options) { sends.push(options); return json(result); }
    return json(receipt(original));
  };
  await retryLegacy('materials:create', () => true);
  assert.equal(sends.length, 1);
  assert.equal(sends[0].headers['X-Workdesk-Request-Id'], original.requestId);
  assert.equal(sends[0].body, JSON.stringify(request.body));
});

test('并发双击仅发送一次，回执存在但业务回读不一致时保留草稿', async t => {
  let release;
  setup(t, async (_path, options) => options ? new Promise(resolve => { release = () => resolve(json(result)); }) : json(receipt(pendingLegacy('materials:create'))));
  const first = legacyWrite('materials:create', request, () => false);
  await assert.rejects(legacyWrite('materials:create', request, () => true), { code: 'WRITE_BUSY' });
  release();
  await assert.rejects(first, { code: 'WRITE_READBACK_MISMATCH' });
  assert.deepEqual(pendingLegacy('materials:create').body, request.body);
});

test('回执404或scope不匹配都不能清除记录或自动补发', async t => {
  let calls = 0;
  setup(t, async () => { calls++; throw Error('离线'); });
  await assert.rejects(legacyWrite('materials:create', request, () => true));
  const original = pendingLegacy('materials:create');
  globalThis.fetch = async () => { calls++; return json({ code: 'WRITE_RECEIPT_UNKNOWN' }, 404); };
  await assert.rejects(recoverLegacy('materials:create', () => true), { code: 'WRITE_RECEIPT_UNKNOWN' });
  assert.equal(calls, 2);
  assert.equal(pendingLegacy('materials:create').requestId, original.requestId);
  globalThis.fetch = async () => json({ ...receipt(original), scope: 'POST /api/assistants' });
  await assert.rejects(recoverLegacy('materials:create', () => true), { code: 'WRITE_RECEIPT_MISMATCH' });
  assert.equal(pendingLegacy('materials:create').requestId, original.requestId);
});

test('版本冲突保留原基线和手填内容，不能自动改基线覆盖', async t => {
  setup(t, async () => json({ code: 'WRITE_CONFLICT', error: '内容已有变化' }, 409));
  const update = { method: 'PATCH', path: '/api/assistants/3', body: { instructions: '手写内容' }, baseVersion: 'old' };
  await assert.rejects(legacyWrite('assistant:3:edit', update, () => true), { code: 'WRITE_CONFLICT' });
  assert.equal(pendingLegacy('assistant:3:edit').baseVersion, 'old');
  await assert.rejects(legacyWrite('assistant:3:edit', { ...update, baseVersion: 'new' }, () => true), { code: 'WRITE_CONFLICT' });
  let rereads = 0;
  globalThis.fetch = async () => { rereads++; return json({}, 404); };
  await assert.rejects(recoverLegacy('assistant:3:edit', () => true), { code: 'WRITE_CONFLICT' });
  await assert.rejects(retryLegacy('assistant:3:edit', () => true), { code: 'WRITE_CONFLICT' });
  assert.equal(rereads, 0);
  assert.equal(pendingLegacy('assistant:3:edit').body.instructions, '手写内容');
});

test('浏览器存储失效时请求尚未发送，无法清除已核对记录时也不假报成功', async t => {
  let sends = 0;
  const storage = setup(t, async () => { sends++; return json(result); });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem() { return null; }, setItem() { throw Error('quota'); } } });
  await assert.rejects(legacyWrite('materials:create', request, () => true), { code: 'WRITE_STORAGE_FAILED' });
  assert.equal(sends, 0);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  globalThis.fetch = async (_path, options) => options ? json(result) : json(receipt(pendingLegacy('materials:create')));
  await assert.rejects(legacyWrite('materials:create', request, () => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => storage.getItem(key), removeItem() { throw Error('locked'); } } });
    return true;
  }), { code: 'WRITE_STORAGE_FAILED' });
  assert.ok(Object.keys(storage).length);
});

test('图片持久化的只有原文件摘要，同名不同内容不能重用未知上传编号', async t => {
  setup(t, async () => { throw Error('离线'); });
  const a = Object.assign(new Blob(['first']), { name: '海报.png' });
  const b = Object.assign(new Blob(['other']), { name: '海报.png' });
  const first = await legacyImageRequest(7, a, 'image/png', 'version1');
  assert.equal(first.body.sha256.length, 64);
  assert.equal(first.body.size, 5);
  await assert.rejects(legacyWrite('material:7:upload', first, () => true, async () => { throw Error('连接中断'); }));
  assert.ok(JSON.stringify(pendingLegacy('material:7:upload')).length < 1000);
  const different = await legacyImageRequest(7, b, 'image/png', 'version1');
  await assert.rejects(legacyWrite('material:7:upload', different, () => true), { code: 'WRITE_PENDING_CHANGED' });
  assert.equal(pendingLegacy('material:7:upload').body.sha256, first.body.sha256);
});

test('写请求已成功后，回执或业务回读400也必须保留防重编号', async t => {
  setup(t, async (_path, options) => options ? json(result, 201) : json(receipt(pendingLegacy('materials:create'))));
  await assert.rejects(legacyWrite('materials:create', request, () => { throw Object.assign(Error('读取参数不接受'), { status: 400 }); }), /读取参数不接受/);
  assert.ok(pendingLegacy('materials:create')?.requestId);
});

test('月度方案中文URL与后端解码后的scope核对一致', async t => {
  const update = { method: 'PUT', path: '/api/plans/2026-11/' + encodeURIComponent('大学辅导'), body: { rawText: '原文' }, baseVersion: 'old' };
  setup(t, async (_path, options) => options ? json(result) : json({ ...receipt(pendingLegacy('monthplan:2026-11')), scope: 'PUT /api/plans/2026-11/大学辅导' }));
  await legacyWrite('monthplan:2026-11', update, () => true);
  assert.equal(pendingLegacy('monthplan:2026-11'), null);
});

test('A成功、B未知后恢复，只移除确认的A/B，C继续时不会重新上传前两张', async () => {
  const { removeConfirmedUploads } = await import('../src/modules/marketing/material-write.js');
  let queue = [{ name: '同名.png', requestId: 'A' }, { name: '同名.png', requestId: 'B' }, { name: '同名.png' }];
  queue = removeConfirmedUploads(queue, ['A']);
  assert.equal(queue.length, 2);
  assert.equal(queue[0].requestId, 'B');
  queue = removeConfirmedUploads(queue, ['B']);
  assert.deepEqual(queue, [{ name: '同名.png' }]);
  assert.equal(removeConfirmedUploads(queue, ['A', 'B']), queue);
});
