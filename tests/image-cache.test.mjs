import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { openDb, saveSetting } from '../server/db.mjs';
import { CACHE_IMAGE_TARGET_BYTES as MAX_CACHE_IMAGE_BYTES, compressCachedJpeg } from '../server/image-cache.mjs';
import { compressReference, createReferenceService } from '../server/references.mjs';
import { createNasMaterials } from '../server/nas-materials.mjs';

const execute = promisify(execFile);
const jpeg = size => { const b = Buffer.alloc(size); b.set([255,216,255]); return b; };
function fixture(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须使用隔离目录');
  const dir = fs.mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'image-limit-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir;
}

test('缓存压缩：正好1MB接受，超1字节继续压缩，每次从原图编码并清理临时文件', async () => {
  const calls = [], paths = [];
  const bytes = await compressCachedJpeg('/original.png', { run: async (command, args) => {
    calls.push(args); const output = args.at(-1); paths.push(output);
    fs.writeFileSync(output, jpeg(calls.length === 1 ? MAX_CACHE_IMAGE_BYTES + 1 : MAX_CACHE_IMAGE_BYTES));
  }});
  assert.equal(bytes.length, MAX_CACHE_IMAGE_BYTES); assert.equal(calls.length, 2);
  assert.ok(calls.every(a => a.at(-3) === '/original.png'));
  assert.ok(paths.every(p => !fs.existsSync(path.dirname(p))));
});

test('持续超限保留最小有效结果，后续压缩异常也保留；无有效结果才报错', async () => {
  for (const failLater of [false, true]) {
    let calls = 0, output;
    const bytes = await compressCachedJpeg('/input.png', {run:async (_,args) => {
      calls++; output = args.at(-1);
      if (failLater && calls === 3) throw new Error('later encoding failed');
      fs.writeFileSync(output,jpeg(MAX_CACHE_IMAGE_BYTES + (calls === 2 ? 1 : 100)));
    }});
    assert.equal(bytes.length, MAX_CACHE_IMAGE_BYTES + 1);
    assert.equal(calls, failLater ? 3 : 6);
    assert.equal(fs.existsSync(path.dirname(output)), false);
  }
  for (const mode of ['invalid', 'error']) {
    let calls = 0, output;
    await assert.rejects(compressCachedJpeg('/input.png', { run: async (_, args) => {
      calls++; output = args.at(-1);
      if (mode === 'error') throw new Error('timeout');
      fs.writeFileSync(output, Buffer.from('bad'));
    }}), e => e.status === 415);
    assert.equal(calls, 1);
    assert.equal(fs.existsSync(path.dirname(output)), false);
  }
});

test('画布与帖子图集超限仍保存、可读取、刷新后明确提醒，删除后提醒清除', async t => {
  const dir = fixture(t), db = openDb(dir); t.after(() => db.close());
  for (const collection of [false, true]) {
    const s = createReferenceService(db, { collection, compress: async () => jpeg(MAX_CACHE_IMAGE_BYTES + 1) });
    const item = {id:'one',x:0,y:0,w:180,title:'one',tags:[],...(collection ? {gallery:['data:image/jpeg;base64,fake']} : {imageDataUrl:'fake'})};
    const saved = await s.save({requestId:'too-big',baseRevision:s.state().revision,value:{zones:[],items:[item]}});
    assert.equal(s.read().items.length, 1); assert.ok(s.receipt('too-big'));
    assert.equal(s.image(path.basename(saved.value.items[0].src)).length,MAX_CACHE_IMAGE_BYTES+1);
    assert.match(createReferenceService(db,{collection}).state().warning,/1 张.*已保留/);
    await s.save({requestId:'delete',baseRevision:s.state().revision,value:{zones:[],items:[]}});
    assert.equal(s.state().warning,'');
  }
});

