import { apiRead, apiSend } from '../api.js';

const PREFIX = 'workdesk.legacy-write.v1:';
const active = new Set();
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => [key, canonical(value[key])])) : value;
const signature = value => JSON.stringify(canonical(value));
const fail = (code, message) => Object.assign(new Error(message), { code });
const storage = () => globalThis.localStorage;

// 保存前持久化操作编号和原草稿。刷新、关闭弹窗和断网都不能换编号重发。
export function pendingLegacy(scope) {
  try {
    const text = storage().getItem(PREFIX + scope);
    if (!text) return null;
    const value = JSON.parse(text);
    if (value.scope !== scope || !value.requestId || !value.method || !value.path) throw Error('invalid');
    return value;
  } catch { throw fail('WRITE_STORAGE_FAILED', '无法读取本机保存记录，已停止写入；请恢复浏览器本地存储后重新读取'); }
}
export function pendingLegacyIn(prefix) {
  try {
    return Object.keys(storage()).filter(key => key.startsWith(PREFIX + prefix)).map(key => pendingLegacy(key.slice(PREFIX.length)));
  } catch { throw fail('WRITE_STORAGE_FAILED', '无法读取本机保存记录，已停止写入'); }
}
// 组件初始化用，存储异常也保留为阻断提示，不导致整个页面崩溃。
export function legacyState(scope) {
  try { return { pending: pendingLegacy(scope), error: '' }; }
  catch (error) { return { pending: null, error: error.message }; }
}
export function legacyHeaders(op) {
  return { 'X-Workdesk-Request-Id': op.requestId, ...(op.baseVersion ? { 'X-Workdesk-Base-Version': op.baseVersion } : {}) };
}
function prepare(scope, request) {
  const old = pendingLegacy(scope);
  const value = { method: request.method, path: request.path, body: request.body, baseVersion: request.baseVersion, context: request.context };
  if (old) {
    if (old.conflict) throw Object.assign(new Error(old.conflict.message), { code: old.conflict.code, status: 409 });
    const original = { method: old.method, path: old.path, body: old.body, baseVersion: old.baseVersion, context: old.context };
    if (signature(original) !== signature(value)) throw fail('WRITE_PENDING_CHANGED', '上次保存尚未核对，原草稿已保留；请先重新读取，不能改内容后重新提交');
    return old;
  }
  const op = { ...value, scope, requestId: globalThis.crypto.randomUUID(), createdAt: new Date().toISOString() };
  try {
    storage().setItem(PREFIX + scope, JSON.stringify(op));
    if (pendingLegacy(scope)?.requestId !== op.requestId) throw Error('storage verification failed');
  } catch { throw fail('WRITE_STORAGE_FAILED', '无法保留本次操作编号，尚未发送；请恢复浏览器本地存储后再保存'); }
  return op;
}
async function reconcile(op, verify) {
  if (op.conflict) throw Object.assign(new Error(op.conflict.message), { code: op.conflict.code, status: 409 });
  let receipt;
  try { receipt = await apiRead(`/api/legacy-writes/${encodeURIComponent(op.requestId)}`); }
  catch (error) {
    if (error.status === 404) throw fail('WRITE_RECEIPT_UNKNOWN', '尚未找到完成回执，原操作与草稿已保留；不会自动重复提交');
    throw error;
  }
  if (receipt.id !== op.requestId || receipt.scope !== `${op.method} ${decodeURIComponent(op.path.split('?')[0])}` || !('result' in receipt)) throw fail('WRITE_RECEIPT_MISMATCH', '保存回执不匹配，已停止并保留原操作');
  if (!(await verify(receipt.result, op))) throw fail('WRITE_READBACK_MISMATCH', '保存结果与当前内容不一致，原草稿已保留，请先核对');
  try {
    if (pendingLegacy(op.scope)?.requestId !== op.requestId) throw Error('operation changed');
    storage().removeItem(PREFIX + op.scope);
    if (pendingLegacy(op.scope)) throw Error('operation not cleared');
  } catch { throw fail('WRITE_STORAGE_FAILED', '内容已回读，但本机操作记录未能清除；请重新读取，勿重复创建'); }
  return receipt.result;
}
export async function recoverLegacy(scope, verify) {
  const op = pendingLegacy(scope);
  if (!op) return null;
  if (active.has(scope)) throw fail('WRITE_BUSY', '正在保存并核对，请稍候');
  active.add(scope);
  try { return await reconcile(op, verify); }
  finally { active.delete(scope); }
}
export async function legacyWrite(scope, request, verify, send) {
  if (active.has(scope)) throw fail('WRITE_BUSY', '正在保存并核对，请稍候');
  active.add(scope);
  let op, writeAccepted = false;
  try {
    op = prepare(scope, request);
    await (send ? send(legacyHeaders(op)) : apiSend(op.method, op.path, op.body, { headers: legacyHeaders(op) }));
    writeAccepted = true;
    return await reconcile(op, verify);
  } catch (error) {
    // 已明确的版本冲突跨刷新仍须停止，不能在回执404后又当成普通未知结果重试。
    if (op && ["WRITE_CONFLICT", "WRITE_ID_REUSED"].includes(error.code)) {
      try { if (pendingLegacy(scope)?.requestId === op.requestId) storage().setItem(PREFIX + scope, JSON.stringify({ ...op, conflict: { code: error.code, message: error.message } })); } catch { /* 原编号和草稿仍保留，不能换编号。 */ }
    }
    // 校验明确拒绝且无写入时可修正表单；冲突/未知结果保留编号与原草稿，不能换基线重试。
    if (op && !writeAccepted && [400, 413, 415, 422].includes(error.status)) {
      try { if (pendingLegacy(scope)?.requestId === op.requestId) storage().removeItem(PREFIX + scope); } catch { /* 保留记录更安全 */ }
    }
    throw error;
  } finally { active.delete(scope); }
}
// 仅供用户点击“重试原操作”；使用已持久化的原请求，不能自动触发或换基线。
export async function retryLegacy(scope, verify, send) {
  const op = pendingLegacy(scope);
  if (!op) throw fail('WRITE_OPERATION_MISSING', '未找到原操作，请重新读取后核对');
  return legacyWrite(scope, op, verify, send);
}
export async function legacyImageRequest(materialId, file, contentType, baseVersion) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  return { method: 'POST', path: `/api/materials/${materialId}/images?name=${encodeURIComponent(file.name)}`,
    body: { name: file.name, size: file.size, contentType, sha256 }, baseVersion };
}
