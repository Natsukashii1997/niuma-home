import { pending } from "../http.mjs";

// v3 新页面的接口：UI 已完成，接口待实现（见 docs/tasks/V3-接口清单.md）。
// 未实现前统一返回 501，前端自动显示示例数据并标「示例」。实现某个接口时，在 marketing / workspace 等模块里注册具体路由即可，
// 具体路由先于这里的兜底匹配（index.mjs 中本模块排在最后）。
const any = (method) => ({ method, re: /^\/api\/v3\/.+$/, keys: [], handler: pending("V3-接口清单") });

export function routes() {
  return ["GET", "POST", "PUT", "PATCH", "DELETE"].map(any);
}
