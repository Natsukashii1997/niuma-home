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
