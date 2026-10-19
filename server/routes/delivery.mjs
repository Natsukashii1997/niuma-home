import { route } from '../http.mjs';
import { requireMonth } from '../v3-common.mjs';
import { handleV3 } from './user.mjs';
import { getSettings } from '../db.mjs';
import { getRecord, fingerprint } from '../local-records.mjs';
import { availablePriceMatrices, priceSettings } from '../price.mjs';
import { createBriefService, generatedBrief } from '../briefs.mjs';
import { isDay } from '../campaigns.mjs';

function priceStep(db, month, needs) {
  const result = { key: 'prices', label: '价格方案', state: 'todo', meta: '尚无已保存的有效方案', href: '#/marketing/prices' };
  if (!db) return result;
  const matrices = availablePriceMatrices(db).filter(m => m.origin !== 'demo');
  const savedSettings = getSettings(db);
  let costs;
  try { costs = priceSettings(db); } catch { return { ...result, meta: '成本或毛利口径待确认' }; }
  const formalCosts = ['price_floor_margin', 'price_cost_per_hour'].every(key => typeof savedSettings[key] === 'string' && savedSettings[key].trim());
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  let active = 0, drafts = 0, blocked = 0;
  const accepted = new Set(needs.filter(n => n.status === '已采纳').map(n => n.id));
  for (const matrix of matrices) {
    for (const scheme of matrix.schemes || []) {
      if (scheme.origin === 'demo' || !isDay(scheme.from) || scheme.to && !isDay(scheme.to) || scheme.from > end || scheme.to && scheme.to < `${month}-01` || scheme.status === '历史') continue;
      if (scheme.status === '草稿') { drafts++; continue; }
      if (scheme.status !== '生效中') continue;
      const complete = Array.isArray(matrix.tiers) && matrix.tiers.length > 0 && Array.isArray(scheme.prices) && Array.isArray(scheme.gifts) && scheme.prices.length === matrix.tiers.length && scheme.gifts.length === matrix.tiers.length && matrix.tiers.every(h => Number.isSafeInteger(h) && h > 0) && scheme.prices.every(p => Number.isFinite(p) && p > 0) && scheme.gifts.every(g => Number.isSafeInteger(g) && g >= 0);
      const needReady = scheme.kind !== '活动' || accepted.has(scheme.needId);
      const breach = complete && scheme.prices.some((p, i) => (p - costs.costPerHour * (matrix.tiers[i] + scheme.gifts[i])) / p < costs.floorMargin);
      if (!complete || !needReady || breach && !(typeof scheme.breachReason === 'string' && scheme.breachReason.trim())) blocked++;
      else active++;
    }
  }
  if (!formalCosts) return { ...result, state: active || drafts || blocked ? 'part' : 'todo', meta: `${active} 套已存有效方案 · 成本/毛利仍为演示口径` };
  return { ...result, state: active && !blocked ? 'done' : active || drafts || blocked ? 'part' : 'todo', meta: `${active} 套有效方案${drafts ? ` · ${drafts} 套草稿` : ''}${blocked ? ` · ${blocked} 套待复核` : ''}` };
}

function briefStep(db, month) {
  const result = { key: 'brief', label: '设计 brief', state: 'todo', meta: '尚未保存', href: '#/marketing/brief' };
  if (!db) return result;
  const stored = getRecord(db, 'brief', month);
  if (!stored || stored.origin === 'demo') return result;
  const current = createBriefService(db).read(month), done = Object.values(current.status).filter(state => state === 'done').length;
  const fresh = stored.sourceFingerprint === fingerprint(generatedBrief(db, month));
  return { ...result, state: fresh && done === 7 ? 'done' : 'part', meta: `${done}/7 节完成${fresh ? '' : ' · 来源已变化，待复核'}` };
}

export function deliveryView(db, month, data) {
  requireMonth(month);
  const accepted = data.needs.filter(n => n.status === '已采纳').length, review = data.needs.filter(n => n.status === '待复核').length;
  const saved = db && getRecord(db, 'campaign', 'current');
  const instance = saved && saved.origin !== 'demo' && saved.id !== 'template' && isDay(saved.start) && isDay(saved.end) && saved.start <= saved.end && saved.months?.includes(month) ? saved : null;
  const nodes = new Map();
  for (const phase of instance?.phases || []) for (const node of phase.nodes || []) {
    nodes.set(`node:${node.n}`, node.done === true);
    for (const [i, kid] of (node.kids || []).entries()) nodes.set(`kid:${node.n}:${i}`, kid[1] === true);
  }
  const completed = [...nodes.values()].filter(Boolean).length;
  return { month, campaign: instance ? { id: instance.id, name: instance.name, start: instance.start, end: instance.end } : null, steps: [
    { key: 'needs', label: '主线需求', state: data.needs.length && accepted === data.needs.length ? 'done' : accepted ? 'part' : 'todo', meta: `${data.needs.length} 条 · ${accepted} 条已采纳${review ? ` · ${review} 条待复核` : ''}`, href: '#/user/strategy' },
    priceStep(db, month, data.needs),
    { key: 'materials', label: '物料交付', state: 'pending', meta: '', note: 'NAS 尚未接入', href: '#/marketing/materials' },
    briefStep(db, month),
    { key: 'campaign', label: '营销战役', state: instance && nodes.size && completed === nodes.size ? 'done' : instance ? 'part' : 'todo', meta: instance ? `${completed}/${nodes.size} 节点完成` : '该月尚未创建战役', href: '#/projects/campaign' },
  ] };
}

export function deliveryRoutes(needs, db) {
  return [route('GET', '/api/v3/months/:month', handleV3(async (req, { params: { month } }) => {
    requireMonth(month);
    return deliveryView(db, month, await needs.list(month));
  }))];
}
