import { runLark } from './projects.mjs';
import { REVENUE_SOURCE } from './revenue.mjs';
import { beijingText, failure, saveSnapshot } from './v3-common.mjs';

// 2026-10-21 核对的完整图表清单。已接图缺失时报错，不能把缺图当成空数据。
const REQUIRED = ['总营收', '大学辅导趋势 - 总营收', '国际课程趋势 - 总营收', '申诉趋势 - 总营收', '总转化率趋势', '当月大学营收占比 - 地区', '当月大学营收占比 - 学校', '当月大学营收占比 - SKU', '当月国课营收占比 - 地区', '当月国课营收占比 - 科目一级（暂无反写）', '当月国课营收占比 - SKU', '当月申诉营收占比 - 地区', '当月申诉营收占比 - 学校', '当月申诉营收占比 - SKU'];
const REGION = '当月大学营收占比 - 地区'; // CLI 类型为 unknown，已核对为一维实收金额占比分布。
const selected = b => ['line', 'pie'].includes(b.type) || b.name === REGION;
const fail = (name, detail) => failure(502, `图表「${name}」${detail}`);
const textValue = value => value == null || value === '' ? '未填写' : String(value);

function chartView(block, data) {
  const { name, type: sourceType, data_config: cfg } = block;
  const type = name === REGION && sourceType === 'unknown' ? 'pie' : sourceType;
  const dims = data.dimensions, measures = data.measures, rows = data.main_data;
  if (!['line', 'pie'].includes(type) || !cfg || !Array.isArray(dims) || !Array.isArray(measures) || measures.length !== 1 || !Array.isArray(rows) || data.has_more || data.truncated) throw fail(name, '的数据结构不完整或不支持');
  const measure = measures[0];
  const declared = cfg.series?.[0];
  if (!measure.alias || !declared || cfg.series.length !== 1 || measure.field_name !== declared.field_name || measure.aggregation?.toLowerCase() !== declared.rollup?.toLowerCase()) throw fail(name, '的统计字段或聚合口径不匹配');
  const groups = cfg.group_by?.map(g => g.field_name);
  if (!groups?.length || groups.length !== dims.length || new Set(dims.map(d => d.alias)).size !== dims.length) throw fail(name, '的维度配置不完整');
  const axes = groups.map(field => dims.find(d => d.field_name === field));
  if (axes.some(d => !d?.alias)) throw fail(name, '的维度字段不匹配');
  const unit = measure.field_name.includes('转化率') ? 'percent' : /营收|金额/.test(measure.field_name) ? 'currency' : null;
  if (!unit) throw fail(name, '的单位尚未确认');
  const valueOf = row => {
    const value = row[measure.alias]?.value;
    if (value === undefined || value !== null && (typeof value !== 'number' || !Number.isFinite(value))) throw fail(name, '含有无效数值');
    return value;
  };
  const dimOf = (row, dimension) => {
    if (!row[dimension.alias] || !Object.hasOwn(row[dimension.alias], 'value')) throw fail(name, '缺少分类值');
    const value = row[dimension.alias].value;
    if (value !== null && typeof value === 'object') throw fail(name, '含有不支持的分类值');
    return textValue(value);
  };
  const chart = { id: block.block_id || block.id, name, type, sourceType, unit, sourceTable: cfg.table_name, filter: cfg.filter || null, dimension: groups[0], measure: { field: measure.field_name, aggregation: measure.aggregation } };
  if (type === 'pie') {
    if (dims.length !== 1) throw fail(name, '的占比维度不是一维');
    const items = rows.map(row => ({ label: dimOf(row, axes[0]), value: valueOf(row) }));
    if (new Set(items.map(i => i.label)).size !== items.length) throw fail(name, '包含重复分类');
    const total = items.some(i => i.value === null) ? null : items.reduce((sum, i) => sum + i.value, 0);
    if (total !== null && !Number.isFinite(total)) throw fail(name, '的合计超出可表示范围');
    return { ...chart, items, total, pieAvailable: total > 0 && items.every(i => i.value !== null && i.value >= 0) };
  }
  if (dims.length > 2) throw fail(name, '的折线维度超过两维');
  const points = rows.map(row => ({ x: dimOf(row, axes[0]), series: axes[1] ? dimOf(row, axes[1]) : measure.field_name, value: valueOf(row) }));
  if (new Set(points.map(p => JSON.stringify([p.x, p.series]))).size !== points.length) throw fail(name, '包含重复的横轴/系列值');
  const categories = [...new Set(points.map(p => p.x))];
  if (groups[0] === '月份') {
    if (categories.some(x => !/^(0?[1-9]|1[0-2])$/.test(x))) throw fail(name, '含有无效月份');
    categories.sort((a, b) => Number(a) - Number(b));
  }
  const seriesNames = [...new Set(points.map(p => p.series))];
  if (groups[1] === '年份') seriesNames.sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
  return { ...chart, categories, series: seriesNames.map(name => ({ name, values: categories.map(x => points.find(p => p.x === x && p.series === name)?.value ?? null) })) };
}

