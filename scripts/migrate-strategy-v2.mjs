#!/usr/bin/env node
// 旧版用户情况 → 月度策略 v2 的一次性迁移（docs/策略规则/04-迁移映射.md 第 7 节五步；操作见 docs/OPERATIONS.md「月度策略 v2 迁移」）。
//
//   试跑（第 1–4 步，只读源数据）：node scripts/migrate-strategy-v2.mjs plan --data <源数据目录> --out <证据目录> [--refresh-timeline]
//   切换（第 5 步，须常浩看过报告并同意）：node scripts/migrate-strategy-v2.mjs apply --data <正式数据目录> --report <证据目录> --confirm
//   回退：node scripts/migrate-strategy-v2.mjs rollback --data <正式数据目录> [--months 2026-01,2026-02]               先预览，不改数据
//         node scripts/migrate-strategy-v2.mjs rollback --data <正式数据目录> --out <证据目录> --confirm [--months …]   执行
//
// plan 以只读方式打开源数据库，备份后复制到证据目录下的隔离数据目录再迁移；--refresh-timeline 只在隔离副本里重读一次飞书时间线（只读）。
// apply 先备份正式库，再逐月重跑迁移，内容指纹须与报告一致才写；回退只删迁移写入的 revision，迁移之后有新版本的月份整体拒绝。
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const INSIGHT_DIR = path.join(ROOT, 'docs/用户情况');
const [cmd, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) continue;
  const key = rest[i].slice(2), next = rest[i + 1];
  if (next === undefined || next.startsWith('--')) opt[key] = true; else { opt[key] = next; i++; }
}
const die = message => { console.error(`✗ ${message}`); process.exit(1); };
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');
const stampName = () => new Date().toISOString().replace(/[:.]/g, '-');
const writeJson = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
const need = key => { if (!opt[key] || opt[key] === true) die(`缺少 --${key} <路径>`); return path.resolve(opt[key]); };
// 数据库在线一致备份（源库只读打开）。
function backupDb(src, dest) {
  if (!existsSync(src)) die(`找不到数据库 ${src}`);
  const db = new DatabaseSync(src, { readOnly: true });
  try { db.exec(`VACUUM INTO '${dest.replaceAll("'", "''")}'`); } finally { db.close(); }
}

