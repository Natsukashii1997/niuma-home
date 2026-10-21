import { monthTimelineData } from "./timeline-view.js";
import { SuccessNotice } from "../../ui/SuccessNotice.jsx";
import { useCallback, useMemo, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, DateInput, Loadable, MonthSwitch, PageHeader, Placeholder, Segmented, Tabs, Tag } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { Strategy } from "./StrategyView.jsx";
import { Playbook } from "./PlaybookView.jsx";
import { deliveryMonth } from "../../constants.js";

// 用户（v3）：时间线 → 用户策略（月度，结构见 docs/用户策略规范.md）。Voice 已独立成侧栏模块。
// 时间线的第一要求是严谨：写全「学校 · 事件 · 起止日期」；冲突和推测单独标出，工作台不自行猜测；
// 来源单元格默认收起，打开「显示来源」或悬停才看，避免干扰阅读。
// 用户时间线的说明在视图里（右侧带来源），所以这里不写 desc
const TABS = [
  ["timeline", "用户时间"],
  ["strategy", "用户策略", "按月梳理各地区用户的节点、任务、痛点与决策障碍，收敛为机会点和促销建议"],
  ["playbook", "促销打法", "47 种促销打法的心理机制、适用信号与设计要点；月度用户策略按决策障碍从这里选打法"],
].map(([key, label, desc]) => ({ key, label, desc, href: href("user", key) }));

export default function UserPage({ route }) {
  const [tab = "timeline", ...rest] = route;
  if (tab === "voice") { location.replace(href("voice")); return null; } // 旧地址：留学之声已独立为 Voice
  const key = tab === "needs" ? "strategy" : tab;
  const View = key === "strategy" ? Strategy : key === "playbook" ? Playbook : Timeline;
  const active = key === "strategy" || key === "playbook" ? key : "timeline";
  return <><PageHeader title="策略" /><Tabs items={TABS} active={active} /><View route={rest} /></>;
}

/* ================= 用户时间线 ================= */
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n) => String(n).padStart(2, "0");
const md = (d) => d.slice(5);
const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const span = (from, to) => (to ? Math.round((toDate(to) - toDate(from)) / 86400000) + 1 : 1);
// 明细表的格子只有「MM-DD」：结束早于开始就是跨年（如 12-19 → 01-03），结束日算到下一年。
const mdDate = (md, y) => new Date(y, Number(md.slice(0, 2)) - 1, Number(md.slice(3)));
// 国家顺序（用户 2026-10-18）：甘特图分组、国家筛选、本月节点清单都按这个排；不在名单里的排最后，彼此保持原顺序。
const COUNTRY_ORDER = ["美国", "英国", "香港", "澳洲", "加拿大", "新加坡", "新西兰", "澳门"];
const countryRank = (name) => { const i = COUNTRY_ORDER.indexOf(name); return i < 0 ? COUNTRY_ORDER.length : i; };
const byCountry = (a, b) => countryRank(a) - countryRank(b);
const mdSpan = (a, b) => (b ? Math.round((mdDate(b, b < a ? 2027 : 2026) - mdDate(a, 2026)) / 86400000) + 1 : 1);

// 事件类别：颜色只区分类别，图例里写明。
const CATS = [["exam", "考试 / 补考", ["Final", "考试周", "期末", "期中", "补考"]], ["course", "选课 / 开学", ["选课", "春季选课", "开学"]], ["paper", "论文作业", ["Essay 截止"]], ["break", "假期", ["Reading Week", "期中假"]], ["result", "出分", ["出分"]]];
const catOf = (type) => (CATS.find(([, , types]) => types.includes(type)) || ["other"])[0];

// 明细表的列是源表原名（如「S1选课时间开放」「final考试(Exams T1)」），按关键词归类，只用于显示 / 隐藏列，不改源表的时间顺序。
const COL_CATS = [["course", "选课 / 开学"], ["exam", "考试"], ["result", "出分"], ["break", "假期"], ["other", "其他"]];
const COL_DEFAULT = ["course", "exam", "result"];
function colCat(name) {
  const n = name.toLowerCase();
  if (/出分|成绩/.test(n)) return "result";
  if (/选课/.test(n)) return "course";
  if (/休息|假|break|reading ?week|复习周|flexibility/.test(n)) return "break";
  if (/final|考试|midterm|期中|exam|补考/.test(n)) return "exam";
  if (/开学|开始|迎新/.test(n)) return "course";
  return "other";
}

