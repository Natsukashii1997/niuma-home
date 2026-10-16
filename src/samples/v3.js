// v3 示例数据：只在 /api/v3/* 接口返回 501（尚未实现）时显示，页面会标「示例」。
// 价格数据来自常浩 2026-10-16 提供的灵活学Lite 价格表；其余为演示用，不代表真实业务。
// 接口实现后，对应示例即可删除（见 docs/tasks/V3-接口清单.md）。

/* ---------- 首页 · 交付月 ---------- */
// V3-1 已移除演示内容。静态 import/加载 fallback 由 Claude 清理后删除此兼容导出。
export const SAMPLE_MONTH = { steps: [] };

export const SAMPLE_TODO = [
  { kind: "审核", text: "双11 冲分节 · 策略 / 节奏 / 清单定稿", due: "10-17", href: "#/marketing/campaign", urgent: true },
  { kind: "价格", text: "灵活学Lite 双11底价 · 200h 低于毛利底线，需填原因", due: "", href: "#/marketing/prices", urgent: true },
  { kind: "时间线", text: "3 条异常待确认（UKM 日期冲突等）", due: "", href: "#/user/timeline/anomalies" },
  { kind: "需求", text: "2 条主线需求草稿待采纳（美国选课、港校考试周）", due: "", href: "#/user/strategy" },
  { kind: "项目", text: "W3 调研问卷 · 胡贵兰 · 2 天内到期", due: "10-18", href: "#/projects" },
];

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

// V3-1 已移除演示内容。静态 import/加载 fallback 由 Claude 清理后删除此兼容导出。
export const SAMPLE_CODEX = undefined;

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

/* ---------- 营销 · 设计参考 ---------- */
export const SAMPLE_REFS = {
  zones: [
    { name: "价格 / 活动海报", x: 16, y: 16, w: 440, h: 620 },
    { name: "朋友圈宫格版式", x: 480, y: 16, w: 520, h: 620 },
    { name: "长图与信息排布", x: 1024, y: 16, w: 380, h: 620 },
  ],
  items: [
    { id: "r1", x: 40, y: 60, w: 168, kind: "poster", big: "¥3999", title: "数字做主角", tags: ["价格图", "大数字"], source: "小红书收藏 · 10-12" },
    { id: "r2", x: 232, y: 96, w: 156, kind: "poster", big: "11.11", accent: true, title: "斜切角标", tags: ["活动海报", "角标"], source: "小红书收藏 · 10-09" },
    { id: "r3", x: 232, y: 400, w: 156, kind: "poster", title: "留白 + 单行标题", tags: ["试听海报", "留白"], source: "截图 · 10-03" },
    { id: "r4", x: 504, y: 60, w: 220, kind: "grid9", big: "冲分", accent: true, title: "中心格大字", tags: ["九宫格", "大数字"], source: "小红书收藏 · 10-12" },
    { id: "r5", x: 752, y: 120, w: 210, kind: "grid9", title: "棋盘交替", tags: ["九宫格", "节奏"], source: "截图 · 09-28" },
    { id: "r6", x: 520, y: 400, w: 260, kind: "grid3", title: "左大图右文字", tags: ["三宫格", "版式"], source: "截图 · 09-20" },
    { id: "r7", x: 1048, y: 60, w: 150, kind: "long", title: "案例长图分段", tags: ["长图", "案例"], source: "小红书收藏 · 09-15" },
    { id: "r8", x: 1224, y: 140, w: 150, kind: "poster", title: "课表式信息排布", tags: ["选课海报", "表格"], source: "截图 · 09-11" },
  ],
};

