import { useMemo, useState } from "react";
import { PixelIcon, StepProgress } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Loadable, MonthSwitch, PageHeader, Placeholder, SampleBadge, Segmented, Tabs, Tag, useToast } from "../../ui/components.jsx";
import { deliveryMonth } from "../../constants.js";
import { SAMPLE_NEEDS, SAMPLE_TIMELINE } from "../../samples/v3.js";

// 用户（v3）：时间线 → 用户策略（主线需求是策略的起点）。Voice 已独立成侧栏模块。
// 时间线的第一要求是严谨：写全「学校 · 事件 · 起止日期」；冲突和推测单独标出，工作台不自行猜测；
// 来源单元格默认收起，打开「显示来源」或悬停才看，避免干扰阅读。
const TABS = [["timeline", "用户时间线"], ["strategy", "用户策略"]].map(([key, label]) => ({ key, label, href: href("user", key) }));

export default function UserPage({ route }) {
  const [tab = "timeline", ...rest] = route;
  if (tab === "voice") { location.replace(href("voice")); return null; } // 旧地址：留学之声已独立为 Voice
  const key = tab === "needs" ? "strategy" : tab;
  const View = key === "strategy" ? Strategy : Timeline;
  return <><PageHeader title="用户" /><Tabs items={TABS} active={key === "strategy" ? "strategy" : "timeline"} /><View route={rest} /></>;
}

/* ================= 用户时间线 ================= */
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n) => String(n).padStart(2, "0");
const md = (d) => d.slice(5);
const toDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const span = (from, to) => (to ? Math.round((toDate(to) - toDate(from)) / 86400000) + 1 : 1);
const mdSpan = (a, b) => (b ? Math.round((new Date(`2026-${b}`) - new Date(`2026-${a}`)) / 86400000) + 1 : 1);

// 事件类别：颜色只区分类别，图例里写明。
const CATS = [["exam", "考试", ["Final", "考试周", "期末", "期中"]], ["course", "选课 / 开学", ["选课", "春季选课", "开学"]], ["paper", "论文作业", ["Essay 截止"]], ["break", "假期", ["Reading Week", "期中假"]], ["result", "出分", ["出分"]]];
const catOf = (type) => (CATS.find(([, , types]) => types.includes(type)) || ["other"])[0];

function Timeline({ route }) {
  const state = useApi("/api/v3/timeline", SAMPLE_TIMELINE);
  const view = ["month", "country", "anomalies"].includes(route[0]) ? route[0] : "month";
  return <Loadable state={state}>{(tl) => <TimelineBoard tl={tl} view={view} sample={state.isSample ? state.task : null} />}</Loadable>;
}

function TimelineBoard({ tl, view, sample }) {
  const [q, setQ] = useState("");
  const [showSrc, setShowSrc] = useState(false);
  const [sync, setSync] = useState(false);
  const go = (v) => { location.hash = href("user", "timeline", v); };
  return (
    <>
      <p className="tl-intro">各国大学（{tl.stage}）的关键日期：选课、开学、考试、论文、出分。用来决定<b>哪个月</b>、对<b>哪些学校的学生</b>、推<b>什么</b>。</p>
      <div className="toolbar">
        <Segmented options={[["month", "按月 · 时间轴"], ["country", "按国家 · 明细表"], ["anomalies", `异常待确认 ${tl.anomalies.length}`]]} value={view} onChange={go} />
        <label className="search-box"><PixelIcon name="search" /><input placeholder="搜索学校或事件，如 UQ / Final" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label className="check-inline"><input type="checkbox" checked={showSrc} onChange={(e) => setShowSrc(e.target.checked)} />显示来源单元格</label>
        <span className="spacer" />
        {sample && <SampleBadge task={sample} />}
        <span className="small muted">{tl.source} · 同步于 {tl.syncedAt}</span>
        {sync ? <div style={{ width: 200 }}><StepProgress label="同步飞书（只读）" /></div> : <Button onClick={() => setSync(true)}><PixelIcon name="refresh" />同步</Button>}
      </div>
      {view === "month" ? <MonthTimeline tl={tl} q={q} showSrc={showSrc} /> : view === "country" ? <CountryTable tl={tl} q={q} showSrc={showSrc} /> : <Anomalies tl={tl} />}
    </>
  );
}