function Timeline({ route }) {
  const state = useApi("/api/v3/timeline");
  const [fresh, setFresh] = useState(null); // 同步成功后回读到的新快照
  const view = ["month", "country", "anomalies"].includes(route[0]) ? route[0] : "month";
  // user/timeline/<视图>/<搜索词>：⌘K 打开某所学校时带上校名缩写，进页面就筛好
  return <Loadable state={state} name="用户时间" big>{(tl) => <TimelineBoard key={route[1] || ""} tl={fresh || tl} view={view} initialQ={route[1] || ""} onSynced={setFresh} />}</Loadable>;
}

// 同步：只读重取飞书各地区明细表，全部成功才替换本地快照；失败时页面仍是上次成功的快照。成功后再 GET 一次回读核对。
function useTimelineSync(tl, onSynced) {
  const [s, set] = useState({ busy: false, note: "", error: "" });
  async function run() {
    set({ busy: true, note: "", error: "" });
    try {
      const synced = await apiSend("POST", "/api/v3/timeline/sync");
      const back = await apiSend("GET", "/api/v3/timeline");
      if (back.syncedAt !== synced.syncedAt) throw new Error("同步后回读到的快照时间不一致，请刷新页面核对");
      onSynced(back);
      set({ busy: false, note: `已同步并回读：${back.agenda.length} 条事件 · ${back.anomalies.length} 条异常 · ${back.syncedAt}`, error: "" });
    } catch (e) { set({ busy: false, note: "", error: `同步失败：${e.message}。页面仍是上次成功的快照（${tl.syncedAt}）` }); }
  }
  return [s, run];
}

function TimelineBoard({ tl, view, initialQ, onSynced }) {
  const [q, setQ] = useState(initialQ);
  const [showSrc, setShowSrc] = useState(false);
  const [sync, runSync] = useTimelineSync(tl, onSynced);
  const go = (v) => { location.hash = href("user", "timeline", v); };
  return (
    <>
      <div className="tl-intro">
        <p>各国大学（{tl.stage}）的关键日期：选课、开学、考试、论文、出分。用来决定哪个月、对哪些学校的学生、推什么。</p>
        <span className="small muted">{tl.source} · 同步于 {tl.syncedAt}</span>
      </div>
      <div className="toolbar">
        <Segmented options={[["month", "按月 · 时间轴"], ["country", "按国家 · 明细表"], ["anomalies", `异常待确认 ${tl.anomalies.filter((a) => !a.ruling).length}`]]} value={view} onChange={go} />
        <label className="search-box tl-search"><PixelIcon name="search" /><input placeholder="搜索学校或事件，如 UQ / Final" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="check-inline"><input type="checkbox" checked={showSrc} onChange={(e) => setShowSrc(e.target.checked)} />显示来源单元格</label>
        <span className="spacer" />
        {sync.busy ? <div style={{ width: 200 }}><StepProgress label="同步飞书（只读）" /></div> : <Button onClick={runSync}><PixelIcon name="refresh" />同步</Button>}
      </div>
      {sync.note && <SuccessNotice className="small ok-text tl-sync" identity={sync}>{sync.note}</SuccessNotice>}
      {sync.error && <p className="small risk-text tl-sync">{sync.error}</p>}
      {view === "month" ? <MonthTimeline tl={tl} q={q} showSrc={showSrc} /> : view === "country" ? <CountryTable tl={tl} q={q} showSrc={showSrc} /> : <Anomalies tl={tl} q={q} onSaved={onSynced} />}
    </>
  );
}

