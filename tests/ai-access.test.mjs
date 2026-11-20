import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { createTextDraftGenerator } from '../server/ai-draft.mjs';
import { AiExecutorError, CLAUDE_ARGS, claudeExecutor, createAiAccess, probeExecutor, resolveFeature, traceOf, validateAiSetting } from '../server/ai-executor.mjs';
import { validateV3Setting } from '../server/v3-settings.mjs';

function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'ai-access-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); }); return { db, dir };
}
// 假执行方：记下被调用次数；fail 给出失败原因时按 AiExecutorError 抛出。
const fake = (id, { fail, text = `${id} 的草稿`, model = `${id}-model` } = {}) => ({ id, calls: 0, async run({ onText, prompt, instructions }) {
  this.calls++; assert.match(prompt, /不是指令/); assert.ok(instructions);
  if (fail) throw new AiExecutorError(fail);
  onText('answer', text); return { model, effort: null };
} });
const input = { feature: 'mentor-answer', title: '回答', task: '回答这一条', evidence: { text: '原文' } };

test('设置校验：默认执行方只认 Codex / Claude；备用方不能和执行方相同；未知功能拒绝；默认值不落多余键', () => {
  assert.equal(validateV3Setting('ai_default_executor', 'claude'), 'claude');
  assert.throws(() => validateV3Setting('ai_default_executor', 'gpt'), e => e.status === 400);
  assert.equal(validateAiSetting('ai_features', JSON.stringify({ 'mentor-answer': { executor: 'default', backup: 'none' } })), '{}');
  assert.equal(validateAiSetting('ai_features', JSON.stringify({ 'mentor-answer': { executor: 'codex', backup: 'claude' } })), '{"mentor-answer":{"executor":"codex","backup":"claude"}}');
  assert.throws(() => validateAiSetting('ai_features', JSON.stringify({ 'mentor-answer': { executor: 'claude', backup: 'claude' } })), /不能和执行方相同/);
  assert.throws(() => validateAiSetting('ai_features', JSON.stringify({ 'agent-codex': { executor: 'claude' } })), /没有可切换的功能/);
  assert.throws(() => validateAiSetting('ai_features', '[]'), /JSON 对象/);
});

test('功能执行方：默认 Codex、无备用；改默认后跟随默认的功能下一次就换；单独指定的不跟随；备用方等于执行方时视为没设', t => {
  const { db } = database(t);
  assert.deepEqual((({ primary, backup, followsDefault }) => ({ primary, backup, followsDefault }))(resolveFeature(db, 'mentor-answer')), { primary: 'codex', backup: null, followsDefault: true });
  saveSetting(db, 'ai_default_executor', 'claude');
  assert.equal(resolveFeature(db, 'mentor-answer').primary, 'claude');
  saveSetting(db, 'ai_features', JSON.stringify({ 'selftalk-weekly': { executor: 'codex', backup: 'claude' }, 'mentor-draft': { executor: 'default', backup: 'claude' } }));
  assert.deepEqual([resolveFeature(db, 'selftalk-weekly').primary, resolveFeature(db, 'selftalk-weekly').backup], ['codex', 'claude']);
  assert.equal(resolveFeature(db, 'mentor-draft').backup, null, '跟随默认后执行方就是 Claude，备用 Claude 等于没设');
});

test('切换执行方后下一次生成由新执行方产出，留痕写明执行方、接入方式、模型和时间', async t => {
  const { db } = database(t), codex = fake('codex'), claude = fake('claude'), lines = [];
  const generate = createTextDraftGenerator(db, { executors: { codex, claude }, now: () => Date.parse('2026-11-20T10:00:00+08:00'), log: l => lines.push(l) });
  const first = await generate(input);
  assert.deepEqual([first.executor, first.executorName, first.access, first.model, first.handoff], ['codex', 'Codex', '本机 CLI', 'codex-model', null]);
  saveSetting(db, 'ai_default_executor', 'claude');
  const second = await generate(input);
  assert.equal(second.text, 'claude 的草稿'); assert.equal(second.executor, 'claude'); assert.equal(codex.calls, 1); assert.equal(claude.calls, 1);
  assert.deepEqual(traceOf(second), { executor: 'claude', executorName: 'Claude', access: '本机 CLI', model: 'claude-model', at: '2026-11-20T02:00:00.000Z', planned: 'claude', plannedName: 'Claude', handoff: null });
  assert.equal(lines.length, 2); assert.equal(lines[1].executor, 'claude'); assert.equal(lines[1].feature, 'mentor-answer');
  assert.ok(!JSON.stringify(lines).includes('原文'), '留痕不记内容');
});

