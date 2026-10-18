import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createLocalChanges, getRecord, listRecords } from './local-records.mjs';
import { beijingText, failure, requireMonth } from './v3-common.mjs';

// brief 附件：文件存在数据目录 brief-attachments/<月份>/ 下，记录存 v3_documents（kind brief-attachment）。
// 上传和删除都先预览、确认后才写；导出飞书时只写附件文件名清单，不上传文件。
export const ATTACHMENT_KIND = 'brief-attachment';
const MAX_BYTES = 15 * 1024 * 1024, MAX_COUNT = 30;
const zip = b => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const text = b => !b.includes(0) && Buffer.from(b.toString('utf8'), 'utf8').equals(b);
const TYPES = {
  png: ['image/png', b => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))],
  jpg: ['image/jpeg', b => b[0] === 255 && b[1] === 216 && b[2] === 255],
  jpeg: ['image/jpeg', b => b[0] === 255 && b[1] === 216 && b[2] === 255],
  webp: ['image/webp', b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'],
  gif: ['image/gif', b => /^GIF8[79]a$/.test(b.toString('ascii', 0, 6))],
  pdf: ['application/pdf', b => b.toString('ascii', 0, 5) === '%PDF-'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', zip],
  txt: ['text/plain; charset=utf-8', text],
  md: ['text/markdown; charset=utf-8', text],
};
export const attachmentDir = db => path.join(path.dirname(db.prepare('PRAGMA database_list').get().file), 'brief-attachments');
const sizeText = n => n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
export const attachmentMarkdownLine = a => `${a.name}（${sizeText(a.size)}）`;

export function createBriefAttachments(db, { now = Date.now } = {}) {
  const changes = createLocalChanges(db, { now });
  const pending = new Map();
  const list = month => listRecords(db, ATTACHMENT_KIND).filter(a => a.month === month).sort((a, b) => a.addedAt.localeCompare(b.addedAt));
  const remember = (preview, entry) => {
    for (const [id, p] of pending) if (p.expires <= now()) pending.delete(id);
    pending.set(preview.previewId, { ...entry, expires: Date.parse(preview.expiresAt) });
    return preview;
  };
  const fileOf = a => path.join(attachmentDir(db), a.month, a.file);
  return {
    list: month => ({ month: requireMonth(month), items: list(month) }),
    preview(month, body) {
      requireMonth(month);
      if (!body || typeof body !== 'object' || Object.keys(body).some(k => !['name', 'dataUrl'].includes(k))) throw failure(400, '附件内容无效');
      const name = typeof body.name === 'string' ? body.name.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() : '';
      if (!name || name.length > 120) throw failure(400, '文件名须为 120 字以内');
      const ext = path.extname(name).slice(1).toLowerCase(), type = TYPES[ext];
      if (!type) throw failure(415, `只接受 ${Object.keys(TYPES).join('、')} 文件`);
      const match = typeof body.dataUrl === 'string' && body.dataUrl.match(/^data:[^;,]*(?:;[^;,]*)*;base64,([A-Za-z0-9+/]*={0,2})$/);
      if (!match) throw failure(400, '文件内容须为 base64 数据');
      const bytes = Buffer.from(match[1], 'base64');
      if (!bytes.length || bytes.length > MAX_BYTES) throw failure(413, `附件须小于 ${MAX_BYTES / 1048576} MB`);
      if (!type[1](bytes)) throw failure(415, '文件内容与扩展名不一致');
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const validate = (value, current) => {
        if (current) throw failure(409, '附件编号冲突，请重新预览');
        const items = list(month);
        if (items.length >= MAX_COUNT) throw failure(400, `每月 brief 最多 ${MAX_COUNT} 个附件`);
        const same = items.find(a => a.sha256 === sha256);
        if (same) throw failure(400, `这个文件已经上传过：${same.name}`);
      };
      const id = randomUUID();
      const value = { id, month, name, size: bytes.length, type: type[0], file: `${id}.${ext}`, sha256, addedAt: new Date(now()).toISOString(), addedText: beijingText(now()) };
      return remember(changes.preview(ATTACHMENT_KIND, id, value, { validate }), { id, bytes, month, file: value.file });
    },
    removePreview(month, id) {
      requireMonth(month);
      const current = getRecord(db, ATTACHMENT_KIND, id);
      if (!current || current.month !== month) throw failure(404, '附件不存在，请重新读取');
      const validate = (value, record) => { if (!record) throw failure(409, '附件已被删除，请重新读取'); };
      return remember(changes.preview(ATTACHMENT_KIND, id, current, { validate, remove: true }), { id, remove: current, month });
    },
    confirm(month, body) {
      requireMonth(month);
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '请先预览，再明确确认');
      const p = pending.get(body.previewId);
      if (!p || p.month !== month) throw failure(409, '预览已失效，请重新预览');
      if (p.receipt) return structuredClone(p.receipt);
      if (p.remove) {
        const target = fileOf(p.remove);
        let original;
        try {
          p.receipt = changes.confirm(ATTACHMENT_KIND, p.id, body, { beforeCommit() {
            if (fs.existsSync(target)) original = fs.readFileSync(target);
            fs.rmSync(target, { force: true });
            if (fs.existsSync(target)) throw failure(500, '附件删除后文件仍存在');
          } });
        } catch (error) {
          // 数据库已回滚；若文件已删而提交失败，只恢复原文件，不覆盖其他文件。
          try {
            if (original !== undefined && !fs.existsSync(target)) fs.writeFileSync(target, original, { flag: 'wx', mode: 0o600 });
          } catch (restoreError) {
            throw failure(500, `附件删除失败且文件恢复失败，请核对后再操作：${error.message}；${restoreError.message}`);
          }
          throw error;
        }
        return structuredClone(p.receipt);
      }
      // 数据库事务内独占创建文件并核验哈希；任一步失败，回滚记录并清理本次文件。
      const target = fileOf({ month, file: p.file });
      let created = false;
      try {
        p.receipt = changes.confirm(ATTACHMENT_KIND, p.id, body, { beforeCommit(receipt) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          const fd = fs.openSync(target, 'wx', 0o600);
          created = true;
          try { fs.writeFileSync(fd, p.bytes); } finally { fs.closeSync(fd); }
          if (createHash('sha256').update(fs.readFileSync(target)).digest('hex') !== receipt.sha256) throw failure(500, '附件回读不一致');
        } });
      } catch (error) {
        try { if (created) fs.rmSync(target, { force: true }); }
        catch (cleanupError) { throw failure(500, `附件保存失败且文件清理失败，请核对后再操作：${error.message}；${cleanupError.message}`); }
        throw error;
      }
      p.bytes = null;
      return structuredClone(p.receipt);
    },
    file(month, id) {
      requireMonth(month);
      const a = getRecord(db, ATTACHMENT_KIND, id);
      if (!a || a.month !== month) throw failure(404, '附件不存在');
      let fd;
      try { fd = fs.openSync(fileOf(a), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); return { record: a, bytes: fs.readFileSync(fd) }; }
      catch { throw failure(404, '附件文件不可读'); } finally { if (fd !== undefined) fs.closeSync(fd); }
    },
  };
}