test('NAS超限缩略图保留并提醒，失败无半成品，原图保持不变', async t => {
  const dir = fixture(t), db = openDb(path.join(dir, 'data')); t.after(() => db.close());
  const root = path.join(dir, 'nas'), source = path.join(root, '2026-10月/大学辅导/试听海报.jpg'), thumbDir = path.join(dir, 'thumbs');
  fs.mkdirSync(path.dirname(source), {recursive:true}); const original = Buffer.from('source-original'); fs.writeFileSync(source, original);
  saveSetting(db, 'nas_root', root);
  let size = MAX_CACHE_IMAGE_BYTES, calls = 0, interrupted = false;
  const service = createNasMaterials(db, {thumbDir, makeThumb:async (_, output) => { calls++; fs.writeFileSync(output,jpeg(size)); if (interrupted) throw new Error('partial write'); }});
  const r = await service.scan(), item = r.lines.大学辅导.cells['2026-10|试听海报'][0];
  const target = path.join(thumbDir, `${item.id}.jpg`);
  assert.equal(service.thumb(item.id).length, MAX_CACHE_IMAGE_BYTES); assert.equal(item.size, original.length);
  await service.scan(); assert.equal(calls, 1, '合规缓存直接复用');
  fs.rmSync(target); size = MAX_CACHE_IMAGE_BYTES + 1;
  const oversized = await service.scan(); assert.equal(calls, 2);
  assert.match(oversized.warning,/1 张.*已保留/);
  assert.equal(service.thumb(item.id).length,MAX_CACHE_IMAGE_BYTES+1);
  await service.scan(); assert.equal(calls,2,'已保留缓存不反复压缩');
  assert.deepEqual(fs.readFileSync(source), original);
  fs.rmSync(target);
  size = 100; interrupted = true;
  const partial = await service.scan();
  assert.equal(partial.lines.大学辅导.cells['2026-10|试听海报'][0].thumb, null);
  assert.deepEqual(fs.readdirSync(thumbDir), [], '已写部分文件后抛错也清理');
});

test('原生压缩：高细节大图实际降到1MB以内，保存回读为可解码JPEG', {skip:process.platform !== 'darwin'}, async t => {
  const dir = fixture(t), source = path.join(dir, 'noise.ppm'), png = path.join(dir, 'noise.png');
  const pixels = Buffer.alloc(1600 * 1600 * 3); let seed = 123456789;
  for (let i=0;i<pixels.length;i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels[i] = seed & 255; }
  fs.writeFileSync(source, Buffer.concat([Buffer.from('P6\n1600 1600\n255\n'),pixels]));
  await execute('/usr/bin/sips',['-s','format','png',source,'--out',png]);
  const input = fs.readFileSync(png); assert.ok(input.length > MAX_CACHE_IMAGE_BYTES);
  const lengths = [];
  const bytes = await compressReference(`data:image/png;base64,${input.toString('base64')}`, {run:async (cmd,args,options) => {
    const r = await execute(cmd,args,options); lengths.push(fs.statSync(args.at(-1)).size); return r;
  }});
  assert.ok(bytes.length <= MAX_CACHE_IMAGE_BYTES); assert.ok(lengths[0] > MAX_CACHE_IMAGE_BYTES, '首轮真实超限后继续压缩');
  assert.ok(lengths.length > 1);
  const db = openDb(path.join(dir,'data')); t.after(() => db.close());
  const s = createReferenceService(db, {compress:async()=>bytes});
  const saved = await s.save({requestId:'native',baseRevision:s.state().revision,value:{zones:[],items:[{id:'native',x:0,y:0,w:180,title:'native',tags:[],imageDataUrl:'encoded'}]}});
  assert.deepEqual(s.image(path.basename(saved.value.items[0].src)), bytes);
  const output = path.join(dir,'data','refs',path.basename(saved.value.items[0].src));
  const decoded = await execute('/usr/bin/sips',['-g','pixelWidth','-g','pixelHeight',output]);
  assert.match(decoded.stdout,/pixelWidth: \d+/); assert.doesNotMatch(decoded.stdout,/<nil>/);
  t.diagnostic(JSON.stringify({inputBytes:input.length,attemptBytes:lengths,storedBytes:bytes.length}));
});
