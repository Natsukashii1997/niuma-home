import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createLocalChanges, getRecord, putRecord, fingerprint } from './local-records.mjs';
import { failure } from './v3-common.mjs';

const execute = promisify(execFile);
const imageFile = /^[0-9a-f-]{36}\.jpg$/;
export function referenceDir(db) { return path.join(path.dirname(db.prepare('PRAGMA database_list').get().file), 'refs'); }
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw failure(400, `${name}格式无效`);
  return value;
}
function number(value, name, min, max) {
  if (!Number.isFinite(value) || value < min || value > max) throw failure(400, `${name}超出可用范围`);
  return value;
}
export async function compressReference(dataUrl, { run = execute } = {}) {
  const match = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) throw failure(415, '参考图片仅接受 PNG、JPEG 或 WEBP');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw failure(413, '参考图片须小于8MB');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
  if (!valid) throw failure(415, '图片内容与声明格式不一致');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'workdesk-ref-'));
  try {
    const input = path.join(temporary, `input.${match[1]}`), output = path.join(temporary, 'compressed.jpg');
    fs.writeFileSync(input, bytes, { flag: 'wx', mode: 0o600 });
    await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '75', '--resampleHeightWidthMax', '1600', input, '--out', output], { timeout: 20000, maxBuffer: 100000, encoding: 'utf8', shell: false });
    const result = fs.readFileSync(output);
    if (result.length > 4 * 1024 * 1024 || result[0] !== 255 || result[1] !== 216) throw failure(415, '图片压缩结果无效');
    return result;
  } catch (error) { if (error.status) throw error; throw failure(415, '无法解码或压缩图片，请换一张有效图片'); }
  finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

