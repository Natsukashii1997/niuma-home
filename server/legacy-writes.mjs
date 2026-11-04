import { createHash } from 'node:crypto';
import { getRecord, putRecord } from './local-records.mjs';
import { getPlan, listPromos } from './db.mjs';

const KIND = 'legacy-write-receipt';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => [k, canonical(value[k])])) : value;
export const writeVersion = value => createHash('sha256').update(JSON.stringify(canonical(value ?? null))).digest('hex');
export const writeError = (status, code, message) => Object.assign(new Error(message), { status, code });
// chatgptUrl 只在绑了链接时参与，没绑的助手版本号与改前一致。
export const assistantVersion = a => writeVersion(a && { name: a.name, instructions: a.instructions, model: a.model, effort: a.effort, ...(a.chatgptUrl && { chatgptUrl: a.chatgptUrl }) });
export const materialVersion = m => writeVersion(m && { month: m.month, line: m.line, name: m.name, type: m.type, skus: m.skus, note: m.note, images: m.images });
export const withAssistantVersion = a => a && { ...a, writeVersion: assistantVersion(a) };
export const withMaterialVersion = m => m && { ...m, writeVersion: materialVersion(m) };
export const planVersion = (db, month, line) => writeVersion({ plan: getPlan(db, month, line) ?? null, rows: listPromos(db).filter(p => p.month === month && p.line === line) });
export const legacyReceipt = (db, id) => getRecord(db, KIND, id);

function identity(req, scope, payload) {
  const id = req.headers['x-workdesk-request-id'];
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(id)) throw writeError(428, 'WRITE_ID_REQUIRED', '保存保护已更新，请刷新页面后再操作；已有内容未改动');
  const base = req.headers['x-workdesk-base-version'];
  return { id, base, fingerprint: writeVersion({ scope, payload, base: base ?? null }) };
}

// Replay is checked before object existence/model discovery: a successful delete or import
// must remain readable after the object disappeared or the source became unavailable.
export function legacyReplay(db, req, scope, payload) {
  const key = identity(req, scope, payload), old = getRecord(db, KIND, key.id);
  if (old && old.fingerprint !== key.fingerprint) throw writeError(409, 'WRITE_ID_REUSED', '这次操作编号对应的内容已变化，请保留草稿并重新核对');
  return old;
}

export function legacyWrite(db, req, { scope, payload, version, mutate, rollback, finally: finish }) {
  const key = identity(req, scope, payload);
  db.exec('BEGIN IMMEDIATE');
  let attempted = false;
  try {
    const old = legacyReplay(db, req, scope, payload);
    if (old) { db.exec('COMMIT'); return old.result; }
    if (version) {
      if (typeof key.base !== 'string' || !/^[a-f0-9]{64}$/.test(key.base)) throw writeError(428, 'WRITE_BASE_REQUIRED', '缺少原内容版本，请重新读取后核对；已有内容未改动');
      if (key.base !== version()) throw writeError(409, 'WRITE_CONFLICT', '内容已被其他操作修改，已停止保存；请保留当前草稿并核对最新内容');
    }
    attempted = true;
    const result = mutate();
    if (result && typeof result.then === 'function') throw Error('legacy writes must be synchronous');
    putRecord(db, KIND, key.id, { id: key.id, scope, fingerprint: key.fingerprint, result, completedAt: new Date().toISOString() });
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* SQLite may already have rolled back. */ }
    if (attempted && rollback) rollback();
    throw error;
  } finally { if (finish) finish(); }
}
