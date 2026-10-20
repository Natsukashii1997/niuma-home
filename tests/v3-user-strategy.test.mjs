import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb } from '../server/db.mjs';
import { getRecord } from '../server/local-records.mjs';
import { applyEdit, checkInsight, checkPromo, createUserStrategyService, loadCards, matchPromo, readInsight, timelineFacts, strategyWindow, units, USER_STRATEGY_KIND } from '../server/user-strategy.mjs';

const instant = Date.parse('2026-10-20T10:00:00+08:00');
const promoFixture = () => JSON.parse(readFileSync(new URL('../fixtures/user-strategy-promo-2026-11.json', import.meta.url), 'utf8'));
const INSIGHT_DIR = new URL('../docs/用户情况/', import.meta.url);
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '用户策略测试必须显式使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'user-strategy-'));
  const db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}
const service = db => createUserStrategyService(db, { now: () => instant });
const confirm = (svc, month, preview) => svc.confirm(month, { previewId: preview.previewId, confirm: true });

test('时间窗与节点：下月前 14 天为预热；行政节点不画条；相隔超过 3 天的同类时段分开', () => {
  assert.deepEqual(strategyWindow('2026-11'), { from: '2026-11-01', to: '2026-11-30', preheatTo: '2026-12-14' });
  assert.deepEqual(strategyWindow('2027-02'), { from: '2027-02-01', to: '2027-02-28', preheatTo: '2027-03-14' });
  // 合成时间线：只为验证契约，不是真实校历
  const f = timelineFacts({ agenda: [
    { c: '美国', school: '合成大学 A', type: '期中假', from: '2026-11-25', to: '2026-11-29' },
    { c: '美国', school: '合成大学 B', type: '期中假', from: '2026-12-12', to: '2027-01-03' },
    { c: '美国', school: '合成大学 A', type: 'Instruction结束', from: '2026-12-04', to: '2026-12-04' },
    { c: '香港', school: '合成大学 C', type: 'Final', from: '2026-12-08', to: '2026-12-23', flag: 'guess' },
    { c: '澳门', school: '合成大学 D', type: 'Final', from: '2026-12-04', to: '2026-12-17' },
  ] }, strategyWindow('2026-11'));
  assert.deepEqual(f.lanes.find(([k]) => k === 'us')[2].map(b => [b[0], b[1], b[3]]), [['2026-11-25', '2026-11-29', '期中假'], ['2026-12-12', '2026-12-14', '期中假']]);
  assert.equal(f.counts.us, 3); assert.equal(f.counts.other, 1);
  assert.deepEqual(f.guesses, ['香港 · 合成大学 C · Final 12-08 → 12-23']);
  assert.equal(f.lanes.find(([k]) => k === 'hk')[2][0][4], true);
});

test('内置用户情况逐月通过校验，且没有写作规范提示', () => {
  const files = readdirSync(INSIGHT_DIR).filter(f => /^20\d{2}-\d{2}\.json$/.test(f));
  assert.ok(files.includes('2026-11.json'));
  for (const f of files) {
    const doc = readInsight(f.slice(0, 7));
    assert.equal(doc.month, f.slice(0, 7));
    assert.deepEqual(checkInsight(doc).issues, { errors: [], warnings: [] }, f);
    assert.ok(doc.overview.lanes?.length === 7 && doc.overview.counts && Array.isArray(doc.appendix.guesses), `${f} 缺少由时间线计算的事实，请运行 scripts/user-insight-facts.mjs`);
  }
});

test('促销样例通过校验；打法、机制编号必须来自打法库与词表', () => {
  const cards = loadCards();
  assert.equal(cards.length, 47);
  assert.deepEqual(checkPromo(promoFixture(), cards).issues, { errors: [], warnings: [] });
  const bad = promoFixture();
  bad.promo.lines.新签[0][1] = ['P9999'];
  bad.promo.logic[0][2] = ['M99'];
  bad.promo.logic[1][0] = 'Z9';
  const { errors } = checkPromo(bad, cards).issues;
  assert.ok(errors.some(e => e.includes('P9999')));
  assert.ok(errors.some(e => e.includes('M99')));
  assert.ok(errors.some(e => e.includes('4.2 第 2 行')));
});

