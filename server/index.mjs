import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { openDb } from "./db.mjs";
import { checkOrigin, json, match } from "./http.mjs";
import { createCodexPush } from "./codex-push.mjs";
import * as marketing from "./routes/marketing.mjs";
import * as assistants from "./routes/assistants.mjs";
import * as workspace from "./routes/workspace.mjs";
import * as v3 from "./routes/v3.mjs";
import * as internalVoice from "./routes/internal-voice.mjs";
import { internalVoiceFor } from "./internal-voice.mjs";

const port = Number(process.env.PORT || 5280);
const dist = path.resolve("dist");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const db = openDb();
// v3 末尾有兜底 /api/v3/*（返回 501 未实现），必须排在最后，否则后面的模块都走不到（#50 发布后发现）
const routes = [marketing, assistants, workspace, internalVoice, v3].flatMap((m) => m.routes(db));
// 猛鬼兽推送 Codex 重置：每 10 分钟看一眼开关，开着且满 4 小时才去检查；关着什么都不做。
const codexPush = createCodexPush(db);
const pushTick = () => codexPush.tick().catch((error) => console.error("Codex 推送检查失败", error));
setTimeout(pushTick, 5_000).unref();
setInterval(pushTick, 600_000).unref();
// 内部原声自动拉取：每小时看一眼开关，开着且上一周 / 上个月还没拉过才拉；关着什么都不做。
const voiceTick = () => internalVoiceFor(db).tick();
setTimeout(voiceTick, 60_000).unref();
setInterval(voiceTick, 3_600_000).unref();

// 带扩展名的路径按 dist 内文件返回，其余一律返回 index.html（前端路由）。
async function serveStatic(res, urlPath) {
  const asked = path.join(dist, path.normalize(urlPath));
  const file = asked.startsWith(dist + path.sep) && path.extname(asked) ? asked : path.join(dist, "index.html");
  const body = await readFile(file).catch(() => null);
  if (!body) return json(res, 404, { error: "文件不存在；首次运行请先 npm run build" });
  // 首页不落盘：Safari 网页应用恢复窗口会直接用磁盘里的旧首页，发布后旧哈希资源已不在，打开即黑屏。
  const cache = file === path.join(dist, "index.html") ? { "cache-control": "no-store" } : {};
  res.writeHead(200, { "content-type": `${types[path.extname(file)] || "application/octet-stream"}; charset=utf-8`, ...cache });
  res.end(body);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return serveStatic(res, url.pathname);
  // 跨站防护：所有接口先核对来源（见 http.mjs checkOrigin）；收藏接口与 ChatGPT 桥另放行带配对码的扩展。
  const rejected = checkOrigin(req, { allowExtension: url.pathname.startsWith("/api/v3/kb/collect") || url.pathname.startsWith("/api/v3/chatgpt-bridge/") });
  if (rejected) { req.resume(); return json(res, 403, { error: `请求来源校验未通过：${rejected}`, code: "ORIGIN_REJECTED" }); }
  const found = match(routes, req.method, url.pathname);
  if (!found) return json(res, 404, { error: "接口不存在" });
  try {
    await found.handler(req, res, { params: found.params, url });
  } catch (e) {
    console.error(e);
    // 带 status 的是预期内的拒绝（如 413 / 415），原样回；其余只给固定文案，细节留在服务日志里。
    if (e.status) json(res, e.status, { error: e.message, ...(e.code && { code: e.code }) });
    else json(res, 500, { error: "服务内部错误，详情见服务日志", code: "INTERNAL" });
  }
}).listen(port, "127.0.0.1", () => console.log(`工作台 http://127.0.0.1:${port}`));
