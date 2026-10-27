import { canonicalXml } from './feishu-xml.mjs';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getSettings } from './db.mjs';
import { V3_DEFAULTS } from './v3-settings.mjs';
import { fingerprint, getRecord, listRecords, putRecord } from './local-records.mjs';
import { failure, requireMonth } from './v3-common.mjs';
import { LARK_APP_ID, LARK_PROFILE } from './lark-identity.mjs';

const APP_ID = LARK_APP_ID;
const PREVIEWS = 'feishu-export-preview', RECEIPTS = 'feishu-export';
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const error = (status, code, message, receipt) => Object.assign(failure(status, message), { code, ...(receipt && { receipt }) });
const xmlText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// A heading's accidental trailing Enter used to become an empty paragraph in Feishu.
// Reuse the prior result for this formatting-only correction; all other fields stay exact.
const briefHeadingIdentity = document => fingerprint({ ...document, xml: document.xml.replace(/(<h2>)([\s\S]*?)(<\/h2>)/g, (_, open, body, close) => open + body.replace(/(?:\s|<br\s*\/?>)+$/g, '') + close) });
// Source text is literal: it must never become a CLI image, file, XML or mention directive.
export const literalMarkdown = text => xmlText(String(text).replace(/\r/g, '')).replace(/[\\`*_\[\]{}()!#$~|]/g, '\\$&').replace(/^(\s*)([-+]|\d+[.])(?=\s)/gm, '$1\\$2');
export const markdownTable = (heads, rows) => [heads, heads.map(() => '---'), ...rows].map(row => `| ${row.map(v => literalMarkdown(v).replace(/\n/g, '<br>')).join(' | ')} |`).join('\n');

function exportSourceConfig(db) {
  const settings = { ...V3_DEFAULTS, ...getSettings(db) };
  if (settings.lark_profile !== LARK_PROFILE || settings.lark_app_id !== APP_ID) throw error(503, 'EXPORT_IDENTITY_INVALID', '导出仅允许猛鬼兽的用户身份');
  return Object.fromEntries(['timeline_source', 'project_base_url', 'price_sku_table_id', 'price_floor_margin', 'price_cost_per_hour', 'lark_profile', 'lark_app_id'].map(k => [k, settings[k]]));
}
export const exportSourceIdentity = db => fingerprint(exportSourceConfig(db));

function trustedUrl(raw) {
  let url; try { url = new URL(raw); } catch { throw error(400, 'EXPORT_TARGET_INVALID', '请提供准确的 HTTPS 飞书文件夹链接'); }
  if (typeof raw !== 'string' || /[\s\\\x00-\x1f]/.test(raw) || url.protocol !== 'https:' || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname) || url.username || url.password || url.port || url.search || url.hash) throw error(400, 'EXPORT_TARGET_INVALID', '请提供不含账号、端口或附加参数的 HTTPS 飞书文件夹链接');
  return url;
}
function folderUrl(raw) {
  const url = trustedUrl(raw), match = url.pathname.match(/^\/(?:drive\/)?folder\/([a-zA-Z0-9]+)\/?$/);
  if (!match) throw error(400, 'EXPORT_TARGET_INVALID', '只能在指定文件夹创建新文档；请提供文件夹链接');
  return { url: `${url.origin}${url.pathname.replace(/\/$/, '')}`, token: match[1] };
}
function documentLink(document, allowWiki = false) {
  if (!/^[a-zA-Z0-9_]+$/.test(document?.document_id || '')) throw new Error('Missing document id');
  const url = trustedUrl(document.url);
  if (url.pathname !== `/docx/${document.document_id}` && !(allowWiki && /^\/wiki\/[a-zA-Z0-9]+$/.test(url.pathname))) throw new Error('Invalid document URL');
  return { id: document.document_id, url: url.href };
}
export function runFeishuCommand(command, args, { input, ...options }) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, options, (err, stdout, stderr) => err ? reject(Object.assign(err, { stdout, stderr })) : resolve({ stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
}

const diagnosticTypes = new Set(['validation', 'api', 'auth', 'network', 'timeout', 'permission', 'internal', 'io', 'protocol', 'unknown']);
const diagnosticSubtypes = new Set(['invalid_argument', 'unknown', 'unauthorized', 'forbidden', 'not_found', 'permission_denied', 'scope_missing', 'authentication_required', 'rate_limited', 'network_error', 'request_timeout', 'server_error', 'unexpected_response']);
const diagnosticNumber = value => (typeof value === 'number' || typeof value === 'string' && /^\d{1,10}$/.test(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
const parseCliJson = value => { try { return typeof value === 'string' && value.trim() ? JSON.parse(value) : null; } catch { return null; } };
const cliResultFailed = value => ['failed', 'partial_success'].includes(value?.data?.result);
const invalidBlockRangeWarning = 'degrade_code=1002,msg=Invalid block range: start_block_id and end_block_id must be sibling blocks under the same parent. Choose a forward range of direct sibling blocks within one container';
// Keep only diagnostic metadata: CLI errors may embed document text, command
// arguments, credentials or troubleshooting URLs in their message and stderr.
function cliDiagnostic(result, processError, phase) {
  const detail = plain(result?.error) ? result.error : null;
  const exitCode = diagnosticNumber(processError?.code);
  const diagnostic = { phase, outcome: 'unknown', ...(exitCode !== undefined && { exitCode }) };
  if (cliResultFailed(result)) {
    diagnostic.phase = 'api'; diagnostic.errorType = 'document_result'; diagnostic.result = result.data.result;
    const warnings = result.data.warnings;
    const codes = Array.isArray(warnings) ? warnings.map(w => typeof w === 'string' ? w.match(/^degrade_code=(\d{1,10}),/)?.[1] : undefined).filter(Boolean) : [];
    if (codes.length === 1) diagnostic.degradeCode = Number(codes[0]);
    if (result.ok === false && result.data.result === 'failed' && !result.truncated && !result.data.truncated && !processError?.killed && !processError?.signal && Array.isArray(warnings) && warnings.length === 1 && warnings[0] === invalidBlockRangeWarning) {
      diagnostic.reason = 'invalid_block_range'; diagnostic.outcome = 'rejected';
    }
    return diagnostic;
  }
  if (!detail) return diagnostic;
  const errorType = diagnosticTypes.has(detail.type) ? detail.type : undefined, errorSubtype = diagnosticSubtypes.has(detail.subtype) ? detail.subtype : undefined, apiCode = diagnosticNumber(detail.code);
  if (errorType) diagnostic.errorType = errorType;
  if (errorSubtype) diagnostic.errorSubtype = errorSubtype;
  if (apiCode !== undefined) diagnostic.apiCode = apiCode;
  const httpStatus = diagnosticNumber(detail.http_status ?? detail.http_status_code ?? detail.status_code);
  if (httpStatus >= 100 && httpStatus <= 599) diagnostic.httpStatus = httpStatus;
  const requestId = detail.log_id ?? detail.request_id;
  if (typeof requestId === 'string' && /^20\d{12}[a-fA-F0-9]{8,50}$/.test(requestId)) diagnostic.requestId = requestId;
  if (processError?.killed || processError?.signal || result?.truncated || result?.data?.truncated) return diagnostic;
  // The CLI emits this local argument validation envelope on stderr with exit 2.
  // Validation without a known CLI parameter is not enough to prove no request.
  if (result?.ok === false && exitCode === 2 && errorType === 'validation' && errorSubtype === 'invalid_argument' && /^--(?:block-id|start-block-id|end-block-id|command|content|doc-format|revision-id|doc|reference-map|src-block-ids)$/.test(detail.param || '')) {
    diagnostic.phase = 'cli_validation'; diagnostic.outcome = 'not_sent';
  } else if (result?.ok === false && errorType === 'api') {
    diagnostic.phase = 'api';
    // This is an API rejection fact, never permission to replay a whole CLI
    // workflow: earlier steps may already have written. Other codes stay unknown.
    if (apiCode === 3380002) diagnostic.outcome = 'rejected';
  }
  return diagnostic;
}
function cliFailure(diagnostic, message = '飞书操作未取得可验证的完整结果') {
  return Object.assign(error(502, 'EXPORT_CLI_FAILED', message), { diagnostic });
}

// Compare the whole document in order, allowing only Markdown presentation differences.
export function canonicalMarkdown(text) {
  return String(text).replace(/\r/g, '').split('\n')
    .filter(line => !/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
    .map(line => line.replace(/^\s*#{1,6}\s+/, '').replace(/^\s*(?:[-+*]|\d+[.)])\s+/, ''))
    .join('\n').replace(/<br\s*\/?>/gi, '\n').replace(/(?<!\\)\|/g, ' ')
    .replace(/(?<!\\)\*\*/g, '').replace(/\\([\\`*_\[\]{}()!#$~|.+-])/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

export function validateExportDocument(document){
  const format=doc=>doc.format||'markdown';
    if (!plain(document) || typeof document.title !== 'string' || !document.title.trim() || document.title.length > 500 || /[\r\n\x00-\x1f]/.test(document.title) || typeof document.markdown !== 'string' || document.markdown.length > 1_000_000) throw error(400, 'EXPORT_CONTENT_INVALID', '导出内容或标题格式无效');
    if(!['markdown','xml'].includes(format(document)) || (format(document)==='xml' && (typeof document.xml!=='string'||document.xml.length>1_000_000)))throw error(400,'EXPORT_CONTENT_INVALID','文档结构格式无效');
    if(format(document)==='xml') { try{canonicalXml(document.xml);}catch{throw error(400,'EXPORT_CONTENT_INVALID','文档结构无法校验');} }
}

export function createFeishuClient(run = runFeishuCommand) {
  async function invoke(args, input) {
    let result;
    let output;
    try {
      output = await run('lark-cli', ['--profile', LARK_PROFILE, ...args, '--as', 'user'], { input, shell: false, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    } catch (cause) {
      const envelopes = [parseCliJson(cause?.stderr), parseCliJson(cause?.stdout)];
      const candidates = envelopes.filter(value => plain(value) && (value.ok === false && plain(value.error) || cliResultFailed(value)));
      // Conflicting output envelopes cannot establish what actually happened.
      const parsed = envelopes.some(value => value?.ok === true && !cliResultFailed(value)) ? null : candidates.length === 1 ? candidates[0] : candidates.length === 2 && JSON.stringify(candidates[0]) === JSON.stringify(candidates[1]) ? candidates[0] : null;
      throw cliFailure(cliDiagnostic(parsed, cause, 'process'));
    }
    try { result = JSON.parse(output.stdout); }
    catch { throw cliFailure({ phase: 'parse', outcome: 'unknown' }); }
    if (result?.ok === false || cliResultFailed(result)) throw cliFailure(cliDiagnostic(result, null, 'protocol'));
    return result;
  }
  async function cli(args, input) {
    const result = await invoke(args, input);
    if (result?.ok !== true || result.identity !== 'user' || !result.data || result.truncated || result.data.truncated) throw cliFailure({ phase: 'protocol', outcome: 'unknown' }, '飞书未返回完整的用户身份结果');
    return result;
  }
  async function whoami() {
    const result = await invoke(['whoami']);
    if (result?.profile !== LARK_PROFILE || result.appId !== APP_ID || result.identity !== 'user' || result.available !== true || result.tokenStatus !== 'ready' || typeof result.onBehalfOf?.openId !== 'string' || !result.onBehalfOf.openId) throw error(503, 'EXPORT_IDENTITY_INVALID', '请先确认猛鬼兽 codex 的 user 身份已就绪；不会切换机器人');
    return result.onBehalfOf.openId;
  }
  return {cli,whoami};
}

export function createFeishuExporter(db, { now = Date.now, run = runFeishuCommand, fixedTarget = null } = {}) {
  const {cli,whoami}=createFeishuClient(run);
  async function target(raw, wiki = null) {
    if (wiki) {
      const url = trustedUrl(raw);
      if (url.pathname !== `/wiki/${wiki.token}` || !/^\d+$/.test(wiki.spaceId)) throw error(400, 'EXPORT_TARGET_INVALID', 'Brief 创建目录配置无效');
      const node = (await cli(['wiki', '+node-get', '--node-token', wiki.token, '--space-id', wiki.spaceId])).data;
      if (node.node_token !== wiki.token || node.space_id !== wiki.spaceId || node.node_type !== 'origin' || node.obj_type !== 'docx' || typeof node.title !== 'string' || !node.title.trim()) throw error(409, 'EXPORT_TARGET_CHANGED', '无法核对 Brief 所在知识库和目录，请先检查目录权限');
      return { type: 'wiki', url: url.href, token: node.node_token, spaceId: node.space_id, title: node.title };
    }
    const expected = folderUrl(raw), result = await cli(['drive', '+inspect', '--url', expected.url, '--format', 'json']), data = result.data;
    if (data.type !== 'folder' || data.token !== expected.token || typeof data.title !== 'string' || !data.title.trim()) throw error(409, 'EXPORT_TARGET_CHANGED', '导出文件夹不存在、类型不符或无法核对名称');
    const actual = folderUrl(data.url);
    if (actual.token !== expected.token || new URL(actual.url).origin !== new URL(expected.url).origin) throw error(409, 'EXPORT_TARGET_CHANGED', '飞书返回的目录与指定目标不一致');
    return { ...actual, title: data.title };
  }
  const format = doc => doc.format || 'markdown';
  const createArgs = p => ['docs', '+create', '--doc-format', format(p.document), ...(format(p.document)==='xml'?[]:['--title',xmlText(p.document.title)]), '--content', '-', '--parent-token', p.target.token];
  // Avoid a duplicated title: docs +create adds --title before the Markdown body.
  const bodyContent = document => format(document)==='xml' ? document.xml : document.markdown.replace(/^# [^\n]*\n+(?=\S)/, '');
  async function actor(p) {
    const user = await whoami();
    const result = await cli([...createArgs(p), '--dry-run'], bodyContent(p.document)), context = result.data.context;
    if (result.dry_run !== true || context?.app_id !== APP_ID || context.user_open_id !== user) throw error(503, 'EXPORT_IDENTITY_INVALID', '无法核对猛鬼兽应用与当前用户，未创建文档');
    const writes = result.data.api?.filter(api => !['GET', 'HEAD'].includes(api.method));
    const expected = format(p.document)==='xml'?p.document.xml:`<title>${xmlText(p.document.title)}</title>\n${bodyContent(p.document)}`;
    if (writes?.length !== 1 || writes[0].method !== 'POST' || writes[0].url !== '/open-apis/docs_ai/v1/documents' || writes[0].body?.parent_token !== p.target.token || writes[0].body?.format !== format(p.document) || writes[0].body?.content !== expected) throw error(503, 'EXPORT_PROTOCOL_CHANGED', '飞书创建命令的预演内容或目录与预览不一致，未创建文档');
    return context.user_open_id;
  }
  function blocked(scope) {
    return listRecords(db, RECEIPTS).find(r => r.scope.kind === scope.kind && r.scope.id === scope.id && ['started', 'unknown'].includes(r.status));
  }
  function assertUnblocked(scope) {
    const receipt = blocked(scope);
    if (receipt) throw error(409, 'EXPORT_RESULT_UNKNOWN', '前次导出结果尚未核对，请先检查收据中的文档；不会再次创建', receipt);
  }
  function existing(p) {
    const receipt = getRecord(db, RECEIPTS, p.operationId);
    if (receipt?.status === 'success') return receipt;
    assertUnblocked(p.scope);
    if (p.scope.kind === 'brief' && format(p.document) === 'xml') {
      return listRecords(db, RECEIPTS).find(r => {
        if (r.status !== 'success' || r.sourceIdentity !== p.config || fingerprint(r.scope) !== fingerprint(p.scope) || fingerprint(r.target) !== fingerprint(p.target)) return false;
        const prior = getRecord(db, PREVIEWS, r.previewId);
        return prior?.operationId === r.operationId && format(prior.document) === 'xml' && typeof prior.document.xml === 'string' && briefHeadingIdentity(prior.document) === briefHeadingIdentity(p.document);
      }) || null;
    }
    return null;
  }
  async function current(scope, load) {
    const config = exportSourceIdentity(db), document = await load(scope.context);
    validateExportDocument(document);
    if (exportSourceIdentity(db) !== config) throw error(409, 'EXPORT_SOURCE_CHANGED', '来源配置已变化，请重新预览');
    return { document, config, source: exportSourceConfig(db), fingerprint: fingerprint(document) };
  }
  async function unchanged(p, load) {
    const fresh = await current(p.scope, load);
    if (fresh.config !== p.config || fresh.fingerprint !== p.fingerprint) throw error(409, 'EXPORT_SOURCE_CHANGED', '内容或来源配置已变化，请重新预览');
  }
  function scopedReceipt(kind, id, operationId) {
    const receipt = getRecord(db, RECEIPTS, operationId);
    if (!receipt || receipt.scope.kind !== kind || receipt.scope.id !== String(id)) throw error(404, 'EXPORT_RECEIPT_NOT_FOUND', '当前对象没有这条导出收据');
    return receipt;
  }
  function receiptView(receipt) {
    let sourceChanged = true;
    try { sourceChanged = exportSourceIdentity(db) !== receipt.sourceIdentity; } catch {}
    return { ...receipt, sourceChanged, verificationNote: '核对仅针对原预览的内容、来源与目标目录，不会重新创建文档' };
  }
  async function verify(p, receipt) {
    const isWiki = p.target.type === 'wiki';
    const link = documentLink({ document_id: receipt.document?.id, url: receipt.document?.url }, isWiki);
    const widths=format(p.document)==='xml' && p.document.xml.includes('<colgroup>');
    const fetched = await cli(['docs', '+fetch', '--doc', link.id, '--doc-format', format(p.document), '--detail', widths?'full':'simple', '--scope', 'full']);
    const doc = fetched.data.document;
    if (doc?.document_id !== link.id || typeof doc.content !== 'string' || fetched.data.warnings?.length) throw new Error('Readback incomplete');
    if (isWiki) {
      const node = (await cli(['wiki', '+node-get', '--node-token', link.id, '--space-id', p.target.spaceId])).data;
      if (node.obj_token !== link.id || node.obj_type !== 'docx' || node.node_type !== 'origin' || node.title !== p.document.title || node.space_id !== p.target.spaceId || node.parent_node_token !== p.target.token || !/^[a-zA-Z0-9]+$/.test(node.node_token || '')) throw new Error('Document wiki parent differs');
      const url = new URL(link.url);
      if (url.origin !== new URL(p.target.url).origin || (url.pathname.startsWith('/wiki/') && url.pathname !== `/wiki/${node.node_token}`)) throw new Error('Document wiki URL differs');
    } else {
      const metadata = (await cli(['drive', '+inspect', '--url', link.url, '--format', 'json'])).data;
      if (metadata.type !== 'docx' || metadata.token !== link.id || metadata.title !== p.document.title || documentLink({ document_id: metadata.token, url: metadata.url }).url !== link.url) throw new Error('Document metadata differs');
    }
    const normalize=format(p.document)==='xml'?source=>canonicalXml(source,{widths}):canonicalMarkdown;
    const actual=normalize(doc.content), expected=normalize(format(p.document)==='xml'?p.document.xml:p.document.markdown), withoutTitle=normalize(format(p.document)==='xml'?p.document.xml.replace(/^<title>[\s\S]*?<\/title>\s*/,''):bodyContent(p.document));
    if (actual !== expected && actual !== withoutTitle) throw new Error('Readback differs');
    const latest = getRecord(db, RECEIPTS, receipt.operationId);
    if (latest?.status === 'success') return latest;
    receipt = { ...receipt, status: 'success', verifiedAt: new Date(now()).toISOString(), readbackFingerprint: fingerprint(actual) };
    const saved = putRecord(db, RECEIPTS, p.operationId, receipt, now());
    if (fingerprint(saved) !== fingerprint(receipt)) throw new Error('Receipt readback differs');
    return saved;
  }
  function unknown(receipt) {
    const latest = getRecord(db, RECEIPTS, receipt.operationId);
    if (latest?.status === 'success') return latest;
    receipt = { ...receipt, ...latest, ...((receipt.document || latest?.document) && { document: { ...receipt.document, ...latest?.document } }), status: 'unknown', checkedAt: new Date(now()).toISOString() };
    try { putRecord(db, RECEIPTS, receipt.operationId, receipt, now()); } catch { /* The prior durable started receipt still prevents duplicate creation. */ }
    throw error(502, 'EXPORT_RESULT_UNKNOWN', '导出或回读结果未能确认；已保留收据，不会再次创建。请核对原目标目录，或使用此收据的只读核对入口', receiptView(receipt));
  }
  return {
    status: (kind, id, operationId) => receiptView(scopedReceipt(kind, id, operationId)),
    async reconcile(kind, id, operationId) {
      const receipt = scopedReceipt(kind, id, operationId);
      if (receipt.status === 'success') return receiptView(receipt);
      const p = getRecord(db, PREVIEWS, receipt.previewId);
      if (!p || p.operationId !== operationId || p.scope.kind !== kind || p.scope.id !== String(id)) throw error(409, 'EXPORT_RESULT_UNKNOWN', '原预览记录缺失，无法核对；请人工检查收据中的目标文件夹，不会再次创建', receiptView(receipt));
      if (!receipt.document?.id || !receipt.document?.url) throw error(409, 'EXPORT_RESULT_UNKNOWN', '尚未取得可核对的文档地址；请人工检查原目标文件夹，不会按标题猜测或再次创建', receiptView(receipt));
      if (await whoami() !== p.actor) throw error(409, 'EXPORT_IDENTITY_CHANGED', '请切回原预览的猛鬼兽用户后核对；不会切换机器人或重新创建', receiptView(receipt));
      try { return receiptView(await verify(p, receipt)); }
      catch { return receiptView(unknown(receipt)); }
    },
    async preview(kind, id, context, body, load) {
      if (!plain(body) || Object.keys(body).some(k => k !== 'targetUrl') || (fixedTarget ? body.targetUrl !== undefined && body.targetUrl !== fixedTarget.url : typeof body.targetUrl !== 'string')) throw error(400, 'EXPORT_TARGET_REQUIRED', fixedTarget ? 'Brief 默认创建到路觅策略知识库的营销对接Brief，请刷新页面后重试' : '请先选择新文档的飞书文件夹');
      const targetUrl = fixedTarget?.url || body.targetUrl;
      if (!fixedTarget) folderUrl(targetUrl);
      const scope = { kind, id: String(id), context }; assertUnblocked(scope);
      const value = await current(scope, load), destination = await target(targetUrl, fixedTarget);
      const p = { scope, ...value, target: destination, mode: 'new-only', previewId: randomUUID(), expiresAt: new Date(now() + 600000).toISOString() };
      p.actor = await actor(p); await unchanged(p, load);
      p.operationId = fingerprint([kind, String(id), destination.url, destination.token, p.fingerprint]);
      const receipt = existing(p);
      putRecord(db, PREVIEWS, p.previewId, p, now());
      return { previewId: p.previewId, expiresAt: p.expiresAt, mode: p.mode, target: p.target, title: p.document.title, markdown: p.document.markdown, sections: p.document.sections || [], fingerprint: p.fingerprint, ...(receipt && { receipt }) };
    },
    async confirm(kind, id, body, load) {
      if (!plain(body) || Object.keys(body).some(k => !['previewId', 'confirm'].includes(k)) || body.confirm !== true || typeof body.previewId !== 'string') throw error(400, 'EXPORT_CONFIRM_REQUIRED', '请先预览完整内容和目标目录，再明确确认');
      const p = getRecord(db, PREVIEWS, body.previewId);
      if (!p || p.scope.kind !== kind || p.scope.id !== String(id)) throw error(409, 'EXPORT_PREVIEW_EXPIRED', '导出预览不存在或与对象不符，请重新预览');
      let receipt = existing(p); if (receipt) return receipt;
      if (Date.parse(p.expiresAt) <= now()) throw error(409, 'EXPORT_PREVIEW_EXPIRED', '导出预览已超过10分钟，请重新预览');
      await unchanged(p, load);
      if (fixedTarget && (p.target.type !== 'wiki' || p.target.url !== fixedTarget.url || p.target.token !== fixedTarget.token || p.target.spaceId !== fixedTarget.spaceId)) throw error(409, 'EXPORT_TARGET_CHANGED', 'Brief 默认目录已变化，请刷新后重新创建');
      if (fingerprint(await target(p.target.url, p.target.type === 'wiki' ? p.target : null)) !== fingerprint(p.target)) throw error(409, 'EXPORT_TARGET_CHANGED', '目标目录已变化，请重新预览');
      if (await actor(p) !== p.actor) throw error(409, 'EXPORT_IDENTITY_CHANGED', '当前飞书用户已变化，请重新预览');
      await unchanged(p, load);
      if (Date.parse(p.expiresAt) <= now()) throw error(409, 'EXPORT_PREVIEW_EXPIRED', '导出预览已超过10分钟，请重新预览');
      db.exec('BEGIN IMMEDIATE');
      try {
        receipt = existing(p);
        if (!receipt) receipt = putRecord(db, RECEIPTS, p.operationId, { operationId: p.operationId, previewId: p.previewId, scope: p.scope, status: 'started', target: p.target, title: p.document.title, fingerprint: p.fingerprint, sourceIdentity: p.config, source: p.source, startedAt: new Date(now()).toISOString() }, now());
        db.exec('COMMIT');
      } catch (cause) { db.exec('ROLLBACK'); throw cause; }
      if (receipt.status === 'success') return receipt;
      try {
        // A durable started receipt exists before the sole non-dry-run external write.
        const created = await cli(createArgs(p), bodyContent(p.document));
        if (/^[a-zA-Z0-9_]+$/.test(created.data.document?.document_id || '')) {
          receipt = { ...receipt, document: { id: created.data.document.document_id } };
          putRecord(db, RECEIPTS, p.operationId, receipt, now());
        }
        receipt = { ...receipt, document: documentLink(created.data.document, p.target.type === 'wiki') };
        putRecord(db, RECEIPTS, p.operationId, receipt, now());
        if (created.data.warnings?.length) throw new Error('Creation warnings require review');
        return await verify(p, receipt);
      } catch {
        return unknown(receipt);
      }
    },
  };
}

export function createStrategyExportService(db, needs, options = {}) {
  const exporter = createFeishuExporter(db, options);
  const load = id => async ({ month }) => {
    requireMonth(month);
    const value = (await needs.list(month)).needs.find(n => n.id === id);
    if (!value || value.status !== '已采纳' || value.origin === 'demo') throw error(409, 'EXPORT_NEED_NOT_ADOPTED', '仅能导出当前来源仍有效的已采纳需求策略');
    const strategy = value.strategy;
    if (!strategy?.goal?.trim() || !plain(strategy.actions) || ['营销', '产品', '运营'].some(k => !Array.isArray(strategy.actions[k]) || strategy.actions[k].some(r => !Array.isArray(r) || r.length !== 2 || r.some(v => typeof v !== 'string')))) throw error(409, 'EXPORT_STRATEGY_INCOMPLETE', '已采纳需求尚无完整策略，请先完善并确认保存');
    const title = `${month} ${value.seg} · ${value.node} 用户策略`;
    const sections = ['需求与来源', '策略目标', '营销行动', '产品行动', '运营行动'];
    const markdown = `# ${literalMarkdown(title)}\n\n## 1. 需求与来源\n\n${['seg', 'node', 'when', 'need', 'pain', 'todo', 'source'].map(k => literalMarkdown(value[k] || '')).filter(Boolean).join('\n\n')}\n\n## 2. 策略目标\n\n${literalMarkdown(strategy.goal)}\n\n${['营销', '产品', '运营'].map((k, i) => `## ${i + 3}. ${k}行动\n\n${markdownTable(['做什么', '为什么'], strategy.actions[k])}`).join('\n\n')}\n`;
    return { title, sections, markdown };
  };
  return {
    preview(id, body) {
      if (!plain(body) || Object.keys(body).some(k => !['month', 'targetUrl'].includes(k))) throw error(400, 'EXPORT_CONTENT_INVALID', '请提供策略月份和目标文件夹');
      requireMonth(body.month);
      return exporter.preview('need-strategy', id, { month: body.month }, { targetUrl: body.targetUrl }, load(id));
    },
    confirm: (id, body) => exporter.confirm('need-strategy', id, body, load(id)),
    status: (id, operationId) => exporter.status('need-strategy', id, operationId),
    reconcile: (id, operationId) => exporter.reconcile('need-strategy', id, operationId),
  };
}
