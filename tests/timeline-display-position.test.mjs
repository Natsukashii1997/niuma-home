import test from 'node:test';
import assert from 'node:assert/strict';
import {pendingMonthSpan, timelineReferenceText, monthTimelineData} from '../src/modules/user/timeline-view.js';

test('参考月日按实际日位定位，但不生成确定年份或排期', () => {
  for (const day of [2, 3, 4, 18, 30]) {
    const raw = `11.${day}（去年）`;
    assert.deepEqual(pendingMonthSpan(raw, '2026-11'), {start:day, end:day, single:true});
    const tl = {agenda:[], anomalies:[{a:raw, c:'英国', school:'测试大学', src:'英国!M2', monthHints:['*-11'], cell:{type:'Withdraw 截止'}}], countries:[['UK','英国']], table:{UK:[{}]}};
    const e = monthTimelineData(tl, '2026-11').list[0];
    assert.equal(e.from, null); assert.equal(e.to, null); assert.equal(e.pending, true);
    assert.equal(e.raw, raw); assert.equal(e.displaySpan.start, day); assert.equal(tl.agenda.length, 0);
  }
});

test('跨月和跨年原文只裁剪显示范围，不把去年套用为已核实日期', () => {
  assert.deepEqual(pendingMonthSpan('11.17-2.8', '2026-11'), {start:17,end:30,single:false});
  assert.deepEqual(pendingMonthSpan('11.17-2.8', '2027-01'), {start:1,end:31,single:false});
  assert.deepEqual(pendingMonthSpan('11.17-2.8', '2027-02'), {start:1,end:8,single:false});
  assert.deepEqual(pendingMonthSpan('7.13-11.6', '2026-11'), {start:1,end:6,single:false});
  assert.deepEqual(pendingMonthSpan('2026.10.26-11.6（AI推测）', '2026-11'), {start:1,end:6,single:false});
  assert.deepEqual(pendingMonthSpan('2026年11月18日', '2026-11'), {start:18,end:18,single:true});
  assert.deepEqual(pendingMonthSpan('11月18日到11月20日', '2026-11'), {start:18,end:20,single:false});
  assert.equal(pendingMonthSpan('11.17-2.8', '2026-06'), null);
});

test('模糊日期、非法日期、网址和多个离散日期不猜一个时间位置', () => {
  for (const raw of ['11月中旬','日期待定','11.31','2.30','11.20-11.3','11.18、11.20','11.18 或 11.20','https://example.edu/2026/11/18']) {
    assert.equal(pendingMonthSpan(raw, '2026-11'), null, raw);
  }
});

test('显示文案只去掉重复标签，原始字符串保持可追溯', () => {
  for (const suffix of ['（去年）','（去年参考）','（待确认）','（AI推测）','(推测)']) assert.equal(timelineReferenceText(`11.18${suffix}`), '11.18');
  assert.equal(timelineReferenceText('11.18（本科）'), '11.18（本科）');
});
