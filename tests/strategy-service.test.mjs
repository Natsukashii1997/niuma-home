// 月度用户策略批 1·1b-2：事实、提交、确认、拒绝、版本、背景卡（docs/策略规则/03 第 4、7 节；07；反例见 09）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { openDb } from '../server/db.mjs';
import { match } from '../server/http.mjs';
import { parseTimeline, REGION_SHEETS } from '../server/timeline.mjs';
import { createStrategyService } from '../server/strategy-service.mjs';
import { agentRoutes } from '../server/routes/agent.mjs';
import { issueAgentToken } from '../server/agent-access.mjs';
import { fingerprint } from '../server/local-records.mjs';

const COLS = 'ABCDEFGH'.split('');
const sheet = rows => ({ name: REGION_SHEETS[1], cols: COLS, rows: rows.map((values, i) => ({ row: i + 1, values })) });
const TIMELINE = { ...parseTimeline([sheet([['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.7'], ['爱丁堡大学 UoE', '2027.9.20']])], '2026-11-08 10:00'), years: [{ year: 2026 }] };

function setup(timeline = TIMELINE) {
  const db = openDb(mkdtempSync(path.join(tmpdir(), 'strategy-')));
  let clock = Date.parse('2026-11-08T02:00:00Z');
  const state = { timeline };
  const strategy = createStrategyService(db, { readTimeline: async () => state.timeline, now: () => (clock += 1000) });
  return { db, strategy, state };
}
// 按当前事实拼一份合法文档：英国一个情境、一条任务、一条 unknown 障碍。
async function docFor(strategy, month = '2026-12', patch = d => d) {
  const f = await strategy.facts(month);
  const ev = f.evidence.find(e => e.school.startsWith('伦敦'));
  const regions = ['uk', 'us', 'hk', 'au', 'ca', 'other'].map(key => ({ key, priority: { value: '平稳', default: '平稳', reason: '' },
    activity: { value: f.coverage[key].value, status: f.coverage[key].status, ratio: f.coverage[key].ratio }, scenarios: key === 'uk' ? ['SCN-2026-12-uk-01'] : [], emptyReason: key === 'uk' ? null : '当前没有足够证据形成独立情境' }));
  const doc = { schemaVersion: '2.1', month, brief: { judgement: { text: '英国 Final 前复习', claims: ['CLM-2026-12-1'] }, common: [], diff: [], external: [] }, regions,
    scenarios: [{ id: 'SCN-2026-12-uk-01', region: 'uk', countries: ['uk'], academicStage: 'undergraduate', phase: 'Term 1 结课', keyTask: 'Final 复习', targetRelation: '新签', observedRelation: { value: 'unknown', evidenceRefs: [] }, evidenceRefs: [ev.evidenceId] }],
    claims: [
      { id: 'CLM-2026-12-1', scenario: 'SCN-2026-12-uk-01', claimType: 'task', text: '12 月上旬进入 Final', status: 'inferred', evidenceStrength: 'partial', evidenceRefs: [ev.evidenceId], refVersions: { [ev.evidenceId]: ev.evidenceVersion }, limitations: '原表日期未核实', origin: 'skill' },
      { id: 'CLM-2026-12-2', scenario: 'SCN-2026-12-uk-01', claimType: 'barrier', text: '可能觉得还来得及', status: 'unknown', evidenceStrength: 'none', gap: '缺少用户决策行为证据', route: { status: 'available', source: 'SRC-bizcard' }, barrierCode: 'BR-M2', targetRelation: '新签', barrierRole: 'primary', origin: 'skill' },
    ], opportunities: [], strategies: [], research: { rejected: [], assumptions: [], notes: [] } };
  return { doc: patch(doc), f };
}
const submit = async (strategy, doc, f, key = 'k1', agent = 'claude-skill') => strategy.submit({ month: doc.month, document: doc, idempotencyKey: key, baseRevision: f.baseRevision, inputFingerprint: f.inputFingerprint, declared: { executor: 'Claude', model: 'x' } }, { agent });

