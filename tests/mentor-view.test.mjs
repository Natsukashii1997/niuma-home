import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mentorReplyTime } from '../src/modules/projects/mentor-view.js';

test('带教回复：UTC 和显式偏移统一为北京时间，保持原有显示宽度', () => {
  assert.equal(mentorReplyTime('2026-10-22T13:35:00.000Z'), '10-22 21:35');
  assert.equal(mentorReplyTime('2026-10-22T21:35:00+08:00'), '10-22 21:35');
  assert.equal(mentorReplyTime('2026-10-22T09:35:00-04:00'), '10-22 21:35');
});

test('带教回复：北京时间正确跨日、跨年及显示午夜零点', () => {
  assert.equal(mentorReplyTime('2026-10-22T16:00:00Z'), '10-23 00:00');
  assert.equal(mentorReplyTime('2026-12-31T16:05:00Z'), '01-01 00:05');
});

test('带教回复：缺失、无效或未注明时区的时间不显示伪造日期', () => {
  for (const value of [undefined, null, '', 'invalidZ', '2026-10-22T13:35:00', 0]) {
    assert.equal(mentorReplyTime(value), '—');
  }
});

test('带教回复：宿主在 UTC、纽约或上海仍显示同一北京时间', () => {
  const moduleUrl = new URL('../src/modules/projects/mentor-view.js', import.meta.url).href;
  for (const TZ of ['UTC', 'America/New_York', 'Asia/Shanghai']) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { mentorReplyTime } from ${JSON.stringify(moduleUrl)}; console.log(mentorReplyTime('2026-10-22T16:05:00Z'));`],
    { env: { ...process.env, TZ }, encoding: 'utf8' });
    assert.equal(output.trim(), '10-23 00:05', TZ);
  }
});