/* ---------- 营销 · 设计 brief（骨架来自《双11 第二批设计 Brief》7 节） ---------- */
export const SAMPLE_BRIEF = {
  month: "2026-11",
  title: "大学辅导 11 月私信海报与朋友圈营销海报 设计 Brief",
  version: "v0.3",
  editedAt: "10-16 11:02",
  background: {
    from: "主线需求",
    text: "11 月澳洲 10 所学校进入 S2 期末周（11.02 起），英国第一轮 Essay 集中提交，美国春季选课窗口开放。学生此刻最需要的是「把剩下两三周用在刀刃上」。本批物料从需求唤起、产品理解、案例证明到行动决策，承接双11 冲分节。",
    goals: ["私信场景让业务一张图讲清 11 月价格与赠课", "朋友圈用九宫格唤起「期末冲刺」情绪", "物料统一「冲分节」视觉，区别于常规月份"],
  },
  audience: [
    ["价格图", "澳洲 · 本科（S2 Final）", "复习材料多、时间碎；需要列考试日程、排冲刺计划"],
    ["冲分节九宫格", "澳洲、英国本科", "期末与 Essay 同时压身；想知道「现在补还来得及吗」"],
  ],
  timeline: [["价格图", "10-24", "P0", "林瑶", "私信承接，先出"], ["冲分节九宫格", "10-28", "P1", "林瑶", "11-01 朋友圈首发"]],
  items: [
    { id: "b1", kind: "price", title: "4.1 价格图", priceFrom: "价格 · 双11底价 · 灵活学Lite",
      blocks: [["顶栏", "路觅 Logo · 双11 冲分节角标", "角标右上，橙色只用在角标"], ["价格区 · 50%", "3,990 元 / 5 小时 · 7,800 元 / 10 小时", "价格单独突出；赠课写清是「送课时」不是降价"], ["信息区 · 30%", "适合 S2 期末冲刺 · 课时单价 780 元起 · 11.01–11.30", "课时单价用小字"], ["底栏 · 20%", "slogan + 二维码承接", "固定元素"]],
      refs: [{ kind: "poster", big: "¥3999", title: "数字做主角" }, { kind: "poster", big: "11.11", title: "斜切角标", accent: true }], reuse: { month: "2026-10", title: "价格图 v3", big: "4300" } },
    { id: "b2", kind: "grid9", title: "4.2 冲分节九宫格",
      cells: ["「期末还剩 3 周」", "考试日程倒计时", "薄弱科目自测", "冲分节主视觉：大字「冲分」，橙色只用在「分」", "", "", "学员案例：UQ 从 58 到 76", "价格与赠课", ""],
      refs: [{ kind: "grid9", big: "冲分", title: "中心格大字", accent: true }, { kind: "grid9", title: "棋盘交替" }], reuse: null },
    { id: "b3", kind: "skip", title: "4.3 选课海报", note: "按战役决定：本月不出" },
  ],
  specs: [["价格图", "9:16", "1080 × 1920", "JPG"], ["冲分节九宫格", "1:1", "1080 × 1080", "9 张独立图 + 1 张预览图"]],
  owners: [["需求对接", "常浩", ""], ["内容确认", "常浩", "待确认"], ["设计对接", "林瑶", ""]],
  status: { 1: "done", 2: "done", 3: "done", 4: "part", 5: "done", 6: "part", 7: "todo" },
};

export const SAMPLE_PHRASES = [
  ["标题", "「还剩 3 周，够把一门课拉回来」"],
  ["价格表述", "「3,990 元 5 小时，课时单价不到 800」"],
  ["赠课表述", "「10 小时送 1 小时，送的是课时不是折扣」"],
  ["紧迫感", "「11.30 截止，名额按排课余量放」"],
  ["行动号召", "「扫码，先排一次考试日程」"],
];

/* ---------- 营销 · 营销战役（节点来自多维表格「项目启动模版 / 营销战役」） ---------- */
export const SAMPLE_CAMPAIGN = {
  id: 1, name: "双11 冲分节", start: "2026-10-01", end: "2026-11-30", months: ["2026-10", "2026-11"],
  desc: "10、11 月的促销方案和物料归入战役",
  phases: [
    { name: "启动", nodes: [{ n: 10, t: "战役立项与目标设定", owner: "常浩", done: true, due: "10-02" }, { n: 20, t: "历史资产与资源盘点", owner: "林瑶", done: true, due: "10-05" }, { n: 30, t: "立项定义审核", gate: true, owner: "常浩", done: true, due: "10-08" }] },
    { name: "计划", nodes: [{ n: 40, t: "战役策略与方案设计", owner: "常浩", done: true, due: "10-12", kids: [["核心策略制定", true], ["促销方案设计", true], ["营销节奏与排期规划", true], ["战役主题确认", true], ["物料需求清单拆解", false]] }, { n: 100, t: "策略 / 节奏 / 清单定稿", gate: true, milestone: true, owner: "常浩", due: "10-17" }] },
    { name: "实施", nodes: [{ n: 110, t: "内容规划与生产管理", owner: "林瑶", due: "10-24", kids: [["内容策划与文案产出", false], ["视觉物料设计与制作", false]] }, { n: 140, t: "生产进度与质量验收", gate: true, owner: "常浩", due: "10-24" }] },
    { name: "收尾", nodes: [{ n: 150, t: "复盘总结与知识沉淀", milestone: true, owner: "常浩", due: "", kids: [["组织复盘会议", false], ["资产归档与知识沉淀", false]] }] },
  ],
  routine: [["价格图", "campaign"], ["试听海报", "reuse"], ["选课海报", "skip"], ["活动海报", "campaign"]],
};

