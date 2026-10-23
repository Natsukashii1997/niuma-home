// 示例数据：只在对应接口返回 501（尚未实现）时显示，页面会标「示例」。
// 接口实现后这里对应的示例可以删除。

// Voice 模拟数据（用户 2026-10-23）：学生讨论来源接通前，Voice 页和首页用它展示效果，页面醒目标「模拟数据」。
// 字段与 /api/v3/voice 真实返回一致；七天日期按今天往前推。来源接通后自动换成真实数据，不能用它转需求。
export function voiceSample(today = new Date()) {
  const day = (n) => { const d = new Date(today); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const sparkDates = [6, 5, 4, 3, 2, 1, 0].map(day);
  const topic = (id, title, summary, tags, kind, part, heat, trend, spark, sources) => ({ id: `sample-${id}`, title, summary, tags, kind, need: "", part, heat, trend, spark, sparkDates, sources });
  const hot = [
    topic("final-review", "Final 复习来不及，想找人带着过重点", "期末周临近，多人表示课程内容没跟上，想要按考纲梳理重点和真题讲解，愿意为冲刺课付费。", ["澳洲", "新西兰"], "Final", 23, 92, "surge", [18, 22, 30, 41, 58, 77, 92], [["「还有两周 final，lecture 一半没听」", "模拟 · 学生论坛"], ["「有没有人一起刷 past paper」", "模拟 · 群聊"]]),
    topic("dissertation", "毕业论文选题卡住，导师回复慢", "英国硕士开题集中，学生担心选题范围太大、文献综述不会写，导师反馈周期长。", ["英国"], "论文", 17, 78, "up", [40, 44, 49, 55, 61, 70, 78], [["「proposal 被打回第二次了」", "模拟 · 学生论坛"]]),
    topic("midterm-score", "期中成绩出来，GPA 想补救", "美国本科期中出分后，部分学生担心挂科，询问补救方案和后半学期的复习规划。", ["美国"], "出分", 14, 66, "up", [30, 35, 38, 47, 52, 60, 66], [["「midterm 只拿了 C-，还有救吗」", "模拟 · 社交平台"]]),
    topic("course-select", "春季选课怕选错，先修课没过", "加拿大和美国开始下学期选课，学生纠结课程难度搭配，担心先修课不满足。", ["加拿大", "美国"], "选课", 12, 54, "flat", [50, 52, 51, 53, 55, 54, 54], [["「同时选 MATH 和 STAT 会不会太重」", "模拟 · 学生论坛"]]),
    topic("hk-presentation", "Presentation 不敢开口，口语跟不上", "香港硕士小组展示密集，学生反映英文口头表达和答辩准备是主要压力。", ["香港"], "作业", 9, 41, "flat", [38, 40, 42, 39, 41, 43, 41], [["「下周 pre，全组就我英文最差」", "模拟 · 群聊"]]),
    topic("visa-work", "毕业后工签和找工作时间冲突", "临近毕业的学生在讨论工签申请时间点与求职节奏，担心错过窗口。", ["英国", "澳洲"], "其他", 8, 33, "down", [48, 45, 41, 39, 36, 35, 33], [["「PSW 什么时候递最稳」", "模拟 · 社交平台"]]),
  ];
  const cloud = [["Final", 92, "surge"], ["past paper", 74, "surge"], ["论文选题", 70, "up"], ["期中出分", 62, "up"], ["GPA", 58, "up"], ["选课", 52, "flat"], ["先修课", 40, "flat"], ["Presentation", 38, "flat"], ["导师", 35, "up"], ["工签", 30, "down"], ["冲刺", 28, "surge"], ["小组作业", 22, "flat"]];
  return {
    updatedAt: `${day(0)} 09:00`, nextAt: null, hot, cloud,
    stats: { topics: hot.length, newTopics: 2, surge: hot.filter((t) => t.trend === "surge").length, participants: 83, filtered: 11, sourceCount: 4, sources: "模拟信源" },
    daily: "澳新进入 Final 周，「复习来不及」急升到第一；英国论文开题和美国期中出分紧随其后，适合推冲刺与补救类内容。（模拟数据）",
  };
}

// 培养路径示例（T14）：照定稿 V7 的模拟数据，不是真实评分。真实来源（飞书表、本地表还是手填）定下来后由 /api/v3/mentor/path 返回同样的形状。
// 状态：done 已通关 / doing 进行中 / locked 未解锁；links 是跨线依赖（绳桥），note 写前一关的哪份产出被后一关用到。
const rubric = (name, weight, score, note) => ({ name, weight, score, note });
export const MENTOR_PATH_SAMPLE = {
  season: { name: "S1 · 2026 秋季", start: "2026-09-01", weeks: 24, pass: 70, rank: "见习项目助理", next: "项目助理", reviewer: "常浩" },
  today: "2026-10-23",
  trainees: [
    { name: "胡贵兰", role: "管培生", path: {
      lines: [
        { key: "biz", code: "B", name: "业务线", desc: "从看懂业务到独立负责一个项目", nodes: [
          { id: "B1", stage: "业务认知", title: "画出业务地图", week: [1, 2], status: "done", score: 86, at: "09-12",
            goal: "说清楚三条业务线怎么赚钱、用户从哪来、关键环节卡在哪。",
            todo: ["读完三条业务线介绍与近 3 月周报", "跟访 2 次用户咨询并记纪要", "画出一张从获客到交付的流程图"],
            output: ["《业务地图》一页纸", "用户旅程图 1 张"],
            rubric: [rubric("准确：环节与数据没有事实错误", 40, 36), rubric("完整：三条线都覆盖到交付", 30, 25), rubric("讲清楚：5 分钟能讲给新人听", 30, 25)] },
          { id: "B2", stage: "问题定义", title: "写项目定义与问题树", week: [3, 4], status: "done", score: 82, at: "09-26",
            goal: "把一个模糊诉求变成可衡量的项目目标，并拆到能分工的颗粒度。",
            todo: ["写项目定义：目标、边界、北极星指标", "问题树拆到第 3 层，每个叶子能对应一个动作", "和常浩过一次，按反馈改一版"],
            output: ["项目定义卡", "问题树（飞书画板）"],
            rubric: [rubric("目标可衡量，有截止时间", 35, 30), rubric("拆解不重不漏（MECE）", 35, 27), rubric("指标选得对，能反映业务结果", 30, 25)] },
          { id: "B3", stage: "调研", title: "用户与数据调研", week: [5, 6], status: "done", score: 74, at: "10-10",
            goal: "用一手证据验证问题树里最关键的两个假设。",
            todo: ["访谈 5 位目标用户", "拉近 3 个月的转化数据并做对比", "整理 3 家竞品的做法"],
            output: ["调研报告", "访谈纪要 5 份"],
            rubric: [rubric("样本有代表性", 30, 21), rubric("洞察有密度，不只罗列现象", 40, 28), rubric("结论都能追到证据", 30, 25)] },
          { id: "B4", stage: "方案收敛", title: "收敛方案并排期", week: [7, 9], status: "doing", score: 62, at: "初稿 10-21", todoDone: 1, outDone: 1,
            goal: "从 3 个备选方案收敛到 1 个主方案，排出能执行的计划。",
            todo: ["写清 3 个方案的取舍理由", "主方案拆任务、定负责人和期限", "列出前 3 个风险和预案"],
            output: ["方案一页纸", "排期表（多维表格）"],
            rubric: [rubric("取舍理由说得通", 40, 28, "已交"), rubric("排期可执行，负责人明确", 35, 22, "缺两项期限"), rubric("风险有预案", 25, 12, "只写了 1 个")] },
          { id: "B5", stage: "推进落地", title: "对接设计研发上线", week: [10, 14], status: "locked",
            goal: "主持评审，把方案推到上线，过程中不掉节点。",
            todo: ["写需求单并主持一次评审", "每周同步进度，卡点 24 小时内升级", "上线当天核对数据埋点"],
            output: ["需求单 / PRD", "上线记录"],
            rubric: [rubric("需求清楚，评审一次过", 30), rubric("节点按期，卡点及时升级", 40), rubric("上线核对完整", 30)] },
          { id: "B6", stage: "业务验证", title: "验收与数据复盘", week: [15, 18], status: "locked",
            goal: "用北极星指标判断方案到底有没有用。",
            todo: ["对比上线前后 4 周数据", "区分自然波动和方案效果", "写验证结论和下一步"],
            output: ["验证报告"],
            rubric: [rubric("口径前后一致", 30), rubric("结论有数据支撑", 40), rubric("下一步具体", 30)] },
          { id: "B7", stage: "结项复盘", title: "独立负责一个项目", week: [19, 24], status: "locked", boss: true,
            goal: "从立项到复盘独立跑完一个项目，沉淀可复用的经验。",
            todo: ["独立立项并推进到结项", "主持复盘会", "把 2 条经验沉淀进 Q&A 合集"],
            output: ["复盘文档", "Q&A 入库 2 条"],
            rubric: [rubric("项目达成目标", 40), rubric("复盘找到真原因", 30), rubric("经验可复用", 30)] },
        ] },
        { key: "ai", code: "A", name: "AI 线", desc: "从会用 AI 工具到把 AI 用进业务项目", nodes: [
          { id: "A1", stage: "工具上手", title: "用 AI 完成日常任务", week: [1, 2], status: "done", score: 90, at: "09-10",
            goal: "习惯先问 AI：写作、整理、查资料都先试一遍。",
            todo: ["用对话助手完成 10 个真实工作任务", "每个任务记下提示词和结果好坏", "挑 3 个最好用的分享给同组"],
            output: ["提示词笔记 10 条"],
            rubric: [rubric("覆盖不同类型的任务", 40, 38), rubric("记录能复用", 30, 27), rubric("有好坏判断", 30, 25)] },
          { id: "A2", stage: "提示词", title: "写结构化提示词", week: [3, 4], status: "done", score: 78, at: "09-24",
            goal: "会用角色、上下文、格式、示例把要求说清楚。",
            todo: ["把 3 个业务提示词改成结构化写法", "前后对比效果并写原因", "沉淀成团队模板"],
            output: ["提示词模板 3 个", "前后对比表"],
            rubric: [rubric("结构完整", 30, 25), rubric("效果确有提升", 40, 30), rubric("模板别人能直接用", 30, 23)] },
          { id: "A3", stage: "辅助调研", title: "用 AI 做调研底稿", week: [5, 7], status: "doing", score: 55, at: "10-18", todoDone: 2, outDone: 1,
            goal: "让 AI 先出底稿，人负责核对事实和下判断。",
            todo: ["用 AI 整理 5 份访谈纪要的共性", "竞品资料由 AI 汇总，逐条核对来源", "标出 AI 说错的地方"],
            output: ["AI 调研底稿", "事实核对清单"],
            rubric: [rubric("事实核对率 ≥ 90%", 40, 24, "核了 6 / 10"), rubric("引用都有来源", 30, 18), rubric("能指出 AI 的错", 30, 13, "待补")] },
          { id: "A4", stage: "自动化", title: "搭一个自动化流程", week: [8, 11], status: "locked",
            goal: "把一件每周重复的事交给多维表格 + 机器人。",
            todo: ["选一件每周重复 ≥ 1 小时的事", "用多维表格自动化搭流程", "跑满 2 周并记录失败"],
            output: ["可运行流程", "使用说明"],
            rubric: [rubric("真的在用", 40), rubric("失败有提示", 30), rubric("说明别人看得懂", 30)] },
          { id: "A5", stage: "Agent 协作", title: "给 Agent 派单并验收", week: [12, 16], status: "locked",
            goal: "会写任务单，让 Agent 干活，自己负责验收。",
            todo: ["给 Agent 写 2 份任务单（目标、边界、验收）", "验收产出并记录返工原因", "总结什么任务适合交给 Agent"],
            output: ["Agent 任务单 2 份", "验收记录"],
            rubric: [rubric("任务单边界清楚", 35), rubric("验收严格", 35), rubric("总结有判断", 30)] },
          { id: "A6", stage: "AI 落地", title: "把 AI 用进业务项目", week: [17, 24], status: "locked", boss: true,
            goal: "在业务线项目里用 AI 省下 ≥ 30% 工时，并能算清楚。",
            todo: ["在 B5–B7 的项目里找 2 个 AI 介入点", "测算前后工时", "写落地报告"],
            output: ["落地报告", "工时测算表"],
            rubric: [rubric("省时可测算", 40), rubric("质量不降", 30), rubric("可推广", 30)] },
        ] },
      ],
      links: [{ from: "B3", to: "A3", note: "访谈纪要" }, { from: "B5", to: "A6", note: "上线的项目" }, { from: "A4", to: "B5", note: "进度自动化表" }],
    } },
    { name: "林瑶", role: "管培生", path: null },
  ],
};
