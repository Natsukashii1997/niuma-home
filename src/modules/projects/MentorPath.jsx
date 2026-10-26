import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DitherPattern, PixelIcon, PixelSprite, SPRITES, SpriteCells, frames, prefersReducedMotion } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { Button, Loadable, PageHeader, Placeholder, StatStrip, Tabs, Tag } from "../../ui/components.jsx";
import { SavedNote } from "../../ui/write-flow.jsx";
import { AddTrainee, EditPlan, GeneratePath, PATH_API, RecordStage } from "./MentorPathEdit.jsx";
import { BAND1, BAND2, GROUND, H, L, SKY, STRIP, SUN_Y, bandRects, cellsOf, clipPts, dayLabel, geo as layout, lenOf, mmdd, model, mountAt, placeLabels, polyline, scenery, stepAt, stepState, stripTicks, visibleClouds, walked, walkerAt, yOn } from "./mentor-path.js";

// 带教 · 培养路径（定稿 V11 框里的远征，用户 2026-10-26）：页头、页签、管培生选择和「带教答疑」同一套；下面依次是关键数字、
// 地图卡（远山 / 后山 = 技术线 / 前山 = 业务线，营地是每段的终点，结业是山尖上的城堡；太阳 = 今天；墨色地平线带写月份和工作日；
// 下面两条阶段条）和三张卡（当前或选中的阶段、同期的另一条线、评审与筛选）。点地图、阶段条或评审行，下面的卡就换成那一段。
// 橙色只给「现在」：太阳、竖线、登山者、正在爬的营地和标牌；超期改用风险红。坐标全部由 mentor-path.js 计算。
// 数据：GET /api/v3/mentor/path，每人一份按工作日排的路径（照飞书《管培生培养路径 V2.4》），只存工作台本地。
// 写操作（MentorPathEdit.jsx）：工具栏「添加带教对象」「调整安排」，卡片和评审行「记录进度」，没有路径的人「按方案生成路径」；保存后按回读结果重画。
const LOCKED = "#9CA0A8";
const GOLD = "#FFC21A";   // 结业皇冠的填色
const RESULT = { pass: ["通过", "green"], retest: ["限期复核", "amber"], fail: ["不通过", "red"] };
const RESULT_COLOR = { pass: "var(--text)", retest: "var(--warn)", fail: "var(--risk)" };
const pick = (t) => t?.closest?.("[data-id]")?.dataset.id ?? null;
const spanText = ([a, b], [da, db]) => (a === b ? `D${a} · ${mmdd(da)}` : `D${a}–D${b} · ${mmdd(da)} – ${mmdd(db)}`);
const dText = ([a, b]) => (a === b ? `D${a}` : `D${a}–D${b}`);
const review = (s) => (s.record?.kind === "review" ? s.record : null);

export default function MentorPath({ tabs }) {
  const state = useApi(PATH_API);
  const [fresh, setFresh] = useState(null);   // 保存后回读到的整份数据，页面按它重画，不重新加载
  return (
    <Loadable state={fresh ? { data: fresh } : state} name="培养路径" big>
      {(data) => <PathPage data={data} tabs={tabs} onFresh={setFresh} />}
    </Loadable>
  );
}