/* ---------- Agent · 文案助手知识库 ---------- */
export const SAMPLE_KNOWLEDGE = {
  limit: 30000,
  docs: [
    { kind: "句式", title: "标题句式 · 冲刺类", chars: 1240, at: "10-12" },
    { kind: "句式", title: "价格表述 · 赠课写法", chars: 860, at: "10-12" },
    { kind: "范文", title: "2025 双11 私信海报文案", chars: 2310, at: "10-10" },
    { kind: "brief 范本", title: "双11 第二批设计 Brief", chars: 6420, at: "10-09" },
    { kind: "范文", title: "选课季九宫格 9 格文案", chars: 1980, at: "09-28" },
    { kind: "句式", title: "行动号召 20 条", chars: 640, at: "09-20" },
  ],
};

/* ---------- 用户 · 时间线（示例：结构与飞书《2026海外大学时间线》地区明细表一致，日期为演示值） ---------- */
// V3-1 已移除演示内容。静态 import/加载 fallback 由 Claude 清理后删除此兼容导出。
export const SAMPLE_TIMELINE = undefined;

/* ---------- 用户 · 主线需求 ---------- */
// V3-1 已移除演示内容。静态 import/加载 fallback 由 Claude 清理后删除此兼容导出。
export const SAMPLE_NEEDS = undefined;

