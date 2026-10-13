// 路由与响应的小工具。每个模块在 server/routes/ 下导出 routes(db) → route(...) 数组。

export function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
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

// 尚未实现的接口统一返回 501 + 派单编号；前端据此显示示例数据。实现后替换掉即可。
export const pending = (task) => (req, res) => json(res, 501, { error: `未实现，见 docs/tasks/${task}.md`, task });
