// 月度用户策略批 1·1c：旧版用户情况迁移到 v2（docs/策略规则/04-迁移映射.md migration-v1.2；反例 16 见 09）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSettings, openDb } from '../server/db.mjs';
import { parseTimeline, REGION_SHEETS, timelineIdentity } from '../server/timeline.mjs';
import { saveSnapshot } from '../server/v3-common.mjs';
import { createStrategyService } from '../server/strategy-service.mjs';
import { readInsight, USER_STRATEGY_KIND } from '../server/user-strategy.mjs';
import { putRecord } from '../server/local-records.mjs';
import { validateStrategyDoc } from '../server/strategy-validate.mjs';
import { BARRIER_MAP, migrateMonth, migrationChecks, OTHER_REASON } from '../server/strategy-migrate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COLS = 'ABCDEFGH'.split('');
const sheet = rows => ({ name: REGION_SHEETS[1], cols: COLS, rows: rows.map((values, i) => ({ row: i + 1, values })) });
const TIMELINE = { ...parseTimeline([sheet([['英国', 'Final 时间'], ['伦敦大学学院 UCL', '12.7'], ['爱丁堡大学 UoE', '2027.9.20']])], '2026-11-08 10:00'), years: [{ year: 2026 }] };
const MONTHS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
const BUILTIN = { kind: '内置', ref: 'test', updatedAt: null };

function setup() {
  const db = openDb(mkdtempSync(path.join(tmpdir(), 'migrate-')));
  let clock = Date.parse('2026-11-08T02:00:00Z');
  return { db, strategy: createStrategyService(db, { readTimeline: async () => TIMELINE, now: () => (clock += 1000) }) };
}
// 本地改过的 11 月：常浩写了几条（「你写的」），并生成过促销。
function localNovember() {
  const v1 = structuredClone(readInsight('2026-11'));
  v1.overview.common.push(['常浩补的一条共性判断，原样保留', '你写的']);
  const uk = v1.regions.find(r => r.key === 'uk');
  uk.task.push(['UK 1 月 Final 前要先交 essay（常浩写）', '你写的']);
  uk.barrier.push(['B1', '常浩：英国学生这个月嫌贵', '你写的']);
  uk.barrier.push(['A2', '常浩：觉得还来得及', '你写的']);
  v1.strategy = { status: '草稿', goal: '旧促销目标', model: '内部匹配' };
  v1.updatedAt = '2026-10-20T09:22:32.822Z';
  return v1;
}
async function migrated(strategy, month, v1 = readInsight(month), source = BUILTIN) {
  const f = await strategy.facts(month);
  const doc = migrateMonth(v1, { month, coverage: f.coverage, source });
  const validation = validateStrategyDoc(doc, { evidence: f.evidence, migrated: true });
  return { v1, doc, validation, checks: migrationChecks(v1, doc, validation) };
}
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');