export async function readBusinessCharts(cfg = REVENUE_SOURCE, { run, now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  async function read(args, label) {
    for (let attempt = 0; ; attempt++) {
      try { return await runLark(args, run); }
      catch (error) {
        // 真实读取复现 API code=1；仅对这个接口错误和限流做一次只读重试。
        if (!attempt && (error.status === 429 || error.status === 502 && error.larkCode === 1)) {
          await pause(error.retryAfterMs || 1000);
          continue;
        }
        error.message = `${label}：${error.message}${Number.isInteger(error.larkCode) ? `（接口错误码 ${error.larkCode}）` : ''}`;
        throw error;
      }
    }
  }
  const common = ['--base-token', cfg.base, '--dashboard-id', cfg.dashboard];
  const blocks = [], tokens = new Set();
  let token;
  do {
    const page = await read(['base', '+dashboard-block-list', ...common, '--page-size', '100', ...(token ? ['--page-token', token] : [])], '读取图表目录');
    const items = page.items || page.blocks;
    if (!Array.isArray(items) || typeof page.has_more !== 'boolean') throw failure(502, '仪表盘组件分页不完整');
    blocks.push(...items);
    token = page.has_more ? page.page_token : null;
    if (page.has_more && (!token || tokens.has(token))) throw failure(502, '仪表盘分页游标缺失或重复');
    if (token) tokens.add(token);
  } while (token);
  if (new Set(blocks.map(b => b.block_id || b.id)).size !== blocks.length) throw failure(502, '仪表盘组件标识重复');
  for (const name of REQUIRED) if (blocks.filter(b => b.name === name && selected(b)).length !== 1) throw fail(name, '缺失、重名或类型已改变');
  const targets = blocks.filter(selected).sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0) || (a.position?.x ?? 0) - (b.position?.x ?? 0));
  const charts = [];
  const startedPeriod = beijingText(now()).slice(0, 7);
  for (const b of targets) { // 串行，避免对飞书造成并发读取压力。
    const args = [...common, '--block-id', b.block_id || b.id];
    const { block } = await read(['base', '+dashboard-block-get', ...args], `图表「${b.name}」读取配置`);
    if (!block || block.name !== b.name || (block.block_id || block.id) !== (b.block_id || b.id)) throw fail(b.name, '在读取期间发生变化');
    const data = await read(['base', '+dashboard-block-get-data', ...args], `图表「${b.name}」读取数值`);
    charts.push(chartView(block, data));
  }
  const updatedAt = beijingText(now());
  if (updatedAt.slice(0, 7) !== startedPeriod) throw failure(409, '读取跨越月份，请重新读取完整图表');
  return { source: cfg.url, period: startedPeriod, updatedAt, charts };
}

// 独立于指标卡缓存；只保存整批成功结果。旧快照明确标为旧数据，失败不覆盖成功时间。
export function createBusinessChartsService(db, { readSource = readBusinessCharts, now = Date.now, ttl = 600_000, ...options } = {}) {
  const kind = 'business-charts-v1';
  let cached, inflight, sourceError, retryAt = 0;
  try {
    const saved = JSON.parse(db.prepare('SELECT payload FROM v3_snapshots WHERE kind=?').get(kind)?.payload || 'null');
    if (saved?.source === REVENUE_SOURCE.url && Array.isArray(saved.charts) && saved.charts.length >= REQUIRED.length) cached = saved;
  } catch { /* 无完整快照时进行首次真实读取。 */ }
  const expired = () => !cached || cached.period !== beijingText(now()).slice(0, 7) || now() - Date.parse(cached.updatedAt.replace(' ', 'T') + ':00+08:00') >= ttl;
  function refresh() {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const value = await readSource(REVENUE_SOURCE, { ...options, now });
        saveSnapshot(db, kind, value, new Date(now()).toISOString());
        cached = value; sourceError = null; retryAt = 0;
        return value;
      } catch (error) {
        sourceError = error.message; retryAt = now() + 60_000;
        throw error;
      } finally { inflight = null; }
    })();
    return inflight;
  }
  return { async get({ refresh: force = false } = {}) {
    if (force) await refresh();
    else if (!cached) {
      if (now() < retryAt) throw failure(502, sourceError);
      await refresh();
    } else if (expired() && now() >= retryAt) refresh().catch(() => {});
    return { ...structuredClone(cached), stale: expired(), refreshing: Boolean(inflight), ...(sourceError && { sourceError }) };
  } };
}
