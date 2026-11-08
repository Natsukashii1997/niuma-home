// 月度用户策略批 1·1b-1：月度文档 v2 校验（docs/策略规则/03 第 3–5 节；反例见 09）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BARRIER_RELATIONS, SOURCE_IDS, validateStrategyDoc } from '../server/strategy-validate.mjs';

const EV = [
  { evidenceId: 'EV-final', evidenceVersion: 'v1', kind: 'timeline', country: 'uk', ambiguous: false },
  { evidenceId: 'EV-amb', evidenceVersion: 'v1', kind: 'timeline', country: 'uk', ambiguous: true },
  { evidenceId: 'EV-biz', evidenceVersion: 'b1', kind: 'business', ambiguous: false },
];
const region = (key, scenarios = []) => ({ key, priority: { value: '平稳', default: '平稳', reason: '' }, activity: { value: 'unknown', status: 'unknown' }, scenarios, emptyReason: scenarios.length ? null : '当前没有足够证据形成独立情境' });
const base = () => ({
  schemaVersion: '2.1', month: '2026-12',
  brief: { judgement: { text: '英国 Final 前集中复习', claims: ['CLM-2026-12-1'] }, common: [{ text: '考试季', status: 'inferred', evidenceStrength: 'partial', evidenceRefs: ['EV-final'], limitations: '原表日期' }], diff: [], external: [] },
  regions: [{ ...region('uk', ['SCN-2026-12-uk-01']), priority: { value: '主战场', default: '主战场', reason: '' }, activity: { value: '高', status: 'inferred', ratio: 0.5 } }, region('us'), region('hk'), region('au'), region('ca'), region('other')],
  scenarios: [{ id: 'SCN-2026-12-uk-01', region: 'uk', countries: ['uk'], academicStage: 'undergraduate', phase: 'Term 1 结课', keyTask: 'Final 复习', targetRelation: '新签', observedRelation: { value: 'unknown', evidenceRefs: [] }, evidenceRefs: ['EV-final'] }],
  claims: [
    { id: 'CLM-2026-12-1', scenario: 'SCN-2026-12-uk-01', claimType: 'task', text: '12 月上旬进入 Final', status: 'inferred', evidenceStrength: 'partial', evidenceRefs: ['EV-final'], refVersions: { 'EV-final': 'v1' }, limitations: '原表日期未核实', origin: 'skill' },
    { id: 'CLM-2026-12-2', scenario: 'SCN-2026-12-uk-01', claimType: 'barrier', text: '可能觉得还来得及', status: 'unknown', evidenceStrength: 'none', gap: '缺少用户决策行为证据', route: { status: 'available', source: 'SRC-bizcard', suggestion: '背景卡补用户观察' }, barrierCode: 'BR-M2', targetRelation: '新签', barrierRole: 'primary', origin: 'skill' },
  ],
  opportunities: [], strategies: [], research: { rejected: [], assumptions: [], notes: [] },
});
const check = (doc, ctx = {}) => validateStrategyDoc(doc, { evidence: EV, ...ctx });
const rules = r => r.errors.map(e => e.rule);

test('合法文档 0 错误；障碍只有 unknown 时也合法', () => {
  const r = check(base());
  assert.deepEqual(r.errors, []); assert.deepEqual(r.warnings, []);
});

test('I-01–I-04：状态与强度、限定、缺口、获取途径对应；反例 2、14', () => {
  const d = base();
  d.claims[0].status = 'known';                                  // 强度 partial
  d.claims[1].route.source = 'SRC-wechat';                       // 反例 14
  d.brief.common[0].limitations = '';                            // inferred 无限定
  d.claims.push({ ...d.claims[0], id: 'CLM-2026-12-3', status: 'not_applicable', evidenceStrength: 'none', limitations: '' });
  const r = check(d);
  assert.deepEqual([...new Set(rules(r))].sort(), ['I-01', 'I-02', 'I-03', 'I-04']);
  assert.ok(r.errors.find(e => e.rule === 'I-03').message.includes('SRC-wechat'));
  assert.equal(r.errors.find(e => e.rule === 'I-01').at, 'CLM-2026-12-1');
});

test('反例 15、I-05：只凭时间线写实际商业关系被拦截，有业务证据才放行', () => {
  const d = base();
  d.scenarios[0].observedRelation = { value: '续费', evidenceRefs: ['EV-final'] };
  assert.deepEqual(rules(check(d)), ['I-05']);
  d.scenarios[0].observedRelation.evidenceRefs = ['EV-biz'];
  assert.deepEqual(check(d).errors, []);
});

test('I-06：依据版本变化标「依据已变化」并拦截', () => {
  const d = base();
  d.claims[0].refVersions = { 'EV-final': 'v0' };
  const r = check(d);
  assert.deepEqual(rules(r), ['I-06']); assert.deepEqual(r.changed, ['CLM-2026-12-1']);
});

test('I-11：障碍编码与适用人群相容；同一情境同一人群恰好一个主障碍', () => {
  const d = base();
  d.claims[1].barrierCode = 'BR-R1';                             // 续费专属用于新签
  assert.deepEqual(rules(check(d)), ['I-11']);
  const two = base();
  two.claims.push({ ...two.claims[1], id: 'CLM-2026-12-3', barrierCode: 'BR-C1' });
  assert.match(check(two).errors[0].message, /现在是 2 个/);
  const none = base();
  none.claims[1].barrierRole = 'secondary';
  assert.match(check(none).errors[0].message, /现在是 0 个/);
  const other = base();
  other.claims[1].barrierCode = 'BR-X9';
  assert.deepEqual(rules(check(other)), ['I-11']);
});

