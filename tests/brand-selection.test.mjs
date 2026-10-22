import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandVersionIndex } from '../src/modules/brand/brand-selection.js';

test('品牌刷新增添新版本或调整顺序时，仍显示选中的飞书表', () => {
  const old = [{ table: 'new' }, { table: 'selected' }, { table: 'old' }];
  assert.equal(brandVersionIndex(old, 'selected'), 1);
  const refreshed = [{ table: 'newest' }, ...old];
  assert.equal(refreshed[brandVersionIndex(refreshed, 'selected')].table, 'selected');
  const reordered = [old[1], old[0], old[2]];
  assert.equal(reordered[brandVersionIndex(reordered, 'selected')].table, 'selected');
});

test('选中的品牌版本被移除时回到最新版本，不访问失效下标', () => {
  const versions = [{ table: 'latest' }];
  assert.equal(versions[brandVersionIndex(versions, 'removed')].table, 'latest');
});
