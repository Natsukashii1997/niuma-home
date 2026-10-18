import { randomUUID } from 'node:crypto';
import { createLocalChanges, fingerprint, getRecord } from './local-records.mjs';
import { failure } from './v3-common.mjs';

const STORAGE = 'local-deletion';
const key = (kind, id) => `${kind}:${id}`;
export const deletionFailure = (status, code, message) => Object.assign(failure(status, message), { code });
export const deletionState = (db, kind, id) => getRecord(db, STORAGE, key(kind, id));
export const deletionRevision = (db, kind, id) => deletionState(db, kind, id)?.revision || null;
export const externalOrigin = record => ['origin', 'sourceType', 'sourceKind', 'source'].some(k => record?.[k] !== undefined && record[k] !== 'local');
const stale = () => deletionFailure(409, 'LOCAL_DELETE_PREVIEW_STALE', '对象、内容或删除状态已变化，或预览已到期，请重新预览');

export function assertLocalLifecycle(db, kind, id, revision = deletionRevision(db, kind, id)) {
  if (deletionState(db, kind, id)?.deleted) throw deletionFailure(409, 'LOCAL_OBJECT_DELETED', '对象已删除，请先从已删除列表恢复');
  if (deletionRevision(db, kind, id) !== revision) throw stale();
}

// 原对象留在原存储中；恢复也保留生命周期版本，防止旧编辑令牌在内容复原后复活。
export function createLocalDeletions(db, { kind, load, restoreConflict, now = Date.now }) {
  const changes = createLocalChanges(db, { now }), previews = new Map();
  return {
    preview(id, action, body = {}) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw deletionFailure(400, 'LOCAL_DELETE_INPUT_INVALID', '删除或恢复预览不接受额外字段');
      const target = load(id), state = deletionState(db, kind, id), snapshot = fingerprint(target.snapshot);
      if (action === 'remove' && state?.deleted) throw deletionFailure(409, 'LOCAL_OBJECT_DELETED', '对象已经删除');
      if (action === 'restore' && !state?.deleted) throw deletionFailure(409, 'LOCAL_OBJECT_NOT_DELETED', '对象尚未删除');
      if (action === 'restore') {
        if (snapshot !== state.snapshotFingerprint) throw deletionFailure(409, 'LOCAL_RESTORE_CONFLICT', '删除期间原对象内容已变化，不能覆盖恢复');
        restoreConflict?.(id, target);
      }
      const at = new Date(now()).toISOString();
      const next = { id, kind, deleted: action === 'remove', revision: randomUUID(), at, snapshotFingerprint: snapshot,
        deletedAt: action === 'remove' ? at : state.deletedAt, ...(action === 'restore' && { restoredAt: at }) };
      const preview = changes.preview(STORAGE, key(kind, id), next, { validate: () => {
        const current = load(id);
        if (fingerprint(current.snapshot) !== snapshot) throw stale();
        if (action === 'restore') restoreConflict?.(id, current);
      } });
      for (const [token, p] of previews) if (p.expires <= now()) previews.delete(token);
      previews.set(preview.previewId, { id, action, expires: Date.parse(preview.expiresAt), revision: next.revision });
      return { ...preview, id, kind, action, value: target.value };
    },
    confirm(id, action, body) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['previewId', 'confirm'].includes(k)) || body.confirm !== true || typeof body.previewId !== 'string') throw deletionFailure(400, 'LOCAL_DELETE_INPUT_INVALID', '请先预览，再以 previewId 和 confirm:true 确认');
      const p = previews.get(body.previewId);
      if (!p || p.id !== id || p.action !== action || p.expires <= now()) throw stale();
      load(id); // 重放成功回执也不能越过来源与当前对象保护。
      if (p.receipt && deletionRevision(db, kind, id) !== p.revision) throw stale();
      let saved;
      try { saved = changes.confirm(STORAGE, key(kind, id), body); }
      catch (error) { if (error.status === 409 && !error.code) throw stale(); throw error; }
      if (fingerprint(deletionState(db, kind, id)) !== fingerprint(saved)) throw deletionFailure(500, 'LOCAL_DELETE_READBACK_FAILED', '删除状态回读不一致');
      p.receipt = { ok: true, id, kind, action, deleted: saved.deleted, revision: saved.revision, at: saved.at };
      return structuredClone(p.receipt);
    },
  };
}
