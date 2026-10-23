import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DitherBar, DitherPattern, PixelIcon, PixelSprite, SPRITES, SpriteCells, frames, prefersReducedMotion } from "../../ui/bitmap.jsx";
import { apiRead, apiSend, useApi } from "../../api.js";
import { Button, Loadable, PageHeader, Placeholder, Tabs, Tag } from "../../ui/components.jsx";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { avgScore, busyBoxes, doneCount, findNode, fixedLabels, isLate, labelBoxes, lateWeeks, layout, lineStars, mapWidth, pendingReviews, SUN, pines, placePlates, placeRopeLabels, plateStyle, poly, prereqs, seasonClock, shortUnlock, slopeOf, stars, unlockText } from "./mentor-path.js";

// 带教 · 培养路径（定稿 V7 远征登山，用户 2026-10-23）：横向全景，前山是业务线、后山是 AI 线；一关是一段坡，坡顶的营地是通关点，越往右越高，
// 两条路在山顶汇合（结业）。太阳 = 今天，橙色虚线从太阳垂到地面；登山者站在现在的位置；绳桥是跨线依赖。橙色只表示「现在」。
// 地图按周定宽（每周 WEEK_W，24 周约 3800，约原来的 3 倍；用户 10-23），横向滚动，打开时滚到今天，鼠标滚轮也横着滚；
// 页头、营地日志和「本周攀登」卡（右下，可收起，带「回到今天」）固定在可视区。坐标全部由 mentor-path.js 计算。
// 数据（T14）：GET /api/v3/mentor/path，每人一份路径，只存工作台本地；营地日志里评分走「预览 → 确认 → 回读」。
const INK = "#0D0E10", PANEL = "#FBFBFC", SIGNAL = "#FF4F1F", BLUE = "#2563EB", GRAY = "#C9CCD3", MUTED = "#686D76", LOCKED = "#9CA0A8";
const MOUNT = { biz: "前山", ai: "后山" }, LNAME = { biz: "业务线", ai: "AI 线" }, LCOLOR = { biz: INK, ai: BLUE };
const KEYS = ["biz", "ai"];
const pick = (t) => t?.closest?.("[data-hit]")?.dataset.hit ?? null;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export default function MentorPath({ tabs }) {
  const state = useApi("/api/v3/mentor/path");
  const [fresh, setFresh] = useState(null);   // 保存后回读到的整份数据，页面按它重画，不重新加载
  return (
    <Loadable state={fresh ? { data: fresh } : state} name="培养路径" big>
      {(data) => (data.trainees.some((t) => t.path)
        ? <PathPage data={data} tabs={tabs} onFresh={setFresh} />
        : <><PageHeader title="带教" /><Tabs items={tabs} active="path" /><Placeholder icon="route" title="还没有培养路径">导入管培生的培养路径后，这里显示两条线的营地、进度和本周攀登。</Placeholder></>)}
    </Loadable>
  );
}

