import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, getAssistant } from '../server/db.mjs';
import { getRecord, putRecord, listRecords } from '../server/local-records.mjs';
import { createSelfTalkService } from '../server/selftalk.mjs';
import { assistantConversations, requireConversation, selectAssistantConversation } from '../server/assistant-conversations.mjs';
import { composeKnowledgeInstructions } from '../server/assistant-knowledge.mjs';
import { buildActions, buildDocs, latestPolicyAction } from '../src/modules/command/command-index.js';
import { applyOp, currentDirectory } from '../src/modules/kb/kb-canvas.js';

const instant = Date.parse('2026-10-22T04:00:00Z');
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'audit-integration-'));
  const db = openDb(dir); t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); }); return db;
}
async function selftalk(t) {
  const db = database(t), id = 'om_audit', service = createSelfTalkService(db, { now: () => instant, readMessages: async () => [{ id, text: '合成跟进事项', type: 'text', createdAt: new Date(instant).toISOString() }] });
  await service.list();
  const preview = (tag) => service.preview(id, { tag, ...(tag === 'need' && { month: '2026-11' }) });
  const confirm = p => service.confirm(id, { previewId: p.previewId, confirm: true });
  return { db, id, service, preview, confirm, act: tag => confirm(preview(tag)) };
}

test('多级知识库当前目录决定改名目标，父组和其他分组不被误改', () => {
  const tree = [{ id: 'root', name: '营销', kids: [{ id: 'child', name: '战役', kids: [{ id: 'leaf', name: '正文', file: true }] }] }, { id: 'other', name: '其他', kids: [] }];
  const { dir, trail } = currentDirectory(tree[0], ['child']);
  assert.equal(dir.id, 'child'); assert.deepEqual(trail.map(n => n.name), ['营销', '战役']);
  const result = applyOp(tree, { type: 'rename', id: dir.id, name: '新战役' });
  assert.equal(result[0].name, '营销'); assert.equal(result[0].kids[0].name, '新战役'); assert.deepEqual(result[1], tree[1]);
  assert.equal(currentDirectory(tree[0], ['other']).dir.id, 'root');
});

test('知识库父文档可搜索并打开自己的正文，不丢失子文档', () => {
  const rows = buildDocs({ tree: [{ id: 'parent', name: '总纲', kids: [{ id: 'child', name: '方案', file: true }] }], docs: { parent: { url: 'https://example.feishu.cn/wiki/parent', excerpt: '总纲正文' } } });
  assert.deepEqual(rows.map(row => row.title), ['总纲', '方案']);
  assert.equal(rows[0].externalUrl, 'https://example.feishu.cn/wiki/parent');
  assert.equal(rows[1].sub, '总纲');
});

test('复制旧索引的政策时重新取最新正文；已删除和读取失败都不回退到旧价格', async () => {
  const row = { month: '2026-11', line: '大学辅导', sku: '合成SKU', trial: '99', price: '100', newDeal: '无', renewal: '无' };
  const old = buildActions([row]).find(x => x.copy);
  assert.match((await latestPolicyAction(old, async () => [{ ...row, price: '200' }])).copy, /正价价格：200/);
  await assert.rejects(latestPolicyAction(old, async () => []), /已移除/);
  await assert.rejects(latestPolicyAction(old, async () => { throw new Error('断网'); }), /断网/);
});

test('自聊撤销原子撤回未使用的待办和需求，重复确认不重复删除', async t => {
  const { db, service, id, act, preview, confirm } = await selftalk(t);
  act('todo'); act('need');
  const p = preview(''); assert.deepEqual(p.value.reversal.map(x => x.action), ['remove', 'remove']);
  const receipt = confirm(p); assert.deepEqual(confirm(p), receipt);
  assert.equal(getRecord(db, 'selftalk-todo', id), null); assert.equal(getRecord(db, 'selftalk-need', id), null);
  assert.equal((await service.list()).items[0].tag, '');
});

