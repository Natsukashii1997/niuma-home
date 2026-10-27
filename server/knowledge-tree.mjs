import { getSettings } from './db.mjs';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fingerprint, getRecord, putRecord } from './local-records.mjs';
import { beijingText, failure } from './v3-common.mjs';
import { recordSource } from './source-status.mjs';
import { createConfiguredReader, runLark } from './projects.mjs';
import { createKnowledgeCollectService } from './kb-collect.mjs';
import { LARK_APP_ID, LARK_PROFILE } from './lark-identity.mjs';

export const KB_SPACE = '7620758074885835965';
const textContent = value => value.replace(/<[^>]+>/g, ' ').replace(/!\[[^\]]*\]\([^)]+\)/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^[#>*\-\s]+/gm, '').replace(/[`*_]/g, '').replace(/\s+/g, ' ').trim();

export async function readKnowledgeDirectory({ spaceId }, { run } = {}) {
  const nodes = [], seen = new Set(), queue = [''];
  while (queue.length) {
    const parent = queue.shift(), cursors = new Set(); let cursor = '';
    do {
      const page = await runLark(['wiki', '+node-list', '--space-id', spaceId, ...(parent ? ['--parent-node-token', parent] : []), ...(cursor ? ['--page-token', cursor] : [])], run);
      if (!Array.isArray(page.nodes) || typeof page.has_more !== 'boolean') throw failure(502, '知识库目录返回不完整');
      for (const node of page.nodes) {
        if (!/^[a-zA-Z0-9]+$/.test(node.node_token || '') || !node.obj_token || node.space_id !== spaceId || (node.parent_node_token || '') !== parent || seen.has(node.node_token) || typeof node.title !== 'string' || typeof node.has_child !== 'boolean') throw failure(502, '知识库节点身份或父子关系异常');
        seen.add(node.node_token); nodes.push(node); if (node.has_child) queue.push(node.node_token);
      }
      if (nodes.length > 2000) throw failure(502, '知识库超过本轮读取上限，不能验证完整目录');
      cursor = page.has_more ? page.page_token : '';
      if (page.has_more && (!cursor || cursors.has(cursor))) throw failure(502, '知识库分页游标无效');
      cursors.add(cursor);
    } while (cursor);
  }
  return nodes;
}

export async function readKnowledgeSource({ spaceId }, { run, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let cooldown = 0;
  const read = async args => {
    for (let attempt = 0; ; attempt++) {
      if (cooldown > Date.now()) await wait(cooldown - Date.now());
      try { return await runLark(args, run); }
      catch (error) {
        if (error.status !== 429 || attempt >= 2) throw error;
        const delay = (error.retryAfterMs || 3000) * 2 ** attempt;
        cooldown = Math.max(cooldown, Date.now() + delay);
        await wait(delay);
      }
    }
  };
  const { space } = await read(['wiki', 'spaces', 'get', '--space-id', spaceId, '--lang', 'zh']);
  if (space?.space_id !== spaceId || typeof space.name !== 'string' || !space.name.trim()) throw failure(502, '知识库空间身份或名称不完整');
  const nodes = [], seen = new Set(), queue = [''];
  while (queue.length) {
    const parent = queue.shift();
    let pageToken = '', cursors = new Set();
    do {
      const page = await read(['wiki', '+node-list', '--space-id', spaceId, ...(parent ? ['--parent-node-token', parent] : []), ...(pageToken ? ['--page-token', pageToken] : [])]);
      if (!Array.isArray(page.nodes) || typeof page.has_more !== 'boolean') throw failure(502, '知识库目录返回不完整');
      for (const n of page.nodes) {
        if (!n.node_token || !n.obj_token || n.space_id !== spaceId || (n.parent_node_token || '') !== parent || seen.has(n.node_token) || typeof n.has_child !== 'boolean') throw failure(502, '知识库节点身份或父子关系异常');
        seen.add(n.node_token); nodes.push(n);
        if (n.has_child) queue.push(n.node_token);
      }
      if (nodes.length > 2000) throw failure(502, '知识库超过本轮读取上限2000节点，未保存不完整目录');
      pageToken = page.has_more ? page.page_token : '';
      if (page.has_more && (!pageToken || cursors.has(pageToken))) throw failure(502, '知识库分页游标无效');
      cursors.add(pageToken);
    } while (pageToken);
  }
  const metadata = new Map(), errors = new Map();
  for (let i = 0; i < nodes.length; i += 200) {
    const batch = nodes.slice(i, i + 200);
    const result = await read(['drive', 'metas', 'batch_query', '--data', JSON.stringify({ request_docs: batch.map(n => ({ doc_token: n.obj_token, doc_type: n.obj_type })), with_url: true })]);
    if (!Array.isArray(result.metas)) throw failure(502, '知识库文档元数据未完整返回');
    for (const meta of result.metas) metadata.set(meta.doc_token, meta);
    for (const n of batch) if (!metadata.has(n.obj_token)) errors.set(n.node_token, '无权读取文档元数据或来源已删除');
  }
  const contents = new Map();
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(2, nodes.length) }, async () => {
    while (cursor < nodes.length) {
      const n = nodes[cursor++];
      if (n.obj_type !== 'docx') { errors.set(n.node_token, `${n.obj_type} 正文暂不支持字数、摘要及相似度读取`); continue; }
      try {
        const result = await read(['docs', '+fetch', '--doc', n.obj_token, '--doc-format', 'markdown']);
        if (typeof result.document?.content !== 'string') throw failure(502, '文档正文缺失');
        contents.set(n.node_token, textContent(result.document.content));
      } catch (error) { errors.set(n.node_token, error.message); }
    }
  }));
  return { space: { space_id: space.space_id, name: space.name }, nodes, metadata: Object.fromEntries(metadata), contents: Object.fromEntries(contents), errors: Object.fromEntries(errors) };
}