test('反例 16：12 个内置月份与本地改过的 11 月迁移后——无 known，AI 判断与你写的为 inferred + weak，manual 逐字一致，other 优先级为空，条目守恒，校验器 0 错误', async () => {
  const { strategy } = setup();
  for (const month of MONTHS) {
    const local = month === '2026-11';
    const { v1, doc, validation, checks } = await migrated(strategy, month, local ? localNovember() : readInsight(month), local ? { kind: '已修改', ref: 'v3_documents', updatedAt: '2026-10-20' } : BUILTIN);
    assert.deepEqual(validation.errors, [], `${month} 校验器 0 错误`);
    assert.ok(checks.ok, `${month} 自动检查：${checks.checks.filter(c => !c.ok).map(c => `${c.name} ${c.detail}`).join('；')}`);
    assert.equal(checks.total.before, checks.total.after, `${month} 条目守恒`);

    // 不信任检查函数，直接断言反例 16 的每一条。
    assert.ok(!JSON.stringify({ b: doc.brief, s: doc.scenarios, c: doc.claims }).includes('"known"'), `${month} 没有 known`);
    const items = [...['common', 'diff', 'external'].flatMap(k => doc.brief[k]), ...doc.claims];
    for (const [src, origin] of [['AI 判断', 'migrated'], ['你写的', 'manual']]) {
      const old = ['common', 'diff', 'external'].flatMap(k => v1.overview[k]).concat(v1.regions.flatMap(r => [...r.task, ...r.pain, ...r.barrier.map(([code, t, s]) => [t, s, code])])).filter(x => x[1] === src);
      for (const [text, , code] of old) {
        const hit = items.find(c => c.text === text);
        assert.ok(hit, `${month}「${text}」逐字保留`);
        assert.equal(hit.origin, origin);
        if (BARRIER_MAP[code] === 'BR-M2') assert.equal(hit.status, 'unknown', '旧 A2 按 02 §2.3 降为 unknown');
        else assert.deepEqual([hit.status, hit.evidenceStrength], ['inferred', 'weak'], `${month}「${text}」`);
      }
    }
    const other = doc.regions.find(r => r.key === 'other');
    assert.equal(other.priority.value, null);
    assert.equal(other.priority.reason, OTHER_REASON);
    const tier = k => v1.overview.tiers.find(t => t[0] === k);
    assert.deepEqual(doc.legacy.regions.other.tiers, { sg: { value: tier('sg')[1], reason: tier('sg')[2] }, other: { value: tier('other')[1], reason: tier('other')[2] } });
    assert.deepEqual(doc.scenarios.filter(s => s.region === 'other').map(s => [s.id, s.countries]), [[`SCN-${month}-other-01`, ['sg']], [`SCN-${month}-other-02`, ['nz', 'mo', 'ie', 'my']]]);
    assert.ok(doc.claims.every(c => !c.evidenceRefs.length && !Object.keys(c.refVersions).length), 'refVersions 为空');
    assert.equal(doc.legacy.opportunities.length, v1.opportunities.length);
    doc.legacy.opportunities.forEach((o, i) => {
      const [priority, name, regions, line, relation, window, rationale] = v1.opportunities[i];
      assert.deepEqual(o, { id: `OPP-${month}-${i + 1}`, priority, name, regions, line, targetRelation: relation === '新签 / 续费' ? '通用' : relation, window, rationale, claims: [], toulmin: null }, '机会收敛照搬字段，新签 / 续费 → 通用');
    });
    if (local) {
      assert.equal(doc.claims.filter(c => c.origin === 'manual').length, 3);
      assert.equal(doc.brief.common.at(-1).origin, 'manual');
      assert.deepEqual(doc.legacy.promo, v1.strategy, '旧促销整段进 legacy');
    }
    const w = await strategy.writeMigration(month, doc);
    assert.equal(w.skipped, false);
    const { inputs, ...saved } = strategy.get(month).revision.content;
    assert.deepEqual(saved, doc, `${month} 写入后回读一致`);
    assert.equal(inputs.migration, 'migration-v1.2');
    assert.equal(strategy.get(month).revision.confirmedFrom, 'migration');
    assert.equal(strategy.revisions(month)[0].confirmed_by, 'migration-script', '迁移版本不冒用常浩的名字');
  }
});

test('迁移检查能抓到违规：出现 known、manual 被改、条目丢失、other 取了旧档', async () => {
  const { strategy } = setup();
  const { v1, doc } = await migrated(strategy, '2026-11', localNovember());
  const f = await strategy.facts('2026-11');
  const failed = mutate => {
    const d = structuredClone(doc); mutate(d);
    return migrationChecks(v1, d, validateStrategyDoc(d, { evidence: f.evidence, migrated: true })).checks.filter(c => !c.ok).map(c => c.name);
  };
  assert.ok(failed(d => Object.assign(d.claims[0], { status: 'known', evidenceStrength: 'strong' })).includes('没有 known'));
  assert.ok(failed(d => { d.claims.find(c => c.origin === 'manual').text += '。'; }).includes('「你写的」origin=manual 且正文逐字一致'));
  assert.ok(failed(d => { d.claims.find(c => c.origin === 'migrated' && c.claimType === 'task').origin = 'manual'; }).includes('没有凭空出现的 manual'));
  assert.ok(failed(d => { d.legacy.regions.uk.node.pop(); }).some(n => n.startsWith('条目数守恒')));
  assert.ok(failed(d => { d.regions.find(r => r.key === 'other').priority.value = '次要'; }).includes('新 other 的 priority 为 null，旧 sg、旧 other 两档在 legacy'));
  assert.ok(failed(d => { d.claims.find(c => c.claimType === 'pain').evidenceStrength = 'partial'; }).includes('「AI 判断」「你写的」为 inferred + weak（BR-M2/M5 为 unknown）'));
});

