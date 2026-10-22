import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLocalChanges, fingerprint, getRecord } from './local-records.mjs';
import { getSettings } from './db.mjs';
import { TIMELINE_SOURCE } from './timeline.mjs';
import { withRulings } from './timeline-rulings.mjs';
import { failure, requireMonth } from './v3-common.mjs';
import { BARRIERS, MECHANISMS, PRIORITY, parseCard } from '../src/modules/user/playbook.js';

// 月度用户策略（T13，结构与写作规范见 docs/用户策略规范.md）分两层：
// · 用户情况（核心判断、全局研判、用户洞察、机会收敛）：按月预先写好，内置在 docs/用户情况/YYYY-MM.json，打开即可查看；
//   第一次修改时整月复制到本地记录（v3_documents），之后正文以本地为准。时间全景、节点数、推测节点从最近完整时间线快照派生。
// · 促销策略（本月目标、核心打法、4.1–4.4）：点按钮后按当月用户洞察与打法库内部匹配生成（matchPromo，不调用模型），挂在当月记录的 strategy 下。
// 修改、生成、定稿都走「预览 → 确认 → 回读」（local-records），只写工作台本地。
export const USER_STRATEGY_KIND = 'user-strategy';
export const REGIONS = [['uk', '英国', ['英国']], ['us', '美国', ['美国']], ['hk', '香港', ['香港']], ['au', '澳洲', ['澳洲']], ['ca', '加拿大', ['加拿大']], ['sg', '新加坡', ['新加坡']], ['other', '其他', ['新西兰', '澳门', '爱尔兰', '马来西亚']]];
const TIERS = ['主战场', '次要', '平稳'], TEMPS = ['冷', '温', '热'], PRIORITIES = ['P0', 'P1', 'P2'], LINES = ['新签', '续费'];
const MODEL_SOURCES = ['时间线', '规则推导', 'AI 判断', '推测'];
const SOURCES = [...MODEL_SOURCES, '原声', '你写的'];
const BANNED = ['赋能', '抓手', '闭环', '全方位', '深度', '打造', '助力', '持续发力'];
const CODES = BARRIERS.flatMap(([, , list]) => list.map(([c]) => c));
const CODE_OF = Object.fromEntries(BARRIERS.flatMap(([, , list]) => list.map(([c, n]) => [n, c])));
const CELLS = ['node', 'task', 'pain', 'tempNote', 'opp', 'master'];
// 逐格修改允许的位置：核心判断、本月目标（生成促销后）、1.2 三栏、1.3 分档、地区 6 格（含硕士关注）、机会收敛。促销 4.1–4.4 只能重新生成。
const EDITABLE = /^(summary\.judgement|strategy\.goal|overview\.(common|diff|external|tiers)|opportunities|regions\.(uk|us|hk|au|ca|sg|other)\.(node|task|pain|temp|barrier|opp|master))$/;
const PREFIX = /^(AI ?判断|推测|时间线|规则推导)\s*[：:]\s*/;
const CODE_IN_TEXT = /\b(P\d{4}|M\d{2})\b|(?<![A-Za-z])[ABC]\d(?!\d)/;

