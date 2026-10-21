import { randomUUID, createHash } from 'node:crypto';
import { failure } from './v3-common.mjs';

export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function getRecord(db, kind, id) {
  const row = db.prepare('SELECT payload FROM v3_documents WHERE kind=? AND id=?').get(kind, String(id));
  return row ? JSON.parse(row.payload) : null;
}
export function listRecords(db, kind) {
  return db.prepare('SELECT payload FROM v3_documents WHERE kind=? ORDER BY id').all(kind).map(row => JSON.parse(row.payload));
}
export function putRecord(db, kind, id, value, now = Date.now()) {
  db.prepare(`INSERT INTO v3_documents(kind,id,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
    .run(kind, String(id), JSON.stringify(value), new Date(now).toISOString());
  return getRecord(db, kind, id);
}

// 预览令牌绑定目标、旧值和实际写入内容；确认不接受替换内容。
export function createLocalChanges(db, { now = Date.now } = {}) {
  const pending = new Map();
  return {
    discard(previewId) { pending.delete(previewId); },
    preview(kind, id, value, { validate, remove = false } = {}) {
      const current = getRecord(db, kind, id);
      if (validate) validate(value, current);
      for (const [key, entry] of pending) if (entry.expires <= now()) pending.delete(key);
      if (pending.size >= 100) throw failure(429, '待确认预览过多，请稍后重新预览');
      const previewId = randomUUID(), expires = now() + 600_000;
      pending.set(previewId, { kind, id: String(id), value: structuredClone(value), before: fingerprint(current), validate, remove, expires });
      return { previewId, expiresAt: new Date(expires).toISOString(), before: current, value };
    },
    confirm(kind, id, body, { beforeCommit } = {}) {
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '请先预览，再明确确认');
      const p = pending.get(body.previewId);
      if (!p || p.kind !== kind || p.id !== String(id) || p.expires <= now()) throw failure(409, '预览已失效，请先读取当前记录再预览');
      if (p.receipt) return structuredClone(p.receipt);
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = getRecord(db, kind, id);
        if (fingerprint(current) !== p.before) throw failure(409, '记录已变化，请重新读取并预览');
        if (p.validate) p.validate(p.value, current);
        let receipt;
        if (p.remove) {
          db.prepare('DELETE FROM v3_documents WHERE kind=? AND id=?').run(kind, String(id));
          if (getRecord(db, kind, id) !== null) throw failure(500, '删除后回读不一致');
          receipt = { ok: true, id: String(id) };
        } else {
          receipt = putRecord(db, kind, id, p.value, now());
          if (fingerprint(receipt) !== fingerprint(p.value)) throw failure(500, '保存后回读不一致');
        }
        // 附件等同步文件操作须完成并回读后才能提交；失败沿用事务回滚，不缓存回执。
        if (beforeCommit) beforeCommit(receipt);
        db.exec('COMMIT'); p.receipt = structuredClone(receipt); return receipt;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