function PathPage({ data, tabs, onFresh }) {
  const [who, setWho] = useState(() => (data.trainees.find((t) => t.path) ?? data.trainees[0])?.name);
  const [modal, setModal] = useState(null);   // { kind: add | generate | plan | record, id? }
  const [note, setNote] = useState(null);
  const t = data.trainees.find((x) => x.name === who) ?? data.trainees[0];
  const close = () => setModal(null);
  const onSaved = (fresh, text, name) => { onFresh(fresh); setNote(text); setModal(null); if (name) setWho(name); };
  const edit = { plans: data.plans, today: data.today, onClose: close, onSaved };
  return (
    <>
      <PageHeader title="带教" />
      <Tabs items={tabs} active="path" />
      <div className="toolbar">
        <div className="person-tabs">{data.trainees.map((p) => (
          <button key={p.name} type="button" className={p.name === t?.name ? "active" : ""} onClick={() => setWho(p.name)}>
            <span><strong>{p.name}</strong><span className="small">{personLine(p)}</span></span>
          </button>))}</div>
        <span className="spacer" />
        {t?.path?.missingYears.length > 0 && <span className="small risk-text">节假日表没有 {t.path.missingYears.join("、")} 年的数据，这段日子只跳过周末</span>}
        {t?.path && <Button onClick={() => setModal({ kind: "plan" })}><PixelIcon name="calendar" />调整安排</Button>}
        <Button onClick={() => setModal({ kind: "add" })}><PixelIcon name="plus" />添加带教对象</Button>
      </div>
      <SavedNote text={note} onClose={() => setNote(null)} />
      {!t ? <section className="card"><Placeholder icon="route" title="带教名单是空的">添加带教对象后，这里显示两条培养线的阶段、评审和当前进度。</Placeholder></section>
        : t.path ? <PersonPath key={t.name} t={t} today={data.today} onRecord={(id) => setModal({ kind: "record", id })} />
        : <section className="card"><Placeholder icon="route" title={t.legacy ? "还是旧版按周的培养路径" : "还没有培养路径"}
            action={<Button variant="primary" onClick={() => setModal({ kind: "generate" })}><PixelIcon name="route" />按方案生成路径</Button>}>
            {t.legacy ? "旧版按周排期，和现在按工作日的页面对不上；按培养方案重新生成一份，进度记录不动。" : `给${t.name}选入职日和培养方案，生成两条培养线的排期。`}</Placeholder></section>}
      {modal?.kind === "add" && <AddTrainee {...edit} />}
      {modal?.kind === "generate" && <GeneratePath trainee={t} {...edit} />}
      {modal?.kind === "plan" && <EditPlan name={t.name} path={t.path} onClose={close} onSaved={onSaved} />}
      {modal?.kind === "record" && <RecordStage name={t.name} s={model(t.path).byId[modal.id]} pass={t.path.pass} today={data.today} onClose={close} onSaved={onSaved} />}
    </>
  );
}

// 一个人的关键数字、地图和三张卡；换人时整块重建（选中的阶段、悬停都清空）
function PersonPath({ t, today, onRecord }) {
  const path = t.path, m = useMemo(() => model(path), [path]);
  const [sel, setSel] = useState(null), [hover, setHover] = useState(null);
  const onPick = (id) => setSel(id === m.cur.biz?.id ? null : id);
  const shown = m.byId[sel] ?? m.cur.biz ?? m.biz.at(-1), pair = m.pairOf(shown);
  return (
    <>
      <Kpis m={m} path={path} today={today} />
      <section className="card">
        <div className="card-head"><h2><PixelIcon name="route" />培养路径 · {t.name}</h2><Legend /></div>
        <PathMap path={path} m={m} hl={hover ?? sel} onHover={setHover} onPick={onPick} />
      </section>
      <div className="mpath-grid">
        <section className="card"><StageCard s={shown} m={m} head={sel ? "选中的阶段" : "当前阶段"} onRecord={onRecord} /></section>
        <section className="card">{pair ? <StageCard s={pair} m={m} head={m.isAi(shown.id) ? "同期业务线" : "同期技术线"} onRecord={onRecord} />
          : <><div className="card-head"><h2>同期技术线</h2></div><div className="mpath-sec"><p className="muted">技术线到 D{m.ai.at(-1).d[1]}（{m.ai.at(-1).id}）结束，{shown.id} 没有同期技术单元。</p></div></>}</section>
        <section className="card"><Reviews m={m} pass={path.pass} onPick={onPick} onRecord={onRecord} /></section>
      </div>
    </>
  );
}

function personLine(p) {
  if (!p.path) return `${p.role} · ${p.legacy ? "旧版路径，待重新生成" : "还没有培养路径"}`;
  const c = p.path.lines[0].stages.find((s) => s.status === "doing");
  return `${p.role} · ${dayLabel(p.path.todayD)} · ${c ? `${c.id} ${c.short}` : "已结业"}`;
}

