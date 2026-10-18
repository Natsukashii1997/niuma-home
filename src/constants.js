export const LINES = ["大学辅导", "国际课程", "申诉服务"];

// 交付月的 6 个环节：接口返回其余 5 个，「方案录入」由前端用 /api/plans 算出，固定放在第 2 位。
// 未接入的环节（state 为 pending，或旧接口在 meta 里写「未接入」）统一显示「待接入」，原文放悬停提示。
export function deliverySteps(steps = [], plans, month) {
  const done = plans ? LINES.filter((l) => plans.some((p) => p.month === month && p.line === l)) : [];
  const plan = {
    key: "plans", label: "方案录入", href: "#/marketing/plans",
    state: done.length === LINES.length ? "done" : done.length ? "part" : "todo",
    meta: plans ? `${done.length}/${LINES.length} 条业务线已录` : "读取中", // 一行写完；待录的业务线名放悬停提示
    note: plans && done.length < LINES.length ? `待录 ${LINES.filter((l) => !done.includes(l)).join("、")}` : undefined,
  };
  const rest = steps.filter((s) => s.key !== "plans").map((s) => (s.state === "pending" || /未接入/.test(s.meta || "")
    ? { ...s, state: "todo", meta: "待接入", note: s.note || s.meta } : s));
  return [...rest.slice(0, 1), plan, ...rest.slice(1)];
}

export const PROMO_FIELDS = [
  ["trial", "试听价格"],
  ["price", "正价价格"],
  ["newDeal", "新签活动"],
  ["renewal", "续费活动"],
];

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month) {
  const [y, m] = month.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

// v3：月份工具。工作节奏是「本月准备下月，月底前交付」，所以默认定位到交付月。
export function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function deliveryMonth() {
  return shiftMonth(currentMonth(), 1);
}

// 交付截止 = 交付月的前一个月最后一天；返回剩余天数（今天算 0 天前）。
export function daysToDeadline(month, now = new Date()) {
  const [y, m] = month.split("-").map(Number);
  const deadline = new Date(y, m - 1, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((deadline - today) / 86400000);
}

export const shortMonth = (month) => `${Number(month.slice(5))} 月`;

// ISO 周次「YYYY-Www」（周一为一周开始），按本地日期计算。
export function isoWeek(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7; // 周一 = 0
  d.setDate(d.getDate() - day + 3); // 移到本周四
  const firstThu = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

// 本地日期「YYYY-MM-DD」（不用 toISOString，避免时区把日期推到前一天）。
export const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