test('事实：快照缺原格信息时提示先同步；有时给出 Evidence、窗口、覆盖率与指纹', async () => {
  const { strategy, state } = setup({ ...TIMELINE, cellIndex: undefined });
  await assert.rejects(strategy.facts('2026-12'), e => e.status === 409 && /先在时间线页同步/.test(e.message));
  state.timeline = TIMELINE;
  const f = await strategy.facts('2026-12');
  assert.equal(f.coverage.uk.coverage.calculable, 2); assert.equal(f.baseRevision, null); assert.match(f.inputFingerprint, /^[0-9a-f]{16}$/);
  const view = await strategy.factsView('2026-12');
  assert.deepEqual(view.evidence.map(e => e.school), ['伦敦大学学院 UCL'], '只列与目标月相关的事件');
  assert.equal(view.rules.barriers['BR-R1'][0], '续费');
});

test('反例 19、17：提交不改正式版本；确认生成 revision；基础版本变化后再确认转 stale', async () => {
  const { strategy } = setup();
  const { doc, f } = await docFor(strategy);
  const s1 = await submit(strategy, doc, f, 'k1');
  const s2 = await submit(strategy, { ...doc, brief: { ...doc.brief, judgement: { ...doc.brief.judgement, text: '另一版判断' } } }, f, 'k2');
  assert.equal(s1.state, 'pending'); assert.equal(s1.agent, 'claude-skill'); assert.deepEqual(s1.declared, { executor: 'Claude', model: 'x' });
  assert.equal(strategy.get('2026-12').revision, null, '未经确认，正式版本不变');
  const done = await strategy.confirm(s1.id, { confirm: true });
  assert.equal(done.revision.id, 'REV-2026-12-1');
  const got = strategy.get('2026-12');
  assert.equal(got.revision.content.brief.judgement.text, '英国 Final 前复习'); assert.equal(got.revision.confirmedFrom, 'page');
  assert.equal(strategy.submission(s2.id).state, 'stale', '新版本生成后，其余待确认提交过期');
  await assert.rejects(strategy.confirm(s2.id, { confirm: true }), e => e.status === 409);
  await assert.rejects(strategy.confirm(s1.id, { confirm: true }), e => e.status === 409, '已确认的不能再确认');
});

test('重读飞书只改了同步时间、内容没变：待确认提交不过期，可以确认', async () => {
  const { strategy, state } = setup();
  const { doc, f } = await docFor(strategy);
  const s = await submit(strategy, doc, f);
  state.timeline = { ...structuredClone(TIMELINE), syncedAt: '2026-11-08 10:10' };
  assert.equal((await strategy.facts('2026-12')).inputFingerprint, f.inputFingerprint);
  assert.equal((await strategy.preview(s.id)).stale, false);
  assert.equal((await strategy.confirm(s.id, { confirm: true })).revision.id, 'REV-2026-12-1');
});

test('反例 17：时间线内容变化（输入指纹变了）后确认被拒并转 stale', async () => {
  const { strategy, state } = setup();
  const { doc, f } = await docFor(strategy);
  const s = await submit(strategy, doc, f);
  state.timeline = { ...parseTimeline([sheet([['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.8'], ['爱丁堡大学 UoE', '2027.9.20']])], '2026-11-09 10:00'), years: [{ year: 2026 }] };
  await assert.rejects(strategy.confirm(s.id, { confirm: true }), e => e.status === 409 && e.code === 'SUBMISSION_STALE');
  assert.equal(strategy.submission(s.id).state, 'stale');
});

test('反例 18、24：同键同内容返回同一个；同键不同内容 409；校验不过 422 不保存', async () => {
  const { strategy, db } = setup();
  const { doc, f } = await docFor(strategy);
  const a = await submit(strategy, doc, f, 'same'), b = await submit(strategy, doc, f, 'same');
  assert.equal(b.id, a.id); assert.equal(b.repeated, true);
  await assert.rejects(submit(strategy, { ...doc, research: { rejected: [], assumptions: [], notes: ['改了'] } }, f, 'same'), e => e.status === 409 && e.code === 'IDEMPOTENCY_CONFLICT');
  const bad = structuredClone(doc); bad.claims[1].route.source = 'SRC-wechat';
  await assert.rejects(submit(strategy, bad, f, 'bad'), e => e.status === 422 && /I-03/.test(e.message));
  const wrongActivity = structuredClone(doc); wrongActivity.regions[0].activity = { value: '低', status: 'inferred', ratio: 0.1 };
  await assert.rejects(submit(strategy, wrongActivity, f, 'act'), e => e.status === 422 && /05 §6/.test(e.message));
  assert.equal(db.prepare('SELECT COUNT(*) n FROM strategy_submissions').get().n, 1);
});

