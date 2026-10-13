import { json, route, pending } from "../http.mjs";
import { getSettings } from "../db.mjs";

// 首页、日报周报、日历、配置
export function routes(db) {
  return [
    route("GET", "/api/calendar/today", pending("T06")),
    route("GET", "/api/reports", pending("T05")),
    route("GET", "/api/reports/:id", pending("T05")),
    route("GET", "/api/settings", (req, res) => json(res, 200, getSettings(db))),
    route("PUT", "/api/settings/:key", pending("T07")),
  ];
}
