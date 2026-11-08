// 月度用户策略 · 月度文档 v2 校验（docs/策略规则/03-Schema-v2.md 第 3–5 节，schema 2.1）。
// 纯函数：给定文档与当前 Evidence（时间线 + 业务背景卡），返回逐条错误（拦截）与提示（不拦截），每条定位到对象 ID。
// 规则表照抄 01 来源登记表 sources-v1.1、02 障碍体系 barrier-v2.1；规则文件改了，先改文档再改这里。
import { REGION_KEYS } from './strategy-evidence.mjs';

export const SCHEMA_VERSION = '2.1';
export const SOURCE_IDS = ['SRC-timeline', 'SRC-official', 'SRC-ruling', 'SRC-bizcard', 'SRC-playbook', 'SRC-voice', 'SRC-crm', 'SRC-service'];
const BOTH = ['新签', '续费'];
export const BARRIERS = {
  'BR-M1': ['新签'], 'BR-M2': BOTH, 'BR-M3': BOTH, 'BR-M4': BOTH, 'BR-M5': BOTH,
  'BR-C1': BOTH, 'BR-C2': BOTH, 'BR-C3': BOTH, 'BR-C4': BOTH, 'BR-O1': ['新签'], 'BR-F1': BOTH,
  'BR-R1': ['续费'], 'BR-R2': ['续费'], 'BR-R3': ['续费'], 'BR-R4': ['续费'], 'BR-R5': ['续费'],
};
const STATUS = ['known', 'inferred', 'unknown', 'not_applicable'];
const STRENGTH = ['strong', 'partial', 'weak', 'none'];
const RELATIONS = ['新签', '续费', '通用'];
const CLAIM_TYPES = ['task', 'academic_need', 'pain', 'need_strength', 'readiness', 'barrier'];
const PRIORITY = ['主战场', '次要', '平稳'];
const ACTIVITY = ['高', '中', '低', 'unknown'];
const ROUTE_STATUS = ['available', 'unavailable', 'research'];
const ORIGINS = ['skill', 'manual', 'migrated'];
const CODE_IN_PROSE = /BR-[A-Z]\d|\bP\d{4}\b|\b[A-C]\d\b/;
const units = text => [...String(text)].reduce((n, ch) => n + (ch.charCodeAt(0) < 128 ? 0.5 : 1), 0);
const nonEmpty = v => typeof v === 'string' ? v.trim().length > 0 : Boolean(v);
const isList = v => Array.isArray(v);

/**
 * @param doc 月度文档（第 4 节形状）
 * @param ctx.evidence 当前可引用的 Evidence 数组（时间线快照 + 业务背景卡）
 * @param ctx.migrated 迁移数据的校验放宽（04 第 6 节）
 * @returns {{ errors: {rule, at, message}[], warnings: {rule, at, message}[], changed: string[] }}
 */
