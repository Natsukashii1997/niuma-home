// 一次性迁移：读取旧飞书多维表格（需本机 lark-cli 已登录），写入工作台数据库。可重复执行，按 月份+业务线+SKU 覆盖。
import { execFileSync } from "node:child_process";
import { openDb, savePromo } from "../server/db.mjs";
import { toPromo } from "../server/feishu-import.mjs";

const out = execFileSync("lark-cli", [
  "base", "+record-list", "--as", "user",
  "--base-token", "CChubg4AUal636sm8ogclfXznFb",
  "--table-id", "tblAZkja9adOAGVb",
  "--limit", "200", "--format", "json",
], { encoding: "utf8" });

const { data } = JSON.parse(out);
if (data.has_more) throw new Error("记录超过 200 行，需要分页读取");

const db = openDb();
for (const values of data.data) savePromo(db, toPromo(data.fields, values));
console.log(`已迁入 ${data.data.length} 行`);
