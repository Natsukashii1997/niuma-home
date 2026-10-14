import { CalendarDays, FileText, Megaphone, Bot } from "lucide-react";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Card, Loadable, PageHeader, SampleBadge, Tag } from "../../ui/components.jsx";
import { LINES, currentMonth, monthLabel } from "../../constants.js";
import { sampleCalendar } from "../../samples.js";

export default function HomePage() {
  const today = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  return (
    <>
      <PageHeader title="首页" subtitle={today} />
      <div className="grid-2">
        <TodayCard />
        <ReportCard />
        <PlanStatusCard />
        <AssistantCard />
      </div>
    </>
  );
}

function TodayCard() {
  const state = useApi("/api/calendar/today", sampleCalendar);
  return (
    <Card title={<><CalendarDays size={16} /> 今日日程</>} extra={state.isSample && <SampleBadge task={state.task} />}>
      <Loadable state={state}>
        {(events) =>
          events.length ? (
            <ul className="list">
              {events.map((e) => (
                <li key={e.time + e.title}>
                  <span className="list-time">{e.time}</span>
                  <span>{e.title}</span>
                  {e.place && <span className="muted small">{e.place}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">今天没有日程</p>
          )
        }
      </Loadable>
    </Card>
  );
}

function ReportCard() {
  const state = useApi("/api/reports");
  return (
    <Card
      title={<><FileText size={16} /> 最新日报</>}
      extra={<a className="link" href={href("reports")}>全部</a>}
    >
      <Loadable state={state}>
        {(reports) => {
          const latest = reports.find((r) => r.kind === "日报");
          return latest ? (
            <>
              <p className="muted small"><a className="link" href={href("reports", latest.id)}>{latest.title}</a></p>
              <p className="pre clamp">{latest.body}</p>
            </>
          ) : (
            <p className="muted">还没有日报</p>
          );
        }}
      </Loadable>
    </Card>
  );
}

// 本月三条业务线的方案是否已录入（真实数据）
function PlanStatusCard() {
  const month = currentMonth();
  const plans = useApi("/api/plans");
  const promos = useApi("/api/promos");
  return (
    <Card title={<><Megaphone size={16} /> {monthLabel(month)}方案</>} extra={<a className="link" href={href("marketing", "plans")}>去录入</a>}>
      <Loadable state={plans}>
        {(planRows) => (
          <Loadable state={promos}>
            {(promoRows) => (
              <ul className="list">
                {LINES.map((line) => {
                  const hasPlan = planRows.some((p) => p.month === month && p.line === line);
                  const count = promoRows.filter((p) => p.month === month && p.line === line).length;
                  return (
                    <li key={line}>
                      <a href={href("marketing", "plans", month, line)}>{line}</a>
                      {hasPlan ? <Tag tone="green">已录入原文</Tag> : count ? <Tag tone="blue">有数据 · 无原文</Tag> : <Tag tone="orange">未录入</Tag>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Loadable>
        )}
      </Loadable>
    </Card>
  );
}

function AssistantCard() {
  const state = useApi("/api/assistants");
  return (
    <Card title={<><Bot size={16} /> 助手</>} extra={<a className="link" href={href("assistants")}>全部</a>}>
      <Loadable state={state}>
        {(list) => (
          <div className="tag-row">
            {list.map((a) => (
              <a key={a.id} className="chip" href={href("assistants", String(a.id))}>
                {a.name}
              </a>
            ))}
          </div>
        )}
      </Loadable>
    </Card>
  );
}
