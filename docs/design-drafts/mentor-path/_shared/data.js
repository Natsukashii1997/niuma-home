// 培养路径设计稿的模拟数据（示例，不是真实评分）。5 版共用同一份，方便横向比较版式。
// 状态：done 已通关 / doing 进行中 / locked 未解锁。通关线 70 分；星级 ≥70 一星、≥80 两星、≥90 三星。

export const PASS = 70;
export const stars = (s) => (s == null ? 0 : s >= 90 ? 3 : s >= 80 ? 2 : s >= PASS ? 1 : 0);
export const STATUS_TEXT = { done: "已通关", doing: "进行中", locked: "未解锁" };
export const STATUS_TONE = { done: "green", doing: "blue", locked: "neutral" };

export const TRAINEES = [
  { name: "胡贵兰", role: "管培生 · 第 8 周", since: "2026-09-01" },
  { name: "林瑶", role: "管培生 · 第 8 周", since: "2026-09-01" },
];

export const SEASON = { name: "S1 · 2026 秋季", week: 8, weeks: 24, rank: "见习项目助理", next: "项目助理" };

const r = (name, weight, score, note) => ({ name, weight, score, note });

export const LINES = [
  {
    key: "biz", code: "B", name: "业务线", desc: "从看懂业务到独立负责一个项目",
    nodes: [
      { id: "B1", stage: "业务认知", title: "画出业务地图", week: [1, 2], status: "done", score: 86, at: "09-12",
        goal: "说清楚三条业务线怎么赚钱、用户从哪来、关键环节卡在哪。",
        todo: ["读完三条业务线介绍与近 3 月周报", "跟访 2 次用户咨询并记纪要", "画出一张从获客到交付的流程图"],
        output: ["《业务地图》一页纸", "用户旅程图 1 张"],
        rubric: [r("准确：环节与数据没有事实错误", 40, 36), r("完整：三条线都覆盖到交付", 30, 25), r("讲清楚：5 分钟能讲给新人听", 30, 25)] },
      { id: "B2", stage: "问题定义", title: "写项目定义与问题树", week: [3, 4], status: "done", score: 82, at: "09-26",
        goal: "把一个模糊诉求变成可衡量的项目目标，并拆到能分工的颗粒度。",
        todo: ["写项目定义：目标、边界、北极星指标", "问题树拆到第 3 层，每个叶子能对应一个动作", "和常浩过一次，按反馈改一版"],
        output: ["项目定义卡", "问题树（飞书画板）"],
        rubric: [r("目标可衡量，有截止时间", 35, 30), r("拆解不重不漏（MECE）", 35, 27), r("指标选得对，能反映业务结果", 30, 25)] },
      { id: "B3", stage: "调研", title: "用户与数据调研", week: [5, 6], status: "done", score: 74, at: "10-10",
        goal: "用一手证据验证问题树里最关键的两个假设。",
        todo: ["访谈 5 位目标用户", "拉近 3 个月的转化数据并做对比", "整理 3 家竞品的做法"],
        output: ["调研报告", "访谈纪要 5 份"],
        rubric: [r("样本有代表性", 30, 21), r("洞察有密度，不只罗列现象", 40, 28), r("结论都能追到证据", 30, 25)] },
      { id: "B4", stage: "方案收敛", title: "收敛方案并排期", week: [7, 9], status: "doing", score: 62, at: "初稿 10-21", todoDone: 1, outDone: 1,
        goal: "从 3 个备选方案收敛到 1 个主方案，排出能执行的计划。",
        todo: ["写清 3 个方案的取舍理由", "主方案拆任务、定负责人和期限", "列出前 3 个风险和预案"],
        output: ["方案一页纸", "排期表（多维表格）"],
        rubric: [r("取舍理由说得通", 40, 28, "已交"), r("排期可执行，负责人明确", 35, 22, "缺两项期限"), r("风险有预案", 25, 12, "只写了 1 个")] },
      { id: "B5", stage: "推进落地", title: "对接设计研发上线", week: [10, 14], status: "locked",
        goal: "主持评审，把方案推到上线，过程中不掉节点。",
        todo: ["写需求单并主持一次评审", "每周同步进度，卡点 24 小时内升级", "上线当天核对数据埋点"],
        output: ["需求单 / PRD", "上线记录"],
        rubric: [r("需求清楚，评审一次过", 30), r("节点按期，卡点及时升级", 40), r("上线核对完整", 30)] },
      { id: "B6", stage: "业务验证", title: "验收与数据复盘", week: [15, 18], status: "locked",
        goal: "用北极星指标判断方案到底有没有用。",
        todo: ["对比上线前后 4 周数据", "区分自然波动和方案效果", "写验证结论和下一步"],
        output: ["验证报告"],
        rubric: [r("口径前后一致", 30), r("结论有数据支撑", 40), r("下一步具体", 30)] },
      { id: "B7", stage: "结项复盘", title: "独立负责一个项目", week: [19, 24], status: "locked", boss: true,
        goal: "从立项到复盘独立跑完一个项目，沉淀可复用的经验。",
        todo: ["独立立项并推进到结项", "主持复盘会", "把 2 条经验沉淀进 Q&A 合集"],
        output: ["复盘文档", "Q&A 入库 2 条"],
        rubric: [r("项目达成目标", 40), r("复盘找到真原因", 30), r("经验可复用", 30)] },
    ],
  },
  {
    key: "ai", code: "A", name: "AI 线", desc: "从会用 AI 工具到把 AI 用进业务项目",
    nodes: [
      { id: "A1", stage: "工具上手", title: "用 AI 完成日常任务", week: [1, 2], status: "done", score: 90, at: "09-10",
        goal: "习惯先问 AI：写作、整理、查资料都先试一遍。",
        todo: ["用对话助手完成 10 个真实工作任务", "每个任务记下提示词和结果好坏", "挑 3 个最好用的分享给同组"],
        output: ["提示词笔记 10 条"],
        rubric: [r("覆盖不同类型的任务", 40, 38), r("记录能复用", 30, 27), r("有好坏判断", 30, 25)] },
      { id: "A2", stage: "提示词", title: "写结构化提示词", week: [3, 4], status: "done", score: 78, at: "09-24",
        goal: "会用角色、上下文、格式、示例把要求说清楚。",
        todo: ["把 3 个业务提示词改成结构化写法", "前后对比效果并写原因", "沉淀成团队模板"],
        output: ["提示词模板 3 个", "前后对比表"],
        rubric: [r("结构完整", 30, 25), r("效果确有提升", 40, 30), r("模板别人能直接用", 30, 23)] },
      { id: "A3", stage: "辅助调研", title: "用 AI 做调研底稿", week: [5, 7], status: "doing", score: 55, at: "10-18", todoDone: 2, outDone: 1,
        goal: "让 AI 先出底稿，人负责核对事实和下判断。",
        todo: ["用 AI 整理 5 份访谈纪要的共性", "竞品资料由 AI 汇总，逐条核对来源", "标出 AI 说错的地方"],
        output: ["AI 调研底稿", "事实核对清单"],
        rubric: [r("事实核对率 ≥ 90%", 40, 24, "核了 6 / 10"), r("引用都有来源", 30, 18), r("能指出 AI 的错", 30, 13, "待补")] },
      { id: "A4", stage: "自动化", title: "搭一个自动化流程", week: [8, 11], status: "locked",
        goal: "把一件每周重复的事交给多维表格 + 机器人。",
        todo: ["选一件每周重复 ≥ 1 小时的事", "用多维表格自动化搭流程", "跑满 2 周并记录失败"],
        output: ["可运行流程", "使用说明"],
        rubric: [r("真的在用", 40), r("失败有提示", 30), r("说明别人看得懂", 30)] },
      { id: "A5", stage: "Agent 协作", title: "给 Agent 派单并验收", week: [12, 16], status: "locked",
        goal: "会写任务单，让 Agent 干活，自己负责验收。",
        todo: ["给 Agent 写 2 份任务单（目标、边界、验收）", "验收产出并记录返工原因", "总结什么任务适合交给 Agent"],
        output: ["Agent 任务单 2 份", "验收记录"],
        rubric: [r("任务单边界清楚", 35), r("验收严格", 35), r("总结有判断", 30)] },
      { id: "A6", stage: "AI 落地", title: "把 AI 用进业务项目", week: [17, 24], status: "locked", boss: true,
        goal: "在业务线项目里用 AI 省下 ≥ 30% 工时，并能算清楚。",
        todo: ["在 B5–B7 的项目里找 2 个 AI 介入点", "测算前后工时", "写落地报告"],
        output: ["落地报告", "工时测算表"],
        rubric: [r("省时可测算", 40), r("质量不降", 30), r("可推广", 30)] },
    ],
  },
];