/* ---------- 用户 · 留学之声（基于 AIHOT 引擎；信源为免费英文信源） ---------- */
export const SAMPLE_VOICE = {
  updatedAt: "10:12",
  nextAt: "10:42",
  stats: { topics: 18, newTopics: 5, surge: 1, participants: 214, filtered: 37, sourceCount: 23, sources: "Reddit 15 · 官网 8" },
  budget: { used: 3.42, limit: 10 },
  hot: [
    { id: "v1", title: "澳洲多校 S2 期末周提前，复习时间被压缩", heat: 86.4, part: 23, trend: "surge", spark: [8, 12, 15, 22, 41, 63, 86], tags: ["澳洲", "UQ", "USYD"], kind: "Final",
      summary: "多所学校公布的期末时间比往年早约 1 周，讨论集中在「复习时间不够」「先补哪门」。个别课程改考核方式的个案已过滤。",
      sources: [["Finals moved up a week?? anyone else panicking", "r/UQreddit · 142 赞 · 10-15"], ["Study plan for 3 finals in 5 days", "r/usyd · 88 赞 · 10-15"], ["S2 2026 Examination timetable released", "官网校历 · UniMelb · 10-14"]], need: "澳洲 · 本科 · S2 Final（已采纳）" },
    { id: "v2", title: "UCLA / UCB 春季选课窗口开放，热门课秒满", heat: 71.2, part: 18, trend: "rising", spark: [3, 4, 6, 9, 20, 44, 71], tags: ["美国", "UCLA", "UCB"], kind: "选课",
      summary: "选课窗口开放首日，候补和换课的帖子集中出现，主要问题是热门课抢不到、先修课冲突。", sources: [["Waitlisted for every CS class", "r/ucla · 64 赞 · 10-15"], ["Enrollment phase 1 tips?", "r/berkeley · 51 赞 · 10-14"]], need: "美国 · 本科 · 春季选课（草稿）" },
    { id: "v3", title: "英国第一轮 Essay 反馈：引用格式扣分集中", heat: 58.9, part: 14, trend: "up", spark: [10, 14, 18, 22, 30, 45, 59], tags: ["英国", "Manchester"], kind: "Essay",
      summary: "首轮 Essay 反馈陆续发回，扣分点集中在引用格式和论证结构。", sources: [["Lost 8 marks for Harvard referencing", "r/UniUK · 77 赞 · 10-14"]], need: "英国 · 本科 · 第一轮 Essay（已采纳）" },
    { id: "v4", title: "港校考试周与 Reading Week 重叠，连考三门", heat: 44.0, part: 9, trend: "up", spark: [5, 6, 8, 12, 20, 31, 44], tags: ["香港", "HKU", "CUHK"], kind: "考试周", summary: "考试时间表公布后，连考的讨论升温。", sources: [["3 exams in 2 days at HKU", "r/HongKong · 39 赞 · 10-15"]], need: "" },
    { id: "v5", title: "UBC 春季课程冲突，候补名单过长", heat: 31.7, part: 7, trend: "flat", spark: [28, 30, 31, 29, 30, 32, 31], tags: ["加拿大", "UBC"], kind: "选课", summary: "候补名单长，换课讨论平稳。", sources: [["Waitlist #84, any hope?", "r/UBC · 22 赞 · 10-13"]], need: "" },
    { id: "v6", title: "新国立期末前学习空间预约紧张", heat: 22.5, part: 5, trend: "down", spark: [30, 28, 27, 25, 24, 23, 22], tags: ["新加坡", "NUS"], kind: "Final", summary: "热度回落。", sources: [["Library seats gone by 8am", "r/nus · 18 赞 · 10-12"]], need: "" },
  ],
  // 词云：[词, 热度 0–100, 走势]；走势 surge 急升 / up 上升 / flat 平稳 / down 回落。
  cloud: [
    ["期末提前", 92, "surge"], ["选课", 78, "up"], ["复习时间", 70, "surge"], ["引用格式", 61, "up"], ["候补名单", 55, "up"],
    ["连考", 48, "up"], ["Essay 反馈", 46, "flat"], ["考试周", 44, "up"], ["热门课满员", 40, "up"], ["论证结构", 34, "flat"],
    ["先修课冲突", 30, "flat"], ["Reading Week", 28, "flat"], ["图书馆座位", 22, "down"], ["挂科补考", 20, "flat"], ["小组作业", 18, "flat"],
    ["Turnitin", 16, "down"], ["导师约不到", 15, "flat"], ["GPA", 14, "flat"],
  ],
  daily: "澳洲 S2 期末周提前的讨论在 23 个独立来源中出现，比昨天多 9 个；UCLA 选课窗口开放首日，热门课候补帖集中出现；英国 Essay 首轮反馈的扣分点集中在引用格式与论证结构；港校考试时间表陆续公布，连考话题升温。",
};

/* ---------- 项目 · 推进（节点来自多维表格「项目启动模版 / 项目推进」） ---------- */
export const SAMPLE_PROJECTS = [
  { id: "t2", name: "T2 选课工具", template: "项目推进", status: "调研中", phase: 2,
    phases: ["启动", "计划", "调研", "实施", "收尾"],
    nodes: [
      { ph: "启动", t: "项目定义", owner: "林瑶", done: true, due: "07-20" }, { ph: "启动", t: "问题树拆解", owner: "胡贵兰", done: true, due: "07-22" },
      { ph: "启动", t: "立项定义审核", owner: "常浩", gate: true, done: true, due: "07-22" },
      { ph: "计划", t: "WBS 任务拆解", owner: "胡贵兰", done: true, due: "09-30", kids: [["W1 访谈提纲", true], ["W2 销售端访谈", true], ["W3 调研问卷", false], ["W4 字段设计", false], ["W5 原型", false], ["W6 评审", false]] },
      { ph: "计划", t: "方案审核定稿", owner: "常浩", gate: true, due: "10-28" },
      { ph: "调研", t: "多线调研执行", owner: "胡贵兰", due: "10-18", kids: [["导师端", false], ["销售端", true], ["教务", false]] },
      { ph: "调研", t: "调研结论审核", owner: "常浩", gate: true, due: "" },
      { ph: "实施", t: "产品方案设计", owner: "胡贵兰", due: "" }, { ph: "实施", t: "设计对接与交付", owner: "林瑶", due: "" },
      { ph: "实施", t: "研发对接与开发", owner: "—", due: "" }, { ph: "收尾", t: "复盘与知识沉淀", owner: "常浩", due: "" },
    ] },
  { id: "d11", name: "双11 冲分节", template: "营销战役", status: "实施中", link: "#/marketing/campaign" },
  { id: "t1", name: "T1 带教工作台", template: "项目推进", status: "已结项" },
];

