// 月度用户策略 · 旧版用户情况（v1，7 地区 × 6 格）迁移到 Schema v2（docs/策略规则/04-迁移映射.md，migration-v1.2）。
// 纯函数：旧记录 + 当月覆盖率 → v2 文档（带只读 legacy）；迁移检查与差异报告也在这里，脚本只负责备份、读写和落盘。
// 原则（04 第 2 节）：可信度只降不升，不编造新判断，「你写的」正文不动，对不上的进 legacy。
import { createHash } from 'node:crypto';
import { SCHEMA_VERSION } from './strategy-validate.mjs';
import { strategyWindow } from './user-strategy.mjs';

export const MIGRATION_VERSION = 'migration-v1.2';
export const MIGRATION_SCHEMA = SCHEMA_VERSION;

// 04 第 3 节：旧来源 → 状态、强度、限定。
export const SOURCE_MAP = {
  时间线: { status: 'inferred', evidenceStrength: 'partial', limitations: '旧版引用，未链接到具体证据' },
  规则推导: { status: 'inferred', evidenceStrength: 'weak', limitations: '旧版规则推导，对照表未成表' },
  'AI 判断': { status: 'inferred', evidenceStrength: 'weak', limitations: '旧版 AI 判断，无外部证据' },
  推测: { status: 'inferred', evidenceStrength: 'weak', limitations: '日期或事实未经确认' },
  原声: { status: 'inferred', evidenceStrength: 'partial', limitations: '旧版原声引用，未链接到具体证据' },
  你写的: { status: 'inferred', evidenceStrength: 'weak', limitations: '常浩写的，依据未追溯' },
};
// 04 第 5.2 节。
export const BARRIER_MAP = { A1: 'BR-M1', A2: 'BR-M2', A3: 'BR-M3', A4: 'BR-M4', B1: 'BR-C1', B2: 'BR-C2', B3: 'BR-C3', B4: 'BR-C4', C1: 'BR-O1' };
// 02 第 2.3 节：只有节点位置或学校政策时，这两类障碍只能 unknown（04 第 3 节的例外）。
const BEHAVIOR_ONLY = ['BR-M2', 'BR-M5'];
const TEMP_LEVEL = { 冷: '低', 温: '中', 热: '高' };
// 05 第 7 节默认矩阵：活跃度 × 地区组。
const MATRIX = { 高: ['主战场', '主战场', '次要'], 中: ['主战场', '次要', '平稳'], 低: ['次要', '平稳', '平稳'] };
const GROUP = { uk: 0, us: 0, hk: 1, au: 1, ca: 1, other: 2 };
export const defaultPriority = (key, activity) => MATRIX[activity]?.[GROUP[key]] ?? null;

const MAIN = ['uk', 'us', 'hk', 'au', 'ca'];
const OLD_KEYS = [...MAIN, 'sg', 'other'];
// 04 第 5.1 节：旧地区 → 新地区与迁移情境。
const SCENARIO_OF = { uk: ['uk', '01', ['uk']], us: ['us', '01', ['us']], hk: ['hk', '01', ['hk']], au: ['au', '01', ['au']], ca: ['ca', '01', ['ca']], sg: ['other', '01', ['sg']], other: ['other', '02', ['nz', 'mo', 'ie', 'my']] };
export const OTHER_REASON = '待研判：由旧 sg 与旧 other 合并，旧分档见 legacy';
const LEGACY_CELLS = ['node', 'opp', 'master'];

const judged = source => {
  const m = SOURCE_MAP[source];
  if (!m) throw new Error(`未知的旧来源「${source}」`);
  return { ...m, origin: source === '你写的' ? 'manual' : 'migrated' };
};
const stable = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
// 迁移内容指纹：去掉随当前时间线重算的部分（activity、priority.default），用于「常浩看过的报告」与切换时的内容比对。
export const contentFingerprint = doc => stable({ ...doc, regions: doc.regions.map(({ activity, priority, ...r }) => ({ ...r, priority: { value: priority.value, reason: priority.reason } })) });

