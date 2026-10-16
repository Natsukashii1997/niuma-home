import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getSettings } from './db.mjs';
import { createLocalChanges, fingerprint, getRecord } from './local-records.mjs';
import { failure, saveSnapshot } from './v3-common.mjs';

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
    if (detail?.subtype === 'permission_denied') throw failure(403, '当前 codex 用户无权读取此飞书资源');
    throw failure(502, '飞书读取失败，请检查 codex 用户登录、读取权限和网络');
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
export function createConfiguredReader(db, kind, config, read, { now = Date.now, ttl = 300_000, onSource } = {}) {
  let cache, inflight, failed;
  return async ({ refresh = false } = {}) => {
    const cfg = config(), identity = fingerprint(cfg), at = now();
    if (!refresh && failed?.identity === identity && at < failed.until) throw failed.error;
    if (!refresh && cache?.identity === identity && at - cache.at < ttl) return structuredClone(cache.value);
    if (inflight?.identity === identity) return structuredClone(await inflight.promise);
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
    return structuredClone(await promise);
  };
}

export function createProjectService(db, { readSource = readProjectSource, now = Date.now, ...options } = {}) {
  const config = () => { const s = getSettings(db); return { url: s.project_base_url || PROJECT_SOURCE.url, table: s.project_table_id || PROJECT_SOURCE.table }; };
  let latestProjects;
  const read = createConfiguredReader(db, 'projects', config, async cfg => { latestProjects = projectView(await readSource(cfg)); return latestProjects; }, { now, ...options });
  const changes = createLocalChanges(db, { now });
  const receipts = new Map();
  const identity = () => fingerprint(config());
  const key = id => `${identity()}:${id}`;
  function apply(project, saved) {
    const record = saved || getRecord(db, 'project-state', key(project.id));
    const overlay = n => ({ ...n, ...(record?.overrides[n.id] || {}), ...(record?.overrides[n.id]?.dueDate !== undefined ? { due: record.overrides[n.id].dueDate.slice(5) } : {}) });
    return { ...project, nodes: project.nodes.map(n => { const kids = n.childNodes?.map(overlay); return { ...overlay(n), ...(kids ? { childNodes: kids, kids: kids.map(k => [k.t, k.done]) } : {}) }; }) };
  }
  return {
    list: async options => (await read(options)).map(project => apply(project)),
    async preview(id, body) {
      const project = (await read()).find(p => p.id === id);
      if (!project) throw failure(404, '项目不存在');
      if (!body || typeof body.nodeId !== 'string' || !project.nodes.flatMap(n => [n, ...(n.childNodes || [])]).some(n => n.id === body.nodeId)) throw failure(400, '请选择有效项目节点');
      const patch = {};
      if ('done' in body) { if (typeof body.done !== 'boolean') throw failure(400, '完成状态须为布尔值'); patch.done = body.done; patch.statusKnown = true; }
      if ('due' in body) { if (body.due !== '' && !validDate(body.due)) throw failure(400, '截止日期须为完整 YYYY-MM-DD'); patch.dueDate = body.due; }
      if (!Object.keys(patch).length) throw failure(400, '没有可保存的节点变更');
      const sourceIdentity = identity(), recordKey = key(id), sourceHash = fingerprint(project);
      const current = getRecord(db, 'project-state', recordKey);
      const value = { sourceIdentity, projectId: id, overrides: { ...current?.overrides, [body.nodeId]: { ...current?.overrides?.[body.nodeId], ...patch } } };
      return changes.preview('project-state', recordKey, value, { validate: () => {
        if (identity() !== sourceIdentity || fingerprint(latestProjects?.find(p => p.id === id)) !== sourceHash) throw failure(409, '项目来源或节点已变化，请重新预览');
      } });
    },
    async confirm(id, body) {
      const projects = await read();
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
