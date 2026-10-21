// 不推断缺失日、年份或学期；完整的多个区间分别保留，不能包成连续长区间。
const withoutUrls = value => String(value || '').replace(/https?:\/\/[^\s）)]+/g, '').trim();
const pad = n => String(n).padStart(2, '0');

export function parseDateSegments(raw, header, year, parseOne) {
  const normalized = raw.replace(/([~～–—])\s*\.(?=\d{1,2}[./-])/g, '$1');
  const original = parseOne(normalized, header, year);
  if (original.from || original.empty || /去年/.test(raw)) return [original];
  const text = withoutUrls(raw);
  // 只接受可分离的完整日期列表，不从“之前/左右/结束”这样的语义中猜一个确定日期。
  const chunks = text.split(/[\n;；&、,，]+/).map(s => s.trim()).filter(Boolean);
  if (!chunks.length) return [original];
  const out = [];
  let contextYear = year, currentLabel;
  for (const chunk of chunks) {
    const named = chunk.match(/^(.+?)[:：]\s*((?:20\d{2}[年./-])?\d{1,2}[月./-]\d{1,2}.*)$/);
    if (named) currentLabel = named[1].trim();
    const label = currentLabel;
    const value = named ? named[2] : chunk;
    const parsed = parseOne(value, header, contextYear);
    if (!parsed.from) return [original]; // 不部分吞掉同格中仍未理解的内容。
    if (label) {
      parsed.label = label;
      parsed.flag = 'guess';
      parsed.issue = '来源分学期、课程或适用对象列出，保留分段条件待确认';
    }
    if (/(?:20\d{2})[年./-]/.test(value)) contextYear = Number(parsed.from.slice(0, 4));
    out.push(parsed);
  }
  return out.length > 1 || out[0].label ? out : [original];
}

// 这里只确定“原文提到哪些月份”，不生成日期。无年跨年、去年参考用月份索引，明确年份则只出现在该年。
export function timelineMonthHints(raw, year = 2026) {
  const s = withoutUrls(raw).replace(/(20\d{2})([一二三四五六七八九十]+)月/g, (_, y, m) => `${y}年${['一','二','三','四','五','六','七','八','九','十','十一','十二'].indexOf(m) + 1}月`);
  const historical = /去年/.test(raw);
  const re = /(?<![\d.])(?:(20\d{2}|\d{2})(?:年|[./-]))?(1[0-2]|0?[1-9])(?:月|[./-](?=\d|上|中|下|初|底))/g;
  const hits = [...s.matchAll(re)].map(m => ({
    index: m.index, end: m.index + m[0].length, explicit: Boolean(m[1]),
    year: m[1] ? Number(m[1].length === 2 ? `20${m[1]}` : m[1]) : null, month: Number(m[2]),
  }));
  const values = new Set();
  let context = year;
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i], next = hits[i + 1];
    if (h.year) context = h.year;
    const key = (m, y) => historical ? `*-${pad(m)}` : `${y}-${pad(m)}`;
    values.add(key(h.month, context));
    if (!next) continue;
    const between = s.slice(h.end, next.index);
    if (/^\d{0,2}(?:[日号]|上旬|中旬|下旬|月初|月底|初|底)?\s*[-~～–—至到]\s*$/.test(between)) {
      const targetYear = next.year || context + Number(next.month < h.month);
      if (targetYear * 12 + next.month - (context * 12 + h.month) <= 12) {
        for (let x = context * 12 + h.month; x <= targetYear * 12 + next.month; x++) {
          const m = (x - 1) % 12 + 1, y = Math.floor((x - 1) / 12);
          // 无明确年份的跨年记录只作同月参考，不擅自确定属于哪一学年。
          if (!h.explicit && !next.explicit && next.month < h.month) values.add(`*-${pad(m)}`);
          else values.add(key(m, y));
        }
      }
    }
  }
  for (const m of s.matchAll(/(?<!\d)(20\d{2})[年./](1[0-2]|0?[1-9])(?=$|[^\d./-])/g)) values.add(historical ? `*-${pad(m[2])}` : `${m[1]}-${pad(m[2])}`);
  return [...values].sort();
}
