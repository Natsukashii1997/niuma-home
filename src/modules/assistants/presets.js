// 预设助手的展示信息（说明正文在 server/assistant-presets.mjs）。头像见 src/ui/bitmap.jsx 的 AgentFace。
export const PRESETS = {
  copywriter: { role: "促销文案 · 海报标题 · 私信话术", starters: ["给 11 月价格图写 3 个主标题，突出「送课时不是降价」", "把这段方案改写成发给业务的私信话术", "按 brief 的 P1–P9 结构，起草冲分节九宫格文案"] },
  interview: { role: "面试结构 · 追问链 · 面评整理", starters: ["这是候选人简历，帮我排一场 30 分钟的管培生面试", "按 STAR 给这段实习经历出三层追问", "把我刚才的面试要点整理成面评，给出推进建议"] },
  performance: { role: "阶段评估 · 自评述职 · 面谈提纲", starters: ["根据这些周报要点，写一份本季度自评", "给管培生写第一阶段评价，按五个能力维度", "帮我准备一次绩效面谈提纲，需要指出执行问题"] },
  notice: { role: "内部通知 · 群公告 · 变更说明", starters: ["起草一条 11 月促销上线的群通知，给短版和正式版", "价格规则有调整，写一份变更说明", "写一条提醒大家周五前提交物料的催办消息"] },
};
export const DEFAULT_STARTERS = ["帮我把这段内容整理成要点", "给这件事拟一个推进计划", "检查这段文字有没有表述问题"];
export const startersOf = (a) => PRESETS[a?.preset]?.starters || DEFAULT_STARTERS;