test('迁移写入：重复执行同一内容跳过；已有别的版本不覆盖；非迁移文档不收', async () => {
  const { strategy } = setup();
  const { doc } = await migrated(strategy, '2026-12');
  await assert.rejects(strategy.writeMigration('2026-12', { ...doc, migrated: false }), e => e.status === 400);
  await assert.rejects(strategy.writeMigration('2026-12', { ...doc, claims: [{ ...doc.claims[0], status: 'known' }, ...doc.claims.slice(1)] }), e => e.status === 422);
  assert.equal((await strategy.writeMigration('2026-12', doc)).skipped, false);
  assert.equal((await strategy.writeMigration('2026-12', doc)).skipped, true);
  await assert.rejects(strategy.writeMigration('2026-12', { ...doc, research: { ...doc.research, notes: ['改过'] } }), e => e.status === 409 && e.code === 'MIGRATION_EXISTS');
  assert.equal(strategy.revisions('2026-12').length, 1);
});

test('迁移回退：只删迁移版本、删除触发器恢复；迁移之后已有新版本的月份整体拒绝', async () => {
  const { db, strategy } = setup();
  for (const m of ['2026-10', '2026-12']) await strategy.writeMigration(m, (await migrated(strategy, m)).doc);
  // 12 月在迁移之后又回退出一个新版本（confirmed_from=rollback:…）：不能只删迁移版本。
  const first = strategy.revisions('2026-12')[0].id;
  db.prepare("INSERT INTO strategy_revisions (id,month,schema_version,content,content_hash,inputs,created_at,confirmed_from) SELECT 'REV-2026-12-2',month,schema_version,content,content_hash,inputs,'2026-11-09','page' FROM strategy_revisions WHERE id=?").run(first);
  assert.throws(() => strategy.rollbackMigration(['2026-10', '2026-12']), e => e.status === 409 && e.code === 'MIGRATION_SUPERSEDED');
  assert.equal(strategy.revisions('2026-10').length, 1, '拒绝时一条都不删');
  assert.deepEqual(strategy.rollbackMigration(['2026-10']).removed, ['REV-2026-10-1']);
  assert.equal(strategy.get('2026-10').revision, null);
  assert.throws(() => db.prepare('DELETE FROM strategy_revisions WHERE id=?').run(first), /不可删除/, '删除触发器已恢复');
});

test('迁移脚本：plan 只读源库、备份并出报告；apply 须 --confirm 且内容与报告一致；rollback 实测可回退', () => {
  const src = mkdtempSync(path.join(tmpdir(), 'migrate-src-')), out = path.join(mkdtempSync(path.join(tmpdir(), 'migrate-ev-')), 'run');
  const db = openDb(src);
  saveSnapshot(db, 'timeline', { identity: timelineIdentity(getSettings(db)), value: TIMELINE }, '2026-11-08T02:00:00Z');
  putRecord(db, USER_STRATEGY_KIND, '2026-11', localNovember());
  db.close();
  const srcSha = sha(path.join(src, 'work-desk.db'));
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/migrate-strategy-v2.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, WORKDESK_DATA_DIR: '/nonexistent-should-not-be-used' } });

  const plan = run('plan', '--data', src, '--out', out);
  assert.equal(plan.status, 0, plan.stderr + plan.stdout);
  assert.equal(sha(path.join(src, 'work-desk.db')), srcSha, '源库未被改动');
  assert.equal(readdirSync(path.join(out, 'backup/用户情况')).length, 12);
  for (const f of ['backup/work-desk.db', 'backup/v1-records.json', 'SUMMARY.md', 'summary.json', 'reports/2026-11.md', 'migrated/2026-11.json']) assert.ok(existsSync(path.join(out, f)), f);
  const summary = JSON.parse(readFileSync(path.join(out, 'summary.json'), 'utf8'));
  assert.equal(summary.ok, true); assert.equal(Object.keys(summary.months).length, 12);
  assert.equal(summary.months['2026-11'].source.kind, '已修改');
  assert.match(readFileSync(path.join(out, 'reports/2026-11.md'), 'utf8'), /条目数前后对比[\s\S]*合计[\s\S]*旧促销：有/);
  assert.equal(run('plan', '--data', src, '--out', out).status, 1, '证据目录非空时拒绝覆盖');

  assert.equal(run('apply', '--data', src, '--report', out).status, 1, '没有 --confirm 不写');
  assert.equal(sha(path.join(src, 'work-desk.db')), srcSha);
  const apply = run('apply', '--data', src, '--report', out, '--confirm');
  assert.equal(apply.status, 0, apply.stderr + apply.stdout);
  const count = () => Number(execFileSync('sqlite3', [path.join(src, 'work-desk.db'), "SELECT COUNT(*) FROM strategy_revisions WHERE confirmed_from='migration'"], { encoding: 'utf8' }).trim());
  assert.equal(count(), 12);

  const preview = run('rollback', '--data', src);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(preview.stdout, /预览（未改动）：将删除迁移版本 12 个/);
  assert.equal(count(), 12, '回退预览不改数据');
  const rollback = run('rollback', '--data', src, '--out', out, '--confirm');
  assert.equal(rollback.status, 0, rollback.stderr + rollback.stdout);
  assert.equal(count(), 0);
  assert.ok(readdirSync(out).some(f => f.startsWith('work-desk-before-rollback-')), '回退前先备份');
  const v1 = execFileSync('sqlite3', [path.join(src, 'work-desk.db'), "SELECT COUNT(*) FROM v3_documents WHERE kind='user-strategy'"], { encoding: 'utf8' }).trim();
  assert.equal(v1, '1', '旧版记录未动');
});

