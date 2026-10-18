import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSettings } from './db.mjs';
import { randomUUID } from 'node:crypto';
import { createLocalChanges, fingerprint, getRecord, listRecords } from './local-records.mjs';
import { failure, saveSnapshot } from './v3-common.mjs';
import { assertLocalLifecycle, createLocalDeletions, deletionFailure, deletionRevision, deletionState, externalOrigin } from './local-deletions.mjs';

const execute = promisify(execFile);
export const PROJECT_SOURCE = { url: 'https://vm94j8bzy7.feishu.cn/base/MxB8biSR2aJKenszh4CcprRenmf', table: 'tblIEuoDOvkHeU3P' };
export async function runLark(args, run = execute) {
  let result;
  try {
    const { stdout } = await run('lark-cli', ['--profile', 'codex', ...args, '--as', 'user', '--format', 'json'], { encoding: 'utf8', timeout: 90_000, maxBuffer: 16 * 1024 * 1024, shell: false });
    result = JSON.parse(stdout);
  } catch (error) {
    let detail;
    try { detail = JSON.parse(error.stderr).error; } catch { /* CLI或网络错误不返回用户原文。 */ }
    if (detail?.subtype === 'rate_limit') throw Object.assign(failure(429, '飞书读取触发限流，请稍后重试'), { retryAfterMs: 3000 });
    const safeCode = Number.isInteger(detail?.code) ? { larkCode: detail.code } : {};
    // 授权被拒（缺权限范围 / 无权限）发生在执行之前：rejected 表示飞书确定没有执行，写入方据此不锁。
    if (detail?.subtype === 'missing_scope') throw Object.assign(failure(403, `codex 用户缺少飞书权限 ${(detail.missing_scopes || []).join('、') || ''}，需要先授权`), safeCode, { rejected: true });
    if (detail?.subtype === 'permission_denied') throw Object.assign(failure(403, '当前 codex 用户无权读取此飞书资源'), safeCode, { rejected: true });
    throw Object.assign(failure(502, '飞书读取失败，请检查 codex 用户登录、读取权限和网络'), safeCode);
  }
  if (result.ok !== true || result.identity !== 'user' || !result.data || result.truncated || result.data.truncated) throw failure(502, '飞书没有返回完整的用户身份数据');
  return result.data;
}
export function matrixRows(data) {
  if (data.has_more || !Array.isArray(data.fields) || !Array.isArray(data.data) || !Array.isArray(data.record_id_list) || data.data.length !== data.record_id_list.length || new Set(data.record_id_list).size !== data.record_id_list.length) throw failure(502, '多维表格记录不完整');
  return data.data.map((cells, i) => {
    if (!Array.isArray(cells) || cells.length !== data.fields.length) throw failure(502, '多维表格字段与记录不匹配');
    return { id: data.record_id_list[i], ...Object.fromEntries(data.fields.map((name, j) => [name, cells[j]])) };
  });
}
export function baseToken(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw failure(400, '项目来源须为有效飞书多维表格链接'); }
  const token = parsed.pathname.match(/^\/base\/([A-Za-z0-9]+)\/?$/)?.[1];
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(parsed.hostname) || !token) throw failure(400, '项目来源须为 HTTPS 飞书多维表格链接');
  return token;
}
export function validDate(date) {
  return typeof date === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}
const ids = values => (Array.isArray(values) ? values.map(v => v?.id).filter(Boolean) : []);
const select = value => Array.isArray(value) ? value.filter(v => typeof v === 'string') : [];
const plain = value => typeof value === 'string' ? value : '';
const fieldArgs = names => names.flatMap(name => ['--field-id', name]);

export async function readProjectSource(config, { run } = {}) {
  const common = ['--base-token', baseToken(config.url)];
  const schema = await runLark(['base', '+field-list', ...common, '--table-id', config.table], run);
  const projectTable = schema.fields?.find(f => f.name === '所属项目')?.link_table;
  const peopleTable = schema.fields?.find(f => f.name === '主责任人')?.link_table;
  if (!projectTable || !peopleTable) throw failure(502, '项目表缺少所属项目或主责任人关联');
  const fields = ['所属项目', '任务事项', '节点类型', '环节阶段', '父记录', '主责任人', '是否完成', '截止时间'];
  const nodes = []; let revision;
  for (;;) {
    const page = await runLark(['base', '+record-list', ...common, '--table-id', config.table, ...fieldArgs(fields), '--limit', '200', '--offset', String(nodes.length)], run);
    if (typeof page.has_more !== 'boolean' || revision !== undefined && page.rev !== revision) throw failure(502, '分页期间项目表版本改变或分页状态缺失');
    revision = page.rev;
    const rows = matrixRows({ ...page, has_more: false }); nodes.push(...rows);
    if (!page.has_more) break;
    if (!rows.length || nodes.length >= 2000) throw failure(502, '项目表分页未完成，未保存不完整快照');
  }
  const projectIds = [...new Set(nodes.flatMap(row => ids(row['所属项目'])))];
  const peopleIds = [...new Set(nodes.flatMap(row => ids(row['主责任人'])))];
  const getLinked = async (table, recordIds, names) => {
    const out = [];
    for (let i = 0; i < recordIds.length; i += 100) out.push(...matrixRows(await runLark(['base', '+record-get', ...common, '--table-id', table, ...recordIds.slice(i, i + 100).flatMap(id => ['--record-id', id]), ...fieldArgs(names)], run)));
    if (recordIds.some(id => !out.some(row => row.id === id))) throw failure(502, '项目关联记录未完整读取');
    return out;
  };
  const [projects, people] = await Promise.all([getLinked(projectTable, projectIds, ['项目名称', '状态']), getLinked(peopleTable, peopleIds, ['成员名'])]);
  return { nodes, projects, people };
}

