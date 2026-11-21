// 一次性迁移（#82）：把内部原声的会话三张表从主库 work-desk.db 搬到同目录的 internal-voice.db。
//
//   node scripts/migrate-voice-db.mjs --data <数据目录>                                  只预览：两边各表行数，不改任何东西
//   node scripts/migrate-voice-db.mjs --data <数据目录> --backup <备份文件> --confirm      执行
//
// 执行前必须先停服务：脚本发现还有别的进程开着主库就拒绝执行。步骤：
//   整库备份（VACUUM INTO，写后核对）→ 新库建表 → 逐表复制 → 核对行数 → 主库删这三张表 → 主库 VACUUM → 两个库 quick_check。
// 删表和 VACUUM 不可逆，回退只能靠那份备份：停服务，把备份放回 work-desk.db，删掉 internal-voice.db。
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICE_DB_FILE, VOICE_TABLES, openVoiceDb } from '../server/db.mjs';

const stop = message => Object.assign(new Error(message), { expected: true });
const size = file => (existsSync(file) ? statSync(file).size : 0);
const tablesIn = db => new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
const count = (db, table, schema = 'main') => db.prepare(`SELECT COUNT(*) n FROM ${schema}.${table}`).get().n;
const check = db => db.prepare('PRAGMA quick_check').get().quick_check;

// 还有谁开着这个文件（不含自己）。lsof 没装时返回 null，由调用方决定怎么办。
export function holders(file) {
  try { return execFileSync('lsof', ['-t', file], { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number).filter(pid => pid !== process.pid); }
  catch (error) { return error.code === 'ENOENT' ? null : []; } // lsof 找不到任何进程时退出码是 1
}

export function migrateVoiceDb({ dataDir, backup, confirm = false, openHolders = holders }) {
  const mainFile = path.join(dataDir, 'work-desk.db'), voiceFile = path.join(dataDir, VOICE_DB_FILE);
  if (!existsSync(mainFile)) throw stop(`找不到主库：${mainFile}`);
  const using = openHolders(mainFile);
  const main = new DatabaseSync(mainFile);
  try {
    const present = VOICE_TABLES.filter(t => tablesIn(main).has(t));
    const before = Object.fromEntries(present.map(t => [t, count(main, t)]));
    const report = { dataDir, mainFile, voiceFile, mainBytesBefore: size(mainFile), mainTables: before, voiceExists: existsSync(voiceFile), confirm };
    if (existsSync(voiceFile)) {
      const voice = new DatabaseSync(voiceFile, { readOnly: true });
      try { report.voiceTables = Object.fromEntries(VOICE_TABLES.filter(t => tablesIn(voice).has(t)).map(t => [t, count(voice, t)])); } finally { voice.close(); }
    }
    if (!present.length) return { ...report, state: 'nothing-to-do', note: '主库里已经没有会话表，不用迁移' };
    if (present.length !== VOICE_TABLES.length) throw stop(`主库里只有部分会话表（${present.join('、')}），情况不明，先人工核对`);
    if (Object.values(report.voiceTables || {}).some(n => n > 0)) throw stop(`目标库 ${voiceFile} 里已经有数据，不覆盖；先人工核对`);
    if (!confirm) return { ...report, state: 'preview', holders: using, note: '只预览，没有改动。执行要加 --backup <备份文件> --confirm，并且先停服务' };

    if (using === null) throw stop('本机没有 lsof，无法确认服务已停；先装 lsof 或人工确认后再处理');
    if (using.length) throw stop(`还有进程开着主库（PID ${using.join('、')}），先停服务再执行`);
    if (!backup) throw stop('执行必须带 --backup <备份文件>');
    if (existsSync(backup)) throw stop(`备份文件已存在，不覆盖：${backup}`);

    // 1. 整库备份并核对
    main.prepare('VACUUM INTO ?').run(backup);
    const copy = new DatabaseSync(backup, { readOnly: true });
    try {
      if (check(copy) !== 'ok') throw stop('备份文件 quick_check 不过，已中止，主库未改动');
      for (const t of VOICE_TABLES) if (count(copy, t) !== before[t]) throw stop(`备份里 ${t} 行数对不上，已中止，主库未改动`);
    } finally { copy.close(); }

    // 2. 新库建表，逐表复制（同一个事务），核对行数
    openVoiceDb(dataDir).close();
    main.prepare('ATTACH DATABASE ? AS voice').run(voiceFile);
    const columns = (schema, t) => main.prepare(`PRAGMA ${schema}.table_info(${t})`).all().map(c => c.name);
    main.exec('BEGIN IMMEDIATE');
    try {
      for (const t of VOICE_TABLES) {
        const from = columns('main', t), to = new Set(columns('voice', t));
        if (from.length !== to.size || from.some(c => !to.has(c))) throw stop(`${t} 两边的列对不上（主库：${from.join(',')}），已中止，主库未改动`);
        main.exec(`INSERT INTO voice.${t} (${from.join(',')}) SELECT ${from.join(',')} FROM main.${t}`);
        if (count(main, t, 'voice') !== before[t]) throw stop(`${t} 复制后行数对不上，已中止，主库未改动`);
      }
      main.exec('COMMIT');
    } catch (error) { main.exec('ROLLBACK'); throw error; }
    main.exec('DETACH DATABASE voice');

    // 3. 主库删表、收缩
    for (const t of VOICE_TABLES) main.exec(`DROP TABLE ${t}`);
    main.exec('VACUUM');

    const voice = new DatabaseSync(voiceFile, { readOnly: true });
    try {
      const after = Object.fromEntries(VOICE_TABLES.map(t => [t, count(voice, t)]));
      const checks = { main: check(main), voice: check(voice) };
      const same = VOICE_TABLES.every(t => after[t] === before[t]);
      return { ...report, state: same && checks.main === 'ok' && checks.voice === 'ok' ? 'migrated' : 'check-failed', backup, backupBytes: size(backup), voiceTables: after, checks, mainBytesAfter: size(mainFile), voiceBytesAfter: size(voiceFile), mainTablesLeft: VOICE_TABLES.filter(t => tablesIn(main).has(t)) };
    } finally { voice.close(); }
  } finally { main.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const dataDir = value('--data');
  if (!dataDir) { console.error('用法：node scripts/migrate-voice-db.mjs --data <数据目录> [--backup <备份文件> --confirm]'); process.exit(2); }
  try {
    const result = migrateVoiceDb({ dataDir: path.resolve(dataDir), backup: value('--backup') && path.resolve(value('--backup')), confirm: args.includes('--confirm') });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.state === 'check-failed' ? 1 : 0);
  } catch (error) {
    console.error(error.expected ? `迁移中止：${error.message}` : error);
    process.exit(1);
  }
}
