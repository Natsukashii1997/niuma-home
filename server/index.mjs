import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openDb } from "./db.mjs";
import { json, match } from "./http.mjs";
import * as marketing from "./routes/marketing.mjs";
import * as assistants from "./routes/assistants.mjs";
import * as workspace from "./routes/workspace.mjs";
import * as v3 from "./routes/v3.mjs";

const port = Number(process.env.PORT || 5280);
const dist = path.resolve("dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const db = openDb();
const routes = [marketing, assistants, workspace, v3].flatMap((m) => m.routes(db));

// 带扩展名的路径按 dist 内文件返回，其余一律返回 index.html（前端路由）。
async function serveStatic(res, urlPath) {
  const asked = path.join(dist, path.normalize(urlPath));
  const file = asked.startsWith(dist + path.sep) && path.extname(asked) ? asked : path.join(dist, "index.html");
  const body = await readFile(file).catch(() => null);
  if (!body) return json(res, 404, { error: "文件不存在；首次运行请先 npm run build" });
  res.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8` });
  res.end(body);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return serveStatic(res, url.pathname);
  const found = match(routes, req.method, url.pathname);
  if (!found) return json(res, 404, { error: "接口不存在" });
  try {
    await found.handler(req, res, { params: found.params, url });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: e.message });
  }
}).listen(port, "127.0.0.1", () => console.log(`工作台 http://127.0.0.1:${port}`));