// 按月时间轴：一行一所学校，横轴是这个月的每一天；条的长度就是起止日期。跨月的条在边上标出真实起止。
function MonthTimeline({ tl, q, showSrc }) {
  const [month, setMonth] = useState(deliveryMonth());
  const [country, setCountry] = useState("");
  const [y, m] = month.split("-").map(Number);
  const nDays = new Date(y, m, 0).getDate();
  const first = `${month}-01`, last = `${month}-${pad(nDays)}`;
  const now = new Date();
  const todayIdx = now.getFullYear() === y && now.getMonth() + 1 === m ? now.getDate() : 0;
  const inMonth = tl.agenda.filter((e) => e.from <= last && (e.to || e.from) >= first);
  const list = inMonth.filter((e) => (!country || e.c === country) && (!q || `${e.school}${e.type}`.toLowerCase().includes(q.toLowerCase())));
  const groups = useMemo(() => {
    const byC = new Map();
    for (const e of [...list].sort((a, b) => a.from.localeCompare(b.from))) {
      if (!byC.has(e.c)) byC.set(e.c, new Map());
      const bySchool = byC.get(e.c);
      if (!bySchool.has(e.school)) bySchool.set(e.school, []);
      bySchool.get(e.school).push(e);
    }
    return [...byC.entries()].map(([c, schools]) => [c, [...schools.entries()].map(([school, evs]) => [school, lanes(evs)])]);
  }, [list]);
  const countries = [...new Set(inMonth.map((e) => e.c))];
  const cols = { gridTemplateColumns: `repeat(${nDays}, minmax(0, 1fr))` };
  return (
    <>
      <div className="toolbar">
        <MonthSwitch month={month} onChange={setMonth} mark={month === deliveryMonth() ? "交付月" : ""} />
        <button type="button" className={`chip${!country ? " is-on" : ""}`} onClick={() => setCountry("")}>全部国家 <span className="tnum">{inMonth.length}</span></button>
        {countries.map((c) => <button key={c} type="button" className={`chip${country === c ? " is-on" : ""}`} onClick={() => setCountry(country === c ? "" : c)}>{c} <span className="tnum">{inMonth.filter((e) => e.c === c).length}</span></button>)}
        <span className="spacer" />
        <span className="tl-cats">{CATS.map(([k, label]) => <span key={k}><i className={`ev-${k}`} />{label}</span>)}<span><i className="ev-flag" />冲突待确认</span></span>
      </div>
      {!groups.length ? <Placeholder icon="calendar" title="这个月没有节点">换个月份，或清掉筛选条件。</Placeholder> : (
        <section className="card gantt">
          <div className="gantt-head">
            <span className="gantt-corner label">{month} · {list.length} 个节点</span>
            <div className="gantt-days" style={cols}>
              {Array.from({ length: nDays }, (_, i) => {
                const wd = new Date(y, m - 1, i + 1).getDay();
                return <span key={i} className={`${wd === 0 || wd === 6 ? "is-wkd" : ""}${i + 1 === todayIdx ? " is-today" : ""}`}><b>{i + 1}</b><em>{WD[wd]}</em></span>;
              })}
            </div>
          </div>
          {groups.map(([c, schools]) => (
            <div key={c} className="gantt-group">
              <div className="gantt-country"><strong>{c}</strong><span className="small muted">{schools.length} 所学校</span></div>
              {schools.map(([school, rows]) => (
                <div key={school} className="gantt-row">
                  <div className="gantt-school"><strong>{school.split(" ")[0]}</strong><span className="tnum small muted">{school.split(" ").slice(1).join(" ")}</span></div>
                  <div className="gantt-track" style={{ ...cols, gridTemplateRows: `repeat(${rows.length}, 28px)` }}>
                    {Array.from({ length: nDays }, (_, i) => { const wd = new Date(y, m - 1, i + 1).getDay(); return <i key={`bg${i}`} className={`gantt-bg${wd === 0 || wd === 6 ? " is-wkd" : ""}${i + 1 === todayIdx ? " is-today" : ""}`} style={{ gridColumn: i + 1, gridRow: `1 / ${rows.length + 1}` }} />; })}
                    {rows.flatMap((evs, lane) => evs.map((e) => {
                      const s = e.from < first ? 1 : Number(e.from.slice(8));
                      const end = (e.to || e.from) > last ? nDays : Number((e.to || e.from).slice(8));
                      const single = !e.to;
                      const cut = `${e.from < first ? "← " : ""}${md(e.from)}${e.to ? ` → ${md(e.to)}` : ""}${(e.to || e.from) > last ? " →" : ""}`;
                      return (
                        <span key={`${e.type}${e.from}`} className={`gantt-bar ev-${catOf(e.type)}${single ? " is-single" : ""}${e.flag ? ` is-${e.flag}` : ""}`}
                          style={{ gridColumn: `${s} / ${end + 1}`, gridRow: lane + 1 }}
                          title={`${e.school} · ${e.type}\n${e.from}${e.to ? ` → ${e.to}（${span(e.from, e.to)} 天）` : "（单日）"}\n来源：${e.src}${e.flag === "conflict" ? "\n冲突待确认" : ""}`}>
                          <b>{e.type}</b><em className="tnum">{cut}{showSrc ? ` · ${e.src}` : ""}</em>
                        </span>
                      );
                    }))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}
      {list.length > 0 && <MonthList list={list} first={first} showSrc={showSrc} />}
    </>
  );
}

// 同一所学校的事件如果日期重叠，分到不同的行，避免条叠在一起。
function lanes(evs) {
  const out = [];
  for (const e of evs) {
    const end = e.to || e.from;
    const lane = out.find((l) => l.every((x) => (x.to || x.from) < e.from || x.from > end));
    if (lane) lane.push(e); else out.push([e]);
  }
  return out;
}

// 时间轴下面的文字清单：按开始日期排，一句话写全。
function MonthList({ list, first, showSrc }) {
  const rows = [...list].sort((a, b) => a.from.localeCompare(b.from));
  return (
    <section className="card month-list">
      <div className="card-head"><h2><PixelIcon name="menu" />本月节点清单</h2><span className="small muted">按开始日期排序 · 悬停一行可看来源单元格</span></div>
      <table className="grid compact">
        <thead><tr><th>开始</th><th>国家</th><th>学校</th><th>事件</th><th className="r">起止</th><th className="r">天数</th>{showSrc && <th>来源</th>}</tr></thead>
        <tbody>{rows.map((e, i) => {
          const d = toDate(e.from);
          return (
            <tr key={i} title={`来源：${e.src}`} className={e.flag ? `is-${e.flag}` : ""}>
              <td className="tnum">{e.from < first ? <span className="muted">上月开始</span> : `${md(e.from)} 周${WD[d.getDay()]}`}</td>
              <td>{e.c}</td>
              <td><strong>{e.school}</strong></td>
              <td><span className={`ev-dot ev-${catOf(e.type)}`} />{e.type}{e.flag === "conflict" && <Tag tone="red">冲突待确认</Tag>}{e.flag === "guess" && <Tag tone="amber">推测</Tag>}</td>
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
  const rows = (tl.table[c] || []).filter((r) => !q || `${r.school}${r.abbr}`.toLowerCase().includes(q.toLowerCase()));
  const nodes = tl.nodes[c] || [];
  const dm = deliveryMonth().slice(5);
  return (
    <>
      <div className="country-tabs" role="tablist">
        {tl.countries.map(([code, name]) => (
          <button key={code} type="button" role="tab" aria-selected={c === code} className={c === code ? "active" : ""} onClick={() => setC(code)}>
            {name}<span className="tnum">{tl.table[code]?.length ?? "—"}</span>
          </button>
        ))}
      </div>
      {!tl.table[c] ? <Placeholder icon="timeline" title={`${tl.countries.find(([k]) => k === c)[1]} · 示例数据未包含`}>示例只放了澳洲和英国的明细；接入飞书后各国都会显示。</Placeholder> : (
        <>
          <p className="small muted tl-how">每一行是一所学校，每一列是一类事件；格子里是这件事的起止日期和持续天数。{tl.terms[c]}。</p>
          <div className="table-wrap">
            <table className="grid tl-table">
              <thead><tr><th>学校</th>{nodes.map((n) => <th key={n}><span className={`ev-dot ev-${catOf(n)}`} />{n}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.abbr}>
                    <th scope="row"><strong>{r.school}</strong><span className="tnum small muted">{r.abbr}</span></th>
                    {r.cells.map((cell, i) => {
                      if (!cell) return <td key={i} className="tl-cell is-missing" title="原表这一格为空"><span>—</span><small>原表没写</small></td>;
                      const [from, to, src, flag] = cell;
                      const inDm = from.startsWith(dm) || (to && to.startsWith(dm));
                      return (
                        <td key={i} className={`tl-cell${flag ? ` is-${flag}` : ""}${inDm ? " is-dm" : ""}`} title={`来源：${src}`}>
                          <span className="tnum">{from}{to && <> → {to}</>}</span>
                          <small>{to ? `${mdSpan(from, to)} 天` : "单日"}{flag === "guess" && <Tag tone="amber">推测</Tag>}{flag === "conflict" && <Tag tone="red">冲突</Tag>}{showSrc && <span className="tnum"> · {src}</span>}</small>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="tl-legend small muted"><span><i className="lg-dm" />落在交付月（{dm} 月）</span><span>推测、冲突的格子请到「异常待确认」处理</span></div>
        </>
      )}
    </>
  );
}

function Anomalies({ tl }) {
  const [pick, setPick] = useState({});
  const [toast, showToast] = useToast();
  return (
    <>
      <p className="small muted">导入时发现的冲突和缺失。工作台不自行猜测；你选定后只写入工作台，不改飞书原表。</p>
      <div className="anomaly-list">
        {tl.anomalies.map((a, i) => (
          <section key={i} className={`card anomaly${pick[i] ? " is-done" : ""}`}>
            <div className="anomaly-main">
              <strong>{a.school}</strong>
              <span>{a.issue}</span>
              <span className="tnum small muted">来源 {a.src}</span>
            </div>
            <div className="anomaly-opts">
              <div><span className="label">写法 A</span><span className="tnum">{a.a}</span></div>
              <div><span className="label">写法 B</span><span className="tnum">{a.b || "—"}</span></div>
            </div>
            <Segmented options={[["", "待定"], ["a", "采用 A"], ...(a.b ? [["b", "采用 B"]] : [["ok", "确认推测"]])]} value={pick[i] || ""} onChange={(v) => { setPick((o) => ({ ...o, [i]: v })); if (v) showToast("已记录你的选择（示例，未写入）"); }} />
          </section>
        ))}
      </div>
      {toast}
    </>
  );
}

/* ================= 用户策略：主线需求 → 拆解 → 行动 ================= */
const AREAS = ["营销", "产品", "运营"];

function Strategy() {
  const state = useApi(`/api/v3/needs?month=${deliveryMonth()}`, SAMPLE_NEEDS);
  return <Loadable state={state}>{(data) => <StrategyBoard data={data} sample={state.isSample ? state.task : null} />}</Loadable>;
}

function StrategyBoard({ data, sample }) {
  const [needs, setNeeds] = useState(data.needs);
  const [sel, setSel] = useState(data.needs[0]?.id);
  const [toast, showToast] = useToast();
  const cur = needs.find((n) => n.id === sel) || needs[0];
  const adopt = (id) => { setNeeds((o) => o.map((n) => n.id === id ? { ...n, status: "已采纳" } : n)); showToast("已采纳：现在可以拆解策略，促销方案也能关联这条需求（示例）"); };
  const adopted = needs.filter((n) => n.status === "已采纳").length;
  return (
    <>
      <ol className="flow-chain">
        {[["用户时间线", "事件与日期", href("user", "timeline")], ["主线需求", `${needs.length} 条 · ${adopted} 已采纳`, null], ["策略拆解", `${needs.filter((n) => n.strategy).length} 条已拆解`, null], ["营销行动", "价格 · 物料 · brief", href("marketing")]].map(([a, b, to], i) => (
          <li key={a} className={i === 1 || i === 2 ? "is-here" : ""}>{to ? <a href={to}><b>{a}</b><span>{b}</span></a> : <span><b>{a}</b><span>{b}</span></span>}</li>
        ))}
      </ol>
      <div className="toolbar">
        <span className="small muted">{data.month} · 需求由「事件 → 需求」对照表从时间线推导；采纳后才拆解策略、才能被促销关联</span>
        <span className="spacer" />
        {sample && <SampleBadge task={sample} />}
        <Button onClick={() => showToast("已按对照表重新推导：4 条，无变化（示例）")}><PixelIcon name="refresh" />重新推导</Button>
        <Button><PixelIcon name="plus" />手写一条需求</Button>
      </div>
      <div className="strategy-layout">
        <ol className="need-list">
          {needs.map((n) => (
            <li key={n.id}>
              <button type="button" className={n.id === cur?.id ? "is-sel" : ""} onClick={() => setSel(n.id)}>
                <span className="need-top"><strong>{n.seg} · {n.node}</strong><Tag tone={n.status === "已采纳" ? "green" : "amber"}>{n.status}</Tag></span>
                <span className="need-need">{n.need}</span>
                <span className="need-meta tnum small muted">{n.when} · {n.schools} 所学校 · {n.strategy ? `${Object.values(n.strategy.actions).flat().length} 个行动` : "未拆解"}</span>
              </button>
            </li>
          ))}
        </ol>
        {cur && (
          <section className="card need-detail">
            <div className="card-head">
              <h2><PixelIcon name="target" />{cur.seg} · {cur.node}</h2>
              <span className="tnum small muted">{cur.when} · 来源 {cur.source}</span>
            </div>
            <div className="card-body">
              <div className="need-facts">
                <div><span className="label">需求</span><p>{cur.need}</p></div>
                <div><span className="label">痛点</span><p>{cur.pain}</p></div>
                <div><span className="label">学生的待办</span><p>{cur.todo}</p></div>
              </div>
              {cur.status !== "已采纳" ? (
                <div className="need-draft">
                  <p>这条需求还是草稿。先确认它成立，再拆解策略。</p>
                  <div className="row"><Button variant="primary" onClick={() => adopt(cur.id)}><PixelIcon name="check" />采纳</Button><button type="button" className="link-btn">丢弃</button></div>
                </div>
              ) : !cur.strategy ? (
                <div className="need-draft"><p>已采纳，还没有拆解策略。</p><Button onClick={() => showToast("已生成拆解草稿（示例）")}><PixelIcon name="spark" />AI 起草拆解</Button></div>
              ) : (
                <>
                  <div className="strategy-goal"><span className="label">策略目标</span><strong>{cur.strategy.goal}</strong></div>
                  <div className="strategy-cols">
                    {AREAS.map((area) => {
                      const acts = cur.strategy.actions[area] || [];
                      return (
                        <div key={area} className="strategy-col">
                          <h3>{area}<span className="tnum">{acts.length}</span></h3>
                          {!acts.length ? <p className="small muted">暂无行动</p> : (
                            <ol>{acts.map(([what, why]) => <li key={what}><strong>{what}</strong><span>为什么：{why}</span></li>)}</ol>
                          )}
                          <button type="button" className="link-btn"><PixelIcon name="plus" />加一条</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="row strategy-foot">
                    <span className="small muted">已关联：{cur.links || "—"}</span>
                    <span className="spacer" />
                    <Button onClick={() => showToast("已生成飞书文档预览（示例，未写入）")}><PixelIcon name="external" />预览导出飞书</Button>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
      <details className="rule-box">
        <summary><PixelIcon name="right" />推导规则 · 事件 → 需求对照表（{data.map.length} 类，AI 起草，你确认后基本不动）</summary>
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>事件类型</th><th className="r">提前天数</th><th>需求</th><th>痛点</th><th>待办</th><th>状态</th></tr></thead>
            <tbody>{data.map.map((r) => (
              <tr key={r.type}><td><strong>{r.type}</strong></td><td className="r">{r.lead}</td><td>{r.need}</td><td className="small">{r.pain}</td><td className="small">{r.todo}</td>
                <td>{r.ok ? <span className="state state-done">已确认</span> : <span className="state state-todo">AI 草拟</span>}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </details>
      {toast}
    </>
  );
}
