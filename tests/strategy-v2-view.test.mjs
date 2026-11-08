// #30 策略页 v2 的展示推导（docs/策略规则/03-Schema-v2.md 3.3 节末、6.1 节）：标签、依据已变化、差异。
import test from 'node:test';
import assert from 'node:assert/strict';
import { bizScope, bizScopeText, claimText, countChanges, dateText, diffDocs, evidenceName, kindLabel, shortSchool, scopeMissingCount, staleRefs, statusLabel } from '../src/modules/user/strategy-v2.js';

test('状态 × 强度 → 页面标签；依据已变化优先', () => {
  assert.deepEqual(statusLabel({ status: 'known', evidenceStrength: 'strong' }), ['已知 · 强', 'green']);
  assert.deepEqual(statusLabel({ status: 'inferred', evidenceStrength: 'partial' }), ['推断 · 中', 'blue']);
  assert.deepEqual(statusLabel({ status: 'inferred', evidenceStrength: 'weak' }), ['推断 · 弱', 'weak']);
  assert.deepEqual(statusLabel({ status: 'unknown', evidenceStrength: 'none' }), ['未知', 'amber']);
  assert.deepEqual(statusLabel({ status: 'not_applicable' }), ['不适用', 'neutral']);
  assert.deepEqual(statusLabel({ status: 'known', evidenceStrength: 'strong' }, true), ['依据已变化', 'red']);
});

test('类型标签按 3.3 节推导：客观任务、已验证 / 潜在需求、实际 / 典型困难、主障碍', () => {
  const ev = { a: { kind: 'business' }, t: { kind: 'timeline' } };
  assert.equal(kindLabel({ claimType: 'task', status: 'known' }), '客观任务');
  assert.equal(kindLabel({ claimType: 'task', status: 'inferred' }), '待办任务');
  assert.equal(kindLabel({ claimType: 'academic_need', status: 'known', evidenceStrength: 'strong', evidenceRefs: ['a'] }, ev), '已验证需求');
  assert.equal(kindLabel({ claimType: 'academic_need', status: 'known', evidenceStrength: 'strong', evidenceRefs: ['t'] }, ev), '潜在需求', '只有时间线证据不算已验证');
  assert.equal(kindLabel({ claimType: 'pain', painKind: 'observed' }), '实际困难');
  assert.equal(kindLabel({ claimType: 'pain', painKind: 'typical' }), '典型困难');
  assert.equal(kindLabel({ claimType: 'readiness', status: 'unknown', level: null }), '购买准备度 未知');
  assert.equal(kindLabel({ claimType: 'barrier', barrierCode: 'BR-R2', barrierRole: 'primary' }), '下阶段没有明确任务（主）');
});

test('依据已变化：版本不同或证据不在当前快照；没读到证据时不判断', () => {
  const c = { refVersions: { a: 'v1', b: 'v2', c: 'v3' } };
  assert.deepEqual(staleRefs(c, { a: { evidenceVersion: 'v1' }, b: { evidenceVersion: 'v9' } }), ['b', 'c']);
  assert.deepEqual(staleRefs(c, null), []);
  assert.deepEqual(staleRefs({}, {}), []);
});

test('证据显示：缩写、日期精度、背景卡', () => {
  assert.equal(shortSchool('伦敦大学学院 UCL'), 'UCL');
  assert.equal(shortSchool('都柏林大学'), '都柏林大学');
  assert.equal(dateText({ precision: 'day', from: '2026-12-07', to: '2026-12-12' }), '12/07–12/12');
  assert.equal(dateText({ precision: 'day', from: '2026-12-07', to: '2026-12-07' }), '12/07');
  assert.equal(dateText({ precision: 'month', months: ['2026-12'] }), '2026-12 月内');
  assert.equal(dateText({ precision: 'none' }), '日期不明');
  assert.equal(evidenceName({ kind: 'timeline', school: '香港大学 HKU', eventType: 'Final' }), 'HKU Final');
  assert.equal(evidenceName({ kind: 'timeline', school: '多伦多大学 UT', eventType: '其他', header: '教学日结束' }), 'UT 教学日结束');
  assert.equal(evidenceName({ kind: 'business', field: '用户观察' }), '背景卡 · 用户观察');
});

