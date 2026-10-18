// 合成 Voice 快照（不是真实采集）：按场景生成 4 个话题，只用于核对趋势图标签避让。
import { writeFileSync } from "node:fs";
const [scenario, out] = process.argv.slice(2);
const now = new Date(); const pad = (n) => String(n).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dates = Array.from({ length: 7 }, (_, i) => day(new Date(now.getTime() - (6 - i) * 86400000)));
const S = {
  same: [["合成话题A", 50], ["合成话题B", 50], ["合成话题C", 50], ["合成话题D", 50]],
  near: [["合成近值一", 60], ["合成近值二", 59], ["合成近值三", 58], ["合成近值四", 20]],
  top: [["顶部一", 100], ["顶部二", 100], ["顶部三", 100], ["顶部四", 100]],
  bottom: [["底部一", 0], ["底部二", 0], ["底部三", 0], ["底部四", 0]],
  mixed: [["边界高", 100], ["中部甲", 50], ["中部乙", 50], ["边界低", 0]],
  long: [["澳洲八大研究生申请季材料清单与递交时间线讨论汇总", 72], ["英国G5硕士录取结果陆续发布后的选校与押金决策", 72], ["新加坡国立大学商科硕士面试经验分享", 71], ["短标题", 30]],
};
const rows = S[scenario]; if (!rows) throw new Error("未知场景");
const hot = rows.map(([title, last], k) => {
  const pids = Array.from({ length: 5 }, (_, i) => `syn-${k}-${i}`);
  return { id: `syn-${scenario}-${k}`, title, summary: "合成摘要", tags: ["合成"], kind: "Final", need: "", participantIds: pids, part: 5, heat: last, trend: "up",
    spark: [10, 20, 30, 40, 45, Math.max(0, last - 5), last], sparkDates: dates, sources: [["合成讨论原文", "合成来源"]],
    evidence: pids.map((participantId, i) => ({ participantId, url: `https://student-community.invalid/posts/${k}-${i}`, publishedAt: new Date(now.getTime() - 3600000).toISOString(), sourceType: "student-discussion" })) };
});
const value = { schemaVersion: 1, engine: { commit: "c8704e5313e6b051560365226b3919d7e0ada5ea", modelCallsEnabled: false, paidCollectorsEnabled: false, schedulesEnabled: false },
  checkedAt: now.toISOString(), checks: { paidRequests: 0, modelRequests: 0, sourceReads: { attempted: 3, successful: 3, complete: true, errors: [] } }, budget: { used: 0, limit: 10 },
  data: { updatedAt: `${day(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}`, nextAt: null, stats: { topics: hot.length, newTopics: 0, surge: 0, participants: 20, filtered: 0, sourceCount: 5, sources: "合成来源" }, hot, cloud: [], daily: "" } };
writeFileSync(out, JSON.stringify(value));
console.log(scenario, hot.map((h) => h.spark.at(-1)));
