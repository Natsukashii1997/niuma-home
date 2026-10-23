import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beijingTime } from '../src/constants.js';

test('beijingTime 把带时区的 ISO 时间按北京时间显示，跨日、跨年都对', () => {
  assert.equal(beijingTime('2026-10-23T02:38:00.000Z'), '2026-10-23 10:38');
  assert.equal(beijingTime('2026-10-23T16:30:00.000Z'), '2026-10-24 00:30');
  assert.equal(beijingTime('2026-12-31T16:05:00Z'), '2027-01-01 00:05');
  assert.equal(beijingTime('2026-10-24T00:30:00+08:00'), '2026-10-24 00:30');
});

test('beijingTime 遇到没带时区、无效或非字符串的值返回空串，不猜', () => {
  for (const value of ['2026-10-23 22:38', '2026-10-23T22:38:00', 'not-a-date Z', '', null, undefined, 1761187080000]) assert.equal(beijingTime(value), '', String(value));
});
