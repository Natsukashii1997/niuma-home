// 月度用户策略 · 时间线 Evidence（docs/策略规则/03-Schema-v2.md §2.1、§3.1，schema 2.1）。
// 输入是已叠加官网核验与人工裁定的时间线（withRulings 的结果）；纯函数，不读库、不改输入。
import { createHash } from 'node:crypto';
import { guessRe } from './timeline.mjs';

export const REGION_KEYS = ['uk', 'us', 'hk', 'au', 'ca', 'other'];
const OWN_REGION = new Set(['uk', 'us', 'hk', 'au', 'ca']);
const KNOWN_COUNTRIES = new Set(['us', 'uk', 'hk', 'au', 'ca', 'sg', 'my', 'nz', 'mo', 'ie']);
const EVENT_TYPES = ['Final', '期中', 'Essay 截止', '补考', '出分', '选课', '开学', 'Reading Week', '期中假'];

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

// 时间线代码（UK、UK@2027）→ { country, year, region }；没有年份后缀的取首年。
export function normalizeCountry(code, baseYear) {
  const [raw, tag] = String(code).split('@');
  const country = raw.toLowerCase();
  return { country, year: tag ? Number(tag) : baseYear, region: OWN_REGION.has(country) ? country : 'other' };
}
// 快照的首年：没有年份后缀的地区代码属于它。
export const baseYearOf = timeline => timeline.years?.[0]?.year ?? 2026;
export const schoolLabel = ({ school, abbr }) => [school, abbr].filter(Boolean).join(' ');
export const normalizeEventType = type => EVENT_TYPES.includes(type) ? type : '其他';

// 锚点类型：docs/策略规则/05-需求生命周期.md 第 3 节。
export function anchorTypeOf(eventType, header, { from, to } = {}) {
  if (['Final', '期中', '补考', '开学', 'Reading Week', '期中假'].includes(eventType)) return 'start';
  if (eventType === 'Essay 截止') return 'deadline';
  if (eventType === '出分') return 'release';
  if (eventType === '选课') {
    if (/截止/.test(header)) return 'deadline';
    if (from && to && from < to && /选课时间|学期选课|选课期|开放/.test(header)) return 'period';
    if (/开始|开放/.test(header)) return 'start';
    return 'anchor_unknown';
  }
  // 其他类只作情境信息：明确「截止」的取截止日，其余判断不出锚点含义。
  return /截止/.test(header) ? 'deadline' : 'anchor_unknown';
}

const scopeOf = raw => [...new Set(String(raw || '').match(/研究生|本科生|国际生/g) || [])].join('、') || undefined;
const cellKeyOf = (info, year) => hash([year, info.sheet, schoolLabel(info), info.header, info.ord]);
const rowOf = src => src.match(/(\d+)$/)?.[1];

// 一个时间线事件的核验状态与生效来源：官网核实 > 人工裁定 > 冲突 / 推测 > 原表。
function verificationOf(event) {
  if (event.verified) return ['verified', 'SRC-official'];
  if (event.ruled) return ['ruled', 'SRC-ruling'];
  if (event.flag === 'conflict') return ['conflict', 'SRC-timeline'];
  if (event.flag === 'guess') return ['guess', 'SRC-timeline'];
  return ['source', 'SRC-timeline'];
}

/**
 * @param timeline 叠加核验、裁定后的时间线快照（含 cellIndex）
 * @param options.previous 上一次返回的 segmentIndex（cellKey → 片段键列表），用于判定片段重排的 ambiguous
 * @param options.snapshot 来源快照指纹，写进 source.snapshot
 * @returns {{ evidence, anomalies, segmentIndex }}
 */