test('字数、禁用词、正文编号、阶段错栏只提示，不拦截；来源前缀自动去掉', () => {
  const raw = promoFixture();
  raw.goal = 'AI 判断：本月为学生打造期末冲刺';
  raw.promo.lines.续费[0][1] = ['P0202'];
  raw.promo.lines.新签[1][2] = '用P0602回应A3';
  const { value, issues: { errors, warnings } } = checkPromo(raw, loadCards());
  assert.deepEqual(errors, []);
  assert.equal(value.goal, '本月为学生打造期末冲刺');
  assert.ok(warnings.some(w => w.includes('禁用词「打造」')));
  assert.ok(warnings.some(w => w.startsWith('正文里写了编号')));
  assert.ok(warnings.some(w => w.includes('P0202 是新签打法')));
  assert.equal(units('Final 12/07'), 5.5);
});

test('用户情况默认可读；没有准备的月份明确提示', t => {
  const db = database(t), svc = service(db);
  const nov = svc.get('2026-11');
  assert.equal(nov.origin, '内置'); assert.equal(nov.strategy, null); assert.equal(nov.regions.length, 7);
  assert.deepEqual(svc.get('2031-01'), { month: '2031-01', status: '未准备' });
  assert.throws(() => svc.previewGenerate({ month: '2031-01' }), e => e.status === 404);
});

test('生成促销策略：用户洞察 × 打法库内部匹配，结果确定；预览不写入；确认后回读一致', t => {
  const db = database(t), svc = service(db), cards = loadCards();
  const pv = svc.previewGenerate({ month: '2026-11' });
  const st = pv.value.strategy, stageOf = Object.fromEntries(cards.map(c => [c.id, c.stage]));
  assert.equal(st.model, '内部匹配');
  assert.deepEqual(st.warnings, [], '匹配结果没有写作规范提示');
  assert.equal(st.promo.lines.新签[0][1][0], 'P0602', '新签主打法对应权重最高的障碍「不信任效果」');
  for (const line of ['新签', '续费']) {
    assert.ok(st.promo.lines[line].length >= 1 && st.promo.lines[line].length <= 4);
    for (const [, ids] of st.promo.lines[line]) assert.ok([line, '通用'].includes(stageOf[ids[0]]), `${ids[0]} 放错栏`);
  }
  assert.ok(!st.promo.logic.some(([code, line]) => line === '续费' && ['A3', 'C1'].includes(code)), '续费栏不处理不信任效果、没被触达');
  const barriers = new Set(readInsight('2026-11').regions.flatMap(r => r.barrier.map(([c]) => c)));
  assert.ok(st.promo.logic.every(([code]) => barriers.has(code)), '4.2 的障碍都来自用户洞察');
  assert.ok(!JSON.stringify(st).includes('申诉'), '只做大学辅导');
  assert.deepEqual(svc.previewGenerate({ month: '2026-11' }).value.strategy.promo, st.promo, '同一份用户洞察结果相同');
  assert.equal(getRecord(db, USER_STRATEGY_KIND, '2026-11'), null, '预览不写入');
  assert.deepEqual(pv.value.regions, readInsight('2026-11').regions, '用户情况原样保留');
  const saved = confirm(svc, '2026-11', pv);
  assert.deepEqual(svc.get('2026-11'), { ...saved, origin: '已修改' });
  assert.deepEqual(confirm(svc, '2026-11', pv), saved, '重复确认返回同一回执，不重复写');
});

test('匹配规则：同分障碍按词表顺序；被覆盖的首选卡写进「不选」', () => {
  const cards = loadCards(), doc = structuredClone(readInsight('2026-11'));
  for (const r of doc.regions) r.barrier = [];
  doc.regions.find(r => r.key === 'uk').barrier = [['A3', '首次购买，担心效果', 'AI 判断'], ['B1', '等折扣再买', 'AI 判断']];
  doc.regions.find(r => r.key === 'us').barrier = [['A2', '觉得还来得及', 'AI 判断']];
  const p = matchPromo(doc, cards);
  assert.deepEqual(p.promo.lines.新签.map(([, ids]) => ids[0]), ['P0201', 'P0602', 'P0302'], '三者同为 3 分，按词表 A2 → A3 → B1');
  assert.deepEqual(p.promo.lines.续费.map(([, ids]) => ids[0]), ['P0201', 'P0901'], '续费栏跳过不信任效果');
  assert.match(p.goal, /新签以早鸟价/);
});