// 两条线之间的依赖：AI 线关卡要用到业务线的产出
export const LINKS = [["B3", "A3"], ["B5", "A6"], ["A4", "B5"]];

export const ALL = LINES.flatMap((l) => l.nodes.map((n) => ({ ...n, line: l.key, lineName: l.name })));
export const byId = (id) => ALL.find((n) => n.id === id);
export const current = (line) => line.nodes.find((n) => n.status === "doing");
export const doneCount = (line) => line.nodes.filter((n) => n.status === "done").length;
export const lineStars = (line) => line.nodes.reduce((s, n) => s + (n.status === "done" ? stars(n.score) : 0), 0);

// 最近评分记录（评分人都是常浩）
export const LOG = [
  { at: "10-21", id: "B4", text: "方案一页纸初稿：取舍理由 28 / 40，排期缺两项期限", score: "+62 暂评" },
  { at: "10-18", id: "A3", text: "事实核对 6 / 10 条，引用来源补齐 3 条", score: "+55 暂评" },
  { at: "10-10", id: "B3", text: "调研报告通关：洞察比上一版集中", score: "74 ★" },
  { at: "09-26", id: "B2", text: "问题树第 3 层拆完，指标改成到课率", score: "82 ★★" },
  { at: "09-24", id: "A2", text: "提示词模板被同组 2 人复用", score: "78 ★" },
];
