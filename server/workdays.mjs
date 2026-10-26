// 工作日历：培养路径按工作日排期（D1 = 入职日）。周一到周五算工作日，法定节假日不算，调休上班的周末算。
// 节假日照国务院办公厅每年的放假安排录入；没录入的年份只按周一到周五算，coverage 会告诉页面哪些年份缺。
// 2026：国务院办公厅关于 2026 年部分节假日安排的通知（2025-11-04 发布）。
const range = (from, to) => { const out = []; for (let d = from; d <= to; d = shift(d, 1)) out.push(d); return out; };
const shift = (ymd, n) => { const t = new Date(`${ymd}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export const HOLIDAYS = {
  2026: {
    off: [...range('2026-01-01', '2026-01-03'), ...range('2026-02-15', '2026-02-23'), ...range('2026-04-04', '2026-04-06'), ...range('2026-05-01', '2026-05-05'),
      ...range('2026-06-19', '2026-06-21'), ...range('2026-09-25', '2026-09-27'), ...range('2026-10-01', '2026-10-07')],
    on: ['2026-01-04', '2026-02-14', '2026-02-28', '2026-05-09', '2026-09-20', '2026-10-10'],
  },
};
const OFF = new Set(Object.values(HOLIDAYS).flatMap(y => y.off)), ON = new Set(Object.values(HOLIDAYS).flatMap(y => y.on));

export function isWorkday(ymd) {
  if (ON.has(ymd)) return true;
  if (OFF.has(ymd)) return false;
  const w = new Date(`${ymd}T00:00:00Z`).getUTCDay();
  return w !== 0 && w !== 6;
}

// 从 start 起的前 n 个工作日（start 不是工作日就从下一个工作日算起）：dates[0] 是 D1
export function workdays(start, n) {
  const out = [];
  for (let d = start; out.length < n; d = shift(d, 1)) if (isWorkday(d)) out.push(d);
  return out;
}

// 某天是第几个工作日：当天不是工作日就算到它之前最近的一个工作日；早于入职日为 0
export function dayIndex(start, ymd) {
  if (ymd < start) return 0;
  let n = 0;
  for (let d = start; d <= ymd; d = shift(d, 1)) if (isWorkday(d)) n++;
  return n;
}

// 这段日期里哪些年份没录节假日（页面提示「按周一到周五算」）
export function missingYears(from, to) {
  const out = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) if (!HOLIDAYS[y]) out.push(y);
  return out;
}
