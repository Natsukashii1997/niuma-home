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