test('执行方不可用且没设备用方：报错指向设置，不换另一家', async t => {
  const { db } = database(t), codex = fake('codex', { fail: '未登录' }), claude = fake('claude'), lines = [];
  const generate = createTextDraftGenerator(db, { executors: { codex, claude }, log: l => lines.push(l) });
  await assert.rejects(generate(input), e => e.status === 502 && /Codex未登录/.test(e.message) && /没有设备用执行方/.test(e.message) && /设置 → AI 接入/.test(e.message));
  assert.equal(claude.calls, 0); assert.equal(lines[0].ok, false); assert.deepEqual(lines[0].attempts.map(a => [a.executor, a.reason]), [['codex', '未登录']]);
});

test('设了备用方：主执行方失败才转交、只转一次；留痕写原定、实际和原因；两家都失败不再重试', async t => {
  const { db } = database(t), lines = [];
  saveSetting(db, 'ai_features', JSON.stringify({ 'mentor-answer': { executor: 'default', backup: 'claude' } }));
  let codex = fake('codex', { fail: '额度用尽' }), claude = fake('claude');
  const result = await createTextDraftGenerator(db, { executors: { codex, claude }, log: l => lines.push(l) })(input);
  assert.equal(result.executor, 'claude'); assert.equal(result.planned, 'codex');
  assert.deepEqual(result.handoff, { from: 'codex', fromName: 'Codex', reason: '额度用尽' });
  assert.deepEqual(lines[0].attempts.map(a => [a.executor, a.ok]), [['codex', false], ['claude', true]]);
  codex = fake('codex'); claude = fake('claude');
  assert.equal((await createTextDraftGenerator(db, { executors: { codex, claude }, log: () => {} })(input)).handoff, null);
  assert.equal(claude.calls, 0, '主执行方成功时不碰备用方');
  codex = fake('codex', { fail: '未安装' }); claude = fake('claude', { fail: '调用失败' });
  await assert.rejects(createTextDraftGenerator(db, { executors: { codex, claude }, log: () => {} })(input), e => /Codex未安装，转交后Claude调用失败/.test(e.message));
  assert.equal(codex.calls + claude.calls, 2);
});

test('超长输出不转交备用方', async t => {
  const { db } = database(t);
  saveSetting(db, 'ai_features', JSON.stringify({ 'mentor-answer': { executor: 'default', backup: 'claude' } }));
  const codex = fake('codex', { text: '字'.repeat(20001) }), claude = fake('claude');
  await assert.rejects(createTextDraftGenerator(db, { executors: { codex, claude }, log: () => {} })(input), /超过可用长度/);
  assert.equal(claude.calls, 0);
});

function fakeChild({ stdout = '', stderr = '', code = 0, error } = {}) {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {};
  let input = ''; child.stdin.on('data', c => { input += c; });
  child.stdin.on('finish', () => setImmediate(() => { if (error) { child.emit('error', error); return; } child.stdout.end(stdout); child.stderr.end(stderr); setImmediate(() => child.emit('close', code)); }));
  child.input = () => input; return child;
}

