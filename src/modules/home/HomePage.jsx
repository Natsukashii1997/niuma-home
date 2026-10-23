import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Card, Loadable, Placeholder, SampleBadge, StatusMark } from "../../ui/components.jsx";
import { AgentFace, FlipNumber, PixelIcon } from "../../ui/bitmap.jsx";
import { deliveryMonth, deliverySteps, daysToDeadline, shortMonth } from "../../constants.js";
import { CodexCard } from "./CodexStrip.jsx";
import { VoiceCloud, voiceIssue } from "../voice/VoicePage.jsx";
import { PRESETS } from "../assistants/presets.js";
import { voiceSample } from "../../samples.js";

// 首页（v3）：Codex 重置 + 待我处理 → 交付月 + 今日日程 → 用户之声 + Agent。业务营收完成度在「业务」页。
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
        <a className="btn btn-primary" href={href("marketing", "plans", month)}><PixelIcon name="grid" /> {shortMonth(month)}促销</a>
      </header>
      <div className="home-grid">
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

// 交付月：剩余天数 + 5 个环节（见 deliverySteps：方案录入由前端用真实的 /api/plans 计算）。
// 环节接口读取失败时写明失败，不显示「0/x」这种看起来像真实进度的数字。
function DeliveryCard({ month, plans }) {
  const state = useApi(`/api/v3/months/${month}`);
  const left = daysToDeadline(month);
  const steps = state.data ? deliverySteps(state.data.steps, plans.data, month) : [];
  const done = steps.filter((s) => s.state === "done").length;
  const campaign = state.data?.campaign;
  return (
    <section className="card delivery col-8" data-dither="">
      <div className="delivery-main">
        <span className="label">交付月 · {month}{state.isSample && <SampleBadge task={state.task} />}</span>
        <div className="delivery-days"><FlipNumber value={left} /><small>天</small></div>
        <p className="small muted">{deadlineLabel(month)} 截止 · {state.data ? `已完成 ${done}/${steps.length}` : state.error ? "环节状态读取失败" : "读取中"}</p>
        <div className="delivery-pips" aria-hidden="true">{steps.map((s) => <i key={s.key} className={`is-${s.state}`} />)}</div>
        {campaign && <a className="delivery-campaign" href="#/projects/campaign"><PixelIcon name="bolt" />{campaign.name}<span className="mono small">{campaign.start.slice(5)} → {campaign.end.slice(5)}</span></a>}
      </div>
      {!state.data ? <div className="delivery-steps is-state"><Loadable state={state} name="交付月环节">{() => null}</Loadable></div> : <ul className="delivery-steps">
        {steps.map((s) => (
          <li key={s.key}>
            <a href={s.href} data-dither="">
              <StatusMark state={s.state} />
              <span className="delivery-step-name">{s.label}</span>
              <span className="delivery-step-meta" title={s.note}>{s.meta}</span>
              <PixelIcon name="right" className="muted" />
            </a>
          </li>
        ))}
      </ul>}
    </section>
  );
}

