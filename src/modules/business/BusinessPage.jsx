import { useApi } from "../../api.js";
import { Card, Loadable, PageHeader, SampleStrip } from "../../ui/components.jsx";
import { BusinessCharts } from "./BusinessCharts.jsx";
import { PixelBar, PixelIcon } from "../../ui/bitmap.jsx";
import { LINES } from "../../constants.js";

// 业务线名称统一用全称（与月度促销一致），不用接口返回的简称。
const LINE_NAME = { uni: LINES[0], intl: LINES[1], appeal: LINES[2] };

// 指标与图表分别读取，图表故障不会影响上方营收卡。
export default function BusinessPage() {
  return (
    <>
      <PageHeader title="业务" subtitle="营收完成度、月度趋势与当月营收分布 · 来源：飞书「当月策略盘」" />
      <RevenueCard />
      <BusinessCharts />
    </>
  );
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");
// 卡里写万元、保留 1 位小数，悬停看精确值（二次评审 P2-12）
const wan = (n) => `${(n / 10000).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 万`;

// 业务营收完成度：总进度一组、业务线一组。竖线是时间进度；完成度不低于时间进度为绿，落后 15 个百分点以内为琥珀，再落后为红（颜色只上状态标签）。
function RevenueCard() {
  const state = useApi("/api/v3/business/revenue");
  const r = state.data;
  return (
    <Card className={`revenue${state.isSample ? " is-sample" : ""}`} title={<><PixelIcon name="trend" /> 业务营收完成度</>}
      extra={<>{r && <span className="small muted">{r.period}{r.timePct != null && ` · 时间进度 ${Math.round(r.timePct * 100)}%（竖线）`} · 更新 {r.updatedAt}</span>}</>}>
      {state.isSample && <SampleStrip task={state.task} />}
      <Loadable state={state} name="营收完成度">
        {(data) => (
          <div className="rev-groups">
            {data.groups.map((g) => (
              <div key={g.label} className={`rev-row cols-${g.items.length}`}>
                <span className="rev-group">{g.label}</span>
                {g.items.map((it) => it.rate != null ? <RateItem key={it.key} item={it} /> : <RevenueItem key={it.key} item={it} timePct={data.timePct} />)}
              </div>
            ))}
          </div>
        )}
      </Loadable>
    </Card>
  );
}

// 总转化率（用户 2026-10-18）：只有当前和上月两个数，没有目标，所以不画进度条、不上状态标签。
const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
function RateItem({ item }) {
  return (
    <div className={`rev-item rev-rate line-${item.key}`}>
      <div className="rev-head"><span className="rev-name">{item.name}</span></div>
      <span className="rev-pct">{pct1(item.rate)}</span>
      <div className="rev-nums tnum">上月 {item.lastMonthRate != null ? <b className="rev-last">{pct1(item.lastMonthRate)}</b> : "—"}</div>
    </div>
  );
}

function RevenueItem({ item, timePct }) {
  const pct = item.target ? item.current / item.target : 0;
  const tone = timePct == null ? "neutral" : pct >= timePct ? "ok" : pct >= timePct - 0.15 ? "warn" : "risk";
  const toneLabel = { ok: "跟上进度", warn: "略落后", risk: "落后", neutral: "" }[tone];
  return (
    <div className={`rev-item is-${tone} line-${item.key}`}>
      <div className="rev-head"><span className="rev-name">{LINE_NAME[item.key] || item.name}</span>{toneLabel && <span className="rev-tone">{toneLabel}</span>}</div>
      <span className="rev-pct">{Math.round(pct * 100)}%</span>
      <PixelBar className="rev-bar" value={pct} marker={timePct} label={`完成 ${Math.round(pct * 100)}%${timePct != null ? `，时间进度 ${Math.round(timePct * 100)}%` : ""}`} />
      <div className="rev-nums tnum" title={`当前 ${fmt(item.current)} · 目标 ${fmt(item.target)}`}><span className="rev-cur">当前 {wan(item.current)}</span><span className="rev-sep" />目标 {wan(item.target)}</div>
    </div>
  );
}
