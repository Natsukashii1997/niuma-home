import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthContext, niceScale, shareItems, squarify, topN, yearTrend, yoy } from '../src/modules/business/chart-math.js';

const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const line = (now, last, unit = 'currency') => ({ type: 'line', unit, dimension: '月份', categories: months, series: [{ name: '2025', values: last }, { name: '2026', values: now }] });
const fill = (v, upTo) => months.map((_, i) => (i < upTo ? v : null));

test('当月判断用接口的 period / updatedAt，月末视为整月', () => {
  assert.deepEqual(monthContext('2026-10', '2026-10-23 15:25'), { year: 2026, month: 10, day: 23, daysInMonth: 31, partial: true });
  assert.equal(monthContext('2026-10', '2026-10-31 23:50').partial, false);
  // 快照属于上个月（还没刷新）：按整月处理，不推算
  assert.equal(monthContext('2026-09', '2026-10-01 00:05').partial, false);
  assert.equal(monthContext('2028-02', '2028-02-10 09:00').daysInMonth, 29);
});

test('今年 / 去年整理、推算与同口径累计', () => {
  const ctx = monthContext('2026-10', '2026-10-23 15:25');
  const t = yearTrend(line(fill(200, 10), fill(100, 12)), ctx);
  assert.equal(t.cur, 9);
  assert.equal(t.partial, 9);
  assert.equal(t.value, 200);
  assert.equal(t.pace, 200 / 23 * 31);
  assert.equal(t.ytd, 1800);
  assert.equal(t.ytdLast, 900);
  assert.equal(t.ytdYoY, 1);
  assert.equal(t.ytdMonths, 9);
  assert.equal(t.best, 0); // 当月未过完不参与「今年最高」
  assert.deepEqual(yoy(t, 0), { value: 1, estimated: false });
  assert.deepEqual(yoy(t, 9), { value: 200 / 23 * 31 / 100 - 1, estimated: true });
  assert.equal(yoy(t, 10), null);
});

test('缺月不补零：累计只取今年与去年都有值的月份', () => {
  const ctx = monthContext('2026-10', '2026-10-23 15:25');
  const now = fill(200, 10); now[2] = null;
  const last = fill(100, 12); last[4] = null;
  const t = yearTrend(line(now, last), ctx);
  assert.equal(t.ytdMonths, 7);
  assert.equal(t.ytd, 1400);
  assert.equal(t.ytdLast, 700);
});

test('转化率：累计取均值、同比为百分点差、不推算', () => {
  const ctx = monthContext('2026-10', '2026-10-23 15:25');
  const t = yearTrend(line(fill(0.35, 10), fill(0.3, 12), 'percent'), ctx);
  assert.equal(t.pace, null);
  assert.ok(Math.abs(t.ytd - 0.35) < 1e-12);
  assert.ok(Math.abs(t.ytdYoY - 0.05) < 1e-12);
  assert.equal(yoy(t, 9), null);
});

test('跨年：1 月未过完时没有累计，当月就是第一个点', () => {
  const ctx = monthContext('2027-01', '2027-01-05 10:00');
  const chart = { ...line(fill(1, 12), fill(1, 1)), series: [{ name: '2026', values: fill(5, 12) }, { name: '2027', values: fill(1, 1) }] };
  const t = yearTrend(chart, ctx);
  assert.equal(t.partial, 0);
  assert.equal(t.ytd, null);
  assert.equal(t.lastSame, 5);
  assert.equal(t.pace, 1 / 5 * 31);
});

test('取整刻度包住数据', () => {
  const s = niceScale(0, 25644033);
  assert.equal(s.min, 0);
  assert.ok(s.max >= 25644033);
  assert.deepEqual(s.ticks, [0, 1e7, 2e7, 3e7]);
});

test('占比排序、前 N 名 + 其他、源表未填写', () => {
  const s = shareItems({ total: 100, pieAvailable: true, items: [{ label: 'b', value: 10 }, { label: 'a', value: 60 }, { label: 'c', value: 20 }, { label: 'd', value: 6 }, { label: 'e', value: 4 }] });
  assert.deepEqual(s.items.map(i => i.label), ['a', 'c', 'b', 'd', 'e']);
  const parts = topN(s.items, 2);
  assert.equal(parts.length, 3);
  assert.deepEqual({ ...parts[2], share: Math.round(parts[2].share * 100) / 100 }, { label: '其他 3 项', value: 20, share: 0.2, other: true, count: 3 });
  assert.equal(topN(s.items, 4).length, 5); // 只多 1 项时不折叠
  assert.equal(shareItems({ total: 5, pieAvailable: true, items: [{ label: '未填写', value: 5 }] }).onlyBlank, true);
});

test('面积块总面积等于容器、不越界', () => {
  const items = [44.7, 29, 5.5, 5.4, 3.6, 2.7, 2.2, 1.7, 1, 4.2].map((value, i) => ({ label: String(i), value }));
  const tiles = squarify(items, 540, 260);
  assert.equal(tiles.length, items.length);
  const area = tiles.reduce((a, t) => a + t.w * t.h, 0);
  assert.ok(Math.abs(area - 540 * 260) < 1e-6);
  for (const t of tiles) {
    assert.ok(t.x >= -1e-9 && t.y >= -1e-9 && t.x + t.w <= 540 + 1e-6 && t.y + t.h <= 260 + 1e-6);
    assert.ok(Math.abs(t.w * t.h - t.item.value / 100 * 540 * 260) < 1e-6);
  }
  assert.deepEqual(squarify([], 100, 100), []);
});
