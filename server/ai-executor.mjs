// AI 接入（全局规则 P-13）：执行方、功能清单、对外开放、数据对象的唯一出处；设置页、接口、AGENTS.md 都照这里写。
// 执行方只走本机 CLI（用本机登录的订阅），不读写任何密钥。切换在下一次调用生效；正在跑的调用按开始时的执行方跑完。
import { spawn, execFile } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dataDir, getSettings } from './db.mjs';
import { failure } from './v3-common.mjs';
import { listAgents } from './agent-access.mjs';

export const AI_CALL_LOG = path.join(dataDir, 'logs', 'ai-calls.jsonl');
const LOCAL_CLI = '本机 CLI';

export const EXECUTORS = {
  codex: { id: 'codex', name: 'Codex', access: LOCAL_CLI, command: 'codex' },
  claude: { id: 'claude', name: 'Claude', access: LOCAL_CLI, command: 'claude' },
};
export const EXECUTOR_IDS = Object.keys(EXECUTORS);
export const DEFAULT_EXECUTOR = 'codex';

// 可切换的功能：经 ai-draft 生成文字，执行方按设置走。
export const AI_FEATURES = [
  { id: 'mentor-draft', name: '带教草稿', where: '带教（页面暂无入口，只有接口）', read: '管培生近 30 天飞书日志', write: '预览确认后存本地「带教草稿」' },
  { id: 'mentor-answer', name: '亚古兽回答提问', where: '带教页', read: '这条提问所在那天的日志', write: '只显示在回复框；你确认后才作为评论发到飞书' },
  { id: 'selftalk-weekly', name: '自言自语周汇总', where: '顶栏「自言自语」', read: '你和猛鬼兽一周的私聊文本', write: '预览确认后存本地「自言自语周汇总」' },
];
export const FEATURE_IDS = AI_FEATURES.map(f => f.id);

// 不能切换的功能：写明只支持哪家、为什么。
export const FIXED_FEATURES = [
  { id: 'agent-codex', name: 'Agent 页 Codex 助手', where: 'Agent 页', executor: 'Codex', access: LOCAL_CLI, read: '你输入的内容、助手知识库', write: '本机 Codex 会话线程', only: '仅支持 Codex', reason: '会话历史、切换会话、换模型都直接读写 Codex 的线程' },
  { id: 'agent-chatgpt', name: 'Agent 页 ChatGPT 助手', where: 'Agent 页', executor: 'ChatGPT 网页', access: '网页桥', read: '你输入的内容', write: 'ChatGPT 网页里的会话', only: '仅支持 ChatGPT 网页', reason: '收发都经浏览器里的 ChatGPT 页面（Chrome 插件配对）' },
];

export const OPENINGS = [{
  id: 'workdesk-mcp', name: 'workdesk MCP', access: 'MCP 开放',
  who: '持凭据的外部 agent（每个 agent 一个凭据，按工具授权）',
  read: '管培生名单与提问、项目列表、月度策略、策略事实底稿、提交状态',
  write: '只能新建「待确认」的月度策略提交；确认和拒绝只在策略页',
  off: '撤销凭据：node scripts/agent-token.mjs revoke <agent>（WORKDESK_DATA_DIR 指向正式数据目录）',
}];

export const DATA_OBJECTS = [
  { id: 'codex-sessions', name: 'Codex 会话导入', where: 'Agent 页「导入会话」', source: '读本机 Codex 会话列表，只导入你选的线程编号' },
  { id: 'codex-reset', name: 'Codex 重置提醒', where: '顶部重置条、猛鬼兽推送', source: 'aihot.news 公开接口；开关打开后经猛鬼兽机器人推送到飞书' },
];