test('I-12：情境国家须是归一化的具体国家代码', () => {
  for (const c of ['other', 'UK', 'UK@2027']) {
    const d = base(); d.scenarios[0].countries = [c];
    assert.deepEqual(rules(check(d)), ['I-12'], c);
  }
});

test('反例 22、I-13：六个地区都在；空情境须写原因；priority 为 null 须写理由；覆盖率状态一致', () => {
  const missing = base(); missing.regions.pop();
  assert.deepEqual(rules(check(missing)), ['I-13']);
  const empty = base(); empty.regions[1].emptyReason = '';
  assert.deepEqual(rules(check(empty)), ['I-13']);
  const nullPriority = base(); nullPriority.regions[5].priority = { value: null, default: null, reason: '' };
  assert.deepEqual(rules(check(nullPriority)), ['I-13']);
  nullPriority.regions[5].priority.reason = '待研判：由旧 sg 与旧 other 合并';
  assert.deepEqual(check(nullPriority).errors, []);
  const activity = base(); activity.regions[0].activity = { value: '高', status: 'known' };
  assert.deepEqual(rules(check(activity)), ['I-13']);
  const differs = base(); differs.regions[0].priority.value = '次要';
  assert.deepEqual(rules(check(differs)), ['I-13'], '与默认不同须写理由');
});

test('反例 23、I-17、I-18：悬空引用与快照内重复 ID 都拦截；ambiguous 证据不能作 known 依据', () => {
  const dangling = base(); dangling.claims[0].evidenceRefs = ['EV-gone'];
  assert.ok(rules(check(dangling)).includes('I-17'));
  const scenario = base(); scenario.claims[0].scenario = 'SCN-2026-12-uk-09';
  assert.deepEqual(rules(check(scenario)), ['I-17']);
  assert.deepEqual(rules(check(base(), { evidence: [...EV, EV[0]] })), ['I-18']);
  const amb = base(); Object.assign(amb.claims[0], { status: 'known', evidenceStrength: 'strong', evidenceRefs: ['EV-amb'], refVersions: { 'EV-amb': 'v1' } });
  assert.deepEqual(rules(check(amb)), ['I-18']);
});

test('I-15 与写作规范只提示不拦截；批 1 不接受机会与策略；legacy 只在迁移数据里', () => {
  const d = base(); d.claims[0].text = 'BR-M2 觉得还来得及，学生普遍认为离考试还远所以不着急报名辅导课程，打算等到考前一周再看情况';
  const r = check(d);
  assert.deepEqual(r.errors, []); assert.deepEqual(r.warnings.map(w => w.rule).sort(), ['I-15', '写作']);
  const opp = base(); opp.opportunities = [{ id: 'OPP-2026-12-1' }];
  assert.deepEqual(rules(check(opp)), ['结构']);
  const legacy = base(); legacy.legacy = {}; legacy.brief.judgement.claims = []; legacy.scenarios[0].evidenceRefs = [];
  assert.equal(rules(check(legacy)).length, 3);
  assert.deepEqual(check(legacy, { migrated: true }).errors, []);
});

test('I-12：时间线 Evidence 的国家也须是归一化代码', () => {
  assert.deepEqual(rules(check(base(), { evidence: [...EV, { evidenceId: 'EV-x', evidenceVersion: 'v', kind: 'timeline', country: 'UK' }] })), ['I-12']);
});

test('反例 2（代码侧）、02 第 2.3 节：没有用户决策行为证据时，M2 只能 unknown，其他障碍最高 inferred + weak', () => {
  const known = base(); Object.assign(known.claims[1], { status: 'known', evidenceStrength: 'strong', evidenceRefs: ['EV-final'], refVersions: { 'EV-final': 'v1' } });
  assert.deepEqual(rules(check(known)), ['02 §2.3']);
  const partial = base(); Object.assign(partial.claims[1], { barrierCode: 'BR-C1', status: 'inferred', evidenceStrength: 'partial', limitations: '常识推断', evidenceRefs: ['EV-final'], refVersions: { 'EV-final': 'v1' } });
  assert.deepEqual(rules(check(partial)), ['02 §2.3']);
  partial.claims[1].evidenceStrength = 'weak';
  assert.deepEqual(check(partial).errors, []);
  const biz = base(); Object.assign(biz.claims[1], { barrierCode: 'BR-C1', status: 'known', evidenceStrength: 'strong', evidenceRefs: ['EV-biz'], refVersions: { 'EV-biz': 'b1' } });
  assert.deepEqual(check(biz).errors, []);
});

test('I-15 也提示正式稿顶部的正文；priority 为 null 时理由须写「待研判」', () => {
  const d = base(); d.brief.judgement.text = 'BR-M2 为主'; d.brief.common[0].text = '打法 P0201 早鸟';
  assert.deepEqual(check(d).warnings.map(w => w.at), ['brief.judgement', 'brief.common[0]']);
  const n = base(); n.regions[5].priority = { value: null, default: null, reason: '看不出来' };
  assert.deepEqual(rules(check(n)), ['I-13']);
});

test('内置的来源与障碍表和规则文档一致（01 sources-v1.1、02 barrier-v2.1）', () => {
  const sources = readFileSync(new URL('../docs/策略规则/01-来源登记表.md', import.meta.url), 'utf8');
  assert.deepEqual([...sources.matchAll(/^\| `(SRC-[a-z]+)` \|/gm)].map(m => m[1]), SOURCE_IDS);
  const barriers = readFileSync(new URL('../docs/策略规则/02-障碍体系v2.md', import.meta.url), 'utf8');
  const table = Object.fromEntries([...barriers.matchAll(/^\| `(BR-[A-Z]\d)` \|[^|]+\|[^|]+\| ([^|]+) \|/gm)].map(m => [m[1], m[2].trim().split(' / ')]));
  assert.deepEqual(table, BARRIER_RELATIONS);
});