export function projectView(source) {
  const people = new Map(source.people.map(p => [p.id, plain(p['成员名'])]));
  const nodesById = new Map(source.nodes.map(n => [n.id, n]));
  if (nodesById.size !== source.nodes.length) throw failure(502, '项目节点标识重复');
  return source.projects.map(project => {
    const rows = source.nodes.filter(n => ids(n['所属项目']).includes(project.id));
    const rowIds = new Set(rows.map(n => n.id));
    const parent = n => ids(n['父记录']);
    for (const row of rows) {
      let chain = parent(row), visited = new Set([row.id]);
      while (chain.length) {
        if (chain.length !== 1 || !rowIds.has(chain[0]) || visited.has(chain[0])) throw failure(502, '项目父子节点缺失、重复或存在循环');
        visited.add(chain[0]); chain = parent(nodesById.get(chain[0]));
      }
    }
    const convert = n => {
      const rawDate = plain(n['截止时间']);
      const dueDate = rawDate ? rawDate.slice(0, 10) : '';
      if (dueDate && !validDate(dueDate)) throw failure(502, '项目截止日期无效');
      const stage = select(n['环节阶段']).map(v => v.replace(/阶段$/, ''));
      return { id: n.id, ph: stage.join(' / '), phases: stage, t: plain(n['任务事项']), owner: ids(n['主责任人']).map(id => people.get(id) || '未解析成员').join('、') || '—', done: n['是否完成'] === true, statusKnown: typeof n['是否完成'] === 'boolean', due: dueDate.slice(5), dueDate, gate: select(n['节点类型']).includes('审核门禁'), gateReady: false };
    };
    const flatten = (id, prefix = '') => rows.filter(n => parent(n)[0] === id).flatMap(n => {
      const name = `${prefix}${plain(n['任务事项'])}`;
      return [{ ...convert(n), t: name }, ...flatten(n.id, `${name} / `)];
    });
    const nodes = rows.filter(n => !parent(n).length).map(n => {
      const kids = flatten(n.id);
      return { ...convert(n), ...(kids.length ? { kids: kids.map(k => [k.t, k.done]), childNodes: kids } : {}) };
    });
    const phases = [...new Set(nodes.map(n => n.ph))];
    return { id: project.id, name: plain(project['项目名称']), template: '项目推进', status: select(project['状态']).join(' / ') || '状态未填写', phase: -1, phases, nodes };
  });
}

// 只缓存完整读取；失败不会退回旧来源或旧快照伪装成功。
// staleWhileRevalidate：有旧结果（含服务重启前存下的快照）时先返回旧结果，过期的话后台再读一次；写入前的读取仍传 refresh 现读。
export function createConfiguredReader(db, kind, config, read, { now = Date.now, ttl = 300_000, onSource, staleWhileRevalidate = false } = {}) {
  let cache, inflight, failed;
  if (staleWhileRevalidate) {
    const row = db.prepare('SELECT payload, updated_at FROM v3_snapshots WHERE kind=?').get(kind);
    try { const saved = row && JSON.parse(row.payload); if (saved?.identity && saved.value) cache = { identity: saved.identity, at: Date.parse(row.updated_at) || 0, value: saved.value }; } catch { cache = undefined; }
  }
  return async ({ refresh = false } = {}) => {
    const cfg = config(), identity = fingerprint(cfg), at = now();
    if (!refresh && staleWhileRevalidate && cache?.identity === identity) {
      if (at - cache.at >= ttl && inflight?.identity !== identity) start(cfg, identity, at).catch(() => {});
      return structuredClone(cache.value);
    }
    if (!refresh && failed?.identity === identity && at < failed.until) throw failed.error;
    if (!refresh && cache?.identity === identity && at - cache.at < ttl) return structuredClone(cache.value);
    if (inflight?.identity === identity) return structuredClone(await inflight.promise);
    return structuredClone(await start(cfg, identity, at));
  };
  function start(cfg, identity, at) {
    const promise = (async () => {
      try {
        const value = await read(cfg);
        if (identity !== fingerprint(config())) throw failure(409, '读取期间来源设置已变化，请重新读取');
        cache = { identity, at: now(), value }; failed = null;
        saveSnapshot(db, kind, { identity, value }, new Date(cache.at).toISOString());
        onSource?.({ identity: cfg.spaceId || identity, attemptAt: at, ...(value?.sourceError ? { error: value.sourceError } : { at: new Date(cache.at).toISOString() }) });
        return value;
      } catch (error) {
        if (identity === fingerprint(config())) { failed = { identity, until: now() + 60_000, error }; onSource?.({ identity: cfg.spaceId || identity, attemptAt: at, error: error.message }); }
        throw error;
      } finally { if (inflight?.identity === identity) inflight = null; }
    })();
    inflight = { identity, promise };
    return promise;
  }
}