const bad = message => { throw failure(400, message); };
export function validateAiSetting(key, value) {
  if (key === 'ai_default_executor') {
    if (!EXECUTOR_IDS.includes(value)) bad('默认执行方只能是 Codex 或 Claude');
    return value;
  }
  let parsed; try { parsed = JSON.parse(value || '{}'); } catch { bad('功能执行方须为 JSON 对象'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) bad('功能执行方须为 JSON 对象');
  const out = {};
  for (const [id, item] of Object.entries(parsed)) {
    if (!FEATURE_IDS.includes(id)) bad(`没有可切换的功能「${id}」`);
    const executor = item?.executor ?? 'default', backup = item?.backup ?? 'none';
    if (executor !== 'default' && !EXECUTOR_IDS.includes(executor)) bad('执行方只能是跟随默认、Codex 或 Claude');
    if (backup !== 'none' && !EXECUTOR_IDS.includes(backup)) bad('备用执行方只能是不设、Codex 或 Claude');
    if (backup !== 'none' && backup === executor) bad('备用执行方不能和执行方相同');
    if (executor !== 'default' || backup !== 'none') out[id] = { executor, backup };
  }
  return JSON.stringify(out);
}

// 功能当前的执行方与备用方。备用方和（跟随默认后的）执行方相同时等于没设。
export function resolveFeature(db, feature) {
  const meta = AI_FEATURES.find(f => f.id === feature);
  if (!meta) throw failure(500, `未登记的 AI 功能：${feature}`);
  const settings = getSettings(db);
  const fallback = EXECUTOR_IDS.includes(settings.ai_default_executor) ? settings.ai_default_executor : DEFAULT_EXECUTOR;
  let own = {}; try { own = JSON.parse(settings.ai_features || '{}')[feature] || {}; } catch {}
  const followsDefault = !EXECUTOR_IDS.includes(own.executor);
  const primary = followsDefault ? fallback : own.executor;
  const backup = EXECUTOR_IDS.includes(own.backup) && own.backup !== primary ? own.backup : null;
  return { meta, primary, backup, followsDefault, defaultExecutor: fallback };
}

// 执行方失败的原因：只用这四个词，界面和留痕都照写。
export class AiExecutorError extends Error {
  constructor(reason, detail = '') { super(`${reason}${detail ? `：${detail}` : ''}`); this.reason = reason; this.detail = detail; }
}
export function classify(message = '') {
  if (/ENOENT|not found|无法启动|未安装/i.test(message)) return '未安装';
  if (/not logged in|log ?in|authenticat|unauthori[sz]ed|401|未登录/i.test(message)) return '未登录';
  if (/usage limit|rate limit|quota|limit reached|exceeded|额度|429/i.test(message)) return '额度用尽';
  return '调用失败';
}

// —— 两个执行方的实现：都只产出纯文字，不开工具、不联网、不写文件 ——
export function codexExecutor(client) {
  return {
    ...EXECUTORS.codex,
    async run({ cwd, name, instructions, prompt, signal, onText }) {
      try {
        const selection = await client.selection();
        const threadId = await client.create({ cwd, name, instructions });
        await client.send(threadId, prompt, (kind, data) => { if (kind === 'delta' && typeof data.text === 'string') onText(data.itemId || 'answer', data.text); }, signal, selection);
        return { model: selection.model ?? null, effort: selection.effort ?? null, threadId };
      } catch (error) {
        if (signal?.aborted) throw error;
        throw new AiExecutorError(classify(error?.message));
      }
    },
  };
}

export const CLAUDE_ARGS = ['-p', '--output-format', 'json', '--tools', '', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence', '--disable-slash-commands'];
export function claudeExecutor({ spawnProcess = (args, cwd) => spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], shell: false }), timeout = 600000 } = {}) {
  return {
    ...EXECUTORS.claude,
    run({ cwd, instructions, prompt, signal, onText }) {
      return new Promise((resolve, reject) => {
        // 工作目录可能还没建（Codex 那边由 codex.mjs 先建）；不建的话 spawn 报 ENOENT，会被误判成「未安装」。
        let child; try { mkdirSync(cwd, { recursive: true }); child = spawnProcess([...CLAUDE_ARGS, '--system-prompt', instructions], cwd); } catch (e) { reject(new AiExecutorError(classify(e?.code || e?.message))); return; }
        let out = '', err = '', done = false;
        const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener?.('abort', abort); fn(); };
        const abort = () => { child.kill('SIGTERM'); finish(() => reject(Object.assign(new Error('已中止'), { name: 'AbortError' }))); };
        const timer = setTimeout(() => { child.kill('SIGTERM'); finish(() => reject(new AiExecutorError('调用失败', '超时'))); }, timeout);
        signal?.addEventListener?.('abort', abort);
        child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
        child.stdout.on('data', c => { out += c; }); child.stderr.on('data', c => { err += c; });
        child.on('error', e => finish(() => reject(new AiExecutorError(classify(e?.code || e?.message)))));
        child.on('close', code => finish(() => {
          let result; try { result = JSON.parse(out); } catch { reject(new AiExecutorError(classify(err), code ? `退出码 ${code}` : '')); return; }
          if (code || result.is_error || typeof result.result !== 'string') { reject(new AiExecutorError(classify(`${result.result || ''} ${err}`))); return; }
          onText('answer', result.result);
          resolve({ model: Object.keys(result.modelUsage || {})[0] ?? null, effort: null });
        }));
        child.stdin.on('error', () => {});
        child.stdin.end(prompt);
      });
    },
  };
}

