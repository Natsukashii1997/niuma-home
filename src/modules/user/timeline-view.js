export const timelineResolved = a => Boolean(a.ruling || a.verification?.status === 'confirmed');

export function monthTimelineData(tl, month, country = '', query = '') {
  const [year, m] = month.split('-').map(Number);
  const first = `${month}-01`, last = `${month}-${new Date(year, m, 0).getDate()}`;
  const matches = text => !query || text.toLowerCase().includes(query.toLowerCase());
  const inMonth = tl.agenda.filter(e => e.from <= last && (e.to || e.from) >= first);
  const pending = tl.anomalies.filter(a => !timelineResolved(a) && (a.monthHints || []).some(h => h === month || h === `*-${month.slice(5)}`)
    && !tl.agenda.some(e => e.src === a.src && e.from <= last && (e.to || e.from) >= first));
  // 仅供展示：保留原文，不为历史日期或缺年跨年记录伪造今年的起止日期。
  const pendingEvents = pending.map(a => ({c:a.c,school:a.school,type:a.cell?.type || a.cell?.header || '事项待确认',src:a.src,
    from:null,to:null,pending:true,flag:'guess',raw:a.a,issue:a.issue,verification:a.verification}));
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