/**
 * @param v1 旧版整月记录（内置 JSON，或本地修改后的 v3_documents 记录）
 * @param ctx.month 月份
 * @param ctx.coverage 服务端按当前时间线算出的各地区覆盖率（strategy-service facts().coverage）
 * @param ctx.source { kind: '内置' | '已修改', ref, updatedAt }
 */
export function migrateMonth(v1, { month, coverage, source }) {
  if (!v1 || v1.month !== month) throw new Error(`${month} 的旧记录缺失或月份不符`);
  const byKey = Object.fromEntries((v1.regions || []).map(r => [r.key, r]));
  for (const k of OLD_KEYS) if (!byKey[k]) throw new Error(`${month} 旧记录缺少地区 ${k}`);
  const tiers = Object.fromEntries((v1.overview?.tiers || []).map(([k, value, reason]) => [k, { value, reason }]));
  let seq = 0;
  const claimId = () => `CLM-${month}-${++seq}`;
  const scenarios = [], claims = [], legacyRegions = {};

  for (const k of OLD_KEYS) {
    const r = byKey[k], [region, no, countries] = SCENARIO_OF[k];
    if (!r.task?.length) throw new Error(`${month} ${k} 没有 task，无法生成迁移情境`);
    const id = `SCN-${month}-${region}-${no}`;
    scenarios.push({ id, region, countries, academicStage: 'undergraduate', phase: r.task[0][0], keyTask: r.task[0][0], targetRelation: '新签',
      observedRelation: { value: 'unknown', evidenceRefs: [] }, evidenceRefs: [] });
    const base = (claimType, text, src, extra = {}) => ({ id: claimId(), scenario: id, claimType, text, ...judged(src), evidenceRefs: [], refVersions: {}, ...extra });
    for (const [text, src] of r.task) claims.push(base('task', text, src));
    for (const [text, src] of r.pain) claims.push(base('pain', text, src, { painKind: 'typical' }));
    // 需求温度 + tempNote 第一条 → 一条 need_strength；第二条起进 legacy（v1.2）。
    const [note, ...restNotes] = r.tempNote || [];
    if (!note) throw new Error(`${month} ${k} 没有 tempNote`);
    claims.push(base('need_strength', `原需求温度：${r.temp[0]} → ${r.temp[1]}；${note[0]}`, note[1], { level: TEMP_LEVEL[r.temp[1]] }));
    claims.push({ id: claimId(), scenario: id, claimType: 'readiness', text: '旧版未区分购买准备度', status: 'unknown', evidenceStrength: 'none', evidenceRefs: [], refVersions: {},
      gap: '旧版未区分购买准备度', route: { status: 'unavailable', source: 'SRC-crm', reason: '没有购买行为数据' }, level: null, targetRelation: '新签', origin: 'migrated' });
    r.barrier.forEach(([old, text, src], i) => {
      const barrierCode = BARRIER_MAP[old];
      if (!barrierCode) throw new Error(`${month} ${k} 障碍编号 ${old} 不在迁移表内`);
      const c = base('barrier', text, src, { barrierCode, targetRelation: '新签', barrierRole: i === 0 ? 'primary' : 'secondary' });
      if (BEHAVIOR_ONLY.includes(barrierCode)) {
        // 只降不升：02 第 2.3 节要求这类障碍没有用户决策行为证据时写 unknown。
        Object.assign(c, { status: 'unknown', evidenceStrength: 'none', gap: `旧版${src === '你写的' ? '常浩写的' : ' AI 判断'}，只有节点位置，缺少用户决策行为证据`,
          route: { status: 'available', source: 'SRC-bizcard', suggestion: '在业务背景卡补咨询、成交或流失的业务观察' } });
        delete c.limitations;
      }
      claims.push(c);
    });
    legacyRegions[k] = { name: r.name, tier: r.tier, ...Object.fromEntries(LEGACY_CELLS.map(cell => [cell, r[cell] || []])), tempNote: restNotes };
  }
  legacyRegions.other.tiers = { sg: tiers.sg, other: tiers.other };

  const regions = [...MAIN, 'other'].map(key => {
    const c = coverage?.[key];
    if (!c) throw new Error(`${month} 缺少 ${key} 的覆盖率`);
    const activity = { value: c.value, status: c.status, ratio: c.ratio ?? null, dateQuality: c.dateQuality, coverage: c.coverage, byCountry: c.byCountry ?? null };
    const fallback = defaultPriority(key, c.value);
    const priority = key === 'other' ? { value: null, default: fallback, reason: OTHER_REASON } : { value: tiers[key].value, default: fallback, reason: tiers[key].reason };
    return { key, priority, activity, scenarios: scenarios.filter(s => s.region === key).map(s => s.id), emptyReason: null };
  });
  const brief = { judgement: { text: v1.summary.judgement, claims: [] } };
  for (const k of ['common', 'diff', 'external']) brief[k] = (v1.overview[k] || []).map(([text, src]) => ({ text, ...judged(src), evidenceRefs: [] }));

  return {
    schemaVersion: SCHEMA_VERSION, month, migrated: true, window: strategyWindow(month),
    producedBy: { declared: null, migration: MIGRATION_VERSION },
    brief, regions, scenarios, claims, opportunities: [], strategies: [],
    research: { rejected: [], assumptions: [], notes: [...(v1.appendix?.pending || [])] },
    legacy: { migration: MIGRATION_VERSION, source: { ...source, timelineSyncedAt: v1.timelineSyncedAt ?? null, preparedAt: v1.preparedAt ?? null, updatedAt: v1.updatedAt ?? source?.updatedAt ?? null },
      regions: legacyRegions, opportunities: v1.opportunities || [], promo: v1.strategy ?? null },
  };
}

