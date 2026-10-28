import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { getSettings } from './db.mjs';
import { getRecord, putRecord, listRecords, createLocalChanges, fingerprint } from './local-records.mjs';
import { failure, validMonth } from './v3-common.mjs';
import { assertLocalLifecycle, createLocalDeletions, deletionFailure, deletionRevision, deletionState, externalOrigin } from './local-deletions.mjs';
import { LARK_PROFILE } from './lark-identity.mjs';

const execute = promisify(execFile);
export const MARKETING_BASE = 'https://vm94j8bzy7.feishu.cn/base/MxB8biSR2aJKenszh4CcprRenmf';
export const CAMPAIGN_TABLE = 'tblDhQCi5CCZCvUT';
export const CAMPAIGN_FIELDS = ['模板序号', '任务事项', '节点类型', '环节阶段', '父记录', '开始偏移天数', '截止偏移天数'];
const fail = message => { throw failure(400, message); };
export const marketingFailure = (status, code, message) => Object.assign(failure(status, message), { code });
export const isDay = value => typeof value === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 2000) => typeof value === 'string' && value.length <= max;

export function marketingSource(db, tableKey, defaultTable) {
  const settings = getSettings(db);
  let url;
  try { url = new URL(settings.project_base_url || MARKETING_BASE); } catch { throw marketingFailure(503, 'MARKETING_SOURCE_INVALID', '项目多维表格链接无效，请在设置里核对'); }
  const token = url.pathname.match(/^\/base\/([A-Za-z0-9]+)\/?$/)?.[1];
  if (url.protocol !== 'https:' || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname) || url.username || url.password || url.port || !token) throw marketingFailure(503, 'MARKETING_SOURCE_INVALID', '项目来源须为 HTTPS 飞书多维表格链接');
  const table = settings[tableKey] || defaultTable;
  if (!/^tbl[A-Za-z0-9]+$/.test(table)) throw marketingFailure(503, 'MARKETING_SOURCE_INVALID', '多维表格数据表 ID 无效');
  return { url: `${url.origin}/base/${token}`, token, table, identity: `${url.origin}/base/${token}|${table}` };
}

