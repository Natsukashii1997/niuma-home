import { getAssistant } from './db.mjs';
import { listRecords, putRecord } from './local-records.mjs';
import { failure } from './v3-common.mjs';

const kindOf = id => `assistant-conversation:${id}`;
export function assistantConversations(db, id) {
  const assistant = getAssistant(db, id);
  if (!assistant) throw failure(404, '助手不存在');
  const saved = listRecords(db, kindOf(id));
  if (assistant.codexThreadId && !saved.some(row => row.threadId === assistant.codexThreadId)) {
    saved.push({ threadId: assistant.codexThreadId, name: assistant.name, savedAt: assistant.createdAt });
  }
  return { currentThreadId: assistant.codexThreadId, items: saved.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).map(row => ({ ...row, current: row.threadId === assistant.codexThreadId })) };
}
export function requireConversation(db, id, threadId) {
  if (typeof threadId !== 'string' || !assistantConversations(db, id).items.some(row => row.threadId === threadId)) throw failure(404, '这个会话不属于当前助手');
  return threadId;
}

// 只切换本地关联，不启动模型、不删除会话；下一次发送才按最新知识延迟创建新会话。
export function selectAssistantConversation(db, id, body, { fresh = false, now = Date.now } = {}) {
  if (!body || !Object.hasOwn(body, 'expectedThreadId') || !(body.expectedThreadId === null || typeof body.expectedThreadId === 'string')) throw failure(400, '请先读取当前会话，再选择');
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = getAssistant(db, id);
    if (!current) throw failure(404, '助手不存在');
    if (current.codexThreadId !== body.expectedThreadId) throw failure(409, '当前会话已变化，请重新读取');
    const next = fresh ? null : requireConversation(db, id, body.threadId);
    if (current.codexThreadId) {
      const prior = listRecords(db, kindOf(id)).find(row => row.threadId === current.codexThreadId);
      putRecord(db, kindOf(id), current.codexThreadId, { threadId: current.codexThreadId, name: prior?.name || current.name, savedAt: prior?.savedAt || new Date(now()).toISOString() }, now());
    }
    db.prepare('UPDATE assistants SET codex_thread_id=? WHERE id=?').run(next, id);
    const result = assistantConversations(db, id);
    if (result.currentThreadId !== next) throw failure(500, '会话切换后回读不一致');
    db.exec('COMMIT'); return result;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