export function createReferenceService(db, { now = Date.now, compress = compressReference, collection = false } = {}) {
  const kind = collection ? 'design-refs' : 'refs', prefix = `/api/v3/${kind}/images/`;
  const directory = () => collection ? path.join(path.dirname(referenceDir(db)), 'design-refs') : referenceDir(db);
  const sources = value => new Set(value.items.flatMap(i => [i.src, ...(i.gallery || [])]).filter(src => typeof src === 'string' && src.startsWith(prefix) && imageFile.test(src.slice(prefix.length))));
  const changes = createLocalChanges(db, { now }), files = new Map();
  const read = () => getRecord(db, kind, 'canvas') || { zones: [], items: [] };
  const state = () => { const value = read(); return { value, revision: fingerprint(value) }; };
  const inflight = new Map();
  const service = {
    read, state,
    importReceipt(id, hash) { const r = getRecord(db, `${kind}-save`, id); if (!r) return null; if (r.importHash !== hash) throw failure(409, '同一导入编号不能提交不同内容'); return r.receipt; },
    operation(id) { const receipt = service.receipt(id); return receipt ? { status: 'saved', receipt } : { status: inflight.has(id) ? 'pending' : 'absent' }; },
    receipt(id) { return getRecord(db, `${kind}-save`, id)?.receipt || null; },
    async preview(body) {
      const value = body?.value ?? body;
      if (!value || !Array.isArray(value.zones) || value.zones.length > 50 || !Array.isArray(value.items) || value.items.length > 500) throw failure(400, '参考画布须包含 zones 和 items');
      if ([...value.zones, ...value.items].some(item => !item || typeof item !== 'object' || Array.isArray(item))) throw failure(400, '画布分区与参考项须为有效对象');
      const current = read(), images = [], ids = new Set();
      const zones = value.zones.map(z => ({ name: text(z.name, '分区名称', 100, true), x: number(z.x,'横坐标',-20000,20000), y:number(z.y,'纵坐标',-20000,20000), w:number(z.w,'宽度',20,20000), h:number(z.h,'高度',20,20000) }));
      if (new Set(zones.map(z => z.name)).size !== zones.length) throw failure(400, '分组名称不能重复');
      const items = [];
      for (const item of value.items) {
        const id = item.id || randomUUID();
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw failure(400, '参考项编号无效或重复');
        ids.add(id);
        if (!Array.isArray(item.tags) || item.tags.length > 20) throw failure(400, '标签须为不超过20项的数组');
        const result = { id, x:number(item.x,'横坐标',-20000,20000), y:number(item.y,'纵坐标',-20000,20000), w:number(item.w,'宽度',20,5000), kind: text(item.kind || 'poster','版式类型',30), title:text(item.title,'标题',200,true), tags:item.tags.map(t=>text(t,'标签',50,true)), source:text(item.source || '', '来源',1000) };
        if (item.big !== undefined) result.big = text(item.big,'大字',100);
        if (item.accent !== undefined) { if (typeof item.accent !== 'boolean') throw failure(400,'强调值须为布尔值'); result.accent = item.accent; }
        if (item.imageDataUrl) {
          const bytes = await compress(item.imageDataUrl), file = `${randomUUID()}.jpg`;
          images.push({ file, bytes }); result.src = prefix + file;
        } else if (item.src) {
          if (typeof item.src !== 'string') throw failure(400, '图片地址须为文字');
          const old = current.items.find(x=>x.id===id);
          if (old?.src !== item.src || !imageFile.test(item.src.slice(prefix.length)) || !item.src.startsWith(prefix)) throw failure(400,'图片须先经本地上传预览');
          result.src = item.src;
        }
        if (collection) {
          if (item.post) {
            const p = item.post;
            result.post = { id: text(p.id, '来源编号', 80, true), author: text(p.author || '', '作者', 200), content: text(p.content || '', '正文', 50000), type: p.type === 'video' ? 'video' : 'normal', url: text(p.url || '', '原帖链接', 2000) };
            if (result.post.url && !/^https:\/\//.test(result.post.url)) throw failure(400, '原帖链接须为HTTPS');
          }
          if (item.gallery !== undefined && (!Array.isArray(item.gallery) || item.gallery.length > 40)) throw failure(400, '每篇帖子最多40张图片');
          result.gallery = [];
          for (const src of item.gallery || []) {
            if (typeof src === 'string' && src.startsWith('data:')) {
              const bytes = await compress(src), file = `${randomUUID()}.jpg`;
              images.push({ file, bytes }); result.gallery.push(prefix + file);
            } else {
              const old = current.items.find(x => x.id === id);
              if (!old?.gallery?.includes(src) || !sources(current).has(src)) throw failure(400, '帖子图片须从本地收藏导入');
              result.gallery.push(src);
            }
          }
          if (result.gallery.length) result.src = result.gallery[0];
        }
        items.push(result);
      }
      if (fingerprint(read()) !== fingerprint(current)) throw failure(409, '画布已在其他页面变化，请重新读取后操作');
      const preview = changes.preview(kind, 'canvas', { zones, items });
      for (const [id,p] of files) if (p.expires <= now()) files.delete(id);
      files.set(preview.previewId, { images, before: current, value: { zones, items }, expires: Date.parse(preview.expiresAt) });
      return { ...preview, imageBytes: images.reduce((n,x)=>n+x.bytes.length,0) };
    },
    confirm(body, operation) {
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '请先预览，再明确确认');
      const prepared = files.get(body.previewId);
      if (!prepared || prepared.expires <= now()) throw failure(409, '参考画布预览已失效，请重新读取');
      if (prepared.receipt) return prepared.receipt;
      const created = [], removed = [];
      try {
        prepared.receipt = changes.confirm(kind, 'canvas', body, { beforeCommit(value) {
          if (prepared.images.length) fs.mkdirSync(directory(), { recursive: true });
          for (const image of prepared.images) {
            const target = path.join(directory(), image.file);
            const fd = fs.openSync(target, 'wx', 0o600); created.push(target);
            try { fs.writeFileSync(fd, image.bytes); } finally { fs.closeSync(fd); }
            if (!fs.readFileSync(target).equals(image.bytes)) throw failure(500, '图片保存后核对失败');
          }
          const retained = sources(value);
          for (const src of sources(prepared.before)) {
            if (retained.has(src)) continue;
            const target = path.join(directory(), src.slice(prefix.length));
            let fd, bytes;
            try { fd = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); bytes = fs.readFileSync(fd); }
            catch (error) { if (error.code !== 'ENOENT') throw error; }
            finally { if (fd !== undefined) fs.closeSync(fd); }
            if (bytes) { fs.unlinkSync(target); removed.push({ target, bytes }); }
            if (fs.existsSync(target)) throw failure(500, '图片缓存清理失败');
          }
          if (operation) {
            putRecord(db, `${kind}-save`, operation.requestId, { hash: operation.hash, importHash: operation.importHash, receipt: { value, revision: fingerprint(value), requestId: operation.requestId } }, now());
            db.prepare('DELETE FROM v3_documents WHERE kind=? AND id IN (SELECT id FROM v3_documents WHERE kind=? ORDER BY updated_at DESC LIMIT -1 OFFSET 100)').run(`${kind}-save`, `${kind}-save`);
          }
        } });
        prepared.images = []; return prepared.receipt;
      } catch (error) {
        const recovery = [];
        for (const target of created) try { fs.rmSync(target, { force: true }); } catch (e) { recovery.push(e.message); }
        for (const { target, bytes } of removed) try { if (!fs.existsSync(target)) fs.writeFileSync(target, bytes, { flag: 'wx', mode: 0o600 }); } catch (e) { recovery.push(e.message); }
        if (recovery.length) throw failure(500, `保存失败，文件恢复未全部完成，请核对后再操作：${error.message}；${recovery.join('；')}`);
        throw error;
      }
    },
    async save(body) {
      const { requestId, baseRevision, value } = body || {};
      if (typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(requestId)) throw failure(400, '保存编号无效');
      const hash = fingerprint({ baseRevision, value });
      const old = getRecord(db, `${kind}-save`, requestId);
      if (old) { if (old.hash !== hash) throw failure(409, '同一保存编号不能提交不同内容'); return old.receipt; }
      const busy = inflight.get(requestId);
      if (busy) { if (busy.hash !== hash) throw failure(409, '同一保存编号不能提交不同内容'); return busy.promise; }
      if (baseRevision !== fingerprint(read())) throw failure(409, '内容已在其他页面变化，请重新读取后操作');
      const promise = (async () => {
        const pv = await service.preview(value);
        try {
          if (baseRevision !== fingerprint(read())) throw failure(409, '内容已变化，请重新读取后操作');
          const saved = service.confirm({ previewId: pv.previewId, confirm: true }, { requestId, hash, importHash: body.importHash });
          return { value: saved, revision: fingerprint(saved), requestId };
        } finally { changes.discard(pv.previewId); files.delete(pv.previewId); }
      })();
      inflight.set(requestId, { hash, promise });
      try { return await promise; } finally { inflight.delete(requestId); }
    },
    image(file) {
      if (!imageFile.test(file) || !sources(read()).has(prefix+file)) throw failure(404,'参考图片不存在');
      let fd; try { fd=fs.openSync(path.join(directory(),file),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);return fs.readFileSync(fd); }
      catch { throw failure(404,'参考图片不可读'); } finally { if(fd!==undefined)fs.closeSync(fd); }
    },
  };
  return service;
}