// 模拟迁移或页面编辑留下的手写内容：直接写一个正式版本（skill 不能提交 origin=manual）。
const seed = (db, doc) => db.prepare("INSERT INTO strategy_revisions (id,month,schema_version,content,content_hash,inputs,segment_index,confirmed_by,confirmed_from,created_at) VALUES ('REV-2026-12-1','2026-12','2.1',?,'x','{}','{}','常浩','migration','2026-11-08T00:00:00Z')").run(JSON.stringify(doc));

test('反例 5、I-09：skill 不能新建手写内容；改动手写内容时预览单列，确认时只有逐条接受的才替换', async () => {
  const { strategy, db } = setup();
  const { doc, f } = await docFor(strategy, '2026-12', d => { d.claims[0].origin = 'manual'; return d; });
  await assert.rejects(submit(strategy, doc, f, 'forge'), e => e.status === 422 && /I-09/.test(e.message));
  seed(db, doc);
  const f2 = await strategy.facts('2026-12');
  const changed = structuredClone(doc); changed.claims[0].text = 'skill 改写的任务';
  const s = await submit(strategy, changed, f2, 'rewrite');
  const p = await strategy.preview(s.id);
  assert.deepEqual(p.manualChanges.map(m => m.id), ['CLM-2026-12-1']); assert.equal(p.stale, false);
  assert.deepEqual(p.diff.claims, { added: [], removed: [], changed: ['CLM-2026-12-1'] });
  const kept = await strategy.confirm(s.id, { confirm: true });
  assert.deepEqual(kept.keptManual, ['CLM-2026-12-1']);
  assert.equal(strategy.get('2026-12').revision.content.claims[0].text, '12 月上旬进入 Final', '没接受就保留手写原文');
  const s3 = await submit(strategy, changed, await strategy.facts('2026-12'), 'rewrite-2');
  await strategy.confirm(s3.id, { confirm: true, acceptManual: ['CLM-2026-12-1'] });
  assert.equal(strategy.get('2026-12').revision.content.claims[0].text, 'skill 改写的任务');
  assert.equal(strategy.revisions('2026-12').length, 3);
});

test('I-06：手写内容依据已变化时，确认须常浩明确保留（keepStale），保留只更新依据版本、不改正文', async () => {
  const { strategy, db, state } = setup();
  const { doc } = await docFor(strategy, '2026-12', d => { d.claims[0].origin = 'manual'; return d; });
  seed(db, doc);
  state.timeline = parseTimeline([sheet([['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.8'], ['爱丁堡大学 UoE', '2027.9.20']])], '2026-11-09 10:00');
  state.timeline.years = [{ year: 2026 }];
  const f = await strategy.facts('2026-12');
  const next = structuredClone(doc); next.regions = (await docFor(strategy)).doc.regions; next.brief.judgement = { text: '新一版', claims: ['CLM-2026-12-2'] };
  next.claims[0] = doc.claims[0];
  const s = await submit(strategy, { ...next, claims: [next.claims[1]] }, f, 'drop-manual');
  await assert.rejects(strategy.confirm(s.id, { confirm: true }), e => e.status === 422 && /I-06/.test(e.message));
  const ok = await strategy.confirm(s.id, { confirm: true, keepStale: ['CLM-2026-12-1'] });
  assert.deepEqual(ok.keptManual, ['CLM-2026-12-1'], '提交删掉的手写内容也恢复');
  const kept = strategy.get('2026-12').revision.content.claims.find(c => c.id === 'CLM-2026-12-1');
  assert.equal(kept.text, '12 月上旬进入 Final');
  assert.equal(Object.values(kept.refVersions)[0], f.evidence.find(e => e.school.startsWith('伦敦')).evidenceVersion);
});