// 固定使用猛鬼兽的 user 身份，只读取指定列；检查分页和修订号后才允许缓存。
export async function readMarketingTable(source, fields, { run = execute } = {}) {
  const rows = [], ids = new Set(); let rev;
  for (let offset = 0; offset < 10000; offset += 200) {
    let result;
    try {
      const { stdout } = await run('lark-cli', ['--profile', LARK_PROFILE, 'base', '+record-list', '--as', 'user', '--base-token', source.token, '--table-id', source.table, ...fields.flatMap(f => ['--field-id', f]), '--format', 'json', '--limit', '200', '--offset', String(offset)], { shell: false, encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
      result = JSON.parse(stdout);
    } catch { throw marketingFailure(502, 'MARKETING_SOURCE_UNAVAILABLE', '飞书模板读取失败，请检查猛鬼兽用户登录、权限和网络'); }
    const d = result.data;
    if (result.ok !== true || result.identity !== 'user' || !d || !Array.isArray(d.fields) || !Array.isArray(d.data) || !Array.isArray(d.record_id_list) || d.record_id_list.length !== d.data.length || typeof d.has_more !== 'boolean' || d.rev === undefined || fields.some(f => !d.fields.includes(f)) || new Set(d.fields).size !== d.fields.length) throw marketingFailure(502, 'MARKETING_SOURCE_INCOMPLETE', '飞书表格返回不完整或字段已变更，未更新本地记录');
    if (rev !== undefined && rev !== d.rev) throw marketingFailure(409, 'MARKETING_SOURCE_CHANGED', '读取期间来源表格发生变化，请重新读取');
    rev = d.rev;
    for (let i = 0; i < d.data.length; i++) {
      const id = d.record_id_list[i], values = d.data[i];
      if (typeof id !== 'string' || ids.has(id) || !Array.isArray(values) || values.length !== d.fields.length) throw marketingFailure(502, 'MARKETING_SOURCE_INCOMPLETE', '飞书表格记录重复或列不完整');
      ids.add(id); rows.push({ id, ...Object.fromEntries(d.fields.map((f, j) => [f, values[j]])) });
    }
    if (!d.has_more) return { rows, rev };
    if (d.data.length !== 200) throw marketingFailure(502, 'MARKETING_SOURCE_INCOMPLETE', '飞书表格分页不完整');
  }
  throw marketingFailure(502, 'MARKETING_SOURCE_TOO_LARGE', '模板记录过多，请缩小来源数据表');
}

export function createMarketingSourceReader(db, { kind, tableKey, defaultTable, fields, readSource = readMarketingTable, validate, now = Date.now } = {}) {
  let pending;
  return async ({ refresh = false } = {}) => {
    const source = marketingSource(db, tableKey, defaultTable);
    const saved = getRecord(db, 'marketing-source', kind);
    if (!refresh && saved?.identity === source.identity) return saved;
    if (pending?.identity === source.identity) return pending.promise;
    const promise = (async () => {
      const data = await readSource(source, fields);
      if (!Array.isArray(data?.rows)) throw marketingFailure(502, 'MARKETING_SOURCE_INCOMPLETE', '来源记录不完整');
      if (validate) validate(data.rows);
      if (marketingSource(db, tableKey, defaultTable).identity !== source.identity) throw marketingFailure(409, 'MARKETING_SOURCE_CHANGED', '读取期间来源配置发生变化，请重新读取');
      const result = { identity: source.identity, url: source.url, table: source.table, readAt: new Date(now()).toISOString(), rev: data.rev, rows: data.rows };
      putRecord(db, 'marketing-source', kind, result, now());
      return result;
    })();
    pending = { identity: source.identity, promise };
    try { return await promise; } finally { if (pending?.promise === promise) pending = undefined; }
  };
}

export function multiValues(value) {
  return [...new Set((Array.isArray(value) ? value.flatMap(multiValues) : typeof value === 'string' ? value.split(/[、,，;；\n]+/).map(s => s.trim()).filter(Boolean) : []).filter(Boolean))];
}

export function campaignTemplate(rows) {
  const entries = rows.map(row => ({
    id: row.id, n: row['模板序号'], t: row['任务事项'],
    phases: multiValues(row['环节阶段']).map(s => s.replace(/阶段$/, '')),
    types: multiValues(row['节点类型']), parents: Array.isArray(row['父记录']) ? row['父记录'].map(p => p.id) : [],
    dueOffset: row['截止偏移天数'],
  }));
  const byId = new Map(entries.map(e => [e.id, e]));
  if (!entries.length || byId.size !== entries.length || new Set(entries.map(e => e.n)).size !== entries.length || entries.some(e => !Number.isSafeInteger(e.n) || e.n < 0 || !text(e.t) || !e.t.trim() || !e.phases.length || e.parents.length > 1 || e.parents.some(p => !byId.has(p)) || e.types.some(v => !['普通任务', '审核门禁', '里程碑'].includes(v)))) throw marketingFailure(502, 'CAMPAIGN_TEMPLATE_INVALID', '营销战役模板的序号、节点、阶段或父记录不完整');
  for (const e of entries) {
    const seen = new Set([e.id]); let parent = e.parents[0];
    while (parent) { if (seen.has(parent)) throw marketingFailure(502, 'CAMPAIGN_TEMPLATE_INVALID', '营销战役模板存在循环父记录'); seen.add(parent); parent = byId.get(parent)?.parents[0]; }
  }
  const promoted = e => !e.parents.length || e.types.includes('审核门禁') || e.types.includes('里程碑') || !e.phases.every(p => byId.get(e.parents[0]).phases.includes(p));
  const top = entries.filter(promoted).sort((a, b) => a.n - b.n);
  // 带门禁/里程碑的子节点提升到同层，避免 kids 的二元组丢失审核语义。
  const owner = e => { let p = e; while (p.parents.length && !promoted(p)) p = byId.get(p.parents[0]); return p.id; };
  const order = ['启动', '计划', '调研', '实施', '收尾', '监控'];
  const names = [...new Set(top.flatMap(e => e.phases))].sort((a, b) => (order.includes(a) ? order.indexOf(a) : 99) - (order.includes(b) ? order.indexOf(b) : 99));
  return names.map(name => ({ name, nodes: top.filter(e => e.phases.includes(name)).map(e => {
    const kids = entries.filter(k => k.id !== e.id && !promoted(k) && owner(k) === e.id).sort((a, b) => a.n - b.n).map(k => [k.t, false]);
    return { n: e.n, t: e.t, owner: '', done: false, due: '', ...(e.types.includes('审核门禁') && { gate: true }), ...(e.types.includes('里程碑') && { milestone: true }), ...(kids.length && { kids }) };
  }) }));
}

function monthsBetween(start, end) {
  const result = []; let month = start.slice(0, 7);
  for (let i = 0; month <= end.slice(0, 7) && i < 120; i++) {
    result.push(month); const [y, m] = month.split('-').map(Number); month = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  }
  return result;
}

function validateCampaign(value) {
  if (!plain(value) || !text(value.name, 200) || !value.name.trim() || !text(value.desc) || !isDay(value.start) || !isDay(value.end) || value.end < value.start || Date.parse(value.end) - Date.parse(value.start) > 366 * 86400000) fail('请填写战役名称、说明和有效起止日期，跨度不超过一年');
  if (!Array.isArray(value.months) || !value.months.length || value.months.some(m => !validMonth(m) || m < value.start.slice(0, 7) || m > value.end.slice(0, 7)) || new Set(value.months).size !== value.months.length) fail('关联月份须在战役起止月份之间且不能重复');
  if (!Array.isArray(value.routine) || value.routine.length > 50 || value.routine.some(r => !Array.isArray(r) || r.length !== 2 || !text(r[0], 200) || !r[0].trim() || !['reuse', 'campaign', 'skip'].includes(r[1])) || new Set(value.routine.map(r => r[0])).size !== value.routine.length) fail('物料决定须逐项选择沿用常规、战役版或本月不出');
  if (!Array.isArray(value.phases) || !value.phases.length || value.phases.length > 20) fail('战役阶段无效');
  const nodeValues = new Map();
  for (const phase of value.phases) {
    if (!plain(phase) || !text(phase.name, 100) || !phase.name || !Array.isArray(phase.nodes) || phase.nodes.length > 300) fail('战役阶段或节点无效');
    for (const node of phase.nodes) {
      if (!plain(node) || !Number.isSafeInteger(node.n) || !text(node.t) || !node.t || !text(node.owner, 100) || typeof node.done !== 'boolean' || typeof node.due !== 'string' || (node.gate !== undefined && typeof node.gate !== 'boolean') || (node.milestone !== undefined && typeof node.milestone !== 'boolean')) fail('节点名称、负责人或完成状态无效');
      if (node.due) {
        const day = `${value.start.slice(0, 4)}-${node.due}`;
        if (!/^\d{2}-\d{2}$/.test(node.due) || !isDay(day)) fail('节点截止日期须为有效的 MM-DD，未设日期请留空');
      }
      if (node.kids !== undefined && (!Array.isArray(node.kids) || node.kids.length > 100 || node.kids.some(k => !Array.isArray(k) || k.length !== 2 || !text(k[0]) || !k[0] || typeof k[1] !== 'boolean'))) fail('子节点须为名称与完成状态');
      const previous = nodeValues.get(node.n); if (previous && fingerprint(previous) !== fingerprint(node)) fail('跨阶段的同一节点内容不一致'); nodeValues.set(node.n, node);
    }
  }
  if (value.review !== undefined && !text(value.review, 20000)) fail('复盘须为 20000 字以内的文字');
  if (Object.keys(value).some(k => !['id', 'name', 'start', 'end', 'months', 'desc', 'phases', 'routine', 'review'].includes(k))) fail('战役包含不支持的字段');
}

export function createCampaignService(db, options = {}) {
  const now = options.now || Date.now;
  const source = createMarketingSourceReader(db, { kind: 'campaign-template', tableKey: 'campaign_table_id', defaultTable: CAMPAIGN_TABLE, fields: CAMPAIGN_FIELDS, ...options, validate: campaignTemplate });
  const changes = createLocalChanges(db, { now });
  const archives = new Map(), edits = new Map();
  const history = (deleted = false) => listRecords(db, 'campaign-archive').filter(c => !!deletionState(db, 'campaign', c.id)?.deleted === deleted).sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
  const requireArchive = id => {
    if (getRecord(db, 'campaign', 'current')?.id === id) throw deletionFailure(409, 'CAMPAIGN_CURRENT_PROTECTED', '当前战役不能通过历史接口删除或恢复');
    const record = getRecord(db, 'campaign-archive', id);
    const remote = id === 'template' || (getRecord(db, 'marketing-source', 'campaign-template')?.rows || []).some(row => row.id === id);
    if (record && remote) throw deletionFailure(409, 'LOCAL_SOURCE_CONFLICT', '归档与已知飞书模板编号冲突，不能操作');
    if (remote) throw deletionFailure(403, 'LOCAL_SOURCE_REQUIRED', '飞书模板记录不能在本地删除');
    if (!record) throw deletionFailure(404, 'LOCAL_OBJECT_NOT_FOUND', '本地历史战役不存在');
    if (record.id !== id || externalOrigin(record) || !Number.isFinite(Date.parse(record.archivedAt))) throw deletionFailure(403, 'LOCAL_SOURCE_REQUIRED', '无法核验为本地战役归档');
    const { archivedAt, ...value } = record;
    try { validateCampaign(value); } catch { throw deletionFailure(403, 'LOCAL_SOURCE_REQUIRED', '归档内容不符合本地战役结构'); }
    return record;
  };
  const deletions = createLocalDeletions(db, { kind: 'campaign', now,
    load: id => { const record = requireArchive(id); return { snapshot: record, value: record }; },
  });
  const editable = (id, revision) => {
    assertLocalLifecycle(db, 'campaign', id, revision);
    if (getRecord(db, 'campaign-archive', id)) throw deletionFailure(409, 'CAMPAIGN_ARCHIVED', '战役已经归档，旧编辑不能重建当前战役');
  };
  const template = async () => {
    const data = await source();
    return { id: 'template', name: '营销战役模板（未实例化）', start: '', end: '', months: [], desc: '来自飞书营销战役模板；尚未创建真实战役，日期、负责人和物料决定待填写', phases: campaignTemplate(data.rows), routine: [] };
  };
  return {
    template,
    current: () => getRecord(db, 'campaign', 'current') || template(),
    async preview(body) {
      if (!plain(body) || Object.keys(body).some(k => !['name', 'start', 'end', 'months', 'desc', 'phases', 'routine', 'review'].includes(k))) fail('战役预览内容无效');
      const current = getRecord(db, 'campaign', 'current'), base = current || await template();
      if (body.review !== undefined && !current) fail('请先创建战役，再写复盘');
      const value = { ...base, ...structuredClone(body), id: current?.id || randomUUID() };
      if (body.months === undefined && (body.start !== undefined || body.end !== undefined || !current)) value.months = isDay(value.start) && isDay(value.end) ? monthsBetween(value.start, value.end) : [];
      // 模板分类与名称保持原样，写入只修改节点状态、负责人和日期。
      const signature = phases => phases.map(p => ({ name: p.name, nodes: p.nodes.map(n => ({ n: n.n, t: n.t, gate: !!n.gate, milestone: !!n.milestone, kids: (n.kids || []).map(k => k[0]) })) }));
      const expected = fingerprint(signature(base.phases));
      const identity = marketingSource(db, 'campaign_table_id', CAMPAIGN_TABLE).identity;
      const sourceVersion = fingerprint(getRecord(db, 'marketing-source', 'campaign-template')?.rows ?? null);
      const revision = deletionRevision(db, 'campaign', value.id);
      const preview = changes.preview('campaign', 'current', value, { validate: candidate => {
        editable(candidate.id, revision);
        validateCampaign(candidate);
        if (fingerprint(signature(candidate.phases)) !== expected) fail('节点名称、阶段和门禁类型来自模板，请只修改状态、负责人或日期');
        if (marketingSource(db, 'campaign_table_id', CAMPAIGN_TABLE).identity !== identity) throw marketingFailure(409, 'CAMPAIGN_SOURCE_CHANGED', '战役模板配置已变化，请重新预览');
        if (!current && fingerprint(getRecord(db, 'marketing-source', 'campaign-template')?.rows ?? null) !== sourceVersion) throw marketingFailure(409, 'CAMPAIGN_SOURCE_CHANGED', '战役模板内容已变化，请重新预览');
      } });
      for (const [token, p] of edits) if (p.expires <= now()) edits.delete(token);
      edits.set(preview.previewId, { id: value.id, revision, expires: Date.parse(preview.expiresAt) });
      return preview;
    },
    confirm(body) {
      const p = edits.get(body?.previewId);
      if (p) editable(p.id, p.revision);
      return changes.confirm('campaign', 'current', body);
    },
    // 新开战役：当前战役整条归档为历史（只读），当前位置清空，页面回到「按模板创建」。归档和清空在同一个事务里。
    history: ({ deleted = false } = {}) => ({ items: history(deleted).map(c => ({ ...c, ...(deleted && { deletion: deletionState(db, 'campaign', c.id) }) })) }),
    removePreview: (id, body) => deletions.preview(id, 'remove', body),
    removeConfirm: (id, body) => deletions.confirm(id, 'remove', body),
    restorePreview: (id, body) => deletions.preview(id, 'restore', body),
    restoreConfirm: (id, body) => deletions.confirm(id, 'restore', body),
    archivePreview() {
      const current = getRecord(db, 'campaign', 'current');
      if (!current) fail('还没有创建战役，不需要新开');
      editable(current.id, deletionRevision(db, 'campaign', current.id));
      for (const [id, p] of archives) if (p.expires <= now()) archives.delete(id);
      const previewId = randomUUID(), expires = now() + 600_000;
      archives.set(previewId, { before: fingerprint(current), id: current.id, expires, revision: deletionRevision(db, 'campaign', current.id) });
      return { previewId, expiresAt: new Date(expires).toISOString(), value: current };
    },
    archiveConfirm(body) {
      if (body?.confirm !== true || typeof body.previewId !== 'string') fail('请先预览，再明确确认');
      const p = archives.get(body.previewId);
      if (!p || p.expires <= now()) throw failure(409, '预览已失效，请重新预览');
      assertLocalLifecycle(db, 'campaign', p.id, p.revision);
      if (p.receipt) return structuredClone(p.receipt);
      db.exec('BEGIN IMMEDIATE');
      try {
        const current = getRecord(db, 'campaign', 'current');
        if (fingerprint(current) !== p.before) throw failure(409, '战役已变化，请重新预览');
        if (getRecord(db, 'campaign-archive', current.id)) throw deletionFailure(409, 'CAMPAIGN_ARCHIVED', '同编号战役已归档，不能覆盖');
        const archived = { ...current, archivedAt: new Date(now()).toISOString() };
        const back = putRecord(db, 'campaign-archive', current.id, archived, now());
        db.prepare("DELETE FROM v3_documents WHERE kind='campaign' AND id='current'").run();
        if (fingerprint(back) !== fingerprint(archived) || getRecord(db, 'campaign', 'current') !== null) throw failure(500, '归档后回读不一致，已回滚');
        db.exec('COMMIT'); p.receipt = { archived: back }; return structuredClone(p.receipt);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
