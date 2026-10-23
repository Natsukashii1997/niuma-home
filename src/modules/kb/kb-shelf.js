// 知识库书架的纯函数（便于测试）：书名清理、竖排切词、断列、系列、一层的摆放、按宽度装行、柜顶书摞、近几天更新。
// 竖排的字宽由页面实测后传进来；中文分词也由外面给（浏览器用 Intl.Segmenter；Node 和 Chrome 的分词不完全一样，测试里固定分词）。

// 书脊、卡片上不显示彩色 emoji（🈷️ ✅ ☑️ 会破坏黑白位图风）；书脊上再去掉文件扩展名。
const EMOJI = /[\p{Extended_Pictographic}\u{1F000}-\u{1F2FF}️‍⃣]/gu;
export const cleanName = (s) => String(s ?? "").replace(EMOJI, "").replace(/\s+/g, " ").trim();
export const spineName = (s) => cleanName(s).replace(/\.(pdf|docx?|xlsx?|pptx?)$/i, "");

// 「01｜公司与行业认知」→ ["01", "公司与行业认知"]；没有编号 → ["", 原名]。层名和柜顶横放的书都用。
export function splitNumber(s) {
  const m = /^(\d{1,3})[｜|丨]\s*(.+)$/.exec(s);
  return m ? [m[1], m[2]] : ["", s];
}

// ---- 竖排切词 ----
const OPEN = "（「『【《(〈", CLOSE = "、，。：；）」』】》)!?！？…〉,.", SEP = "丨｜-－—–·/";
// 两位以内横排压成一格（7月、T1、AI）；3–4 位数字或全大写缩写逐字竖立（2025、FAQ）；其余英文和版本号侧转（Brief、V1.3）。
export const latinKind = (t) => (t.length <= 2 ? "tcy" : /^(\d{3,4}|[A-Z]{3,4})$/.test(t) ? "up" : "side");
export const isLatin = (t) => t.k === "tcy" || t.k === "up" || t.k === "side";
export function tokenize(s) {
  const out = [];
  for (const [t] of String(s).matchAll(/[A-Za-z0-9](?:[A-Za-z0-9.+_]*[A-Za-z0-9])?|\s+|[\s\S]/gu)) {
    if (/^\s+$/.test(t)) out.push({ t: " ", k: "sp" });
    else if (/^[A-Za-z0-9]/.test(t)) out.push({ t, k: latinKind(t) });
    else out.push({ t, k: SEP.includes(t) ? "sep" : CLOSE.includes(t) ? "close" : OPEN.includes(t) ? "open" : "cjk" });
  }
  return out;
}

// 分词会切开、但书脊上不该拆的词：品牌名和几个常用复合词。
export const ATOMS = ["路觅教育", "路觅", "工作流", "工作台", "全链路", "方法论", "仪表盘", "时间线", "价值链", "新员工", "管培生", "双十一", "知识库", "机器人", "实验室"];
let segmenter = null;
function defaultSegment(str) {
  if (typeof Intl.Segmenter !== "function") return [...str].map((_, i) => i); // 没有分词：每个字都算词边界
  segmenter ||= new Intl.Segmenter("zh-Hans", { granularity: "word" });
  return [...segmenter.segment(str)].map((x) => x.index);
}
// 词的起点（字符下标）。segment(str) 返回分词结果每个词的起点；ATOMS 里的词内部不算起点。
export function wordStarts(str, segment = defaultSegment) {
  const set = new Set(segment(str));
  for (const w of ATOMS) for (let i = str.indexOf(w); i >= 0; i = str.indexOf(w, i + 1)) for (let k = i + 1; k < i + w.length; k++) set.delete(k);
  return set;
}

