// 月度用户策略批 1·1a：时间线 → Evidence → 生命周期窗口 → 覆盖率（docs/策略规则/03、05；反例见 09）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTimeline, mergeTimelines, REGION_SHEETS, TIMELINE_SOURCE } from '../server/timeline.mjs';
import { anomalyKey, applyRulings } from '../server/timeline-rulings.mjs';
import { applyOfficialVerifications, verificationSourceId } from '../server/timeline-verification.mjs';
import { buildEvidence, normalizeCountry } from '../server/strategy-evidence.mjs';
import { lifecycleWindows, regionCoverage } from '../server/strategy-lifecycle.mjs';

const COLS = 'ABCDEFGHIJKLMNOP'.split('');
// rows：第一行是「地区名 + 列名」，之后每行「学校 + 各列原文」；startRow 用来模拟插行。
const sheet = (name, rows, startRow = 1) => ({ name, cols: COLS, rows: rows.map((values, i) => ({ row: startRow + i, values })) });
const UK = REGION_SHEETS[1], ASIA = REGION_SHEETS[3];
const parse = sheets => parseTimeline(sheets, 'now');
const evidenceOf = (timeline, opts) => buildEvidence(applyRulings(applyOfficialVerifications(timeline, opts?.records ?? []), opts?.rulings ?? []), opts);
const find = (list, school, header) => list.filter(e => e.school.startsWith(school) && (!header || e.header === header));
const review = (a, segments) => ({ school: a.school, country: a.c || '', src: a.src, sourceId: verificationSourceId(TIMELINE_SOURCE), key: anomalyKey(a), status: 'confirmed',
  checkedAt: '2026-10-21', reason: '官网校历', sources: [{ url: 'https://example.ac.uk/calendar', title: 'Calendar' }], segments });

test('Evidence 归一化：国家小写、年份拆出、eventType 不在 9 类记「其他」，身份不含单元格地址', () => {
  const t = parse([sheet(UK, [['英国', 'Final 时间', '教学日结束'], ['伦敦大学学院 UCL', '12.7', '12.12']])]);
  const { evidence } = evidenceOf(t);
  const [final, other] = [find(evidence, '伦敦大学学院', 'Final 时间')[0], find(evidence, '伦敦大学学院', '教学日结束')[0]];
  assert.equal(final.country, 'uk'); assert.equal(final.year, 2026); assert.equal(final.kind, 'timeline'); assert.equal(final.sourceId, 'SRC-timeline');
  assert.equal(final.eventType, 'Final'); assert.equal(final.anchorType, 'start'); assert.equal(final.verification, 'source');
  assert.deepEqual(final.dates, { from: '2026-12-07', to: '2026-12-07', precision: 'day' });
  assert.equal(final.school, '伦敦大学学院 UCL'); assert.equal(final.source.ref, `${UK}!B2`); assert.equal(final.source.raw, '12.7');
  assert.match(final.evidenceId, /^EV-[0-9a-f]{16}$/); assert.equal(final.ambiguous, false);
  assert.equal(other.eventType, '其他'); assert.equal(other.header, '教学日结束');
  assert.deepEqual(normalizeCountry('UK@2027', 2026), { country: 'uk', year: 2027, region: 'uk' });
});

