// v3 示例数据：只在 /api/v3/* 接口返回 501（尚未实现）时显示，页面会标「示例」。
// 价格数据来自常浩 2026-10-16 提供的灵活学Lite 价格表；其余为演示用，不代表真实业务。
// 接口实现后，对应示例即可删除（见 docs/tasks/V3-接口清单.md）。已接真实接口的示例和兼容导出已在 V3 接线时删除；
// 剩下的是：价格与营收（用户确认暂用演示口径）、价格图与 NAS（暂缓接入）、brief 句式参考（演示句式，无真实来源）。

/* ---------- 首页 · 业务营收完成度（真实数据来自飞书多维表格，常浩后续提供；以下为演示值，大学一项取自 10-16 截图） ---------- */
export const SAMPLE_REVENUE = {
  period: "2026 年度",
  timePct: 0.79,
  updatedAt: "10-16 09:30",
  groups: [
    { label: "总计", items: [
      { key: "total", name: "总营收", current: 17356727, target: 29961834 },
      { key: "new", name: "总新签", current: 9800000, target: 17500000 },
      { key: "renew", name: "总续费", current: 7556727, target: 12461834 },
    ] },
    { label: "业务线", items: [
      { key: "uni", name: "大学辅导", current: 4656727, target: 12061834 },
      { key: "intl", name: "国课", current: 10650000, target: 15500000 },
      { key: "appeal", name: "申诉", current: 2050000, target: 2400000 },
    ] },
  ],
};

/* ---------- 营销 · 价格方案（灵活学Lite，原价 990 元/小时） ---------- */
export const SAMPLE_PRICE_SKUS = [
  { id: "uni-lite", line: "大学辅导", name: "灵活学Lite", unitOrig: 990, tiers: [5, 10, 20, 30, 50, 100, 150, 200] },
  { id: "intl-lite", line: "国际课程", name: "灵活学Lite", unitOrig: 990, tiers: [5, 10, 20, 30, 50, 100, 150, 200] },
];

export const SAMPLE_PRICE_SCHEMES = {
  sku: "uni-lite",
  floorMargin: 0.25, // 毛利底线与课时成本均为演示口径，真实值由常浩确定
  costPerHour: 440,
  schemes: [
    { id: "regular", name: "常规优惠版", kind: "常规", status: "生效中", from: "2026-07-01", to: "", prices: [4300, 8250, 15600, 22000, 34000, 64500, 93500, 118000], gifts: [0, 0, 0, 0, 0, 0, 0, 0] },
    { id: "d11", name: "双11底价", kind: "活动", status: "草稿", from: "2026-11-01", to: "2026-11-30", need: "澳洲 · 本科 · S2 Final", prices: [3990, 7800, 14850, 21100, 32750, 63500, 92500, 116000], gifts: [0, 0, 0, 0, 0, 0, 0, 0] },
    { id: "cny", name: "新春囤课价", kind: "活动", status: "历史", from: "2026-01-20", to: "2026-02-28", prices: [4088, 7988, 15088, 21488, 33188, 63988, 92988, 117888], gifts: [0, 0, 0, 0, 0, 0, 0, 0] },
    { id: "gift", name: "赠送课时价", kind: "赠课", status: "生效中", from: "2026-09-01", to: "", prices: [4300, 8900, 16500, 23600, 37400, 71500, 104000, 132000], gifts: [0, 1, 2, 3, 5, 10, 15, 20] },
  ],
};

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
