// v3 示例数据：只在 /api/v3/* 接口返回 501（尚未实现）时显示，页面会标「示例」。
// 接口实现后，对应示例即可删除（见 docs/tasks/V3-接口清单.md）。已接真实接口的示例和兼容导出已在 V3 接线时删除；
// 剩下的是：价格图与 NAS（暂缓接入）、brief 句式参考（演示句式，无真实来源）。价格与营收的演示口径由后端返回（origin: "demo"），页面照样标「示例」。

// SKU 档案 · 价格图版本：每个月这个 SKU 用的是哪一版价格图（NAS 按「月份 / 类型」整理，不分 SKU，对应关系由接口给出）
export const SAMPLE_PRICE_CHARTS = {
  line: "大学辅导",
  sku: "灵活学Lite",
  versions: [
    { month: "2026-08", state: "file", version: 2, big: "4300", path: "2026-08/产品物料/价格图/价格图-v2.jpg" },
    { month: "2026-09", state: "file", version: 2, big: "4300", path: "2026-09/产品物料/价格图/价格图-v2.jpg" },
    { month: "2026-10", state: "file", version: 3, big: "4300", path: "2026-10/产品物料/价格图/价格图-v3.jpg" },
    { month: "2026-11", state: "pending", note: "战役版 · brief 4.1" },
  ],
};

/* ---------- 营销 · 物料（NAS） ---------- */
export const SAMPLE_NAS = {
  root: "/Volumes/营销物料",
  reachable: true,
  network: "内网",
  lastScanAt: "2026-10-16 09:12",
  thumbBytes: 38 * 1024 * 1024,
  months: ["2026-08", "2026-09", "2026-10", "2026-11"],
  types: [
    { key: "价格图", fixed: true }, { key: "试听海报", fixed: true }, { key: "选课海报", fixed: true }, { key: "活动海报", fixed: false },
  ],
  cells: {
    "2026-08|价格图": { state: "file", version: 2, big: "4300", path: "2026-08/产品物料/价格图/价格图-v2.jpg" },
    "2026-08|试听海报": { state: "file", version: 1, path: "2026-08/产品物料/试听海报/试听-v1.jpg" },
    "2026-08|选课海报": { state: "file", version: 1, path: "2026-08/产品物料/选课海报/选课-v1.jpg" },
    "2026-09|价格图": { state: "file", version: 2, big: "4300", path: "2026-09/产品物料/价格图/价格图-v2.jpg" },
    "2026-09|试听海报": { state: "reuse", from: "2026-08" },
    "2026-09|选课海报": { state: "file", version: 2, path: "2026-09/产品物料/选课海报/选课-v2.jpg" },
    "2026-09|活动海报": { state: "file", version: 1, big: "开学季", path: "2026-09/产品物料/活动海报/开学季-v1.jpg" },
    "2026-10|价格图": { state: "file", version: 3, big: "4300", path: "2026-10/产品物料/价格图/价格图-v3.jpg" },
    "2026-10|试听海报": { state: "reuse", from: "2026-08" },
    "2026-10|选课海报": { state: "reuse", from: "2026-09" },
    "2026-10|活动海报": { state: "file", version: 2, big: "11.11", accent: true, path: "2026-10/产品物料/活动海报/双11预热-v2.jpg" },
    "2026-11|价格图": { state: "pending", note: "战役版 · brief 4.1" },
    "2026-11|试听海报": { state: "reuse", from: "2026-08" },
    "2026-11|选课海报": { state: "skip" },
    "2026-11|活动海报": { state: "pending", note: "战役版 · brief 4.2" },
  },
  marketing: [
    { month: "2026-11", scene: "双11 · 冲分节预热", kind: "九宫格", count: 9, state: "制作中" },
    { month: "2026-11", scene: "双11 · 折扣九宫格", kind: "九宫格", count: 0, state: "待写 brief" },
    { month: "2026-10", scene: "期中周 · 学员案例", kind: "三宫格", count: 3, state: "已交付" },
    { month: "2026-10", scene: "国庆 · 留学生活", kind: "九宫格", count: 9, state: "已交付" },
    { month: "2026-09", scene: "开学季 · 新生须知", kind: "九宫格", count: 9, state: "已交付" },
    { month: "2026-09", scene: "选课季 · 避坑指南", kind: "三宫格", count: 3, state: "已交付" },
  ],
};

/* ---------- 营销 · 设计 brief 句式参考（演示句式，没有真实来源；页面标「示例」） ---------- */
export const SAMPLE_PHRASES = [
  ["标题", "「还剩 3 周，够把一门课拉回来」"],
  ["价格表述", "「3,990 元 5 小时，课时单价不到 800」"],
  ["赠课表述", "「10 小时送 1 小时，送的是课时不是折扣」"],
  ["紧迫感", "「11.30 截止，名额按排课余量放」"],
  ["行动号召", "「扫码，先排一次考试日程」"],
];