test('反例 4、07 第 3 节：背景卡没有存量用户情况时，续费障碍须为 unknown；背景卡先预览后确认，条目成为 business Evidence', async () => {
  const { strategy } = setup();
  const renewal = d => { d.claims[1] = { ...d.claims[1], id: 'CLM-2026-12-2', targetRelation: '续费', barrierCode: 'BR-R2', status: 'inferred', evidenceStrength: 'weak', limitations: '常识推断', gap: undefined, route: undefined }; return d; };
  const { doc, f } = await docFor(strategy, '2026-12', renewal);
  await assert.rejects(submit(strategy, doc, f, 'r1'), e => e.status === 422 && /07 §3/.test(e.message));
  assert.throws(() => strategy.previewBizcard('2026-12', { 存量用户情况: [{ text: '澳洲学员课表未定', type: '事实记录' }] }), /记录出处/);
  const p = strategy.previewBizcard('2026-12', { 存量用户情况: [{ text: '澳洲在读学员多数 11 月底考完', type: '业务观察', basis: '课程顾问反馈' }] });
  strategy.confirmBizcard('2026-12', { confirm: true, previewId: p.previewId });
  const f2 = await strategy.facts('2026-12');
  const biz = f2.evidence.find(e => e.kind === 'business');
  assert.deepEqual([biz.sourceId, biz.bizType, biz.strength], ['SRC-bizcard', '业务观察', 'partial']);
  assert.notEqual(f2.inputFingerprint, f.inputFingerprint, '背景卡进入输入指纹');
  const ok = await submit(strategy, (await docFor(strategy, '2026-12', renewal)).doc, f2, 'r2');
  assert.equal(ok.state, 'pending');
  // 条目 id 在预览时分配；删掉别的条目，已有条目的 Evidence ID 不变
  const saved = strategy.get('2026-12').bizcard;
  const p2 = strategy.previewBizcard('2026-12', { 存量用户情况: [{ text: '新加的一条', type: '管理判断' }, ...saved['存量用户情况']] });
  strategy.confirmBizcard('2026-12', { confirm: true, previewId: p2.previewId });
  const ids = (await strategy.facts('2026-12')).evidence.filter(e => e.kind === 'business').map(e => e.evidenceId);
  assert.ok(ids.includes(biz.evidenceId)); assert.equal(ids.length, 2);
});

