import { useApi } from "../../api.js";
import { Card, Loadable, PageHeader, Placeholder, SampleBadge, Tag } from "../../ui/components.jsx";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { LINES } from "../../constants.js";

// 业务线名称统一用全称（与月度促销一致），不用接口返回的简称。
const LINE_NAME = { uni: LINES[0], intl: LINES[1], appeal: LINES[2] };

const METRICS = ["本月", "年度累计", "同比", "环比"];

// 业务：上面是业务营收完成度（v3，从首页挪来，数据来自飞书多维表格）；下面三条业务线的指标卡仍是占位。
export default function BusinessPage() {
  return (
    <>
      <PageHeader title="业务" subtitle="营收完成度，以及三条业务线的月度、年度数据与同环比" />
      <RevenueCard />
      <div className="section-head"><h2>业务线指标</h2><Tag tone="amber">待建设</Tag></div>
      <Placeholder icon="business" title="业务线指标待建设">
        {LINES.join("、")}各看{METRICS.join(" / ")}；等飞书表格的字段确定后接入。
      </Placeholder>
    </>
  );
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
// 卡里写万元、保留 1 位小数，悬停看精确值（二次评审 P2-12）
const wan = (n) => `${(n / 10000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 万`;

// 业务营收完成度：总计一行、业务线一行。竖线是时间进度；完成度不低于时间进度为绿，落后 15 个百分点以内为琥珀，再落后为红。
function RevenueCard() {
  const state = useApi("/api/v3/business/revenue");
  const r = state.data;
  return (
    <Card className="revenue" title={<><PixelIcon name="trend" /> 业务营收完成度</>}
      extra={<>{state.isSample && <SampleBadge task={state.task} />}{r && <span className="small muted">{r.period}{r.timePct != null && ` · 时间进度 ${Math.round(r.timePct * 100)}%（竖线）`} · 更新 {r.updatedAt}</span>}</>}>
      <Loadable state={state} name="营收完成度">
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
      <div className="rev-head"><span className="rev-name">{LINE_NAME[item.key] || item.name}</span>{toneLabel && <span className="rev-tone">{toneLabel}</span>}</div>
      <span className="rev-pct">{Math.round(pct * 100)}%</span>
      <div className="rev-bar" role="img" aria-label={`完成 ${Math.round(pct * 100)}%`}>
        <i style={{ width: `${Math.min(pct, 1) * 100}%` }} />
        {timePct != null && <b style={{ left: `${timePct * 100}%` }} title={`时间进度 ${Math.round(timePct * 100)}%`} />}
      </div>
      <div className="rev-nums tnum" title={`当前 ${fmt(item.current)} · 目标 ${fmt(item.target)}`}><span className="rev-cur">当前 {wan(item.current)}</span><span className="rev-sep" />目标 {wan(item.target)}</div>
    </div>
  );
}