export function buildEvidence(timeline, { previous = {}, snapshot = '' } = {}) {
  const index = timeline.cellIndex || {};
  const baseYear = baseYearOf(timeline);
  const anomalies = [];
  const candidates = [];

  // 0. 身份碰撞（同一年份、同一地区表里两行同名学校）：整校隔离，各行都不生成 Evidence，进同步报告。
  const rowsBySchool = new Map();
  for (const [src, info] of Object.entries(index)) {
    const key = JSON.stringify([normalizeCountry(info.code, baseYear).year, info.sheet, schoolLabel(info)]);
    (rowsBySchool.get(key) || rowsBySchool.set(key, new Map()).get(key)).set(src, info);
  }
  const isolatedSrc = new Set();
  for (const cells of rowsBySchool.values()) {
    const rows = new Set([...cells.keys()].map(rowOf));
    if (rows.size < 2) continue;
    for (const src of cells.keys()) isolatedSrc.add(src);
    const first = cells.values().next().value;
    anomalies.push({ type: 'identityConflict', school: schoolLabel(first), sheet: first.sheet,
      sources: [...cells].map(([ref, info]) => ({ ref, header: info.header, raw: info.raw, snapshot })) });
  }
  for (const info of Object.values(index)) {
    const { country } = normalizeCountry(info.code, baseYear);
    if (!KNOWN_COUNTRIES.has(country) && !anomalies.some(a => a.type === 'unknownCountry' && a.code === info.code)) anomalies.push({ type: 'unknownCountry', code: info.code, country });
  }

  // 1. 精确日期事件：同一来源格的多个片段按标签定位，没有标签（或标签重复）才用「序号/总数」。
  const bySrc = new Map();
  for (const e of timeline.agenda || []) (bySrc.get(e.src) || bySrc.set(e.src, []).get(e.src)).push(e);
  for (const [src, events] of bySrc) {
    const info = index[src];
    if (!info) { anomalies.push({ type: 'cellIndexMissing', ref: src }); continue; }
    if (isolatedSrc.has(src)) continue;
    // 片段位置取解析器（或核验、裁定）给的原格顺序，不按日期排，日期改动不会让身份漂移。
    events.sort((a, b) => (a.segment ?? 0) - (b.segment ?? 0) || a.from.localeCompare(b.from));
    const labels = events.map(e => e.detail).filter(Boolean);
    events.forEach((e, i) => {
      const unique = e.detail && labels.filter(l => l === e.detail).length === 1;
      const seg = events.length === 1 ? '' : unique ? `L:${e.detail}` : `#${i + 1}/${events.length}`;
      const [verification, sourceId] = verificationOf(e);
      candidates.push({ src, info, seg, dates: { from: e.from, to: e.to, precision: 'day' }, rawType: e.type, verification, sourceId });
    });
  }

  // 2. 只有月份的格子：没有精确事件、没有被裁定排除、原文能读出具体月份。
  for (const a of timeline.anomalies || []) {
    if (!a.cell || bySrc.has(a.src) || isolatedSrc.has(a.src) || a.ruling?.decision === 'exclude') continue;
    const info = index[a.src];
    const months = (a.monthHints || []).filter(m => /^20\d{2}-\d{2}$/.test(m));
    if (!info || !months.length || candidates.some(c => c.src === a.src)) continue;
    candidates.push({ src: a.src, info, seg: '', dates: { from: null, to: null, precision: 'month', months }, rawType: a.cell.type, verification: guessRe.test(`${info.raw} ${info.header}`) ? 'guess' : 'source', sourceId: 'SRC-timeline' });
  }

  // 3. 身份 = 年份 + 地区表 + 学校键 + 列名 + 同名列序号 + 片段身份；不含单元格地址和原文。
  for (const c of candidates) {
    const { country, year } = normalizeCountry(c.info.code, baseYear);
    c.year = year; c.country = country;
    c.cellKey = cellKeyOf(c.info, year);
    c.id = `EV-${hash([year, c.info.sheet, schoolLabel(c.info), c.info.header, c.info.ord, c.seg])}`;
  }

  // 4. 片段重排：同一格的片段键与上一次不一致时，对不上的新片段标 ambiguous（新键本身就是新 ID，不复用旧 ID）。
  const segmentIndex = {};
  for (const c of candidates) (segmentIndex[c.cellKey] ||= []).push(c.seg);
  for (const keys of Object.values(segmentIndex)) keys.sort();

  const evidence = candidates.map(c => {
    const old = previous[c.cellKey];
    const changed = old && (old.length !== segmentIndex[c.cellKey].length || old.some((k, i) => k !== segmentIndex[c.cellKey][i]));
    const header = c.info.header;
    const eventType = normalizeEventType(c.rawType);
    const anchorType = anchorTypeOf(eventType, header, c.dates);
    const scope = scopeOf(c.info.raw);
    return {
      evidenceId: c.id,
      evidenceVersion: hash([c.dates, eventType, anchorType, scope ?? null, c.verification, header]),
      kind: 'timeline', sourceId: c.sourceId, year: c.year, country: c.country, school: schoolLabel(c.info), header, eventType, anchorType,
      dates: c.dates, verification: c.verification, ...(scope && { scope }), ambiguous: Boolean(changed && !old.includes(c.seg)),
      source: { ref: c.src, raw: c.info.raw, snapshot },
    };
  });
  const seen = new Set();
  for (const e of evidence) {
    if (seen.has(e.evidenceId)) anomalies.push({ type: 'duplicateEvidenceId', evidenceId: e.evidenceId });
    seen.add(e.evidenceId);
  }
  evidence.sort((a, b) => (a.dates.from || a.dates.months[0]).localeCompare(b.dates.from || b.dates.months[0]) || a.evidenceId.localeCompare(b.evidenceId));
  return { evidence, anomalies, segmentIndex };
}
