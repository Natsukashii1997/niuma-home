export const LINES = ["大学辅导", "国际课程", "申诉服务"];

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