/* ---------- 项目 · 管培带教 ---------- */
export const SAMPLE_MENTOR = [
  { name: "林瑶", role: "管培生 · 营销方向", logs: [
    { d: "10-15", t: "双11 九宫格文案初稿完成 6/9 格，P4–P6 横幅还没想好", flag: "卡点" },
    { d: "10-14", t: "整理了 2025 双11 物料，发现折扣九宫格当时没出", flag: "" },
    { d: "10-13", t: "和设计对接价格图尺寸，确认 1080×1920", flag: "" },
    { d: "10-11", t: "学习 brief 范本，问了三个关于板块拆分的问题", flag: "提问" },
  ], blocks: ["九宫格 P4–P6 横幅文案未定（10-15）", "不确定折扣九宫格是否要和去年一致"],
    asks: ["「冲分节」想让学生记住哪一句话？", "P4–P6 横幅和 P5 大字是否重复？"],
    feedback: "这周九宫格推进很快，6/9 格已经能用。P4–P6 横幅卡住，是因为还没定「冲分节」主视觉的那句话——先和我对一下主张，再写横幅，会比反复改文案省时间。",
    qa: 3, history: ["WK 41", "WK 40", "WK 39"] },
  { name: "胡贵兰", role: "管培生 · 产品方向", logs: [
    { d: "10-15", t: "W3 调研问卷还差导师端 2 位访谈，约不上时间", flag: "卡点" },
    { d: "10-14", t: "销售端访谈完成 4 位，整理出 9 条选课痛点", flag: "" },
    { d: "10-12", t: "选课工具字段设计第一版，待审阅", flag: "" },
  ], blocks: ["W3 导师端访谈约不上，已拖 2 天（10-15）", "字段设计第一版等待审阅"],
    asks: ["导师端约不上的原因是时间还是意愿？", "Q&A 合集里的导师答复能覆盖哪些问题？"],
    feedback: "销售端 4 位访谈整理得很扎实，9 条痛点可以直接进字段设计。导师端约不上，别等：先用 Q&A 合集里已有的 13 条导师答复做初稿，周一前把缺口列给我。",
    qa: 13, history: ["WK 41", "WK 40"] },
];

