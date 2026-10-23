// 业务图表的纯计算：刻度、当月判断与推算、前 N 名 + 其他、面积块排布。不依赖 React，测试见 tests/business-chart-math.test.mjs。

// 取整刻度：步长取 1 / 2 / 2.5 / 5 × 10 的整数次方，约 count 段（用户 2026-10-23）
export function niceScale(lo, hi, count = 4) {
  const raw = (hi - lo) / count || 1, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  const min = Math.floor(lo / step) * step, max = Math.ceil(hi / step) * step;
  const ticks = Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + step * i);
  return { min, max, ticks };
}

// 数据所属月份与读取当天（北京时间，来自接口的 period / updatedAt，不用浏览器本机时间）。
// 读取当天已是月末则视为整月，不再标「至今」、不推算。
export function monthContext(period, updatedAt) {
  const [year, month] = period.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const sameMonth = updatedAt?.slice(0, 7) === period;
  const day = sameMonth ? Number(updatedAt.slice(8, 10)) : daysInMonth;
  return { year, month, day, daysInMonth, partial: day < daysInMonth };
}

// 折线图（横轴月份、系列为年份）整理成「今年 / 去年」两条，并算出当月、推算与累计。
// 累计只算当月之前、今年有值的月份；去年取同样的月份，保证同口径。转化率的累计取均值。
export function yearTrend(chart, ctx) {
  const pick = y => chart.series.find(s => s.name === String(y))?.values || chart.categories.map(() => null);
  const now = pick(ctx.year), last = pick(ctx.year - 1);
  const monthOf = c => Number(c);
  const cur = chart.dimension === "月份" ? chart.categories.findIndex(c => monthOf(c) === ctx.month) : -1;
  const partial = ctx.partial && cur >= 0 && now[cur] != null ? cur : -1;
  const before = chart.categories.map((c, i) => i).filter(i => monthOf(chart.categories[i]) < ctx.month && now[i] != null && last[i] != null);
  const isPct = chart.unit === "percent";
  const agg = arr => { const s = before.reduce((a, i) => a + arr[i], 0); return isPct ? s / (before.length || 1) : s; };
  const ytd = before.length ? agg(now) : null, ytdLast = before.length ? agg(last) : null;
  const value = cur >= 0 ? now[cur] : null, lastSame = cur >= 0 ? last[cur] : null;
  // 推算只对金额做：按已过天数线性外推，标「示意」，不含月底冲量
  const pace = !isPct && partial >= 0 ? value / ctx.day * ctx.daysInMonth : null;
  const best = now.reduce((b, v, i) => (v != null && i !== partial && (b < 0 || v > now[b]) ? i : b), -1);
  return { categories: chart.categories, unit: chart.unit, now, last, cur, partial, value, lastSame, pace, ytd, ytdLast, ytdYoY: ytd != null && ytdLast ? (isPct ? ytd - ytdLast : ytd / ytdLast - 1) : null, ytdMonths: before.length, best };
}

// 同比：金额为比率，转化率为百分点差；当月未过完时金额用推算值比。
export function yoy(t, i) {
  const a = i === t.partial ? t.pace ?? null : t.now[i], b = t.last[i];
  if (a == null || b == null || (t.unit !== "percent" && !b)) return null;
  return { value: t.unit === "percent" ? a - b : a / b - 1, estimated: i === t.partial };
}

// 占比：按金额降序并带上占比；只有一项「未填写」视为源表未反写。
export function shareItems(chart) {
  const items = [...chart.items].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)).map(i => ({ ...i, share: chart.pieAvailable ? i.value / chart.total : null }));
  return { items, total: chart.total, count: items.length, available: chart.pieAvailable, onlyBlank: items.length === 1 && items[0].label === "未填写" };
}

// 前 n 项 + 「其他 k 项」（其他永远在最后）；只多 1 项时不折叠。
export function topN(items, n) {
  if (items.length <= n + 1) return items;
  const rest = items.slice(n), value = rest.reduce((a, i) => a + (i.value || 0), 0), share = rest.reduce((a, i) => a + (i.share || 0), 0);
  return [...items.slice(0, n), { label: `其他 ${rest.length} 项`, value, share, other: true, count: rest.length }];
}

// 面积块（squarified treemap）：按 value 把 W×H 切成矩形，返回 [{ item, x, y, w, h }]，面积之和等于 W×H。
export function squarify(items, W, H) {
  const total = items.reduce((a, i) => a + i.value, 0), out = [];
  if (!total || W <= 0 || H <= 0) return out;
  let rest = items.filter(i => i.value > 0).map(item => ({ item, a: item.value / total * W * H }));
  let x = 0, y = 0, w = W, h = H;
  const worst = (row, side) => {
    const s = row.reduce((a, r) => a + r.a, 0), mx = Math.max(...row.map(r => r.a)), mn = Math.min(...row.map(r => r.a));
    return Math.max(side * side * mx / (s * s), (s * s) / (side * side * mn));
  };
  while (rest.length) {
    const side = Math.min(w, h);
    let row = [rest[0]], i = 1;
    while (i < rest.length && worst([...row, rest[i]], side) <= worst(row, side)) row.push(rest[i++]);
    rest = rest.slice(i);
    const s = row.reduce((a, r) => a + r.a, 0);
    if (w >= h) {
      const cw = rest.length ? s / h : w;
      let cy = y;
      row.forEach(r => { const ch = r.a / cw; out.push({ item: r.item, x, y: cy, w: cw, h: ch }); cy += ch; });
      x += cw; w -= cw;
    } else {
      const ch = rest.length ? s / w : h;
      let cx = x;
      row.forEach(r => { const rw = r.a / ch; out.push({ item: r.item, x: cx, y, w: rw, h: ch }); cx += rw; });
      y += ch; h -= ch;
    }
  }
  return out;
}