const normalizeTitle = value => value.toLowerCase().replace(/（副本）|\(副本\)|副本|copy/gi, '').replace(/[\s\p{P}\p{S}]/gu, '');
function similar(a, b) {
  if (!a || !b || a.length < 40 || b.length < 40 || Math.min(a.length, b.length) / Math.max(a.length, b.length) < 0.9) return false;
  if (a === b) return true;
  const grams = value => {
    const result = new Set(), step = Math.max(1, Math.ceil((value.length - 2) / 20000));
    for (let i = 0; i < value.length - 2; i += step) result.add(value.slice(i, i + 3));
    return result;
  };
  const aa = grams(a), bb = grams(b), same = [...aa].filter(g => bb.has(g)).length;
  return same / (aa.size + bb.size - same) >= 0.92;
}
export function knowledgeView(source, now = Date.now(), refs = {}) {
  const map = new Map(), docs = {};
  for (const n of source.nodes) {
    if (map.has(n.node_token)) throw failure(502, '知识库节点标识重复');
    map.set(n.node_token, { id: n.node_token, name: n.title, ...(n.has_child ? { kids: [] } : { file: true }) });
    const meta = source.metadata[n.obj_token], content = source.contents[n.node_token];
    const modified = Number(meta?.latest_modify_time);
    const error = source.errors[n.node_token] || (!Number.isFinite(modified) || modified <= 0 ? '修改时间不可用' : undefined);
    docs[n.node_token] = { updated: Number.isFinite(modified) && modified > 0 ? beijingText(modified * 1000).slice(0, 10) : null, chars: typeof content === 'string' ? [...content].length : null, tags: [], excerpt: typeof content === 'string' ? [...content].slice(0, 100).join('') : '', refs: refs[n.node_token] || [], referencesComplete: false, type: n.obj_type, shortcut: n.node_type === 'shortcut', url: meta?.url || null, ...(error ? { error } : {}) };
  }
  const tree = [];
  for (const n of source.nodes) {
    if (!n.parent_node_token) tree.push(map.get(n.node_token));
    else {
      const parent = map.get(n.parent_node_token);
      if (!parent?.kids) throw failure(502, '知识库父目录缺失');
      parent.kids.push(map.get(n.node_token));
    }
  }
  const visited = new Set();
  const walk = nodes => { for (const n of nodes) { if (visited.has(n.id)) throw failure(502, '知识库目录存在循环'); visited.add(n.id); if (n.kids) walk(n.kids); } };
  walk(tree);
  if (visited.size !== map.size) throw failure(502, '知识库存在未连接的目录节点');
  for (let i = 0; i < source.nodes.length; i++) for (let j = 0; j < i; j++) {
    const a = source.nodes[i], b = source.nodes[j];
    if (normalizeTitle(a.title) && normalizeTitle(a.title) === normalizeTitle(b.title) && similar(source.contents[a.node_token], source.contents[b.node_token])) { docs[a.node_token].dupOf = b.node_token; break; }
  }
  const failed = source.nodes.filter(n => n.obj_type === 'docx' && docs[n.node_token].error);
  return { space: source.space?.name || '飞书知识库', spaceId: source.space?.space_id || null, readAt: beijingText(now).slice(5), tree, docs, rules: [], scopeNote: '引用只核对工作台已登记来源；未登记不表示没有引用。目录节点本身可能包含正文。', limitations: [...new Set(Object.values(source.errors))], ...(failed.length ? { sourceError: `${failed.length}篇文档详情未完整读取` } : {}) };
}

