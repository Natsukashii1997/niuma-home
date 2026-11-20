// 路由与响应的小工具。每个模块在 server/routes/ 下导出 routes(db) → route(...) 数组。

export function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

// 请求正文：最多 2MB（图片上传走 routes/materials.mjs 自己的流处理，不经这里）。写了 content-type 的必须是 application/json
// （浏览器跨站「简单请求」带的是 text/plain，这里拒掉；真正的防护在 checkOrigin）；curl、脚本、测试桩不带 content-type 的按 JSON 解析。
// 空正文（如不带参数的 POST …/sync）照旧返回 {}。
export const MAX_JSON_BYTES = 2 * 1024 * 1024;
const httpError = (status, message) => Object.assign(new Error(message), { status });
export async function readJson(req) {
  if (Number(req.headers?.["content-length"]) > MAX_JSON_BYTES) { req.resume(); throw httpError(413, "请求正文超过 2MB"); }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_JSON_BYTES) { req.resume(); throw httpError(413, "请求正文超过 2MB"); }
    chunks.push(c);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  const type = String(req.headers?.["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (type && type !== "application/json") throw httpError(415, "请求正文须为 application/json");
  return JSON.parse(text);
}

// 请求来源校验（全部 /api/ 路由都过，见 index.mjs）：只接受本机 Host；浏览器带 Origin 时必须等于页面同源
// （Vite 开发页代理保留页面 Host，所以 5281 的页面也能过）；chrome-extension:// 来源只在收藏接口和 ChatGPT 桥放行，
// 配对码由 kb-collect-pairing.mjs 自己核对。curl、脚本这类不带 Origin 的本机请求照旧放行。
// 返回 null 表示通过，否则返回拒绝原因。
const LOCAL_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
export function checkOrigin(req, { allowExtension = false } = {}) {
  const headers = req.headers || {};
  const { origin, host } = headers;
  if (typeof host !== "string" || !LOCAL_HOST.test(host)) return "Host 不是本机地址";
  if (origin === undefined) return null;
  if (typeof origin !== "string") return "Origin 无效";
  if (EXTENSION_ORIGIN.test(origin)) return allowExtension ? null : "浏览器扩展只能访问知识库收藏接口和 ChatGPT 桥";
  if (origin !== `http://${host}`) return "不是本机页面发出的请求";
  return null;
}

// 路径参数写成 :name，如 /api/plans/:month/:line
export function route(method, pattern, handler) {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)"))}$`);
  return { method, re, keys, handler };
}

export function match(routes, method, pathname) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = pathname.match(r.re);
    if (m) return { handler: r.handler, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

// 尚未实现的接口统一返回 501 + 派单编号。
export const pending = (task) => (req, res) => json(res, 501, { error: `未实现，见 docs/tasks/${task}.md`, task });

// 全部路由都没匹配上时怎么回：/api/v3/* 回 501（v3 页面先做界面、接口后补时的占位），其余回 404。
// 写在路由表外面，和注册顺序无关：以前是排在表尾的一组兜底路由，新模块注册在它后面就被它抢走（L-20、#73）。
const V3_FALLBACK_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export function unmatched(method, pathname) {
  if (V3_FALLBACK_METHODS.has(method) && /^\/api\/v3\/.+$/.test(pathname)) return pending("V3-接口清单");
  return (req, res) => json(res, 404, { error: "接口不存在" });
}
