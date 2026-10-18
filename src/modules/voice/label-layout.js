// Voice 热度趋势图末端标签避让（方案见 docs/handoff/T10/Voice标签避让方案.md）。
// 只算标签的纵向位置，不动折线、方点和热度；全部用 SVG viewBox 单位。
// 稳定排序（按真实末点 y，再按 id）→ 自上而下推开 → 超出底边时自下而上回压；放不下时退化为图例。
export function labelLayout(topics, { H = 220, T = 12, B = 26, h = 16, g = 6 } = {}) {
  const n = topics.length, band = H - T - B, D = h + g;
  if (!n) return { mode: "labels", labels: [] };
  if (n * h + (n - 1) * g > band) return { mode: "legend", ids: topics.map((t) => t.id) };
  const low = T + h / 2, high = H - B - h / 2;
  const a = topics.map((t) => ({ id: t.id, pointY: T + (1 - t.spark.at(-1) / 100) * band }));
  a.sort((p, q) => p.pointY - q.pointY || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  a.forEach((p, i) => {
    p.labelY = Math.min(high, Math.max(low, p.pointY));
    if (i) p.labelY = Math.max(p.labelY, a[i - 1].labelY + D);
  });
  if (a[n - 1].labelY > high) {
    a[n - 1].labelY = high;
    for (let i = n - 2; i >= 0; i--) a[i].labelY = Math.min(a[i].labelY, a[i + 1].labelY - D);
  }
  return { mode: "labels", labels: a };
}

// 字形包围盒 → 统一槽高。a、b 是文字包围盒顶、底相对 baseline 的偏移；标签中心 = baseline − 4。
export function slotHeight(boxes) {
  let half = 8;
  for (const { a, b } of boxes) half = Math.max(half, Math.ceil(-(a + 4)), Math.ceil(b + 4));
  return half * 2;
}
