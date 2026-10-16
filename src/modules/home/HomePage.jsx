import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Card, Loadable, SampleBadge, StatusMark } from "../../ui/components.jsx";
import { BitAvatar, FlipNumber, PixelIcon } from "../../ui/bitmap.jsx";
import { LINES, deliveryMonth, daysToDeadline, shortMonth } from "../../constants.js";
import { SAMPLE_MONTH, SAMPLE_REVENUE, SAMPLE_TODO, SAMPLE_VOICE } from "../../samples/v3.js";
import { CodexCard } from "./CodexStrip.jsx";
import { VoiceCloud } from "../voice/VoicePage.jsx";

// 首页（v3）：业务营收完成度 → Codex 重置 + 待我处理 → 交付月 + 今日日程 → 用户之声 + Agent。
// 工作节奏是本月准备下月，月底前交付。

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

// 交付截止日 = 交付月前一个月的最后一天，如 2026-11 → 10-31。
function deadlineLabel(month) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1, 0);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function greeting(hour) {
  return hour < 5 ? "夜深了" : hour < 11 ? "早上好" : hour < 13 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
}

export default function HomePage() {
  const now = new Date();
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const month = deliveryMonth();
  const plans = useApi("/api/plans");
  return (
    <>
      <header className="home-hero">
        <div>
          <h1>{greeting(now.getHours())}</h1>
          <p className="label">{WEEKDAYS[now.getDay()]} {String(now.getDate()).padStart(2, "0")} {MONTHS[now.getMonth()]} {now.getFullYear()} · DAY {dayOfYear} · WK {isoWeek(now)} · 交付月 {month}</p>
        </div>
        <a className="btn btn-primary" href={href("marketing", "plans")}><PixelIcon name="grid" /> {shortMonth(month)}促销</a>
      </header>
      <div className="home-grid">
        <RevenueCard />
        <CodexCard className="col-8" />
        <TodoCard />
        <DeliveryCard month={month} plans={plans} />
        <TodayCard now={now} />
        <VoiceCard />
        <AgentsCard />
      </div>
    </>
  );
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");

// 业务营收完成度：总计一行、业务线一行。竖线是时间进度；完成度不低于时间进度为绿，落后 15 个百分点以内为琥珀，再落后为红。
function RevenueCard() {
  const state = useApi("/api/v3/home/revenue", SAMPLE_REVENUE);
  const r = state.data;
  return (
    <Card className="col-12 revenue" title={<><PixelIcon name="trend" /> 业务营收完成度</>}
      extra={<>{state.isSample && <SampleBadge task={state.task} />}{r && <span className="small muted">{r.period}{r.timePct != null && ` · 时间进度 ${Math.round(r.timePct * 100)}%（竖线）`} · 更新 {r.updatedAt}</span>}</>}>
      <Loadable state={state}>
        {(data) => (
          <div className="rev-groups">
            {data.groups.map((g) => (
              <div key={g.label} className="rev-row">
                <span className="rev-group">{g.label}</span>
                {g.items.map((it) => <RevenueItem key={it.key} item={it} timePct={data.timePct} />)}
              </div>
            ))}
          </div>
        )}
      </Loadable>
    </Card>
  );
}

function RevenueItem({ item, timePct }) {
  const pct = item.target ? item.current / item.target : 0;
  const tone = timePct == null ? "neutral" : pct >= timePct ? "ok" : pct >= timePct - 0.15 ? "warn" : "risk";
  const toneLabel = { ok: "跟上进度", warn: "略落后", risk: "落后", neutral: "" }[tone];
  return (
    <div className={`rev-item is-${tone}`}>
      <div className="rev-head"><span className="rev-name">{item.name}</span>{toneLabel && <span className="rev-tone">{toneLabel}</span>}</div>
      <span className="rev-pct">{Math.round(pct * 100)}%</span>
      <div className="rev-bar" role="img" aria-label={`完成 ${Math.round(pct * 100)}%`}>
        <i style={{ width: `${Math.min(pct, 1) * 100}%` }} />
        {timePct != null && <b style={{ left: `${timePct * 100}%` }} title={`时间进度 ${Math.round(timePct * 100)}%`} />}
      </div>
      <div className="rev-nums tnum"><span className="rev-cur">当前 {fmt(item.current)}</span><span className="rev-sep" />目标 {fmt(item.target)}</div>
    </div>
  );
}

// 交付月：剩余天数 + 6 个环节。方案录入用真实数据，其余环节等 v3 接口（未实现时显示示例）。
function DeliveryCard({ month, plans }) {
  const state = useApi(`/api/v3/months/${month}`, SAMPLE_MONTH);
  const left = daysToDeadline(month);
  const lines = plans.data ? LINES.filter((l) => plans.data.some((p) => p.month === month && p.line === l)) : [];
  const steps = (state.data?.steps || SAMPLE_MONTH.steps).map((s) => s.key !== "plans" ? s : {
    ...s, state: lines.length === 3 ? "done" : lines.length ? "part" : "todo",
    meta: plans.data ? `${lines.length}/3 条业务线${lines.length < 3 ? ` · 待录 ${LINES.filter((l) => !lines.includes(l)).join("、")}` : ""}` : "读取中",
  });
  const done = steps.filter((s) => s.state === "done").length;
  const campaign = state.data?.campaign;
  return (
    <section className="card delivery col-8">
      <div className="delivery-main">
        <span className="label">交付月 · {month}{state.isSample && <SampleBadge task={state.task} />}</span>
        <div className="delivery-days"><FlipNumber value={left} /><small>天</small></div>
        <p className="small muted">{deadlineLabel(month)} 截止 · 已完成 {done}/{steps.length}</p>
        <div className="delivery-pips" aria-hidden="true">{steps.map((s) => <i key={s.key} className={`is-${s.state}`} />)}</div>
        {campaign && <a className="delivery-campaign" href="#/marketing/campaign"><PixelIcon name="bolt" />{campaign.name}<span className="mono small">{campaign.start.slice(5)} → {campaign.end.slice(5)}</span></a>}
      </div>
      <ul className="delivery-steps">
        {steps.map((s) => (
          <li key={s.key}>
            <a href={s.href} data-dither="">
              <StatusMark state={s.state} />
              <span className="delivery-step-name">{s.label}</span>
              <span className="delivery-step-meta">{s.meta}</span>
              <PixelIcon name="right" className="muted" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TodoCard() {
  const state = useApi("/api/v3/home/todo", SAMPLE_TODO);
  return (
    <Card className="col-4" title={<><PixelIcon name="alert" /> 待我处理</>} extra={state.isSample ? <SampleBadge task={state.task} /> : null}>
      <Loadable state={state}>
        {(items) => !items.length ? <p className="muted">没有待处理的事</p> : (
          <ul className="list todo-list">
            {items.map((t, i) => (
              <li key={i}>
                <span className={`todo-kind${t.urgent ? " is-urgent" : ""}`}>{t.kind}</span>
                <a href={t.href} className="todo-text">{t.text}</a>
                {t.due && <span className={`tnum small${t.urgent ? " signal" : " muted"}`}>{t.due}</span>}
              </li>
            ))}
          </ul>
        )}
      </Loadable>
    </Card>
  );
}

// 「当前或下一条」日程标橙：结束时间晚于现在的第一条。
function TodayCard({ now }) {
  const state = useApi("/api/calendar/today");
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    <Card className="col-4" title={<><PixelIcon name="calendar" /> 今日日程</>} extra={<a className="link" href="https://www.feishu.cn/calendar/" target="_blank" rel="noreferrer">飞书</a>}>
      <Loadable state={state}>
        {(events) => {
          if (!events.length) return <p className="muted">今天没有日程</p>;
          const end = (e) => { const t = [...e.time.matchAll(/(\d{1,2}):(\d{2})/g)].at(-1); return t ? Number(t[1]) * 60 + Number(t[2]) : -1; };
          const next = events.findIndex((e) => end(e) > minutes);
          return (
            <ul className="list calendar-list today-list">
              {events.map((e, i) => (
                <li key={i} className={i === next ? "is-now" : i < next || next < 0 ? "is-past" : undefined}>
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

function AgentsCard() {
  const state = useApi("/api/assistants");
  return (
    <Card className="col-4" title={<><PixelIcon name="agent" /> Agent</>} extra={<a className="link" href={href("assistants")}>全部</a>}>
      <Loadable state={state}>
        {(list) => (
          <ul className="list agent-list">
            {list.map((a) => (
              <li key={a.id}>
                <BitAvatar seed={a.name} />
                <a href={href("assistants", String(a.id))}>{a.name}</a>
                <span className="agent-model">{a.model ? a.model : "默认"}</span>
              </li>
            ))}
          </ul>
        )}
      </Loadable>
    </Card>
  );
}

// 用户之声：词云 + 今日摘要，点进 Voice 页看详情。
function VoiceCard() {
  const state = useApi("/api/v3/voice", SAMPLE_VOICE);
  return (
    <Card className="col-8" title={<><PixelIcon name="voice" /> 用户之声</>}
      extra={<>{state.isSample && <SampleBadge task={state.task} />}<a className="link" href={href("voice")}>Voice</a></>}>
      <Loadable state={state}>
        {(v) => {
          return (
            <div className="voice-cloud-wrap">
              <VoiceCloud cloud={v.cloud} />
              <span className="small muted">近 48 小时 · {v.stats.participants} 个独立来源 · {v.stats.topics} 个话题上榜</span>
              {v.daily && <p className="voice-daily small"><strong>今日摘要</strong>{v.daily}</p>}
            </div>
          );
        }}
      </Loadable>
    </Card>
  );
}
