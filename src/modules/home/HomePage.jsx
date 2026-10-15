import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Card, Loadable } from "../../ui/components.jsx";
import { BitAvatar, DitherBar, DotMatrix, FlipNumber, PixelIcon } from "../../ui/bitmap.jsx";
import { LINES, PROMO_FIELDS, currentMonth } from "../../constants.js";

// 首页：位图风样板页。数字卡①、点阵图②、网点悬停④、网点比例条均使用真实数据。

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function shiftMonth(month, delta) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function greeting(hour) {
  return hour < 5 ? "夜深了" : hour < 11 ? "早上好" : hour < 13 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
}

// 每月促销变动数：与同业务线同 SKU 的上一个有数据月份相比，新增或任一字段变化记 1 次。
function changesByMonth(promos) {
  const sorted = [...promos].sort((a, b) => a.month.localeCompare(b.month));
  const lastSeen = new Map(), counts = new Map();
  for (const row of sorted) {
    const key = `${row.line}|${row.sku}`;
    const prev = lastSeen.get(key);
    if (!prev || PROMO_FIELDS.some(([f]) => prev[f] !== row[f])) counts.set(row.month, (counts.get(row.month) || 0) + 1);
    lastSeen.set(key, row);
  }
  return counts;
}

export default function HomePage() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const promos = useApi("/api/promos");
  const plans = useApi("/api/plans");
  const materials = useApi("/api/materials");
  const reports = useApi("/api/reports?withSources=1");
  return (
    <>
      <header className="home-hero">
        <div>
          <h1>{greeting(now.getHours())}</h1>
          <p className="label">{WEEKDAYS[now.getDay()]} {String(now.getDate()).padStart(2, "0")} {MONTHS[now.getMonth()]} {now.getFullYear()} · DAY {dayOfYear} · WK {isoWeek(now)}</p>
        </div>
        <a className="btn" href={href("marketing", "plans")}><PixelIcon name="plus" /> 录入本月方案</a>
      </header>
      <KpiRow promos={promos} plans={plans} materials={materials} reports={reports} now={now} />
      <div className="home-row wide">
        <PromoChanges promos={promos} />
        <LineShare promos={promos} />
      </div>
      <div className="home-row thirds">
        <TodayCard now={now} />
        <LatestReport reports={reports} />
        <AgentsCard />
      </div>
    </>
  );
}

function Kpi({ label, value, unit, foot, delta, hero = false, children }) {
  return (
    <section className={`kpi${hero ? " is-hero" : ""}`} data-dither="">
      <span className="label">{label}</span>
      <span className="kpi-value"><FlipNumber value={value} />{unit && <small>{unit}</small>}</span>
      <div className="kpi-foot">
        <span>{delta !== undefined && delta !== null ? <span className={`kpi-delta${delta > 0 ? " up" : ""}`}>{delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} {Math.abs(delta)} </span> : null}{foot}</span>
        {children}
      </div>
    </section>
  );
}

function KpiRow({ promos, plans, materials, reports, now }) {
  const month = currentMonth(), prev = shiftMonth(month, -1);
  const count = (rows, m) => rows.filter((r) => r.month === m).length;
  const planLines = plans.data ? LINES.filter((line) => plans.data.some((p) => p.month === month && p.line === line)) : [];
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekStart = localDate(monday);
  const weekDaily = reports.data?.reports?.filter((r) => r.kind === "日报" && r.date >= weekStart && r.date <= localDate(now)).length;
  const dailySource = reports.data?.sources?.find((source) => source.role === "daily");
  const dailyError = reports.error || (dailySource?.ok === false ? dailySource.error || "日报来源读取失败" : null);
  const value = (state, fn) => (state.data ? fn(state.data) : state.error ? "—" : 0);
  return (
    <div className="kpi-grid">
      <Kpi hero label="本月方案录入" value={plans.data ? planLines.length : plans.error ? "—" : 0} unit="/3"
        foot={plans.data ? (planLines.length === 3 ? "三条业务线已齐" : `待录：${LINES.filter((l) => !planLines.includes(l)).join("、")}`) : plans.error || "读取中"}>
        <span className="kpi-pips" aria-hidden="true">{LINES.map((l) => <i key={l} className={planLines.includes(l) ? undefined : "off"} />)}</span>
      </Kpi>
      <Kpi label="本月促销 SKU" value={value(promos, (rows) => count(rows, month))}
        delta={promos.data ? count(promos.data, month) - count(promos.data, prev) : null} foot={promos.error || "对比上月"} />
      <Kpi label="本月物料" value={value(materials, (rows) => count(rows, month))}
        delta={materials.data ? count(materials.data, month) - count(materials.data, prev) : null} foot={materials.error || "对比上月"} />
      <Kpi label="本周日报" value={dailyError ? "—" : reports.data ? weekDaily : 0} unit=" 篇"
        foot={dailyError || `WK ${isoWeek(now)} · 自 ${weekStart.slice(5)}`} />
    </div>
  );
}

