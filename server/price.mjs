import { getSettings } from './db.mjs';
import { getRecord, listRecords, createLocalChanges, fingerprint } from './local-records.mjs';
import { deriveNeeds } from './needs.mjs';
import { manualNeedRecords } from './manual-needs.mjs';
import { withRulings } from './timeline-rulings.mjs';
import { failure } from './v3-common.mjs';
import { marketingFailure, isDay } from './campaigns.mjs';
import { V3_DEFAULTS } from './v3-settings.mjs';
import { TIMELINE_SOURCE } from './timeline.mjs';
import demo from '../fixtures/v3-demo-price.json' with { type: 'json' };

// 价格记录固定 4 张表（2026-10-18 用户确认），不再读飞书 SKU 表。前两张沿用原来的编号，已保存的价格记录照常读取；
// SKU 档案按 业务线 + 名称 匹配到这里。label 是页签上的显示名。
export const PRICE_SHEETS = [
  { id: 'uni-lite', line: '大学辅导', name: '灵活学Lite', label: '灵活学Lite' },
  { id: 'uni-max', line: '大学辅导', name: '安心学Max', label: '安心学Max' },
  { id: 'intl-lite', line: '国际课程', name: '灵活学Lite', label: '课时卡' },
  { id: 'intl-comp', line: '国际课程', name: '竞赛课时卡', label: '竞赛课时卡' },
];
const fail = message => { throw failure(400, message); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value, max = 500) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const same = (a, b) => fingerprint(a) === fingerprint(b);

export function priceSettings(db) {
  const values = { ...V3_DEFAULTS, ...getSettings(db) }, a = values.price_floor_margin, b = values.price_cost_per_hour;
  if (typeof a !== 'string' || !a.trim() || typeof b !== 'string' || !b.trim() || !Number.isFinite(Number(a)) || Number(a) < 0 || Number(a) >= 1 || !Number.isFinite(Number(b)) || Number(b) < 0) throw marketingFailure(503, 'PRICE_SETTINGS_UNCONFIGURED', '请先在设置里确认毛利底线和每课时成本');
  return { floorMargin: Number(a), costPerHour: Number(b) };
}

// 只使用已采纳且仍对应当前完整时间线快照的需求；来源变更的记录不继续充当价格依据。
export function acceptedMarketingNeeds(db, month) {
  const rows = month ? db.prepare('SELECT * FROM v3_needs WHERE month=?').all(month) : db.prepare('SELECT * FROM v3_needs').all();
  const snapshot = db.prepare("SELECT payload FROM v3_snapshots WHERE kind='timeline'").get();
  const defaultIdentity = JSON.stringify(TIMELINE_SOURCE), identity = getSettings(db).timeline_source || defaultIdentity;
  const saved = snapshot ? JSON.parse(snapshot.payload) : null;
  // 来源必须来自成功快照自身。旧裸快照没有身份，只兼容已知默认来源。
  const wrapped = saved && (Object.hasOwn(saved, 'identity') || Object.hasOwn(saved, 'value'));
  const base = wrapped ? saved.identity === identity ? saved.value : null : identity === defaultIdentity ? saved : null;
  const timeline = base && withRulings(db, base); // 与需求列表一致：叠加人工裁定
  const manual = new Map(manualNeedRecords(db).filter(item => item.need?.id).map(item => [item.need.id, item]));
  const derived = new Map();
  return rows.flatMap(row => {
    const need = JSON.parse(row.payload);
    if (need.status !== '已采纳') return [];
    const local = manual.get(row.id);
    if (local) {
      if (local.month !== row.month || fingerprint(local) !== row.source_fingerprint) return [];
    } else if (timeline && !/^(selftalk|manual)-/.test(row.id)) {
      if (!derived.has(row.month)) derived.set(row.month, deriveNeeds(timeline, row.month));
      if (!derived.get(row.month).some(n => n.need.id === row.id && n.fingerprint === row.source_fingerprint)) return [];
    } else return [];
    return [{ ...need, month: row.month }];
  });
}

export function priceCatalog(db) {
  return PRICE_SHEETS.map(sheet => {
    const saved = getRecord(db, 'price-schemes', sheet.id);
    if (saved?.line === sheet.line && saved?.name === sheet.name) return { ...sheet, unitOrig: saved.unitOrig, tiers: saved.tiers, origin: 'local' };
    if (demo.skus.includes(sheet.id)) return { ...sheet, unitOrig: demo.unitOrig, tiers: [...demo.tiers], origin: 'demo' };
    return { ...sheet, unitOrig: null, tiers: [...demo.tiers], origin: 'empty' }; // 还没有价格：档位沿用 5–200h，原价和方案留空，由用户在页面填写
  });
}

