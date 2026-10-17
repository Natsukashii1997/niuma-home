import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { openDb } from '../server/db.mjs';
import { match } from '../server/http.mjs';
import { collectionImage, readCollection } from '../server/digiworld.mjs';
import { routes as referenceRoutes } from '../server/routes/references.mjs';

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const V = 'a'.repeat(32);
// 合成的数码世界数据目录（不是真实收藏）：一条图文两张图、一条视频只取封面、一条图片路径指向别的笔记
function fixture(t, mutate = s => s) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'digiworld-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const media = (id, file) => { const p = path.join(dir, 'collection', 'versions', V, 'media', id); mkdirSync(p, { recursive: true }); writeFileSync(path.join(p, file), PNG); return `/collection-media/${V}/media/${id}/${file}`; };
  const state = mutate({ schema: 1, revision: 9, categories: { n1: '设计参考' }, notes: [
    { id: 'n1', type: 'normal', title: '版式合集', sourceUrl: 'https://www.xiaohongshu.com/explore/n1', imageUrls: [media('n1', '01.png'), media('n1', '02.png')] },
    { id: 'v1', type: 'video', title: '视频教程', sourceUrl: 'https://www.xiaohongshu.com/explore/v1', coverUrl: media('v1', '01.png'), imageUrls: [media('v1', '01.png'), media('v1', '02.png')] },
    { id: 'x1', type: 'normal', title: '路径不对', imageUrls: [`/collection-media/${V}/media/n1/01.png`, '/collection-media/../../etc/passwd'] },
  ], operations: [], trash: [], desk: { groups: [{ id: 'g1', name: '设计参考', kind: 'custom' }, { id: 'g2', name: '调酒', kind: 'custom' }], noteGroupMap: { n1: 'g1', v1: 'loose' } } });
  writeFileSync(path.join(dir, 'collection', 'state.json'), JSON.stringify({ sha256: createHash('sha256').update(JSON.stringify(state)).digest('hex'), state }));
  return dir;
}

test('只读收藏：校验 sha256 与 schema；图文取全部图、视频只取封面；图片路径必须属于这条笔记', t => {
  const dir = fixture(t), c = readCollection(dir);
  assert.equal(c.revision, 9);
  assert.deepEqual(c.groups, ['设计参考', '调酒']);
  assert.deepEqual(c.notes.map(n => n.group), ['设计参考', '', ''], '桌面分组按 noteGroupMap 对上，没分组为空');
  assert.deepEqual(readCollection(fixture(t, s => { delete s.desk; return s; })).groups, [], '没有桌面分组也能读');
  assert.deepEqual(c.notes.map(n => [n.id, n.type, n.category, n.images.length]), [['n1', 'normal', '设计参考', 2], ['v1', 'video', '', 1], ['x1', 'normal', '', 0]]);
  assert.ok(collectionImage('n1', 1, dir).bytes.equals(PNG));
  assert.throws(() => collectionImage('x1', 0, dir), e => e.status === 404);
  assert.throws(() => collectionImage('n1', 5, dir), e => e.status === 404);
  const broken = fixture(t); writeFileSync(path.join(broken, 'collection', 'state.json'), JSON.stringify({ sha256: 'x', state: { schema: 1, notes: [] } }));
  assert.throws(() => readCollection(broken), e => e.status === 503 && e.code === 'DIGIWORLD_UNAVAILABLE' && /校验失败/.test(e.message));
  assert.throws(() => readCollection(fixture(t, s => ({ ...s, schema: 2 }))), e => e.status === 503 && /schema 2/.test(e.message));
  assert.throws(() => readCollection(path.join(dir, 'missing')), e => e.status === 503);
  assert.throws(() => readCollection('relative/path'), e => e.status === 503);
  const linked = fixture(t); rmSync(path.join(linked, 'collection', 'versions', V, 'media', 'n1', '02.png')); symlinkSync('/etc/hosts', path.join(linked, 'collection', 'versions', V, 'media', 'n1', '02.png'));
  assert.throws(() => collectionImage('n1', 1, linked), e => e.status === 404, '不跟随符号链接');
});

async function invoke(all, method, endpoint, body) {
  const url = new URL(endpoint, 'http://127.0.0.1'), found = match(all, method, url.pathname); assert.ok(found, endpoint);
  let status, headers = {}, out; const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  const res = { setHeader() {}, writeHead(code, h = {}) { status = code; headers = h; }, end(value) { out = value; } };
  await found.handler(req, res, { params: found.params, url });
  return { status, headers, body: headers['content-type']?.startsWith('image/') ? out : JSON.parse(out) };
}

test('收藏列表经 HTTP 只读返回；保存进画布后标「已导入」；读取失败返回概括错误', async t => {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dbDir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'digiworld-db-')), db = openDb(dbDir);
  t.after(() => { db.close(); rmSync(dbDir, { recursive: true, force: true }); });
  const dir = fixture(t);
  const all = referenceRoutes(db, { digiworldDir: dir, compress: async () => Buffer.from([255, 216, 255, 0]) });
  const list = await invoke(all, 'GET', '/api/v3/refs/digiworld');
  assert.equal(list.status, 200);
  assert.equal(list.body.defaultGroup, '设计参考'); assert.deepEqual(list.body.groups, ['设计参考', '调酒']);
  assert.deepEqual(list.body.notes.map(n => [n.id, n.images, n.imported]), [['n1', 2, false], ['v1', 1, false], ['x1', 0, false]]);
  const img = await invoke(all, 'GET', '/api/v3/refs/digiworld/v1/images/0');
  assert.equal(img.status, 200); assert.equal(img.headers['content-type'], 'image/png');
  const p = await invoke(all, 'POST', '/api/v3/refs/preview', { zones: [], items: [{ id: 'dw1', x: 40, y: 40, w: 180, title: '版式合集 · 1/2', tags: ['设计参考'], source: '数码世界笔记 n1 · https://www.xiaohongshu.com/explore/n1', imageDataUrl: `data:image/png;base64,${PNG.toString('base64')}` }] });
  assert.equal(p.status, 200);
  assert.equal((await invoke(all, 'POST', '/api/v3/refs', { previewId: p.body.previewId, confirm: true })).status, 200);
  assert.deepEqual((await invoke(all, 'GET', '/api/v3/refs/digiworld')).body.notes.map(n => n.imported), [true, false, false]);
  const failed = await invoke(referenceRoutes(db, { digiworldDir: path.join(dir, 'missing') }), 'GET', '/api/v3/refs/digiworld');
  assert.equal(failed.status, 503); assert.match(failed.body.error, /读不到数码世界收藏数据/);
});
