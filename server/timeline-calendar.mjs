// 月历是地区明细的第二份来源。保留每个原文格和位置，不把格位或“去年”转成确定日期。
const compact = s => String(s || '').replace(/\s+/g, '').toLowerCase();
export function readCalendarEntries(sheets, table, countries, year = 2026, tag = '') {
  const schools = countries.flatMap(([code, country]) => (table[code] || []).map(row => ({
    country, school: [row.school, row.abbr].filter(Boolean).join(' '),
    aliases: [row.school, row.abbr].filter(s => s && s.length >= 2),
  })));
  const entries = [];
  for (const sheet of sheets) {
    const month = Number(sheet.name.match(/(\d{1,2})月$/)?.[1]);
    if (!(month >= 1 && month <= 12)) continue;
    for (const row of sheet.rows) for (let col = 0; col < row.values.length; col++) {
      const raw = row.values[col].trim();
      if (!raw || row.row <= 2 || /^(?:MON|TUES?|WED|THURS?|FRI|SAT|SUN)$/i.test(raw) || /^\d{1,2}月\d{1,2}日$/.test(raw)) continue;
      const text = compact(raw);
      const matches = schools.filter(s => s.aliases.some(alias => {
        if (/^[a-z0-9 ]+$/i.test(alias)) return new RegExp(`(?<![a-z])${alias.replace(/ /g, '')}(?![a-z])`, 'i').test(text);
        return text.includes(compact(alias));
      }));
      entries.push({ month: `${year}-${String(month).padStart(2, '0')}`, raw, src: `${tag ? `${tag}·` : ''}${sheet.name}!${sheet.cols[col]}${row.row}`,
        schools: matches.map(s => s.school), countries: [...new Set(matches.map(s => s.country))] });
    }
  }
  return entries;
}