function validateMatrix(db, value, sku) {
  if (!plain(value) || value.sku !== sku.id || value.line !== sku.line || value.name !== sku.name) fail('价格方案与当前SKU不一致');
  if (!Number.isFinite(value.unitOrig) || value.unitOrig <= 0 || value.unitOrig > 10000000 || !Array.isArray(value.tiers) || !value.tiers.length || value.tiers.length > 50 || value.tiers.some((n, i) => !Number.isSafeInteger(n) || n <= 0 || n > 10000 || (i > 0 && n <= value.tiers[i - 1]))) fail('请填写每课时原价和升序、不重复的课时档位');
  if (!Array.isArray(value.schemes) || !value.schemes.length || value.schemes.length > 100) fail('请至少填写一套真实价格方案');
  const settings = priceSettings(db), needs = acceptedMarketingNeeds(db), ids = new Set();
  for (const scheme of value.schemes) {
    if (!plain(scheme) || !identifier(scheme.id) || ids.has(scheme.id) || !nonempty(scheme.name) || !['常规', '活动', '赠课'].includes(scheme.kind) || !['生效中', '草稿', '历史'].includes(scheme.status)) fail('价格方案编号、名称、类型或状态无效');
    ids.add(scheme.id);
    if (!isDay(scheme.from) || typeof scheme.to !== 'string' || (scheme.to !== '' && (!isDay(scheme.to) || scheme.to < scheme.from))) fail('价格生效期须为有效的 YYYY-MM-DD，长期有效的结束日期留空');
    const blank = Array.isArray(scheme.prices) ? scheme.prices.filter(p => p === null).length : 0;
    if (blank) fail(`「${scheme.name}」还有 ${blank} 档总价没填，填满后才能保存`);
    if (!Array.isArray(scheme.prices) || !Array.isArray(scheme.gifts) || scheme.prices.length !== value.tiers.length || scheme.gifts.length !== value.tiers.length || scheme.prices.some(p => !Number.isFinite(p) || p <= 0 || p > 100000000) || scheme.gifts.some(g => !Number.isSafeInteger(g) || g < 0 || g > 10000)) fail('各档总价与赠课须对应课时档位；总价大于零，赠课为非负整数');
    const breach = scheme.prices.some((price, i) => (price - settings.costPerHour * (value.tiers[i] + scheme.gifts[i])) / price < settings.floorMargin);
    if (breach && !nonempty(scheme.breachReason, 2000)) fail('该方案低于毛利底线，请填写破底线原因');
    if (scheme.breachReason !== undefined && (typeof scheme.breachReason !== 'string' || scheme.breachReason.length > 2000)) fail('破底线原因格式无效');
    if (scheme.kind === '活动' && !identifier(scheme.needId)) fail('活动价格方案必须关联一条已采纳需求');
    if (scheme.needId !== undefined && scheme.needId !== '') {
      const need = needs.find(n => n.id === scheme.needId);
      if (!need) fail('关联需求未采纳或来源已变化，请重新选择');
      const expected = `${need.seg} · ${need.node}`;
      if (scheme.need !== expected) fail('关联需求显示文字与已采纳记录不一致');
    } else if (scheme.need) fail('请通过 needId 关联真实已采纳需求，不接受手填需求文字');
    if (Object.keys(scheme).some(k => !['id', 'name', 'kind', 'status', 'from', 'to', 'prices', 'gifts', 'needId', 'need', 'breachReason'].includes(k))) fail('价格方案包含不支持的字段');
  }
}

export function availablePriceMatrices(db) { return listRecords(db, 'price-schemes'); }

export function createPriceService(db, options = {}) {
  const now = options.now || Date.now;
  const changes = createLocalChanges(db, { now });
  const skus = async () => priceCatalog(db);
  const getSku = async id => {
    if (!identifier(id)) fail('请选择有效的 SKU');
    const sku = (await skus()).find(s => s.id === id);
    if (!sku) throw marketingFailure(404, 'PRICE_SKU_NOT_FOUND', '没有这张价格表');
    return sku;
  };
  return {
    skus,
    async schemes(id) {
      const sku = await getSku(id), record = getRecord(db, 'price-schemes', id);
      const actual = record && record.line === sku.line && record.name === sku.name;
      const settings = priceSettings(db);
      if (!actual && !demo.skus.includes(id)) return { sku: id, ...settings, schemes: [], origin: 'empty' };
      const savedSettings = getSettings(db), origin = actual && savedSettings.price_floor_margin !== undefined && savedSettings.price_cost_per_hour !== undefined ? 'local' : 'demo';
      return { sku: id, ...settings, schemes: actual ? record.schemes : structuredClone(demo.schemes), origin };
    },
    async preview(id, body) {
      const sku = await getSku(id), current = getRecord(db, 'price-schemes', id);
      if (!plain(body) || Object.keys(body).some(k => !['sku', 'unitOrig', 'tiers', 'schemes'].includes(k)) || (body.sku !== undefined && body.sku !== id)) fail('请提交当前SKU的原价、课时档位与方案列表');
      const value = { sku: id, line: sku.line, name: sku.name, unitOrig: body.unitOrig ?? current?.unitOrig, tiers: body.tiers ?? current?.tiers, schemes: structuredClone(body.schemes) };
      if (Array.isArray(value.schemes)) {
        const needs = acceptedMarketingNeeds(db);
        for (const scheme of value.schemes) if (plain(scheme) && scheme.needId) {
          const need = needs.find(n => n.id === scheme.needId);
          if (need) scheme.need = `${need.seg} · ${need.node}`;
        }
      }
      const settings = priceSettings(db);
      return changes.preview('price-schemes', id, value, { validate: candidate => {
        if (!same(settings, priceSettings(db))) throw marketingFailure(409, 'PRICE_SETTINGS_CHANGED', '价格成本或毛利底线已变化，请重新预览');
        validateMatrix(db, candidate, sku);
      } });
    },
    confirm: (id, body) => changes.confirm('price-schemes', id, body),
  };
}