async function load(dataDir) {
  // db.mjs 在导入时读取 WORKDESK_DATA_DIR（飞书调用日志也写在它下面），必须在导入前指好。
  process.env.WORKDESK_DATA_DIR = dataDir;
  const [dbm, svc, mig, val, us, tl, rulings, local] = await Promise.all(['../server/db.mjs', '../server/strategy-service.mjs', '../server/strategy-migrate.mjs', '../server/strategy-validate.mjs',
    '../server/user-strategy.mjs', '../server/timeline.mjs', '../server/timeline-rulings.mjs', '../server/local-records.mjs'].map(p => import(p)));
  // 第 1 步：冻结版本。规则文件的版本号与脚本常量不一致就不跑。
  const rule04 = readFileSync(path.join(ROOT, 'docs/策略规则/04-迁移映射.md'), 'utf8').split('\n')[0];
  const rule03 = readFileSync(path.join(ROOT, 'docs/策略规则/03-Schema-v2.md'), 'utf8').split('\n')[0];
  if (!rule04.includes(`\`${mig.MIGRATION_VERSION}\``) || !rule03.includes(`\`schema ${mig.MIGRATION_SCHEMA}\``)) die(`规则版本与脚本常量不一致：04「${rule04}」、03「${rule03}」，脚本 ${mig.MIGRATION_VERSION} / schema ${mig.MIGRATION_SCHEMA}`);
  const db = dbm.openDb(dataDir);
  // 时间线取库里最近一次完整快照（与页面同源、叠加人工裁定），不在这里调用飞书。
  const readTimeline = async () => {
    const row = db.prepare('SELECT payload FROM v3_snapshots WHERE kind=?').get('timeline');
    if (!row) throw Object.assign(new Error('数据库里没有时间线快照，请先在时间线页同步一次'), { status: 409 });
    const snap = JSON.parse(row.payload);
    if (snap.identity !== tl.timelineIdentity(dbm.getSettings(db))) throw Object.assign(new Error('时间线快照与当前来源设置不符，请先在时间线页同步一次'), { status: 409 });
    return rulings.withRulings(db, snap.value);
  };
  const service = svc.createStrategyService(db, { readTimeline });
  const months = () => [...new Set([...readdirSync(INSIGHT_DIR).filter(f => /^20\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 7)),
    ...db.prepare('SELECT id FROM v3_documents WHERE kind=?').all(us.USER_STRATEGY_KIND).map(r => r.id)])].sort();
  // 旧版当月内容：本地修改过的优先，否则内置（与 server/user-strategy.mjs current() 一致）。
  const oldRecord = month => {
    const row = db.prepare('SELECT payload, updated_at FROM v3_documents WHERE kind=? AND id=?').get(us.USER_STRATEGY_KIND, month);
    if (row) return { v1: JSON.parse(row.payload), source: { kind: '已修改', ref: `v3_documents user-strategy/${month}`, updatedAt: row.updated_at } };
    const v1 = us.readInsight(month);
    return v1 ? { v1: { ...v1, strategy: null }, source: { kind: '内置', ref: `docs/用户情况/${month}.json`, updatedAt: null } } : null;
  };
  async function migrate(month) {
    const old = oldRecord(month);
    if (!old) throw new Error(`${month} 没有旧记录`);
    const f = await service.facts(month);
    const doc = mig.migrateMonth(old.v1, { month, coverage: f.coverage, source: old.source });
    const validation = val.validateStrategyDoc(doc, { evidence: f.evidence, migrated: true });
    const checks = mig.migrationChecks(old.v1, doc, validation);
    return { ...old, doc, validation, checks, fingerprint: mig.contentFingerprint(doc), full: mig.fullFingerprint(doc) };
  }
  // 写入后回读：正式版本就是这份迁移文档。
  const readBack = (month, doc) => {
    const rev = service.get(month).revision;
    const { inputs, ...content } = rev?.content || {};
    return rev && rev.confirmedFrom === 'migration' && local.fingerprint(content) === local.fingerprint(doc) ? rev.id : null;
  };
  return { db, dbm, mig, service, months, migrate, readBack, timeline: tl };
}

