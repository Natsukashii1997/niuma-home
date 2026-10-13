import { DatabaseSync } from "node:sqlite";
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
    UNIQUE (month, line, sku)
  );

  -- 方案原文：每个 月份×业务线 一份，原样保存
  CREATE TABLE IF NOT EXISTS plans (
    month TEXT NOT NULL,
    line TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    raw_html TEXT,
    saved_at TEXT NOT NULL,
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
    created_at TEXT NOT NULL
  );

  -- 简单配置：品牌表链接、日报文档链接、物料类型清单等
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export function openDb(dir = dataDir) {
  mkdirSync(path.join(dir, "images"), { recursive: true });
  const db = new DatabaseSync(path.join(dir, "work-desk.db"));
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  seed(db);
  return db;
}

// 只补缺，不覆盖本人已改的内容。
function seed(db) {
  const now = new Date().toISOString();
  db.prepare("INSERT OR IGNORE INTO sku_aliases (line, alias, sku) VALUES (?, ?, ?)").run("国际课程", "课时卡", "灵活学Lite");
  if (!db.prepare("SELECT 1 FROM assistants WHERE kind = 'copywriter'").get()) {
    db.prepare("INSERT INTO assistants (name, kind, created_at) VALUES (?, 'copywriter', ?)").run("文案助手", now);
  }
}

export function savePromo(db, p) {
  db.prepare(`
    INSERT INTO promos (month, line, sku, trial, price, new_deal, renewal, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (month, line, sku) DO UPDATE SET
      trial = excluded.trial, price = excluded.price, new_deal = excluded.new_deal,
      renewal = excluded.renewal, updated_at = excluded.updated_at
  `).run(p.month, p.line, p.sku, p.trial, p.price, p.newDeal, p.renewal, new Date().toISOString());
}

export function listPromos(db) {
  return db
    .prepare(`
      SELECT month, line, sku, trial, price, new_deal AS newDeal, renewal, updated_at AS updatedAt
      FROM promos ORDER BY month DESC, line, id
    `)
    .all();
}

export function listPlans(db) {
  return db.prepare("SELECT month, line, saved_at AS savedAt FROM plans ORDER BY month DESC, line").all();
}

export function getPlan(db, month, line) {
  return db
    .prepare("SELECT month, line, raw_text AS rawText, raw_html AS rawHtml, saved_at AS savedAt FROM plans WHERE month = ? AND line = ?")
    .get(month, line);
}

export function listAssistants(db) {
  return db
    .prepare("SELECT id, name, kind, instructions, codex_thread_id AS codexThreadId, created_at AS createdAt FROM assistants ORDER BY id")
    .all();
}

export function getSettings(db) {
  return Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, r.value]));
}