// 每人一份路径、各自的入职日：第几周、超期都按当前选中的人算
function PathPage({ data, tabs, onFresh }) {
  const [who, setWho] = useState(() => data.trainees.findIndex((t) => t.path));
  const path = data.trainees[who].path, season = path.season;
  const clock = useMemo(() => seasonClock(season, data.today), [season, data.today]);
  const [selected, setSelected] = useState(null);   // 抽屉里打开的营地 id，或 summit / base
  const [hover, setHover] = useState(null);
  const switchTo = (k) => { setWho(k); setSelected(null); setHover(null); };
  return (
    <div className="m7-page">
      <Mountain key={who} path={path} clock={clock} season={season} hl={hover ?? selected} onHover={setHover} onOpen={setSelected} />
      <header className="m7-head">
        <div className="m7-crumb"><h1>带教</h1>
          <nav className="m7-tabs">{tabs.map((t) => <a key={t.key} href={t.href} className={t.key === "path" ? "on" : ""}>{t.label}</a>)}</nav></div>
        <div className="m7-people">{data.trainees.map((t, k) => (
          <button key={t.name} type="button" className={k === who ? "on" : ""} disabled={!t.path} title={t.path ? "" : "还没有培养路径"} onClick={() => switchTo(k)}>
            {t.name}<small>{t.path ? `第 ${seasonClock(t.path.season, data.today).week} 周` : "—"}</small></button>))}</div>
        <span className="spacer" />
        <Kpis path={path} clock={clock} pass={season.pass} />
      </header>
      {selected && <CampDrawer key={`drawer-${who}`} id={selected} name={data.trainees[who].name} path={path} clock={clock} season={season} onFresh={onFresh} onOpen={setSelected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Kpis({ path, clock, pass }) {
  const total = path.lines.reduce((s, l) => s + l.nodes.length, 0);
  return (
    <div className="m7-kpis">
      <span><b>W{clock.week}</b>/ {clock.weeks} 周</span>
      <span><b>{path.lines.reduce((s, l) => s + doneCount(l), 0)}</b>/ {total} 关通关</span>
      <span><b>{path.lines.reduce((s, l) => s + lineStars(l, pass), 0)}</b>/ {total * 3} 星</span>
      <span className="is-warn"><b>{pendingReviews(path)}</b>份待评分</span>
    </div>
  );
}

/* ---------- 地图 ---------- */

function Mountain({ path, clock, season, hl, onHover, onOpen }) {
  const stageRef = useRef(null), labRef = useRef(null), scrollRef = useRef(null), scrolled = useRef(false);
  const [size, setSize] = useState(null);
  const [fonts, setFonts] = useState(0);
  const [place, setPlace] = useState(null);
  useLayoutEffect(() => {
    const el = stageRef.current, read = () => setSize((s) => (s && s.W === el.clientWidth && s.H === el.clientHeight ? s : { W: el.clientWidth, H: el.clientHeight }));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 字体加载完文字宽度会变，重新量一遍
  useEffect(() => { let alive = true; document.fonts?.ready.then(() => alive && setFonts((f) => f + 1)); return () => { alive = false; }; }, []);
  const geo = useMemo(() => (size ? layout(size, path, clock) : null), [size, path, clock]);
  const lines = useMemo(() => Object.fromEntries(path.lines.map((l) => [l.key, l])), [path]);
  const doing = Object.fromEntries(KEYS.map((k) => [k, lines[k].nodes.find((n) => n.status === "doing")]));

  // 先排版量尺寸，再摆位置：标牌（完整 / 小牌各量一次）、固定文字、绳桥说明
  useLayoutEffect(() => {
    if (!geo) return;
    const lab = labRef.current, sz = (el) => ({ w: el.offsetWidth, h: el.offsetHeight });
    const plateSizes = {};
    lab.querySelectorAll(".m7-plate").forEach((el) => {
      const cls = el.className;
      el.classList.remove("is-mini", "is-peek");
      const full = { ...sz(el), bw: el.clientLeft };
      el.classList.add("is-mini");
      const mini = { ...sz(el), bw: el.clientLeft };
      el.className = cls;
      plateSizes[el.dataset.id] = { full, mini };
    });
    const one = (sel) => sz(lab.querySelector(sel)), late = {}, ropeSizes = {};
    lab.querySelectorAll(".m7-late").forEach((el) => (late[el.dataset.k] = sz(el)));
    lab.querySelectorAll(".m7-rope-label").forEach((el) => (ropeSizes[el.dataset.key] = sz(el)));
    const fl = fixedLabels(geo, { ridge: { biz: one(".m7-ridge:not(.is-ai)"), ai: one(".m7-ridge.is-ai") }, today: one(".m7-today"), summit: one(".m7-summit"), late });
    const labels = labelBoxes(fl), plates = placePlates(geo, plateSizes, labels);
    setPlace({ geo, fl, plates: Object.fromEntries(plates.map((p) => [p.id, p])), ropes: placeRopeLabels(geo, ropeSizes, busyBoxes(geo, plates, labels)), pines: pines(geo, plates, geo.W) });
  }, [geo, fonts]);
  const P = place && place.geo === geo ? place : null;
  // 回到今天：今天尽量放在可视区 40% 处，但太阳、登山者、正在爬的营地标牌都要露出来，不能压在右下的「本周攀登」卡底下。
  // 第一次排好时滚过去，点「回到今天」再滚一次
  const toToday = (smooth) => {
    const el = scrollRef.current;
    if (!el || !P) return;
    const view = el.clientWidth, page = el.getBoundingClientRect(), card = el.parentElement.querySelector(".m7-week")?.getBoundingClientRect();
    const keep = [{ l: geo.sun[0] - SUN.glow - 2, r: geo.sun[0] + SUN.glow + 2, b: geo.sun[1] + SUN.glow + 2 }, ...KEYS.filter((k) => geo.me[k]).map((k) => ({ l: geo.me[k].x - 16, r: geo.me[k].x + 16, b: geo.me[k].y })), ...KEYS.map((k) => doing[k] && P.plates[doing[k].id]?.at.r).filter(Boolean)];
    let s = geo.xNow - view * 0.4;
    keep.forEach((k) => { s = Math.max(s, k.r - view + 16, card && k.b > card.top - page.top - 8 ? k.r - (card.left - page.left - 16) : -Infinity); });
    keep.forEach((k) => { s = Math.min(s, k.l - 16); });
    el.scrollTo({ left: Math.max(0, s), behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto" });
  };
  useLayoutEffect(() => { if (P && !scrolled.current) { scrolled.current = true; toToday(false); } });
  // 地图只横着滚：竖向滚轮也换成横向
  const wheel = (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; };

  const lower = useMemo(() => geo && <MapLower geo={geo} pineXs={P?.pines ?? []} />, [geo, P]);
  const upper = useMemo(() => geo && <MapUpper geo={geo} />, [geo]);
  const at = (box) => (box ? { left: box.l, top: box.t } : undefined);
  const lastIds = KEYS.map((k) => lines[k].nodes.at(-1).id);

  const hoverOn = { onMouseOver: (e) => onHover(pick(e.target)), onMouseLeave: () => onHover(null), onClick: (e) => { const id = pick(e.target); if (id) onOpen(id); } };
  return (<>
    <div className="m7-scroll" ref={scrollRef} onWheel={wheel}>
      <div className="m7" ref={stageRef} style={{ width: mapWidth(clock.weeks) }} {...hoverOn}>
        {geo && (
          <svg className="m7-svg" viewBox={`0 0 ${geo.W} ${geo.H}`} width={geo.W} height={geo.H}>
            {lower}
            <Highlight geo={geo} id={hl} />
            <line x1={geo.xNow} y1={geo.sun[1] + SUN.r + 4} x2={geo.xNow} y2={geo.yg} stroke={SIGNAL} strokeWidth="2" strokeDasharray="2 5" />
            {geo.ropes.map((r) => <path key={`${r.from}>${r.to}`} className={`m7-rope${hl && (hl === r.from || hl === r.to) ? " on" : ""}`} d={r.d} fill="none" strokeDasharray="1 4" strokeLinecap="round" />)}
            {upper}
            <Climbers me={geo.me} />
          </svg>
        )}
        {geo && (
          <div className="m7-labels" ref={labRef}>
            {[...geo.camps.biz, ...geo.camps.ai].map((c) => <Plate key={c.id} c={c} p={P?.plates[c.id]} hl={hl} clock={clock} path={path} pass={season.pass} />)}
            <span className="m7-ridge" style={at(P?.fl.ridge.biz)}>前山 · 业务线</span>
            <span className="m7-ridge is-ai" style={at(P?.fl.ridge.ai)}>后山 · AI 线</span>
            <div className="m7-today" style={at(P?.fl.today)}><b>今天 {clock.today}</b><span>第 {clock.week} 周 · 太阳走到哪，就是哪一周</span></div>
            <div className={`m7-summit${hl === "summit" ? " is-hl" : ""}`} data-hit="summit" style={at(P?.fl.summit)}><strong>山顶 · 结业</strong><span>{lastIds.join(" + ")} 通关后</span></div>
            {KEYS.filter((k) => geo.me[k]?.late).map((k) => <span key={k} className="m7-late" data-k={k} style={at(P?.fl.late[k])}>超期 {lateWeeks(doing[k], clock.week)} 周</span>)}
            {geo.ropes.map((r) => { const key = `${r.from}>${r.to}`; return <span key={key} className={`m7-rope-label${hl && (hl === r.from || hl === r.to) ? " on" : ""}`} data-key={key} style={at(P?.ropes[key])}>绳桥 {r.from} {r.note} → {r.to}</span>; })}
          </div>
        )}
      </div>
    </div>
    <WeekCard lines={lines} doing={doing} clock={clock} pass={season.pass} onToday={() => toToday(true)} {...hoverOn} />
  </>);
}

// 天空、远山、两座山、积雪、松树、两条路（悬停高亮压在路上面）
function MapLower({ geo, pineXs }) {
  const { W, yg, ridge, far, sun, decor, snow, trail, base } = geo;
  const area = (pts) => `${poly(pts)}L${W} ${yg}L0 ${yg}Z`;
  const bands = (id, pts, ids) => {
    const h = (yg - 120) / ids.length;
    return (
      <>
        <clipPath id={`m7-c${id}`}><path d={area(pts)} /></clipPath>
        <path d={area(pts)} fill={PANEL} />
        <g clipPath={`url(#m7-c${id})`}>{ids.map((pid, k) => <rect key={pid} x="0" y={120 + k * h} width={W} height={h + 1} fill={`url(#${pid})`} />)}</g>
      </>
    );
  };
  return (
    <>
      <defs>
        <DitherPattern id="m7-pFar" threshold={3} color={GRAY} />
        {[1, 2, 4, 6].map((t, k) => <DitherPattern key={t} id={`m7-pB${k + 1}`} threshold={t} color="#AEB3BB" />)}
        {[1, 2, 3, 4, 6].map((t, k) => <DitherPattern key={t} id={`m7-pF${k + 1}`} threshold={t} color={INK} />)}
        <DitherPattern id="m7-pSun" threshold={5} color={SIGNAL} />
      </defs>
      {/* 天空：太阳（= 今天）、云、鸟 */}
      <circle cx={sun[0]} cy={sun[1]} r={SUN.glow} fill="url(#m7-pSun)" />
      <circle cx={sun[0]} cy={sun[1]} r={SUN.r} fill={SIGNAL} />
      {decor.clouds.map(([x, y, cell]) => <SpriteCells key={x} rows={SPRITES.cloud} x={x} y={y} cell={cell} color={INK} bg={PANEL} />)}
      {decor.birds.map(([x, y]) => <SpriteCells key={x} rows={SPRITES.bird} x={x} y={y} cell={3} color={INK} />)}
      {/* 山：远山 → 后山（AI）→ 前山（业务），越往下网点越密 */}
      <path d={area(far)} fill="url(#m7-pFar)" />
      {bands("B", ridge.ai, ["m7-pB1", "m7-pB2", "m7-pB3", "m7-pB4"])}
      <path d={poly(ridge.ai)} fill="none" stroke={MUTED} strokeWidth="1.5" />
      {bands("F", ridge.biz, ["m7-pF1", "m7-pF2", "m7-pF3", "m7-pF4", "m7-pF5"])}
      <path d={poly(ridge.biz)} fill="none" stroke={INK} strokeWidth="2" />
      <path d={`${poly(snow)}Z`} fill={PANEL} stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      {pineXs.map((x) => <SpriteCells key={x} rows={SPRITES.pine} x={x} y={yg - 21} cell={3} color={INK} />)}
      {/* 路：已爬过的实线，没爬的虚线（终点都是山顶） */}
      {["ai", "biz"].map((k) => (
        <g key={k}>
          <path d={poly(trail[k].todo)} fill="none" stroke={LCOLOR[k]} strokeWidth="3" strokeDasharray="7 6" />
          {trail[k].done.at(-1)[0] > base[k][0] && <path d={poly(trail[k].done)} fill="none" stroke={LCOLOR[k]} strokeWidth="5" strokeLinejoin="round" />}
        </g>
      ))}
    </>
  );
}

// 营地、大本营、山顶旗、地平线（月份、周次、营地刻度）
function MapUpper({ geo }) {
  const { W, yg, RB, camps, base, summit, months, weeks } = geo;
  const camp = ({ id, n, x, y, line }) => {
    let g;
    // 图标立在平台上：底边离线 5px，带白边
    if (n.status === "done") g = <SpriteCells rows={SPRITES.flag} x={x - 12} y={y - 33} cell={4} color={LCOLOR[line]} outline bg={PANEL} />;
    else if (n.status === "doing") g = <><rect x={x - 15} y={y - 33} width="30" height="28" fill={PANEL} stroke={SIGNAL} strokeWidth="2" strokeDasharray="4 3" /><SpriteCells rows={SPRITES.tent} x={x - 10.5} y={y - 29} cell={3} color={SIGNAL} /></>;
    else g = n.boss ? <SpriteCells rows={SPRITES.keep} x={x - 10.5} y={y - 20} cell={3} color={INK} outline bg={PANEL} /> : <SpriteCells rows={SPRITES.tent} x={x - 10.5} y={y - 26} cell={3} color={LOCKED} outline bg={PANEL} />;
    return <g key={id} className="m7-hit" data-hit={id}>{g}<rect x={x - 18} y={y - 36} width="36" height="41" fill="transparent" /></g>;
  };
  return (
    <>
      {camps.ai.map(camp)}
      {camps.biz.map(camp)}
      {/* 大本营（两座山各一顶）、山顶旗 */}
      {KEYS.map((k) => (
        <g key={k} className="m7-hit" data-hit="base">
          <SpriteCells rows={SPRITES.tent} x={base[k][0] - 14} y={base[k][1] - 33} cell={4} color={LCOLOR[k]} outline bg={PANEL} />
          <rect x={base[k][0] - 18} y={base[k][1] - 36} width="36" height="36" fill="transparent" />
        </g>
      ))}
      <g className="m7-hit" data-hit="summit">
        <SpriteCells rows={SPRITES.flag} x={summit[0] - 2} y={summit[1] - 46} cell={6} color={SIGNAL} />
        <rect x={summit[0] - 10} y={summit[1] - 4} width="20" height="6" fill={INK} />
        <rect x={summit[0] - 12} y={summit[1] - 50} width="54" height="56" fill="transparent" />
      </g>
      <rect x="0" y={yg} width={W} height={RB} fill={INK} />
      {months.map((m) => (
        <g key={m.name}>
          <line x1={m.x} y1={yg} x2={m.x} y2={yg + 16} stroke={PANEL} strokeWidth="2" />
          <text x={m.x + 6} y={yg + 14} fontFamily="Geist Mono" fontSize="10" fill={LOCKED}>{m.name}</text>
        </g>
      ))}
      {weeks.map(({ w, a, b, cur, from }) => (
        <g key={w}>
          {cur && <rect x={a} y={yg + 20} width={b - a} height={RB - 20} fill={SIGNAL} />}
          <text x={(a + b) / 2} y={yg + 37} textAnchor="middle" fontFamily="Geist Mono" fontSize="10" fill={cur ? PANEL : GRAY}>W{w}<tspan fill={cur ? PANEL : LOCKED}>{` · ${from}`}</tspan></text>
        </g>
      ))}
      {[...camps.biz, ...camps.ai].map(({ id, x, line }) => <path key={id} d={`M${x - 5} ${yg + 1}L${x + 5} ${yg + 1}L${x} ${yg + 8}Z`} fill={line === "biz" ? PANEL : "#7FA4F5"} />)}
    </>
  );
}

// 高亮一段坡（上一营地 → 这一营地）；山顶 = 两条线最后一段
function Highlight({ geo, id }) {
  if (!id || id === "base") return null;
  const w = id === "summit" ? 4 : 5;
  return slopeOf(geo, id).map((pts, k) => (
    <g key={k}>
      <path d={poly(pts)} fill="none" stroke={PANEL} strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <path d={poly(pts)} fill="none" stroke={SIGNAL} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  ));
}

// 登山者两帧交替（约 2 次/秒）；减少动态效果时停在第一帧
function Climbers({ me }) {
  const [f, setF] = useState(0);
  useEffect(() => (prefersReducedMotion() ? undefined : frames((k) => { if (k % 7 === 0) setF((x) => 1 - x); })), []);
  return KEYS.filter((k) => me[k]).map((k) => <SpriteCells key={k} rows={SPRITES.climb[f]} x={me[k].x - 14} y={me[k].y - 41} cell={4} color={SIGNAL} outline bg={PANEL} />);
}

// 没评分的关卡：分数位「—」，文字「未评分」
const scoreText = (n) => (n.score == null ? "未评分" : `${n.score} 分`);
const Tagged = ({ id }) => <i className={`m7-tag${id[0] === "A" ? " is-ai" : ""}`}>{id}</i>;
function Stars({ n, pass }) {
  const k = n.status === "done" ? stars(n.score, pass) : 0;
  return <span className="m7-stars" title={`${k} 星`}>{[0, 1, 2].map((i) => <i key={i} className={i < k ? "on" : ""}><PixelIcon name="star" /></i>)}</span>;
}

// 营地标牌：已通关细边、正在爬橙色粗边、未解锁灰虚线；小牌悬停或打开时展开（peek）
function Plate({ c, p, hl, clock, path, pass }) {
  const { n, line } = c, late = isLate(n, clock.week);
  const peek = !!p && p.at.mini && hl === c.id, a = p && (peek ? p.peek : p.at);
  const s = a && plateStyle(p, a);
  const cls = ["m7-plate", `is-${n.status}`, line === "ai" && "is-ai", late && "is-late", a?.mini && "is-mini", a && `is-${a.side}`, hl === c.id && "is-hl", peek && "is-peek"].filter(Boolean).join(" ");
  const sc = n.status === "done" ? <>{n.score} 分 <Stars n={n} pass={pass} />· {n.at} 通关</>
    : late ? `${scoreText(n)} · 超期 ${lateWeeks(n, clock.week)} 周`
    : n.status === "doing" ? (n.score == null ? `未评分 · W${n.week[1]} 截止` : `${n.score} 分 · 差 ${pass - n.score} 分通关`) : shortUnlock(path, n.id);
  return (
    <div className={cls} data-id={c.id} data-hit={c.id} style={s && { left: s.left, top: s.top, "--lx": `${s.lx}px`, "--lh": `${s.lh}px`, "--lt": `${s.lt}px` }}>
      <span className="meta"><Tagged id={n.id} />{n.stage} · W{n.week[0]}–{n.week[1]}</span>
      <strong>{n.boss && <><PixelIcon name="crown" /> </>}{n.title}</strong>
      <span className="sc">{n.status === "locked" && <PixelIcon name="lock" />}{sc}</span>
      <span className="dt">{n.status === "locked" ? `${n.todo.length} 件要做 · 交 ${n.output.length} 份` : `待办 ${n.todoChecked.filter(Boolean).length}/${n.todo.length} · 产出 ${n.outLinks.filter(Boolean).length}/${n.output.length}`}</span>
      <span className="mini"><Tagged id={n.id} />{n.boss ? <PixelIcon name="crown" /> : n.status === "locked" && <PixelIcon name="lock" />}{n.stage}{n.status === "done" && <Stars n={n} pass={pass} />}</span>
    </div>
  );
}

// 右下：本周攀登（两条线各一行，点开营地日志）+ 图例。固定在可视区，不跟地图滚；可收起成一行（记在本机）
const WEEK_OPEN = "niuma:m7-week-open";
function WeekCard({ lines, doing, clock, pass, onToday, ...hoverOn }) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(WEEK_OPEN) !== "0"; } catch { return true; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem(WEEK_OPEN, open ? "0" : "1"); } catch { /* 存不了就只管这次 */ } };
  const pct = (n) => clamp01((clock.nowW - (n.week[0] - 1)) / (n.week[1] - n.week[0] + 1));
  const meter = (n) => { const late = isLate(n, clock.week), k = late ? 10 : Math.round(pct(n) * 10); return <span className={`m7-meter${late ? " is-late" : ""}`}>{Array.from({ length: 10 }, (_, j) => <i key={j} className={j < k ? "on" : ""} />)}</span>; };
  const legend = (svg, text) => <span>{svg}{text}</span>;
  return (
    <div className={`m7-week${open ? "" : " is-shut"}`} {...hoverOn}>
      <div className="m7-week-head"><b>本周攀登</b><span>W{clock.week} · {clock.weekStart(clock.week)} 至 {clock.weekEnd(clock.week)} · 距山顶 {clock.weeks - clock.week} 周</span>
        <button type="button" className="m7-week-btn" onClick={(e) => { e.stopPropagation(); onToday(); }}><PixelIcon name="target" />回到今天</button>
        <button type="button" className="m7-week-btn is-icon" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-label={open ? "收起本周攀登" : "展开本周攀登"} title={open ? "收起" : "展开"}><PixelIcon name={open ? "down" : "up"} /></button></div>
      {open && <>
      {KEYS.filter((k) => doing[k]).map((k) => {
        const n = doing[k], l = lines[k], late = isLate(n, clock.week), i = l.nodes.indexOf(n);
        return (
          <button key={k} type="button" className="m7-row" data-hit={n.id}><i style={{ background: LCOLOR[k] }} /><span>
            <span className="l1"><strong>{MOUNT[k]} · {LNAME[k]}</strong><span>{doneCount(l)}/{l.nodes.length} 营地 · ★{lineStars(l, pass)}</span></span>
            <span className="l2">{late ? `卡在营地 ${i + 1} 前` : `正在爬第 ${i + 1} 段坡`} · {n.title}<span className="spacer" />{meter(n)}</span>
            <span className="l2">{n.score == null ? <b>未评分</b> : <><b>{n.score} 分</b>差 {pass - n.score} 分通关 · </>}{late ? <span className="risk">计划 W{n.week[1]} 结束，已超期 {lateWeeks(n, clock.week)} 周</span> : `坡上 ${Math.round(pct(n) * 100)}% · W${n.week[1]} 截止`}</span>
          </span></button>
        );
      })}
      <div className="m7-legend">
        {legend(<PixelSprite rows={SPRITES.flag} color={INK} />, "已通关")}
        {legend(<PixelSprite rows={SPRITES.tent} color={SIGNAL} />, "正在爬")}
        {legend(<PixelSprite rows={SPRITES.tent} color={LOCKED} />, "未解锁")}
        {legend(<PixelSprite rows={SPRITES.keep} color={INK} />, "BOSS 关")}
        {legend(<svg width="22" height="14" viewBox="0 0 22 14" aria-hidden="true"><line x1="0" y1="7" x2="22" y2="7" stroke={INK} strokeWidth="2" strokeDasharray="1 4" strokeLinecap="round" /></svg>, "绳桥 = 跨线依赖")}
      </div>
      </>}
    </div>
  );
}

/* ---------- 营地日志（抽屉） ---------- */

// 从右侧按帧滑入（3 帧）；Esc 或 × 关闭；营地之间用上一营地 / 下一营地或 ← →
function CampDrawer({ id, name, path, clock, season, onFresh, onOpen, onClose }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const steps = ["translateX(66%)", "translateX(33%)", ""], el = ref.current;
    el.style.transform = steps[0];
    return frames((f) => { el.style.transform = steps[f] ?? ""; return f < 2; });
  }, []);
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.("input, textarea, select, dialog")) return;
      if (e.key === "Escape") return onClose();
      const f = id !== "summit" && id !== "base" && findNode(path.lines, id);
      const to = f && (e.key === "ArrowLeft" ? f.line.nodes[f.i - 1] : e.key === "ArrowRight" ? f.line.nodes[f.i + 1] : null);
      if (to) { e.preventDefault(); onOpen(to.id); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [id, path, onOpen, onClose]);
  const f = id !== "summit" && id !== "base" ? findNode(path.lines, id) : null;
  const title = id === "summit" ? "山顶 · 结业" : id === "base" ? "大本营 · 规则" : <>营地日志 · <Tagged id={id} /> {f.n.stage}</>;
  return (
    <aside className="m7-drawer" ref={ref} aria-label="营地日志">
      <div className="m7-drawer-head"><span className="m7-drawer-title"><PixelIcon name="flag" />{title}</span>
        <button type="button" className="m7-x" aria-label="关闭" onClick={onClose}><PixelIcon name="close" /></button></div>
      <div className="m7-drawer-body" key={id}>
        {id === "summit" ? <SummitLog path={path} clock={clock} season={season} />
          : id === "base" ? <BaseLog path={path} clock={clock} season={season} />
          : <CampLog f={f} name={name} path={path} clock={clock} season={season} onFresh={onFresh} onOpen={onOpen} />}
      </div>
    </aside>
  );
}

function CampHead({ ico, title, sub, children }) {
  return <div className="m7-camp-top"><span className="m7-camp-ico">{ico}</span><span className="m7-camp-name"><b>{title}</b><span>{sub}</span></span>{children}</div>;
}

function CampLog({ f, name, path, clock, season, onFresh, onOpen }) {
  const { n, line: l, i } = f, prev = l.nodes[i - 1], next = l.nodes[i + 1], pass = season.pass;
  const weeks = Array.from({ length: n.week[1] - n.week[0] + 1 }, (_, k) => n.week[0] + k);
  const late = isLate(n, clock.week);
  const pct = Math.round(clamp01((clock.nowW - (n.week[0] - 1)) / weeks.length) * 100);
  const need = n.score == null ? "还没评分" : `还差 ${pass - n.score} 分`;
  const cell = (w) => (n.status === "done" ? "past" : n.status === "locked" ? "" : late ? "late" : w < clock.week ? "past" : w === clock.week ? "now" : "");
  const txt = n.status === "done" ? `${n.at} 通关 · 这段坡已经爬完`
    : late ? <><span className="risk">计划 W{n.week[1]} 结束，已超期 {lateWeeks(n, clock.week)} 周</span>，{need}</>
    : n.status === "doing" ? <>今天走到这段坡的 <b>{pct}%</b>，{need}，W{n.week[1]} 截止</> : `还没到 · W${n.week[0]} 开始`;
  const ico = n.status === "done" ? <PixelSprite rows={SPRITES.flag} cell={4} color={LCOLOR[l.key]} />
    : <PixelSprite rows={n.boss ? SPRITES.keep : SPRITES.tent} cell={4} color={n.status === "doing" ? SIGNAL : n.boss ? INK : LOCKED} />;
  const { feeds } = prereqs(path, n.id);
  return (
    <>
      <div className="m7-camp">
        <CampHead ico={ico} title={`营地 ${i + 1} / ${l.nodes.length} · ${n.stage}`} sub={`${MOUNT[l.key]}（${LNAME[l.key]}）· 第 ${i + 1} 段坡`}>
          <span className="spacer" />
          <button type="button" className="btn m7-nav" disabled={!prev} title="上一营地（←）" onClick={() => onOpen(prev.id)}><PixelIcon name="left" />{prev ? `营地 ${i}` : "起点"}</button>
          <button type="button" className="btn m7-nav" disabled={!next} title="下一营地（→）" onClick={() => onOpen(next.id)}>{next ? `营地 ${i + 2}` : "山顶"}<PixelIcon name="right" /></button>
        </CampHead>
        <div className="m7-slope" style={{ "--n": weeks.length }}>
          <div className="cells">{weeks.map((w) => <i key={w} className={cell(w)} />)}</div>
          <div className="wk">{weeks.map((w) => <span key={w}>W{w}</span>)}</div>
          <div className="txt">{clock.weekStart(n.week[0])} 至 {clock.weekEnd(n.week[1])} · {txt}</div>
        </div>
      </div>
      {n.status === "locked" && <div className="m7-note"><PixelIcon name="lock" /><span><b>解锁条件</b>　{unlockText(path, n.id, pass)}</span></div>}
      {feeds.length > 0 && n.status !== "locked" && <div className="m7-note is-link"><PixelIcon name="link" /><span><b>跨线</b>　用到 {feeds.map((k) => `${k.from} 的${k.note}`).join("、")}</span></div>}
      <NodeDetail n={n} name={name} path={path} clock={clock} season={season} onFresh={onFresh} />
    </>
  );
}

const STATUS = { done: ["已通关", "green"], doing: ["进行中", "blue"], locked: ["未解锁", "neutral"] };

// 关卡详情：阶段目标 / 要做的事 / 产出物（有链接的那一行可以打开）/ 评分标准；「评分」「改评分」切到营地记录表单
function NodeDetail({ n, name, path, clock, season, onFresh }) {
  const [edit, setEdit] = useState(false);
  const [saved, setSaved] = useState(null);
  if (edit) return <CampRecord n={n} name={name} path={path} clock={clock} season={season} onClose={() => setEdit(false)} onSaved={(fresh, text) => { onFresh(fresh); setSaved(text); setEdit(false); }} />;
  const { pass, reviewer } = season, locked = n.status === "locked";
  return (
    <div className="m7-detail">
      <div className="m7-detail-head">
        <div className="m7-detail-title">
          <span className="row m7-gap6"><Tag tone="frame">{n.id}</Tag><span className="label">{n.stage}</span>{n.boss && <Tag tone="orange"><PixelIcon name="crown" />BOSS 关</Tag>}<Tag tone={STATUS[n.status][1]}>{STATUS[n.status][0]}</Tag></span>
          <h3>{n.title}</h3>
          <span className="small muted mono">第 {n.week[0]}–{n.week[1]} 周{n.at ? ` · 最近评分 ${n.at}` : ""} · 评分人 {reviewer}</span>
        </div>
        {locked ? <div className="m7-score is-locked"><PixelIcon name="lock" /><span className="small muted">完成前置关卡后解锁</span></div>
          : <div className="m7-score"><span className="num m7-score-num">{n.score ?? "—"}</span><span className="m7-score-of mono">/ 100</span>{n.score == null ? <span className="small muted m7-unscored">未评分</span> : <Stars n={n} pass={pass} />}</div>}
      </div>
      <section className="m7-sec"><span className="label">阶段目标</span><p>{n.goal}</p></section>
      <section className="m7-sec"><span className="label">要做的事 · {n.todoDone}/{n.todo.length}</span>
        <ul className="m7-todo">{n.todo.map((t, i) => <li key={t} className={n.todoChecked[i] ? "done" : ""}><i className="m7-box">{n.todoChecked[i] && <PixelIcon name="tick" />}</i>{t}</li>)}</ul></section>
      <section className="m7-sec"><span className="label">产出物</span>
        <ul className="m7-out">{n.output.map((o, i) => <li key={o}><PixelIcon name="file" /><span>{o}</span>
          {n.outLinks[i] ? <><Tag tone={n.status === "done" ? "green" : "amber"}>{n.status === "done" ? "已交" : "初稿"}</Tag><a className="link m7-open" href={n.outLinks[i]} target="_blank" rel="noreferrer" title={n.outLinks[i]}>打开<PixelIcon name="external" /></a></> : <Tag>{locked ? "—" : "未交"}</Tag>}</li>)}</ul></section>
      <section className="m7-sec"><span className="label">评分标准 · 满分 100，{pass} 分通关</span>
        <table className="m7-rubric"><tbody>
          {n.rubric.map((x) => <tr key={x.name}><td>{x.name}{x.note && <span className="small muted"> · {x.note}</span>}</td><td className="tnum muted">{x.weight}</td><td className="tnum">{x.score ?? "—"}</td></tr>)}
        </tbody><tfoot><tr><td>合计</td><td className="tnum muted">100</td><td className="tnum"><b>{locked ? "—" : n.score ?? "—"}</b></td></tr></tfoot></table>
        {!locked && <div className="m7-bar-row"><span className="m7-bar"><DitherBar value={(n.score ?? 0) / 100} /><i className="m7-passline" style={{ left: `${pass}%` }} /></span><span className={`small mono ${n.score >= pass ? "ok-text" : "warn-text"}`}>{n.score == null ? "未评分" : n.score >= pass ? "已过通关线" : `差 ${pass - n.score} 分通关`}</span></div>}
      </section>
      <div className="m7-actions">
        {locked && <Button disabled><PixelIcon name="lock" />未解锁</Button>}
        <span className="spacer" />
        {n.status === "doing" ? <Button variant="primary" onClick={() => setEdit(true)}><PixelIcon name="edit" />评分</Button> : n.status === "done" ? <Button onClick={() => setEdit(true)}><PixelIcon name="edit" />改评分</Button> : null}
      </div>
      <SavedNote text={saved} onClose={() => setSaved(null)} />
    </div>
  );
}

// 这一关的后续关：下一关，以及靠绳桥依赖它的关；need 是除了这一关之外还没满足的前置
function downstream(path, n, pass) {
  const f = findNode(path.lines, n.id), next = f.line.nodes[f.i + 1];
  const cands = [next, ...path.links.filter((k) => k.from === n.id).map((k) => findNode(path.lines, k.to)?.n)].filter(Boolean);
  return cands.map((c) => {
    const { prev, feeds } = prereqs(path, c.id);
    const need = [prev && prev.id !== n.id && prev.status !== "done" && `${prev.id} 达到 ${pass} 分`,
      ...feeds.filter((k) => k.from !== n.id && findNode(path.lines, k.from)?.n.status !== "done").map((k) => `${k.from} 的${k.note}`)].filter(Boolean);
    return { c, need };
  });
}

// 回读核对用：这一关写入后应有的样子
const campKey = (x) => JSON.stringify([x.status, x.score ?? null, x.todoChecked, x.outLinks, x.rubric]);

// 营地记录：勾要做的事、填产出物链接、逐项打分。每一项都打分才算一次评分，分数全部留空只更新进度；合计 ≥ 通关线即通关。
// 写入走「预览 → 确认 → 回读」：回读整份培养路径，这一关和预览里写入后的样子一致才算保存。
function CampRecord({ n, name, path, clock, season, onClose, onSaved }) {
  const { pass, reviewer } = season;
  const init = useMemo(() => ({
    todo: [...n.todoChecked],
    out: n.outLinks.map((u) => u ?? ""),
    score: n.rubric.map((x) => (x.score == null ? "" : String(x.score))),
    note: n.rubric.map((x) => x.note ?? ""),
  }), [n]);
  const [f, setF] = useState(init);
  const flow = useWriteFlow();
  const locked = flow.busy || flow.phase === "unknown";
  const set = (k, i, v) => { setF((s) => ({ ...s, [k]: s[k].map((x, j) => (j === i ? v : x)) })); flow.reset(); };
  const over = n.rubric.map((x, i) => f.score[i] !== "" && !(/^\d+$/.test(f.score[i]) && +f.score[i] <= x.weight));
  const badUrl = f.out.map((u) => u.trim() !== "" && !/^https?:\/\/\S+$/.test(u.trim()));
  const filled = f.score.filter((s) => s !== "").length;
  const total = filled === n.rubric.length && !over.some(Boolean) ? f.score.reduce((s, v) => s + +v, 0) : null;
  const changed = JSON.stringify(f) !== JSON.stringify(init);
  const rubricChanged = JSON.stringify([f.score, f.note]) !== JSON.stringify([init.score, init.note]);
  const problem = over.some(Boolean) ? "分数要是整数，不超过这一项的满分"
    : filled > 0 && filled < n.rubric.length ? "每一项都打分才算一次评分；只更新进度就把分数全部留空"
    : badUrl.some(Boolean) ? "链接要以 http:// 或 https:// 开头" : !changed ? "还没有改动" : null;
  const base = `/api/v3/mentor/path/${encodeURIComponent(name)}/nodes/${encodeURIComponent(n.id)}/record`;
  const body = () => ({
    todoDone: n.todo.filter((_, i) => f.todo[i]),
    outLinks: Object.fromEntries(n.output.map((o, i) => [o, f.out[i].trim()]).filter(([, u]) => u)),
    rubric: Object.fromEntries(n.rubric.map((x, i) => [x.name, { score: f.score[i] === "" ? null : Number(f.score[i]), note: f.note[i].trim() }])),
  });
  const preview = () => flow.preview(() => apiSend("POST", `${base}/preview`, body()));
  const confirm = () => flow.confirm((pv) => apiSend("POST", base, { previewId: pv.previewId, confirm: true }), async (receipt, pv) => {
    const fresh = await apiRead("/api/v3/mentor/path");
    const p = fresh.trainees.find((t) => t.name === name)?.path, now = p && findNode(p.lines, n.id)?.n;
    if (!now || campKey(now) !== campKey(pv.node)) return false;
    onSaved(fresh, `已保存，回读核对一致：${n.id} ${scoreText(now)} · ${STATUS[now.status][0]}`);
    return true;
  });
  const reread = async () => { const fresh = await apiRead("/api/v3/mentor/path"); flow.resolve(); onSaved(fresh, null); };
  const scored = flow.pv ? flow.pv.scored : rubricChanged;
  return (
    <div className="m7-detail m7-form">
      <div className="m7-detail-head">
        <div className="m7-detail-title">
          <span className="row m7-gap6"><Tag tone="frame">{n.id}</Tag><span className="label">{n.stage}</span><Tag tone="amber">{n.status === "done" ? "改评分" : "评分"}</Tag></span>
          <h3>{n.title}</h3>
          <span className="small muted mono">营地记录 · {clock.today} · 评分人 {reviewer}</span>
        </div>
        <div className="m7-score"><span className="num m7-score-num">{total ?? "—"}</span><span className="m7-score-of mono">/ 100</span>{total == null ? <span className="small muted m7-unscored">未评分</span> : <Stars n={{ status: total >= pass ? "done" : "doing", score: total }} pass={pass} />}</div>
      </div>
      <section className="m7-sec"><span className="label">要做的事 · {f.todo.filter(Boolean).length}/{n.todo.length} · 点一下勾上</span>
        <ul className="m7-todo">{n.todo.map((t, i) => <li key={t} className={f.todo[i] ? "done" : ""}>
          <button type="button" className="m7-check" aria-pressed={f.todo[i]} disabled={locked} onClick={() => set("todo", i, !f.todo[i])}><i className="m7-box">{f.todo[i] && <PixelIcon name="tick" />}</i>{t}</button></li>)}</ul></section>
      <section className="m7-sec"><span className="label">产出物 · 填了链接算已交</span>
        <ul className="m7-out">{n.output.map((o, i) => <li key={o}><PixelIcon name="file" /><span>{o}</span>
          <input className={`set-input${badUrl[i] ? " is-bad" : ""}`} value={f.out[i]} onChange={(e) => set("out", i, e.target.value)} placeholder="粘贴链接（飞书文档等）" maxLength={500} disabled={locked} aria-label={`${o}的链接`} /></li>)}</ul></section>
      <section className="m7-sec"><span className="label">评分 · 每项打到这一项的满分为止，{pass} 分通关</span>
        <table className="m7-rubric is-edit"><tbody>
          {n.rubric.map((x, i) => [
            <tr key={x.name} className="is-item"><td>{x.name}</td><td className="tnum muted">{x.weight}</td>
              <td className="m7-in"><input className={`set-input${over[i] ? " is-bad" : ""}`} inputMode="numeric" value={f.score[i]} onChange={(e) => set("score", i, e.target.value.trim())} placeholder="—" disabled={locked} aria-label={`${x.name}的分数，满分 ${x.weight}`} /></td></tr>,
            <tr key={`${x.name}-note`} className="is-note"><td colSpan={3}><input className="set-input" value={f.note[i]} onChange={(e) => set("note", i, e.target.value)} placeholder="这一项的评语（可不填）" maxLength={200} disabled={locked} aria-label={`${x.name}的评语`} /></td></tr>,
          ])}
        </tbody><tfoot><tr><td>合计</td><td className="tnum muted">100</td><td className="tnum"><b>{total ?? "—"}</b></td></tr></tfoot></table>
        <div className="m7-bar-row"><span className="m7-bar"><DitherBar value={(total ?? 0) / 100} /><i className="m7-passline" style={{ left: `${pass}%` }} /></span>
          <span className={`small mono ${total != null && total >= pass ? "ok-text" : "warn-text"}`}>{total == null ? "未评分" : total >= pass ? "达到通关线" : `差 ${pass - total} 分通关`}</span></div>
      </section>
      <div className="m7-actions">
        <span className={`small ${problem && changed ? "warn-text" : "muted"}`}>{problem ?? "预览确认后才保存；只存工作台本地"}</span>
        <span className="spacer" />
        <Button onClick={onClose} disabled={locked}>取消</Button>
        <Button variant="primary" onClick={preview} disabled={!!problem || locked}><PixelIcon name="eye" />{rubricChanged ? "预览评分" : "预览进度"}</Button>
      </div>
      <WriteBox flow={flow} title={scored ? "评分预览" : "进度更新预览"} confirmLabel={scored ? "确认评分" : "确认更新"} onConfirm={confirm} onRepreview={preview} onReread={reread}>
        {(pv) => {
          const to = pv.node, me = pv.effects.find((e) => e.id === n.id), others = pv.effects.filter((e) => e.id !== n.id);
          const opens = others.filter((e) => e.to === "doing"), closes = others.filter((e) => e.to === "locked");
          const waits = to.status === "done" && n.status !== "done" ? downstream(path, n, pass).filter((d) => d.c.status === "locked" && d.need.length && !opens.some((e) => e.id === d.c.id)) : [];
          const old = Object.fromEntries(n.rubric.map((x) => [x.name, x.score]));
          return <dl className="kv">
            <dt>写到哪里</dt><dd>工作台本地 · {name}的培养路径 · {n.id} {n.title}</dd>
            <dt>日期</dt><dd className="tnum">{clock.today}（今天）· {pv.scored ? `评分人 ${reviewer}` : "只更新进度，不算一次评分"}</dd>
            {pv.scored && <><dt>各项</dt><dd className="m7-pv-items">{to.rubric.map((x) => <span key={x.name}>{x.name.split("：")[0]}　{old[x.name] != null && old[x.name] !== x.score && <><code className="diff-old">{old[x.name]}</code> → </>}<code className="diff-new">{x.score ?? "—"}</code> / {x.weight}{x.note && <span className="muted"> · {x.note}</span>}</span>)}</dd>
              <dt>总分</dt><dd className="tnum">{n.score != null && n.score !== to.score && <><code className="diff-old">{n.score}</code> → </>}<code className="diff-new">{scoreText(to)}</code>{to.score != null && ` · ${stars(to.score, pass)} 星`}</dd></>}
            <dt>关卡</dt><dd>{me ? <><span className="diff-old">{STATUS[me.from][0]}</span> → <b>{STATUS[me.to][0]}</b></> : STATUS[n.status][0]}
              {opens.length > 0 && <>，解锁 {opens.map((e) => `${e.id} ${e.title}`).join("、")}</>}
              {waits.map((d) => <span key={d.c.id} className="muted">；{d.c.id} 还要等 {d.need.join("、")}</span>)}
              {closes.length > 0 && <span className="warn-text">，{closes.map((e) => e.id).join("、")} 会变回未解锁</span>}</dd>
            <dt>要做的事</dt><dd className="tnum">{n.todoDone !== to.todoDone && <><span className="diff-old">{n.todoDone}</span> → </>}{to.todoDone}/{n.todo.length}</dd>
            <dt>产出物</dt><dd>{n.output.map((o, i) => `${o}${to.outLinks[i] ? "（有链接）" : "（未交）"}`).join("、")}</dd>
          </dl>;
        }}
      </WriteBox>
    </div>
  );
}

function SummitLog({ path, clock, season }) {
  const lines = Object.fromEntries(path.lines.map((l) => [l.key, l])), last = KEYS.map((k) => lines[k].nodes.at(-1));
  const sum = (fn) => KEYS.reduce((s, k) => s + fn(lines[k]), 0);
  return (
    <div className="m7-raw">
      <div className="m7-camp"><CampHead ico={<PixelSprite rows={SPRITES.flag} cell={4} color={SIGNAL} />} title={`山顶 · 结业（${season.next}）`} sub={`W${clock.weeks} · ${clock.weekStart(clock.weeks)} 至 ${clock.weekEnd(clock.weeks)} · 还有 ${clock.weeks - clock.week} 周`} /></div>
      <section className="m7-sec"><span className="label">登顶条件 · 两条线的最后一关都达到 {season.pass} 分</span>
        <ul className="m7-list">{last.map((n) => <li key={n.id}><Tagged id={n.id} /><span><b>{n.title}</b><br /><span className="small muted">{n.status === "locked" ? `未解锁 · 需 ${unlockText(path, n.id, season.pass)}` : scoreText(n)}</span></span></li>)}</ul></section>
      <section className="m7-sec"><span className="label">到目前为止 · 已通关 / 均分 / 星</span>
        <table className="m7-rubric"><tbody>
          {KEYS.map((k) => <tr key={k}><td>{MOUNT[k]} · {LNAME[k]}</td><td className="tnum muted">{doneCount(lines[k])}/{lines[k].nodes.length}</td><td className="tnum">{avgScore(lines[k])}</td><td className="tnum">★{lineStars(lines[k], season.pass)}</td></tr>)}
        </tbody><tfoot><tr><td>合计</td><td className="tnum muted">{sum(doneCount)}/{sum((l) => l.nodes.length)}</td><td className="tnum" /><td className="tnum">★{sum((l) => lineStars(l, season.pass))}</td></tr></tfoot></table></section>
      <section className="m7-sec"><span className="label">结业时看什么</span><p>两条线的营地均分与星数，加上 {last.map((n) => n.id).join("、")} 的复盘文档；由{season.reviewer}评定是否晋级「{season.next}」。</p></section>
    </div>
  );
}

function BaseLog({ path, clock, season }) {
  return (
    <div className="m7-raw">
      <div className="m7-camp"><CampHead ico={<PixelSprite rows={SPRITES.tent} cell={4} color={INK} />} title={`大本营 · ${clock.weekStart(1)} 入职`} sub={`两条线同时出发 · ${clock.weeks} 周 · 评分人 ${season.reviewer}`} /></div>
      <section className="m7-sec"><span className="label">怎么通关</span><ul className="m7-list">
        <li><PixelIcon name="check" /><span>每关 3 项加权评分，满分 100，<b>{season.pass} 分通关</b>；≥80 两星、≥90 三星。</span></li>
        <li><PixelIcon name="lock" /><span>上一关通关后解锁下一关；有跨线依赖的，还要拿到另一条线那一关的产出。</span></li>
        <li><PixelIcon name="edit" /><span>评分人是{season.reviewer}；管培生交产出后在营地日志里评分，初稿可以先给暂评。</span></li></ul></section>
      <section className="m7-sec"><span className="label">怎么看这张图</span><ul className="m7-list">
        <li><PixelIcon name="route" /><span>一段坡 = 一关，坡顶的营地 = 通关点；越往右越高 = 越难。</span></li>
        <li><PixelIcon name="clock" /><span>太阳 = 今天，橙色虚线从太阳垂到地面；营地的位置 = 那一关计划结束的周。</span></li>
        <li><PixelIcon name="flag" /><span>登山者 = 现在在哪；太阳已经过了营地、人还在营地前 = 超期。</span></li>
        <li><PixelIcon name="link" /><span>绳桥 = 跨线依赖：{path.links.map((k) => `${k.from} ${k.note} → ${k.to}`).join("；")}。</span></li></ul></section>
    </div>
  );
}