async function plan() {
  const src = need('data'), out = need('out');
  if (existsSync(out) && readdirSync(out).length) die(`证据目录 ${out} 已存在且非空，换一个目录，避免覆盖已有证据`);
  const srcDb = path.join(src, 'work-desk.db');
  // 第 2 步：备份。
  const backup = path.join(out, 'backup'), iso = path.join(out, 'isolated-data');
  mkdirSync(path.join(backup, '用户情况'), { recursive: true }); mkdirSync(iso, { recursive: true });
  const files = [];
  for (const f of readdirSync(INSIGHT_DIR).filter(f => f.endsWith('.json')).sort()) {
    copyFileSync(path.join(INSIGHT_DIR, f), path.join(backup, '用户情况', f));
    files.push({ file: `backup/用户情况/${f}`, sha256: sha(path.join(backup, '用户情况', f)) });
  }
  backupDb(srcDb, path.join(backup, 'work-desk.db'));
  files.push({ file: 'backup/work-desk.db', sha256: sha(path.join(backup, 'work-desk.db')) });
  const ro = new DatabaseSync(path.join(backup, 'work-desk.db'), { readOnly: true });
  const v1Rows = ro.prepare("SELECT kind, id, updated_at, payload FROM v3_documents WHERE kind='user-strategy' ORDER BY id").all().map(r => ({ ...r, payload: JSON.parse(r.payload) }));
  ro.close();
  writeJson(path.join(backup, 'v1-records.json'), v1Rows);
  files.push({ file: 'backup/v1-records.json', sha256: sha(path.join(backup, 'v1-records.json')) });

  // 第 3 步：在隔离数据目录迁移（数据库是备份的副本）。
  copyFileSync(path.join(backup, 'work-desk.db'), path.join(iso, 'work-desk.db'));
  const ctx = await load(iso);
  if (opt['refresh-timeline']) {
    console.log('· 在隔离副本里重读飞书时间线（只读，快照只写进隔离副本）…');
    await ctx.timeline.createTimelineReader(ctx.db)({ refresh: true });
  }
  const reports = path.join(out, 'reports'), docs = path.join(out, 'migrated');
  mkdirSync(reports); mkdirSync(docs);
  const summary = { migration: ctx.mig.MIGRATION_VERSION, schema: ctx.mig.MIGRATION_SCHEMA, createdAt: new Date().toISOString(), source: { dataDir: src, db: srcDb }, backup: files, months: {} };
  let ok = true;
  for (const month of ctx.months()) {
    const r = await ctx.migrate(month);
    let revision = null, error = null;
    if (r.checks.ok) {
      try { await ctx.service.writeMigration(month, r.doc); revision = ctx.readBack(month, r.doc); if (!revision) error = '写入后回读不一致'; }
      catch (e) { error = e.message; }
    }
    // 第 4 步：自动检查（含写入与回读）。
    const pass = r.checks.ok && revision && !error;
    ok &&= Boolean(pass);
    writeFileSync(path.join(reports, `${month}.md`), ctx.mig.diffReport(r.v1, r.doc, r) + (error ? `\n**写入失败**：${error}\n` : revision ? `\n隔离数据目录写入并回读一致：${revision}\n` : ''));
    writeJson(path.join(docs, `${month}.json`), r.doc);
    summary.months[month] = { ok: Boolean(pass), source: r.source, fingerprint: r.fingerprint, full: r.full, revision, error, errors: r.validation.errors.length, warnings: r.validation.warnings.length,
      items: r.checks.total, failed: r.checks.checks.filter(c => !c.ok).map(c => `${c.name}：${c.detail}`),
      regions: Object.fromEntries(r.doc.regions.map(x => [x.key, { priority: x.priority.value, default: x.priority.default, activity: x.activity.value, ratio: x.activity.ratio }])),
      barrierUnknown: r.doc.claims.filter(c => c.claimType === 'barrier' && c.status === 'unknown').length };
    console.log(`${pass ? '✓' : '✗'} ${month}（${r.source.kind}）条目 ${r.checks.total.before} → ${r.checks.total.after}，校验错误 ${r.validation.errors.length}${error ? `，${error}` : ''}`);
  }
  summary.ok = ok;
  writeJson(path.join(out, 'summary.json'), summary);
  const lines = [`# 月度策略 v2 迁移试跑汇总（${summary.migration}）`, '', `- 时间：${summary.createdAt}`, `- 源数据目录（只读）：${src}`, `- 隔离数据目录：${iso}`, `- 结论：${ok ? '全部月份检查通过' : '**有月份未通过**'}`, '',
    '| 月份 | 来源 | 条目（旧 → 新 + legacy） | 校验错误 / 提示 | 障碍降为 unknown | uk/us/hk/au/ca/other 优先级 | 结果 |', '|---|---|---|---|---|---|---|'];
  for (const [m, s] of Object.entries(summary.months)) lines.push(`| ${m} | ${s.source.kind} | ${s.items.before} → ${s.items.after} | ${s.errors} / ${s.warnings} | ${s.barrierUnknown} | ${Object.values(s.regions).map(x => x.priority ?? '空').join(' / ')} | ${s.ok ? '通过' : `**未通过**：${s.error || s.failed.join('；')}`} |`);
  lines.push('', '每月明细见 reports/<月份>.md；迁移后的文档见 migrated/<月份>.json；备份清单与校验和见 summary.json。', '',
    '切换正式数据须常浩看过本报告并明确同意，命令见 docs/OPERATIONS.md「月度策略 v2 迁移」。');
  writeFileSync(path.join(out, 'SUMMARY.md'), lines.join('\n') + '\n');
  console.log(`\n证据目录：${out}`);
  process.exit(ok ? 0 : 1);
}