export function validateStrategyDoc(doc, { evidence = [], migrated = false } = {}) {
  const errors = [], warnings = [], changed = [];
  const err = (rule, at, message) => errors.push({ rule, at, message });
  const warn = (rule, at, message) => warnings.push({ rule, at, message });
  if (!doc || typeof doc !== 'object') { err('结构', '文档', '文档不是对象'); return { errors, warnings, changed }; }
  if (doc.schemaVersion !== SCHEMA_VERSION) err('结构', 'schemaVersion', `schemaVersion 须为 ${SCHEMA_VERSION}`);
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(doc.month || '')) err('结构', 'month', 'month 须为 YYYY-MM');

  // I-18：当前 Evidence 集合内 ID 唯一。
  const byId = new Map();
  for (const e of evidence) {
    if (byId.has(e.evidenceId)) err('I-18', e.evidenceId, '同一快照内 evidenceId 重复');
    byId.set(e.evidenceId, e);
  }
  const scenarios = isList(doc.scenarios) ? doc.scenarios : (err('结构', 'scenarios', 'scenarios 须为数组'), []);
  const claims = isList(doc.claims) ? doc.claims : (err('结构', 'claims', 'claims 须为数组'), []);
  const ids = new Set();
  for (const o of [...scenarios, ...claims]) {
    if (ids.has(o?.id)) err('I-17', o?.id, '对象 ID 重复');
    ids.add(o?.id);
  }
  const scenarioIds = new Set(scenarios.map(s => s.id)), claimIds = new Set(claims.map(c => c.id));
  // I-17：引用的 Evidence 必须在当前快照里。
  const refs = (list, at, field = 'evidenceRefs') => {
    if (list === undefined) return [];
    if (!isList(list)) { err('结构', at, `${field} 须为数组`); return []; }
    for (const id of list) if (!byId.has(id)) err('I-17', at, `引用的 Evidence ${id} 不存在于当前快照`);
    return list.filter(id => byId.has(id));
  };

  // I-01–I-04：判断状态与证据强度、限定、缺口、获取途径的对应。
  function judged(o, at) {
    if (!STATUS.includes(o.status)) return err('结构', at, `status 须为 ${STATUS.join(' / ')}`);
    if (!STRENGTH.includes(o.evidenceStrength)) return err('结构', at, `evidenceStrength 须为 ${STRENGTH.join(' / ')}`);
    const has = refs(o.evidenceRefs, at);
    if (o.status === 'known' && (o.evidenceStrength !== 'strong' || !has.length)) err('I-01', at, 'known 须 evidenceStrength=strong 且 evidenceRefs 非空');
    if (o.status === 'known' && has.some(id => byId.get(id).ambiguous)) err('I-18', at, 'ambiguous 的 Evidence 不能作为 known 的依据');
    if (o.status === 'inferred' && (!['partial', 'weak'].includes(o.evidenceStrength) || !nonEmpty(o.limitations))) err('I-02', at, 'inferred 须 evidenceStrength 为 partial 或 weak，且写 limitations');
    if (o.status === 'unknown') {
      const r = o.route || {};
      if (!nonEmpty(o.gap) || !ROUTE_STATUS.includes(r.status)) err('I-03', at, 'unknown 须写 gap，route.status 为 available / unavailable / research');
      if (nonEmpty(r.source) && !SOURCE_IDS.includes(r.source)) err('I-03', at, `route.source ${r.source} 不在来源登记表内`);
      if (r.status === 'available' && !nonEmpty(r.source)) err('I-03', at, 'route.status=available 时须写 route.source');
    }
    if (o.status === 'not_applicable' && !nonEmpty(o.limitations)) err('I-04', at, 'not_applicable 须在 limitations 写明不适用的原因');
  }

  // 正式稿顶部。
  const brief = doc.brief || {};
  if (!brief.judgement || !nonEmpty(brief.judgement.text)) err('结构', 'brief.judgement', '缺少一句话月度判断');
  else {
    if (units(brief.judgement.text) > 100) warn('写作', 'brief.judgement', '月度判断超过 100 字');
    if (!migrated && !(brief.judgement.claims || []).length) err('结构', 'brief.judgement', 'claims 不能为空');
    for (const id of brief.judgement.claims || []) if (!claimIds.has(id)) err('I-17', 'brief.judgement', `引用的 Claim ${id} 不存在`);
  }
  for (const key of ['common', 'diff', 'external']) (brief[key] || []).forEach((item, i) => judged(item, `brief.${key}[${i}]`));

  // I-13：六个地区单元都在；priority、activity 字段必填；情境可空但须写原因。
  const regions = isList(doc.regions) ? doc.regions : [];
  const keys = regions.map(r => r?.key);
  for (const k of REGION_KEYS) if (keys.filter(x => x === k).length !== 1) err('I-13', `regions.${k}`, '六个地区单元须各出现一次');
  for (const k of keys) if (!REGION_KEYS.includes(k)) err('I-13', `regions.${k}`, '未知地区');
  for (const r of regions) {
    const at = `regions.${r.key}`, p = r.priority, a = r.activity;
    if (!p || typeof p !== 'object' || !(p.value === null || PRIORITY.includes(p.value))) err('I-13', at, 'priority.value 须为 主战场 / 次要 / 平稳 或 null');
    else if ((p.value === null || p.value !== p.default) && !nonEmpty(p.reason)) err('I-13', at, 'priority 为 null 或与默认建议不同时须写 reason');
    if (!a || typeof a !== 'object' || !ACTIVITY.includes(a.value)) err('I-13', at, 'activity.value 须为 高 / 中 / 低 / unknown');
    else if ((a.value === 'unknown') !== (a.status === 'unknown') || !['inferred', 'unknown'].includes(a.status)) err('I-13', at, '覆盖率计算得出时 status 为 inferred，无法计算时 value、status 都为 unknown');
    if (!isList(r.scenarios)) err('I-13', at, 'scenarios 须为数组');
    else {
      if (!r.scenarios.length && !nonEmpty(r.emptyReason)) err('I-13', at, 'scenarios 为空时须写 emptyReason');
      for (const id of r.scenarios) {
        if (!scenarioIds.has(id)) err('I-17', at, `引用的 Scenario ${id} 不存在`);
        else if (scenarios.find(s => s.id === id).region !== r.key) err('结构', at, `Scenario ${id} 不属于该地区`);
      }
      if (r.scenarios.length > 4) warn('粒度', at, '情境超过 4 个，可能拆得过细');
    }
  }

  // Scenario。
  for (const s of scenarios) {
    const at = s.id || 'scenario';
    if (!/^SCN-20\d{2}-\d{2}-[a-z]+-\d{2}$/.test(s.id || '')) err('结构', at, 'id 须为 SCN-<月份>-<地区>-<两位序号>');
    if (!REGION_KEYS.includes(s.region)) err('结构', at, 'region 不是地区 key');
    if (!isList(s.countries) || !s.countries.length) err('结构', at, 'countries 至少一个');
    // I-12：具体国家代码，不允许 other 或未归一化的大写代码。
    else for (const c of s.countries) if (!/^[a-z]{2}$/.test(c) || c === 'other') err('I-12', at, `countries 里的 ${c} 不是归一化的具体国家代码`);
    if (!['undergraduate', 'postgraduate'].includes(s.academicStage)) err('结构', at, 'academicStage 须为 undergraduate / postgraduate');
    if (!nonEmpty(s.phase) || !nonEmpty(s.keyTask)) err('结构', at, '须写 phase 与 keyTask');
    if (!RELATIONS.includes(s.targetRelation)) err('结构', at, 'targetRelation 须为 新签 / 续费 / 通用');
    const has = refs(s.evidenceRefs, at);
    if (!migrated && !has.length) err('结构', at, 'evidenceRefs 至少一个');
    const obs = s.observedRelation || {};
    if (!['新签', '续费', 'unknown'].includes(obs.value)) err('结构', at, 'observedRelation.value 须为 新签 / 续费 / unknown');
    // I-05：实际商业关系必须有业务证据。
    const obsRefs = refs(obs.evidenceRefs, `${at}.observedRelation`);
    if (obs.value && obs.value !== 'unknown' && !obsRefs.some(id => byId.get(id).kind === 'business')) err('I-05', at, '实际商业关系须至少有一条 business 类 Evidence');
  }

  // Claim。
  for (const c of claims) {
    const at = c.id || 'claim';
    if (!/^CLM-20\d{2}-\d{2}-\d+$/.test(c.id || '')) err('结构', at, 'id 须为 CLM-<月份>-<序号>');
    if (!scenarioIds.has(c.scenario)) err('I-17', at, `引用的 Scenario ${c.scenario} 不存在`);
    if (!CLAIM_TYPES.includes(c.claimType)) err('结构', at, `claimType 须为 ${CLAIM_TYPES.join(' / ')}`);
    if (!ORIGINS.includes(c.origin)) err('结构', at, 'origin 须为 skill / manual / migrated');
    if (!nonEmpty(c.text)) err('结构', at, '缺少 text');
    else if (units(c.text) > 40) warn('写作', at, '正文超过 40 字');
    judged(c, at);
    for (const id of c.dependsOn || []) if (!claimIds.has(id)) err('I-17', at, `依赖的 Claim ${id} 不存在`);
    // I-06：依据版本变化 ⇒ 依据已变化，不能进入新 revision。
    for (const id of c.evidenceRefs || []) {
      const e = byId.get(id);
      if (!e) continue;
      if (!c.refVersions || !(id in c.refVersions)) err('结构', at, `refVersions 缺少 ${id} 的版本`);
      else if (c.refVersions[id] !== e.evidenceVersion) { err('I-06', at, `依据 ${id} 已变化，须重新研判或由常浩确认保留`); changed.push(at); }
    }
    if (c.claimType === 'pain' && !['typical', 'observed'].includes(c.painKind)) err('结构', at, 'pain 须写 painKind');
    if (['need_strength', 'readiness'].includes(c.claimType) && (c.status === 'unknown' ? c.level != null : !['高', '中', '低'].includes(c.level))) err('结构', at, 'level 须为 高 / 中 / 低，unknown 时为空');
    if (['barrier', 'readiness'].includes(c.claimType) && !BOTH.includes(c.targetRelation) && c.targetRelation !== '通用') err('结构', at, 'targetRelation 须为 新签 / 续费 / 通用');
    if (c.claimType === 'barrier') {
      // I-11：编码在障碍体系 v2 内，适用人群与 targetRelation 相容。
      const fits = BARRIERS[c.barrierCode];
      if (!fits) err('I-11', at, `barrierCode ${c.barrierCode} 不在障碍体系 v2 内`);
      else if (c.targetRelation !== '通用' && !fits.includes(c.targetRelation)) err('I-11', at, `${c.barrierCode} 不适用于${c.targetRelation}`);
      else if (c.targetRelation === '通用' && fits.length < 2) err('I-11', at, `${c.barrierCode} 只适用于${fits[0]}，不能用于通用`);
      if (!['primary', 'secondary'].includes(c.barrierRole)) err('结构', at, 'barrierRole 须为 primary / secondary');
    }
    // I-15：正文不写编码，只提示。
    if (CODE_IN_PROSE.test(c.text || '')) warn('I-15', at, '正文里出现障碍编码或打法编号');
  }
  // I-11：同一情境、同一 targetRelation 下有障碍时，恰好一个主障碍。
  const primaries = new Map();
  for (const c of claims.filter(x => x.claimType === 'barrier')) {
    const k = `${c.scenario} · ${c.targetRelation}`;
    primaries.set(k, (primaries.get(k) || 0) + (c.barrierRole === 'primary' ? 1 : 0));
  }
  for (const [k, n] of primaries) if (n !== 1) err('I-11', k, `同一情境、同一人群下主障碍须恰好一个，现在是 ${n} 个`);

  // Opportunity、Strategy 在批 2 实现：批 1 只接受空数组。I-07、I-08、I-14、I-16 随对象在批 2 落地。
  for (const key of ['opportunities', 'strategies']) {
    if (doc[key] !== undefined && !isList(doc[key])) err('结构', key, `${key} 须为数组`);
    else if ((doc[key] || []).length) err('结构', key, `${key} 在批 2 实现，批 1 只接受空数组`);
  }
  if (doc.legacy !== undefined && !migrated) err('结构', 'legacy', 'legacy 只允许出现在迁移数据里');
  return { errors, warnings, changed };
}