test('反例 9：飞书表插入一行、单元格地址平移，原有学校的 evidenceId 不变', () => {
  const rows = [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.7']];
  const before = evidenceOf(parse([sheet(UK, rows)])).evidence;
  const after = evidenceOf(parse([sheet(UK, [rows[0], ['新学校 NEW', '12.1'], rows[1]])])).evidence;
  assert.notEqual(find(after, '伦敦大学学院')[0].source.ref, find(before, '伦敦大学学院')[0].source.ref);
  assert.equal(find(after, '伦敦大学学院')[0].evidenceId, find(before, '伦敦大学学院')[0].evidenceId);
  assert.equal(find(after, '伦敦大学学院')[0].evidenceVersion, find(before, '伦敦大学学院')[0].evidenceVersion);
});

test('反例 8a：原格措辞改动、有效日期未变、没有关联核验，ID 与版本都不变', () => {
  const a = evidenceOf(parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.7']])])).evidence[0];
  const b = evidenceOf(parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12月7日']])])).evidence[0];
  assert.equal(b.source.raw, '12月7日');
  assert.equal(b.evidenceId, a.evidenceId); assert.equal(b.evidenceVersion, a.evidenceVersion);
});

test('反例 7、8b：核验改变核验状态而不新增证据；核验日期变化或原格改写使版本变化，ID 不变', () => {
  const raw = parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.7（预计）']])]);
  const plain = evidenceOf(raw).evidence;
  assert.equal(plain.length, 1); assert.equal(plain[0].verification, 'guess');
  const r = review(raw.anomalies[0], [{ from: '2026-12-07', to: '2026-12-07' }]);
  const verified = evidenceOf(raw, { records: [r] }).evidence;
  assert.equal(verified.length, 1, '一个事件一条 Evidence');
  assert.equal(verified[0].verification, 'verified'); assert.equal(verified[0].sourceId, 'SRC-official');
  assert.equal(verified[0].evidenceId, plain[0].evidenceId); assert.notEqual(verified[0].evidenceVersion, plain[0].evidenceVersion);
  // 反例 7：官网核实日期变化，原格未变
  const moved = evidenceOf(raw, { records: [{ ...r, segments: [{ from: '2026-12-08', to: '2026-12-08' }] }] }).evidence[0];
  assert.equal(moved.evidenceId, verified[0].evidenceId); assert.notEqual(moved.evidenceVersion, verified[0].evidenceVersion);
  // 反例 8b：已核实的原格措辞改动，核验按指纹失效，退回推测
  const rewritten = parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12月7日（预计）']])]);
  const stale = evidenceOf(rewritten, { records: [r] }).evidence[0];
  assert.equal(stale.verification, 'guess'); assert.equal(stale.sourceId, 'SRC-timeline');
  assert.equal(stale.evidenceId, verified[0].evidenceId); assert.notEqual(stale.evidenceVersion, verified[0].evidenceVersion);
});

test('人工裁定只改变核验状态与有效日期，生效来源为 SRC-ruling', () => {
  const raw = parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.7（预计）']])]);
  const key = anomalyKey(raw.anomalies[0]);
  const ev = evidenceOf(raw, { rulings: [{ key, decision: 'manual', cell: 0, from: '2026-12-09', to: '2026-12-09' }] }).evidence;
  assert.equal(ev.length, 1); assert.equal(ev[0].verification, 'ruled'); assert.equal(ev[0].sourceId, 'SRC-ruling'); assert.equal(ev[0].dates.from, '2026-12-09');
  const excluded = evidenceOf(raw, { rulings: [{ key, decision: 'exclude', cell: 0, from: '2026-12-09', to: '2026-12-09' }] }).evidence;
  assert.equal(excluded.length, 0);
});

test('反例 10：同一格多段被拆分，对不上的新片段 ambiguous 且是新 ID；能对上的标签保留原 ID', () => {
  const v1 = evidenceOf(parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', 'T1：11.30-12.10；T2：4.1']])]));
  const v2 = evidenceOf(parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', 'T1：11.30-12.10；T2：4.1；T3：5.1']])]), { previous: v1.segmentIndex });
  const ids1 = new Set(v1.evidence.map(e => e.evidenceId));
  assert.equal(v2.evidence.length, 3);
  const t3 = v2.evidence.find(e => e.dates.from.endsWith('05-01'));
  assert.equal(t3.ambiguous, true); assert.equal(ids1.has(t3.evidenceId), false);
  for (const e of v2.evidence.filter(x => x !== t3)) { assert.equal(e.ambiguous, false); assert.equal(ids1.has(e.evidenceId), true); }
  // 没有标签时按「序号/总数」定位：段数变化，全部是新 ID 且 ambiguous
  const u1 = evidenceOf(parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '11.30；12.10']])]));
  const u2 = evidenceOf(parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '11.30；12.10；1.5']])]), { previous: u1.segmentIndex });
  assert.ok(u2.evidence.every(e => e.ambiguous && !u1.evidence.some(o => o.evidenceId === e.evidenceId)));
  assert.ok(lifecycleWindows(u2.evidence).every(w => w.skipped), 'ambiguous 不计算精确窗口');
});

test('反例 25：同一地区表同名学校，落库前隔离，不生成 Evidence，列入身份冲突清单', () => {
  const t = parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.7'], ['伦敦大学学院 UCL', '12.9'], ['爱丁堡大学 UoE', '12.3']])]);
  const { evidence, anomalies } = evidenceOf(t);
  assert.equal(find(evidence, '伦敦大学学院').length, 0); assert.equal(find(evidence, '爱丁堡大学').length, 1);
  const conflict = anomalies.find(a => a.type === 'identityConflict');
  assert.equal(conflict.school, '伦敦大学学院 UCL'); assert.deepEqual(conflict.sources.map(s => s.ref), [`${UK}!B2`, `${UK}!B3`]);
  assert.equal(new Set(evidence.map(e => e.evidenceId)).size, evidence.length, '正式集合里没有重复 ID');
  const cov = regionCoverage(t, evidence, lifecycleWindows(evidence), '2026-12').uk;
  assert.deepEqual([cov.coverage.schools, cov.coverage.calculable, cov.coverage.insufficient], [2, 1, 1], '被隔离的学校算数据不足');
});