const rowsOfTree = tree => {
  const rows = [];
  const walk = (nodes, parentId = '') => nodes.forEach(n => { rows.push({ id: n.id, name: n.name, parentId }); if (n.kids) walk(n.kids, n.id); });
  walk(tree); return rows.sort((a,b) => a.id.localeCompare(b.id));
};
const rowsOfDirectory = (nodes, spaceId) => {
  const ids = new Set();
  const rows = nodes.map(n => {
    if (n.space_id !== spaceId || !/^[a-zA-Z0-9]+$/.test(n.node_token || '') || ids.has(n.node_token) || typeof n.title !== 'string') throw failure(502, '目录节点不属于确认的知识空间');
    ids.add(n.node_token); return { id:n.node_token, name:n.title, parentId:n.parent_node_token || '' };
  });
  for (const n of rows) {
    const visited = new Set([n.id]); let parent = n.parentId;
    while (parent) { if (!ids.has(parent) || visited.has(parent)) throw failure(502, '目录父节点缺失或存在循环'); visited.add(parent); parent = rows.find(row => row.id === parent).parentId; }
  }
  return rows.sort((a,b) => a.id.localeCompare(b.id));
};
const treeOfRows = rows => {
  const mapped = new Map(rows.map(n => [n.id,{id:n.id,name:n.name,kids:[]}])), tree = [];
  for (const n of rows) (n.parentId ? mapped.get(n.parentId).kids : tree).push(mapped.get(n.id));
  for (const n of mapped.values()) if (!n.kids.length) { delete n.kids; n.file = true; }
  return tree;
};

// 预览本身始终只读；确认接口只执行此处生成并持久化的允许操作。
export function previewKnowledgeChanges(kb, body) {
  if (!body || !Array.isArray(body.ops) || !body.ops.length || body.ops.length > 100) throw failure(400, '请提供1至100项目录变更');
  const nodes = new Map();
  const collect = (tree, parentId = '') => tree.forEach(n => { nodes.set(n.id, { id: n.id, name: n.name, parentId }); if (n.kids) collect(n.kids, n.id); });
  collect(kb.tree);
  const plan = [];
  const title = name => { if (typeof name !== 'string' || !name.trim() || name.length > 200) throw failure(400, '目录或文档名称须为1至200字'); return name.trim(); };
  for (const op of body.ops) {
    if (!op || !['move', 'rename', 'mkdir'].includes(op.type)) throw failure(400, '仅支持当前知识空间内移动、重命名、新建目录的预览');
    if (op.type === 'move' && typeof op.parentId !== 'string') throw failure(400, '移动操作必须提供目标父节点ID，不能只用目录名');
    if (Object.keys(op).some(key => !['type','id','name','parentId'].includes(key))) throw failure(400, '仅支持当前知识空间内移动、重命名、新建目录的预览');
    if (op.type === 'mkdir') {
      if (typeof op.id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(op.id) || nodes.has(op.id)) throw failure(400, '新目录须使用未重复的临时标识（字母开头）');
      if (typeof op.parentId !== 'string' || op.parentId && !nodes.has(op.parentId)) throw failure(400, '新目录必须提供有效父节点ID，根目录用空字符串');
      const next = { id: op.id, name: title(op.name), parentId: op.parentId };
      nodes.set(op.id, next); plan.push({ type: op.type, ...next }); continue;
    }
    const n = nodes.get(op.id);
    if (!n) throw failure(400, '目标文档不在当前知识库');
    if (op.type === 'rename') { const name = title(op.name); plan.push({ type: op.type, id: op.id, before: n.name, name }); n.name = name; continue; }
    if (typeof op.parentId !== 'string' || op.parentId && !nodes.has(op.parentId)) throw failure(400, '移动操作必须提供目标父节点ID，不能只用目录名');
    let ancestor = op.parentId;
    while (ancestor) { if (ancestor === op.id) throw failure(400, '不能将节点移动到自身或子节点中'); ancestor = nodes.get(ancestor).parentId; }
    plan.push({ type: op.type, id: op.id, before: n.parentId, parentId: op.parentId }); n.parentId = op.parentId;
  }
  return { sourceVersion: fingerprint(rowsOfTree(kb.tree)), operations: plan, writeEnabled: false, requiresConfirmation: true, note: '预览不会写入。确认后逐项执行并回读；新目录是可挂子节点的空docx节点。只限当前知识空间，不删除、复制或修改权限。' };
}

