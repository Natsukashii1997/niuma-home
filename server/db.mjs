import { DatabaseSync } from "node:sqlite";
import { ASSISTANT_PRESETS } from "./assistant-presets.mjs";
import { mkdirSync } from "node:fs";
import path from "node:path";

// 数据库与图片都放在数据目录下，上云时整体拷走即可。
export const dataDir = path.resolve(process.env.WORKDESK_DATA_DIR || "data");

// 全部表结构在此定义；改表结构须先改 docs/API.md 并在派单中说明。
const SCHEMA = `
  -- 促销表：一行 = 某月某业务线的一个 SKU
  CREATE TABLE IF NOT EXISTS promos (
    id INTEGER PRIMARY KEY,
    month TEXT NOT NULL,              -- YYYY-MM
    line TEXT NOT NULL,               -- 大学辅导 / 国际课程 / 申诉服务
    sku TEXT NOT NULL,
    trial TEXT NOT NULL DEFAULT '无',
    price TEXT NOT NULL DEFAULT '无',
    new_deal TEXT NOT NULL DEFAULT '无',
    renewal TEXT NOT NULL DEFAULT '无',
    updated_at TEXT NOT NULL,
    special TEXT NOT NULL DEFAULT '无', -- 特殊活动：该 SKU 下不属于试听/正价/新签/续费的活动
    UNIQUE (month, line, sku)
  );

  -- 方案原文：每个 月份×业务线 一份，原样保存
  CREATE TABLE IF NOT EXISTS plans (
    month TEXT NOT NULL,
    line TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    raw_html TEXT,
    saved_at TEXT NOT NULL,
    special TEXT NOT NULL DEFAULT '无', -- 整月特殊活动：不挂在某个 SKU 下面的活动块（如双11）
    PRIMARY KEY (month, line)
  );

  -- SKU 别名：方案里的写法 → 库中 SKU 名
  CREATE TABLE IF NOT EXISTS sku_aliases (
    line TEXT NOT NULL,
    alias TEXT NOT NULL,
    sku TEXT NOT NULL,
    PRIMARY KEY (line, alias)
  );

  -- 物料
  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY,
    month TEXT NOT NULL,
    line TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    skus TEXT NOT NULL DEFAULT '[]',  -- JSON 数组，可空
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  -- 物料图片：文件存在 data/images/ 下，这里只存相对文件名
  CREATE TABLE IF NOT EXISTS material_images (
    id INTEGER PRIMARY KEY,
    material_id INTEGER NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
    file TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  -- 助手：文案助手 / 从 Codex 导入的会话 / 新建
  CREATE TABLE IF NOT EXISTS assistants (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('copywriter', 'imported', 'custom')),
    instructions TEXT NOT NULL DEFAULT '',
    codex_thread_id TEXT,
    created_at TEXT NOT NULL,
    model TEXT,
    effort TEXT,
    preset TEXT,
    chatgpt_url TEXT
  );

  -- 简单配置：品牌表链接、日报文档链接、物料类型清单等
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- V3：外部只读来源的完整快照；失败时不替换。
  CREATE TABLE IF NOT EXISTS v3_snapshots (
    kind TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- V3：本人预览确认后的需求及策略，仅保存在工作台。
  CREATE TABLE IF NOT EXISTS v3_needs (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    source_fingerprint TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- V3：最近读取结果与成功水位，状态栏只读此表，不访问来源。
  CREATE TABLE IF NOT EXISTS v3_source_status (
    kind TEXT PRIMARY KEY,
    identity TEXT NOT NULL DEFAULT '',
    attempt_at INTEGER NOT NULL,
    success_at TEXT,
    error TEXT,
    extra TEXT NOT NULL DEFAULT '{}'
  );

  -- 猛鬼兽推送 Codex 重置：每个重置事件一行。sent / unknown / skipped 不再推；failed 最多试 3 次。
  CREATE TABLE IF NOT EXISTS codex_push (
    event_id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    message_id TEXT,
    updated_at TEXT NOT NULL
  );

  -- 智能体接入（workdesk MCP）：每个 agent 一个服务端凭据，只存哈希；tools 是允许调用的工具名 JSON 数组。
  CREATE TABLE IF NOT EXISTS agent_access (
    agent TEXT PRIMARY KEY,
    token_sha256 TEXT NOT NULL UNIQUE,
    tools TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  -- 智能体调用记录：哪个 agent 替谁（caller）在什么时候调了哪个工具，结果状态码。凭据不对的请求不记。
  CREATE TABLE IF NOT EXISTS agent_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agent TEXT NOT NULL,
    tool TEXT NOT NULL,
    caller TEXT NOT NULL DEFAULT '{}',
    status INTEGER NOT NULL,
    error TEXT,
    at TEXT NOT NULL
  );

  -- 月度用户策略 v2（docs/策略规则/03-Schema-v2.md 第 7 节）：skill 只能创建 submission，常浩在页面确认后生成 revision。
  -- revision 写入后不可修改、不可删除（I-10），由触发器兜底。
  CREATE TABLE IF NOT EXISTS strategy_revisions (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    inputs TEXT NOT NULL,
    segment_index TEXT NOT NULL DEFAULT '{}',
    submission_id TEXT,
    confirmed_by TEXT,
    confirmed_from TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TRIGGER IF NOT EXISTS strategy_revisions_no_update BEFORE UPDATE ON strategy_revisions BEGIN SELECT RAISE(ABORT, 'revision 写入后不可修改'); END;
  CREATE TRIGGER IF NOT EXISTS strategy_revisions_no_delete BEFORE DELETE ON strategy_revisions BEGIN SELECT RAISE(ABORT, 'revision 写入后不可删除'); END;
  -- submission：pending / confirmed / rejected / stale；agent 来自凭据，declared 是 AI 自报，只作声明。
  CREATE TABLE IF NOT EXISTS strategy_submissions (
    id TEXT PRIMARY KEY,
    month TEXT NOT NULL,
    agent TEXT NOT NULL,
    declared TEXT,
    base_revision TEXT,
    input_fingerprint TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    warnings TEXT NOT NULL DEFAULT '[]',
    submitted_at TEXT NOT NULL,
    state TEXT NOT NULL,
    decided_at TEXT,
    decided_from TEXT
  );

  -- V3：本地业务记录；外部原件只读，用户确认后保存本地版本。
  CREATE TABLE IF NOT EXISTS v3_documents (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (kind, id)
  );
`;