test('自聊撤销保护后续编辑待办、已采纳需求并保留可见原因，不能重新转换覆盖', async t => {
  const { db, service, id, act, preview, confirm } = await selftalk(t);
  act('todo'); act('need');
  const todo = getRecord(db, 'selftalk-todo', id); putRecord(db, 'selftalk-todo', id, { ...todo, title: '已人工改写', due: '2026-11-02' });
  db.prepare('INSERT INTO v3_needs(id,month,source_fingerprint,payload,updated_at) VALUES(?,?,?,?,?)').run(`selftalk-${id}`, '2026-11', 'source', '{}', new Date(instant).toISOString());
  const needBefore = getRecord(db, 'selftalk-need', id), p = preview('');
  assert.deepEqual(p.value.reversal.map(x => x.action), ['keep', 'keep']); confirm(p);
  assert.equal(getRecord(db, 'selftalk-todo', id).title, '已人工改写'); assert.deepEqual(getRecord(db, 'selftalk-need', id), needBefore);
  const item = (await service.list()).items[0]; assert.equal(item.tag, ''); assert.equal(item.reversal.length, 2);
  assert.throws(() => preview('todo'), /不会覆盖/); assert.throws(() => preview('need'), /不会覆盖/);
});

test('撤销预览后需求被采纳，确认拒绝且保留全部记录', async t => {
  const { db, id, act, preview, confirm } = await selftalk(t); act('need');
  const p = preview('');
  db.prepare('INSERT INTO v3_needs(id,month,source_fingerprint,payload,updated_at) VALUES(?,?,?,?,?)').run(`selftalk-${id}`, '2026-11', 'source', '{}', new Date(instant).toISOString());
  assert.throws(() => confirm(p), /关联待办或需求已变化/); assert.ok(getRecord(db, 'selftalk-need', id)); assert.equal(getRecord(db, 'selftalk-tag', id), null);
});

test('撤销删除失败时标签和草稿一起回滚；旧版未编辑草稿也可正确撤回', async t => {
  const { db, id, act, preview, confirm } = await selftalk(t); act('todo');
  const old = getRecord(db, 'selftalk-todo', id); delete old.generatedFingerprint; putRecord(db, 'selftalk-todo', id, old);
  const p = preview(''); assert.equal(p.value.reversal[0].action, 'remove');
  db.exec("CREATE TRIGGER keep_todo BEFORE DELETE ON v3_documents WHEN OLD.kind='selftalk-todo' BEGIN SELECT RAISE(ABORT, '合成删除失败'); END");
  assert.throws(() => confirm(p), /删除失败/); assert.equal(getRecord(db, 'selftalk-tag', id), null); assert.deepEqual(getRecord(db, 'selftalk-todo', id), old);
  db.exec('DROP TRIGGER keep_todo'); confirm(p); assert.equal(getRecord(db, 'selftalk-todo', id), null);
});

test('助手新会话只清本地当前关联、保留历史，可切回；并发旧请求拒绝', t => {
  const db = database(t); db.prepare('UPDATE assistants SET codex_thread_id=? WHERE id=1').run('old-thread');
  const fresh = selectAssistantConversation(db, 1, { expectedThreadId: 'old-thread' }, { fresh: true, now: () => instant });
  assert.equal(fresh.currentThreadId, null); assert.equal(fresh.items[0].threadId, 'old-thread'); assert.equal(getAssistant(db, 1).preset, 'copywriter');
  assert.throws(() => selectAssistantConversation(db, 1, { expectedThreadId: 'old-thread' }, { fresh: true }), error => error.status === 409);
  assert.equal(requireConversation(db, 1, 'old-thread'), 'old-thread'); assert.throws(() => requireConversation(db, 2, 'old-thread'), error => error.status === 404);
  db.prepare('UPDATE assistants SET codex_thread_id=? WHERE id=1').run('new-thread');
  const back = selectAssistantConversation(db, 1, { expectedThreadId: 'new-thread', threadId: 'old-thread' });
  assert.equal(back.currentThreadId, 'old-thread'); assert.equal(back.items.length, 2); assert.equal(listRecords(db, 'assistant-conversation:1').length, 2);
  assert.throws(() => selectAssistantConversation(db, 1, { expectedThreadId: 'old-thread', threadId: 'other-assistant-thread' }), error => error.status === 404);
  assert.equal(assistantConversations(db, 1).currentThreadId, 'old-thread');
});

test('新会话的指令取最新知识；切换不改说明和知识正文', t => {
  const db = database(t); const original = getAssistant(db, 1).instructions;
  db.prepare('UPDATE assistants SET codex_thread_id=? WHERE id=1').run('old-thread');
  putRecord(db, 'assistant-knowledge:1', 'knowledge', { id: 'knowledge', title: '新政策', kind: '文字', body: '更新后的政策', chars: 7, createdAt: new Date(instant).toISOString() });
  selectAssistantConversation(db, 1, { expectedThreadId: 'old-thread' }, { fresh: true });
  assert.match(composeKnowledgeInstructions(db, 1, original), /更新后的政策/); assert.equal(getAssistant(db, 1).instructions, original);
});