const activeWrites = new Set();
const execute = promisify(execFile);
async function assertWriterIdentity(run = execute) {
  let identity;
  try {
    // whoami 返回根对象，不支持普通资源命令的 --format json 信封。
    const {stdout}=await run('lark-cli',['--profile',LARK_PROFILE,'--as','user','whoami'],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024,shell:false});
    identity=JSON.parse(stdout);
  } catch { throw failure(403,'无法核验猛鬼兽用户身份，请先检查本机登录状态'); }
  if(identity.profile!==LARK_PROFILE||identity.appId!==LARK_APP_ID||identity.identity!=='user')throw failure(403,'知识库写入仅允许猛鬼兽用户身份');
}
const operationKind = 'kb-operation', lockKind = 'kb-write-lock';
// 结果未核实：带错误码和操作编号，前端据此锁住页面并只读核对，不靠文案判断。
const unknownWrite = operationId => Object.assign(failure(409, '知识库操作结果尚未核实，已锁定重复写入；请先查看操作记录并只读核对，不能重新发送'), { code: 'KB_RESULT_UNKNOWN', ...(operationId ? { receipt: { operationId, status: 'unknown' } } : {}) });
const publicOperation = p => p.receipt || { operationId:p.id, spaceId:p.spaceId, state:p.state, completed:p.completed, total:p.operations.length, requiresReconciliation:['writing','unknown','checking','verified'].includes(p.state), error:p.error || null };
const ownerAlive = p => {
  if (activeWrites.has(p.id)) return true;
  if (p.ownerPid === process.pid) return false;
  if (!Number.isInteger(p.ownerPid) || p.ownerPid <= 0) return false;
  try { process.kill(p.ownerPid,0); return true; } catch(error) { return error.code !== 'ESRCH'; }
};

export async function writeKnowledgeOperation(spaceId, op, { run } = {}) {
  let result;
  if (op.type === 'mkdir') {
    result = await runLark(['wiki','+node-create','--space-id',spaceId,'--node-type','origin','--obj-type','docx','--title',op.name,...(op.parentId ? ['--parent-node-token',op.parentId] : [])],run);
    if (result.resolved_space_id !== spaceId || !/^[a-zA-Z0-9]+$/.test(result.node_token || '') || !result.obj_token || result.obj_type !== 'docx' || result.node_type !== 'origin' || result.title !== op.name) throw failure(502,'新目录返回身份不完整');
    return { nodeId:result.node_token };
  }
  if (op.type === 'move') {
    result = await runLark(['wiki','+move','--node-token',op.id,'--source-space-id',spaceId,'--target-space-id',spaceId,...(op.parentId ? ['--target-parent-token',op.parentId] : [])],run);
    if (result.mode !== 'node' || result.node_token !== op.id || result.space_id !== spaceId || result.source_space_id !== spaceId || result.target_space_id !== spaceId || (result.parent_node_token || '') !== op.parentId) throw failure(502,'移动返回身份不一致');
  } else if (op.type === 'rename') {
    result = await runLark(['drive','+update-title','--token',op.id,'--type','wiki','--title',op.name],run);
    if (result.updated !== true || result.file_token !== op.id || result.type !== 'wiki' || result.title !== op.name) throw failure(502,'重命名返回身份不一致');
  } else throw failure(400,'不允许的知识库写入');
  return { nodeId:op.id };
}

