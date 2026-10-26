// 培养路径页面几何测试用的样例：照 V2.4 模板生成路径，再按接口的推导（derivePath）算出状态，形状同 GET /api/v3/mentor/path 里一个人的 path。
// 两种状态：按期（入职 09-01，今天 D35，P1–P6 / T1–T5 已完成，和定稿 V11 稿子一样）；超期（入职 05-12，今天 10-26 = D115，一条记录都没有）。
import { derivePath, pathFromPlan } from "../../server/mentor-path.mjs";
import { workdays } from "../../server/workdays.mjs";

const at = "2026-10-01";
const complete = (ids) => Object.fromEntries(ids.map((id) => [id, { kind: "complete", at }]));
const passed = (pairs) => Object.fromEntries(pairs.map(([id, score]) => [id, { kind: "review", score, result: "pass", at }]));

export function onTrack() {
  const start = "2026-09-01", today = workdays(start, 35)[34];
  const records = { ...complete(["P2", "P3", "P4", "T1", "T2", "T3", "T4", "T5"]), ...passed([["P1", 82], ["P5", 76], ["P6", 74]]) };
  return { today, path: derivePath(pathFromPlan("v2.4", start), records, today) };
}

export function overdue() {
  const today = "2026-10-26";
  return { today, path: derivePath(pathFromPlan("v2.4", "2026-05-12"), {}, today) };
}
