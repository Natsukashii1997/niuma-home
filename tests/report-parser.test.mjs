import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseReports} from '../server/report-parser.mjs';
const fixture = name => readFileSync(new URL(`../fixtures/${name}`,import.meta.url),'utf8');

test('真实脱敏文档日期切分、倒序、飞书表格转可读纯文本', () => {
  const reports=parseReports(fixture('reports-real-redacted.md'));
  assert.deepEqual(reports.map(r=>[r.kind,r.date]),[['日报','2026-10-13'],['日报','2026-10-12']]);
  assert.match(reports[0].title,/2026-10-13/);
  assert.match(reports[0].body,/### 一、📋 今日事项/);
  assert.match(reports[0].body,/序号 \| 事项名称 \| 负责方/);
  assert.match(reports[0].body,/1 \| \[内容已脱敏\]/);
  assert.doesNotMatch(reports[0].body,/<table|<td|不是一篇报告/);
});

test('日报、周报、无日期说明和子章节边界；列表层级保持', () => {
  const reports=parseReports(fixture('reports-boundaries.md'));
  assert.equal(reports.length,2);
  assert.deepEqual(reports.map(r=>[r.kind,r.date]),[['日报','2026-10-12'],['周报','2026-10-05']]);
  assert.match(reports[0].body,/\n  - 二级事项/);
  assert.match(reports[0].body,/#### 2026-10-13 只是子章节/);
  assert.doesNotMatch(reports[1].body,/无日期说明|无效日期内容/);
  assert.deepEqual(parseReports('只有正文 2026-10-12，没有日期标题。'),[]);
});

test('相同日期多篇保留；正文编辑和新增日期不改变已有 ID', () => {
  const text='## 2026-10-12\n内容甲\n## 2026-10-12\n内容乙\n## 周报 2026-10-12\n周内容';
  const rows=parseReports(text);assert.equal(new Set(rows.map(r=>r.id)).size,3);
  assert.deepEqual(parseReports('## 2026-10-14\n新内容\n'+text).slice(1).map(r=>r.id),rows.map(r=>r.id));
  assert.deepEqual(parseReports(text.replace('内容甲','更新内容甲')).map(r=>r.id),rows.map(r=>r.id));
});

test('日期校验、空段保留、代码块日期不切篇、实体与危险标签只当文本', () => {
  const rows=parseReports('## 日报 2024年2月29日\nA &amp; B<br/>换行 &lt;img src=x&gt;\n<script>恶意脚本</script>\n```md\n## 2026-10-15\n代码内容\n```\n## 2026/10/12\n');
  assert.deepEqual(rows.map(r=>r.date),['2026-10-12','2024-02-29']);
  assert.equal(rows[0].body,'');assert.match(rows[1].body,/A & B\n换行 <img src=x>/);
  assert.match(rows[1].body,/## 2026-10-15/);assert.doesNotMatch(rows[1].body,/恶意脚本/);
  assert.deepEqual(parseReports('## 2025-02-29\n无效'),[]);
});
