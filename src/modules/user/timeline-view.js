export const timelineResolved = a => Boolean(a.ruling || a.verification?.status === 'confirmed');

// 仅清理常用展示标签；原文仍留在 raw 和悬停详情，不改来源或核实状态。
export function timelineReferenceText(raw = '') {
  return raw.replace(/https?:\/\/\S+/g, '').replace(/[（(]\s*(?:去年(?:参考)?|待确认|(?:AI\s*)?推测)\s*[）)]/gi, '').trim();
}

// 月日只决定视图上的位置，绝不填入 from/to 或年度排期。
export function pendingMonthSpan(raw, month) {
  const text = timelineReferenceText(raw);
  const date = '(?:(?:\\d{4})[./年-])?(\\d{1,2})[./月-](\\d{1,2})日?';
  const match = text.match(new RegExp(`^${date}(?:\\s*[-–—~～至到]\\s*${date})?$`));
  if (!match) return null;
  const [year, current] = month.split('-').map(Number);
  const [sm, sd, em = sm, ed = sd] = match.slice(1).map(v => v === undefined ? undefined : Number(v));
  const valid = (m, d) => m >= 1 && m <= 12 && d >= 1 && d <= new Date(year, m, 0).getDate();
  if (!valid(sm, sd) || !valid(em, ed) || (sm === em && ed < sd)) return null;
  if (sm <= em ? current < sm || current > em : current < sm && current > em) return null;
  return { start: current === sm ? sd : 1, end: current === em ? ed : new Date(year, current, 0).getDate(), single: !match[3] };
}

export function monthTimelineData(tl, month, country = '', query = '') {
  const [year, m] = month.split('-').map(Number);
  const first = `${month}-01`, last = `${month}-${new Date(year, m, 0).getDate()}`;
  const matches = text => !query || text.toLowerCase().includes(query.toLowerCase());
  const inMonth = tl.agenda.filter(e => e.from <= last && (e.to || e.from) >= first);
  const pending = tl.anomalies.filter(a => !timelineResolved(a) && (a.monthHints || []).some(h => h === month || h === `*-${month.slice(5)}`)
    && !tl.agenda.some(e => e.src === a.src && e.from <= last && (e.to || e.from) >= first));
  // 仅供展示：保留原文，不为历史日期或缺年跨年记录伪造今年的起止日期。
  const pendingEvents = pending.map(a => ({c:a.c,school:a.school,type:a.cell?.type || a.cell?.header || '事项待确认',src:a.src,
    from:null,to:null,pending:true,flag:'guess',raw:a.a,displaySpan:pendingMonthSpan(a.a,month),issue:a.issue,verification:a.verification}));
  const events = [...inMonth,...pendingEvents];
  const count = c => ({
    dated: new Set(inMonth.filter(e => !c || e.c === c).map(e => `${e.c}|${e.school}`)).size,
    pending: new Set(events.filter(e => (e.pending || e.flag === 'guess' || e.flag === 'conflict') && (!c || e.c === c)).map(e => `${e.c}|${e.school}`)).size,
    total: tl.countries.filter(([, name]) => !c || name === c).reduce((n, [code]) => n + (tl.table[code]?.length || 0), 0),
    shown: new Set(events.filter(e => !c || e.c === c).map(e => `${e.c}|${e.school}`)).size,
  });
  const calendar = (tl.calendarEntries || []).filter(e => e.month === month && (!country || e.countries.includes(country)) && matches(`${e.raw}${e.schools.join(" ")}${e.countries.join(" ")}`));
  return { inMonth, count,
    list: events.filter(e => (!country || e.c === country) && matches(`${e.school}${e.type}${e.detail || ''}${e.raw || ''}`)),
    pending: pending.filter(a => (!country || a.c === country) && matches(`${a.school}${a.issue}${a.a}`)), calendar,
  };
}
