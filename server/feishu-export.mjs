import { canonicalXml } from './feishu-xml.mjs';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getSettings } from './db.mjs';
import { V3_DEFAULTS } from './v3-settings.mjs';
import { fingerprint, getRecord, listRecords, putRecord } from './local-records.mjs';
import { failure, requireMonth } from './v3-common.mjs';

const APP_ID = 'cli_aacf58ab61b85beb';
const PREVIEWS = 'feishu-export-preview', RECEIPTS = 'feishu-export';
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const error = (status, code, message, receipt) => Object.assign(failure(status, message), { code, ...(receipt && { receipt }) });
const xmlText = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Source text is literal: it must never become a CLI image, file, XML or mention directive.
export const literalMarkdown = text => xmlText(String(text).replace(/\r/g, '')).replace(/[\\`*_\[\]{}()!#$~|]/g, '\\$&').replace(/^(\s*)([-+]|\d+[.])(?=\s)/gm, '$1\\$2');
export const markdownTable = (heads, rows) => [heads, heads.map(() => '---'), ...rows].map(row => `| ${row.map(v => literalMarkdown(v).replace(/\n/g, '<br>')).join(' | ')} |`).join('\n');

function exportSourceConfig(db) {
  const settings = { ...V3_DEFAULTS, ...getSettings(db) };
  if (settings.lark_profile !== 'codex' || settings.lark_app_id !== APP_ID) throw error(503, 'EXPORT_IDENTITY_INVALID', '导出仅允许机械邪龙兽 codex 的用户身份');
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
function documentLink(document) {
  if (!/^[a-zA-Z0-9_]+$/.test(document?.document_id || '')) throw new Error('Missing document id');
  const url = trustedUrl(document.url);
  if (url.pathname !== `/docx/${document.document_id}`) throw new Error('Invalid document URL');
  return { id: document.document_id, url: url.href };
}
function defaultRun(command, args, { input, ...options }) {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, options, (err, stdout, stderr) => err ? reject(err) : resolve({ stdout, stderr }));
    child.stdin.on('error', () => {});
    child.stdin.end(input || '');
  });
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

export function createFeishuExporter(db, { now = Date.now, run = defaultRun } = {}) {
  async function invoke(args, input) {
    let result;
    try {
      const output = await run('lark-cli', ['--profile', 'codex', ...args, '--as', 'user'], { input, shell: false, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
      result = JSON.parse(output.stdout);
    } catch { throw error(502, 'EXPORT_CLI_FAILED', '飞书操作未取得可验证的完整结果'); }
    return result;
  }
  async function cli(args, input) {
    const result = await invoke(args, input);
    if (result.ok !== true || result.identity !== 'user' || !result.data || result.truncated || result.data.truncated) throw error(502, 'EXPORT_CLI_FAILED', '飞书未返回完整的用户身份结果');
    return result;
  }
  async function whoami() {
    const result = await invoke(['whoami']);
    if (result.profile !== 'codex' || result.appId !== APP_ID || result.identity !== 'user' || result.available !== true || result.tokenStatus !== 'ready' || typeof result.onBehalfOf?.openId !== 'string' || !result.onBehalfOf.openId) throw error(503, 'EXPORT_IDENTITY_INVALID', '请先确认机械邪龙兽 codex 的 user 身份已就绪；不会切换机器人');
    return result.onBehalfOf.openId;
  }
  async function target(raw) {
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
    if (result.dry_run !== true || context?.app_id !== APP_ID || context.user_open_id !== user) throw error(503, 'EXPORT_IDENTITY_INVALID', '无法核对机械邪龙兽应用与当前用户，未创建文档');
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
    return null;
  }
  async function current(scope, load) {
    const config = exportSourceIdentity(db), document = await load(scope.context);
    if (!plain(document) || typeof document.title !== 'string' || !document.title.trim() || document.title.length > 500 || /[\r\n\x00-\x1f]/.test(document.title) || typeof document.markdown !== 'string' || document.markdown.length > 1_000_000) throw error(400, 'EXPORT_CONTENT_INVALID', '导出内容或标题格式无效');
    if(!['markdown','xml'].includes(format(document)) || (format(document)==='xml' && (typeof document.xml!=='string'||document.xml.length>1_000_000)))throw error(400,'EXPORT_CONTENT_INVALID','文档结构格式无效');
    if(format(document)==='xml') { try{canonicalXml(document.xml);}catch{throw error(400,'EXPORT_CONTENT_INVALID','文档结构无法校验');} }
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
    const link = documentLink({ document_id: receipt.document?.id, url: receipt.document?.url });
    const fetched = await cli(['docs', '+fetch', '--doc', link.id, '--doc-format', format(p.document), '--detail', 'simple', '--scope', 'full']);
    const doc = fetched.data.document;
    if (doc?.document_id !== link.id || typeof doc.content !== 'string' || fetched.data.warnings?.length) throw new Error('Readback incomplete');
    const metadata = (await cli(['drive', '+inspect', '--url', link.url, '--format', 'json'])).data;
    if (metadata.type !== 'docx' || metadata.token !== link.id || metadata.title !== p.document.title || documentLink({ document_id: metadata.token, url: metadata.url }).url !== link.url) throw new Error('Document metadata differs');
    const normalize=format(p.document)==='xml'?canonicalXml:canonicalMarkdown;
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
      if (await whoami() !== p.actor) throw error(409, 'EXPORT_IDENTITY_CHANGED', '请切回原预览的 codex 用户后核对；不会切换机器人或重新创建', receiptView(receipt));
      try { return receiptView(await verify(p, receipt)); }
      catch { return receiptView(unknown(receipt)); }
    },
    async preview(kind, id, context, body, load) {
      if (!plain(body) || Object.keys(body).some(k => k !== 'targetUrl') || typeof body.targetUrl !== 'string') throw error(400, 'EXPORT_TARGET_REQUIRED', '请先选择新文档的飞书文件夹');
      folderUrl(body.targetUrl);
      const scope = { kind, id: String(id), context }; assertUnblocked(scope);
      const value = await current(scope, load), destination = await target(body.targetUrl);
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
      if (fingerprint(await target(p.target.url)) !== fingerprint(p.target)) throw error(409, 'EXPORT_TARGET_CHANGED', '目标目录已变化，请重新预览');
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
        receipt = { ...receipt, document: documentLink(created.data.document) };
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