export function openDb(dir = dataDir) {
  mkdirSync(path.join(dir, "images"), { recursive: true });
  const db = new DatabaseSync(path.join(dir, "work-desk.db"));
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  db.exec("BEGIN IMMEDIATE");
  try {
    const columns = new Set(db.prepare("PRAGMA table_info(assistants)").all().map((column) => column.name));
    for (const column of ["model", "effort", "preset", "chatgpt_url"]) {
      if (!columns.has(column)) db.exec(`ALTER TABLE assistants ADD COLUMN ${column} TEXT`);
    }
    for (const table of ["promos", "plans"]) {
      const names = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
      if (!names.has("special")) db.exec(`ALTER TABLE ${table} ADD COLUMN special TEXT NOT NULL DEFAULT '无'`);
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); db.close(); throw error; }
  seed(db);
  return db;
}

// 只补缺，不覆盖本人已改的内容。
function seed(db) {
  const now = new Date().toISOString();
  for (const line of ["国际课程", "大学辅导"]) db.prepare("INSERT OR IGNORE INTO sku_aliases (line, alias, sku) VALUES (?, ?, ?)").run(line, "课时卡", "灵活学Lite");
  if (!db.prepare("SELECT 1 FROM assistants WHERE kind = 'copywriter'").get()) {
    db.prepare("INSERT INTO assistants (name, kind, created_at) VALUES (?, 'copywriter', ?)").run("文案助手", now);
  }
  // 预设助手：已有的文案助手认领 copywriter 预设；其余预设没有就新建；说明只在为空时填入。
  db.prepare("UPDATE assistants SET preset = 'copywriter' WHERE kind = 'copywriter' AND preset IS NULL").run();
  for (const p of ASSISTANT_PRESETS) {
    if (!db.prepare("SELECT 1 FROM assistants WHERE preset = ?").get(p.key)) db.prepare("INSERT INTO assistants (name, kind, instructions, preset, created_at) VALUES (?, 'custom', ?, ?, ?)").run(p.name, p.instructions, p.key, now);
    else db.prepare("UPDATE assistants SET instructions = ? WHERE preset = ? AND instructions = ''").run(p.instructions, p.key);
  }
}

