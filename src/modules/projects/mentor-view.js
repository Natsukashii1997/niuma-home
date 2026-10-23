const replyTime = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// 回复回执保留带时区的 ISO 时间；只在显示时转换为北京时间。
export function mentorReplyTime(value) {
  if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : replyTime.format(date).slice(5);
}
