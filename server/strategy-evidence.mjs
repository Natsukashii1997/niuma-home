// 月度用户策略 · 时间线 Evidence（docs/策略规则/03-Schema-v2.md §2.1、§3.1，schema 2.1）。
// 输入是已叠加官网核验与人工裁定的时间线（withRulings 的结果）；纯函数，不读库、不改输入。
import { createHash } from 'node:crypto';
import { guessRe } from './timeline.mjs';

export const SCHEMA_VERSION = '2.1';
export const REGION_KEYS = ['uk', 'us', 'hk', 'au', 'ca', 'other'];
const OWN_REGION = new Set(['uk', 'us', 'hk', 'au', 'ca']);
export const EVENT_TYPES = ['Final', '期中', 'Essay 截止', '补考', '出分', '选课', '开学', 'Reading Week', '期中假'];

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);

// 时间线代码（UK、UK@2027）→ { country, year, region }；没有年份后缀的取首年。
export function normalizeCountry(code, baseYear) {
  const [raw, tag] = String(code).split('@');
  const country = raw.toLowerCase();
  return { country, year: tag ? Number(tag) : baseYear, region: OWN_REGION.has(country) ? country : 'other' };
}
export const regionOf = country => OWN_REGION.has(country) ? country : 'other';
export const normalizeEventType = type => EVENT_TYPES.includes(type) ? type : '其他';

// 锚点类型：docs/策略规则/05-需求生命周期.md 第 3 节。
export function anchorTypeOf(eventType, header, { from, to } = {}) {
  if (['Final', '期中', '补考', '开学', 'Reading Week', '期中假'].includes(eventType)) return 'start';
  if (eventType === 'Essay 截止') return 'deadline';
  if (eventType === '出分') return 'release';
  if (eventType === '选课') {
    if (/截止/.test(header)) return 'deadline';
    if (from && to && from < to) return 'period';
    if (/开始|开放/.test(header)) return 'start';
    return 'anchor_unknown';
  }
  return /截止/.test(header) ? 'deadline' : 'start';
}

const scopeOf = raw => [...new Set(String(raw || '').match(/研究生|本科生|国际生/g) || [])].join('、') || undefined;
const display = info => [info.school, info.abbr].filter(Boolean).join(' ');
const sheetOf = info => info.sheet;
const cellKeyOf = (info, year) => hash([year, sheetOf(info), display(info), info.header, info.ord]);

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
  const baseYear = timeline.years?.[0]?.year ?? 2026;
  const anomalies = [];
  const candidates = [];

  // 1. 精确日期事件：同一来源格的多个片段按标签定位，没有标签（或标签重复）才用「序号/总数」。
  const bySrc = new Map();
  for (const e of timeline.agenda || []) (bySrc.get(e.src) || bySrc.set(e.src, []).get(e.src)).push(e);
  for (const [src, events] of bySrc) {
    const info = index[src];
    if (!info) { anomalies.push({ type: 'cellIndexMissing', ref: src }); continue; }
    events.sort((a, b) => a.from.localeCompare(b.from));
    const labels = events.map(e => e.detail).filter(Boolean);
    events.forEach((e, i) => {
      const unique = e.detail && labels.filter(l => l === e.detail).length === 1;
      const seg = events.length === 1 && !e.detail ? '' : unique ? `L:${e.detail}` : `#${i + 1}/${events.length}`;
      const [verification, sourceId] = verificationOf(e);
      candidates.push({ src, info, seg, dates: { from: e.from, to: e.to, precision: 'day' }, rawType: e.type, verification, sourceId });
    });
  }

  // 2. 只有月份的格子：没有精确事件、没有被裁定排除、原文能读出具体月份。
  for (const a of timeline.anomalies || []) {
    if (!a.cell || bySrc.has(a.src) || a.ruling?.decision === 'exclude') continue;
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
    c.identity = [year, sheetOf(c.info), display(c.info), c.info.header, c.info.ord, c.seg];
    c.id = `EV-${hash(c.identity)}`;
  }

  // 4. 身份碰撞（同一地区表同名学校）：落库前隔离，碰撞各条都不生成 Evidence。
  const groups = new Map();
  for (const c of candidates) (groups.get(c.id) || groups.set(c.id, []).get(c.id)).push(c);
  const isolated = new Set();
  for (const [id, group] of groups) {
    if (new Set(group.map(c => c.src)).size < 2) continue;
    for (const c of group) isolated.add(c);
    anomalies.push({ type: 'identityConflict', evidenceId: id, school: display(group[0].info), header: group[0].info.header,
      sources: [...new Map(group.map(c => [c.src, { ref: c.src, sheet: c.info.sheet, raw: c.info.raw, snapshot }])).values()] });
  }

  // 5. 片段重排：同一格的片段键与上一次不一致时，对不上的新片段标 ambiguous（新键本身就是新 ID，不复用旧 ID）。
  const segmentIndex = {};
  for (const c of candidates) if (!isolated.has(c)) (segmentIndex[c.cellKey] ||= []).push(c.seg);
  for (const keys of Object.values(segmentIndex)) keys.sort();

  const evidence = candidates.filter(c => !isolated.has(c)).map(c => {
    const old = previous[c.cellKey];
    const changed = old && (old.length !== segmentIndex[c.cellKey].length || old.some((k, i) => k !== segmentIndex[c.cellKey][i]));
    const header = c.info.header;
    const eventType = normalizeEventType(c.rawType);
    const anchorType = anchorTypeOf(eventType, header, c.dates);
    const scope = scopeOf(c.info.raw);
    return {
      evidenceId: c.id,
      evidenceVersion: hash([c.dates, eventType, anchorType, scope ?? null, c.verification, header]),
      kind: 'timeline', sourceId: c.sourceId, year: c.year, country: c.country, school: display(c.info), header, eventType, anchorType,
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
