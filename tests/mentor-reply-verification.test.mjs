import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { createMentorService, datedHeadings, mentorView } from '../server/mentor.mjs';

const source = { name: '核查样例', year: 2026, url: 'https://example.feishu.cn/docx/example' };
const instant = Date.parse('2026-10-22T10:00:00+08:00');
const xml = '<h1 id="heading01">10.22 日志</h1><p id="question01">如何处理？</p>';
const comment = (anchor = 'question01', id = 'reply01') => ({ comment_id: id, extra: { content_anchor_id: anchor }, reply_list: { replies: [{ content: { elements: [{ text_run: { text: '先确认目标' } }] } }] } });
async function fixture(t, { add = 'timeout', batch = [], pages = [] } = {}) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'mentor-proof-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  const calls = [];
  const service = createMentorService(db, { now: () => instant,
    readLogs: async s => mentorView(s, datedHeadings(xml, 2026), xml, instant),
    lark: async args => {
      calls.push(args);
      if (args[1] === '+add-comment') { if (add === 'timeout') throw new Error('timeout'); return { comment_id: 'reply01' }; }
      if (args[1] === '+batch-query-comments') return { items: batch };
      if (args[1] === '+list-comments') return pages.shift();
      throw new Error('unexpected call');
    }, generate: async () => { throw new Error('no model calls'); },
  });
  await service.list();
  const preview = () => service.previewReply(source.name, 'question01', { text: '先确认目标', as: 'bot' });
  const send = pv => service.confirmReply(source.name, 'question01', { previewId: pv.previewId, confirm: true });
  const reconcile = () => service.reconcileReply(source.name, 'question01');
  const unknown = () => assert.throws(preview, e => e.code === 'REPLY_UNKNOWN');
  return { db, calls, preview, send, reconcile, unknown };
}

test('按评论 ID 回读仍须核对原文段落，错误锚点不能标为已发送或解除锁定', async t => {
  const f = await fixture(t, { add: 'ok', batch: [comment('otherBlock')], pages: [{ items: [comment('otherBlock')], has_more: false }] });
  await assert.rejects(f.send(f.preview()), e => e.code === 'REPLY_UNKNOWN');
  f.unknown();
  await assert.rejects(f.reconcile(), /原文位置/);
  f.unknown();
  assert.equal(f.calls.filter(c => c[1] === '+add-comment').length, 1);
});

test('同文档其他段落的相同文字不算这条回复；完整查完后才能确认未找到', async t => {
  const f = await fixture(t, { pages: [{ items: [comment('otherBlock')], has_more: false }] });
  await assert.rejects(f.send(f.preview()), e => e.code === 'REPLY_UNKNOWN');
  assert.deepEqual(await f.reconcile(), { state: 'none', checked: true });
});

test('缺锚点、缺分页结束标记、缺后续游标均保留结果不明，禁止重发', async t => {
  for (const page of [
    { items: [comment(undefined)], has_more: false },
    { items: [] }, { items: [], has_more: true }, { has_more: false },
  ]) {
    if (page.items?.[0]) delete page.items[0].extra.content_anchor_id;
    const f = await fixture(t, { pages: [page] });
    await assert.rejects(f.send(f.preview()), e => e.code === 'REPLY_UNKNOWN');
    await assert.rejects(f.reconcile(), /不完整|原文位置/);
    f.unknown();
  }
});

test('只读核对翻过其他段落，到正确段落才标发送成功', async t => {
  const f = await fixture(t, { pages: [
    { items: [comment('otherBlock','other01')], has_more: true, page_token: 'next' },
    { items: [comment()], has_more: false },
  ] });
  await assert.rejects(f.send(f.preview()), e => e.code === 'REPLY_UNKNOWN');
  assert.equal((await f.reconcile()).state, 'sent');
  assert.equal(f.calls.filter(c => c[1] === '+add-comment').length, 1);
});

test('回复预览后来源变更时不能向新来源发送旧回复', async t => {
  const f = await fixture(t);
  const pv = f.preview();
  saveSetting(f.db, 'mentor_sources', JSON.stringify([{ ...source, url: 'https://example.feishu.cn/docx/changed' }]));
  await assert.rejects(f.send(pv), /来源或提问已变化/);
  assert.equal(f.calls.length, 0);
});
