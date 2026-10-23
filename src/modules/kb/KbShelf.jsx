import { Fragment, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PixelIcon, frames, prefersReducedMotion } from "../../ui/bitmap.jsx";
import { countDocs, currentDirectory, locate } from "./kb-canvas.js";
import { breakColumns, cleanName, isRecent, packRows, piles, shelfItems, spineName, splitNumber, todayOf, tokenize, wordStarts } from "./kb-shelf.js";

// 知识库书架（用户 2026-10-23 从三轮设计稿里选定「V4 书架精修」，稿件 docs/design-drafts/kb/v4-2.html，本地不入库）：
// - 一整个书柜，两格并排（窄于 640 一格）；一个一级目录是一层，一层放不下就多加一块层板。
// - 书一律等高，书名竖排、从同一条线起排，按页面实测的字宽断列。类型只看书尾：文档白、表格网点、多维表墨、文件虚线框；
//   近 3 天更新的书顶上夹一张橙色书签。不显示「快捷」标记（用户 10-23）。
// - 子目录是档案盒：点开变成敞口盒，书逐帧取出；盒里还有盒，点它就在原盒里进入，盒盖上写路径、可逐级返回（用户 10-23）。
// - 根目录下没进分组的文档横放在柜顶「待上架」，三本一摞。
// - 悬停或聚焦一本书：按帧抽出两格，再弹一张卡（全名、类型、更新、摘要、位置）。⌘K 打开某篇时开盒、抽出这本。
// - 搜索：没命中的层收成一行，含命中的盒子自动打开，没命中的书退成灰线。

const H = 188, LID = 32, IH = H - 4 - LID - 6; // 层里的书高；盒盖；敞口盒里的书高
const COLW = 17, PADX = 7, TOP = 16, TAIL = 26, GAP = 8, SGAP = 4; // 竖排一列宽；书脊两侧留白；书名上下留白；书间距；系列和盒里的书间距
const capOf = (h, box) => h - 4 - TOP - TAIL - (box ? 6 : 0); // 一列能放多长
const TYPE_ZH = { docx: "文档", doc: "旧文档", sheet: "表格", bitable: "多维表", file: "文件", slides: "幻灯片", mindnote: "思维笔记" };
const tailOf = (type) => ({ sheet: " t-sheet", bitable: " t-bitable", file: " t-file" })[type] || "";
const mmdd = (s) => (s ? s.slice(5) : "—");

// ---- 竖排实测：在一个隐藏的竖排元素里量每个词的竖向长度；字体加载完清空重量 ----
const ADV = new Map(), SPINES = new Map();
let meter = null;
const advKey = (t, bold) => `${bold ? 1 : 0}${t.k}\u0000${t.t}`;
const tcyNode = (s) => Object.assign(document.createElement("span"), { className: "kbs-tcy", textContent: s });
const tokNodes = (t) => (t.k === "tcy" ? [tcyNode(t.t)] : t.k === "up" ? [...t.t].map(tcyNode) : [t.t]);
function measure(toks, bold) {
  const need = [...new Map(toks.filter((t) => !ADV.has(advKey(t, bold))).map((t) => [advKey(t, bold), t])).values()];
  if (!need.length) return;
  if (!meter) { meter = document.createElement("div"); meter.className = "kbs-meter"; meter.setAttribute("aria-hidden", "true"); document.body.append(meter); }
  const spans = need.map((t) => { const s = document.createElement("span"); s.className = bold ? "is-bold" : ""; s.append(...tokNodes(t)); return s; });
  meter.replaceChildren(...spans.flatMap((s) => [s, document.createElement("br")]));
  spans.forEach((s, i) => ADV.set(advKey(need[i], bold), s.getBoundingClientRect().height));
  meter.replaceChildren();
}
// 书脊上的字：切词 → 实测 → 断列（档案盒用粗体、两侧多留 6px）。同样的字和高度只算一次。
function spine(label, h, box) {
  const key = `${box ? 1 : 0}${h}\u0000${label}`;
  if (SPINES.has(key)) return SPINES.get(key);
  const toks = tokenize(spineName(label) || "未命名"), cap = capOf(h, box);
  measure(toks, box);
  const adv = toks.map((t) => ADV.get(advKey(t, box)) || 14);
  const { segs, more } = breakColumns(toks, adv, cap, wordStarts(toks.map((t) => t.t).join("")));
  const out = { cap, more, cols: segs.map(([i, j]) => toks.slice(i, j)) };
  SPINES.set(key, out);
  return out;
}
let ctx = null;
function textWidth(text, weight, size) {
  ctx ||= document.createElement("canvas").getContext("2d");
  ctx.font = `${weight} ${size}px ${getComputedStyle(document.documentElement).fontFamily}`;
  return Math.ceil(ctx.measureText(text).width);
}