// ---- 断列 ----
// toks 来自 tokenize；adv[i] 是第 i 个词实测的竖向长度（px）；cap 是一列能放的长度；starts 来自 wordStarts。
// 一列放得下就一列；否则在 2、3 列里找各列都放得下、代价最小的断法；3 列也放不下就尽量装满并截断（more = true）。
// 代价 = 各列长短差的一半 + 断点代价：在「-」「丨」、空格处断开（并去掉这个符号）-30；括号前后、中英文交界 5；
// 词边界 20；词中间 120；有一列短于两个字（27px）再加 300。数字之间的「-」（2026-10）、数字和后面的「月 / 年…」不拆。
const MIN_COL = 27;
export function breakColumns(toks, adv, cap, starts) {
  const n = toks.length;
  const len = (i, j) => { let s = 0; for (let x = i; x < j; x++) s += adv[x]; return s; };
  if (len(0, n) <= cap + 0.5) return { segs: [[0, n]], more: false };
  const off = [];
  toks.reduce((o, t, i) => { off[i] = o; return o + t.t.length; }, 0);
  const cuts = [];
  for (let i = 1; i < n; i++) {
    const p = toks[i - 1], c = toks[i];
    const numDash = c.k === "sep" && isLatin(p) && toks[i + 1] && isLatin(toks[i + 1]);
    if ((c.k === "sep" || c.k === "sp") && i < n - 1 && !numDash) { cuts.push({ end: i, start: i + 1, pen: -30 }); continue; }
    if (numDash || p.k === "open" || p.k === "sep" || p.k === "sp" || c.k === "close") continue;
    if (/^[月年日号期版]$/.test(c.t) && isLatin(p)) continue;
    cuts.push({ end: i, start: i, pen: p.k === "close" || c.k === "open" || isLatin(p) !== isLatin(c) ? 5 : starts.has(off[i]) ? 20 : 120 });
  }
  const segsOf = (cs) => { const s = []; let at = 0; for (const c of cs) { s.push([at, c.end]); at = c.start; } s.push([at, n]); return s; };
  for (const k of [2, 3]) {
    let best = null;
    const tryCuts = (cs) => {
      const segs = segsOf(cs), L = segs.map(([i, j]) => len(i, j));
      if (L.some((l) => l > cap + 0.5)) return;
      const score = (Math.max(...L) - Math.min(...L)) / 2 + cs.reduce((s, c) => s + c.pen, 0) + (L.some((l) => l < MIN_COL) ? 300 : 0);
      if (!best || score < best.score) best = { score, segs };
    };
    if (k === 2) cuts.forEach((c) => tryCuts([c]));
    else cuts.forEach((c1, x) => cuts.slice(x + 1).forEach((c2) => { if (c2.end > c1.start) tryCuts([c1, c2]); }));
    if (best) return { segs: best.segs, more: false };
  }
  const segs = [];
  let at = 0;
  for (let k = 0; k < 3 && at < n; k++) {
    let e = at, l = 0;
    const lim = k === 2 ? cap - 16 : cap; // 最后一列留出省略号
    while (e < n && l + adv[e] <= lim) l += adv[e++];
    if (e === at) e = at + 1; // 单个词比一列还长：硬放，靠书脊裁掉
    segs.push([at, e]);
    at = e;
    while (at < n && toks[at].k === "sp") at++;
  }
  return { segs, more: at < n };
}

// ---- 一层的摆放 ----
// 系列：同一层里 ≥2 本书在最后一个「-」之前（或之后）完全相同，就并成一组：书脊只写不同的那半截，组名写在上方括号里。
// 一本书只进一组：先给大组，同样大小先给组名长的。返回 id → { key, label, part }。
export function seriesOf(list) {
  const cand = new Map();
  for (const n of list) {
    const nm = spineName(n.name), i = Math.max(nm.lastIndexOf("-"), nm.lastIndexOf("－"), nm.lastIndexOf("—"));
    if (i < 2 || i > nm.length - 3) continue;
    const pre = nm.slice(0, i).trim(), suf = nm.slice(i + 1).trim();
    for (const [key, label, part] of [[`前${pre}`, pre, suf], [`后${suf}`, suf, pre]]) (cand.get(key) || cand.set(key, []).get(key)).push({ id: n.id, label, part });
  }
  const res = new Map();
  [...cand.entries()].filter(([, v]) => v.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || b[1][0].label.length - a[1][0].label.length)
    .forEach(([key, v]) => { if (!v.some((x) => res.has(x.id))) v.forEach((x) => res.set(x.id, { key, label: x.label, part: x.part })); });
  return res;
}

// 一层的摆放顺序：档案盒（子目录）在前，其余按飞书原顺序；同系列的书挪到这一系列第一本的位置，挨在一起。
// 返回 { kind: "one", node, label } 或 { kind: "series", label, members: [{ node, label }] }；label 是书脊上要写的字。
export function shelfItems(kids, { series = true } = {}) {
  const sorted = [...kids.filter((k) => k.kids), ...kids.filter((k) => !k.kids)];
  const ser = series ? seriesOf(sorted) : new Map(), done = new Set(), out = [];
  for (const k of sorted) {
    const s = ser.get(k.id);
    if (!s) { out.push({ kind: "one", node: k, label: k.name }); continue; }
    if (done.has(s.key)) continue;
    done.add(s.key);
    out.push({ kind: "series", label: s.label, members: sorted.filter((x) => ser.get(x.id)?.key === s.key).map((x) => ({ node: x, label: ser.get(x.id).part })) });
  }
  return out;
}

// 按宽度装行：这一行放不下就换一行（多一块层板）；比整行还宽的项单独一行。返回 [[{ i, x, w }]]。
export function packRows(widths, avail, gap) {
  const rows = [];
  let cur = [], x = 0;
  widths.forEach((w, i) => {
    if (cur.length && x + gap + w > avail) { rows.push(cur); cur = []; x = 0; }
    const at = cur.length ? x + gap : 0;
    cur.push({ i, x: at, w });
    x = at + w;
  });
  if (cur.length) rows.push(cur);
  return rows;
}

// 柜顶的待上架：按飞书顺序每 size 本一摞，每摞窄的压在宽的上面（按书名长短）。
export function piles(nodes, size = 3) {
  const out = [];
  nodes.forEach((n, i) => (out[Math.floor(i / size)] ||= []).push(n));
  return out.map((p) => [...p].sort((a, b) => spineName(a.name).length - spineName(b.name).length));
}

// 近几天更新（含今天）：updated、today 都是 YYYY-MM-DD。书顶夹一张橙色书签。
export function isRecent(updated, today, days = 3) {
  if (!updated || !today) return false;
  const d = (Date.parse(today) - Date.parse(updated)) / 864e5;
  return d >= 0 && d < days;
}
export const todayOf = (now = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
