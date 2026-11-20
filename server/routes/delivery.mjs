import { route } from '../http.mjs';
import { beijingText, requireMonth } from '../v3-common.mjs';
import { handleV3 } from './user.mjs';
import { getSettings } from '../db.mjs';
import { getRecord, fingerprint } from '../local-records.mjs';
import { availablePriceMatrices, priceSettings } from '../price.mjs';
import { createBriefService, generatedBrief } from '../briefs.mjs';
import { isDay } from '../campaigns.mjs';
import { NAS_DEFAULT_ROOT, NAS_LINES } from '../nas-materials.mjs';

// 关联需求、破底线原因 2026-10-21 已从价格方案里移除（price.mjs 保存时清掉这两个字段），这里不再看它们（#72）。
// 低于毛利底线的方案照样算有效，只在说明里标出套数；结构不完整的才算待复核。
function priceStep(db, month) {
  const result = { key: 'prices', label: '价格方案', state: 'todo', meta: '尚无已保存的有效方案', href: '#/marketing/prices' };
  if (!db) return result;
  const matrices = availablePriceMatrices(db).filter(m => m.origin !== 'demo');
  const savedSettings = getSettings(db);
  let costs;
  try { costs = priceSettings(db); } catch { return { ...result, meta: '成本或毛利口径待确认' }; }
  const formalCosts = ['price_floor_margin', 'price_cost_per_hour'].every(key => typeof savedSettings[key] === 'string' && savedSettings[key].trim());
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  let active = 0, drafts = 0, blocked = 0, breached = 0;
  for (const matrix of matrices) {
    for (const scheme of matrix.schemes || []) {
      if (scheme.origin === 'demo' || !isDay(scheme.from) || scheme.to && !isDay(scheme.to) || scheme.from > end || scheme.to && scheme.to < `${month}-01` || scheme.status === '历史') continue;
      if (scheme.status === '草稿') { drafts++; continue; }
      if (scheme.status !== '生效中') continue;
      const complete = Array.isArray(matrix.tiers) && matrix.tiers.length > 0 && Array.isArray(scheme.prices) && Array.isArray(scheme.gifts) && scheme.prices.length === matrix.tiers.length && scheme.gifts.length === matrix.tiers.length && matrix.tiers.every(h => Number.isSafeInteger(h) && h > 0) && scheme.prices.every(p => Number.isFinite(p) && p > 0) && scheme.gifts.every(g => Number.isSafeInteger(g) && g >= 0);
      const breach = complete && scheme.prices.some((p, i) => (p - costs.costPerHour * (matrix.tiers[i] + scheme.gifts[i])) / p < costs.floorMargin);
      if (!complete) { blocked++; continue; }
      active++;
      if (breach) breached++;
    }
  }
  if (!formalCosts) return { ...result, state: active || drafts || blocked ? 'part' : 'todo', meta: `${active} 套已存有效方案 · 成本/毛利仍为演示口径` };
  return { ...result, state: active && !blocked ? 'done' : active || drafts || blocked ? 'part' : 'todo', meta: `${active} 套有效方案${drafts ? ` · ${drafts} 套草稿` : ''}${blocked ? ` · ${blocked} 套待复核` : ''}${breached ? ` · ${breached} 套低于毛利底线` : ''}` };
}

// 物料交付（用户 2026-10-23）：只读 NAS 上次扫描的快照，不在这里扫 NAS。交付月各业务线的固定物料都识别到即完成；
// 活动海报（many）只计张数，不作为必须项。新物料放进 NAS 后要在「物料沉淀」页扫描一次，这里才会更新。
function materialsStep(db, month) {
  const result = { key: 'materials', label: '物料交付', state: 'todo', meta: '尚未扫描 NAS', href: '#/marketing/materials' };
  if (!db) return result;
  const row = db.prepare('SELECT payload FROM v3_snapshots WHERE kind=?').get('nas');
  const payload = row && JSON.parse(row.payload);
  if (!payload || payload.root !== (getSettings(db).nas_root || NAS_DEFAULT_ROOT)) return result;
  const scanned = `按 NAS 扫描 ${beijingText(payload.scannedAt).slice(5)}`;
  const mm = Number(month.slice(5));
  if (!payload.months?.includes(month)) return { ...result, meta: `NAS 暂无 ${mm} 月物料`, note: scanned };
  const cell = (line, type) => payload.lines?.[line]?.cells?.[`${month}|${type}`]?.length || 0;
  const fixed = Object.entries(NAS_LINES).flatMap(([line, types]) => types.filter(t => !t.many).map(t => [line, t.key]));
  const missing = fixed.filter(([line, type]) => !cell(line, type));
  const posters = Object.entries(NAS_LINES).reduce((sum, [line, types]) => sum + types.filter(t => t.many).reduce((n, t) => n + cell(line, t.key), 0), 0);
  const have = fixed.length - missing.length;
  return {
    ...result, state: !missing.length ? 'done' : have ? 'part' : 'todo',
    meta: `固定物料 ${have}/${fixed.length} · 活动海报 ${posters} 张`,
    note: [missing.length && `缺 ${missing.map(([line, type]) => `${line}${type}`).join('、')}`, scanned].filter(Boolean).join(' · '),
  };
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

export function deliveryView(db, month) {
  requireMonth(month);
  const saved = db && getRecord(db, 'campaign', 'current');
  const instance = saved && saved.origin !== 'demo' && saved.id !== 'template' && isDay(saved.start) && isDay(saved.end) && saved.start <= saved.end && saved.months?.includes(month) ? saved : null;
  const nodes = new Map();
  for (const phase of instance?.phases || []) for (const node of phase.nodes || []) {
    nodes.set(`node:${node.n}`, node.done === true);
    for (const [i, kid] of (node.kids || []).entries()) nodes.set(`kid:${node.n}:${i}`, kid[1] === true);
  }
  const completed = [...nodes.values()].filter(Boolean).length;
  return { month, campaign: instance ? { id: instance.id, name: instance.name, start: instance.start, end: instance.end } : null, steps: [
    priceStep(db, month),
    materialsStep(db, month),
    briefStep(db, month),
    { key: 'campaign', label: '营销战役', state: instance && nodes.size && completed === nodes.size ? 'done' : instance ? 'part' : 'todo', meta: instance ? `${completed}/${nodes.size} 节点完成` : '该月尚未创建战役', href: '#/projects/campaign' },
  ] };
}

export function deliveryRoutes(db) {
  return [route('GET', '/api/v3/months/:month', handleV3((req, { params: { month } }) => {
    requireMonth(month);
    return deliveryView(db, month);
  }))];
}
