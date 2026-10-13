// 示例数据：只在对应接口返回 501（尚未实现）时显示，页面会标「示例」。
// 接口实现后这里对应的示例可以删除。

export const sampleCalendar = [
  { time: "10:00–10:30", title: "营销周会", place: "3F 会议室" },
  { time: "14:00–15:00", title: "国际课程 11 月促销对齐", place: "飞书会议" },
  { time: "17:30–18:00", title: "物料终稿确认", place: "" },
];

export const sampleReports = [
  {
    id: "d-2026-10-12",
    kind: "日报",
    date: "2026-10-12",
    title: "10 月 12 日日报",
    body: "今日完成\n1. 大学辅导 10 月促销方案定稿并同步\n2. 开学季海报文案二稿\n\n明日计划\n1. 国际课程续费活动对齐\n2. 品牌数据周统计",
  },
  {
    id: "d-2026-10-11",
    kind: "日报",
    date: "2026-10-11",
    title: "10 月 11 日日报",
    body: "今日完成\n1. 物料需求整理\n2. 面试 2 场\n\n明日计划\n1. 大学辅导方案定稿",
  },
  {
    id: "w-2026-41",
    kind: "周报",
    date: "2026-10-10",
    title: "第 41 周周报",
    body: "本周进展\n1. 三条业务线 10 月方案全部录入\n2. 品牌内容发布 4 篇\n\n下周重点\n1. 11 月促销预案",
  },
];

export const sampleMaterials = [
  { id: 1, month: "2026-09", line: "大学辅导", name: "开学季主海报", type: "海报", skus: ["安心学Max", "学考无忧Pass"], images: 2, note: "" },
  { id: 2, month: "2026-09", line: "大学辅导", name: "朋友圈九宫格", type: "朋友圈图", skus: [], images: 9, note: "" },
  { id: 3, month: "2026-09", line: "国际课程", name: "课时卡续费海报", type: "海报", skus: ["灵活学Lite"], images: 1, note: "新老价格分两版" },
  { id: 4, month: "2026-08", line: "大学辅导", name: "定金膨胀主海报", type: "海报", skus: ["安心学Max"], images: 1, note: "" },
  { id: 5, month: "2026-08", line: "国际课程", name: "首课试听社群海报", type: "社群海报", skus: ["灵活学Lite"], images: 1, note: "" },
];

export const sampleMessages = [
  { role: "user", text: "帮我写一版开学季海报主标题，突出安心学Max 两门8折。" },
  { role: "assistant", text: "给你三个方向：\n1. 开学不慌，两门8折稳稳拿下\n2. 新学期，安心学：2门及以上享8折\n3. 选课季专享｜安心学Max 两门8折" },
];