async function apply() {
  const data = need('data'), report = need('report');
  if (opt.confirm !== true) die('切换会写正式数据：须常浩看过差异报告并同意后，加 --confirm 执行');
  const summaryFile = path.join(report, 'summary.json');
  if (!existsSync(summaryFile)) die(`找不到 ${summaryFile}`);
  const summary = JSON.parse(readFileSync(summaryFile, 'utf8'));
  if (!summary.ok) die('试跑报告有未通过的月份，不能切换');
  const dir = path.join(report, `apply-${stampName()}`);
  mkdirSync(dir, { recursive: true });
  backupDb(path.join(data, 'work-desk.db'), path.join(dir, 'work-desk-before-apply.db'));
  const ctx = await load(data);
  if (summary.migration !== ctx.mig.MIGRATION_VERSION) die(`报告版本 ${summary.migration} 与脚本 ${ctx.mig.MIGRATION_VERSION} 不一致`);
  // 先全部重跑并比对，任何一个月与常浩看过的报告不一致，就一条都不写。
  const runs = [];
  for (const month of Object.keys(summary.months)) {
    const r = await ctx.migrate(month);
    if (!r.checks.ok) die(`${month} 自动检查未通过：${r.checks.checks.filter(c => !c.ok).map(c => c.name).join('、')}`);
    if (r.fingerprint !== summary.months[month].fingerprint) die(`${month} 的迁移内容与报告不一致（旧记录在试跑后被改过？），请重新试跑并给常浩看新报告`);
    if (r.full !== summary.months[month].full) die(`${month} 的覆盖率或默认优先级与报告不一致（时间线在试跑后同步过？），请重新试跑并给常浩看新报告`);
    runs.push([month, r]);
  }
  if (ctx.months().some(m => !summary.months[m])) die(`正式库里有报告没覆盖的月份：${ctx.months().filter(m => !summary.months[m]).join('、')}，请重新试跑`);
  const log = { at: new Date().toISOString(), data, report, backup: path.join(dir, 'work-desk-before-apply.db'), months: {} };
  for (const [month, r] of runs) {
    try {
      const w = await ctx.service.writeMigration(month, r.doc);
      const id = ctx.readBack(month, r.doc);
      if (!id) throw new Error('写入后回读不一致');
      log.months[month] = { revision: id, skipped: w.skipped, activity: Object.fromEntries(r.doc.regions.map(x => [x.key, x.activity.value])) };
      console.log(`✓ ${month} → ${id}${w.skipped ? '（已存在，跳过）' : ''}`);
    } catch (e) {
      log.months[month] = { error: e.message };
      writeJson(path.join(dir, 'apply-log.json'), log);
      die(`${month} 写入失败：${e.message}。已写入的月份可用 rollback 回退，日志见 ${dir}`);
    }
  }
  writeJson(path.join(dir, 'apply-log.json'), log);
  console.log(`\n已切换 ${runs.length} 个月；切换前备份：${log.backup}`);
}

async function rollback() {
  const data = need('data');
  const preview = opt.confirm !== true;
  // 先预览：不带 --confirm 只列出将删除的版本和将转为 stale 的待确认提交，不备份、不改数据。
  const out = preview ? null : need('out');
  let backup = null;
  if (!preview) {
    mkdirSync(out, { recursive: true });
    backup = path.join(out, `work-desk-before-rollback-${stampName()}.db`);
    backupDb(path.join(data, 'work-desk.db'), backup);
  }
  const ctx = await load(data);
  const months = typeof opt.months === 'string' ? opt.months.split(',') : ctx.db.prepare("SELECT DISTINCT month FROM strategy_revisions WHERE confirmed_from='migration' ORDER BY month").all().map(r => r.month);
  if (!months.length) { console.log('没有迁移写入的 revision，无需回退'); return; }
  const { removed, staled } = ctx.service.rollbackMigration(months, { dryRun: preview });
  if (preview) {
    console.log(`预览（未改动）：将删除迁移版本 ${removed.length} 个（${removed.join('、') || '无'}）；将转为 stale 的待确认提交 ${staled.length} 个（${staled.join('、') || '无'}）`);
    console.log('确认无误后加 --out <证据目录> --confirm 执行（执行前会先备份数据库到证据目录）。');
    return;
  }
  console.log(`✓ 已删除迁移版本 ${removed.length} 个（${removed.join('、')}）；待确认提交转为 stale ${staled.length} 个；回退前备份：${backup}`);
  console.log('页面读的旧版用户情况（v3_documents、docs/用户情况/）迁移时未改动，回退后照常使用。');
}

const run = { plan, apply, rollback }[cmd];
if (!run) die('用法：migrate-strategy-v2.mjs plan|apply|rollback（参数见文件头注释）');
run().catch(e => die(e.stack || e.message));