test('切换前旧记录被改过：apply 拒绝，一条都不写', () => {
  const src = mkdtempSync(path.join(tmpdir(), 'migrate-src-')), out = path.join(mkdtempSync(path.join(tmpdir(), 'migrate-ev-')), 'run');
  const db = openDb(src);
  saveSnapshot(db, 'timeline', { identity: timelineIdentity(getSettings(db)), value: TIMELINE }, '2026-11-08T02:00:00Z');
  db.close();
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/migrate-strategy-v2.mjs'), ...args], { encoding: 'utf8' });
  assert.equal(run('plan', '--data', src, '--out', out).status, 0);
  const db2 = openDb(src); putRecord(db2, USER_STRATEGY_KIND, '2026-11', localNovember()); db2.close();
  const apply = run('apply', '--data', src, '--report', out, '--confirm');
  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /2026-11 的迁移内容与报告不一致/);
  const n = execFileSync('sqlite3', [path.join(src, 'work-desk.db'), 'SELECT COUNT(*) FROM strategy_revisions'], { encoding: 'utf8' }).trim();
  assert.equal(n, '0');
});

test('切换前时间线同步过、覆盖率与报告不一致：apply 拒绝，要求重新试跑', () => {
  const src = mkdtempSync(path.join(tmpdir(), 'migrate-src-')), out = path.join(mkdtempSync(path.join(tmpdir(), 'migrate-ev-')), 'run');
  const db = openDb(src);
  saveSnapshot(db, 'timeline', { identity: timelineIdentity(getSettings(db)), value: TIMELINE }, '2026-11-08T02:00:00Z');
  db.close();
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/migrate-strategy-v2.mjs'), ...args], { encoding: 'utf8' });
  assert.equal(run('plan', '--data', src, '--out', out).status, 0);
  const later = { ...parseTimeline([sheet([['英国', 'Final 时间'], ['伦敦大学学院 UCL', '1.20'], ['爱丁堡大学 UoE', '2027.9.20']])], '2026-11-09 10:00'), years: [{ year: 2026 }] };
  const db2 = openDb(src); saveSnapshot(db2, 'timeline', { identity: timelineIdentity(getSettings(db2)), value: later }, '2026-11-09T02:00:00Z'); db2.close();
  const apply = run('apply', '--data', src, '--report', out, '--confirm');
  assert.equal(apply.status, 1);
  assert.match(apply.stderr, /覆盖率或默认优先级与报告不一致/);
  assert.equal(execFileSync('sqlite3', [path.join(src, 'work-desk.db'), 'SELECT COUNT(*) FROM strategy_revisions'], { encoding: 'utf8' }).trim(), '0');
});