/* ---------- 知识库整理 ---------- */
export const SAMPLE_KB = {
  space: "常浩的知识库",
  readAt: "10-16 09:30",
  tree: [
    { id: "a", name: "未命名文档 3", file: true }, { id: "b", name: "2025 双11 复盘", file: true },
    { id: "c", name: "价格", kids: [{ id: "c1", name: "2026 价格表（旧）", file: true }, { id: "c2", name: "折扣口径说明", file: true }] },
    { id: "d", name: "杂项", kids: [{ id: "d1", name: "brief 双11 第二批", file: true }, { id: "d2", name: "选课海报文案", file: true }, { id: "d3", name: "会议纪要 0912", file: true }, { id: "d4", name: "会议纪要 0926", file: true }, { id: "d5", name: "2026价格表（副本）", file: true }] },
    { id: "e", name: "管培", kids: [{ id: "e1", name: "Q&A合集", file: true }, { id: "e2", name: "林瑶日志", file: true }, { id: "e3", name: "胡贵兰日志", file: true }] },
    { id: "f", name: "临时", kids: [] },
  ],
  // 文档详情：更新日期、字数、标签、正文摘要、被谁引用；dupOf 为后端判断的疑似重复对象（标题与正文相似）。
  docs: {
    a: { updated: "2025-11-02", chars: 0, tags: [], excerpt: "", refs: [] },
    b: { updated: "2025-12-05", chars: 4820, tags: ["双11", "复盘"], excerpt: "目标达成 92%。有效：直降 + 加赠玩法、私信分批推送；无效：九宫格信息过密。下次：价格图写清「送课时不是降价」。", refs: ["文案助手 · 知识库"] },
    c1: { updated: "2026-01-10", chars: 2210, tags: ["价格"], excerpt: "灵活学Lite 各档总价与赠送课时（2026 上半年口径），已被 3 月新表替代。", refs: [] },
    c2: { updated: "2026-03-18", chars: 1630, tags: ["价格", "口径"], excerpt: "单价 = 总价 ÷（课时 + 赠送）；付费单价 = 总价 ÷ 课时；毛利底线按设置里的口径。", refs: ["文案助手 · 知识库", "价格记录"] },
    d1: { updated: "2026-10-09", chars: 6420, tags: ["brief", "双11"], excerpt: "双11 冲分节第二批物料：价格图、九宫格、活动海报；主张「冲刺补课」；P1–P9 版式说明。", refs: ["文案助手 · brief 范本"] },
    d2: { updated: "2026-08-21", chars: 980, tags: ["文案", "选课"], excerpt: "选课季海报主文案 3 版，第 2 版已用于 09 月物料。", refs: [] },
    d3: { updated: "2026-09-12", chars: 2300, tags: ["会议"], excerpt: "09-12 周会：11 月主线需求初稿、双11 立项。", refs: [] },
    d4: { updated: "2026-09-26", chars: 1870, tags: ["会议"], excerpt: "09-26 周会：价格方案评审，200h 档低于毛利底线需说明原因。", refs: [] },
    d5: { updated: "2026-01-10", chars: 2210, tags: ["价格"], excerpt: "灵活学Lite 各档总价与赠送课时（2026 上半年口径）。", refs: [], dupOf: "c1" },
    e1: { updated: "2026-10-14", chars: 12800, tags: ["管培", "Q&A"], excerpt: "管培生常见问题 13 条导师答复，覆盖选课、调研、brief 写法。", refs: ["带教 Agent"] },
    e2: { updated: "2026-10-15", chars: 5400, tags: ["管培", "日志"], excerpt: "林瑶每日日志：双11 九宫格进度、物料对接。", refs: ["带教 Agent"] },
    e3: { updated: "2026-10-15", chars: 4100, tags: ["管培", "日志"], excerpt: "胡贵兰每日日志：W3 调研问卷、选课工具字段设计。", refs: ["带教 Agent"] },
  },
  rules: [["标题含「brief」", "01 营销月档案"], ["标题含「日志」或「Q&A」", "03 管培带教"], ["标题以「未命名」开头", "99 待清理"], ["标题含「会议纪要」", "04 会议纪要"]],
};

/* ---------- 自言自语（本人发给本人的飞书消息，最近 10 天） ---------- */
export const SAMPLE_SELFTALK = {
  pulledAt: "10-16 09:45",
  digest: "3 条值得回看：双11 价格图要写清「送课时不是降价」；W3 调研拖期需要追问胡贵兰；英国 Essay 季可以补一条「引用规范」主线需求。",
  items: [
    { id: "s1", day: "今天", time: "09:41", text: "双11 九宫格第 5 格用大数字 11.11，参考上次 UQ 那张版式", tag: "" },
    { id: "s2", day: "今天", time: "08:12", text: "https://www.xiaohongshu.com/explore/6a1… 澳洲期末周提前的帖子，评论区很多人在问补课", tag: "", link: true },
    { id: "s3", day: "昨天", time: "22:05", text: "价格图：10 小时包是 8900 + 送 1 小时，brief 里写清楚是送课时不是降价", tag: "star" },
    { id: "s4", day: "昨天", time: "17:30", text: "问胡贵兰：调研问卷 W3 为什么拖了，是不是导师端没约到人", tag: "todo" },
    { id: "s5", day: "10-13", time: "11:20", text: "英国 Essay 季的主线需求可以加一条「引用规范」", tag: "need" },
    { id: "s6", day: "10-12", time: "20:48", text: "看到一个三宫格版式不错：左大图右两行字，存设计参考", tag: "archived" },
    { id: "s7", day: "10-09", time: "10:02", text: "周报里漏了 T2 项目进度", tag: "archived" },
  ],
};
