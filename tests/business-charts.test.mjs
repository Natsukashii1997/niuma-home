import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readBusinessCharts, createBusinessChartsService } from '../server/business-charts.mjs';
import { REVENUE_SOURCE } from '../server/revenue.mjs';
import { DatabaseSync } from 'node:sqlite';

const names = ['总营收', '大学辅导趋势 - 总营收', '国际课程趋势 - 总营收', '申诉趋势 - 总营收', '总转化率趋势', '当月大学营收占比 - 地区', '当月大学营收占比 - 学校', '当月大学营收占比 - SKU', '当月国课营收占比 - 地区', '当月国课营收占比 - 科目一级（暂无反写）', '当月国课营收占比 - SKU', '当月申诉营收占比 - 地区', '当月申诉营收占比 - 学校', '当月申诉营收占比 - SKU'];
const blocks = names.map((name, i) => ({ name, block_id: `b${i}`, type: i < 5 ? 'line' : i === 5 ? 'unknown' : 'pie', position: { y: i, x: 0 } }));
const ok = data => ({ stdout: JSON.stringify({ ok: true, identity: 'user', data }) });
function fake({ mutate = () => {}, missing, page = false } = {}) {
  const calls = [];
  return { calls, run: async (command, args) => {
    calls.push(args);
    assert.equal(command, 'lark-cli');
    assert.ok(args.includes('cli_a965c429ef785bd3') && args.includes('user'));
    const op = args[3];
    if (op === '+dashboard-block-list') {
      const all = blocks.filter(b => b.name !== missing);
      return ok(page && !args.includes('--page-token') ? { items: all.slice(0, 7), has_more: true, page_token: 'page2' } : { items: page ? all.slice(7) : all, has_more: false });
    }
    const i = Number(args[args.indexOf('--block-id') + 1].slice(1));
    const chart = blocks[i];
    const field = i === 4 ? '新签转化率' : i < 5 ? '总营收' : '实收金额';
    if (op === '+dashboard-block-get') {
      const data_config = {
        table_name: i < 5 ? '全盘数据' : '当月数据',
        group_by: i < 5 ? [{ field_name: '月份' }, { field_name: '年份' }] : [{ field_name: '类别' }],
        series: [{ field_name: field, rollup: i === 4 ? 'MAX' : 'SUM' }],
        filter: i < 5 ? null : {
          conditions: [{ field_name: '收款日期', operator: 'is', value: ['CurrentMonth'] }],
          conjunction: 'and',
        },
      };
      return ok({ block: { ...chart, data_config } });
    }
    assert.equal(op, '+dashboard-block-get-data');
    const data = { measures: [{ alias: 'm', field_name: field, aggregation: i === 4 ? 'max' : 'sum' }], dimensions: i < 5 ? [{ alias: 'x', field_name: '月份' }, { alias: 'y', field_name: '年份' }] : [{ alias: 'd', field_name: '类别' }], main_data: i < 5 ? [
      { x: { value: '01' }, y: { value: '2025' }, m: { value: i === 4 ? 0.25 : 100 } },
      { x: { value: '01' }, y: { value: '2026' }, m: { value: i === 4 ? 0.35 : 300 } },
      { x: { value: '02' }, y: { value: '2025' }, m: { value: i === 4 ? 0.3 : 200 } },
    ] : [ { d: { value: '' }, m: { value: 75 } }, { d: { value: 'B' }, m: { value: 25 } }, { d: { value: 'C' }, m: { value: 0 } } ] };
    mutate(data, i);
    return ok(data);
  } };
}
const now = () => Date.parse('2026-10-21T02:00:00Z');

test('单张图返回API错误码1只重试一次；持续失败或权限拒绝不能假成功', async () => {
  const source = fake();
  let tries = 0;
  const run = async (...args) => {
    if (args[1][3] === '+dashboard-block-get-data' && ++tries === 1) throw { stderr: JSON.stringify({ error: { code: 1, subtype: 'unknown' } }) };
    return source.run(...args);
  };
  const result = await readBusinessCharts(REVENUE_SOURCE, { run, now, pause: async () => {} });
  assert.equal(result.charts.length, 14);
  assert.equal(tries, 15);
  for (const [subtype, expectedTries] of [['unknown', 2], ['permission_denied', 1]]) {
    let calls = 0;
    const failureRun = async () => { calls++; throw { stderr: JSON.stringify({ error: { code: 1, subtype } }) }; };
    await assert.rejects(readBusinessCharts(REVENUE_SOURCE, { run: failureRun, pause: async () => {} }));
    assert.equal(calls, expectedTries);
  }
});

