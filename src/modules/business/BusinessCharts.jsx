import { useCallback, useEffect, useState } from "react";
import { apiRead } from "../../api.js";
import { Button, Card, Loadable, Placeholder, Tag } from "../../ui/components.jsx";
import "./business-charts.css";

const COLORS = ["var(--info)", "var(--text)", "var(--ok)", "var(--warn)", "var(--risk)", "var(--muted)"];
const color = i => COLORS[i % COLORS.length];
const exact = (value, unit) => value == null ? "无数据" : unit === "percent" ? `${(value * 100).toFixed(2)}%` : `${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`;
const short = (value, unit) => unit === "percent" ? `${(value * 100).toFixed(0)}%` : `${(value / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 1 })}`;

// 显式刷新直达飞书；后台刷新期间保留旧图，刷新完成后自动回读页面。
function useCharts() {
  const [state, setState] = useState({ loading: true });
  const [request, setRequest] = useState({ tick: 0, refresh: false });
  const reload = useCallback(() => setRequest(r => ({ tick: r.tick + 1, refresh: true })), []);
  useEffect(() => {
    let active = true, timer;
    setState(s => ({ ...s, loading: !s.data, busy: true, error: undefined }));
    async function read(force) {
      try {
        const data = await apiRead(`/api/v3/business/charts${force ? "?refresh=1" : ""}`);
        if (!active) return;
        setState({ data, busy: data.refreshing });
        if (data.refreshing) timer = setTimeout(() => read(false), 2000);
      } catch (error) {
        if (active) setState(s => ({ ...s, loading: false, busy: false, error: error.message }));
      }
    }
    read(request.refresh);
    return () => { active = false; clearTimeout(timer); };
  }, [request]);
  return { ...state, reload };
}

export function BusinessCharts() {
  const state = useCharts(), data = state.data;
  const lines = data?.charts.filter(c => c.type === "line") || [];
  const pies = data?.charts.filter(c => c.type === "pie") || [];
  return <section className="business-charts" aria-label="飞书业务图表">
    <div className="section-head bc-section-head">
      <h2>营收与转化趋势</h2>
      <div className="bc-actions">
        {data && <span className="small muted">{data.charts.length} 张图 · 更新 {data.updatedAt}</span>}
        <Button onClick={state.reload} disabled={state.busy}>{state.busy ? "读取中…" : "重新读取图表"}</Button>
        {data && <a className="small" href={data.source} target="_blank" rel="noreferrer">在飞书查看 ↗</a>}
      </div>
    </div>
    {data && (state.error || data.sourceError || data.stale) && <p className="warn" role="status">{state.error || data.sourceError ? `更新未完成：${state.error || data.sourceError}。` : "正在更新图表。"} 当前显示 {data.updatedAt} 的上次完整结果。</p>}
    {!data ? <Loadable state={state} name="业务图表">{() => null}</Loadable> : <>
      <div className="bc-lines">
        {lines.map((chart, i) => <ChartCard key={chart.id} chart={chart}><LineChart chart={chart} wide={i === 0} /></ChartCard>)}
      </div>
      <div className="section-head"><h2>当月营收分布</h2><Tag>{data.period}</Tag></div>
      <p className="small muted bc-scope-note">按原图的实收金额、业务分组和本月收款日期筛选；与上方营收进度的汇总来源不同。</p>
      <div className="bc-pies">
        {pies.map(chart => <ChartCard key={chart.id} chart={chart}><PieChart chart={chart} /></ChartCard>)}
      </div>
    </>}
  </section>;
}