test('反例 1、11、12、13：只有月份、冲突未决、选课锚点不明都不出精确窗口；只有 Final 不推导出分', () => {
  const t = parse([sheet(UK, [['英国', 'Semester 1学期开学', 'Final 时间', '学期选课', 'Essay 截止'], ['伦敦大学学院 UCL', '9.20', '9.1', '1.10', '12月中旬']])]);
  const { evidence } = evidenceOf(t);
  const month = find(evidence, '伦敦', 'Essay 截止')[0];
  assert.equal(month.dates.precision, 'month'); assert.deepEqual(month.dates.months, ['2026-12']); assert.equal(month.dates.from, null); assert.equal(month.verification, 'guess');
  const conflict = find(evidence, '伦敦', 'Final 时间')[0];
  assert.equal(conflict.verification, 'conflict');
  const course = find(evidence, '伦敦', '学期选课')[0];
  assert.equal(course.anchorType, 'anchor_unknown');
  const windows = new Map(lifecycleWindows(evidence).map(w => [w.evidenceId, w]));
  for (const e of [month, conflict, course]) assert.ok(windows.get(e.evidenceId).skipped, e.header);
  assert.ok(!evidence.some(e => e.eventType === '出分'));
});

test('反例 26 与锚点：选课期起止已核实仍为 inferred、不生成需求窗口；截止列是 deadline', () => {
  const raw = parse([sheet(UK, [['英国', '选课时间', '选课截止'], ['伦敦大学学院 UCL', '11.1-11.15（预计）', '11.20']])]);
  const r = review(raw.anomalies.find(a => a.src === `${UK}!B2`), [{ from: '2026-11-01', to: '2026-11-15' }]);
  const { evidence } = evidenceOf(raw, { records: [r] });
  const period = find(evidence, '伦敦', '选课时间')[0], deadline = find(evidence, '伦敦', '选课截止')[0];
  assert.equal(period.anchorType, 'period'); assert.equal(period.verification, 'verified');
  assert.equal(deadline.anchorType, 'deadline');
  const w = new Map(lifecycleWindows(evidence).map(x => [x.evidenceId, x]));
  assert.deepEqual(w.get(period.evidenceId), { evidenceId: period.evidenceId, category: '选课', next: '课程确认、开学准备', ruleVersion: 'lifecycle-v0.2/选课', limitations: [], need: null, action: { from: '2026-11-01', to: '2026-11-15' }, status: 'inferred' });
  assert.deepEqual(w.get(deadline.evidenceId).action, { from: '2026-10-30', to: '2026-11-18' });
  assert.equal(w.get(deadline.evidenceId).status, 'inferred', '原表日期只算 inferred');
});

test('默认窗口天数与补考替代锚点（lifecycle-v0.2 第 4 节）', () => {
  const t = parse([sheet(UK, [['英国', 'Final 时间', '出分时间', 'final补考'], ['伦敦大学学院 UCL', '12.7', '2027.1.20', '2027.2.5']])]);
  const { evidence } = evidenceOf(t);
  const w = new Map(lifecycleWindows(evidence).map(x => [x.evidenceId, x]));
  const final = w.get(find(evidence, '伦敦', 'Final 时间')[0].evidenceId);
  assert.deepEqual([final.need, final.action, final.status, final.ruleVersion], [{ from: '2026-10-26', to: '2026-12-06' }, { from: '2026-11-09', to: '2026-12-02' }, 'inferred', 'lifecycle-v0.2/Final']);
  const resit = w.get(find(evidence, '伦敦', 'final补考')[0].evidenceId);
  assert.deepEqual([resit.need, resit.action], [{ from: '2027-01-20', to: '2027-02-04' }, { from: '2027-01-20', to: '2027-02-02' }]);
  assert.match(resit.limitations.join(), /以出分日作为替代锚点/);
});

test('反例 21：日期全是原表时覆盖率照算、status 为 inferred；区分窗口未覆盖与数据不足；无有效学校为 unknown', () => {
  const t = parse([sheet(UK, [['英国', 'Final 时间', 'Semester 1学期开学', 'Essay 截止'], ['伦敦大学学院 UCL', '12.7', '', ''], ['爱丁堡大学 UoE', '', '2027.9.20', ''], ['曼彻斯特大学 UoM', '', '', '12月中旬']])]);
  const { evidence } = evidenceOf(t);
  const cov = regionCoverage(t, evidence, lifecycleWindows(evidence), '2026-12');
  assert.equal(cov.uk.status, 'inferred'); assert.equal(cov.uk.ratio, 0.5); assert.equal(cov.uk.value, '高');
  assert.deepEqual(cov.uk.coverage, { schools: 3, calculable: 2, active: 1, notCovered: 1, insufficient: 1 });
  assert.deepEqual(cov.uk.dateQuality, { verified: 0, ruled: 0, source: 2, guess: 0 });
  assert.deepEqual(cov.uk.range, { from: '2026-12-01', to: '2027-01-14' });
  assert.deepEqual([cov.hk.value, cov.hk.status, cov.hk.ratio], ['unknown', 'unknown', null]);
  assert.equal(cov.uk.byCountry, null);
});