// 待我处理的类型色：门禁待审是「待你处理」（琥珀），价格破底线是「风险」（红）。
const TODO_TONE = { 审核: "warn", 价格: "risk" };
// 到期日：接口给完整的 YYYY-MM-DD 时按完整日期算；只给 MM-DD 时按今年算。
const daysUntil = (due) => { const t = new Date(); const m = /^(?:(\d{4})-)?(\d{2})-(\d{2})$/.exec(due || ""); if (!m) return null; return Math.round((new Date(m[1] ? Number(m[1]) : t.getFullYear(), Number(m[2]) - 1, Number(m[3])) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000); };

function TodoCard() {
  const state = useApi("/api/v3/home/todo");
  return (
    <Card className="col-4 todo-card" dither title={<><PixelIcon name="alert" /> 待我处理</>} extra={state.isSample ? <SampleBadge task={state.task} /> : null}>
      <Loadable state={state} name="待我处理">
        {(items) => !items.length ? <p className="muted">没有待处理的事</p> : <TodoList items={items} />}
      </Loadable>
    </Card>
  );
}

// 卡片高度跟着同一行（不被待办撑长，用户 2026-10-19）：放得下几条显示几条，其余按去处汇总成「还有 N 项」链接，点了跳到对应页面。
// 先全部渲染量一次能放几条，再截断；卡片尺寸变了重新量。
function TodoList({ items }) {
  const box = useRef(null);
  const [fit, setFit] = useState(null);
  useEffect(() => {
    const ro = new ResizeObserver(() => setFit(null));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  useLayoutEffect(() => { setFit(null); }, [items]);
  useLayoutEffect(() => {
    if (fit !== null) return;
    const el = box.current, lis = [...el.querySelectorAll(".todo-list > li")];
    const bottom = (n) => (n ? lis[n - 1].offsetTop + lis[n - 1].offsetHeight : 0);
    if (bottom(lis.length) <= el.clientHeight) { setFit(lis.length); return; }
    let n = lis.length;
    while (n > 0 && bottom(n) > el.clientHeight - TODO_MORE_H) n--;
    setFit(n);
  }, [fit, items]);
  const shown = fit === null ? items : items.slice(0, fit);
  const rest = items.slice(shown.length);
  const groups = [...rest.reduce((m, t) => m.set(t.href, { kind: t.kind, href: t.href, n: (m.get(t.href)?.n || 0) + 1 }), new Map()).values()];
  return (
    <div className="todo-box" ref={box}>
      <ul className="list todo-list">
        {shown.map((t, i) => (
          <li key={i}>
            <span className={`todo-kind${t.urgent ? ` is-${TODO_TONE[t.kind] || "warn"}` : ""}`}>{t.kind}</span>
            <a href={t.href} className="todo-text">{t.text}</a>
            {t.due && <span className={`tnum small ${daysUntil(t.due) !== null && daysUntil(t.due) <= 0 ? "risk-text" : t.urgent ? "warn-text" : "muted"}`}>{t.due}</span>}
          </li>
        ))}
      </ul>
      {rest.length > 0 && (
        <div className="todo-more">
          <span className="muted">还有 <span className="tnum">{rest.length}</span> 项</span>
          {groups.map((g) => <a key={g.href} href={g.href} className="link">{g.kind} <span className="tnum">{g.n}</span><PixelIcon name="right" /></a>)}
        </div>
      )}
    </div>
  );
}
const TODO_MORE_H = 40;

// 「当前或下一条」日程标橙：结束时间晚于现在的第一条。
function TodayCard({ now }) {
  const state = useApi("/api/calendar/today");
  const minutes = now.getHours() * 60 + now.getMinutes();
  return (
    <Card className="col-4" dither title={<><PixelIcon name="calendar" /> 今日日程</>} extra={<a className="link" href="https://www.feishu.cn/calendar/" target="_blank" rel="noreferrer">飞书<PixelIcon name="external" /></a>}>
      <Loadable state={state} name="今日日程">
        {(events) => {
          if (!events.length) return <Placeholder icon="calendar" title="今天没有日程">飞书日历里今天没有安排。</Placeholder>;
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

// Agent：四个预设助手排成一行（点卡片进对话）；常用开场只在 Agent 页显示，首页不重复（用户 2026-10-18 确认）。
// 自建和导入的助手排在卡片下方的列表里。
function AgentsCard() {
  const state = useApi("/api/assistants");
  return (
    <Card className="col-4" dither title={<><PixelIcon name="agent" /> Agent</>} extra={<a className="link" href={href("assistants")}>全部<PixelIcon name="right" /></a>}>
      <Loadable state={state} name="Agent 列表">
        {(list) => {
          const presets = list.filter((a) => PRESETS[a.preset]), others = list.filter((a) => !PRESETS[a.preset]);
          return (
            <div className="agent-card">
              <div className="agent-tiles">
                {presets.map((a) => (
                  <a key={a.id} href={href("assistants", String(a.id))} data-dither="" className="agent-tile" title={`${a.name}：${PRESETS[a.preset].role}`}>
                    <AgentFace preset={a.preset} seed={a.name} size={40} />
                    <strong>{a.name}</strong>
                    <small>{PRESETS[a.preset].role}</small>
                  </a>
                ))}
              </div>
              {others.length > 0 && <ul className="list agent-list">
                {others.map((a) => <li key={a.id}><AgentFace seed={a.name} /><a href={href("assistants", String(a.id))}>{a.name}</a><span className="agent-model">{a.model || "默认"}</span></li>)}
              </ul>}
            </div>
          );
        }}
      </Loadable>
    </Card>
  );
}

// 留学之声卡片正文；来源没接通时用模拟数据并标出来（用户 2026-10-23）。
function VoiceCardBody({ v, sample = false }) {
  return (
    <div className="voice-cloud-wrap">
      <VoiceCloud cloud={v.cloud} />
      <span className="small muted">{sample && <SampleBadge task="演示 · Voice 模拟数据" />} 近 48 小时 · {v.stats.participants} 个独立来源 · {v.stats.topics} 个话题上榜{sample && " · 模拟数据"}</span>
      {v.daily && <p className="voice-daily small"><strong>今日摘要</strong>{v.daily}</p>}
    </div>
  );
}

// 留学之声：词云 + 今日摘要，点进 Voice 页看详情。
function VoiceCard() {
  const state = useApi("/api/v3/voice");
  const issue = voiceIssue(state);
  return (
    <Card className="col-8" dither title={<><PixelIcon name="voice" /> 留学之声</>}
      extra={<a className="link" href={href("voice")}>Voice<PixelIcon name="right" /></a>}>
      {issue?.kind === "unavailable" ? <VoiceCardBody v={voiceSample()} sample />
        : issue ? <Placeholder icon={issue.kind === "empty" ? "voice" : "alert"} title={issue.title}>{issue.text}</Placeholder> : <Loadable state={state} name="留学之声">
        {(v) => {
          if (!v.hot?.length) return <Placeholder icon="voice" title="现在没有合格的话题">{v.note || "还没有达到 5 个独立来源的话题。"}</Placeholder>;
          return <VoiceCardBody v={v} />;
        }}
      </Loadable>}
    </Card>
  );
}