// —— 可用状态：设置页读，结果缓存一分钟；只跑 --version 与登录状态，不调用模型 ——
const run = (cmd, args) => new Promise(resolve => execFile(cmd, args, { timeout: 15000 }, (error, stdout = '', stderr = '') => resolve({ error, stdout: String(stdout), stderr: String(stderr) })));
function codexModel() {
  try {
    const file = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml');
    if (!existsSync(file)) return null;
    const text = readFileSync(file, 'utf8'), model = text.match(/^model\s*=\s*"([^"]+)"/m)?.[1], effort = text.match(/^model_reasoning_effort\s*=\s*"([^"]+)"/m)?.[1];
    return model ? `${model}${effort ? ` · ${effort}` : ''}` : null;
  } catch { return null; }
}
export async function probeExecutor(id, exec = run) {
  const { command } = EXECUTORS[id];
  const version = await exec(command, ['--version']);
  if (version.error) return { state: version.error.code === 'ENOENT' ? '未安装' : '调用失败', version: null, login: null, model: null };
  const ver = version.stdout.trim().split('\n')[0] || null;
  if (id === 'codex') {
    const login = await exec('codex', ['login', 'status']), text = `${login.stdout}${login.stderr}`.trim();
    const ok = !login.error && /logged in/i.test(text) && !/not logged in/i.test(text);
    return { state: ok ? '可用' : '未登录', version: ver, login: ok ? text.replace(/^Logged in using /i, '已登录 · ') : '未登录', model: codexModel() ?? '本机默认' };
  }
  const login = await exec('claude', ['auth', 'status']);
  let info = null; try { info = JSON.parse(login.stdout); } catch {}
  const ok = Boolean(info?.loggedIn);
  return { state: ok ? '可用' : '未登录', version: ver, login: ok ? `已登录 · ${info.authMethod || ''}`.replace(/ · $/, '') : '未登录', model: '本机默认（调用后记下实际模型）' };
}

