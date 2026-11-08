// 月度用户策略 · 需求生命周期窗口与候选行动窗口覆盖率（docs/策略规则/05-需求生命周期.md，lifecycle-v0.2）。
// 纯函数：Evidence → 窗口；时间线学校名单 + 窗口 → 各地区覆盖率。天数是候选启发式参数，改动须走方法论修订流程。
import { baseYearOf, normalizeCountry, REGION_KEYS, schoolLabel } from './strategy-evidence.mjs';

export const LIFECYCLE_VERSION = 'lifecycle-v0.2';
const CATEGORY = { Final: 'Final', 期中: '期中', 'Essay 截止': 'Essay', 补考: '补考', 出分: '出分', 选课: '选课', 开学: '开学', 'Reading Week': '假期', 期中假: '假期' };
// [need 起, need 止, action 起, action 止]，相对锚点日 T 的天数。
const OFFSETS = { Final: [-42, -1, -28, -5], 期中: [-28, -1, -21, -3], Essay: [-28, -1, -21, -3], 出分: [0, 14, 0, 10], 选课: [-30, -1, -21, -2], 开学: [-45, 14, -30, 7] };
const NEXT = { Final: '出分、学期衔接、可能的补考', 期中: '课程后续任务、Final', Essay: '后续作业、反馈、考试', 补考: '出分、后续修课', 出分: '复盘、补考或新学期规划', 选课: '课程确认、开学准备', 开学: '课程适应、第一次重要考核' };
export const THRESHOLDS = { high: 0.4, mid: 0.15 };

const shift = (iso, days) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const span = (from, to) => ({ from, to });
const overlaps = (w, from, to) => w && w.from <= to && w.to >= from;

// 能否计算窗口（05 第 5 节）；不能时给出原因。
function blocked(e) {
  if (e.dates.precision !== 'day') return '只有月份，不计算精确窗口';
  if (e.verification === 'conflict') return '冲突未决，不计算窗口';
  if (e.anchorType === 'anchor_unknown') return '锚点不明，不计算窗口';
  if (e.ambiguous) return '片段无法与旧片段对应，不计算精确窗口';
  return null;
}

/** 每条 Evidence 的窗口：{ evidenceId, category, need, action, next, ruleVersion, status, limitations } 或 { evidenceId, skipped }。 */
export function lifecycleWindows(evidence) {
  const releases = evidence.filter(e => e.eventType === '出分' && !blocked(e));
  return evidence.map(e => {
    const category = CATEGORY[e.eventType];
    if (!category) return { evidenceId: e.evidenceId, skipped: '不属于八类，只作情境信息' };
    if (category === '假期') return { evidenceId: e.evidenceId, category, skipped: '假期不默认推出需求窗口' };
    const reason = blocked(e);
    if (reason) return { evidenceId: e.evidenceId, category, skipped: reason };
    const ruleVersion = `${LIFECYCLE_VERSION}/${category}`;
    const status = ['verified', 'ruled'].includes(e.verification) ? 'known' : 'inferred';
    const limitations = e.verification === 'guess' ? ['假设：日期来源标为推测'] : [];
    const base = { evidenceId: e.evidenceId, category, next: NEXT[category], ruleVersion, limitations };
    if (category === '选课' && e.anchorType === 'period')
      return { ...base, need: null, action: span(e.dates.from, e.dates.to), status: 'inferred' };
    if (category === '选课' && e.anchorType !== 'deadline')
      return { evidenceId: e.evidenceId, category, skipped: '选课开始只说明开放，不生成截止前窗口' };
    const T = e.anchorType === 'deadline' ? e.dates.to : e.dates.from;
    if (category === '补考') {
      // 公告日未知：以同校出分日作为替代锚点（回看不超过 28 天，近似「同一学期」），否则 T-28。
      const proxy = releases.filter(r => r.school === e.school && r.country === e.country && r.dates.from >= shift(T, -28) && r.dates.from < T).map(r => r.dates.from).sort().at(-1);
      const start = proxy || shift(T, -28);
      return { ...base, need: span(start, shift(T, -1)), action: start <= shift(T, -3) ? span(start, shift(T, -3)) : null, status: 'inferred',
        limitations: [...limitations, proxy ? '公告日未知，以出分日作为替代锚点' : '公告日未知，以 T-28 作为起点'] };
    }
    const [n1, n2, a1, a2] = OFFSETS[category];
    return { ...base, need: span(shift(T, n1), shift(T, n2)), action: span(shift(T, a1), shift(T, a2)), status };
  });
}

const monthRange = month => {
  const [y, m] = month.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { from: `${month}-01`, to: `${next}-14` };
};
const level = ratio => ratio >= THRESHOLDS.high ? '高' : ratio >= THRESHOLDS.mid ? '中' : '低';

function summarize(schools, events, windowById, range) {
  const calc = new Set(), active = new Set();
  const dateQuality = { verified: 0, ruled: 0, source: 0, guess: 0 };
  for (const e of events) {
    const w = windowById.get(e.evidenceId);
    if (!w?.action) continue;
    const key = `${e.country}|${e.school}`;
    calc.add(key);
    dateQuality[e.verification] = (dateQuality[e.verification] || 0) + 1;
    if (overlaps(w.action, range.from, range.to)) active.add(key);
  }
  const coverage = { schools: schools.size, calculable: calc.size, active: active.size, notCovered: calc.size - active.size, insufficient: schools.size - calc.size };
  if (!calc.size) return { value: 'unknown', status: 'unknown', ratio: null, dateQuality, coverage };
  const ratio = Math.round(active.size / calc.size * 1000) / 1000;
  return { value: level(ratio), status: 'inferred', ratio, dateQuality, coverage };
}

/** 目标月各地区的候选行动窗口覆盖率（05 第 6 节）。学校名单取时间线表格，同一学校跨年份只算一次。 */
export function regionCoverage(timeline, evidence, windows, month) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('month 须为 YYYY-MM');
  const range = monthRange(month);
  const baseYear = baseYearOf(timeline);
  const windowById = new Map(windows.map(w => [w.evidenceId, w]));
  const schools = {};
  for (const [code, rows] of Object.entries(timeline.table || {})) {
    const { country, region } = normalizeCountry(code, baseYear);
    for (const row of rows) ((schools[region] ||= {})[country] ||= new Set()).add(`${country}|${schoolLabel(row)}`);
  }
  const out = {};
  for (const region of REGION_KEYS) {
    const byCountry = schools[region] || {};
    const all = new Set(Object.values(byCountry).flatMap(s => [...s]));
    const events = evidence.filter(e => e.country in byCountry || (region !== 'other' && e.country === region));
    out[region] = { ...summarize(all, events, windowById, range), range, ruleVersion: LIFECYCLE_VERSION,
      byCountry: region === 'other' ? Object.fromEntries(Object.entries(byCountry).map(([c, s]) => [c, summarize(s, events.filter(e => e.country === c), windowById, range)])) : null };
  }
  return out;
}