function Kpis({ m, path, today }) {
  const done = (list) => list.filter((s) => s.status === "done").length;
  const now = (s) => (s ? `现在：${s.id} ${s.short}` : "全部完成");
  const passed = m.reviews.filter((s) => review(s)?.result === "pass").length;
  const retest = m.reviews.filter((s) => review(s)?.result === "retest").length, fail = m.reviews.filter((s) => review(s)?.result === "fail").length;
  const next = m.reviews.find((s) => !review(s));
  return (
    <StatStrip items={[
      { label: "培养进度", value: dayLabel(m.todayD), unit: ` / ${m.days} 工作日`,
        foot: m.over ? <>入职 {mmdd(path.start)} · <span className="risk-text">计划已结束 {m.over} 个工作日</span></> : `入职 ${mmdd(path.start)} · 今天 ${mmdd(today)}` },
      { label: "业务线", value: done(m.biz), unit: ` / ${m.biz.length} 阶段完成`, foot: now(m.cur.biz) },
      { label: "技术线", value: done(m.ai), unit: ` / ${m.ai.length} 单元完成`, foot: now(m.cur.ai) },
      { label: "评审", value: passed, unit: ` / ${m.reviews.length} 通过`,
        foot: fail ? <span className="risk-text">{fail} 项不通过</span> : retest ? <span className="mpath-warn">{retest} 项限期复核</span> : next ? `下一个：D${next.d[1]} ${next.review}` : "全部通过" },
    ]} />
  );
}

function Legend() {
  return (
    <span className="mpath-legend">
      <span><PixelSprite rows={SPRITES.flag} color="var(--text)" />已过营地</span>
      <span><PixelSprite rows={SPRITES.tent} color="var(--signal)" />正在爬</span>
      <span><PixelSprite rows={SPRITES.tent} color={LOCKED} />未到</span>
      <span><PixelSprite rows={SPRITES.crown} color="var(--text)" fillColor={GOLD} />结业</span>
    </span>
  );
}

/* ---------- 地图 ---------- */