// 两位以内横排压一格；3–4 位数字或全大写缩写逐字各压一格（和汉字一样宽，竖排不松）；其余侧转。
const Tok = ({ t }) => (t.k === "tcy" ? <span className="kbs-tcy">{t.t}</span> : t.k === "up" ? [...t.t].map((ch, i) => <span key={i} className="kbs-tcy">{ch}</span>) : t.t);
const Spine = ({ s }) => (
  <span className="kbs-tx" style={{ height: s.cap }}>
    {s.cols.map((col, x) => <span key={x} className="kbs-c">{col.map((t, i) => <Tok key={i} t={t} />)}{s.more && x === s.cols.length - 1 ? "…" : null}</span>)}
  </span>
);

// ---- 抽出 / 推回：每帧一格（0 → 1 → 2），到位后回调 ----
const PULL = new WeakMap();
function pull(slot, to, done) {
  PULL.get(slot)?.();
  const at = () => Number(slot.dataset.pull || 0);
  const set = (f) => { if (f) slot.dataset.pull = String(f); else delete slot.dataset.pull; };
  if (prefersReducedMotion() || at() === to) { set(to); done?.(); return; }
  PULL.set(slot, frames(() => {
    const f = at() + Math.sign(to - at());
    set(f);
    if (f !== to) return undefined;
    done?.();
    return false;
  }));
}

// 从根到这个节点的一串节点（含自己）。
function trailTo(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return [n];
    const t = n.kids && trailTo(n.kids, id);
    if (t) return [n, ...t];
  }
  return null;
}

// 悬停卡：网点错位 6px 作浮起感，不用阴影。上方放得下就放在书的上方。
function Tip({ ref, describe }) {
  const [slot, setSlot] = useState(null);
  const box = useRef(null);
  useImperativeHandle(ref, () => ({ show: setSlot, hide: () => setSlot(null) }), []);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !slot) return;
    if (!slot.isConnected) { setSlot(null); return; }
    const cr = el.offsetParent.getBoundingClientRect(), r = (slot.querySelector(".kbs-bk, .kbs-flat, .kbs-obox-lid") || slot).getBoundingClientRect();
    el.style.left = `${Math.max(0, Math.min(r.left - cr.left - 8, cr.width - el.offsetWidth - 8))}px`;
    el.style.top = `${r.top - el.offsetHeight - 16 > 40 ? r.top - cr.top - el.offsetHeight - 16 : r.bottom - cr.top + 14}px`;
  });
  const body = slot && describe(slot.dataset.id);
  if (!body) return null;
  return <div ref={box} className="kbs-tip" aria-hidden="true"><div className="kbs-tip-sh" /><div className="kbs-tip-card">{body}</div></div>;
}