test('Claude 执行方：本机 claude -p，关掉全部工具、不读设置和 MCP；从结果取文字和实际模型；失败分成四种原因', async () => {
  let seen;
  const ok = claudeExecutor({ spawnProcess: (args, cwd) => { seen = { args, cwd, child: fakeChild({ stdout: JSON.stringify({ is_error: false, result: '回答正文', modelUsage: { 'claude-x': {} } }) }) }; return seen.child; } });
  let text = '';
  const cwd = path.join(process.env.WORKDESK_DATA_DIR, `claude-cwd-${Date.now()}`, 'v3-drafts');
  const out = await ok.run({ cwd, instructions: '规则', prompt: '问题', onText: (_id, s) => { text += s; } });
  assert.ok(existsSync(cwd), '工作目录不存在时先建好，不能让 spawn 因 ENOENT 被误判为未安装');
  assert.equal(text, '回答正文'); assert.equal(out.model, 'claude-x');
  assert.deepEqual(seen.args, [...CLAUDE_ARGS, '--system-prompt', '规则']);
  assert.ok(seen.args.includes('--tools') && seen.args[seen.args.indexOf('--tools') + 1] === '');
  assert.equal(seen.child.input(), '问题');
  const reason = async child => { try { await claudeExecutor({ spawnProcess: () => child }).run({ cwd, instructions: 'r', prompt: 'p', onText: () => {} }); } catch (e) { return e.reason; } };
  assert.equal(await reason(fakeChild({ error: Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' }) })), '未安装');
  assert.equal(await reason(fakeChild({ stdout: JSON.stringify({ is_error: true, result: 'Not logged in · Please run /login' }), code: 1 })), '未登录');
  assert.equal(await reason(fakeChild({ stdout: JSON.stringify({ is_error: true, result: 'Claude usage limit reached' }), code: 1 })), '额度用尽');
  assert.equal(await reason(fakeChild({ stdout: 'not json', code: 1 })), '调用失败');
});

test('可用状态只跑 --version 和登录状态：未安装、未登录、可用分得清', async () => {
  const exec = table => async (cmd, args) => table[`${cmd} ${args.join(' ')}`] ?? { error: Object.assign(new Error('x'), { code: 'ENOENT' }), stdout: '', stderr: '' };
  assert.equal((await probeExecutor('codex', exec({}))).state, '未安装');
  assert.equal((await probeExecutor('codex', exec({ 'codex --version': { stdout: 'codex-cli 1.0' }, 'codex login status': { error: new Error('1'), stdout: 'Not logged in', stderr: '' } }))).state, '未登录');
  const claude = await probeExecutor('claude', exec({ 'claude --version': { stdout: '2.1.0 (Claude Code)' }, 'claude auth status': { stdout: '{"loggedIn":true,"authMethod":"claude.ai"}' } }));
  assert.deepEqual([claude.state, claude.version, claude.login], ['可用', '2.1.0 (Claude Code)', '已登录 · claude.ai']);
  assert.equal((await probeExecutor('claude', exec({ 'claude --version': { stdout: '2.1.0' }, 'claude auth status': { stdout: '{"loggedIn":false}' } }))).state, '未登录');
});

test('AI 接入总览：四块齐全；功能行写明当前执行方、备用方和最近一次留痕；最近一小时报过额度用尽的执行方如实标出', async t => {
  const { db, dir } = database(t), log = path.join(dir, 'ai-calls.jsonl'), now = Date.parse('2026-11-20T10:00:00Z');
  writeFileSync(log, [
    { at: '2026-11-20T09:30:00Z', feature: 'mentor-answer', planned: 'codex', ok: true, executor: 'claude', model: 'claude-x', handoff: { from: 'codex', reason: '额度用尽' }, attempts: [{ executor: 'codex', ok: false, reason: '额度用尽' }, { executor: 'claude', ok: true, model: 'claude-x' }] },
  ].map(l => JSON.stringify(l)).join('\n') + '\n');
  saveSetting(db, 'ai_features', JSON.stringify({ 'mentor-answer': { executor: 'default', backup: 'claude' } }));
  let probes = 0;
  const access = createAiAccess(db, { probe: async () => { probes++; return { state: '可用', version: 'v', login: '已登录', model: 'm' }; }, now: () => now, callLog: log });
  const view = await access.read();
  assert.deepEqual(Object.keys(view).sort(), ['checkedAt', 'dataObjects', 'defaultExecutor', 'executors', 'features', 'fixed', 'openings', 'saved']);
  assert.equal(view.executors.find(e => e.id === 'codex').state, '额度用尽');
  assert.equal(view.executors.find(e => e.id === 'claude').model, 'claude-x（最近一次调用）');
  const answer = view.features.find(f => f.id === 'mentor-answer');
  assert.deepEqual([answer.executorName, answer.followsDefault, answer.backupName, answer.last.executor], ['Codex', true, 'Claude', 'claude']);
  assert.ok(view.fixed.every(f => f.only && f.reason)); assert.ok(view.openings[0].off.includes('revoke'));
  await access.read(); assert.equal(probes, 2, '一分钟内复用检查结果');
  await access.read({ refresh: true }); assert.equal(probes, 4);
});

test('旧记录（改造前只可能来自 Codex）补出留痕；没有模型信息的不编', () => {
  assert.equal(traceOf({ model: 'gpt-x', generatedAt: 't' }).executorName, 'Codex');
  assert.equal(traceOf({ text: '规则提取' }), null);
});