function PathMap({ path, m, hl, onHover, onPick }) {
  const hostRef = useRef(null), labRef = useRef(null);
  const [W, setW] = useState(0), [fonts, setFonts] = useState(0), [place, setPlace] = useState(null);
  useLayoutEffect(() => {
    const el = hostRef.current, read = () => setW(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // 字体加载完文字宽度会变，重新量一遍
  useEffect(() => { let alive = true; document.fonts?.ready.then(() => alive && setFonts((f) => f + 1)); return () => { alive = false; }; }, []);
  const g = useMemo(() => (W ? layout(W, path) : null), [W, path]);
  const sc = useMemo(() => g && scenery(g), [g]);
  const walkers = useMemo(() => g && { biz: walkerAt(g, "biz", m.cur.biz), ai: walkerAt(g, "ai", m.cur.ai) }, [g, m]);
  // 先在页面里量标牌尺寸，再算位置
  useLayoutEffect(() => {
    if (!g) return;
    const lab = labRef.current, sz = (el) => ({ w: el.offsetWidth, h: el.offsetHeight }), all = (sel) => [...lab.querySelectorAll(sel)].map(sz);
    const plates = Object.fromEntries([...lab.querySelectorAll(".mpath-plate")].map((el) => [el.dataset.line, sz(el)]));
    const end = lab.querySelector(".mpath-end");
    setPlace({ g, ...placeLabels(g, m, { mounts: all(".mpath-mount"), tags: all(".mpath-tag"), plates, end: end && sz(end) }, walkers) });
  }, [g, fonts, m, walkers]);
  const P = place?.g === g ? place : null;
  const at = (b) => (b ? { left: b.l, top: b.t } : { visibility: "hidden" });
  const lineColor = (key) => (m.cur[key]?.late ? "var(--risk)" : "var(--signal)");

  return (
    <div className="mpath-map" ref={hostRef} onMouseOver={(e) => { const id = pick(e.target); if (id !== hl) onHover(id); }} onMouseLeave={() => onHover(null)} onClick={(e) => { const id = pick(e.target); if (id) onPick(id); }}>
      {g && (
        <svg viewBox={`0 0 ${g.W} ${H}`} height={H}>
          <Scenery g={g} sc={sc} clouds={P ? visibleClouds(sc.clouds, [...Object.values(P.plates), ...P.tags, ...(P.end ? [P.end] : [])]) : sc.clouds} />
          <Trail pts={g.ai.pts} xDone={walkers.ai[0]} end={sc.aiEnd.cx} color="var(--info)" />
          <Trail pts={g.biz.pts} xDone={walkers.biz[0]} end={sc.summit.cx} color="var(--text)" />
          <Highlight g={g} m={m} id={hl} />
          <path d={`M${sc.aiEnd.cx} ${sc.aiEnd.cy + 2}Q${sc.aiEnd.cx + 16} ${(sc.aiEnd.cy + yOn(g.biz.pts, sc.aiEnd.cx)) / 2 + 4} ${sc.aiEnd.cx + 2} ${yOn(g.biz.pts, sc.aiEnd.cx) - 4}`} fill="none" stroke="var(--info)" strokeWidth="1.5" strokeDasharray="1 4" strokeLinecap="round" />
          <SpriteCells rows={SPRITES.tent} x={g.ai.base[0] - 7} y={g.ai.base[1] - 15} cell={2} color="var(--info)" outline />
          <SpriteCells rows={SPRITES.tent} x={g.biz.base[0] - 7} y={g.biz.base[1] - 15} cell={2} color="var(--text)" outline />
          {g.ai.camps.map((c) => <Camp key={c.x.id} c={c} hl={hl} color="var(--info)" />)}
          {g.biz.camps.slice(0, -1).map((c) => <Camp key={c.x.id} c={c} hl={hl} color="var(--text)" />)}
          <g className="hit" data-id={sc.summit.x.id}>
            <SpriteCells rows={SPRITES.crown} x={sc.summit.cx - 13} y={sc.summit.cy - 18} cell={3} color="var(--text)" fillColor={GOLD} outline />
            <rect x={sc.summit.cx - 15} y={sc.summit.cy - 21} width="30" height="24" fill="transparent" />
          </g>
          <circle cx={g.xNow} cy={SUN_Y} r="21" fill="url(#mp-sun)" /><circle cx={g.xNow} cy={SUN_Y} r="11" fill="var(--signal)" />
          <line x1={g.xNow} y1={SUN_Y + 23} x2={g.xNow} y2={GROUND} stroke="var(--signal)" strokeWidth="2" strokeDasharray="2 5" />
          <Walkers at={[[walkers.biz, lineColor("biz")], [walkers.ai, lineColor("ai")]]} />
          <Strip g={g} path={path} />
          <text x={L - 10} y={BAND1 + 18} fontSize="11" textAnchor="end" fill="var(--text-2)">业务线</text>
          <text x={L - 10} y={BAND2 + 16} fontSize="11" textAnchor="end" fill="var(--info)">技术线</text>
          <Bands g={g} stages={m.biz} todayD={m.todayD} y={BAND1} h={28} hl={hl} />
          <Bands g={g} stages={m.ai} todayD={m.todayD} y={BAND2} h={24} hl={hl} ai />
          {P?.leads.map((l) => <path key={l.key} d={polyline(l.pts)} fill="none" stroke={lineColor(l.key)} strokeWidth="1.5" />)}
        </svg>
      )}
      {g && (
        <div className="mpath-labels" ref={labRef}>
          {["后山 · 技术线", "前山 · 业务线"].map((text, k) => <span key={text} className={`mpath-mount${k ? "" : " is-ai"}`} style={P ? at(P.mounts[k]) : { left: mountAt(g)[k][0], top: mountAt(g)[k][1] }}>{text}</span>)}
          {g.pinned && <span className="mpath-end" style={at(P?.end)}>今天 D{m.todayD} · 计划已结束 {m.over} 个工作日</span>}
          {m.reviews.map((s, k) => <ReviewTag key={s.id} s={s} path={path} hl={hl} style={at(P?.tags[k])} />)}
          {["biz", "ai"].filter((key) => m.cur[key]).map((key) => <Plate key={key} line={key} s={m.cur[key]} m={m} hl={hl} style={at(P?.plates[key])} />)}
        </div>
      )}
    </div>
  );
}

// 天空、三层山、松树（越往下网点越密）
function Scenery({ g, sc, clouds }) {
  const { W } = g, area = (pts) => `${polyline(pts)}L${W} ${GROUND}L0 ${GROUND}Z`;
  const banded = (id, pts, top, levels) => {
    const h = (GROUND - top) / levels.length;
    return (
      <>
        <clipPath id={`mp-c${id}`}><path d={area(pts)} /></clipPath>
        <path d={area(pts)} fill="var(--panel)" />
        <g clipPath={`url(#mp-c${id})`}>{levels.map((t, k) => <rect key={t} x="0" y={top + k * h} width={W} height={h + 1} fill={`url(#mp-${id}${t})`} />)}</g>
      </>
    );
  };
  return (
    <>
      <defs>
        <DitherPattern id="mp-far" threshold={2} color="#C9CCD3" />
        {[1, 2, 4, 6].map((t) => <DitherPattern key={t} id={`mp-B${t}`} threshold={t} color="#AEB3BB" />)}
        {[1, 2, 3, 4].map((t) => <DitherPattern key={t} id={`mp-F${t}`} threshold={t} color="#0D0E10" />)}
        <DitherPattern id="mp-sun" threshold={5} color="#FF4F1F" />
        <DitherPattern id="mp-sig" threshold={3} color="#FF4F1F" />
        <DitherPattern id="mp-risk" threshold={3} color="#D92D20" />
      </defs>
      {clouds.map(([x, y, cell]) => <SpriteCells key={x} rows={SPRITES.cloud} x={x} y={y} cell={cell} color="var(--text)" />)}
      <SpriteCells rows={SPRITES.bird} x={sc.birdX} y={54} cell={2} color="var(--text)" />
      <SpriteCells rows={SPRITES.bird} x={sc.birdX + 16} y={62} cell={2} color="var(--text)" />
      <path d={area(sc.far)} fill="url(#mp-far)" />
      {banded("B", sc.back, 110 + SKY, [1, 2, 4, 6])}
      <path d={polyline(sc.back)} fill="none" stroke={LOCKED} strokeWidth="1.25" />
      {banded("F", sc.front, 120 + SKY, [1, 2, 3, 4])}
      <path d={polyline(sc.front)} fill="none" stroke="var(--text)" strokeWidth="1.5" />
      {sc.pines.map((x) => <SpriteCells key={x} rows={SPRITES.pine} x={x} y={GROUND - 10} cell={2} color="var(--text)" />)}
    </>
  );
}

// 路：走过的粗实线，没走的虚线
function Trail({ pts, xDone, end, color }) {
  return (
    <>
      {xDone > pts[4][0] && <path d={polyline(clipPts(pts, pts[4][0], xDone))} fill="none" stroke={color} strokeWidth="3.5" strokeLinejoin="round" />}
      {xDone < end && <path d={polyline(clipPts(pts, xDone, end))} fill="none" stroke={color} strokeWidth="2" strokeDasharray="5 4" opacity=".75" />}
    </>
  );
}

// 悬停或选中的那一段：路上压一道粗的半透明
function Highlight({ g, m, id }) {
  const s = id && m.byId[id];
  if (!s) return null;
  const ai = m.isAi(id);
  return <path d={polyline(clipPts(g[ai ? "ai" : "biz"].pts, g.x0(s.d[0]), g.x1(s.d[1])))} fill="none" stroke={ai ? "var(--info)" : "var(--text)"} strokeWidth="6" strokeLinecap="square" opacity=".35" />;
}

// 营地：已过 = 旗，正在爬 = 帐篷 + 虚线框（超期红色），未到 = 灰帐篷；离上一个营地太近的只立一根桩
function Camp({ c, hl, color }) {
  const s = c.x, { cx, cy } = c, now = s.late ? "var(--risk)" : "var(--signal)";
  let body;
  if (c.gap < 26) { const f = s.status === "todo" ? LOCKED : color; body = <><rect x={cx - 1} y={cy - 9} width="2" height="9" fill={f} /><rect x={cx - 3} y={cy - 11} width="6" height="3" fill={f} /></>; }
  else if (s.status === "done") body = <SpriteCells rows={SPRITES.flag} x={cx - 3} y={cy - 17} cell={2} color={color} outline />;
  else if (s.status === "doing") body = <><rect x={cx - 11} y={cy - 22} width="22" height="20" fill="var(--panel)" stroke={now} strokeWidth="1.5" strokeDasharray="3 2" /><SpriteCells rows={SPRITES.tent} x={cx - 7} y={cy - 19} cell={2} color={now} /></>;
  else body = <SpriteCells rows={SPRITES.tent} x={cx - 7} y={cy - 16} cell={2} color={LOCKED} outline />;
  return (
    <g className="hit" data-id={s.id}>
      {hl === s.id && <rect x={cx - 14} y={cy - 25} width="28" height="27" fill="none" stroke="var(--text)" strokeWidth="1" />}
      {body}
      <rect x={cx - 12} y={cy - 24} width="24" height="26" fill="transparent" />
    </g>
  );
}

// 登山者：像素小人两帧交替挥手（约 2.5 帧/秒），减少动效时不动；自己管计时，不让整张图跟着重画
function Walkers({ at }) {
  const [walk, setWalk] = useState(0);
  useEffect(() => (prefersReducedMotion() ? undefined : frames((f) => { if (f % 6 === 0) setWalk((w) => 1 - w); })), []);
  return at.map(([[x, y], color], k) => <SpriteCells key={k} rows={SPRITES.climb[walk]} x={x - 7} y={y - 19} cell={2} color={color} outline />);
}

// 地平线带：月份白字、每 5 个工作日一格；今天一个橙格
function Strip({ g, path }) {
  const t = stripTicks(g, path.calendar, path.todayD);
  return (
    <>
      <rect x="0" y={GROUND} width={g.W} height={STRIP} fill="var(--text)" />
      {t.months.map((mo) => <g key={mo.d}><line x1={mo.x} y1={GROUND} x2={mo.x} y2={GROUND + STRIP} stroke="var(--panel)" strokeWidth="2" /><text x={mo.x + 5} y={GROUND + 16} fontSize="11" fill="var(--panel)">{mo.label}</text></g>)}
      {t.days.map((d) => <g key={d.d}><line x1={d.x} y1={GROUND} x2={d.x} y2={GROUND + 4} stroke="#686D76" /><text x={d.x} y={GROUND + 16} fontSize="10" textAnchor="middle" className="mono" fill={LOCKED}>D{d.d}</text></g>)}
      <rect x={g.xNow - t.nowW / 2} y={GROUND} width={t.nowW} height={STRIP} fill="var(--signal)" />
      <text x={g.xNow} y={GROUND + 16} fontSize="11" textAnchor="middle" className="mono" fill="var(--panel)" fontWeight="600">{t.now}</text>
    </>
  );
}

// 阶段条：编号牌 + 名称；正在做的那条用橙色（超期红色）网点铺到今天
function Bands({ g, stages, todayD, y, h, hl, ai = false }) {
  return bandRects(g, stages, todayD).map(({ x, a, w, idW, full, idOnly, prog }) => {
    const st = x.status, on = hl === x.id;
    const stroke = st === "doing" ? (x.late ? "var(--risk)" : "var(--signal)") : st === "done" ? (ai ? "var(--info)" : "var(--text)") : LOCKED;
    const idFill = st === "todo" ? "var(--panel)" : ai ? "var(--info)" : "var(--text)";
    return (
      <g key={x.id} className="hit" data-id={x.id}>
        <rect x={a} y={y} width={w} height={h} fill={st === "done" ? (ai ? "var(--info-soft)" : "var(--panel-soft)") : "var(--panel)"} />
        {prog > 0 && <rect x={a} y={y} width={prog} height={h} fill={`url(#${x.late ? "mp-risk" : "mp-sig"})`} />}
        <rect x={a} y={y} width={w} height={h} fill="none" stroke={stroke} strokeWidth={st === "doing" || on ? 2 : 1} strokeDasharray={st === "todo" ? "3 3" : undefined} />
        {on && <rect x={a - 3} y={y - 3} width={w + 6} height={h + 6} fill="none" stroke="var(--text)" />}
        {idOnly && <><rect x={a + 4} y={y + h / 2 - 7} width={idW} height="14" fill={idFill} stroke={st === "todo" ? LOCKED : undefined} /><text x={a + 8} y={y + h / 2 + 3.5} fontSize="10" className="mono" fill={st === "todo" ? "var(--muted)" : "var(--panel)"}>{x.id}</text></>}
        {full && <text x={a + idW + 10} y={y + h / 2 + 4} fontSize="12" fontWeight={st === "doing" ? 600 : 400} fill={st === "todo" ? "var(--muted)" : "var(--text)"} paintOrder="stroke" stroke="var(--panel)" strokeWidth={st === "doing" ? 4 : 0}>{x.short}</text>}
      </g>
    );
  });
}

// 评审小牌：有结论写分数（限期复核琥珀、不通过红），没有的写日期
function ReviewTag({ s, path, hl, style }) {
  const r = review(s), cls = r ? (r.result === "pass" ? "" : ` is-${r.result}`) : " is-future";
  return (
    <span className={`mpath-tag${cls}${hl === s.id ? " is-hl" : ""}`} data-id={s.id} style={style}>
      <PixelSprite rows={SPRITES.flag} cell={1} color={r ? RESULT_COLOR[r.result] : LOCKED} />
      {s.review}
      {r ? <><b>{r.score}</b>{r.result !== "pass" && <em>{RESULT[r.result][0]}</em>}</> : <span className="mono">D{s.d[1]} · {mmdd(s.dates[1])}</span>}
    </span>
  );
}

// 当前标牌：编号牌 + 阶段 + 工作日，逐日格子；超期写超出几个工作日
function Plate({ line, s, m, hl, style }) {
  const n = lenOf(s), dn = walked(s, m.todayD), step = stepAt(s, m.todayD);
  const sc = s.late ? `超出计划 ${s.late} 个工作日` : dn ? `第 ${dn} / ${n} 天${step ? ` · ${step.text}` : ""}` : `D${s.d[0]} 开始`;
  return (
    <div className={`mpath-plate${s.late ? " is-late" : ""}${hl === s.id ? " is-hl" : ""}`} data-id={s.id} data-line={line} style={style}>
      <div className="meta"><i className={`mpath-id${line === "ai" ? " is-ai" : ""}`}>{s.id}</i>{s.short} · {dText(s.d)}</div>
      <strong>{s.title}</strong>
      <Cells s={s} todayD={m.todayD} />
      <div className="sc" title={sc}>{sc}</div>
    </div>
  );
}

function Cells({ s, todayD }) {
  return <div className={`mpath-cells${s.late ? " is-late" : ""}`} style={{ "--n": lenOf(s) }}>{cellsOf(s, todayD).map((c, k) => <i key={k} className={c} />)}</div>;
}

/* ---------- 下方三张卡 ---------- */

function StatusTag({ s }) {
  const r = review(s);
  if (s.status === "done") return <Tag tone="green">已完成</Tag>;
  if (s.status === "todo") return <Tag>未开始</Tag>;
  if (s.late) return <Tag tone="red">超出 {s.late} 个工作日</Tag>;
  return r && r.result !== "pass" ? <Tag tone={RESULT[r.result][1]}>{RESULT[r.result][0]}</Tag> : <Tag tone="orange">进行中</Tag>;
}

function StageCard({ s, m, head, onRecord }) {
  const ai = m.isAi(s.id), n = lenOf(s), dn = walked(s, m.todayD), r = s.record, dated = s.steps.some((x) => x.d);
  return (
    <>
      <div className="card-head"><h2>{head}</h2><StatusTag s={s} /></div>
      <div className="mpath-sec">
        <div className="mpath-title">
          <span className="row"><i className={`mpath-id${ai ? " is-ai" : ""}`}>{s.id}</i><span className="label">{ai ? "技术线" : "业务线"} · {s.short}</span></span>
          <h3>{s.title}</h3>
          <span className="small muted mono">{spanText(s.d, s.dates)}</span>
          {s.status === "doing" && <>
            <Cells s={s} todayD={m.todayD} />
            <div className="mpath-progress"><span>D{s.d[0]}</span><b className={s.late ? "risk-text" : ""}>{s.late ? `计划 D${s.d[1]} 结束，已超出 ${s.late} 个工作日` : dn ? `第 ${dn} / ${n} 天` : `D${s.d[0]} 开始`}</b><span>D{s.d[1]}</span></div>
          </>}
        </div>
        <p>{s.goal}</p>
      </div>
      {s.steps.length > 0 && (
        <div className="mpath-sec"><span className="label">{ai ? "关键事项" : "安排"}</span>
          <ul>{s.steps.map((x, k) => <li key={k} className={stepState(x, s, m.todayD)}>{dated && <span className="tnum mono">{x.d ? dText(x.d) : ""}</span>}{x.text}</li>)}</ul>
        </div>
      )}
      <div className="mpath-sec"><span className="label">产出</span>{s.out.length ? <ul>{s.out.map((o) => <li key={o}>{o}</li>)}</ul> : <p className="muted">本阶段不设正式产出</p>}</div>
      {s.review && <div className="mpath-sec"><span className="label">{s.review} · 合格标准</span><p>{s.pass}</p></div>}
      {/* 记录按钮放在卡底，不进卡头（1280 宽同期那张卡只有约 270px，卡头放不下标题 + 超期标签 + 按钮，用户 10-26） */}
      <div className="mpath-sec is-foot"><span className="label">进度记录</span>
        <div className="mpath-record">
          <p className={r ? "" : "muted"}>{!r ? (s.review ? "还没有评审记录" : "带教还没确认完成") : r.kind === "review" ? <>{r.score} 分 · {RESULT[r.result][0]} · {mmdd(r.at)}</> : <>带教确认完成 · {mmdd(r.at)}</>}</p>
          <Button variant="xs" onClick={() => onRecord(s.id)}><PixelIcon name="edit" />{r ? "改记录" : s.review ? "记录评审" : "确认完成"}</Button>
        </div>
        {r?.note && <p className="small muted">{r.note}</p>}
      </div>
    </>
  );
}

function Reviews({ m, pass, onPick, onRecord }) {
  const next = m.reviews.find((s) => !review(s));
  return (
    <>
      <div className="card-head"><h2><PixelIcon name="flag" />评审与筛选</h2><span className="small muted">≥ {pass} 通过</span></div>
      <div className="mpath-sec mpath-reviews"><ul>{m.reviews.map((s) => {
        const r = review(s), isNext = s === next, gap = s.d[1] - m.todayD;
        const right = r ? <><span className="num tnum">{r.score}</span><Tag tone={RESULT[r.result][1]}>{RESULT[r.result][0]}</Tag></>
          : isNext ? (gap >= 0 ? <span className="small mpath-signal">{gap ? `还有 ${gap} 个工作日` : "今天"}</span> : <span className="small risk-text">超出 {-gap} 个工作日</span>)
          : <span className="small muted mono">{mmdd(s.dates[1])}</span>;
        return [
          <li key={s.id} className={r ? "" : isNext ? "is-next" : "is-future"} data-id={s.id} onClick={() => onPick(s.id)}>
            <PixelSprite rows={s.id === m.summitId ? SPRITES.crown : SPRITES.flag} color={r ? RESULT_COLOR[r.result] : LOCKED} />
            <span className="tnum mono">D{s.d[1]}</span><b>{s.review}</b>{right}
            <button type="button" className="icon-btn" title={r ? "改评审记录" : "记录评审"} aria-label={`${s.review}：${r ? "改评审记录" : "记录评审"}`} onClick={(e) => { e.stopPropagation(); onRecord(s.id); }}><PixelIcon name="edit" /></button>
          </li>,
          r?.note && <li key={`${s.id}-note`} className="is-note"><span className="small muted">{r.note}</span></li>,
        ];
      })}</ul></div>
    </>
  );
}
