// 一次性迁移：飞书身份从机械邪龙兽（codex）换成猛鬼兽后，把「简报 ↔ 飞书文档」绑定里记的旧身份改到新身份。
// 不迁的话，已绑定的简报会因 actor / 来源指纹对不上而拒绝同步。历史记录（导出回执、知识库操作、过期预览）不改写。
// npm run migrate:lark-identity             只预览，不写入
// npm run migrate:lark-identity -- --confirm  先备份数据库到证据目录，再写入，写完回读核对
import os from 'node:os';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { dataDir, getSettings, openDb } from '../server/db.mjs';
import { exportSourceIdentity } from '../server/feishu-export.mjs';
import { fingerprint, getRecord, putRecord } from '../server/local-records.mjs';
import { LARK_SELF_USER_ID } from '../server/lark-identity.mjs';
import { V3_DEFAULTS } from '../server/v3-settings.mjs';

const OLD = { profile: 'codex', appId: 'cli_aacf58ab61b85beb', user: 'ou_77e999422389255555be6df48a3ed1a1' };
const KIND = 'brief-feishu-link';
const confirm = process.argv.includes('--confirm');

const db = openDb();
// 旧来源指纹：与 feishu-export 的 exportSourceConfig 同一组字段，只把身份换回旧值。
const settings = { ...V3_DEFAULTS, ...getSettings(db), lark_profile: OLD.profile, lark_app_id: OLD.appId };
const oldIdentity = fingerprint(Object.fromEntries(['timeline_source', 'project_base_url', 'price_sku_table_id', 'price_floor_margin', 'price_cost_per_hour', 'lark_profile', 'lark_app_id'].map(k => [k, settings[k]])));
const newIdentity = exportSourceIdentity(db);

const plan = [], skipped = [];
const rows = db.prepare('SELECT id, payload FROM v3_documents WHERE kind=? ORDER BY id').all(KIND);
for (const { id, value } of rows.map(r => ({ id: r.id, value: JSON.parse(r.payload) }))) {
  if (value.actor !== OLD.user) continue;
  if (value.sourceIdentity !== oldIdentity) { skipped.push({ id, reason: '来源配置除身份外也变过，不自动迁，请在工作台重新绑定' }); continue; }
  plan.push({ id, value, next: { ...value, actor: LARK_SELF_USER_ID, sourceIdentity: newIdentity } });
}

console.log(`数据目录：${dataDir}`);
console.log(`待迁移 ${plan.length} 条，跳过 ${skipped.length} 条`);
for (const p of plan) console.log(`- ${KIND}/${p.id}：actor ${OLD.user.slice(0, 9)}… → ${LARK_SELF_USER_ID.slice(0, 9)}…；来源指纹 ${oldIdentity.slice(0, 8)} → ${newIdentity.slice(0, 8)}；文档 ${p.value.document?.url || ''}`);
for (const s of skipped) console.log(`- 跳过 ${KIND}/${s.id}：${s.reason}`);
if (!confirm || !plan.length) { console.log(confirm ? '没有要写的。' : '只预览，未写入；确认后加 --confirm。'); process.exit(0); }

const dir = path.join(os.homedir(), 'Library/Application Support/NiumaHome/evidence', `lark-menggui-${new Date().toISOString().replace(/[:.]/g, '-')}`);
mkdirSync(dir, { recursive: true });
const backup = path.join(dir, 'work-desk.db');
db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
console.log(`已备份：${backup}`);

db.exec('BEGIN');
try { for (const p of plan) putRecord(db, KIND, p.id, p.next); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; }

const bad = plan.filter(p => fingerprint(getRecord(db, KIND, p.id)) !== fingerprint(p.next));
console.log(bad.length ? `回读不一致：${bad.map(p => p.id).join('、')}，请用备份核对` : `已写入 ${plan.length} 条，回读一致`);
process.exit(bad.length ? 1 : 0);