test('#40 背景卡适用范围：countries、relation 的格式校验；带进 Evidence；只在填了时改变 Evidence 版本；提交按范围封顶', async () => {
  const { strategy } = setup();
  const entry = extra => ({ 用户观察: [{ text: '英国新签咨询多在问考前冲刺', type: '业务观察', basis: '顾问周报', ...extra }] });
  for (const [extra, why] of [[{ countries: ['gb'] }, /英国写 uk/], [{ countries: ['other'] }, /不是时间线认识的国家代码/], [{ countries: ['usa'] }, /不是时间线认识/], [{ countries: ['de'] }, /不是时间线认识/],
    [{ countries: 'uk' }, /须为国家代码数组/], [{ relation: '老学员' }, /新签 \/ 续费 \/ 通用/]]) assert.throws(() => strategy.previewBizcard('2026-12', entry(extra)), why, JSON.stringify(extra));
  const p0 = strategy.previewBizcard('2026-12', entry({ countries: [], relation: '' }));
  assert.deepEqual(Object.keys(p0.value['用户观察'][0]).sort(), ['basis', 'id', 'text', 'type'], '空范围按没填处理，不存');
  const p1 = strategy.previewBizcard('2026-12', entry({ countries: [' US', 'uk', 'Us'], relation: '新签' }));
  assert.deepEqual([p1.value['用户观察'][0].countries, p1.value['用户观察'][0].relation], [['uk', 'us'], '新签'], '转小写、去重、排序（点选顺序不影响依据版本）');

  // 先存没填范围的条目：版本与加字段前的算法一致（老条目不会因为这次改动变成「依据已变化」）
  strategy.confirmBizcard('2026-12', { confirm: true, previewId: strategy.previewBizcard('2026-12', entry({})).previewId });
  const bare = (await strategy.facts('2026-12')).evidence.find(e => e.kind === 'business');
  assert.equal(bare.evidenceVersion, fingerprint(['英国新签咨询多在问考前冲刺', '业务观察', '顾问周报']).slice(0, 16));
  assert.equal(bare.countries, undefined); assert.equal(bare.relation, undefined);
  const scoped = d => { d.claims[1] = { ...d.claims[1], barrierCode: 'BR-C1', status: 'inferred', evidenceStrength: 'partial', limitations: '一线反馈', gap: undefined, route: undefined }; return d; };
  const cite = ev => d => { scoped(d); d.claims[1].evidenceRefs = [ev.evidenceId]; d.claims[1].refVersions = { [ev.evidenceId]: ev.evidenceVersion }; return d; };
  const r0 = await docFor(strategy, '2026-12', cite(bare));
  await assert.rejects(submit(strategy, r0.doc, r0.f, 's0'), e => e.status === 422 && /02 §2.3/.test(e.message) && /没填适用国家/.test(e.message), '没填范围撑不起 partial');

  // 补上范围：Evidence ID 不变、版本变化，带上两个字段，同一份稿子可以提交
  const saved = strategy.get('2026-12').bizcard['用户观察'][0];
  strategy.confirmBizcard('2026-12', { confirm: true, previewId: strategy.previewBizcard('2026-12', { 用户观察: [{ ...saved, countries: ['uk'], relation: '新签' }] }).previewId });
  const ev = (await strategy.facts('2026-12')).evidence.find(e => e.kind === 'business');
  assert.equal(ev.evidenceId, bare.evidenceId); assert.notEqual(ev.evidenceVersion, bare.evidenceVersion, '范围变了，依据就算变了');
  assert.deepEqual([ev.countries, ev.relation], [['uk'], '新签']);
  const r1 = await docFor(strategy, '2026-12', cite(ev));
  assert.equal((await submit(strategy, r1.doc, r1.f, 's1')).state, 'pending');
  await assert.rejects(submit(strategy, r0.doc, r1.f, 's2'), e => e.status === 422 && /I-06/.test(e.message), '按旧版本引用的稿子须重新研判');
});

test('07 第 3 节：缺存量用户情况时续费 unknown 须指向背景卡；缺用户观察时痛点只能是 typical', async () => {
  const { strategy } = setup();
  const { doc, f } = await docFor(strategy, '2026-12', d => {
    d.claims.push({ id: 'CLM-2026-12-3', scenario: 'SCN-2026-12-uk-01', claimType: 'barrier', text: '下阶段任务不明', status: 'unknown', evidenceStrength: 'none', gap: '缺少存量信息', route: { status: 'research', suggestion: '问顾问' }, barrierCode: 'BR-R2', targetRelation: '续费', barrierRole: 'primary', origin: 'skill' });
    d.claims.push({ id: 'CLM-2026-12-4', scenario: 'SCN-2026-12-uk-01', claimType: 'pain', painKind: 'observed', text: '引用规范不熟', status: 'inferred', evidenceStrength: 'weak', limitations: '常识', origin: 'skill' });
    return d;
  });
  await assert.rejects(submit(strategy, doc, f, 'deg'), e => e.status === 422 && /CLM-2026-12-3/.test(e.message) && /CLM-2026-12-4/.test(e.message));
});

test('回退与 revision 输入：服务端记录的输入写进正式版本；回退生成新版本，历史不改写', async () => {
  const { strategy } = setup();
  const { doc, f } = await docFor(strategy, '2026-12', d => { d.inputs = { timelineSnapshot: 'skill 乱填' }; return d; });
  await strategy.confirm((await submit(strategy, doc, f, 'v1')).id, { confirm: true });
  const r1 = strategy.get('2026-12').revision;
  assert.equal(r1.content.inputs.timelineSnapshot, f.snapshot); assert.equal(r1.content.inputs.rules.baseline, 'baseline-v1');
  assert.deepEqual(Object.keys(r1.content.inputs.evidenceVersions), doc.scenarios[0].evidenceRefs);
  const f2 = await strategy.facts('2026-12');
  await strategy.confirm((await submit(strategy, { ...doc, brief: { ...doc.brief, judgement: { ...doc.brief.judgement, text: '第二版' } } }, f2, 'v2')).id, { confirm: true });
  assert.throws(() => strategy.rollback('2026-12', { revisionId: 'REV-2026-12-1' }), /明确确认/);
  const back = strategy.rollback('2026-12', { confirm: true, revisionId: 'REV-2026-12-1' });
  assert.equal(back.revision.id, 'REV-2026-12-3');
  const now = strategy.get('2026-12').revision;
  assert.equal(now.content.brief.judgement.text, '英国 Final 前复习'); assert.equal(now.confirmedFrom, 'rollback:REV-2026-12-1');
  assert.equal(strategy.revisions('2026-12').length, 3);
});