function ChartCard({ chart, children }) {
  return <Card className={`bc-chart bc-${chart.type}`} title={chart.name} extra={<span className="label">{chart.unit === "percent" ? "%" : chart.type === "line" ? "万元" : "元"}</span>}>
    {children}
    <details className="bc-source"><summary>数据口径与完整数值</summary>
      <p className="small muted">来源：{chart.sourceTable} · {chart.dimension} · {chart.measure.field}（{({ sum: "求和", max: "最大值", avg: "平均值", min: "最小值" })[chart.measure.aggregation] || chart.measure.aggregation}）</p>
      {chart.filter ? <p className="small muted">筛选：{(chart.filter.conditions || []).map(f => `${f.field_name}${({ is: " = ", contains: "包含" })[f.operator] || ` ${f.operator} `}${(Array.isArray(f.value) ? f.value : [f.value]).map(v => v === "CurrentMonth" ? "本月" : String(v)).join("、")}`).join(chart.filter.conjunction === "or" ? "；或 " : "；且 ")}</p> : <p className="small muted">筛选：沿用原图全部数据</p>}
      <div className="bc-table-scroll"><table className="bc-data"><caption>{chart.name}的完整数值</caption>
        {chart.type === "line" ? <><thead><tr><th>{chart.dimension}</th>{chart.series.map(s => <th key={s.name}>{s.name}</th>)}</tr></thead><tbody>{chart.categories.map((x, i) => <tr key={x}><td>{x}</td>{chart.series.map(s => <td className="tnum" key={s.name}>{exact(s.values[i], chart.unit)}</td>)}</tr>)}</tbody></> : <><thead><tr><th>{chart.dimension}</th><th>实收金额</th><th>占比</th></tr></thead><tbody>{chart.items.map((item, i) => <tr key={i}><td>{item.label}</td><td className="tnum">{exact(item.value, chart.unit)}</td><td className="tnum">{chart.pieAvailable ? `${(item.value / chart.total * 100).toFixed(2)}%` : "—"}</td></tr>)}</tbody></>}
      </table></div>
    </details>
  </Card>;
}

function LineChart({ chart, wide }) {
  const [hover, setHover] = useState(null);
  const hoveredValue = hover ? chart.series.find(s => s.name === hover.series)?.values[chart.categories.indexOf(hover.x)] : null;
  const values = chart.series.flatMap(s => s.values).filter(v => v != null);
  if (!values.length) return <Placeholder icon="trend" title="原图暂无可绘制数据" />;
  const width = wide ? 1000 : 480, height = 250, left = 56, right = 16, top = 16, bottom = 32;
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const range = max - min || 1;
  const x = i => left + (width - left - right) * (chart.categories.length === 1 ? 0.5 : i / (chart.categories.length - 1));
  const y = value => top + (height - top - bottom) * (1 - (value - min) / range);
  return <>
    <div className="bc-legend">{chart.series.map((s, i) => <span key={s.name}><i style={{ background: color(i) }} />{s.name}</span>)}<span className="muted">缺失月份不补零</span></div>
    <svg className="bc-line-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${chart.name}，横轴${chart.dimension}，${chart.unit === "percent" ? "百分比" : "单位万元"}；完整数值在下方展开查看`}>
      {[0, 1, 2, 3, 4].map(n => { const v = min + range * n / 4; return <g key={n}><line x1={left} x2={width - right} y1={y(v)} y2={y(v)} className="bc-grid" /><text x={left - 8} y={y(v) + 4} textAnchor="end">{short(v, chart.unit)}</text></g>; })}
      {chart.categories.map((c, i) => <text key={c} x={x(i)} y={height - 8} textAnchor="middle">{c}{chart.dimension === "月份" ? "月" : ""}</text>)}
      {chart.series.map((s, si) => {
        const path = s.values.map((v, i) => v == null ? "" : `${i === 0 || s.values[i - 1] == null ? "M" : "L"}${x(i)},${y(v)}`).join(" ");
        return <g key={s.name} style={{ color: color(si) }}>
          <path d={path} fill="none" stroke="currentColor" strokeWidth="2" />
          {s.values.map((v, i) => v == null ? null : <rect key={i} x={x(i) - 4} y={y(v) - 4} width="8" height="8" fill="currentColor" tabIndex="0" role="img" aria-label={`${s.name} · ${chart.categories[i]}月 · ${exact(v, chart.unit)}`} onMouseEnter={() => setHover({ series: s.name, x: chart.categories[i] })} onFocus={() => setHover({ series: s.name, x: chart.categories[i] })}><title>{s.name} · {chart.categories[i]} · {exact(v, chart.unit)}</title></rect>)}
        </g>;
      })}
    </svg>
    <div className="bc-readout small" aria-live="polite">{hover && hoveredValue != null ? <><b>{hover.series} · {hover.x}{chart.dimension === "月份" ? "月" : ""}</b><span className="tnum">{exact(hoveredValue, chart.unit)}</span></> : <span className="muted">指向数据点查看数值，也可展开下方明细。</span>}</div>
  </>;
}