export function createProjectService(db, { readSource = readProjectSource, now = Date.now, ...options } = {}) {
  const config = () => { const s = getSettings(db); return { url: s.project_base_url || PROJECT_SOURCE.url, table: s.project_table_id || PROJECT_SOURCE.table }; };
  let latestProjects;
  const read = createConfiguredReader(db, 'projects', config, async cfg => { latestProjects = projectView(await readSource(cfg)); return latestProjects; }, { now, ...options });
  const changes = createLocalChanges(db, { now });
  const receipts = new Map();
  const identity = () => fingerprint(config());
  // 本地项目（编号 local-…）只存工作台：按某个飞书项目的阶段和节点生成，节点改动同样存 project-state，但不随飞书来源配置变化。
  const LOCAL = 'local-project', isLocal = id => !!getRecord(db, LOCAL, id);
  const key = id => isLocal(id) ? `local:${id}` : `${identity()}:${id}`;
  const locals = (deleted = false) => listRecords(db, LOCAL).filter(p => !!deletionState(db, 'project', p.id)?.deleted === deleted).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const creations = new Map(), edits = new Map();
  const knownRemote = () => {
    const row = db.prepare("SELECT payload FROM v3_snapshots WHERE kind='projects'").get();
    return [...(latestProjects || []), ...(row ? JSON.parse(row.payload).value || [] : [])];
  };
  const requireLocal = id => {
    const record = getRecord(db, LOCAL, id), remote = knownRemote().some(p => p.id === id);
    if (record && remote) throw deletionFailure(409, 'LOCAL_SOURCE_CONFLICT', '本地项目与已知飞书来源编号冲突，不能操作');
    if (remote) throw deletionFailure(403, 'LOCAL_SOURCE_REQUIRED', '飞书来源项目不能在本地删除');
    if (!record) throw deletionFailure(404, 'LOCAL_OBJECT_NOT_FOUND', '本地项目不存在');
    if (record.id !== id || record.local !== true || externalOrigin(record) || !record.basedOn?.id || !Array.isArray(record.nodes) || !Number.isFinite(Date.parse(record.createdAt))) throw deletionFailure(403, 'LOCAL_SOURCE_REQUIRED', '无法核验为本地创建的项目');
    return record;
  };
  function apply(project, saved) {
    const record = saved || getRecord(db, 'project-state', key(project.id));
    const overlay = n => ({ ...n, ...(record?.overrides[n.id] || {}), ...(record?.overrides[n.id]?.dueDate !== undefined ? { due: record.overrides[n.id].dueDate.slice(5) } : {}) });
    return { ...project, nodes: project.nodes.map(n => { const kids = n.childNodes?.map(overlay); return { ...overlay(n), ...(kids ? { childNodes: kids, kids: kids.map(k => [k.t, k.done]) } : {}) }; }) };
  }
  const deletions = createLocalDeletions(db, { kind: 'project', now,
    load: id => { const record = requireLocal(id); return { snapshot: { record, state: getRecord(db, 'project-state', `local:${id}`) }, value: apply(record) }; },
    restoreConflict: (id, target) => { if ([...locals(), ...knownRemote()].some(p => p.id !== id && p.name === target.value.name)) throw deletionFailure(409, 'LOCAL_RESTORE_CONFLICT', '已有同名项目，请先处理名称冲突'); },
  });
  return {
    list: async options => [...(await read(options)), ...locals()].map(project => apply(project)),
    localList: ({ deleted = false } = {}) => ({ items: locals(deleted).map(p => ({ ...apply(p), ...(deleted && { deletion: deletionState(db, 'project', p.id) }) })) }),
    removePreview: (id, body) => deletions.preview(id, 'remove', body),
    removeConfirm: (id, body) => deletions.confirm(id, 'remove', body),
    restorePreview: (id, body) => deletions.preview(id, 'restore', body),
    restoreConfirm: (id, body) => deletions.confirm(id, 'restore', body),
    async createPreview(body) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['name', 'basedOn'].includes(k))) throw failure(400, '新建项目内容无效');
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name || name.length > 100) throw failure(400, '请填写 100 字以内的项目名称');
      const source = await read(), base = source.find(p => p.id === body.basedOn);
      if (!base) throw failure(400, '请选择一个飞书项目作为模板');
      const taken = () => [...source, ...locals()].some(p => p.name === name);
      if (taken()) throw failure(400, '已有同名项目');
      const id = `local-${randomUUID()}`; let n = 0;
      const blank = node => { const { childNodes, kids, ...rest } = node; return { ...rest, id: `${id}-n${++n}`, owner: '—', done: false, statusKnown: true, due: '', dueDate: '', gateReady: false }; };
      const nodes = base.nodes.map(node => { const top = blank(node), children = (node.childNodes || []).map(blank); return children.length ? { ...top, kids: children.map(k => [k.t, false]), childNodes: children } : top; });
      const value = { id, name, template: '项目推进', status: '推进中', phase: -1, phases: base.phases, nodes, local: true, basedOn: { id: base.id, name: base.name }, createdAt: new Date(now()).toISOString() };
      const preview = changes.preview(LOCAL, id, value, { validate: (v, current) => { if (current || locals().some(p => p.name === name)) throw failure(409, '已有同名项目，请重新预览'); } });
      for (const [k, c] of creations) if (c.expires <= now()) creations.delete(k);
      creations.set(preview.previewId, { id, expires: Date.parse(preview.expiresAt), revision: deletionRevision(db, 'project', id) });
      return preview;
    },
    createConfirm(body) {
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '请先预览，再明确确认');
      const c = creations.get(body.previewId);
      if (!c) throw failure(409, '预览已失效，请重新预览');
      assertLocalLifecycle(db, 'project', c.id, c.revision);
      if (isLocal(c.id)) requireLocal(c.id);
      return apply(changes.confirm(LOCAL, c.id, body));
    },
    async preview(id, body) {
      const local = isLocal(id), revision = deletionRevision(db, 'project', id);
      if (local) assertLocalLifecycle(db, 'project', id);
      const project = local ? requireLocal(id) : (await read()).find(p => p.id === id);
      if (!project) throw failure(404, '项目不存在');
      if (!body || typeof body.nodeId !== 'string' || !project.nodes.flatMap(n => [n, ...(n.childNodes || [])]).some(n => n.id === body.nodeId)) throw failure(400, '请选择有效项目节点');
      const patch = {};
      if ('done' in body) { if (typeof body.done !== 'boolean') throw failure(400, '完成状态须为布尔值'); patch.done = body.done; patch.statusKnown = true; }
      if ('due' in body) { if (body.due !== '' && !validDate(body.due)) throw failure(400, '截止日期须为完整 YYYY-MM-DD'); patch.dueDate = body.due; }
      if (!Object.keys(patch).length) throw failure(400, '没有可保存的节点变更');
      const sourceIdentity = isLocal(id) ? 'local' : identity(), recordKey = key(id), sourceHash = fingerprint(project);
      const current = getRecord(db, 'project-state', recordKey);
      const value = { sourceIdentity, projectId: id, overrides: { ...current?.overrides, [body.nodeId]: { ...current?.overrides?.[body.nodeId], ...patch } } };
      const preview = changes.preview('project-state', recordKey, value, { validate: () => {
        if (local) { assertLocalLifecycle(db, 'project', id, revision); requireLocal(id); }
        if (isLocal(id) ? fingerprint(getRecord(db, LOCAL, id)) !== sourceHash : identity() !== sourceIdentity || fingerprint(latestProjects?.find(p => p.id === id)) !== sourceHash) throw failure(409, '项目来源或节点已变化，请重新预览');
      } });
      for (const [token, p] of edits) if (p.expires <= now()) edits.delete(token);
      edits.set(preview.previewId, { id, local, revision, expires: Date.parse(preview.expiresAt) });
      return preview;
    },
    async confirm(id, body) {
      const edit = edits.get(body?.previewId);
      if (isLocal(id)) { assertLocalLifecycle(db, 'project', id, edit?.revision); requireLocal(id); }
      const projects = isLocal(id) ? locals() : await read();
      const committed = changes.confirm('project-state', key(id), body);
      if (receipts.has(body.previewId)) return structuredClone(receipts.get(body.previewId));
      const project = projects.find(p => p.id === id);
      if (!project) throw failure(409, '项目已不在来源中');
      const receipt = apply(project, committed);
      if (receipts.size >= 100) receipts.delete(receipts.keys().next().value);
      receipts.set(body.previewId, structuredClone(receipt));
      return receipt;
    },
  };
}