export function savePromo(db, p) {
  db.prepare(`
    INSERT INTO promos (month, line, sku, trial, price, new_deal, renewal, special, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (month, line, sku) DO UPDATE SET
      trial = excluded.trial, price = excluded.price, new_deal = excluded.new_deal,
      renewal = excluded.renewal, special = excluded.special, updated_at = excluded.updated_at
  `).run(p.month, p.line, p.sku, p.trial, p.price, p.newDeal, p.renewal, p.special || "无", new Date().toISOString());
}

export function listPromos(db) {
  return db
    .prepare(`
      SELECT month, line, sku, trial, price, new_deal AS newDeal, renewal, special, updated_at AS updatedAt
      FROM promos ORDER BY month DESC, line, id
    `)
    .all();
}

export function listPlans(db) {
  return db.prepare("SELECT month, line, special, saved_at AS savedAt FROM plans ORDER BY month DESC, line").all();
}

export function getPlan(db, month, line) {
  return db
    .prepare("SELECT month, line, raw_text AS rawText, raw_html AS rawHtml, special, saved_at AS savedAt FROM plans WHERE month = ? AND line = ?")
    .get(month, line);
}

export function listPlanAliases(db) {
  return db.prepare("SELECT line, alias, sku FROM sku_aliases").all();
}

export function comparePlan(db, month, line, parsed) {
  const all = listPromos(db).filter((row) => row.line === line);
  const current = all.filter((row) => row.month === month);
  const previousMonth = all.find((row) => row.month < month)?.month;
  const baseline = current.length ? current : all.filter((row) => row.month === previousMonth);
  const fields = ["trial", "price", "newDeal", "renewal", "special"];
  const rows = parsed.rows.map((row) => {
    const previous = baseline.find((old) => old.sku === row.sku);
    const changed = previous ? fields.filter((key) => row[key] !== previous[key]) : [];
    return { ...row, status: !previous ? "new" : changed.length ? "changed" : "same", changed, ...(previous && { previous }) };
  });
  return { ...parsed, rows, removed: current.filter((old) => !rows.some((row) => row.sku === old.sku)).map((row) => row.sku) };
}

export function savePlan(db, month, line, { rawText, rawHtml = "", rows, special = "无" }) {
  db.exec("SAVEPOINT plan_write");
  try {
    const existing = db.prepare("SELECT sku FROM promos WHERE month = ? AND line = ?").all(month, line);
    const oldSkus = new Set(existing.map((row) => row.sku));
    const newSkus = new Set(rows.map((row) => row.sku));
    const updated = rows.filter((row) => oldSkus.has(row.sku)).length;
    const removed = existing.filter((row) => !newSkus.has(row.sku)).length;
    db.prepare(`
      INSERT INTO plans (month, line, raw_text, raw_html, special, saved_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (month, line) DO UPDATE SET raw_text = excluded.raw_text,
        raw_html = excluded.raw_html, special = excluded.special, saved_at = excluded.saved_at
    `).run(month, line, rawText, rawHtml, special, new Date().toISOString());
    db.prepare("DELETE FROM promos WHERE month = ? AND line = ?").run(month, line);
    for (const row of rows) savePromo(db, { ...row, month, line });
    db.exec("RELEASE SAVEPOINT plan_write");
    return { inserted: rows.length - updated, updated, removed };
  } catch (error) {
    db.exec("ROLLBACK TO SAVEPOINT plan_write; RELEASE SAVEPOINT plan_write");
    throw error;
  }
}

export function listAssistants(db) {
  return db
    .prepare("SELECT id, name, kind, preset, instructions, codex_thread_id AS codexThreadId, chatgpt_url AS chatgptUrl, created_at AS createdAt, model, effort FROM assistants ORDER BY id")
    .all();
}

export function getAssistant(db, id) { return listAssistants(db).find((row) => row.id === Number(id)); }

export function saveAssistant(db, { name, instructions = "", model = null, effort = null, chatgptUrl = null }, id) {
  if (id) db.prepare("UPDATE assistants SET name = ?, instructions = ?, model = ?, effort = ?, chatgpt_url = ? WHERE id = ?").run(name, instructions, model, effort, chatgptUrl, id);
  else id = Number(db.prepare("INSERT INTO assistants (name, kind, instructions, chatgpt_url, created_at) VALUES (?, 'custom', ?, ?, ?)").run(name, instructions, chatgptUrl, new Date().toISOString()).lastInsertRowid);
  return getAssistant(db, id);
}

