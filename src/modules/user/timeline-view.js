export function monthTimelineData(tl, month, country = '', query = '') {
  const [year, m] = month.split('-').map(Number);
  const first = `${month}-01`, last = `${month}-${new Date(year, m, 0).getDate()}`;
  const matches = text => !query || text.toLowerCase().includes(query.toLowerCase());
  const inMonth = tl.agenda.filter(e => e.from <= last && (e.to || e.from) >= first);
  const pending = tl.anomalies.filter(a => !a.ruling && (a.monthHints || []).some(h => h === month || h === `*-${month.slice(5)}`)
    && !tl.agenda.some(e => e.src === a.src && e.from <= last && (e.to || e.from) >= first));
  const count = c => ({
    dated: new Set(inMonth.filter(e => !c || e.c === c).map(e => `${e.c}|${e.school}`)).size,
    pending: new Set(pending.filter(a => !c || a.c === c).map(a => `${a.c}|${a.school}`)).size,
    total: tl.countries.filter(([, name]) => !c || name === c).reduce((n, [code]) => n + (tl.table[code]?.length || 0), 0),
  });
  const calendar = (tl.calendarEntries || []).filter(e => e.month === month && (!country || e.countries.includes(country)) && matches(`${e.raw}${e.schools.join(" ")}${e.countries.join(" ")}`));
  return { inMonth, count,
    list: inMonth.filter(e => (!country || e.c === country) && matches(`${e.school}${e.type}${e.detail || ''}`)),
    pending: pending.filter(a => (!country || a.c === country) && matches(`${a.school}${a.issue}${a.a}`)), calendar,
  };
}