function PieChart({ chart }) {
  const [active, setActive] = useState(null);
  const items = [...chart.items].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const shown = items.find(item => item.label === active);
  let angle = -Math.PI / 2;
  const cx = 100, cy = 100, radius = 90;
  const slices = items.map((item, i) => {
    if (!chart.pieAvailable || !item.value) return null;
    const start = angle, span = item.value / chart.total * Math.PI * 2;
    angle += span;
    const props = { fill: color(i), onMouseEnter: () => setActive(item.label), onFocus: () => setActive(item.label), tabIndex: 0, role: "img", "aria-label": `${item.label} ${exact(item.value, chart.unit)} 占 ${(item.value / chart.total * 100).toFixed(2)}%` };
    const title = <title>{props["aria-label"]}</title>;
    if (span >= Math.PI * 2 - 1e-10) return <circle key={i} cx={cx} cy={cy} r={radius} {...props}>{title}</circle>;
    const d = `M${cx},${cy} L${cx + radius * Math.cos(start)},${cy + radius * Math.sin(start)} A${radius},${radius} 0 ${span > Math.PI ? 1 : 0},1 ${cx + radius * Math.cos(angle)},${cy + radius * Math.sin(angle)} Z`;
    return <path key={i} d={d} {...props}>{title}</path>;
  });
  return <>
    <div className="bc-pie-summary"><span className="small muted">实收合计</span><b className="tnum">{chart.total == null ? "数据不完整" : exact(chart.total, chart.unit)}</b></div>
    {chart.items.length === 1 && chart.items[0].label === "未填写" && <p className="small warn">源表尚未填写分类，当前全部计入「未填写」。</p>}
    {chart.pieAvailable ? <svg className="bc-pie-svg" viewBox="0 0 200 200" role="img" aria-label={`${chart.name}，${chart.items.length}个分类；全部分类与金额见下方列表`}>{slices}</svg> : <div className="bc-pie-empty small muted">{chart.items.some(i => i.value === null || i.value < 0) ? "含缺失或负值，不绘制占比；请查看完整数值。" : "原图暂无非零数据"}</div>}
    <div className="bc-readout bc-pie-readout small" aria-live="polite">{shown ? <><b>{shown.label}</b><span className="tnum">{exact(shown.value, chart.unit)}{chart.pieAvailable && ` · ${(shown.value / chart.total * 100).toFixed(2)}%`}</span></> : <span className="muted">按金额降序 · 共 {chart.items.length} 项 · 指向查看数值</span>}</div>
    <div className="bc-pie-legend" aria-label={`${chart.name}全部分类`}>
      {items.map((item, i) => <button type="button" key={item.label} className={item.label === active ? "active" : ""} onMouseEnter={() => setActive(item.label)} onFocus={() => setActive(item.label)} onClick={() => setActive(item.label)}>
        <i style={{ background: color(i) }} /><span>{item.label}</span><span className="tnum">{item.value == null ? "—" : item.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}<small>{chart.pieAvailable ? `${(item.value / chart.total * 100).toFixed(2)}%` : "—"}</small></span>
      </button>)}
    </div>
  </>;
}