export function bindAssistantThread(db, id, threadId) {
  db.prepare("UPDATE assistants SET codex_thread_id = ? WHERE id = ? AND codex_thread_id IS NULL").run(threadId, id);
  return getAssistant(db, id);
}

export function assistantDirectory(db, id) {
  const file = db.prepare("PRAGMA database_list").all().find((row) => row.name === "main").file;
  return path.join(path.dirname(file), "assistants", String(id));
}

export function importAssistants(db, sessions) {
  db.exec("SAVEPOINT assistant_import");
  try {
    const result = sessions.map((session) => {
      const existing = listAssistants(db).find((row) => row.codexThreadId === session.threadId);
      if (existing) return existing;
      const id = Number(db.prepare("INSERT INTO assistants (name, kind, codex_thread_id, created_at) VALUES (?, 'imported', ?, ?)")
        .run(session.name, session.threadId, new Date().toISOString()).lastInsertRowid);
      return getAssistant(db, id);
    });
    db.exec("RELEASE SAVEPOINT assistant_import"); return result;
  } catch (error) { db.exec("ROLLBACK TO SAVEPOINT assistant_import; RELEASE SAVEPOINT assistant_import"); throw error; }
}

export function getSettings(db) {
  return Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, r.value]));
}

export function saveSetting(db, key, value) {
  if (key === "weekly_doc_url" && value === "") {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return { key, value };
  }
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").run(key, value);
  return { key, value };
}

export function materialImageDir(db) {
  const file = db.prepare("PRAGMA database_list").all().find((row) => row.name === "main").file;
  return path.join(path.dirname(file), "images");
}

export function listMaterialImages(db, materialId) {
  return db.prepare("SELECT id, file FROM material_images WHERE material_id = ? ORDER BY sort, id").all(materialId);
}

export function materialImageUrl(file) { return `/api/images/${encodeURIComponent(file)}`; }

function materialRow(db, row) {
  return row && { ...row, skus: JSON.parse(row.skus), images: listMaterialImages(db, row.id).map(({ id, file }) => ({ id, url: materialImageUrl(file) })) };
}

const materialColumns = "id, month, line, name, type, skus, note, created_at AS createdAt";

export function listMaterials(db, { month = "", line = "", type = "" } = {}) {
  return db.prepare(`SELECT ${materialColumns} FROM materials
    WHERE (? = '' OR month = ?) AND (? = '' OR line = ?) AND (? = '' OR type = ?)
    ORDER BY month DESC, id DESC`).all(month, month, line, line, type, type).map((row) => materialRow(db, row));
}

export function getMaterial(db, id) {
  return materialRow(db, db.prepare(`SELECT ${materialColumns} FROM materials WHERE id = ?`).get(id));
}

export function saveMaterial(db, value, id) {
  const args = [value.month, value.line, value.name, value.type, JSON.stringify(value.skus), value.note];
  if (id) db.prepare("UPDATE materials SET month = ?, line = ?, name = ?, type = ?, skus = ?, note = ? WHERE id = ?").run(...args, id);
  else id = Number(db.prepare("INSERT INTO materials (month, line, name, type, skus, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(...args, new Date().toISOString()).lastInsertRowid);
  return getMaterial(db, id);
}

export function addMaterialImage(db, materialId, file) {
  const id = Number(db.prepare(`INSERT INTO material_images (material_id, file, sort, created_at)
    VALUES (?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM material_images WHERE material_id = ?), ?)`)
    .run(materialId, file, materialId, new Date().toISOString()).lastInsertRowid);
  return { id, url: materialImageUrl(file) };
}

export function hasMaterialImageFile(db, file) {
  return !!db.prepare("SELECT 1 FROM material_images WHERE file = ?").get(file);
}

export function deleteMaterial(db, id, imageId, removeFiles) {
  db.exec("SAVEPOINT material_delete");
  try {
    if (imageId) db.prepare("DELETE FROM material_images WHERE material_id = ? AND id = ?").run(id, imageId);
    else db.prepare("DELETE FROM materials WHERE id = ?").run(id);
    removeFiles();
    db.exec("RELEASE SAVEPOINT material_delete");
  } catch (error) { db.exec("ROLLBACK TO SAVEPOINT material_delete; RELEASE SAVEPOINT material_delete"); throw error; }
}