/* ---------------- 迁移检查（04 第 7 节第 4 步；反例 16）：从旧记录和新文档各自重数，不信任迁移过程自己的记账 ---------------- */
export function migrationChecks(v1, doc, validation) {
  const out = [];
  const check = (name, ok, detail = '') => out.push({ name, ok: Boolean(ok), detail });
  const claimsOf = (scn, type) => doc.claims.filter(c => c.scenario === scn && c.claimType === type);
  const byKey = Object.fromEntries(v1.regions.map(r => [r.key, r]));
  const rows = [], bad = [];
  const row = (field, before, migrated, legacy = 0) => { rows.push({ field, before, migrated, legacy, ok: before === migrated + legacy }); if (before !== migrated + legacy) bad.push(field); };

  row('核心判断', 1, doc.brief.judgement.text === v1.summary.judgement ? 1 : 0);
  for (const k of ['common', 'diff', 'external']) row(`1.2 ${k}`, v1.overview[k].length, doc.brief[k].length);
  const other = doc.regions.find(r => r.key === 'other');
  row('1.3 分档', v1.overview.tiers.length, MAIN.filter(k => doc.regions.find(r => r.key === k)?.priority.value === v1.overview.tiers.find(t => t[0] === k)?.[1]).length,
    ['sg', 'other'].filter(k => doc.legacy.regions.other.tiers?.[k]?.value === v1.overview.tiers.find(t => t[0] === k)?.[1]).length);
  for (const k of OLD_KEYS) {
    const r = byKey[k], scn = `SCN-${doc.month}-${SCENARIO_OF[k][0]}-${SCENARIO_OF[k][1]}`, lg = doc.legacy.regions[k] || {};
    row(`${k} · task`, r.task.length, claimsOf(scn, 'task').length);
    row(`${k} · pain`, r.pain.length, claimsOf(scn, 'pain').length);
    row(`${k} · barrier`, r.barrier.length, claimsOf(scn, 'barrier').length);
    row(`${k} · 温度 + tempNote`, 1 + r.tempNote.length, claimsOf(scn, 'need_strength').length * 2, (lg.tempNote || []).length);
    for (const cell of LEGACY_CELLS) row(`${k} · ${cell}`, (r[cell] || []).length, 0, (lg[cell] || []).length);
  }
  row('机会收敛', (v1.opportunities || []).length, 0, doc.legacy.opportunities.length);
  row('待你确认', (v1.appendix?.pending || []).length, doc.research.notes.length);
  row('旧促销', v1.strategy ? 1 : 0, 0, doc.legacy.promo && JSON.stringify(doc.legacy.promo) === JSON.stringify(v1.strategy) ? 1 : 0);
  const total = rows.reduce((a, x) => ({ before: a.before + x.before, after: a.after + x.migrated + x.legacy }), { before: 0, after: 0 });
  check('条目数守恒（新对象 + legacy = 旧条目）', !bad.length && total.before === total.after, bad.length ? `不守恒：${bad.join('、')}` : `${total.before} = ${total.after}`);

  // 逐条对照：正文逐字一致；状态按来源换算；「AI 判断」「你写的」为 inferred + weak（BR-M2/M5 按 02 §2.3 为 unknown）。
  const pairs = [];
  for (const k of ['common', 'diff', 'external']) v1.overview[k].forEach(([text, src], i) => pairs.push({ at: `brief.${k}[${i}]`, text, src, item: doc.brief[k][i] }));
  for (const k of OLD_KEYS) {
    const r = byKey[k], scn = `SCN-${doc.month}-${SCENARIO_OF[k][0]}-${SCENARIO_OF[k][1]}`;
    r.task.forEach(([text, src], i) => pairs.push({ at: `${k}.task[${i}]`, text, src, item: claimsOf(scn, 'task')[i] }));
    r.pain.forEach(([text, src], i) => pairs.push({ at: `${k}.pain[${i}]`, text, src, item: claimsOf(scn, 'pain')[i] }));
    r.barrier.forEach(([, text, src], i) => pairs.push({ at: `${k}.barrier[${i}]`, text, src, item: claimsOf(scn, 'barrier')[i], barrier: true }));
    const [t, s] = r.tempNote[0];
    pairs.push({ at: `${k}.tempNote[0]`, text: t, src: s, item: claimsOf(scn, 'need_strength')[0], suffix: true });
  }
  const textOk = p => p.item && (p.suffix ? p.item.text.endsWith(`；${p.text}`) : p.item.text === p.text);
  const wrongText = pairs.filter(p => !textOk(p));
  check('正文逐字一致（全部迁移条目）', !wrongText.length, wrongText.slice(0, 5).map(p => p.at).join('、'));
  const manual = pairs.filter(p => p.src === '你写的');
  const badManual = manual.filter(p => !textOk(p) || p.item.origin !== 'manual');
  check('「你写的」origin=manual 且正文逐字一致', !badManual.length, `${manual.length} 条${badManual.length ? `；不符：${badManual.map(p => p.at).join('、')}` : ''}`);
  const forged = doc.claims.filter(c => c.origin === 'manual').length + ['common', 'diff', 'external'].flatMap(k => doc.brief[k]).filter(x => x.origin === 'manual').length;
  check('没有凭空出现的 manual', forged === manual.length, `新文档 manual ${forged} 条，旧「你写的」${manual.length} 条`);
  const downgrade = p => p.barrier && BEHAVIOR_ONLY.includes(p.item?.barrierCode);
  const badWeak = pairs.filter(p => ['AI 判断', '你写的'].includes(p.src) && p.item && !(downgrade(p) ? p.item.status === 'unknown' : p.item.status === 'inferred' && p.item.evidenceStrength === 'weak'));
  check('「AI 判断」「你写的」为 inferred + weak（BR-M2/M5 为 unknown）', !badWeak.length, badWeak.slice(0, 5).map(p => p.at).join('、'));
  const badMap = pairs.filter(p => p.item && !downgrade(p) && (p.item.status !== SOURCE_MAP[p.src].status || p.item.evidenceStrength !== SOURCE_MAP[p.src].evidenceStrength));
  check('状态与强度按 04 第 3 节换算', !badMap.length, badMap.slice(0, 5).map(p => p.at).join('、'));

  const known = [];
  const walk = (v, at) => { if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`)); else if (v && typeof v === 'object') { if (v.status === 'known') known.push(at); for (const [k, x] of Object.entries(v)) if (k !== 'legacy') walk(x, `${at}.${k}`); } };
  walk({ brief: doc.brief, scenarios: doc.scenarios, claims: doc.claims }, 'doc');
  check('没有 known', !known.length, known.slice(0, 5).join('、'));
  check('迁移 Claim 的 refVersions 为空、origin 为 migrated 或 manual', doc.claims.every(c => !Object.keys(c.refVersions || {}).length && !(c.evidenceRefs || []).length && ['migrated', 'manual'].includes(c.origin)));
  const lt = doc.legacy.regions.other.tiers || {};
  check('新 other 的 priority 为 null，旧 sg、旧 other 两档在 legacy', other?.priority.value === null && String(other.priority.reason).includes('待研判') && lt.sg?.value && lt.other?.value,
    `旧 sg：${lt.sg?.value}；旧 other：${lt.other?.value}`);
  check('校验器 0 错误', validation.errors.length === 0, validation.errors.slice(0, 5).map(e => `${e.rule} ${e.at}：${e.message}`).join('；'));
  return { ok: out.every(c => c.ok), checks: out, rows, total };
}

/* ---------------- 差异报告（04 第 7 节第 3 步）：每月一份 ---------------- */
export function diffReport(v1, doc, { checks, validation, source, fingerprint }) {
  const L = [];
  const statusOf = x => `${x.status} + ${x.evidenceStrength}`;
  L.push(`# ${doc.month} 迁移差异报告（${MIGRATION_VERSION}，schema ${SCHEMA_VERSION}）`, '');
  L.push(`- 旧记录来源：${source.kind}（${source.ref}${source.updatedAt ? `，最后修改 ${source.updatedAt}` : ''}）`);
  L.push(`- 迁移内容指纹：\`${fingerprint}\`（不含随时间线重算的覆盖率与默认优先级；切换时据此比对）`);
  L.push(`- 自动检查：${checks.ok ? '全部通过' : '有未通过项'}；校验器错误 ${validation.errors.length}，提示 ${validation.warnings.length}`, '');
  L.push('## 自动检查', '', '| 检查 | 结果 | 说明 |', '|---|---|---|');
  for (const c of checks.checks) L.push(`| ${c.name} | ${c.ok ? '通过' : '**未通过**'} | ${c.detail || ''} |`);
  L.push('', '## 条目数前后对比', '', '| 字段 | 旧条目 | 进新对象 | 进 legacy | 守恒 |', '|---|---|---|---|---|');
  for (const r of checks.rows) L.push(`| ${r.field} | ${r.before} | ${r.migrated} | ${r.legacy} | ${r.ok ? '是' : '**否**'} |`);
  L.push(`| 合计 | ${checks.total.before} | | ${checks.total.after}（新对象 + legacy） | ${checks.total.before === checks.total.after ? '是' : '**否**'} |`);
  const readiness = doc.claims.filter(c => c.claimType === 'readiness').length;
  L.push('', `另按映射新增（不来自旧条目）：迁移情境 ${doc.scenarios.length} 个、购买准备度（unknown）${readiness} 条、六个地区的覆盖率由当前时间线重算。`);

  L.push('', '## 状态换算明细', '', '| 对象 | 旧来源 | 迁移后 | 条数 |', '|---|---|---|---|');
  const tally = new Map();
  const add = (kind, src, x) => { const k = `${kind}|${src}|${statusOf(x)}`; tally.set(k, (tally.get(k) || 0) + 1); };
  for (const k of ['common', 'diff', 'external']) v1.overview[k].forEach(([, src], i) => add(`1.2 ${k}`, src, doc.brief[k][i]));
  const byKey = Object.fromEntries(v1.regions.map(r => [r.key, r]));
  for (const k of OLD_KEYS) {
    const scn = `SCN-${doc.month}-${SCENARIO_OF[k][0]}-${SCENARIO_OF[k][1]}`, list = t => doc.claims.filter(c => c.scenario === scn && c.claimType === t);
    byKey[k].task.forEach(([, src], i) => add('task', src, list('task')[i]));
    byKey[k].pain.forEach(([, src], i) => add('pain', src, list('pain')[i]));
    byKey[k].barrier.forEach(([, , src], i) => add('barrier', src, list('barrier')[i]));
    add('need_strength', byKey[k].tempNote[0][1], list('need_strength')[0]);
  }
  for (const [k, n] of [...tally].sort()) { const [kind, src, st] = k.split('|'); L.push(`| ${kind} | ${src} | ${st} | ${n} |`); }
  const down = doc.claims.filter(c => c.claimType === 'barrier' && c.status === 'unknown');
  if (down.length) {
    L.push('', `### 障碍按 02 §2.3 降为 unknown（${down.length} 条，旧 A2「觉得还来得及」）`, '');
    for (const c of down) L.push(`- ${c.scenario} · ${c.text}`);
  }

  L.push('', '## 地区优先级与覆盖率', '', '| 地区 | 迁移后优先级 | 默认建议（05 §7） | 覆盖率（当前时间线） | 理由 |', '|---|---|---|---|---|');
  for (const r of doc.regions) {
    const a = r.activity;
    L.push(`| ${r.key} | ${r.priority.value ?? '空（待研判）'} | ${r.priority.default ?? '无（活跃度未知）'}${r.priority.value && r.priority.default && r.priority.value !== r.priority.default ? ' ⚠ 不一致' : ''} | ${a.value}${a.ratio != null ? `（${Math.round(a.ratio * 100)}%，${a.coverage.active}/${a.coverage.calculable}）` : ''} | ${r.priority.reason} |`);
  }
  const lt = doc.legacy.regions.other.tiers;
  L.push('', `合并前的两档（存进 legacy.regions.other.tiers）：旧 sg「${lt.sg.value}」— ${lt.sg.reason}；旧 other「${lt.other.value}」— ${lt.other.reason}`);
  const mismatch = v1.regions.filter(r => { const t = v1.overview.tiers.find(x => x[0] === r.key); return t && t[1] !== r.tier; });
  L.push('', `旧版 overview.tiers 与 regions[].tier 不一致：${mismatch.length ? mismatch.map(r => `${r.key}（overview ${v1.overview.tiers.find(x => x[0] === r.key)[1]}，regions ${r.tier}；以 overview 为准）`).join('、') : '无'}`);

  L.push('', '## 进入 legacy 的内容（只读）', '', '| 旧地区 | 关键节点 node | 机会点 opp | 硕士 master | tempNote 第二条起 |', '|---|---|---|---|---|');
  for (const k of OLD_KEYS) { const g = doc.legacy.regions[k]; L.push(`| ${k} | ${g.node.length} | ${g.opp.length} | ${g.master.length} | ${g.tempNote.length} |`); }
  L.push('', `- 机会收敛表：${doc.legacy.opportunities.length} 条（Opportunity 批 2 实现前存 legacy.opportunities）`);
  L.push(`- 旧促销：${doc.legacy.promo ? `有（状态「${doc.legacy.promo.status ?? '未知'}」，整段存 legacy.promo，与新方案对比时标「不可比较」）` : '无'}`);
  L.push(`- 待你确认（appendix.pending）→ research.notes：${doc.research.notes.length} 条；appendix.guesses、markers、lanes、counts 不迁移（由代码重算）`);

  if (validation.warnings.length) {
    const byRule = {};
    for (const w of validation.warnings) byRule[w.rule] = (byRule[w.rule] || 0) + 1;
    L.push('', '## 校验提示（不拦截）', '', Object.entries(byRule).map(([k, n]) => `- ${k}：${n} 条`).join('\n'));
  }
  return L.join('\n') + '\n';
}