// 按月时间轴：一行一所学校，横轴是这个月的每一天；条的长度就是起止日期。跨月的条在边上标出真实起止。
function MonthTimeline({ tl, q, showSrc }) {
  const [month, setMonth] = useState(deliveryMonth());
  const [country, setCountry] = useState("");
  const [folded, setFolded] = useState(() => new Set());
  const fold = (c) => setFolded((o) => { const n = new Set(o); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const [y, m] = month.split("-").map(Number);
  const nDays = new Date(y, m, 0).getDate();
  const first = `${month}-01`, last = `${month}-${pad(nDays)}`;
  const now = new Date();
  const todayIdx = now.getFullYear() === y && now.getMonth() + 1 === m ? now.getDate() : 0;
  const { list, pending, calendar, count } = monthTimelineData(tl, month, country, q);
  const counter = (c) => { const n = count(c); return `本月 ${n.dated} · 待确认 ${n.pending} / 全年 ${n.total} 校`; };
  const groups = useMemo(() => {
    const byC = new Map();
    for (const e of [...list].sort((a, b) => a.from.localeCompare(b.from))) {
      if (!byC.has(e.c)) byC.set(e.c, new Map());
      const bySchool = byC.get(e.c);
      if (!bySchool.has(e.school)) bySchool.set(e.school, []);
      bySchool.get(e.school).push(e);
    }
    return [...byC.entries()].sort(([a], [b]) => byCountry(a, b)).map(([c, schools]) => [c, [...schools.entries()]]);
  }, [list]);
  const [dayW, setDayW] = useState(30);
  const ro = useRef(null);
  const daysRef = useCallback((el) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(() => setDayW(el.clientWidth / nDays));
    ro.current.observe(el);
  }, [nDays]);
  const place = (e) => placeBar(e, { first, last, nDays, dayW, showSrc });
  const countries = tl.countries.map(([, name]) => name).sort(byCountry);
  const cols = { gridTemplateColumns: `repeat(${nDays}, minmax(0, 1fr))` };
  return (
    <>
      <div className="toolbar">
        <MonthSwitch month={month} onChange={setMonth} mark={month === deliveryMonth() ? "交付月" : ""} />
        <button type="button" className={`chip${!country ? " is-on" : ""}`} onClick={() => setCountry("")}>全部国家 <span className="tnum">{counter("")}</span></button>
        {countries.map((c) => <button key={c} type="button" className={`chip${country === c ? " is-on" : ""}`} onClick={() => setCountry(country === c ? "" : c)}>{c} <span className="tnum">{counter(c)}</span></button>)}
        <span className="spacer" />
        <span className="tl-cats">{CATS.map(([k, label]) => <span key={k}><i className={`ev-${k}`} />{label}</span>)}<span><i className="ev-flag" />冲突待确认</span><span><i className="ev-guess" />推测</span></span>
      </div>
      <p className="small muted tl-how">“本月”统计能排入时间轴的学校（含已标注的推测或冲突）；“待确认”统计原文涉及本月、但尚不能排期的学校，两者可能重叠。全年学校数来自地区明细。月历原文另列在下方供对照。</p>
      {!groups.length ? <Placeholder icon="calendar" title={`${country || "全部国家"} · ${month} 暂无可排期节点`}>下方仍保留待确认记录和月历原文，也可查看“按国家 · 明细表”。</Placeholder> : (
        <section className="card gantt">
          <div className="gantt-head">
            <span className="gantt-corner label">{month} · {list.length} 个节点</span>
            <div className="gantt-days" style={cols} ref={daysRef}>
              {Array.from({ length: nDays }, (_, i) => {
                const wd = new Date(y, m - 1, i + 1).getDay();
                return <span key={i} className={`${wd === 0 || wd === 6 ? "is-wkd" : ""}${i + 1 === todayIdx ? " is-today" : ""}`}><b>{i + 1}</b><em>{WD[wd]}</em></span>;
              })}
            </div>
          </div>
          {groups.map(([c, schools]) => (
            <div key={c} className="gantt-group">
              <button type="button" className="gantt-country" aria-expanded={!folded.has(c)} onClick={() => fold(c)}>
                <PixelIcon name={folded.has(c) ? "right" : "down"} /><strong>{c}</strong><span className="small muted">{schools.length} 所学校</span>
              </button>
              {!folded.has(c) && schools.map(([school, evs]) => { const rows = lanes(evs.map(place)); return (
                <div key={school} className="gantt-row">
                  <div className="gantt-school"><strong>{school.split(" ")[0]}</strong><span className="tnum small muted">{school.split(" ").slice(1).join(" ")}</span></div>
                  <div className="gantt-track" style={{ ...cols, gridTemplateRows: `repeat(${rows.length}, 28px)` }}>
                    {Array.from({ length: nDays }, (_, i) => { const wd = new Date(y, m - 1, i + 1).getDay(); return <i key={`bg${i}`} className={`gantt-bg${wd === 0 || wd === 6 ? " is-wkd" : ""}${i + 1 === todayIdx ? " is-today" : ""}`} style={{ gridColumn: i + 1, gridRow: `1 / ${rows.length + 1}` }} />; })}
                    {rows.flatMap((items, lane) => items.flatMap(({ e, s, end, side, cols: n, when }, k) => {
                      const tip = `${e.school} · ${e.type}${e.detail ? `（${e.detail}）` : ""}\n${e.from}${e.to ? ` → ${e.to}（${span(e.from, e.to)} 天）` : "（单日）"}\n来源：${e.src}${e.flag === "conflict" ? "\n冲突待确认" : e.flag === "guess" ? "\n推测，待确认" : e.ruled ? "\n人工裁定（工作台）" : ""}`;
                      const text = <><b>{e.type}{e.detail ? ` · ${e.detail}` : ""}</b><em className="tnum">{when}</em>{e.flag === "guess" && <i className="gantt-guess">推测</i>}</>;
                      const bar = side === "single" ? [s, s + n] : [s, end];
                      return [
                        <span key={`${lane}-${k}`} className={`gantt-bar ev-${catOf(e.type)}${!e.to ? " is-single" : ""}${e.flag ? ` is-${e.flag}` : ""}`}
                          style={{ gridColumn: `${bar[0]} / ${bar[1] + 1}`, gridRow: lane + 1 }} title={tip}>
                          {(side === "in" || side === "single") && text}
                        </span>,
                        (side === "right" || side === "left") && (
                          <span key={`${lane}-${k}-t`} className={`gantt-label${side === "left" ? " is-left" : ""}`}
                            style={{ gridColumn: side === "right" ? `${end + 1} / span ${n}` : `${s - n} / ${s}`, gridRow: lane + 1 }} title={tip}>{text}</span>
                        ),
                      ];
                    }))}
                  </div>
                </div>
              ); })}
            </div>
          ))}
          {todayIdx > 0 && <i className="gantt-now" aria-hidden="true" title="现在" style={{ "--now": (todayIdx - 1 + (now.getHours() * 60 + now.getMinutes()) / 1440) / nDays }} />}
        </section>
      )}
      {list.length > 0 && <MonthList list={list} first={first} showSrc={showSrc} />}
      {pending.length > 0 && <section className="card tl-pending-month">
        <div className="card-head"><strong>本月待确认 · {pending.length} 条原文</strong><span className="small muted">原文涉及本月，尚未作为确定日期排期</span></div>
        <div className="table-wrap"><table className="grid"><thead><tr><th>国家 / 学校</th><th>事件</th><th>原文</th><th>原因与来源</th></tr></thead><tbody>
          {pending.map((a, i) => <tr key={`${a.src}-${i}`}><td>{a.c}<br /><strong>{a.school}</strong></td><td>{a.cell?.header || "列标题待核对"}</td><td style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{a.a}</td><td>{a.issue}<br /><a href={href("user", "timeline", "anomalies", a.school)}>{a.src} · 查看并核对</a></td></tr>)}
        </tbody></table></div>
      </section>}
      <details className="card tl-calendar-reference"><summary>月历原文对照 · {calendar.length} 条{country ? `（${country}）` : ""}</summary>
        <p className="small muted">完整保留飞书当月月历的原文格。地区明细未收录的学校、额外事件和不同日期也可在这里核对；不按月历摆放位置推定年份或日期，不直接参与策略推导。选择“全部国家”可查看尚未归类的原文。</p>
        <div className="table-wrap"><table className="grid"><thead><tr><th>学校 / 地区</th><th>月历原文</th><th>来源</th></tr></thead><tbody>{calendar.map(e => <tr key={e.src}><td>{e.schools.join("、") || "学校待核对"}<br /><span className="small muted">{e.countries.join("、") || "地区待核对"}</span></td><td style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{e.raw}</td><td>{e.src}</td></tr>)}</tbody></table></div>
      </details>
    </>
  );
}

// 同一所学校的条（连同放在条外的文字）有重叠时，分到不同的行，避免叠在一起。
function lanes(items) {
  const out = [];
  for (const it of items) {
    const lane = out.find((l) => l.every((x) => x.b < it.a || x.a > it.b));
    if (lane) lane.push(it); else out.push([it]);
  }
  return out;
}

// 文字宽度按真实字体量；条里放不下就放到条的右边，右边到月底也放不下就放左边。不截断文字。
let measureCtx = null;
function textWidth(text, font) {
  measureCtx ||= document.createElement("canvas").getContext("2d");
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function placeBar(e, { first, last, nDays, dayW, showSrc }) {
  const s = e.from < first ? 1 : Number(e.from.slice(8));
  const end = (e.to || e.from) > last ? nDays : Number((e.to || e.from).slice(8));
  const when = `${md(e.from)}${e.to ? ` → ${md(e.to)}` : ""}${showSrc ? ` · ${e.src}` : ""}`;
  const w = textWidth(e.type + (e.detail ? ` · ${e.detail}` : ''), '600 12px Geist, "PingFang SC"') + 4 + textWidth(when, '11px "Geist Mono", "PingFang SC"')
    + (e.flag === "guess" ? 4 + textWidth("推测", '11px Geist, "PingFang SC"') : 0);
  if (!e.to) { // 单日：菱形 + 文字，文字占的格子也算进分道
    const n = Math.ceil((w + 18) / dayW);
    if (s + n - 1 <= nDays) return { e, s, end: s, side: "single", cols: n - 1, when, a: s, b: s + n - 1 };
    const m = Math.ceil((w + 8) / dayW);
    if (s - m >= 1) return { e, s, end: s, side: "left", cols: m, when, a: s - m, b: s };
    return { e, s, end: s, side: "single", cols: nDays - s, when, a: s, b: nDays };
  }
  if ((end - s + 1) * dayW - 13 >= w) return { e, s, end, side: "in", cols: 0, when, a: s, b: end };
  const n = Math.ceil((w + 8) / dayW);
  if (end + n <= nDays) return { e, s, end, side: "right", cols: n, when, a: s, b: end + n };
  if (s - n >= 1) return { e, s, end, side: "left", cols: n, when, a: s - n, b: end };
  return { e, s, end, side: "in", cols: 0, when, a: s, b: end };
}

// 时间轴下面的文字清单：按开始日期排，一句话写全。
function MonthList({ list, first, showSrc }) {
  const rows = [...list].sort((a, b) => byCountry(a.c, b.c) || a.from.localeCompare(b.from));
  return (
    <section className="card month-list">
      <div className="card-head"><h2><PixelIcon name="menu" />本月节点清单</h2><span className="small muted">按国家、开始日期排序 · 悬停一行可看来源单元格</span></div>
      <table className="grid compact">
        <thead><tr><th>开始</th><th>国家</th><th>学校</th><th>事件</th><th className="r">起止</th><th className="r">天数</th>{showSrc && <th>来源</th>}</tr></thead>
        <tbody>{rows.map((e, i) => {
          const d = toDate(e.from);
          return (
            <tr key={i} title={`来源：${e.src}`} className={e.flag ? `is-${e.flag}` : ""}>
              <td className="tnum">{e.from < first ? <span className="muted">上月开始</span> : `${md(e.from)} 周${WD[d.getDay()]}`}</td>
              <td>{e.c}</td>
              <td><strong>{e.school}</strong></td>
              <td><span className={`ev-dot ev-${catOf(e.type)}`} />{e.type}{e.detail && <small> · {e.detail}</small>}{e.flag === "conflict" && <Tag tone="red">冲突待确认</Tag>}{e.flag === "guess" && <Tag tone="amber">推测</Tag>}{e.ruled && <Tag tone="frame">人工裁定</Tag>}</td>
              <td className="r">{md(e.from)}{e.to ? ` → ${md(e.to)}` : ""}</td>
              <td className="r">{e.to ? `${span(e.from, e.to)} 天` : "单日"}</td>
              {showSrc && <td className="tnum small muted">{e.src}</td>}
            </tr>
          );
        })}</tbody>
      </table>
    </section>
  );
}

function CountryTable({ tl, q, showSrc }) {
  const [c, setC] = useState("AU");
  const [showCats, setShowCats] = useState(() => new Set(COL_DEFAULT));
  const rows = (tl.table[c] || []).filter((r) => !q || `${r.school}${r.abbr}`.toLowerCase().includes(q.toLowerCase()));
  const nodes = tl.nodes[c] || [];
  const visible = nodes.map((n, i) => [n, i, colCat(n)]).filter(([, , k]) => showCats.has(k));
  const catsHere = COL_CATS.filter(([k]) => nodes.some((n) => colCat(n) === k));
  const toggleCat = (k) => setShowCats((o) => { const n = new Set(o); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const dm = deliveryMonth().slice(5);
  // 空格子分两种：原表这一格空白；或者原表写了，但日期不完整 / 有冲突，进了「异常待确认」（按「学校 + 列名」对上异常清单）。
  // 裁定为「不采用」的格子单独标出；已裁定采用的格子已有日期，不再算待确认。
  const cellKey = (a) => `${a.school}|${a.issue.split("：")[0]}`;
  const pendingKeys = useMemo(() => new Set(tl.anomalies.filter((a) => !a.ruling).map(cellKey)), [tl.anomalies]);
  const excludedKeys = useMemo(() => new Set(tl.anomalies.filter((a) => a.ruling?.decision === "exclude").map(cellKey)), [tl.anomalies]);
  return (
    <>
      <div className="toolbar">
        {[...tl.countries].sort(([, a], [, b]) => byCountry(a, b)).map(([code, name]) => (
          <button key={code} type="button" className={`chip${c === code ? " is-on" : ""}`} aria-pressed={c === code} onClick={() => setC(code)}>
            {name} <span className="tnum">{tl.table[code] ? `${tl.table[code].length} 校` : "—"}</span>
          </button>
        ))}
      </div>
      {!tl.table[c] ? <Placeholder icon="timeline" title={`${tl.countries.find(([k]) => k === c)?.[1] || c} · 来源里没有这个国家的明细`}>飞书地区明细表里没有这一组学校。</Placeholder> : (
        <>
          <div className="toolbar">
            <span className="label">显示列</span>
            {catsHere.map(([k, label]) => (
              <button key={k} type="button" className={`chip${showCats.has(k) ? " is-on" : ""}`} aria-pressed={showCats.has(k)} onClick={() => toggleCat(k)}>
                <span className={`ev-dot ev-${k}`} />{label} <span className="tnum">{nodes.filter((n) => colCat(n) === k).length}</span>
              </button>
            ))}
            <button type="button" className="chip" onClick={() => setShowCats(new Set(COL_CATS.map(([k]) => k)))}>显示全部列</button>
            <span className="spacer" />
            <span className="small muted">显示 {visible.length} / {nodes.length} 列 · 列按源表的时间顺序排</span>
          </div>
          <p className="small muted tl-how">每一行是一所学校，每一列是一类事件；格子里是这件事的起止日期和持续天数。{tl.terms[c]}。</p>
          <div className="table-wrap">
            <table className="grid tl-table">
              <thead><tr><th className="tl-school">学校</th>{visible.map(([n, i, k]) => <th key={i}><span className={`ev-dot ev-${k}`} />{n}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.school}-${r.abbr}`}>
                    <th scope="row" className="tl-school"><strong>{r.school}</strong><span className="tnum small muted">{r.abbr}</span></th>
                    {visible.map(([n, i]) => {
                      const cell = r.cells[i];
                      const k = `${r.abbr ? `${r.school} ${r.abbr}` : r.school}|${n}`;
                      if (!cell) return pendingKeys.has(k)
                        ? <td key={i} className="tl-cell is-pending" title="原表写了，但日期不完整或有冲突，见「异常待确认」"><a href={href("user", "timeline", "anomalies", r.abbr || r.school)}>待确认</a></td>
                        : excludedKeys.has(k) ? <td key={i} className="tl-cell is-missing" title="原表写了，人工裁定为不采用"><a href={href("user", "timeline", "anomalies", r.abbr || r.school)}>不采用</a></td>
                        : <td key={i} className="tl-cell is-missing" title="原表这一格空白"><span>—</span></td>;
                      if (r.cellRanges?.[i]?.length > 0) return <td key={i} className="tl-cell" title={`来源：${cell[2]}`}>
                        {r.cellRanges[i].map((part, j) => <div key={j}><span className="tnum">{part.from} → {part.to}</span>{part.label && <small>{part.label}</small>}{part.flag && <Tag tone={part.flag === "conflict" ? "red" : "amber"}>{part.flag === "ruled" ? "人工裁定" : part.flag === "conflict" ? "冲突" : "待确认"}</Tag>}</div>)}
                        {showSrc && <small>{cell[2]}</small>}
                      </td>;
                      const [from, rawTo, src, flag] = cell;
                      const to = rawTo && rawTo !== from ? rawTo : null; // 起止同一天按单日写
                      const inDm = from.startsWith(dm) || (to && to.startsWith(dm));
                      return (
                        <td key={i} className={`tl-cell${flag ? ` is-${flag}` : ""}${inDm ? " is-dm" : ""}`} title={`来源：${src}`}>
                          <span className="tnum">{from}{to && <> → {to}</>}</span>
                          <small>{to ? `${mdSpan(from, to)} 天` : "单日"}{flag === "guess" && <Tag tone="amber">推测</Tag>}{flag === "conflict" && <Tag tone="red">冲突</Tag>}{flag === "ruled" && <Tag tone="frame">人工裁定</Tag>}{showSrc && <span className="tnum"> · {src}</span>}</small>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tl-legend small muted"><span><i className="lg-dm" />落在交付月（{dm} 月）</span><span>— 原表这一格空白</span><span>「待确认」：原表写了但日期不完整或有冲突，点开看原文</span><span>「人工裁定」：在工作台裁定的日期，不改飞书</span></div>
        </>
      )}
    </>
  );
}

// 异常待确认：原文、来源单元格、标记都完整保留；长原文在框内换行、超长时框内滚动，不撑破页面。
// 日期类异常可以人工裁定（采用解析出的日期 / 手填 / 不采用），只存工作台、不改飞书；裁定后这一格按裁定值参与主线需求推导。
// 飞书原格一改（重新同步后原文变了），旧裁定自动失效，这条回到待确认。校名类异常没有日期格，仍请改飞书原表。
const RULE_SHOW = [["open", "待确认"], ["ruled", "已裁定"], ["all", "全部"]];
function Anomalies({ tl, q, onSaved }) {
  const [show, setShow] = useState("all");
  const open = tl.anomalies.filter((a) => !a.ruling).length;
  const list = tl.anomalies.filter((a) => (!q || `${a.school}${a.issue}`.toLowerCase().includes(q.toLowerCase())) && (show === "all" || (show === "ruled") === Boolean(a.ruling)));
  const oldSnapshot = tl.anomalies.length > 0 && !tl.anomalies.some((a) => a.cell);
  const reread = async () => { const back = await apiSend("GET", "/api/v3/timeline"); onSaved(back); return back; };
  return (
    <>
      <p className="small muted">导入时发现日期不完整、多个时段、含限定条件或互相冲突的格子，共 {tl.anomalies.length} 条，{open} 条待确认{q ? `，筛出 ${list.length} 条` : ""}。工作台不自行猜测：没裁定的格子不参与推导主线需求。日期类异常可以在这里人工裁定（只存工作台，不改飞书）；也可以改飞书原表后点「同步」。</p>
      {oldSnapshot && <p className="small warn-text">当前快照是旧格式，没有记录单元格位置；点上面的「同步」重新读取（只读）后才能裁定。</p>}
      {tl.rulings?.stale > 0 && <p className="small warn-text">有 {tl.rulings.stale} 条裁定对应的飞书原格已经改过，已自动失效，这些格子回到待确认。</p>}
      <div className="toolbar"><Segmented options={RULE_SHOW.map(([k, label]) => [k, `${label} ${k === "open" ? open : k === "ruled" ? tl.anomalies.length - open : tl.anomalies.length}`])} value={show} onChange={setShow} /></div>
      {!list.length ? <Placeholder icon="search" title="没有符合条件的异常">换个学校名或事件名试试。</Placeholder> : (
        <div className="anomaly-list">
          {list.map((a, i) => <AnomalyCard key={a.key || `${a.src}-${i}`} a={a} reread={reread} />)}
        </div>
      )}
    </>
  );
}

const DECISION_TEXT = { adopt: "采用", manual: "手填日期", exclude: "不采用" };
const cellName = (a, i) => (a.cell?.cells.length > 1 ? (i ? "B" : "A") : "原文");
function rulingText(a, r) {
  if (r.decision === "exclude") return "不采用：这一格不参与推导";
  if (r.segments?.length) return `采用原格全部 ${r.segments.length} 个时段：${r.segments.map(p => `${p.label || ""} ${p.from} → ${p.to}`).join("；")}`;
  return `${r.decision === "adopt" ? `采用${cellName(a, r.cell)}` : `手填（写在${cellName(a, r.cell)}格）`}：${r.from} → ${r.to}`;
}

function AnomalyCard({ a, reread }) {
  const cells = a.cell?.cells || [];
  const [pick, setPick] = useState(""); // "adopt:0" / "adopt:1" / "manual" / "exclude"
  const [days, setDays] = useState({ from: "", to: "" });
  const [note, setNote] = useState("");
  const flow = useWriteFlow();
  const locked = flow.busy || flow.phase === "unknown";
  const choose = (v) => { setPick(v); flow.reset(); };
  const body = () => {
    if (pick === "clear") return { decision: "clear" };
    const [decision, cell] = pick.split(":");
    return { decision, cell: Number(cell || 0), ...(decision === "manual" && days), ...(note.trim() && { note: note.trim() }) };
  };
  const dayOk = (v) => /^20\d{2}-\d{2}-\d{2}$/.test(v);
  const ready = pick && (pick !== "manual" || (dayOk(days.from) && dayOk(days.to) && days.to >= days.from));
  const preview = (b = body()) => flow.preview(() => apiSend("POST", `/api/v3/timeline/anomalies/${encodeURIComponent(a.key)}/preview`, b));
  const confirm = () => flow.confirm(
    (pv) => apiSend("POST", "/api/v3/timeline/anomalies/confirm", { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      const back = await reread(); const now = back.anomalies.find((x) => x.key === a.key);
      if (!now) return "已保存，但重新读取后这条异常不在快照里了（原表可能已改）";
      if (pv.value.decision === "clear") return !now.ruling;
      return Boolean(now.ruling) && ["decision", "cell", "from", "to", "note"].every((k) => now.ruling[k] === pv.value[k]);
    },
  );
  const resolve = async () => { await reread(); flow.resolve(); };
  return (
    <section className={`card anomaly${a.ruling ? " is-done" : ""}`}>
      <div className="anomaly-main">
        <strong>{a.school}</strong>
        <span>{a.issue}</span>
        <span className="small muted">来源单元格 <span className="tnum">{a.src}</span>{a.flag && <> · 标记 <Tag tone={a.flag === "conflict" ? "red" : "amber"}>{a.flag}</Tag></>}</span>
      </div>
      <div className="anomaly-opts">
        <div><span className="label">原文 A</span><pre className="anomaly-raw">{a.a || "（空）"}</pre></div>
        <div><span className="label">原文 B</span><pre className="anomaly-raw">{a.b || "—"}</pre></div>
      </div>
      <div className="anomaly-rule">
        {a.ruling ? (
          <div className="row">
            <Tag tone="green">已裁定</Tag><span>{rulingText(a, a.ruling)}</span>
            {a.ruling.note && <span className="small muted">备注：{a.ruling.note}</span>}
            <span className="spacer" />
            <Button className="btn btn-xs" disabled={locked} onClick={() => { setPick("clear"); preview({ decision: "clear" }); }}>撤销裁定</Button>
          </div>
        ) : !a.cell ? (
          <p className="small muted">这条没有可裁定的日期格（校名类异常或旧快照）。校名请改飞书原表后同步。</p>
        ) : (
          <>
            <div className="row rule-opts">
              <span className="label">裁定</span>
              {cells.map((c, i) => c.from && (
                <button key={i} type="button" className={`chip${pick === `adopt:${i}` ? " is-on" : ""}`} disabled={locked} onClick={() => choose(`adopt:${i}`)}>
                  采用{cellName(a, i)} {c.segments?.length > 1 ? `全部 ${c.segments.length} 个时段` : <span className="tnum">{c.from.slice(5)} → {c.to.slice(5)}</span>}
                </button>
              ))}
              <button type="button" className={`chip${pick === "manual" ? " is-on" : ""}`} disabled={locked} onClick={() => choose("manual")}>手填日期</button>
              <button type="button" className={`chip${pick === "exclude" ? " is-on" : ""}`} disabled={locked} onClick={() => choose("exclude")}>不采用</button>
              {pick === "manual" && <>
                <DateInput className="rule-day" value={days.from} aria-label="开始日期" disabled={locked} onChange={(v) => { setDays({ ...days, from: v }); flow.reset(); }} />
                <DateInput className="rule-day" value={days.to} min={days.from || undefined} aria-label="结束日期" disabled={locked} onChange={(v) => { setDays({ ...days, to: v }); flow.reset(); }} />
              </>}
              {pick && <input className="rule-note" value={note} maxLength={500} placeholder="备注（可选），如：官网校历确认" disabled={locked} onChange={(e) => { setNote(e.target.value); flow.reset(); }} />}
              <span className="spacer" />
              <Button variant="primary" className="btn btn-xs" disabled={!ready || locked || pick === "clear"} onClick={() => preview()}><PixelIcon name="eye" />预览裁定</Button>
            </div>
            {pick === "manual" && cells.some(c => c.segments?.length > 1) && <p className="small warn-text">手填会将这一格的全部时段替换为你填写的单一区间；要保留各时段，请选择“采用原文全部时段”。</p>}
            {pick === "manual" && cells.length > 1 && <p className="small muted">手填的日期写在 A 格；B 格仍不参与推导。</p>}
          </>
        )}
        <WriteBox flow={flow} title={pick === "clear" ? "撤销裁定预览" : "裁定预览"} confirmLabel={pick === "clear" ? "确认撤销" : "确认裁定"} savedText={pick === "clear" ? "已撤销裁定，回读核对一致；这一格回到待确认" : "已裁定，回读核对一致"} onConfirm={confirm} onRepreview={() => preview(pick === "clear" ? { decision: "clear" } : body())} onReread={resolve}>
          {(pv) => <dl className="kv">
            <dt>格子</dt><dd>{a.school} · {a.cell?.header || a.issue.split("：")[0]} · <span className="tnum">{a.src}</span></dd>
            <dt>裁定</dt><dd>{pv.value.decision === "clear" ? <><span className="diff-old">{a.ruling && rulingText(a, a.ruling)}</span> → <span className="diff-new">撤销，回到待确认</span></> : <span className="diff-new">{rulingText(a, pv.value)}</span>}</dd>
            {pv.value.note && <><dt>备注</dt><dd>{pv.value.note}</dd></>}
            <dt>影响</dt><dd>{pv.value.decision === "clear" || pv.value.decision === "exclude" ? "这一格不参与主线需求推导" : "这一格按裁定日期参与主线需求推导；已采纳的相关需求会变成「待复核」"}</dd>
            <dt>写到哪里</dt><dd>工作台本地，不改飞书原表；原格内容变了裁定自动失效</dd>
          </dl>}
        </WriteBox>
      </div>
    </section>
  );
}
