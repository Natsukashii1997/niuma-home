// T09 隔离验收入口：真实路由 + 临时库 + 明确的外部响应替身，无外部连接。
import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync, crc32 } from "node:zlib";
import { openDb } from "../../../server/db.mjs";
import { json, match } from "../../../server/http.mjs";
import * as marketing from "../../../server/routes/marketing.mjs";
import * as assistants from "../../../server/routes/assistants.mjs";
import * as workspace from "../../../server/routes/workspace.mjs";
import { fakeAppServer } from "../../../tests/helpers/fake-app-server.mjs";

const root = path.resolve(import.meta.dirname, "../../..");
const dataDir = process.env.WORKDESK_DATA_DIR;
if (!dataDir?.startsWith("/tmp/workdesk-t09-") || root !== process.cwd()) throw new Error("必须在 T09 工作树和专用临时库运行");
const db = openDb(dataDir), cleanups = [];
// 可重复生成的合法灰度 PNG，仅作上传验收素材。
for (const [name, size] of [["upload-large.png", 512], ["upload-small.png", 128]]) {
  let seed = size;
  const raw = Buffer.alloc(size * (size + 1));
  for (let y = 0; y < size; y++) for (let x = 1; x <= size; x++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    raw[y * (size + 1) + x] = 35 + ((seed >>> 16) % 175);
  }
  const chunk = (kind, data) => {
    const body = Buffer.concat([Buffer.from(kind), data]), length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8;
  await writeFile(path.join(dataDir, name), Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
const fake = fakeAppServer({ after: fn => cleanups.push(fn) });
const history = [], events = [];
fake.controls.holdTurn = true;
fake.controls.handle = (request, finish) => {
  if (request.method === "thread/items/list") { finish({ data: history, nextCursor: null }); return false; }
  if (request.method === "turn/start") {
    const threadId = request.params.threadId, input = request.params.input[0].text;
    const long = input.includes("长段");
    const text = long ? "长段隔离验证：逐字展开仍应跟随到最新内容。\n".repeat(90) : "这是 T09 隔离验收回复，共 3 项检查，已完成 100%。模型响应为测试替身，用于核对流式展示和历史回读。";
    const itemId = `reply-${history.length}`;
    events.push({ type: "turn/start", params: request.params });
    setTimeout(() => {
      let offset = 0;
      const timer = setInterval(() => {
        const delta = text.slice(offset, offset + (long ? text.length : 2)); offset += long ? text.length : 2;
        fake.client.receive({ method: "item/agentMessage/delta", params: { threadId, turnId: "turn", itemId, delta } });
        if (offset >= text.length) {
          clearInterval(timer);
          history.push({ item: { type: "userMessage", content: [{ type: "text", text: input }] } }, { item: { type: "agentMessage", text } });
          if (long) setTimeout(() => fake.controls.complete(), 8000);
          else fake.controls.complete();
        }
      }, 120);
    }, 1600);
  }
};
const config = db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)");
config.run("brand_base_url", "https://team.feishu.cn/base/T09Preview");
config.run("report_doc_url", "https://team.feishu.cn/docx/Daily");
config.run("weekly_doc_url", "https://team.feishu.cn/docx/Weekly");
config.run("material_types", JSON.stringify(["海报", "朋友圈图"]));
const insert = db.prepare("INSERT OR REPLACE INTO promos (month,line,sku,trial,price,new_deal,renewal,updated_at) VALUES (?,?,?,?,?,?,?,?)");
for (const month of ["2026-08", "2026-09", "2026-10"]) for (const [i, line] of ["大学辅导", "国际课程", "申诉服务"].entries()) {
  insert.run(month, line, `验收方案 ${i + 1}`, "试听课", month === "2026-08" ? "原活动说明" : "本期活动说明", "新签权益", "续费权益", new Date().toISOString());
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const routes = [
  ...marketing.routes(db), ...assistants.routes(db, fake.client),
  ...workspace.routes(db, { readDocument: async url => {
    await delay(1400);
    if (url.includes("Failure")) throw Object.assign(new Error("隔离故障注入：周报无读取权限"), { status: 403 });
    return readFile(path.join(root, "fixtures", url.includes("Daily") ? "reports-real-redacted.md" : "weekly-real-redacted.md"), "utf8");
  } }, { readAgenda: async () => [{ time: "10:00–10:30", title: "隔离验收示例日程", place: "本地演示" }] }),
];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname === "/__evidence") return json(res, 200, { events, dataDir, externalCalls: 0 });
  if (!url.pathname.startsWith("/api/")) {
    const target = path.extname(url.pathname) ? path.join(root, "dist", url.pathname) : path.join(root, "dist/index.html");
    if (!target.startsWith(path.join(root, "dist/"))) return json(res, 404, {});
    const body = await readFile(target).catch(() => null);
    if (!body) return json(res, 404, {});
    const type = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2" }[path.extname(target)] || "application/octet-stream";
    res.writeHead(200, { "content-type": type }); return res.end(body);
  }
  const found = match(routes, req.method, url.pathname);
  if (!found) return json(res, 404, { error: "接口不存在" });
  try {
    if (req.method === "POST" && url.pathname === "/api/plans/parse") await delay(800);
    if (req.method === "PUT" && url.pathname.startsWith("/api/plans/")) await delay(800);
    await found.handler(req, res, { params: found.params, url });
  } catch (error) { json(res, 500, { error: error.message }); }
});
server.listen(5293, "127.0.0.1", () => console.log(JSON.stringify({ url: "http://127.0.0.1:5293", dataDir, root })));
process.on("SIGTERM", async () => {
  await writeFile(path.join(dataDir, "protocol-evidence.json"), JSON.stringify({ events, externalCalls: 0 }, null, 2));
  cleanups.forEach(fn => fn()); server.close(); db.close();
});
