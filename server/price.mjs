import { getSettings } from './db.mjs';
import { getRecord, listRecords, createLocalChanges, fingerprint } from './local-records.mjs';
import { failure } from './v3-common.mjs';
import { marketingFailure, isDay } from './campaigns.mjs';
import { V3_DEFAULTS } from './v3-settings.mjs';
import demo from '../fixtures/v3-demo-price.json' with { type: 'json' };
import provided from '../fixtures/v3-provided-prices.json' with { type: 'json' };

// 四个主分组，稳分系列含三个产品。保留旧编号与别名，让已保存的价格和 SKU 入口继续可用。
export const PRICE_SHEETS = [
  { id: 'uni-lite', line: '大学辅导', name: '灵活学Lite', label: '灵活学Lite' },
  { id: 'uni-max', line: '大学辅导', name: '安心学Max', label: '安心学Max', groupId: 'uni-score', groupLabel: '稳分系列' },
  { id: 'uni-exam-pass', line: '大学辅导', name: '学考无忧Pass', label: '学考无忧Pass', groupId: 'uni-score', groupLabel: '稳分系列' },
  { id: 'uni-resit-pass', line: '大学辅导', name: '补考护航Pass', label: '补考护航Pass', groupId: 'uni-score', groupLabel: '稳分系列' },
  { id: 'intl-lite', line: '国际课程', name: '课程课时卡', label: '课程课时卡', aliases: ['灵活学Lite', '课时卡'] },
  { id: 'intl-comp', line: '国际课程', name: '竞赛课时卡', label: '竞赛课时卡' },
];
const fail = message => { throw failure(400, message); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value, max = 500) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const same = (a, b) => fingerprint(a) === fingerprint(b);
const matchesSheet = (record, sheet) => record?.line === sheet.line && (record.name === sheet.name || sheet.aliases?.includes(record.name));
function sheetData(db, sheet) {
  const saved = getRecord(db, 'price-schemes', sheet.id);
  if (matchesSheet(saved, sheet)) return { value: saved, origin: 'local' };
  if (provided.matrices[sheet.id]) return { value: provided.matrices[sheet.id], origin: 'provided', source: provided.source };
  if (demo.skus.includes(sheet.id)) return { value: demo, origin: 'demo' };
  return { value: { unitOrig: null, tiers: [...demo.tiers], schemes: [] }, origin: 'empty' };
}

export function priceSettings(db) {
  const values = { ...V3_DEFAULTS, ...getSettings(db) }, a = values.price_floor_margin, b = values.price_cost_per_hour;
  if (typeof a !== 'string' || !a.trim() || typeof b !== 'string' || !b.trim() || !Number.isFinite(Number(a)) || Number(a) < 0 || Number(a) >= 1 || !Number.isFinite(Number(b)) || Number(b) < 0) throw marketingFailure(503, 'PRICE_SETTINGS_UNCONFIGURED', '请先在设置里确认毛利底线和每课时成本');
  return { floorMargin: Number(a), costPerHour: Number(b) };
}

export function priceCatalog(db) {
  return PRICE_SHEETS.map(sheet => {
    const { value, origin } = sheetData(db, sheet);
    return { ...sheet, unitOrig: value.unitOrig, tiers: [...value.tiers], origin };
  });
}

function validateMatrix(value, sku) {
  if (!plain(value) || value.sku !== sku.id || value.line !== sku.line || value.name !== sku.name) fail('价格方案与当前SKU不一致');
  if (!Number.isFinite(value.unitOrig) || value.unitOrig <= 0 || value.unitOrig > 10000000 || !Array.isArray(value.tiers) || !value.tiers.length || value.tiers.length > 50 || value.tiers.some((n, i) => !Number.isSafeInteger(n) || n <= 0 || n > 10000 || (i > 0 && n <= value.tiers[i - 1]))) fail('请填写每课时原价和升序、不重复的课时档位');
  if (!Array.isArray(value.schemes) || !value.schemes.length || value.schemes.length > 100) fail('请至少填写一套真实价格方案');
  const ids = new Set();
  for (const scheme of value.schemes) {
    if (!plain(scheme) || !identifier(scheme.id) || ids.has(scheme.id) || !nonempty(scheme.name) || !['常规', '活动', '赠课'].includes(scheme.kind) || !['生效中', '草稿', '历史', '已记录'].includes(scheme.status)) fail('价格方案编号、名称、类型或状态无效');
    ids.add(scheme.id);
    const undatedArchive = scheme.status === '已记录' && scheme.from === '' && scheme.to === '';
    if (!undatedArchive && (!isDay(scheme.from) || typeof scheme.to !== 'string' || (scheme.to !== '' && (!isDay(scheme.to) || scheme.to < scheme.from)))) fail('价格生效期须为有效的 YYYY-MM-DD；仅「已记录」档案可不填日期');
    const blank = Array.isArray(scheme.prices) ? scheme.prices.filter(p => p === null).length : 0;
    if (blank) fail(`「${scheme.name}」还有 ${blank} 档总价没填，填满后才能保存`);
    if (!Array.isArray(scheme.prices) || !Array.isArray(scheme.gifts) || scheme.prices.length !== value.tiers.length || scheme.gifts.length !== value.tiers.length || scheme.prices.some(p => !Number.isFinite(p) || p <= 0 || p > 100000000) || scheme.gifts.some(g => !Number.isSafeInteger(g) || g < 0 || g > 10000)) fail('各档总价与赠课须对应课时档位；总价大于零，赠课为非负整数');
    if (Object.keys(scheme).some(k => !['id', 'name', 'kind', 'status', 'from', 'to', 'prices', 'gifts'].includes(k))) fail('价格方案包含不支持的字段');
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
      const sku = await getSku(id), { value, origin, source } = sheetData(db, sku);
      const settings = priceSettings(db);
      const savedSettings = getSettings(db), costOrigin = savedSettings.price_floor_margin !== undefined && savedSettings.price_cost_per_hour !== undefined ? 'local' : 'demo';
      return { sku: id, ...settings, unitOrig: value.unitOrig, tiers: [...value.tiers], schemes: structuredClone(value.schemes), origin, costOrigin, ...(source ? { source } : {}) };
    },
    async preview(id, body) {
      const sku = await getSku(id), current = getRecord(db, 'price-schemes', id);
      if (!plain(body) || Object.keys(body).some(k => !['sku', 'unitOrig', 'tiers', 'schemes'].includes(k)) || (body.sku !== undefined && body.sku !== id)) fail('请提交当前SKU的原价、课时档位与方案列表');
      const value = { sku: id, line: sku.line, name: sku.name, unitOrig: body.unitOrig ?? current?.unitOrig, tiers: body.tiers ?? current?.tiers, schemes: structuredClone(body.schemes) };
      // 兼容旧页面提交：已移除的两个字段不再影响保存，也不继续写入新记录。
      if (Array.isArray(value.schemes)) for (const scheme of value.schemes) if (plain(scheme)) {
        delete scheme.needId; delete scheme.need; delete scheme.breachReason;
      }
      const settings = priceSettings(db);
      return changes.preview('price-schemes', id, value, { validate: candidate => {
        if (!same(settings, priceSettings(db))) throw marketingFailure(409, 'PRICE_SETTINGS_CHANGED', '价格成本或毛利底线已变化，请重新预览');
        validateMatrix(candidate, sku);
      } });
    },
    confirm: (id, body) => changes.confirm('price-schemes', id, body),
  };
}
