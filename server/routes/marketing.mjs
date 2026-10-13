import { json, route, pending } from "../http.mjs";
import { listPromos, listPlans, getPlan } from "../db.mjs";

export function routes(db) {
  return [
    // 促销表
    route("GET", "/api/promos", (req, res) => json(res, 200, listPromos(db))),

    // 方案原文
    route("GET", "/api/plans", (req, res) => json(res, 200, listPlans(db))),
    route("GET", "/api/plans/:month/:line", (req, res, { params }) => {
      const plan = getPlan(db, params.month, params.line);
      return plan ? json(res, 200, plan) : json(res, 404, { error: "该月该业务线还没有方案原文" });
    }),
    route("POST", "/api/plans/parse", pending("T01")),
    route("PUT", "/api/plans/:month/:line", pending("T01")),

    // 物料
    route("GET", "/api/materials", pending("T03")),
    route("POST", "/api/materials", pending("T03")),
    route("PATCH", "/api/materials/:id", pending("T03")),
    route("DELETE", "/api/materials/:id", pending("T03")),
    route("POST", "/api/materials/:id/images", pending("T03")),
    route("DELETE", "/api/materials/:id/images/:imageId", pending("T03")),
    route("GET", "/api/images/:file", pending("T03")),
  ];
}