test('两份月度文档的差异：核心结论、全局研判、优先级、情境、判断（新增 / 修改 / 删除），可略过单独处理的手写内容', () => {
  const region = (key, extra = {}) => ({ key, priority: { value: '平稳', reason: '' }, scenarios: [], emptyReason: '无', ...extra });
  const base = { brief: { judgement: { text: '旧判断' }, common: [{ text: '共性一', status: 'inferred', evidenceStrength: 'weak' }], diff: [], external: [] },
    regions: [region('uk', { scenarios: ['S1'], emptyReason: null }), region('other', { priority: { value: null, reason: '待研判' } })],
    scenarios: [{ id: 'S1', region: 'uk', phase: 'Term 1', keyTask: 'Final', targetRelation: '新签' }],
    claims: [{ id: 'C1', scenario: 'S1', claimType: 'task', text: '旧任务', status: 'inferred', evidenceStrength: 'partial' },
      { id: 'C2', scenario: 'S1', claimType: 'pain', text: '会删掉', status: 'inferred', evidenceStrength: 'weak' },
      { id: 'M1', scenario: 'S1', claimType: 'pain', text: '手写', status: 'inferred', evidenceStrength: 'weak', origin: 'manual' }] };
  const next = structuredClone(base);
  next.brief.judgement.text = '新判断';
  next.regions[1].priority = { value: '次要', reason: '澳门 Final' };
  next.claims = [{ ...base.claims[0], text: '新任务' }, { ...base.claims[2], text: '手写改了' }, { id: 'C3', scenario: 'S1', claimType: 'barrier', text: '新障碍', status: 'unknown', evidenceStrength: 'none' }];
  const list = diffDocs(base, next, { omit: ['M1'] });
  const where = list.map(x => `${x.kind} ${x.where}`);
  assert.deepEqual(where, ['mod 核心结论', 'mod 其他 · 策略优先级', 'mod 英国 · 待办任务', 'del 英国 · 核心痛点', 'add 英国 · 决策障碍']);
  assert.deepEqual(countChanges(list), { add: 1, mod: 3, del: 1 });
  assert.equal(list[1].before, '待研判：待研判'); assert.equal(list[1].after, '次要：澳门 Final');
  assert.ok(diffDocs(base, next).some(x => x.id === 'M1'), '不略过时手写内容也列出');
  assert.deepEqual(diffDocs(base, structuredClone(base)), [], '内容相同没有差异');
  assert.equal(diffDocs(null, base).filter(x => x.kind === 'add').length, diffDocs(null, base).length, '没有正式版本时全部是新增');
  assert.equal(claimText(base.claims[2]), '手写（推断 · 弱 · 你写的）');
});

test('#40 背景卡适用范围：事实记录、业务观察要同时填国家和人群；管理判断不算缺；空条目不计数', () => {
  assert.deepEqual(bizScope({ type: '事实记录' }), { state: 'missing', text: '未填' });
  assert.deepEqual(bizScope({ type: '业务观察', countries: ['uk'] }), { state: 'missing', text: '没选人群' });
  assert.deepEqual(bizScope({ type: '业务观察', relation: '新签' }), { state: 'missing', text: '没选国家' });
  assert.deepEqual(bizScope({ type: '事实记录', countries: ['uk'], relation: '通用' }), { state: 'ok' });
  assert.deepEqual(bizScope({ type: '管理判断' }), { state: 'mgmt' });
  assert.equal(bizScopeText({ countries: ['uk', 'sg'], relation: '续费' }), '英国、新加坡 · 续费');
  assert.equal(bizScopeText({}), '');
  assert.equal(scopeMissingCount({ 用户观察: [{ text: 'a', type: '事实记录' }, { text: ' ', type: '业务观察' }, { text: 'b', type: '业务观察', countries: ['uk'], relation: '新签' }],
    负责人特别判断: [{ text: 'c', type: '管理判断' }], 存量用户情况: [{ text: 'd', type: '业务观察', relation: '续费' }] }), 2);
  assert.equal(scopeMissingCount(null), 0);
});