function PromoChanges({ promos }) {
  const month = currentMonth();
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(month, i - 11));
  return (
    <Card title="促销变动 · 近 12 个月" dither extra={<a className="link" href={href("marketing", "promos")}>促销表</a>}>
      <Loadable state={promos}>
        {(rows) => {
          const counts = changesByMonth(rows);
          const data = months.map((m) => ({ label: MONTHS[Number(m.slice(5)) - 1][0], hint: m, value: counts.get(m) || 0 }));
          return (
            <>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <span className="label">本月变动 · {month}</span>
                <span className="card-figure signal"><FlipNumber value={counts.get(month) || 0} /></span>
              </div>
              <DotMatrix data={data} rows={10} highlight={11} unit=" 次" />
            </>
          );
        }}
      </Loadable>
    </Card>
  );
}

// 三条业务线的 SKU 占比；本月没有数据时回退到最近有数据的月份，并在标题处注明。
function LineShare({ promos }) {
  return (
    <Card title="业务线 · SKU 分布" dither>
      <Loadable state={promos}>
        {(rows) => {
          const month = rows.some((r) => r.month === currentMonth()) ? currentMonth() : rows[0]?.month;
          const scoped = rows.filter((r) => r.month === month);
          return (
            <>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
                <span className="label">{month ? `${month}${month !== currentMonth() ? " · 最近有数据" : ""}` : "暂无数据"}</span>
                <span className="card-figure"><FlipNumber value={scoped.length} /></span>
              </div>
              <div className="line-share">
                {LINES.map((line) => {
                  const n = scoped.filter((r) => r.line === line).length;
                  const share = scoped.length ? n / scoped.length : 0;
                  return (
                    <div key={line} className="line-share-item">
                      <div className="row"><span>{line}</span><span className="label">{n} SKU · {Math.round(share * 100)}%</span></div>
                      <DitherBar value={share} />
                    </div>
                  );
                })}
              </div>
            </>
          );
        }}
      </Loadable>
    </Card>
  );
}

// 「当前或下一条」日程标橙：结束时间晚于现在的第一条。
function TodayCard({ now }) {
  const state = useApi("/api/calendar/today");
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    <Card title={<><PixelIcon name="calendar" /> 今日日程</>} dither extra={<a className="link" href="https://www.feishu.cn/calendar/" target="_blank" rel="noreferrer">飞书</a>}>
      <Loadable state={state}>
        {(events) => {
          if (!events.length) return <p className="muted">今天没有日程</p>;
          const end = (e) => { const t = [...e.time.matchAll(/(\d{1,2}):(\d{2})/g)].at(-1); return t ? Number(t[1]) * 60 + Number(t[2]) : -1; };
          const next = events.findIndex((e) => end(e) > minutes);
          return (
            <ul className="list calendar-list today-list">
              {events.map((e, i) => (
                <li key={i} className={i === next ? "is-now" : undefined}>
                  <span className="list-time">{e.time}</span>
                  <span>{e.title}</span>
                  {e.place && <span className="muted small">{e.place}</span>}
                </li>
              ))}
            </ul>
          );
        }}
      </Loadable>
    </Card>
  );
}

function LatestReport({ reports }) {
  return (
    <Card title={<><PixelIcon name="reports" /> 最新日报</>} dither extra={<a className="link" href={href("reports")}>全部</a>}>
      <Loadable state={reports}>
        {({ reports: rows, sources }) => {
          const dailySource = sources?.find((source) => source.role === "daily");
          if (dailySource?.ok === false) return <p className="error">{dailySource.error || "日报来源读取失败"}</p>;
          const latest = rows.find((r) => r.kind === "日报");
          if (!latest) return <p className="muted">还没有日报</p>;
          return (
            <>
              <p className="label" style={{ margin: "0 0 8px" }}>{latest.date}</p>
              <a href={href("reports", latest.id)}><strong>{latest.title}</strong></a>
              <p className="pre clamp small muted" style={{ marginTop: 8 }}>{latest.body}</p>
            </>
          );
        }}
      </Loadable>
    </Card>
  );
}

function AgentsCard() {
  const state = useApi("/api/assistants");
  return (
    <Card title={<><PixelIcon name="agent" /> Agent</>} dither extra={<a className="link" href={href("assistants")}>全部</a>}>
      <Loadable state={state}>
        {(list) => (
          <ul className="list agent-list">
            {list.map((a) => (
              <li key={a.id}>
                <BitAvatar seed={a.name} />
                <a href={href("assistants", String(a.id))}>{a.name}</a>
                <span className="agent-model">{a.model ? `${a.model}${a.effort ? ` · ${a.effort}` : ""}` : "默认"}</span>
              </li>
            ))}
          </ul>
        )}
      </Loadable>
    </Card>
  );
}
