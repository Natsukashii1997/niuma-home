import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, openVoiceDb, voiceDbFor, VOICE_DB_FILE, VOICE_SCHEMA, VOICE_TABLES } from '../server/db.mjs';
import { migrateVoiceDb } from '../scripts/migrate-voice-db.mjs';

// 内部原声的会话三张表拆到 internal-voice.db（#82）：新目录直接用新库；主库里还留着旧表时继续用主库；迁移脚本把数据搬过去。
function dir(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须使用隔离数据');
  const d = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'voice-db-'));
  t.after(() => rmSync(d, { recursive: true, force: true }));
  return d;
}
const tables = db => db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
// 旧形态：会话表建在主库里，放几行数据
function legacy(d) {
  openDb(d).close();
  const db = new DatabaseSync(path.join(d, 'work-desk.db'));
  db.exec(VOICE_SCHEMA);
  db.exec(`INSERT INTO chat_conversations (id,kind,updated_at) VALUES ('c1','customer','t'),('c2','group','t');
    INSERT INTO chat_messages (msg_id,conversation_id,kind,msg_time,msg_type,content,fetched_at) VALUES ('m1','c1','customer','2026-11-01 10:00:00','text','你好','t'),('m2','c1','customer','2026-11-01 10:01:00','text','在吗','t'),('m3','c2','group','2026-11-02 09:00:00','text','群里','t');
    INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('weekly','2026-11-01','2026-11-07','done','t');
    INSERT INTO settings (key,value) VALUES ('internal_voice_auto','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`);
  db.close();
}
const free = () => [];

test('新数据目录：主库里没有会话表，会话表在 internal-voice.db，同一个主库连接只开一次', t => {
  const d = dir(t), db = openDb(d);
  t.after(() => { voiceDbFor(db).close(); db.close(); });
  assert.deepEqual(VOICE_TABLES.filter(name => tables(db).includes(name)), []);
  const voice = voiceDbFor(db);
  assert.notEqual(voice, db); assert.equal(voiceDbFor(db), voice);
  assert.ok(existsSync(path.join(d, VOICE_DB_FILE)));
  assert.deepEqual(VOICE_TABLES.filter(name => !tables(voice).includes(name)), []);
});

test('过渡期：主库里还留着会话表（没跑迁移）时继续用主库，不新建文件', t => {
  const d = dir(t); legacy(d);
  const db = openDb(d); t.after(() => db.close());
  assert.equal(voiceDbFor(db), db);
  assert.equal(existsSync(path.join(d, VOICE_DB_FILE)), false);
});

test('迁移：预览不改；有进程开着主库或没给备份就拒绝；执行后行数一致、主库三张表删掉、其余数据不动；重跑是空操作', t => {
  const d = dir(t), backup = path.join(d, 'before.db'); legacy(d);
  const preview = migrateVoiceDb({ dataDir: d, openHolders: free });
  assert.equal(preview.state, 'preview'); assert.deepEqual(preview.mainTables, { chat_conversations: 2, chat_messages: 3, chat_pull_runs: 1 });
  assert.equal(existsSync(path.join(d, VOICE_DB_FILE)), false);
  assert.throws(() => migrateVoiceDb({ dataDir: d, backup, confirm: true, openHolders: () => [4242] }), /还有进程开着主库（PID 4242）/);
  assert.throws(() => migrateVoiceDb({ dataDir: d, backup, confirm: true, openHolders: () => null }), /没有 lsof/);
  assert.throws(() => migrateVoiceDb({ dataDir: d, confirm: true, openHolders: free }), /必须带 --backup/);
  assert.equal(existsSync(backup), false, '被拒绝时不留下备份文件');

  const done = migrateVoiceDb({ dataDir: d, backup, confirm: true, openHolders: free });
  assert.equal(done.state, 'migrated'); assert.deepEqual(done.checks, { main: 'ok', voice: 'ok' });
  assert.deepEqual(done.voiceTables, preview.mainTables); assert.deepEqual(done.mainTablesLeft, []);
  const kept = new DatabaseSync(backup, { readOnly: true });
  assert.equal(kept.prepare('SELECT COUNT(*) n FROM chat_messages').get().n, 3, '备份里是迁移前的整库'); kept.close();

  const db = openDb(d), voice = voiceDbFor(db);
  t.after(() => { voice.close(); db.close(); });
  assert.notEqual(voice, db);
  assert.equal(db.prepare("SELECT value FROM settings WHERE key='internal_voice_auto'").get().value, '1', '设置仍在主库');
  assert.deepEqual(voice.prepare('SELECT msg_id, content FROM chat_messages ORDER BY msg_id').all().map(r => ({ ...r })), [{ msg_id: 'm1', content: '你好' }, { msg_id: 'm2', content: '在吗' }, { msg_id: 'm3', content: '群里' }]);
  assert.equal(voice.prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('manual','a','b','done','t') RETURNING id").get().id, 2, '自增编号接着原来的走');

  assert.equal(migrateVoiceDb({ dataDir: d, openHolders: free }).state, 'nothing-to-do');
  assert.equal(migrateVoiceDb({ dataDir: d, backup: path.join(d, 'again.db'), confirm: true, openHolders: free }).state, 'nothing-to-do');
  assert.equal(existsSync(path.join(d, 'again.db')), false, '空操作不再留备份');
});

test('迁移：目标库里已经有数据就拒绝，不覆盖', t => {
  const d = dir(t); legacy(d);
  const voice = openVoiceDb(d);
  voice.exec("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES ('manual','a','b','done','t')"); voice.close();
  assert.throws(() => migrateVoiceDb({ dataDir: d, openHolders: free }), /目标库 .* 里已经有数据/);
});
