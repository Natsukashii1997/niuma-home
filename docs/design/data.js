/* 原型假数据。日期以 2026-10-16（周五）为「今天」；本月在准备 11 月档案，10–11 月是双11战役。
   所有数字、文案均为演示用，不来自真实库。 */
P.D = (() => {
  const TODAY = "2026-10-16";
  const COUNTRIES = { US: "美国", UK: "英国", AU: "澳洲", NZ: "新西兰", HK: "香港", CA: "加拿大", SG: "新加坡", MY: "马来西亚" };

  const LINES = ["大学辅导", "国际课程", "申诉服务"];
  const SKUS = [
    { id: "U5", line: "大学辅导", name: "大学辅导 · 5 小时包", hours: 5 },
    { id: "U10", line: "大学辅导", name: "大学辅导 · 10 小时包", hours: 10 },
    { id: "U20", line: "大学辅导", name: "大学辅导 · 20 小时包", hours: 20 },
    { id: "I10", line: "国际课程", name: "A-Level · 10 小时包", hours: 10 },
    { id: "I20", line: "国际课程", name: "IB · 20 小时包", hours: 20 },
    { id: "A1", line: "申诉服务", name: "申诉 · 单次文书", hours: 1 },
  ];
  const FLOOR = 0.3; // 毛利率底线（演示值，真实值由常浩确定）

  // 价格记录：原价、优惠价、赠送课时、成本由人录入；其余字段自动计算。
  const PRICES = [
    { id: "p1", sku: "U5", from: "2025-11-01", to: "2025-11-30", event: "双11", orig: 5000, price: 3900, gift: 0, cost: 2500, play: "直降", status: "历史" },
    { id: "p2", sku: "U5", from: "2026-01-01", to: "2026-05-31", event: "", orig: 5000, price: 4500, gift: 0, cost: 2500, play: "", status: "历史" },
    { id: "p3", sku: "U5", from: "2026-06-01", to: "2026-06-30", event: "毕业季", orig: 5000, price: 4200, gift: 1, cost: 2500, play: "加赠", status: "历史" },
    { id: "p4", sku: "U5", from: "2026-07-01", to: "2026-10-31", event: "", orig: 5000, price: 4500, gift: 0, cost: 2500, play: "", status: "生效中" },
    { id: "p5", sku: "U5", from: "2026-11-01", to: "2026-11-30", event: "双11", orig: 5000, price: 4000, gift: 1, cost: 2500, play: "直降 + 加赠", status: "草稿", need: "n1" },
    { id: "p6", sku: "U10", from: "2026-07-01", to: "2026-10-31", event: "", orig: 10000, price: 8800, gift: 0, cost: 5000, play: "", status: "生效中" },
    { id: "p7", sku: "U10", from: "2026-11-01", to: "2026-11-30", event: "双11", orig: 10000, price: 7800, gift: 2, cost: 5600, play: "满减", status: "草稿", need: "n1", reason: "引流款，接受低毛利；双11当月限量 30 单" },
    { id: "p8", sku: "U20", from: "2026-07-01", to: "2026-10-31", event: "", orig: 20000, price: 16800, gift: 0, cost: 9800, play: "", status: "生效中" },
    { id: "p9", sku: "I10", from: "2026-09-01", to: "2026-11-30", event: "", orig: 9000, price: 8100, gift: 0, cost: 4600, play: "", status: "生效中" },
    { id: "p10", sku: "A1", from: "2026-06-01", to: "2026-12-31", event: "", orig: 3000, price: 2800, gift: 0, cost: 1200, play: "", status: "生效中" },
  ];
  const calc = (r) => {
    const hours = SKUS.find((s) => s.id === r.sku).hours;
    const subsidy = r.orig - r.price;
    return {
      hours, discount: r.price / r.orig, unit: Math.round(r.price / (hours + r.gift)), unitPaid: Math.round(r.price / hours),
      subsidy, unitSubsidy: Math.round(subsidy / hours), margin: r.cost ? (r.price - r.cost) / r.price : null,
    };
  };

  const PLAYS = [
    { name: "直降", logic: "直接降价，门槛最低，适合需求明确、只差临门一脚的人群。", fit: "考前冲刺、出分后补救", risk: "拉低价格锚点，节后回调需要理由" },
    { name: "满减", logic: "满额立减，引导买大包，提高客单价。", fit: "长期需求、整学期规划", risk: "小包用户感知弱" },
    { name: "加赠", logic: "价格不动、多送课时，守住价格锚点。", fit: "选课季、开学季的新生", risk: "课时成本上升，看排课余量" },
    { name: "满赠", logic: "满额赠资料或服务，提升感知价值。", fit: "申请季、文书类需求", risk: "赠品需要真实可交付" },
  ];

  // 主线需求（2026-11），由「事件 → 需求」对照表推导，常浩采纳后生效。
  const NEEDS = [
    { id: "n1", seg: "澳洲 · 本科", node: "S2 Final", when: "11.02 – 11.20", schools: 10, need: "期末冲刺，集中补薄弱科目", pain: "复习材料多、时间碎，不知道先补哪科", todo: "列考试日程，按科目排冲刺计划", source: "时间线 · 10 校", status: "已采纳", promos: 2, mats: 3 },
    { id: "n2", seg: "英国 · 本科", node: "Reading Week → 第一轮 Essay", when: "11.03 – 11.28", schools: 3, need: "Essay 结构与引用规范辅导", pain: "第一次写英式论文，被扣分不知道原因", todo: "拿到 Essay 题目，预约结构审读", source: "时间线 · 3 校", status: "已采纳", promos: 1, mats: 2 },
    { id: "n3", seg: "美国 · 本科", node: "Spring 选课", when: "11.10 – 11.21", schools: 7, need: "选课规划与课程难度评估", pain: "怕选到硬课拖 GPA，抢课窗口短", todo: "整理学位要求，列备选课表", source: "时间线 · 7 校", status: "AI 草稿", promos: 0, mats: 1 },
    { id: "n4", seg: "香港 · 本科", node: "Sem 1 考试周", when: "11.25 – 12.12", schools: 5, need: "考前串讲与真题训练", pain: "港校考试周集中，几门连考", todo: "确认考试时间表，预约串讲", source: "时间线 · 5 校", status: "AI 草稿", promos: 0, mats: 0 },
  ];

  const EVENT_MAP = [
    { type: "选课", lead: 7, need: "选课规划、课程难度评估", pain: "怕选错课拖 GPA；抢课窗口短", todo: "整理学位要求、列备选课表", status: "已确认" },
    { type: "开学", lead: 14, need: "新学期适应、先修课补基础", pain: "进度快、听不懂第一周的课", todo: "领取课程大纲、标出难点周", status: "已确认" },
    { type: "Final", lead: 14, need: "期末冲刺、薄弱科目集中补", pain: "复习材料多、时间碎", todo: "列考试日程、排冲刺计划", status: "已确认" },
    { type: "出分", lead: 0, need: "成绩解读、补考 / 申诉判断", pain: "挂科焦虑，不清楚申诉流程", todo: "核对成绩单、确认申诉截止日", status: "已确认" },
    { type: "补考", lead: 10, need: "补考专项辅导", pain: "时间紧，只有一次机会", todo: "确认补考范围与日期", status: "AI 草拟" },
    { type: "Essay", lead: 10, need: "论文结构与引用规范", pain: "英式论文写法不熟", todo: "拿到题目、预约结构审读", status: "AI 草拟" },
  ];

  // 时间线事件（11 月为主，含跨月）。日期为 2026 年。
  const EVENTS = [
    { c: "AU", s: "UQ", type: "Final", from: "11-02", to: "11-20" }, { c: "AU", s: "USYD", type: "Final", from: "11-04", to: "11-22" },
    { c: "AU", s: "UniMelb", type: "Final", from: "11-02", to: "11-20" }, { c: "AU", s: "Monash", type: "Final", from: "11-05", to: "11-21" },
    { c: "AU", s: "ANU", type: "Final", from: "11-06", to: "11-19" }, { c: "AU", s: "UNSW", type: "出分", from: "11-27", to: "11-27" },
    { c: "NZ", s: "Auckland", type: "Final", from: "11-02", to: "11-14" }, { c: "UK", s: "曼彻斯特", type: "Essay", from: "11-03", to: "11-28" },
    { c: "UK", s: "布里斯托", type: "Essay", from: "11-09", to: "11-27" }, { c: "UK", s: "UCL", type: "Essay", from: "11-10", to: "11-28" },
    { c: "US", s: "UCLA", type: "选课", from: "11-10", to: "11-21" }, { c: "US", s: "UCB", type: "选课", from: "11-12", to: "11-20" },
    { c: "US", s: "UCSD", type: "选课", from: "11-16", to: "11-24" }, { c: "US", s: "UW", type: "选课", from: "11-09", to: "11-18" },
    { c: "US", s: "UCI", type: "选课", from: "11-17", to: "11-25" }, { c: "HK", s: "HKU", type: "Final", from: "11-25", to: "12-12" },
    { c: "HK", s: "CUHK", type: "Final", from: "11-26", to: "12-13" }, { c: "HK", s: "CityU", type: "Final", from: "11-27", to: "12-14" },
    { c: "HK", s: "HKPU", type: "Final", from: "11-24", to: "12-10" }, { c: "SG", s: "NUS", type: "Final", from: "11-22", to: "12-06" },
    { c: "CA", s: "UBC", type: "选课", from: "11-18", to: "11-26" }, { c: "CA", s: "UofT", type: "选课", from: "11-19", to: "11-28" },
    { c: "MY", s: "UKM", type: "开学", from: "11-30", to: "11-30" }, { c: "AU", s: "UQ", type: "出分", from: "11-30", to: "11-30" },
  ];
  const ANOMALIES = [
    { s: "UKM", issue: "同一考试两种日期：7.6–7.26 / 6.29–7.19", sheet: "7月" },
    { s: "UQ", issue: "补考用了香港底色，国家与颜色不一致", sheet: "7月" },
    { s: "UCB", issue: "「UCB选课」没有日期", sheet: "7月" },
  ];

  // 按国家视图：学校 × 12 个月的事件数
  const COUNTRY_MATRIX = {
    AU: { schools: ["UQ", "USYD", "UniMelb", "Monash", "ANU", "UNSW", "UTS", "Adelaide", "RMIT", "UWA"], seed: 3 },
    UK: { schools: ["曼彻斯特", "布里斯托", "格拉斯哥", "UCL", "KCL", "爱丁堡"], seed: 5 },
    US: { schools: ["UCLA", "UCB", "UCSD", "UCI", "UCD", "UW", "OSU"], seed: 7 },
    HK: { schools: ["HKU", "CUHK", "HKPU", "CityU", "HKBU", "EdUHK"], seed: 11 },
  };

  const CODEX = {
    stage: "预告", next: "2026-10-18T09:00:00+08:00", label: "北京时间预计 10 月 18 日 09:00 前",
    quote: "We're going to reset Codex rate limits for everyone again this weekend — thanks for bearing with us while we scale up capacity.",
    quoteZh: "本周末我们会再次为所有人重置 Codex 速率限制，感谢大家在我们扩容期间的耐心。",
    author: "thsottiaux", posted: "10-16 08:42", checked: "10-16 10:00",
    history: [
      { stage: "确认", time: "10-04 09:12", text: "Reset is live. Enjoy." },
      { stage: "预告", time: "10-03 22:40", text: "Another reset coming tomorrow morning PT." },
      { stage: "撤回", time: "09-21 11:05", text: "Holding off on the reset we mentioned, sorry folks." },
      { stage: "预告", time: "09-20 18:30", text: "Planning a reset early next week." },
    ],
  };

  const GATES = [
    { node: "策略 / 节奏 / 清单定稿", project: "双11 冲分节", type: "门禁 · 里程碑", due: "10-17", soon: true },
    { node: "生产进度与质量验收", project: "双11 冲分节", type: "门禁", due: "10-24" },
    { node: "方案审核定稿", project: "T2 选课工具", type: "门禁 · 里程碑", due: "10-28" },
  ];
  const REMINDERS = [
    { node: "视觉物料设计与制作", project: "双11 冲分节", due: "10-17", left: 1, owner: "常浩" },
    { node: "内容策划与文案产出", project: "双11 冲分节", due: "10-18", left: 2, owner: "林瑶" },
    { node: "WBS 任务拆解 · W3 调研问卷", project: "T2 选课工具", due: "10-18", left: 2, owner: "胡贵兰" },
  ];

  // 物料：产品物料按类型 × 月份；营销物料按场景
  const MONTHS = ["2026-08", "2026-09", "2026-10", "2026-11"];
  const PRODUCT_TYPES = [
    { key: "price", name: "价格图", fixed: true }, { key: "trial", name: "试听海报", fixed: true },
    { key: "course", name: "选课海报", fixed: true }, { key: "event", name: "活动海报", fixed: false },
  ];
  const PRODUCT = {
    "2026-08": { price: { big: "4500", v: 2 }, trial: { v: 1 }, course: { v: 1 } },
    "2026-09": { price: { big: "4500", v: 2 }, trial: { v: 1, reuse: "2026-08" }, course: { v: 2 }, event: { big: "开学季", v: 1 } },
    "2026-10": { price: { big: "4500", v: 3 }, trial: { v: 1, reuse: "2026-08" }, course: { v: 1, reuse: "2026-09" }, event: { big: "11.11", v: 2, accent: true } },
    "2026-11": { price: { big: "4000", v: 0, pending: true, accent: true }, trial: { v: 0, decision: "沿用常规" }, course: { v: 0, decision: "本月不出" }, event: { big: "11.11", v: 0, pending: true, accent: true } },
  };
  const MARKETING = [
    { month: "2026-11", scene: "双11 · 冲分节预热", kind: "grid9", status: "制作中", count: 9 },
    { month: "2026-11", scene: "双11 · 折扣九宫格", kind: "grid9", status: "待写 brief", count: 9 },
    { month: "2026-10", scene: "期中周 · 学员案例", kind: "grid3", status: "已交付", count: 3 },
    { month: "2026-10", scene: "国庆 · 留学生活", kind: "grid9", status: "已交付", count: 9 },
    { month: "2026-09", scene: "开学季 · 新生须知", kind: "grid9", status: "已交付", count: 9 },
    { month: "2026-09", scene: "选课季 · 避坑指南", kind: "grid3", status: "已交付", count: 3 },
  ];

  // 月度档案环节
  const MONTH_STEPS = [
    { key: "needs", name: "主线需求", state: "done", meta: "4 条 · 2 条已采纳", href: "#/insight/needs" },
    { key: "strategy", name: "用户策略", state: "doing", meta: "草稿 · 结构待定", href: "#/insight/strategy" },
    { key: "prices", name: "促销方案", state: "doing", meta: "2 条草稿 · 1 条破底线", href: "#/month/prices" },
    { key: "list", name: "物料清单", state: "done", meta: "6 项 · 3 项沿用", href: "#/month/materials" },
    { key: "brief", name: "设计 brief", state: "doing", meta: "7 节中 4 节完成", href: "#/month/brief" },
    { key: "deliver", name: "物料交付", state: "todo", meta: "0 / 6 已上传 NAS", href: "#/month/materials" },
  ];

  const CAMPAIGN = {
    name: "双11 冲分节", span: "2026-10-01 → 2026-11-30", months: ["2026-10", "2026-11"],
    phases: [
      { name: "启动", nodes: [{ n: 10, t: "战役立项与目标设定", done: true }, { n: 20, t: "历史资产与资源盘点", done: true }, { n: 30, t: "立项定义审核", gate: true, done: true }] },
      { name: "计划", nodes: [{ n: 40, t: "战役策略与方案设计", done: true, kids: ["核心策略制定", "促销方案设计", "营销节奏与排期规划", "战役主题确认", "物料需求清单拆解"] }, { n: 100, t: "策略 / 节奏 / 清单定稿", gate: true, due: "10-17" }] },
      { name: "实施", nodes: [{ n: 110, t: "内容规划与生产管理", kids: ["内容策划与文案产出", "视觉物料设计与制作"], due: "10-24" }, { n: 140, t: "生产进度与质量验收", gate: true, due: "10-24" }] },
      { name: "收尾", nodes: [{ n: 150, t: "复盘总结与知识沉淀", kids: ["组织复盘会议", "资产归档与知识沉淀"] }] },
    ],
    routine: [
      { type: "价格图", choice: "用战役版替代" }, { type: "试听海报", choice: "沿用常规" },
      { type: "选课海报", choice: "本月不出" }, { type: "活动海报", choice: "用战役版替代" },
    ],
  };

  // 留学之声
  const VOICE = [
    { id: "v1", title: "澳洲多校 S2 期末周提前，复习时间被压缩", heat: 86.4, part: 23, trend: "surge", tags: ["AU", "UQ", "USYD"], src: "r/UQreddit · r/usyd · 官网校历", kind: "Final" },
    { id: "v2", title: "UCLA / UCB 春季选课窗口开放，热门课秒满", heat: 71.2, part: 18, trend: "rising", tags: ["US", "UCLA", "UCB"], src: "r/ucla · r/berkeley", kind: "选课" },
    { id: "v3", title: "英国第一轮 Essay 反馈：引用格式扣分集中", heat: 58.9, part: 14, trend: "up", tags: ["UK", "曼彻斯特"], src: "r/UniUK · r/manchester", kind: "Essay" },
    { id: "v4", title: "港校考试周与 Reading Week 重叠，连考三门", heat: 44.0, part: 9, trend: "up", tags: ["HK", "HKU", "CUHK"], src: "r/HongKong · 官网", kind: "Final" },
    { id: "v5", title: "加拿大 UBC 春季课程冲突，候补名单过长", heat: 31.7, part: 7, trend: "flat", tags: ["CA", "UBC"], src: "r/UBC", kind: "选课" },
    { id: "v6", title: "新国立期末前学习空间预约紧张", heat: 22.5, part: 5, trend: "down", tags: ["SG", "NUS"], src: "r/nus", kind: "Final" },
  ];
  const VOICE_DAILY = ["澳洲 S2 期末周提前的讨论在 23 个独立来源中出现，比昨天多 9 个", "UCLA 选课窗口开放首日，热门课候补帖集中出现", "英国 Essay 首轮反馈的扣分点集中在引用格式与论证结构", "港校考试时间表陆续公布，连考话题升温"];

  const SELFTALK = [
    { id: "s1", day: "今天", time: "09:41", text: "双11 九宫格第 5 格用大数字 11.11，参考上次 UQ 那张版式", tag: "", link: false },
    { id: "s2", day: "今天", time: "08:12", text: "https://www.xiaohongshu.com/explore/6a1… 澳洲期末周提前的帖子，评论区很多人在问补课", tag: "", link: true },
    { id: "s3", day: "昨天", time: "22:05", text: "价格图：5 小时包双11 是 4000 + 送 1 小时，记得在 brief 里写清楚是送课时不是降价", tag: "star", link: false },
    { id: "s4", day: "昨天", time: "17:30", text: "问胡贵兰：调研问卷 W3 为什么拖了，是不是导师端没约到人", tag: "todo", link: false },
    { id: "s5", day: "10-13", time: "11:20", text: "英国 Essay 季的主线需求可以加一条「引用规范」", tag: "need", link: false },
    { id: "s6", day: "10-12", time: "20:48", text: "看到一个三宫格版式不错：左大图右两行字，存设计参考", tag: "archived", link: false },
    { id: "s7", day: "10-09", time: "10:02", text: "周报里漏了 T2 项目进度", tag: "archived", link: false },
  ];

  const KB_BEFORE = [
    { name: "常浩的知识库", kids: [
      { name: "未命名文档 3", file: true }, { name: "2025 双11 复盘", file: true }, { name: "价格", kids: [{ name: "2026 价格表（旧）", file: true }, { name: "折扣口径说明", file: true }] },
      { name: "杂项", kids: [{ name: "brief 双11 第二批", file: true }, { name: "选课海报文案", file: true }, { name: "会议纪要 0912", file: true }] },
      { name: "管培", kids: [{ name: "Q&A合集", file: true }, { name: "林瑶日志", file: true }, { name: "胡贵兰日志", file: true }] },
    ] },
  ];
  const KB_AFTER = [
    { name: "常浩的知识库", kids: [
      { name: "01 营销月档案", op: "new", kids: [{ name: "2025-11 双11 复盘", file: true, op: "move", from: "根目录 · 2025 双11 复盘" }, { name: "2026-11 设计 brief · 双11 第二批", file: true, op: "move rename", from: "杂项 · brief 双11 第二批" }, { name: "选课海报文案", file: true, op: "move", from: "杂项" }] },
      { name: "02 价格", op: "rename", from: "价格", kids: [{ name: "2026 价格表（旧）", file: true }, { name: "折扣口径说明", file: true }] },
      { name: "03 管培带教", op: "rename", from: "管培", kids: [{ name: "Q&A合集", file: true }, { name: "林瑶日志", file: true }, { name: "胡贵兰日志", file: true }] },
      { name: "99 待清理", op: "new", kids: [{ name: "未命名文档 3", file: true, op: "move", from: "根目录" }, { name: "会议纪要 0912", file: true, op: "move", from: "杂项" }] },
    ] },
  ];

  const TRAINEES = [
    { name: "林瑶", role: "管培生 · 营销方向", logs: [
      { d: "10-15", t: "双11 九宫格文案初稿完成 6/9 格，P4–P6 横幅还没想好", flag: "卡点" },
      { d: "10-14", t: "整理了 2025 双11 物料，发现折扣九宫格当时没出", flag: "" },
      { d: "10-13", t: "和设计对接价格图尺寸，确认 1080×1920", flag: "" },
      { d: "10-11", t: "学习 brief 范本，问了三个关于板块拆分的问题", flag: "提问" },
    ] },
    { name: "胡贵兰", role: "管培生 · 产品方向", logs: [
      { d: "10-15", t: "W3 调研问卷还差导师端 2 位访谈，约不上时间", flag: "卡点" },
      { d: "10-14", t: "销售端访谈完成 4 位，整理出 9 条选课痛点", flag: "" },
      { d: "10-12", t: "选课工具字段设计第一版，待审阅", flag: "" },
    ] },
  ];

  const REFS = [
    { id: "r1", x: 40, y: 56, w: 168, kind: "price", big: "¥3999", title: "数字做主角", tags: ["价格图", "大数字"], zone: 0 },
    { id: "r2", x: 236, y: 92, w: 150, kind: "event", big: "11.11", title: "斜切角标", tags: ["活动海报", "角标"], zone: 0, accent: true },
    { id: "r3", x: 236, y: 424, w: 150, kind: "trial", title: "留白 + 单行标题", tags: ["试听海报", "留白"], zone: 0 },
    { id: "r4", x: 520, y: 60, w: 210, kind: "grid9", big: "冲分", title: "中心格大字", tags: ["九宫格", "大数字"], zone: 1, accent: true },
    { id: "r5", x: 770, y: 120, w: 200, kind: "grid9", title: "棋盘交替", tags: ["九宫格", "节奏"], zone: 1 },
    { id: "r6", x: 600, y: 440, w: 260, kind: "grid3", title: "左大图右文字", tags: ["三宫格", "版式"], zone: 1 },
    { id: "r7", x: 1010, y: 70, w: 150, kind: "long", title: "案例长图分段", tags: ["长图", "案例"], zone: 2 },
    { id: "r8", x: 1190, y: 150, w: 150, kind: "course", title: "课表式信息排布", tags: ["选课海报", "表格"], zone: 2 },
  ];
  const REF_ZONES = [{ name: "价格 / 活动海报", x: 16, y: 16, w: 440, h: 740 }, { name: "朋友圈宫格版式", x: 488, y: 16, w: 500, h: 740 }, { name: "长图与信息排布", x: 1000, y: 16, w: 380, h: 740 }];

  const SCHEDULE = [
    { time: "10:00 – 10:30", title: "双11 物料进度对齐", note: "林瑶 · 设计", now: false },
    { time: "14:00 – 15:00", title: "11 月促销方案评审", note: "业务负责人", now: true },
    { time: "16:30 – 17:00", title: "管培周会", note: "林瑶 · 胡贵兰", now: false },
  ];

  return { TODAY, COUNTRIES, LINES, SKUS, FLOOR, PRICES, calc, PLAYS, NEEDS, EVENT_MAP, EVENTS, ANOMALIES, COUNTRY_MATRIX, CODEX, GATES, REMINDERS, MONTHS, PRODUCT_TYPES, PRODUCT, MARKETING, MONTH_STEPS, CAMPAIGN, VOICE, VOICE_DAILY, SELFTALK, KB_BEFORE, KB_AFTER, TRAINEES, REFS, REF_ZONES, SCHEDULE };
})();
