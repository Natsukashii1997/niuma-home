import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { listRecords } from '../server/local-records.mjs';
import { attachmentDir, ATTACHMENT_KIND, createBriefAttachments } from '../server/brief-attachments.mjs';
import { briefMarkdown, generatedBrief } from '../server/briefs.mjs';

const instant = Date.parse('2026-10-17T10:00:00+08:00');
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '附件测试必须显式使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'batch3-'));
  const db = openDb(dir); t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); }); return db;
}
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
const url = (bytes, mime = 'image/png') => `data:${mime};base64,${bytes.toString('base64')}`;

test('附件先预览后确认：预览不写文件，确认后文件与记录一致；同一文件不重复传', t => {
  const db = database(t), files = createBriefAttachments(db, { now: () => instant });
  assert.throws(() => files.preview('2026-11', { name: 'a.exe', dataUrl: url(PNG) }), e => e.status === 415);
  assert.throws(() => files.preview('2026-11', { name: 'a.pdf', dataUrl: url(PNG) }), e => e.status === 415, '内容与扩展名不一致');
  assert.throws(() => files.preview('2026-11', { name: 'a.png', dataUrl: 'not-data' }), e => e.status === 400);
  assert.throws(() => files.preview('2026-11', { name: 'a.png', dataUrl: url(PNG), extra: 1 }), e => e.status === 400);
  assert.throws(() => files.preview('2026-11', { name: 'a.txt', dataUrl: url(Buffer.from([0, 1, 2]), 'text/plain') }), e => e.status === 415);
  const p = files.preview('2026-11', { name: '../价格图/终稿.png', dataUrl: url(PNG) });
  assert.equal(p.value.name, '.._价格图_终稿.png', '文件名里的路径分隔符被替换');
  assert.equal(listRecords(db, ATTACHMENT_KIND).length, 0); assert.equal(existsSync(attachmentDir(db)), false, '预览不写文件');
  assert.throws(() => files.confirm('2026-12', { previewId: p.previewId, confirm: true }), e => e.status === 409, '月份不符');
  const saved = files.confirm('2026-11', { previewId: p.previewId, confirm: true });
  assert.deepEqual(files.confirm('2026-11', { previewId: p.previewId, confirm: true }), saved, '重复确认幂等');
  assert.deepEqual(files.list('2026-11').items, [saved]);
  assert.deepEqual(files.list('2026-12').items, []);
  const got = files.file('2026-11', saved.id);
  assert.ok(got.bytes.equals(PNG)); assert.equal(got.record.type, 'image/png');
  assert.throws(() => files.file('2026-12', saved.id), e => e.status === 404);
  assert.throws(() => files.preview('2026-11', { name: '另一个名字.png', dataUrl: url(PNG) }), e => e.status === 400 && /上传过/.test(e.message));
  // 并发的两个相同文件预览：后确认的被拒，也不留下文件
  const docx = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.from('word')]);
  const a = files.preview('2026-11', { name: '规格.docx', dataUrl: url(docx, '') }), b = files.preview('2026-11', { name: '规格2.docx', dataUrl: url(docx, '') });
  files.confirm('2026-11', { previewId: a.previewId, confirm: true });
  assert.throws(() => files.confirm('2026-11', { previewId: b.previewId, confirm: true }), e => e.status === 400);
  assert.equal(readdirSync(path.join(attachmentDir(db), '2026-11')).length, 2);
});

test('删除附件先预览；确认后记录和文件都不在；导出只写文件名清单', t => {
  const db = database(t), files = createBriefAttachments(db, { now: () => instant });
  const saved = files.confirm('2026-11', { previewId: files.preview('2026-11', { name: '参考.png', dataUrl: url(PNG) }).previewId, confirm: true });
  const md = briefMarkdown(generatedBrief(db, '2026-11'), files.list('2026-11').items);
  assert.match(md, /## 7\. 附件\n\n- 参考\.png（1 KB）\n$/);
  assert.match(briefMarkdown(generatedBrief(db, '2026-11')), /## 7\. 附件\n\n\n$/, '没有附件时这一节为空，与原来一致');
  assert.throws(() => files.removePreview('2026-11', 'missing'), e => e.status === 404);
  const r = files.removePreview('2026-11', saved.id);
  assert.equal(files.list('2026-11').items.length, 1, '删除预览不写入');
  assert.deepEqual(files.confirm('2026-11', { previewId: r.previewId, confirm: true }), { ok: true, id: saved.id });
  assert.deepEqual(files.list('2026-11').items, []);
  assert.equal(readdirSync(path.join(attachmentDir(db), '2026-11')).length, 0);
  assert.throws(() => files.removePreview('2026-11', saved.id), e => e.status === 404);
});