// model：canvasModel 的 { groups, loose }；q：搜索词；focus：⌘K 打开的那篇（开盒、抽出、弹卡）。
export default function KbShelf({ model, docs, q = "", focus = "" }) {
  const root = useRef(null), tip = useRef(null), justOpened = useRef(null), focusing = useRef(focus);
  const roots = useMemo(() => [...model.groups, ...model.loose], [model]);
  const [width, setWidth] = useState(0);
  const [fonts, setFonts] = useState(0); // 字体每加载完一次 +1：清空实测，重新断列
  // 打开的档案盒：盒 id → 在盒里逐层进入的子盒 id。⌘K 打开的那篇在盒里时，先把盒子打开到它那一层。
  const [open, setOpen] = useState(() => { const t = focus && trailTo(roots, focus); return new Map(t && t.length >= 3 ? [[t[1].id, t.slice(2, -1).map((n) => n.id)]] : []); });
  const [shut, setShut] = useState({ q: "", ids: new Set() }); // 搜索时自动打开、又被手动收起的盒子（只对这个搜索词有效）

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const fit = () => setWidth(el.clientWidth);
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!document.fonts) { setFonts(1); return undefined; }
    let live = true;
    const reset = () => { if (!live) return; ADV.clear(); SPINES.clear(); setFonts((n) => n + 1); };
    document.fonts.ready.then(reset);
    document.fonts.addEventListener("loadingdone", reset);
    return () => { live = false; document.fonts.removeEventListener("loadingdone", reset); };
  }, []);
  // 刚打开的盒子：书逐帧一本本取出。
  useLayoutEffect(() => {
    const id = justOpened.current;
    justOpened.current = null;
    if (!id || prefersReducedMotion()) return undefined;
    const ins = [...(root.current?.querySelectorAll(`[data-slot="obox"][data-id="${CSS.escape(id)}"] .kbs-obox-in > *`) || [])];
    ins.forEach((el) => { el.style.visibility = "hidden"; });
    const stop = frames((f) => { if (ins[f - 1]) ins[f - 1].style.visibility = ""; return f < ins.length; });
    return () => { stop(); ins.forEach((el) => { el.style.visibility = ""; }); };
  });
  // ⌘K：字体加载完、书脊排定后，滚到这本、聚焦，抽出并弹卡（窗口没有焦点时不发 focus 事件，所以直接抽）。
  useLayoutEffect(() => {
    const id = focusing.current;
    if (!fonts || !id) return;
    focusing.current = "";
    const el = root.current?.querySelector(`[data-slot][data-id="${CSS.escape(id)}"]`) || root.current?.querySelector(`[data-layer="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    if (!el.dataset.slot) return;
    el.querySelector("a, button")?.focus({ preventScroll: true });
    show(el);
  }, [fonts]);

  const today = todayOf();
  const ql = q.trim().toLowerCase();
  const hit = (n) => !ql || n.name.toLowerCase().includes(ql) || (docs[n.id]?.excerpt || "").toLowerCase().includes(ql);
  const hits = (n) => (hit(n) && (!n.kids || docs[n.id]?.url) ? 1 : 0) + (n.kids || []).reduce((s, k) => s + hits(k), 0);
  const latest = (n) => (n.kids ? n.kids.reduce((m, k) => { const v = latest(k); return v > m ? v : m; }, "") : docs[n.id]?.updated || "");
  const isOpen = (n) => open.has(n.id) || (!!ql && hits(n) > 0 && !(shut.q === ql && shut.ids.has(n.id)));

  function toggleBox(n) {
    tip.current?.hide();
    if (isOpen(n)) {
      setOpen((m) => { const next = new Map(m); next.delete(n.id); return next; });
      if (ql) setShut((s) => ({ q: ql, ids: new Set(s.q === ql ? s.ids : []).add(n.id) }));
    } else {
      setOpen((m) => new Map(m).set(n.id, []));
      justOpened.current = n.id;
    }
  }
  function goInto(boxId, path) {
    tip.current?.hide();
    setOpen((m) => new Map(m).set(boxId, path));
    justOpened.current = boxId;
  }

  // ---- 悬停 / 聚焦：两帧抽出，第二帧弹卡；敞口盒只在盒盖上弹卡，盒里的书各自抽出 ----
  const slotOf = (el) => el?.closest?.("[data-slot]");
  const target = (e) => { const s = slotOf(e.target); return s && (s.dataset.slot !== "obox" || e.target.closest(".kbs-obox-lid")) ? s : null; };
  const show = (s) => (s.dataset.slot === "obox" ? tip.current?.show(s) : pull(s, 2, () => tip.current?.show(s)));
  const hide = (s) => { tip.current?.hide(); if (s.dataset.slot !== "obox") pull(s, 0); };
  const hover = {
    onMouseOver: (e) => { const s = target(e); if (s && !s.contains(e.relatedTarget)) show(s); },
    onMouseOut: (e) => { const s = target(e); if (s && !s.contains(e.relatedTarget)) hide(s); },
    onFocus: (e) => { const s = slotOf(e.target); if (s) show(s); },
    onBlur: (e) => { const s = slotOf(e.target); if (s) hide(s); },
  };

  const where = (id) => (trailTo(roots, id) || []).slice(0, -1).map((n) => cleanName(n.name).replace(/[｜|丨]/, " ")).join(" › ") || "待上架";
  const describe = (id) => {
    const n = locate(roots, id)?.node, d = docs[id] || {};
    if (!n) return null;
    if (n.kids) return <>
      <div className="kbs-tip-meta">档案盒 · {countDocs(n)} 篇 · 更新 {mmdd(latest(n))}</div>
      <div className="kbs-tip-title">{cleanName(n.name)}</div>
      <ul className="kbs-tip-list">{n.kids.slice(0, 4).map((k) => <li key={k.id}>{cleanName(k.name)}</li>)}{n.kids.length > 4 && <li>还有 {n.kids.length - 4} 篇</li>}</ul>
      <div className="kbs-tip-foot"><span>{where(id)}</span><span className="go">{isOpen(n) ? "点盒盖收起" : "点击打开盒子"}</span></div>
    </>;
    let ex = (d.excerpt || "").trim();
    if (ex.startsWith(n.name)) ex = ex.slice(n.name.length).trim();
    ex = cleanName(ex);
    return <>
      <div className="kbs-tip-meta">{TYPE_ZH[d.type] || "文档"} · <span className={isRecent(d.updated, today) ? "is-new" : undefined}>更新 {mmdd(d.updated)}</span></div>
      <div className="kbs-tip-title">{cleanName(n.name)}</div>
      {ex && <p className="kbs-tip-ex">{ex}</p>}
      <div className="kbs-tip-foot"><span>{where(id)}</span>{d.url && <span className="go">打开飞书原文<PixelIcon name="external" /></span>}</div>
    </>;
  };

  if (!width) return <div ref={root} className="kbs" />;
  const bays = width >= 640 ? 2 : 1, avail = Math.floor((width - 4 - (bays - 1) * 2) / bays - 48);

  // ---- 单本、档案盒、敞口盒 → { w, el } ----
  const book = (n, h, label) => {
    const d = docs[n.id] || {}, s = spine(label, h, false), w = 4 + PADX * 2 + s.cols.length * COLW;
    return { w, el: (
      <span key={n.id} className={`kbs-slot${ql && !hit(n) ? " is-dim" : ""}`} data-slot="book" data-id={n.id}>
        <a className={`kbs-bk${tailOf(d.type)}`} style={{ height: h, width: w }} href={d.url || undefined} tabIndex={d.url ? undefined : 0} target="_blank" rel="noreferrer"
          aria-label={`${cleanName(n.name)}${d.url ? "，点击打开飞书原文" : ""}`}>
          <Spine s={s} /><span className="kbs-tail" />{isRecent(d.updated, today) && <i className="kbs-rb" />}
        </a>
      </span>) };
  };
  const box = (n, h, label, onClick) => {
    const s = spine(label, h, true), w = 4 + 20 + Math.max(2, s.cols.length) * COLW;
    return { w, el: (
      <span key={n.id} className={`kbs-slot${ql && !hits(n) ? " is-dim" : ""}`} data-slot="box" data-id={n.id}>
        <button type="button" className="kbs-bk is-box" style={{ height: h, width: w }} onClick={onClick} aria-label={`档案盒 ${cleanName(n.name)}，${countDocs(n)} 篇，点击打开`}>
          <Spine s={s} /><span className="kbs-tail">{countDocs(n)}</span>
        </button>
      </span>) };
  };
  const obox = (n) => {
    const { dir, trail } = currentDirectory(n, open.get(n.id) || []), at = trail.slice(1).map((x) => x.id);
    const inner = shelfItems(dir.kids || [], { series: false }).map(({ node, label }) => (node.kids ? box(node, IH, label, () => goInto(n.id, [...at, node.id])) : book(node, IH, label)));
    const innerW = inner.reduce((s, it) => s + it.w, 0) + SGAP * Math.max(0, inner.length - 1);
    const lidW = textWidth(`${trail.map((f) => cleanName(f.name)).join(" ")} ${countDocs(dir)} 篇 收起`, 600, 12) + 60 + 18 * (trail.length - 1);
    const w = Math.min(avail, Math.max(4 + 16 + innerW, lidW));
    const lid = trail.length === 1
      ? <button type="button" className="kbs-obox-lid" onClick={() => toggleBox(n)} aria-expanded="true">{cleanName(n.name)}<span className="tnum">{countDocs(n)} 篇</span><span className="close"><PixelIcon name="up" />收起</span></button>
      : <div className="kbs-obox-lid">
        {trail.map((f, k) => <Fragment key={f.id}>{k > 0 && <PixelIcon name="right" />}{k < trail.length - 1 ? <button type="button" className="kbs-crumb" onClick={() => goInto(n.id, at.slice(0, k))}>{cleanName(f.name)}</button> : <span>{cleanName(f.name)}</span>}</Fragment>)}
        <span className="tnum">{countDocs(dir)} 篇</span>
        <button type="button" className="close" onClick={() => toggleBox(n)}><PixelIcon name="up" />收起</button>
      </div>;
    return { w, el: (
      <span key={`o${n.id}`} className="kbs-slot" data-slot="obox" data-id={n.id}>
        <span className="kbs-obox" style={{ minHeight: H, width: w }}>
          {lid}
          <span className="kbs-obox-in">{inner.length ? inner.map((it) => it.el) : <span className="kbs-empty">空盒子，把书拖进来</span>}</span>
        </span>
      </span>) };
  };
  const one = (n, label) => (!n.kids ? book(n, H, label) : isOpen(n) ? obox(n) : box(n, H, label, () => toggleBox(n)));

  // ---- 一层：档案盒在前、系列挨着 → 按宽度装行（放不下就加一块层板）→ 系列名只占到下一组之前 ----
  const layer = (g, cls) => {
    const its = shelfItems(g.kids || [], { series: true }).map((it) => {
      if (it.kind === "one") return one(it.node, it.label);
      const ms = it.members.map((m) => one(m.node, m.label));
      return { key: `s${it.members[0].node.id}`, cap: it.label, w: ms.reduce((s, m) => s + m.w, 0) + SGAP * (ms.length - 1), els: ms.map((m) => m.el) };
    });
    const rows = packRows(its.map((it) => it.w), avail, GAP);
    const [no, name] = splitNumber(cleanName(g.name)), n = g.kids ? countDocs(g) : 0, h = ql ? hits(g) : 0;
    return (
      <section key={g.id} className={`kbs-bay${cls}${ql && !h ? " is-dim" : ""}`} data-layer={g.id}>
        <header className="kbs-bay-head">
          <span className="kbs-no">{no}</span><strong>{name}</strong>
          <span className="kbs-meta">{ql && !h ? "没有命中" : n ? `${n} 篇 · 更新 ${mmdd(latest(g))}` : "空"}{ql && h ? ` · 命中 ${h}` : ""}</span>
        </header>
        <div className="kbs-rows">
          {rows.length ? rows.map((row, r) => (
            <div key={r} className="kbs-row">
              {row.map(({ i, x, w }, k) => {
                const it = its[i];
                if (!it.cap) return it.el;
                const next = row.slice(k + 1).find((o) => its[o.i].cap);
                return <span key={it.key} className="kbs-grp" style={{ width: w }}><span className="kbs-grp-cap" style={{ maxWidth: (next ? next.x : avail) - x - 12 }} title={it.cap}>{it.cap}</span>{it.els}</span>;
              })}
            </div>
          )) : (
            <div className="kbs-row"><span className="kbs-slot"><span className="kbs-bk is-ghost" style={{ height: H, width: 35 }}><Spine s={spine("空书架", H, false)} /></span></span><span className="kbs-empty">把书拖上来</span></div>
          )}
        </div>
      </section>
    );
  };

  // ---- 柜顶：横放成摞，窄的压在宽的上面 ----
  const flat = (n) => {
    const d = docs[n.id] || {}, [no, nm] = splitNumber(spineName(n.name));
    return (
      <span key={n.id} className={`kbs-slot${ql && !hit(n) ? " is-dim" : ""}`} data-slot="flat" data-id={n.id}>
        <a className={`kbs-flat${tailOf(d.type)}`} href={d.url || undefined} tabIndex={d.url ? undefined : 0} target="_blank" rel="noreferrer" aria-label={`${cleanName(n.name)}${d.url ? "，点击打开飞书原文" : ""}`}>
          <span className="hd">{no}</span><span className="nm">{nm}</span><span className="tl" />{isRecent(d.updated, today) && <i className="kbs-rb" />}
        </a>
      </span>
    );
  };

  const { groups, loose } = model, lastStart = groups.length - (groups.length % bays || bays);
  const cells = groups.map((g, i) => layer(g, `${bays > 1 && i % bays < bays - 1 ? " is-left" : ""}${i >= lastStart ? " is-last" : ""}`));
  if (groups.length % bays) cells.push(<section key="filler" className="kbs-bay is-filler is-last" />);

  return (
    <div ref={root} className="kbs" {...hover}>
      <div className="kbs-top">
        <div className="kbs-top-head">
          <strong>待上架</strong><span className="kbs-count">{loose.length}</span>
          <span className="kbs-hint">{loose.length ? "收藏时归类不明确的书先放柜顶，拖到任一层即上架（在飞书里移动）" : "书都上架了"}</span>
          <span className="kbs-legend" aria-hidden="true">
            <span><i className="kbs-lg" />文档</span><span><i className="kbs-lg t-sheet" />表格</span><span><i className="kbs-lg t-bitable" />多维表</span>
            <span><i className="kbs-lg t-file" />文件</span><span><i className="kbs-lg is-box" />档案盒</span><span><i className="kbs-lg is-new" />近 3 天更新</span>
          </span>
        </div>
        <div className="kbs-piles">{piles(loose).map((p) => <div key={p[0].id} className="kbs-pile">{p.map(flat)}</div>)}</div>
      </div>
      <div className="kbs-cab" style={{ "--bays": bays }}>{cells}</div>
      <Tip ref={tip} describe={describe} />
    </div>
  );
}