test('反例 3：新加坡、马来西亚保留各自国家代码，归入其他地区并给出各国贡献；后加年份按年份归一化', () => {
  const base = parse([sheet(ASIA, [['新加坡', 'Final 时间'], ['新加坡国立大学 NUS', '2027.1.1'], ['马来西亚', 'Final 时间'], ['马来亚大学 UM', '2027.3.1']])]);
  const later = parseTimeline([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.7']])], 'now', 2027, { tag: '2027', title: '2027海外大学时间线' });
  const t = mergeTimelines([{ source: { year: 2026, title: 'a', tag: '' }, value: base }, { source: { year: 2027, title: 'b', tag: '2027' }, value: later }]);
  const { evidence } = evidenceOf(t);
  assert.deepEqual([...new Set(evidence.map(e => e.country))].sort(), ['my', 'sg', 'uk']);
  assert.ok(!evidence.some(e => e.country === 'other'));
  assert.equal(find(evidence, '伦敦')[0].year, 2027);
  const cov = regionCoverage(t, evidence, lifecycleWindows(evidence), '2026-12');
  assert.deepEqual(Object.keys(cov.other.byCountry).sort(), ['my', 'sg']);
  assert.deepEqual([cov.other.byCountry.sg.coverage.active, cov.other.byCountry.my.coverage.active], [1, 0]);
  assert.deepEqual([cov.other.coverage.schools, cov.other.coverage.calculable, cov.other.coverage.active], [2, 2, 1]);
});

test('反例 25 补充：同名学校分段结构不同、填的列不同，也整校隔离', () => {
  const t = parse([sheet(UK, [['英国', 'Final 时间', '出分时间'], ['伦敦大学学院 UCL', 'T1：11.30；T2：4.1', ''], ['伦敦大学学院 UCL', '12.9', '1.20']])]);
  const { evidence, anomalies } = evidenceOf(t);
  assert.equal(evidence.length, 0);
  assert.deepEqual(anomalies.find(a => a.type === 'identityConflict').sources.map(s => s.ref).sort(), [`${UK}!B2`, `${UK}!B3`, `${UK}!C3`]);
  const cov = regionCoverage(t, evidence, lifecycleWindows(evidence), '2026-12').uk;
  assert.deepEqual([cov.coverage.schools, cov.coverage.calculable, cov.coverage.insufficient, cov.value], [1, 0, 1, 'unknown']);
});

test('片段身份按原格位置：核验改动日期不让 ID 漂移；一格只有一段时就是这一格', () => {
  const raw = parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '11.30；12.10（预计）']])]);
  const before = evidenceOf(raw).evidence;
  const r = review(raw.anomalies[0], [{ from: '2026-12-20', to: '2026-12-20' }, { from: '2026-12-01', to: '2026-12-01' }]);
  const after = evidenceOf(raw, { records: [r] }).evidence;
  const first = before.find(e => e.dates.from === '2026-11-30');
  assert.deepEqual(after.map(e => e.evidenceId).sort(), before.map(e => e.evidenceId).sort());
  assert.equal(after.find(e => e.evidenceId === first.evidenceId).dates.from, '2026-12-20', '原第 1 段仍是第 1 段');
  const labelled = evidenceOf(parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', 'T1：11.30']])])).evidence[0];
  const plain = evidenceOf(parse([sheet(UK, [['英国', 'Final 时间'], ['伦敦大学学院 UCL', '11.30']])])).evidence[0];
  assert.equal(labelled.evidenceId, plain.evidenceId);
});

test('锚点：选课列名不表示选课期时区间不算 period；其他类判断不出含义记 anchor_unknown', () => {
  const t = parse([sheet(UK, [['英国', 'Spring选课开始', '教学日结束', 'Withdraw 截止'], ['伦敦大学学院 UCL', '1.5-1.9', '12.12', '10.20']])]);
  const { evidence } = evidenceOf(t);
  assert.equal(find(evidence, '伦敦', 'Spring选课开始')[0].anchorType, 'start');
  assert.equal(find(evidence, '伦敦', '教学日结束')[0].anchorType, 'anchor_unknown');
  assert.equal(find(evidence, '伦敦', 'Withdraw 截止')[0].anchorType, 'deadline');
});