test('I-10：revision 写入后不可修改、不可删除', async () => {
  const { strategy, db } = setup();
  const { doc, f } = await docFor(strategy);
  await strategy.confirm((await submit(strategy, doc, f)).id, { confirm: true });
  assert.throws(() => db.prepare("UPDATE strategy_revisions SET content='{}'").run(), /不可修改/);
  assert.throws(() => db.prepare('DELETE FROM strategy_revisions').run(), /不可删除/);
});

test('反例 20：智能体凭据只能提交；确认不是智能体工具，调用被拒且记录；拒绝后不能确认', async t => {
  const { db, strategy } = setup();
  const routes = agentRoutes(db, { strategy });
  const server = createServer(async (req, res) => { const url = new URL(req.url, 'http://x'); const found = match(routes, req.method, url.pathname); await found.handler(req, res, { params: found.params, url }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const token = issueAgentToken(db, 'claude-skill', ['strategy_facts', 'strategy_submit', 'strategy_submission']);
  const call = (tool, args) => fetch(`http://127.0.0.1:${server.address().port}/api/v3/agent/tools/${tool}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ arguments: args, caller: { userId: 'changhao' } }) }).then(async r => ({ status: r.status, body: await r.json() }));
  const facts = (await call('strategy_facts', { month: '2026-12' })).body.result;
  const { doc } = await docFor(strategy);
  const sub = await call('strategy_submit', { month: '2026-12', document: doc, idempotencyKey: 'mcp-1', baseRevision: facts.baseRevision, inputFingerprint: facts.inputFingerprint, declared: { executor: 'Claude' } });
  assert.equal(sub.status, 200); assert.equal(sub.body.result.agent, 'claude-skill', 'agent 取自凭据');
  const confirm = await call('strategy_confirm', { id: sub.body.result.id });
  assert.equal(confirm.status, 404);
  assert.equal(strategy.get('2026-12').revision, null);
  const logged = db.prepare("SELECT tool,status FROM agent_calls WHERE tool='strategy_confirm'").get();
  assert.deepEqual({ ...logged }, { tool: 'strategy_confirm', status: 404 });
  assert.throws(() => strategy.reject(sub.body.result.id), /明确确认/);
  strategy.reject(sub.body.result.id, { confirm: true });
  assert.equal((await call('strategy_submission', { id: sub.body.result.id })).body.result.state, 'rejected');
  await assert.rejects(strategy.confirm(sub.body.result.id, { confirm: true }), e => e.status === 409);
});

test('#30 页面读取：全部提交（含拒绝原因）、版本详情、正式版本与待确认提交引用的 Evidence', async () => {
  const { strategy } = setup();
  const { doc, f } = await docFor(strategy);
  const a = await submit(strategy, doc, f, 'p1');
  assert.throws(() => strategy.reject(a.id, { confirm: true, reason: 'x'.repeat(201) }), /200 字/);
  strategy.reject(a.id, { confirm: true, reason: '  判断太泛  ' });
  const b = await submit(strategy, { ...doc, research: { rejected: [], assumptions: [], notes: ['二稿'] } }, f, 'p2');
  const list = strategy.submissions('2026-12');
  assert.deepEqual(list.map(s => [s.id, s.state, s.rejectReason]), [[b.id, 'pending', null], [a.id, 'rejected', '判断太泛']], '新的在前，拒绝原因去掉首尾空格');
  const ev = await strategy.evidence('2026-12');
  assert.deepEqual(ev.evidence.map(e => e.school), ['伦敦大学学院 UCL'], '待确认提交引用的 Evidence');
  assert.equal(ev.windows[0].evidenceId, ev.evidence[0].evidenceId);
  const { revision } = await strategy.confirm(b.id, { confirm: true });
  const full = strategy.revision(revision.id);
  assert.equal(full.submissionId, b.id); assert.equal(full.content.research.notes[0], '二稿'); assert.equal(full.confirmedFrom, 'page');
  assert.equal(strategy.revisions('2026-12')[0].snapshot, full.content.inputs.timelineSnapshot, '版本列表带确认时的快照指纹');
  assert.throws(() => strategy.revision('REV-nope'), e => e.status === 404);
  assert.deepEqual((await strategy.evidence('2026-12')).evidence.map(e => e.school), ['伦敦大学学院 UCL'], '正式版本引用的 Evidence');
});

test('#41 按 idempotencyKey 查提交：只查本凭据自己的，查不到回 404，参数缺失或冲突回 400（走真实 HTTP 路由与凭据）', async t => {
  const { db, strategy } = setup();
  const routes = agentRoutes(db, { strategy });
  const server = createServer(async (req, res) => { const url = new URL(req.url, 'http://x'); const found = match(routes, req.method, url.pathname); await found.handler(req, res, { params: found.params, url }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => server.close());
  const tools = ['strategy_facts', 'strategy_submit', 'strategy_submission'];
  const caller = token => (tool, args) => fetch(`http://127.0.0.1:${server.address().port}/api/v3/agent/tools/${tool}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ arguments: args, caller: { userId: 'changhao' } }) }).then(async r => ({ status: r.status, body: await r.json() }));
  const claude = caller(issueAgentToken(db, 'claude-skill', tools));
  const codex = caller(issueAgentToken(db, 'codex-skill', tools));
  const facts = (await claude('strategy_facts', { month: '2026-12' })).body.result;
  const { doc } = await docFor(strategy);
  const sub = await claude('strategy_submit', { month: '2026-12', document: doc, idempotencyKey: 'lost-1', baseRevision: facts.baseRevision, inputFingerprint: facts.inputFingerprint });
  assert.equal(sub.status, 200);

  const byKey = await claude('strategy_submission', { idempotencyKey: 'lost-1' });
  assert.equal(byKey.status, 200);
  assert.equal(byKey.body.result.state, 'pending');
  assert.deepEqual(byKey.body.result, (await claude('strategy_submission', { id: sub.body.result.id })).body.result, '与按 id 查形状一致');
  strategy.reject(sub.body.result.id, { confirm: true });
  assert.equal((await claude('strategy_submission', { idempotencyKey: 'lost-1' })).body.result.state, 'rejected', '状态跟着变');

  const other = await codex('strategy_submission', { idempotencyKey: 'lost-1' });
  assert.deepEqual([other.status, other.body.code], [404, 'SUBMISSION_NOT_FOUND'], '另一个 agent 查不到');
  assert.doesNotMatch(JSON.stringify(other.body), new RegExp(sub.body.result.id));
  const missing = await claude('strategy_submission', { idempotencyKey: 'never-sent' });
  assert.deepEqual([missing.status, missing.body.code], [404, 'SUBMISSION_NOT_FOUND']);
  assert.match(missing.body.error, /没有这次提交/);

  for (const args of [{}, { id: sub.body.result.id, idempotencyKey: 'lost-1' }, { idempotencyKey: '' }, { id: '' }]) {
    assert.equal((await claude('strategy_submission', args)).status, 400, JSON.stringify(args));
  }
  const logged = db.prepare("SELECT agent,status FROM agent_calls WHERE tool='strategy_submission' ORDER BY rowid").all().map(r => `${r.agent}:${r.status}`);
  assert.deepEqual(logged, ['claude-skill:200', 'claude-skill:200', 'claude-skill:200', 'codex-skill:404', 'claude-skill:404', 'claude-skill:400', 'claude-skill:400', 'claude-skill:400', 'claude-skill:400']);
});