export function createKnowledgeTreeService(db, { now = Date.now, readSource = readKnowledgeSource, readDirectory = readKnowledgeDirectory, run, onSource, ...options } = {}) {
  const collect = createKnowledgeCollectService(db, { now, run, readDirectory, assertWriterIdentity, activeWrites, ownerAlive });
  const config = () => { const spaceId = getSettings(db).kb_space_id || KB_SPACE; if (!/^\d+$/.test(spaceId)) throw failure(400, '知识库空间ID无效'); return { spaceId }; };
  const read = createConfiguredReader(db, 'kb', config, async cfg => {
    const source = await readSource(cfg, { run }), refs = {};
    const settings = getSettings(db);
    const agents = db.prepare('SELECT id,name,instructions FROM assistants').all();
    const knowledge = db.prepare("SELECT kind,payload FROM v3_documents WHERE kind LIKE 'assistant-knowledge:%'").all().map(row => ({ assistantId: row.kind.slice('assistant-knowledge:'.length), value: JSON.parse(row.payload) }));
    for (const node of source.nodes) {
      const mentions = value => typeof value === 'string' && (value.includes(`/wiki/${node.node_token}`) || value.includes(`/docx/${node.obj_token}`));
      refs[node.node_token] = [...new Set([
        ...Object.entries(settings).filter(([, value]) => mentions(value)).map(([key]) => `设置：${key}`),
        ...agents.filter(agent => mentions(agent.instructions)).map(agent => `${agent.name} · 指令`),
        ...knowledge.filter(entry => mentions(entry.value.body)).map(entry => `${agents.find(agent => String(agent.id) === entry.assistantId)?.name || '已登记Agent'} · 知识库`),
      ])];
    }
    return knowledgeView(source, now(), refs);
  }, { now, ...options, onSource: event => { recordSource(db, 'kb', event); onSource?.(event); } });
  let needsRefresh = false;
  const save = p => putRecord(db,operationKind,p.id,p,now());
  const load = id => { const p = getRecord(db,operationKind,id); if (!p) throw failure(404,'知识库操作记录不存在'); return p; };
  const sameSpace = p => { if (config().spaceId !== p.spaceId) throw failure(409,'知识库配置已变化，请切回原空间核对或重新预览'); };
  const directory = async p => { sameSpace(p); const nodes = await readDirectory({spaceId:p.spaceId},{run}); sameSpace(p); return rowsOfDirectory(nodes,p.spaceId); };
  const finish = (p,state,rows = p.expectedRows) => {
    const mapped=id=>Object.hasOwn(p.created,id)?p.created[id]:id;
    const remaining=p.operations.slice(p.cursor).map(({before,...op})=>({...op,id:mapped(op.id),...('parentId' in op?{parentId:mapped(op.parentId)}:{})}));
    p.state=state; p.receipt={operationId:p.id,spaceId:p.spaceId,state,completed:p.completed,remaining,created:p.created,tree:treeOfRows(rows),verifiedAt:new Date(now()).toISOString()};
    db.exec('BEGIN IMMEDIATE');
    try { save(p); if (getRecord(db,lockKind,p.spaceId)?.operationId === p.id) db.prepare('DELETE FROM v3_documents WHERE kind=? AND id=?').run(lockKind,p.spaceId); db.exec('COMMIT'); }
    catch(error) { db.exec('ROLLBACK'); throw error; }
    needsRefresh=true; return structuredClone(p.receipt);
  };
  const expectedAfter = (p, flight) => {
    const rows=structuredClone(p.expectedRows),op=flight.operation;
    if (op.type==='mkdir') {
      const id=flight.result?.nodeId; if (!id || rows.some(n=>n.id===id)) throw unknownWrite();
      rows.push({id,name:op.name,parentId:op.parentId});
    } else {
      const n=rows.find(n=>n.id===op.id); if (!n) throw unknownWrite();
      if(op.type==='rename')n.name=op.name;else n.parentId=op.parentId;
    }
    return rows.sort((a,b)=>a.id.localeCompare(b.id));
  };
  const verifiedStep = (p,rows) => {
    const flight=p.inFlight,expected=expectedAfter(p,flight);
    if(fingerprint(rows)!==fingerprint(expected))throw unknownWrite();
    if(flight.operation.type==='mkdir')p.created[flight.originalId]=flight.result.nodeId;
    p.completed.push({index:p.cursor,...flight.operation,nodeId:flight.result?.nodeId || flight.operation.id,...(flight.result?.confirmedObservation?{verifiedByUserObservation:true}:{})});
    p.cursor++;p.expectedRows=rows;p.inFlight=null;p.state='verified';save(p);
  };
  return {
    collect: collect.collect, recentCollections: collect.recent, collectPairing: collect.pairing,
    list: async opts => { const value=await read({...opts,refresh:needsRefresh || opts?.refresh});needsRefresh=false;return value; },
    async preview(body) {
      const spaceId=config().spaceId,kb=await read({refresh:true});
      if(config().spaceId!==spaceId)throw failure(409,'读取期间知识库配置已变化');
      const plan=previewKnowledgeChanges(kb,body),id=randomUUID(),expiresAt=new Date(now()+600000).toISOString();
      const lock=getRecord(db,lockKind,spaceId);if(lock)throw unknownWrite(lock.operationId);
      save({id,spaceId,state:'preview',expiresAt,sourceVersion:plan.sourceVersion,operations:plan.operations,expectedRows:rowsOfTree(kb.tree),cursor:0,completed:[],created:{}});
      return {...plan,previewId:id,spaceId,expiresAt,confirmationEndpoint:'/api/v3/kb/confirm'};
    },
    // 画布「拖完即写」（用户 2026-10-18）：每次一项移动 / 重命名 / 新建目录。只读目录结构生成计划（不读正文，约 5 秒），
    // 然后走同一条确认路径：写锁、身份核验、目录指纹、逐项写入、回读核对、结果不明锁住。
    async quick(body) {
      if (!Array.isArray(body?.ops) || body.ops.length !== 1) throw failure(400,'画布每次只写一项变更');
      const spaceId=config().spaceId, rows=rowsOfDirectory(await readDirectory({spaceId},{run}),spaceId);
      if(config().spaceId!==spaceId)throw failure(409,'读取期间知识库配置已变化');
      const lock=getRecord(db,lockKind,spaceId);if(lock)throw unknownWrite(lock.operationId);
      const plan=previewKnowledgeChanges({tree:treeOfRows(rows)},body),id=randomUUID();
      save({id,spaceId,state:'preview',origin:'canvas',expiresAt:new Date(now()+600000).toISOString(),sourceVersion:plan.sourceVersion,operations:plan.operations,expectedRows:rows,cursor:0,completed:[],created:{}});
      return this.confirm({previewId:id,confirm:true});
    },
    // 画布分组顺序：只存本机，不写飞书（飞书接口不支持调整同级顺序）。
    layout: () => getRecord(db,'kb-canvas','layout') || { order: [] },
    saveLayout(body) {
      const order=body?.order;
      if(!Array.isArray(order)||order.length>200||order.some(id=>typeof id!=='string'||!/^[A-Za-z0-9]{1,80}$/.test(id))||new Set(order).size!==order.length)throw failure(400,'分组顺序须为不重复的节点ID列表');
      putRecord(db,'kb-canvas','layout',{order},now());return {order};
    },
    status: id => { const p=load(id); return p.type==='collect'?collect.status(p):publicOperation(p); },
    async confirm(body) {
      if(body?.confirm!==true || typeof body.previewId!=='string')throw failure(400,'请先预览，再明确确认知识库操作');
      let p=load(body.previewId);if(p.receipt)return structuredClone(p.receipt);sameSpace(p);
      if(p.state!=='preview')throw unknownWrite(p.id);
      if(Date.parse(p.expiresAt)<=now())throw failure(409,'知识库预览已过期，请重新预览');
      db.exec('BEGIN IMMEDIATE');
      try {
        p=load(body.previewId);if(p.state!=='preview'||getRecord(db,lockKind,p.spaceId))throw unknownWrite(getRecord(db,lockKind,p.spaceId)?.operationId||p.id);
        p.state='checking';p.ownerPid=process.pid;save(p);putRecord(db,lockKind,p.spaceId,{operationId:p.id},now());db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      activeWrites.add(p.id);
      let attemptedWrite=false;
      try {
        await assertWriterIdentity(run);
        let rows=await directory(p);
        if(fingerprint(rows)!==p.sourceVersion)throw failure(409,'知识库目录已变化，请重新预览');
        for(;p.cursor<p.operations.length;){
          sameSpace(p);
          await assertWriterIdentity(run);sameSpace(p);
          const mapped=id=>Object.hasOwn(p.created,id)?p.created[id]:id;
          const original=p.operations[p.cursor],op={...original,id:mapped(original.id),...('parentId' in original?{parentId:mapped(original.parentId)}:{})};
          p.inFlight={originalId:original.id,operation:op};p.state='writing';save(p);needsRefresh=true;
          attemptedWrite=true;
          p.inFlight.result=await writeKnowledgeOperation(p.spaceId,op,{run});save(p);
          rows=await directory(p);verifiedStep(p,rows);
          attemptedWrite=false;
        }
        return finish(p,'verified',rows);
      }catch(error){
        // 飞书在执行前就拒绝了授权：确定没有写入，按没执行处理，不锁。
        if(attemptedWrite&&error.rejected&&!p.inFlight?.result)attemptedWrite=false;
        if(attemptedWrite){p.state='unknown';p.error='写入或回读结果尚未核实；请只读核对操作记录，禁止重发。';save(p);throw unknownWrite(p.id);}
        p.inFlight=null;
        p.error=error.status?error.message:'知识库执行前核验失败';finish(p,p.cursor?'partial':'aborted');throw error;
      }finally{activeWrites.delete(p.id);}
    },
    async reconcile(id,body={}) {
      const p=load(id);if(p.type==='collect')return collect.reconcile(id);
      if(p.receipt)return structuredClone(p.receipt);sameSpace(p);
      if(p.state==='preview')return publicOperation(p);
      if(p.state!=='unknown'&&ownerAlive(p)||activeWrites.has(p.id))throw failure(409,'知识库确认仍在进行，请等待当前请求结束');
      if(p.inFlight){
        // 创建响应丢失时只接受用户明确核对的节点ID，绝不按同名猜测或重新创建。
        if(p.inFlight.operation.type==='mkdir'&&!p.inFlight.result&&body.confirmObserved===true&&/^[A-Za-z0-9]+$/.test(body.nodeId||'')&&!p.expectedRows.some(n=>n.id===body.nodeId)){
          const observed=await runLark(['wiki','+node-get','--node-token',body.nodeId,'--space-id',p.spaceId],run);
          const op=p.inFlight.operation;
          if(observed.space_id!==p.spaceId||observed.node_token!==body.nodeId||observed.obj_type!=='docx'||observed.node_type!=='origin'||observed.title!==op.name||(observed.parent_node_token||'')!==op.parentId)throw unknownWrite(p.id);
          p.inFlight.result={nodeId:body.nodeId,confirmedObservation:true};save(p);
        }
        const rows=await directory(p).catch(()=>null);
        // 移动 / 改名：目录与写入前完全一致，说明这一项没有执行，放行（不重发，由用户决定是否再做一次）。新建目录不适用。
        if(rows&&p.inFlight.operation.type!=='mkdir'&&!p.inFlight.result&&fingerprint(rows)===fingerprint(p.expectedRows)){p.inFlight=null;p.error='核对：飞书目录与写入前一致，这一项没有执行';save(p);return finish(p,p.cursor?'partial':'aborted',rows);}
        try{if(!rows)throw unknownWrite();verifiedStep(p,rows);}catch{p.state='unknown';p.error='仍无法按原节点身份和完整目录核实结果，保持写入锁；不自动重试。';save(p);throw unknownWrite(p.id);}
      }
      return finish(p,p.cursor===p.operations.length?'verified':p.cursor?'partial':'aborted');
    },
  };
}