test('完整读取分页的14张源图：年份独立、缺月不补零、占比保留空分类和零值', async () => {
  const source = fake({ page: true });
  const result = await readBusinessCharts(REVENUE_SOURCE, { run: source.run, now });
  assert.equal(result.charts.length, 14);
  assert.deepEqual(result.charts.map(c => c.name), names);
  assert.equal(result.period, '2026-10');
  assert.deepEqual(result.charts[0].categories, ['01', '02']);
  assert.deepEqual(result.charts[0].series, [{ name: '2025', values: [100, 200] }, { name: '2026', values: [300, null] }]);
  assert.equal(result.charts[4].unit, 'percent');
  assert.deepEqual(result.charts[5].items, [{ label: '未填写', value: 75 }, { label: 'B', value: 25 }, { label: 'C', value: 0 }]);
  assert.equal(result.charts[5].sourceType, 'unknown');
  assert.equal(result.charts[5].total, 100);
  assert.equal(result.charts[5].sourceTable, '当月数据');
  assert.equal(result.charts[5].filter.conditions[0].value[0], 'CurrentMonth');
});

test('缺图、无效数值、重复点与统计口径变化都明确失败；负数不伪装为正占比', async () => {
  await assert.rejects(readBusinessCharts(REVENUE_SOURCE, { run: fake({ missing: '当月申诉营收占比 - SKU' }).run }), /缺失/);
  await assert.rejects(readBusinessCharts(REVENUE_SOURCE, { run: fake({ mutate: (d, i) => { if (i === 0) d.main_data[0].m.value = '100'; } }).run }), /无效数值/);
  await assert.rejects(readBusinessCharts(REVENUE_SOURCE, { run: fake({ mutate: (d, i) => { if (i === 0) d.main_data.push(d.main_data[0]); } }).run }), /重复/);
  await assert.rejects(readBusinessCharts(REVENUE_SOURCE, { run: fake({ mutate: (d, i) => { if (i === 0) d.measures[0].aggregation = 'avg'; } }).run }), /聚合口径/);
  const negative = await readBusinessCharts(REVENUE_SOURCE, { run: fake({ mutate: (d, i) => { if (i === 5) d.main_data[1].m.value = -25; if (i === 0) d.main_data[0].m.value = null; } }).run });
  assert.equal(negative.charts[5].pieAvailable, false);
  assert.equal(negative.charts[5].items[1].value, -25);
  assert.equal(negative.charts[0].series[0].values[0], null);
  const missingValue = await readBusinessCharts(REVENUE_SOURCE, { run: fake({ mutate: (d, i) => { if (i === 5) d.main_data[1].m.value = null; } }).run });
  assert.equal(missingValue.charts[5].total, null);
  assert.equal(missingValue.charts[5].pieAvailable, false);
});

test('旧快照刷新失败保留原数值与时间并暴露错误；不将部分读取保存为成功', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE v3_snapshots(kind TEXT PRIMARY KEY, payload TEXT, updated_at TEXT)');
  let at = now(), failed = false;
  const readSource = async () => {
    if (failed) throw new Error('图表读取中断');
    return readBusinessCharts(REVENUE_SOURCE, { run: fake().run, now: () => at });
  };
  const service = createBusinessChartsService(db, { readSource, now: () => at });
  const initial = await service.get();
  assert.equal(initial.stale, false);
  at += 601_000; failed = true;
  assert.equal((await service.get()).stale, true);
  await new Promise(resolve => setImmediate(resolve));
  const stale = await service.get();
  assert.equal(stale.sourceError, '图表读取中断');
  assert.equal(stale.updatedAt, initial.updatedAt);
  assert.deepEqual(stale.charts, initial.charts);
  await assert.rejects(service.get({ refresh: true }), /读取中断/);
  const restarted = createBusinessChartsService(db, { readSource, now: () => at });
  assert.deepEqual((await restarted.get()).charts, initial.charts);
  await new Promise(resolve => setImmediate(resolve));
  failed = false;
  const recovered = await service.get({ refresh: true });
  assert.equal(recovered.stale, false);
  assert.equal(recovered.sourceError, undefined);
  assert.notEqual(recovered.updatedAt, initial.updatedAt);
  db.close();
});