test('定稿后重新生成须明确覆盖；预览后记录变了不能确认', async t => {
  const db = database(t), svc = service(db);
  assert.throws(() => svc.previewFinalize('2026-11'), e => e.status === 409 && /还没有生成/.test(e.message));
  confirm(svc, '2026-11', svc.previewGenerate({ month: '2026-11' }));
  const stale = svc.previewGenerate({ month: '2026-11' });
  confirm(svc, '2026-11', svc.previewFinalize('2026-11'));
  assert.equal(svc.get('2026-11').strategy.status, '定稿');
  assert.throws(() => confirm(svc, '2026-11', stale), e => e.status === 409);
  assert.throws(() => svc.previewGenerate({ month: '2026-11' }), e => e.status === 409 && /覆盖/.test(e.message));
  const pv = svc.previewGenerate({ month: '2026-11', confirmOverwrite: true });
  assert.equal(pv.overwrite, '定稿');
  assert.equal(confirm(svc, '2026-11', pv).strategy.status, '草稿');
});

test('逐格修改：第一次修改把内置内容复制到本地；原样保留的行沿用来源，改过的行标「你写的」', async t => {
  const db = database(t), svc = service(db);
  const cur = svc.get('2026-11'), uk = cur.regions[0];
  const next = applyEdit(cur, 'regions.uk.task', [uk.task[0][0], '新写的一条']);
  assert.deepEqual(next.regions[0].task, [[uk.task[0][0], uk.task[0][1]], ['新写的一条', '你写的']]);
  const temp = applyEdit(cur, 'regions.uk.temp', ['热', uk.tempNote[0][0]]);
  assert.deepEqual(temp.regions[0].temp, ['热', '热']);
  assert.equal(temp.regions[0].tempNote[0][1], uk.tempNote[0][1]);
  const bar = applyEdit(cur, 'regions.uk.barrier', [`${uk.barrier[0][0]} ${uk.barrier[0][1]}`, '需要家长同意：家长要先同意']);
  assert.deepEqual(bar.regions[0].barrier[1], ['B4', '家长要先同意', '你写的']);
  assert.equal(bar.regions[0].barrier[0][2], uk.barrier[0][2], '按编号写的原条沿用来源');
  const tiers = applyEdit(cur, 'overview.tiers', cur.overview.tiers.map(([k, t, w]) => `${cur.regions.find(r => r.key === k).name} | ${k === 'hk' ? '主战场' : t} | ${w}`));
  assert.equal(tiers.overview.tiers.find(([k]) => k === 'hk')[1], '主战场');
  assert.equal(tiers.regions.find(r => r.key === 'hk').tier, '主战场', '分档同步到地区列头');
  const opp = applyEdit(cur, 'opportunities', ['P0 | 期末冲刺 | 美国 | 大学辅导 | 新签 | 11/16–12/12 | 依据']);
  assert.deepEqual(opp.opportunities, [['P0', '期末冲刺', '美国', '大学辅导', '新签', '11/16–12/12', '依据']]);
  assert.throws(() => applyEdit(cur, 'opportunities', ['期末冲刺 | 美国']), e => e.status === 400);
  assert.throws(() => applyEdit(cur, 'regions.uk.barrier', ['觉得还来得及']), e => e.status === 400);
  assert.throws(() => applyEdit(cur, 'regions.uk.barrier', ['不存在的障碍：描述']), e => e.status === 400);
  assert.throws(() => applyEdit(cur, 'promo.floor', ['x']), e => e.status === 400);
  assert.throws(() => applyEdit(cur, 'strategy.goal', ['x']), e => e.status === 409);

  const pv = svc.previewEdit('2026-11', { path: 'summary.judgement', lines: ['本月只做期末冲刺'] });
  assert.equal(getRecord(db, USER_STRATEGY_KIND, '2026-11'), null, '预览不写入');
  const saved = confirm(svc, '2026-11', pv);
  assert.equal(saved.summary.judgement, '本月只做期末冲刺');
  assert.equal(svc.get('2026-11').origin, '已修改');
  assert.deepEqual(saved.regions, readInsight('2026-11').regions, '其余内容来自内置');
});

