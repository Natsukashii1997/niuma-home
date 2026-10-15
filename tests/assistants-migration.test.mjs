import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { openDb, listAssistants } from "../server/db.mjs";

test("旧助手表重复打开只新增两列，原有记录和线程绑定不变", (t) => {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, "migration-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const old = new DatabaseSync(path.join(dir, "work-desk.db"));
  old.exec(`CREATE TABLE assistants (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('copywriter','imported','custom')),
    instructions TEXT NOT NULL DEFAULT '', codex_thread_id TEXT, created_at TEXT NOT NULL
  );
  INSERT INTO assistants VALUES (1,'原文案','copywriter','保留说明',NULL,'2026-10-01'),
    (2,'原导入','imported','','old-thread','2026-10-02'),
    (3,'原自建','custom','原始规则','custom-thread','2026-10-03');`);
  const before = old.prepare("SELECT * FROM assistants ORDER BY id").all();
  const oldColumns = old.prepare("PRAGMA table_info(assistants)").all();
  old.close();
  for (let i = 0; i < 2; i++) {
    const db = openDb(dir);
    try {
      const columns = db.prepare("PRAGMA table_info(assistants)").all();
      assert.deepEqual(columns.slice(0, 6), oldColumns);
      assert.deepEqual(columns.slice(6).map(({name,type,notnull,dflt_value}) => ({name,type,notnull,dflt_value})), [
        { name: "model", type: "TEXT", notnull: 0, dflt_value: null },
        { name: "effort", type: "TEXT", notnull: 0, dflt_value: null },
      ]);
      assert.deepEqual(db.prepare("SELECT id,name,kind,instructions,codex_thread_id,created_at FROM assistants ORDER BY id").all(), before);
      assert.ok(listAssistants(db).every((a) => a.model === null && a.effort === null));
    } finally { db.close(); }
  }
});