const INSIGHT_DIR = fileURLToPath(new URL('../docs/用户情况/', import.meta.url));
const CARD_DIR = fileURLToPath(new URL('../docs/打法库/', import.meta.url));
export function loadCards(dir = CARD_DIR) {
  return readdirSync(dir).filter(f => /^P\d{4}-.+\.md$/.test(f)).map(f => parseCard(readFileSync(path.join(dir, f), 'utf8'))).filter(Boolean);
}
export function readInsight(month, dir = INSIGHT_DIR) {
  const file = path.join(dir, `${month}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// 单条长度：中文按 1 字、ASCII 按半字计（日期、英文校名不吃掉中文篇幅）。
export const units = text => [...text].reduce((n, ch) => n + (ch.charCodeAt(0) < 128 ? 0.5 : 1), 0);

function catOf(type) {
  if (/补考|Final|考试|期末|期中(?!假)/.test(type)) return 'exam';
  if (/选课|开学|退课|Withdraw/i.test(type)) return 'course';
  if (/Essay|论文/.test(type)) return 'paper';
  if (/假|Reading Week|break/i.test(type)) return 'break';
  if (/出分|成绩/.test(type)) return 'result';
  return 'other';
}
const nextDay = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function strategyWindow(month) {
  const from = `${month}-01`, to = nextDay(nextDay(from, 32).slice(0, 8) + '01', -1);
  return { from, to, preheatTo: nextDay(to, 14) };
}

// 时间窗内的节点：按地区归组。节点条按事件类型合并相隔不超过 3 天的时间段（截到窗口内）；
// 教学结束、退课截止、学期起止这类单日行政节点不画条，只计入节点数。
const LANE_SKIP = /教学日结束|Instruction结束|学期开始|Withdraw|退课/i;
export function timelineFacts(timeline, window) {
  const regionOf = Object.fromEntries(REGIONS.flatMap(([key, , list]) => list.map(c => [c, key])));
  const events = (timeline.agenda || []).filter(e => regionOf[e.c] && e.from <= window.preheatTo && (e.to || e.from) >= window.from);
  const lanes = REGIONS.map(([key, name]) => {
    const groups = new Map();
    for (const e of events.filter(x => regionOf[x.c] === key && !LANE_SKIP.test(x.type))) {
      const label = key === 'other' ? `${e.c} ${e.type}` : e.type;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ from: e.from < window.from ? window.from : e.from, to: (e.to || e.from) > window.preheatTo ? window.preheatTo : (e.to || e.from), guess: !!e.flag, cat: catOf(e.type) });
    }
    const bars = [];
    for (const [label, list] of groups) {
      list.sort((a, b) => a.from.localeCompare(b.from));
      let cur = null;
      for (const x of list) {
        if (cur && x.from <= nextDay(cur.to, 3)) { if (x.to > cur.to) cur.to = x.to; cur.guess = cur.guess || x.guess; }
        else { if (cur) bars.push(cur); cur = { ...x, label }; }
      }
      if (cur) bars.push(cur);
    }
    // 合并窗口只要包含待确认日期，就保留提示，不能借其他学校的已确认日期给推测段背书。
    return [key, name, bars.sort((a, b) => a.from.localeCompare(b.from)).map(b => [b.from, b.to, b.cat, b.label, b.guess])];
  });
  const counts = Object.fromEntries(REGIONS.map(([key]) => [key, events.filter(e => regionOf[e.c] === key).length]));
  const guesses = events.filter(e => e.flag).map(e => `${e.c} · ${e.school} · ${e.type} ${e.from.slice(5)}${e.to && e.to !== e.from ? ` → ${e.to.slice(5)}` : ''}`);
  return { lanes, counts, guesses };
}

// 只覆盖客观展示字段，保留内置或人工正文及其当时依据，读取本身不写入、不调用飞书或模型。
// 来源不匹配、尚未完整同步时保留原内容并说明，绝不借用其他来源的时间线。
export function strategyTimelineView(db, record) {
  const unavailable = () => ({ ...record, timelineEvidence: {
    status: 'unavailable', fingerprint: null, syncedAt: '', basedOnSyncedAt: record.timelineSyncedAt || '',
    message: '尚无当前来源的完整时间线快照，暂保留原有依据；请先同步用户时间。',
  } });
  let timeline, identity;
  try {
    identity = getSettings(db).timeline_source || JSON.stringify(TIMELINE_SOURCE);
    const row = db.prepare('SELECT payload FROM v3_snapshots WHERE kind=?').get('timeline');
    if (!row) return unavailable();
    const snapshot = JSON.parse(row.payload);
    if (snapshot.identity !== identity || !Array.isArray(snapshot.value?.agenda)) return unavailable();
    timeline = withRulings(db, snapshot.value);
  } catch { return unavailable(); }
  const window = strategyWindow(record.month), facts = timelineFacts(timeline, window);
  const previousFacts = { lanes: record.overview?.lanes || [], counts: record.overview?.counts || {}, guesses: record.appendix?.guesses || [] };
  const comparableFacts = value => ({ lanes: value.lanes, counts: REGIONS.map(([key]) => [key, value.counts[key] || 0]), guesses: [...value.guesses].sort() });
  const changed = fingerprint(comparableFacts(facts)) !== fingerprint(comparableFacts(previousFacts));
  const events = timeline.agenda.filter(e => e.from <= window.preheatTo && (e.to || e.from) >= window.from)
    .map(({ c, school, type, from, to, src, flag, detail, verified, ruled }) => ({ c, school, type, from, to, src, flag, detail, verified, ruled }))
    .sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { ...record, window, timelineSyncedAt: timeline.syncedAt,
    overview: { ...record.overview, lanes: facts.lanes, counts: facts.counts },
    appendix: { ...record.appendix, guesses: facts.guesses },
    timelineEvidence: {
      status: changed ? 'changed' : 'current', fingerprint: fingerprint({ source: JSON.parse(identity), window, events }),
      syncedAt: timeline.syncedAt || '', basedOnSyncedAt: record.timelineSyncedAt || '',
      message: changed ? '时间线依据已更新：时间全景、节点数和推测清单已同步；用户洞察、人工正文和已生成策略均保留，请结合新日期核对。' : '客观依据已与最近同步的用户时间一致；正文保留原有内容。',
    },
  };
}

/* ---------------- 校验：结构、编号不对是错误；字数、禁用词、正文编号是提示 ---------------- */
const clean = value => value.trim().replace(PREFIX, '');
function list(value, where, issues, { sources = SOURCES, min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > 6) { issues.errors.push(`${where} 须为 ${min}–6 条`); return []; }
  return value.map((item, i) => {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || !item[0].trim() || !sources.includes(item[1])) { issues.errors.push(`${where} 第 ${i + 1} 条须为 [正文, 来源]`); return ['', 'AI 判断']; }
    return [clean(item[0]), item[1]];
  });
}
function ids(value, valid, where, issues) {
  if (!Array.isArray(value) || !value.length || value.some(id => !valid.has(id))) { issues.errors.push(`${where} 含无效编号：${JSON.stringify(value)}`); return []; }
  return value;
}
const text = (value, where, issues, max = 200) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) { issues.errors.push(`${where} 须为不超过 ${max} 字的文字`); return ''; }
  return clean(value);
};
function prose(issues, entries) {
  for (const [t, where, limit] of entries) {
    if (typeof t !== 'string') continue;
    if (limit && units(t) > limit) issues.warnings.push(`${where} 超过 ${limit} 字：${t}`);
    for (const w of BANNED) if (t.includes(w)) issues.warnings.push(`含禁用词「${w}」：${t}`);
    if (CODE_IN_TEXT.test(t)) issues.warnings.push(`正文里写了编号，应写名称：${t}`);
  }
}

// 用户情况（内置文件或本地修改后的整月记录）
export function checkInsight(raw) {
  const issues = { errors: [], warnings: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { issues: { errors: ['用户情况不是 JSON 对象'], warnings: [] } };
  const o = raw.overview || {};
  const value = {
    summary: { judgement: text(raw.summary?.judgement, '核心判断', issues) },
    overview: {
      markers: Array.isArray(o.markers) ? o.markers.filter(m => Array.isArray(m) && /^\d{4}-\d{2}-\d{2}$/.test(m[0]) && typeof m[1] === 'string').map(([d, n]) => [d, n.trim()]) : [],
      common: list(o.common, '1.2 共性', issues, { min: 1 }), diff: list(o.diff, '1.2 差异', issues, { min: 1 }), external: list(o.external, '1.2 外部变量', issues),
      tiers: REGIONS.map(([key, name]) => { const t = Array.isArray(o.tiers) && o.tiers.find(x => x?.[0] === key); if (!t || !TIERS.includes(t[1])) issues.errors.push(`1.3 分档缺少${name}`); return [key, t?.[1] || '平稳', text(t?.[2], `1.3 ${name}依据`, issues)]; }),
    },
    regions: REGIONS.map(([key, name]) => {
      const r = Array.isArray(raw.regions) && raw.regions.find(x => x?.key === key);
      if (!r) { issues.errors.push(`缺少地区：${name}`); return { key, name }; }
      if (!TIERS.includes(r.tier)) issues.errors.push(`${name} 分档无效`);
      if (!Array.isArray(r.temp) || r.temp.length !== 2 || r.temp.some(t => !TEMPS.includes(t))) issues.errors.push(`${name} 需求温度须为 [冷|温|热, 冷|温|热]`);
      const region = { key, name, tier: r.tier, temp: r.temp };
      for (const cell of CELLS) region[cell] = list(r[cell], `${name} · ${cell}`, issues, { min: cell === 'master' ? 0 : 1 });
      region.barrier = Array.isArray(r.barrier) && r.barrier.length ? r.barrier.map((b, i) => {
        if (!Array.isArray(b) || !CODES.includes(b[0]) || typeof b[1] !== 'string' || !SOURCES.includes(b[2])) { issues.errors.push(`${name} 决策障碍第 ${i + 1} 条须为 [词表编号, 描述, 来源]`); return ['A1', '', 'AI 判断']; }
        return [b[0], clean(b[1]), b[2]];
      }) : (issues.errors.push(`${name} 缺少决策障碍`), []);
      return region;
    }),
    opportunities: Array.isArray(raw.opportunities) && raw.opportunities.length ? raw.opportunities.map((x, i) => {
      if (!Array.isArray(x) || x.length !== 7 || !PRIORITIES.includes(x[0]) || x.slice(1).some(v => typeof v !== 'string' || !v.trim())) issues.errors.push(`机会第 ${i + 1} 条须为 [P0|P1|P2, 机会, 地区, 业务线, 新签/续费, 窗口, 依据]`);
      return Array.isArray(x) ? x.map(v => clean(String(v ?? ''))) : [];
    }) : (issues.errors.push('缺少机会收敛'), []),
    pending: Array.isArray(raw.appendix?.pending) ? raw.appendix.pending.filter(t => typeof t === 'string' && t.trim()).map(t => t.trim()) : [],
  };
  const entries = [[value.summary.judgement, '核心判断', 100]];
  value.regions.forEach(r => [...CELLS, 'barrier'].forEach(c => (r[c] || []).forEach(item => entries.push([c === 'barrier' ? item[1] : item[0], `${r.name} · ${c}`, 40]))));
  ['common', 'diff', 'external'].forEach(k => value.overview[k].forEach(([t]) => entries.push([t, `1.2 ${k}`, 40])));
  value.opportunities.forEach(x => entries.push([x[1], '机会名', 20], [x[6], '机会依据', 40]));
  prose(issues, entries);
  return { value, issues };
}

// 促销策略（模型输出）
export function checkPromo(raw, cards) {
  const issues = { errors: [], warnings: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { issues: { errors: ['模型输出不是 JSON 对象'], warnings: [] } };
  const playIds = new Set(cards.map(c => c.id)), mechIds = new Set(Object.keys(MECHANISMS)), stageOf = Object.fromEntries(cards.map(c => [c.id, c.stage]));
  const p = raw.promo || {};
  const value = {
    goal: text(raw.goal, '本月目标', issues),
    plays: Array.isArray(raw.plays) && raw.plays.length ? raw.plays.map((x, i) => [text(x?.[0], `核心打法第 ${i + 1} 条`, issues, 10), text(x?.[1], `核心打法第 ${i + 1} 条`, issues)]) : (issues.errors.push('缺少核心打法'), []),
    promo: {
      lines: Object.fromEntries(LINES.map(line => [line, Array.isArray(p.lines?.[line]) && p.lines[line].length ? p.lines[line].map((x, i) => {
        const plays = ids(x?.[1], playIds, `4.1 ${line}第 ${i + 1} 条`, issues);
        for (const id of plays) if (stageOf[id] !== '通用' && stageOf[id] !== line) issues.warnings.push(`${id} 是${stageOf[id]}打法，却放在${line}栏`);
        return [text(x?.[0], `4.1 ${line}角色`, issues, 10), plays, text(x?.[2], `4.1 ${line}做法`, issues), text(x?.[3], `4.1 ${line}适用`, issues, 80)];
      }) : (issues.errors.push(`4.1 缺少${line}栏`), [])])),
      logic: Array.isArray(p.logic) && p.logic.length ? p.logic.map((x, i) => {
        if (!Array.isArray(x) || !CODES.includes(x[0]) || !LINES.includes(x[1])) issues.errors.push(`4.2 第 ${i + 1} 行障碍或栏位无效`);
        return [x?.[0], x?.[1], ids(x?.[2], mechIds, `4.2 第 ${i + 1} 行心理机制`, issues), ids(x?.[3], playIds, `4.2 第 ${i + 1} 行打法`, issues), text(x?.[4], `4.2 第 ${i + 1} 行作用路径`, issues)];
      }) : (issues.errors.push('缺少 4.2 选择逻辑'), []),
      exclude: Array.isArray(p.exclude) && p.exclude.length ? p.exclude.map((x, i) => [ids(x?.[0], playIds, `4.3 第 ${i + 1} 条`, issues), text(x?.[1], `4.3 第 ${i + 1} 条理由`, issues)]) : (issues.errors.push('缺少 4.3'), []),
      floor: Array.isArray(p.floor) && p.floor.length ? p.floor.map((x, i) => [text(x?.[0], `4.4 第 ${i + 1} 条`, issues, 10), text(x?.[1], `4.4 第 ${i + 1} 条`, issues)]) : (issues.errors.push('缺少 4.4'), []),
    },
  };
  if (value.promo.exclude.length > 3) issues.warnings.push('4.3 不选什么超过 3 条');
  prose(issues, [[value.goal, '本月目标', 70], ...value.plays.map(x => [x[1], '核心打法', 40]),
    ...LINES.flatMap(l => value.promo.lines[l].map(x => [x[2], `4.1 ${l}做法`, 40])), ...value.promo.logic.map(x => [x[4], '4.2 作用路径', 40]), ...value.promo.exclude.map(x => [x[1], '4.3 理由', 50])]);
  return { value, issues };
}

/* ---------------- 促销策略生成：用户洞察 × 打法库内部匹配，不调用模型 ---------------- */
// 规则（docs/用户策略规范.md 第 7 节）：
// 1. 障碍权重 = 各地区决策障碍按分档累加（主战场 3 / 次要 2 / 平稳 1）。
// 2. 新签栏用新签 + 通用卡，续费栏用续费 + 通用卡；续费栏不处理「不信任效果」「没被触达」。
// 3. 从权重最高的障碍起，每个障碍按 PRIORITY 选第一张可用的卡；第一张为主打法，其余为辅助；每栏最多 4 张，已被选中卡主治的障碍不再单独选。
// 4. 卡片「不宜组合」里点名的打法不进同一栏；同一栏只用一种直接降价。被挡住、障碍已覆盖、因满 4 张没轮到的首选卡写进 4.3；仍不足 2 条时补已选障碍的第二候选。
// 5. 4.2 每行 = 障碍 → 该卡主机制 → 打法 → 作用路径（心理机制词表里的标准释义）。
// 6. 4.1 做法引用权重最高地区对这个障碍的具体描述；同分障碍先比主战场地区数，再按词表顺序。
const TIER_WEIGHT = { 主战场: 3, 次要: 2, 平稳: 1 };
const RENEWAL_SKIP = new Set(['A3', 'C1']);
const PRICE_CUTS = new Set(['P0101', 'P0102', 'P0103', 'P0201', 'P0202']);
const MAX_PER_LINE = 4;
const FLOOR = [
  ['毛利', '同一订单只叠加一种让利，加赠按成本价计入毛利'],
  ['价格锚点', '老学员价 ≤ 早鸟价 ≤ 限时价 / 立减价 < 正价，违反不上线'],
  ['合规', '不承诺成绩与通过率；退款、价保等条款写明期限'],
];
const NAME_OF = Object.fromEntries(BARRIERS.flatMap(([, , list]) => list));
const clip = (t, max = 40) => { let out = ''; for (const ch of t) { if (units(out + ch) > max) return `${out.replace(/[，、；：]$/, '')}…`; out += ch; } return out; };
const shortNames = card => card.name.split(/\s*\/\s*/).filter(n => n.length >= 2);
// 卡片「不宜组合的情况」里点名的其他打法
function conflictsOf(cards) {
  return Object.fromEntries(cards.map(c => {
    const section = (c.body.split('**不宜组合的情况**')[1] || '').split('\n## ')[0];
    return [c.id, new Set(cards.filter(o => o.id !== c.id && shortNames(o).some(n => section.includes(n))).map(o => o.id))];
  }));
}
const dateRange = text => (text.match(/(\d{1,2}\/\d{1,2})–(\d{1,2}\/\d{1,2})\s*$/) || []).slice(1);
const md = s => s.split('/').map(Number);
const earlier = (a, b) => { const [x, y] = md(a), [u, v] = md(b); return x * 100 + y <= u * 100 + v; };
function windowOf(regions) {
  const ranges = regions.flatMap(r => r.opp.map(([t]) => dateRange(t))).filter(r => r.length === 2);
  if (!ranges.length) return '';
  return `${ranges.map(r => r[0]).reduce((a, b) => (earlier(a, b) ? a : b))}–${ranges.map(r => r[1]).reduce((a, b) => (earlier(a, b) ? b : a))}`;
}

export function matchPromo(doc, cards) {
  const byId = Object.fromEntries(cards.map(c => [c.id, c])), conflicts = conflictsOf(cards);
  const weight = {}, holders = {};
  for (const r of doc.regions) for (const [code] of r.barrier) { weight[code] = (weight[code] || 0) + TIER_WEIGHT[r.tier]; (holders[code] ||= []).push(r); }
  const fronts = code => holders[code].filter(r => r.tier === '主战场').length;
  // 障碍的具体描述：取权重最高地区的那一条
  const detail = code => { const r = [...holders[code]].sort((a, b) => TIER_WEIGHT[b.tier] - TIER_WEIGHT[a.tier])[0]; return r.barrier.find(([c]) => c === code)[1]; };
  const lines = {}, logic = [], exclude = [], main = {}, mainCode = {};
  for (const line of LINES) {
    const order = Object.entries(weight).filter(([code]) => line === '新签' || !RENEWAL_SKIP.has(code))
      .sort((a, b) => b[1] - a[1] || fronts(b[0]) - fronts(a[0]) || CODES.indexOf(a[0]) - CODES.indexOf(b[0])).map(([code]) => code);
    const chosen = [], covered = new Set(), rows = [];
    const capped = [];
    for (const code of order) {
      if (covered.has(code)) continue;
      if (chosen.length >= MAX_PER_LINE) { capped.push(code); continue; }
      const candidates = (PRIORITY[line][code] || []).map(id => byId[id]).filter(c => c && (c.stage === '通用' || c.stage === line));
      let pick = null;
      for (const c of candidates) {
        if (chosen.includes(c)) continue;
        const clash = chosen.find(x => conflicts[x.id].has(c.id) || conflicts[c.id].has(x.id));
        const price = PRICE_CUTS.has(c.id) && chosen.find(x => PRICE_CUTS.has(x.id));
        if (!clash && !price) { pick = c; break; }
        if (!exclude.some(([[id]]) => id === c.id)) exclude.push([[c.id], clash ? `与${clash.name}不宜组合，${line}栏改用后续打法` : `${line}栏已有${price.name}，同栏只用一种直接降价`]);
      }
      if (!pick) continue;
      chosen.push(pick); pick.barriers.main.forEach(b => covered.add(b));
      const regions = holders[code], names = regions.map(r => r.name).join('、');
      if (chosen.length === 1) mainCode[line] = code;
      rows.push([chosen.length === 1 ? '主打法' : '辅助', [pick.id], clip(`针对「${NAME_OF[code]}」：${detail(code)}`), `${names}${windowOf(regions) ? ` · ${windowOf(regions)}` : ''}`]);
      logic.push([code, line, [pick.mechs[0]], [pick.id], MECHANISMS[pick.mechs[0]][1]]);
    }
    lines[line] = rows; main[line] = chosen[0];
    const unused = (id, why) => { const c = byId[id]; if (c && !chosen.includes(c) && !exclude.some(([[x]]) => x === id)) exclude.push([[id], why]); };
    // 因每栏最多 4 张没轮到的障碍：首选卡不选
    for (const code of capped) unused((PRIORITY[line][code] || [])[0], `「${NAME_OF[code]}」只涉及${holders[code].map(r => r.name).join('、')}，${line}栏已满 4 张`);
    // 首选卡因障碍已被覆盖而没用上的，也算「不选」
    for (const code of order.filter(c => covered.has(c))) {
      const first = byId[(PRIORITY[line][code] || [])[0]];
      if (first && !chosen.includes(first) && !exclude.some(([[id]]) => id === first.id)) exclude.push([[first.id], `「${NAME_OF[code]}」已由${chosen.find(x => x.barriers.main.includes(code))?.name || '已选打法'}覆盖，只补真实缺口`]);
    }
  }
  // 兜底：本月没有冲突、覆盖或截断时，取已选障碍的第二候选说明不叠加
  for (const [code, line] of logic.map(([c, l]) => [c, l])) {
    if (exclude.length >= 2) break;
    const second = byId[(PRIORITY[line][code] || [])[1]], picked = byId[logic.find(([c, l]) => c === code && l === line)[3][0]];
    if (second && !Object.values(lines).flat().some(([, ids]) => ids[0] === second.id) && !exclude.some(([[x]]) => x === second.id)) exclude.push([[second.id], `「${NAME_OF[code]}」已用${picked.name}，不再叠加同类打法`]);
  }
  const opps = doc.opportunities, focus = opps.filter(o => o[0] === 'P0').map(o => o[1]);
  const gap = t => (/^[0-9A-Za-z]/.test(t) ? ` ${t}` : t); // 中文后接数字或英文时空一格
  const renewal = opps.find(o => o[4] === '续费') || opps.find(o => o[4].includes('续费'));
  const summary = line => (main[line] ? clip(`${main[line].name}：化解「${NAME_OF[mainCode[line]]}」（${holders[mainCode[line]].map(r => r.name).join('、')}）`) : '本月没有对应的障碍');
  return {
    goal: `新签以${main['新签']?.name || '—'}主攻${gap(focus.join('、'))}；续费以${main['续费']?.name || '—'}承接${gap(renewal ? renewal[1] : '下学期续报')}`,
    plays: LINES.map(line => [line, summary(line)]),
    promo: { lines, logic, exclude: exclude.slice(0, 3), floor: FLOOR },
  };
}

/* ---------------- 逐格修改：一行一条 ---------------- */
// 与原有某条正文完全相同的行保留原来源，其余标「你写的」。
// 需求温度：第一行写温度（「温 → 热」或「热」），之后是说明。决策障碍：每行「障碍名称：具体描述」。
// 分档：每行「地区 | 分档 | 依据」，7 个地区各一行。机会：每行「P0 | 机会 | 地区 | 业务线 | 新签/续费 | 窗口 | 依据」。
export function applyEdit(current, pathKey, lines) {
  if (!EDITABLE.test(pathKey || '')) throw failure(400, '这一格不能逐格修改；促销 4.1–4.4 请重新生成');
  if (!Array.isArray(lines) || lines.length > 12 || lines.some(l => typeof l !== 'string' || l.length > 300)) throw failure(400, '请按一行一条提交，最多 12 行');
  const rows = lines.map(l => l.trim()).filter(Boolean);
  const next = structuredClone(current), [head, a, b] = pathKey.split('.');
  const keep = (old, t) => (old.find(([x]) => x === t) || [t, '你写的'])[1];
  const cells = t => t.split(/\s*\|\s*/);
  if (head === 'summary' || head === 'strategy') {
    if (head === 'strategy' && !current.strategy) throw failure(409, '还没有生成促销策略');
    if (rows.length !== 1) throw failure(400, '这一格只写一句');
    next[head][a] = rows[0];
  } else if (head === 'opportunities') {
    if (!rows.length) throw failure(400, '至少写一个机会');
    next.opportunities = rows.map(t => {
      const c = cells(t);
      if (c.length !== 7 || !PRIORITIES.includes(c[0]) || c.some(v => !v)) throw failure(400, `每行 7 项，以 P0 / P1 / P2 开头，用「|」分隔：${t}`);
      return c;
    });
  } else if (a === 'tiers') {
    next.overview.tiers = REGIONS.map(([key, name]) => {
      const row = rows.map(cells).find(c => c[0] === name);
      if (!row || row.length !== 3 || !TIERS.includes(row[1]) || !row[2]) throw failure(400, `分档每个地区一行：「${name} | 主战场/次要/平稳 | 依据」`);
      return [key, row[1], row[2]];
    });
    for (const r of next.regions) r.tier = next.overview.tiers.find(([k]) => k === r.key)[1];
  } else if (head === 'overview') {
    if (!rows.length) throw failure(400, '至少写一条');
    next.overview[a] = rows.map(t => [t, keep(current.overview[a], t)]);
  } else {
    const region = next.regions.find(r => r.key === a), old = current.regions.find(r => r.key === a);
    if (b === 'temp') {
      const m = (rows[0] || '').match(/^(冷|温|热)(?:\s*→\s*(冷|温|热))?$/);
      if (!m) throw failure(400, '第一行写需求温度，如「温 → 热」或「热」');
      region.temp = [m[1], m[2] || m[1]];
      region.tempNote = rows.slice(1).map(t => [t, keep(old.tempNote, t)]);
    } else if (b === 'barrier') {
      if (!rows.length) throw failure(400, '至少写一项决策障碍');
      // 每行「障碍名称：具体描述」，如「觉得还来得及：Final 在 1 月」；也接受「A2 描述」。
      region.barrier = rows.map(t => {
        const m = t.match(/^(.+?)\s*[：:]\s*(.+)$/), n = t.match(/^([A-C]\d)\s+(.+)$/);
        const code = m && CODE_OF[m[1]] ? CODE_OF[m[1]] : n && CODES.includes(n[1]) ? n[1] : null;
        if (!code) throw failure(400, `每行写「障碍名称：具体描述」，名称取自词表（${Object.keys(CODE_OF).join('、')}）：${t}`);
        const desc = (m && CODE_OF[m[1]] ? m[2] : n[2]).trim();
        const same = old.barrier.find(([c, x]) => c === code && x === desc);
        return [code, desc, same ? same[2] : '你写的'];
      });
    } else {
      if (!rows.length && b !== 'master') throw failure(400, '至少写一条');
      region[b] = rows.map(t => [t, keep(old[b], t)]);
    }
  }
  return next;
}

export function createUserStrategyService(db, { now = Date.now, cards = loadCards, insight = readInsight } = {}) {
  const changes = createLocalChanges(db, { now });
  const stamp = () => new Date(now()).toISOString();
  // 当月内容：本地修改过的记录优先，否则用内置的用户情况。
  function current(month) {
    requireMonth(month);
    const local = getRecord(db, USER_STRATEGY_KIND, month);
    if (local) return { record: local, origin: '已修改' };
    const base = insight(month);
    return base ? { record: { ...base, strategy: null }, origin: '内置' } : null;
  }
  const need = month => { const c = current(month); if (!c) throw failure(404, `${month} 的用户情况还没有准备`); return c.record; };
  const preview = (month, record) => {
    const sourceFingerprint = strategyTimelineView(db, record).timelineEvidence.fingerprint;
    return changes.preview(USER_STRATEGY_KIND, month, record, { validate: () => {
      if (strategyTimelineView(db, record).timelineEvidence.fingerprint !== sourceFingerprint) throw failure(409, '时间线依据已变化，请重新读取用户策略后预览');
    } });
  };
  return {
    get(month) { const c = current(month); return c ? { ...strategyTimelineView(db, c.record), origin: c.origin } : { month, status: '未准备' }; },
    previewGenerate(body = {}) {
      const { month } = body; const base = need(month);
      if (base.strategy?.status === '定稿' && body.confirmOverwrite !== true) throw failure(409, `${month} 的促销策略已定稿；重新生成会覆盖定稿版本，请明确确认覆盖`);
      const library = cards();
      const { value, issues } = checkPromo(matchPromo(base, library), library);
      if (issues.errors.length) throw Object.assign(failure(500, `匹配结果未通过校验，未保存：${issues.errors.slice(0, 5).join('；')}`), { code: 'STRATEGY_INVALID' });
      const record = { ...base, updatedAt: stamp(), strategy: { status: '草稿', generatedAt: stamp(), model: '内部匹配', ...value, warnings: issues.warnings } };
      // 确认时 local-records 会核对记录自预览后未变化，否则要求重新生成。
      return { ...preview(month, record), overwrite: base.strategy?.status || null };
    },
    previewEdit(month, body = {}) {
      const next = applyEdit(need(month), body.path, body.lines);
      next.updatedAt = stamp();
      return preview(month, next);
    },
    previewFinalize(month) {
      const base = need(month);
      if (!base.strategy) throw failure(409, '还没有生成促销策略');
      if (base.strategy.status === '定稿') throw failure(409, '促销策略已经定稿');
      return preview(month, { ...base, updatedAt: stamp(), strategy: { ...base.strategy, status: '定稿', finalizedAt: stamp() } });
    },
    confirm(month, body) { requireMonth(month); return changes.confirm(USER_STRATEGY_KIND, month, body); },
  };
}
