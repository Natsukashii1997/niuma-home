import { currentMonth, shiftMonth } from "../../constants.js";

// 预留列属于展示，不写入 NAS 快照，也不截掉已存在的未来月份。
export function materialMonths(sourceMonths = [], month = currentMonth()) {
  return [...new Set([...sourceMonths, month, shiftMonth(month, 1)])].sort();
}