// —— 留痕：每次调用记一行（不记内容），设置页读最近一次 ——
export function logAiCall(line, file = AI_CALL_LOG) {
  try { mkdirSync(path.dirname(file), { recursive: true }); appendFileSync(file, JSON.stringify(line) + '\n'); } catch {}
}
export function readAiCalls(file = AI_CALL_LOG, limit = 500) {
  try { return readFileSync(file, 'utf8').trim().split('\n').slice(-limit).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}

export function createAiAccess(db, { probe = probeExecutor, now = Date.now, ttl = 60000, callLog = AI_CALL_LOG } = {}) {
  let cache = null;
  async function executors(refresh = false) {
    if (refresh || !cache || now() - cache.at > ttl) {
      const rows = await Promise.all(EXECUTOR_IDS.map(async id => ({ id, ...EXECUTORS[id], ...(await probe(id)) })));
      cache = { at: now(), rows };
    }
    const attempts = readAiCalls(callLog).flatMap(c => (c.attempts || []).map(a => ({ ...a, at: c.at })));
    return {
      checkedAt: new Date(cache.at).toISOString(),
      rows: cache.rows.map(row => {
        // 登录状态查不出额度；最近一小时内调用报过额度用尽，就如实标出来。
        const last = attempts.filter(a => a.executor === row.id).at(-1);
        const quota = row.state === '可用' && last?.reason === '额度用尽' && now() - Date.parse(last.at) < 3600000;
        const lastModel = attempts.filter(a => a.executor === row.id && a.ok && a.model).at(-1)?.model;
        return { ...row, ...(quota && { state: '额度用尽', stateAt: last.at }), ...(row.id === 'claude' && lastModel && { model: `${lastModel}（最近一次调用）` }) };
      }),
    };
  }
  return {
    async read({ refresh = false } = {}) {
      const ex = await executors(refresh), calls = readAiCalls(callLog);
      const settings = getSettings(db);
      return {
        defaultExecutor: resolveFeature(db, FEATURE_IDS[0]).defaultExecutor,
        saved: { ai_default_executor: settings.ai_default_executor ?? null, ai_features: settings.ai_features ?? null },
        checkedAt: ex.checkedAt,
        executors: [...ex.rows, { id: 'chatgpt-web', name: 'ChatGPT 网页', access: '网页桥', state: '见 Agent 页', version: 'Chrome 插件 niuma-collect', login: '插件配对码见「知识库收藏」', model: '跟随网页里选的模型', fixed: true }],
        features: AI_FEATURES.map(f => {
          const r = resolveFeature(db, f.id), last = calls.filter(c => c.feature === f.id).at(-1) || null;
          return { ...f, executor: r.primary, executorName: EXECUTORS[r.primary].name, followsDefault: r.followsDefault, backup: r.backup, backupName: r.backup ? EXECUTORS[r.backup].name : null, access: LOCAL_CLI, last };
        }),
        fixed: FIXED_FEATURES, dataObjects: DATA_OBJECTS,
        // 已签发的凭据：只列 agent、授权的工具和最近一次调用，凭据本身只存哈希，不显示。
        openings: OPENINGS.map(o => ({ ...o, agents: listAgents(db).map(a => ({ agent: a.agent, tools: a.tools, createdAt: a.createdAt, lastCallAt: db.prepare('SELECT MAX(at) AS at FROM agent_calls WHERE agent=?').get(a.agent)?.at ?? null })) })),
      };
    },
  };
}

// 一条产出的留痕：执行方、接入方式、模型、时间；转交过就写明原定执行方和原因。界面照这个对象显示。
export function aiTrace(result) {
  if (!result?.executor) return null;
  return { executor: result.executor, executorName: result.executorName, access: result.access, model: result.model ?? null, at: result.generatedAt, planned: result.planned ?? result.executor, plannedName: result.plannedName ?? result.executorName, handoff: result.handoff ?? null };
}
// 已保存的产出：新记录带完整留痕；本次改造前的旧记录只可能来自本机 Codex，按 Codex 补出留痕。
export function traceOf(record) {
  if (!record) return null;
  if (record.trace) return record.trace;
  return aiTrace(record) || (record.model ? { executor: 'codex', executorName: 'Codex', access: LOCAL_CLI, model: record.model, at: record.generatedAt ?? null, planned: 'codex', plannedName: 'Codex', handoff: null } : null);
}
