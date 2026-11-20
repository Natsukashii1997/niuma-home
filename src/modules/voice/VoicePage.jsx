import { useLayoutEffect, useRef, useState } from "react";
import { DotMatrix, PixelIcon, TypeText } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Card, Loadable, PageHeader, Placeholder, SampleBadge, StatStrip, Tag } from "../../ui/components.jsx";
import { labelLayout, slotHeight } from "./label-layout.js";
import { voiceSample } from "../../samples.js";
import { placeLabels } from "../../ui/chart-labels.js";
import { ChartTip, ChartTipRow, useChartHover } from "../../ui/chart-hover.jsx";

// Voice · 留学之声（v3，侧栏独立模块）：留学生最近在讨论什么。基于本机运行的 AIHOT 引擎，免费英文信源；
// 只看多数人的共性——同一人 / 同一矩阵只算一个来源，独立来源 ≥ 5 才上榜。
// 接口用 503 + 错误码区分三种情况，页面分开写，不能混成一种：
//   来源不可用（未配置、读取失败、记录过期、证据不完整）→ 接口返回 200 + unavailable（2026-10-23 起，不再用 503），热榜没有接通，改用模拟数据展示并醒目标「模拟数据」；
//   真实读取后没有合格话题 → 合法的空榜（接口 200、hot 为空、note 写原因）；
//   其他读取失败 → 可以重新读取。
// 日期和趋势只用接口给的真实值（sparkDates、spark），不补造固定的七天。
const TREND = { surge: ["急升", "is-surge"], rising: ["上升", "is-up"], up: ["上升", "is-up"], flat: ["平稳", ""], down: ["回落", "is-down"] };
const COUNTRY = ["澳洲", "新西兰", "英国", "美国", "加拿大", "香港", "新加坡", "马来西亚"];

export function voiceIssue(state) {
  if (state.data?.unavailable) return { kind: "unavailable", title: "学生讨论来源不可用，热榜没有接通", text: state.data.error };
  if (!state.error) return null;
  if (state.code === "VOICE_NO_QUALIFIED_TOPICS") return { kind: "empty", title: "现在没有合格的话题", text: state.error };
  if (/^VOICE_/.test(state.code || "")) return { kind: "unavailable", title: "学生讨论来源不可用，热榜没有接通", text: state.error };
  return { kind: "error", title: "留学之声读取失败", text: state.error };
}

function VoiceIssue({ issue, reload }) {
  return (
    <Placeholder className="is-page" icon={issue.kind === "empty" ? "voice" : "alert"} title={issue.title}
      action={issue.kind !== "unavailable" && reload ? <Button onClick={reload}><PixelIcon name="refresh" />重新读取</Button> : null}>
      <span className={issue.kind === "unavailable" ? "warn-text" : issue.kind === "error" ? "risk-text" : ""}>{issue.text}</span>
    </Placeholder>
  );
}

export default function VoicePage() {
  const state = useApi("/api/v3/voice");
  const issue = voiceIssue(state);
  return (
    <>
      <PageHeader title="Voice" subtitle="留学之声：留学生最近在讨论什么。只看多数人的共性——同一人或同一矩阵只算一个来源，独立来源 ≥ 5 才上榜。"
        actions={state.data ? <span className="small muted">本机运行 · 上次抓取 {state.data.updatedAt} · {state.data.nextAt ? `下次 ${state.data.nextAt}` : "人工采集，不定时"}</span> : issue?.kind === "unavailable" ? <SampleBadge task="演示 · Voice 模拟数据" /> : null} />
      {issue?.kind === "unavailable" ? <><p className="voice-sample-note"><SampleBadge task="演示 · Voice 模拟数据" />模拟数据：学生讨论来源还没接通（{issue.text}）。下面的话题和数字都是示例，接通后自动换成真实热榜。</p><VoiceBoard v={voiceSample()} sample /></>
        : issue ? <VoiceIssue issue={issue} reload={state.reload} /> : <Loadable state={state} name="留学之声" big>{(v) => (v.hot?.length ? <VoiceBoard v={v} /> : <VoiceIssue issue={{ kind: "empty", title: "现在没有合格的话题", text: v.note || "还没有达到 5 个独立来源的话题。" }} />)}</Loadable>}
    </>
  );
}

// 词云：字号 = 热度，颜色 = 走势（急升橙、上升墨、平稳深灰、回落浅灰）；大词居中。首页也用这个组件。
const CLOUD_TREND = { surge: "急升", up: "上升", flat: "平稳", down: "回落" };
export function VoiceCloud({ cloud, size = 1, onPick }) {
  const words = [...(cloud || [])].sort((a, b) => b[1] - a[1]);
  const centered = words.reduce((out, w, i) => (i % 2 ? out.push(w) : out.unshift(w), out), []);
  return (
    <div className="voice-cloud-wrap">
      <div className="voice-cloud">
        {centered.map(([word, heat, trend]) => {
          const props = { className: `vw is-${trend}`, style: { fontSize: `${Math.round((13 + heat * 0.24) * size)}px` }, title: `${word} · 热度 ${heat} · ${CLOUD_TREND[trend]}` };
          return onPick ? <button key={word} type="button" {...props} onClick={() => onPick(word)}>{word}</button> : <a key={word} href={href("voice")} {...props}>{word}</a>;
        })}
      </div>
      <span className="voice-legend">{Object.entries(CLOUD_TREND).map(([k, l]) => <span key={k} className={`is-${k}`}><i />{l}</span>)}<span className="muted">字越大越热</span></span>
    </div>
  );
}

function VoiceBoard({ v, sample = false }) {
  const [scope, setScope] = useState("");
  const [kind, setKind] = useState("");
  const [word, setWord] = useState("");
  const [sel, setSel] = useState(v.hot[0]?.id);
  const tags = [...new Set(v.hot.flatMap((t) => t.tags))];
  const countries = tags.filter((t) => COUNTRY.includes(t));
  const schools = tags.filter((t) => !COUNTRY.includes(t));
  const kinds = [...new Set(v.hot.map((t) => t.kind))];
  const list = v.hot.filter((t) => (!scope || t.tags.includes(scope)) && (!kind || t.kind === kind) && (!word || `${t.title}${t.summary}`.includes(word)));
  const cur = list.find((t) => t.id === sel) || list[0];
  const delta = (t) => (t.spark?.length >= 2 ? t.spark.at(-1) - t.spark.at(-2) : 0);
  const rising = [...v.hot].sort((a, b) => delta(b) - delta(a)).slice(0, 3);
  const s = v.stats;
  const surgeTop = v.hot.find((t) => t.trend === "surge");
  return (
    <>
      <StatStrip items={[
        { label: "今日上榜话题", value: s.topics, foot: `新增 ${s.newTopics}` },
        { label: "独立来源 · 48 小时", value: s.participants, foot: `个案已过滤 ${s.filtered}` },
        { label: "信源", value: s.sourceCount, foot: s.sources ? `${s.sources} · 免费` : "免费信源" },
        // 模型费用已在设置页「留学之声预算」，这里换成急升话题数（二次评审 P2-9，用户确认）
        { label: "急升话题", value: s.surge, foot: <span className="clamp-1">{surgeTop ? surgeTop.title : "今天没有急升话题"}</span> },
      ]} />
      <div className="voice-top cols-6-6">
        <Card title={<><PixelIcon name="voice" />大家在说什么</>} extra={word ? <button type="button" className="link-btn" onClick={() => setWord("")}>清除「{word}」</button> : <span className="small muted">点一个词，下面的热榜只看相关话题</span>}>
          <VoiceCloud cloud={v.cloud} size={1.1} onPick={setWord} />
        </Card>
        <Card title={<><PixelIcon name="reports" />今日摘要</>} extra={<span className="small muted">覆盖昨天 08:00 — 今天 08:00</span>}>
          {v.daily ? <div className="ai-box"><span className="label"><PixelIcon name="spark" />AI 总述</span><TypeText text={v.daily} /></div> : <p className="small muted">今天没有生成总述（模型调用未开启）。</p>}
          <div className="label voice-sub">上升最快</div>
          <ol className="list rising-list">{rising.map((t) => <li key={t.id}><button type="button" className="link-btn" onClick={() => { setWord(""); setScope(""); setKind(""); setSel(t.id); }}>{t.title}</button><span className={`trend ${TREND[t.trend]?.[1] || ""}`}>{TREND[t.trend]?.[0] || t.trend} {delta(t) >= 0 ? "+" : ""}{delta(t).toFixed(0)}</span></li>)}</ol>
        </Card>
      </div>
      <div className="toolbar voice-filter">
        <span className="label">范围</span>
        <button type="button" className={`chip${!scope ? " is-on" : ""}`} onClick={() => setScope("")}>整体</button>
        {countries.map((c) => <button key={c} type="button" className={`chip${scope === c ? " is-on" : ""}`} onClick={() => setScope(scope === c ? "" : c)}>{c}</button>)}
        <label className="select"><span>学校</span><select value={schools.includes(scope) ? scope : ""} onChange={(e) => setScope(e.target.value)}><option value="">全部</option>{schools.map((x) => <option key={x}>{x}</option>)}</select></label>
        <span className="label" style={{ marginLeft: 8 }}>类型</span>
        <button type="button" className={`chip${!kind ? " is-on" : ""}`} onClick={() => setKind("")}>全部</button>
        {kinds.map((k) => <button key={k} type="button" className={`chip${kind === k ? " is-on" : ""}`} onClick={() => setKind(kind === k ? "" : k)}>{k}</button>)}
        <span className="spacer" />
        <span className="small muted">{list.length} 个话题</span>
      </div>
      {!list.length ? <p className="empty">没有符合条件的话题</p> : (
        <div className="voice-layout cols-6-6">
          <ol className="hot-list">
            {list.map((t, i) => (
              <li key={t.id}>
                <button type="button" className={t.id === cur?.id ? "is-sel" : ""} onClick={() => setSel(t.id)}>
                  <span className={`rank tnum${i === 0 ? " is-top" : ""}`}>{String(i + 1).padStart(2, "0")}</span>
                  <span className="hot-main">
                    <strong>{t.title}</strong>
                    <span className="tag-row"><Tag tone="frame">{t.kind}</Tag>{t.tags.map((g) => <Tag key={g}>{g}</Tag>)}</span>
                  </span>
                  <span className="hot-heat"><b className="tnum">{t.heat.toFixed(1)}</b><span className="small muted">{t.part} 个来源</span><span className={`trend ${TREND[t.trend][1]}`}>{TREND[t.trend][0]}</span></span>
                  <Spark data={t.spark || []} />
                </button>
              </li>
            ))}
          </ol>
          {cur && (
            <section className="card voice-detail">
              <div className="card-head"><h2><PixelIcon name="voice" />话题详情</h2><span className={`trend ${TREND[cur.trend][1]}`}>{TREND[cur.trend][0]}</span></div>
              <div className="card-body stack-sm">
                <h3 className="voice-title">{cur.title}</h3>
                <div className="voice-facts">
                  <span><b className="tnum">{cur.heat}</b>热度</span>
                  <span><b className="tnum">{cur.part}</b>个独立来源</span>
                  <span><b>{cur.kind}</b>类型</span>
                  <span><b>{cur.tags.join(" · ")}</b>范围</span>
                </div>
                <div className="label">近 7 天热度</div>
                <DayBars data={cur.spark || []} dates={cur.sparkDates} />
                <div className="ai-box"><span className="label"><PixelIcon name="spark" />共性摘要</span>{cur.summary}</div>
                <div className="label">代表来源 · {(cur.sources || []).length}</div>
                <ul className="src-list">{(cur.sources || []).map(([t, src]) => <li key={t}><q>{t}</q><span className="tnum small muted">{src}</span></li>)}</ul>
              </div>
            </section>
          )}
        </div>
      )}
      <Card title={<><PixelIcon name="trend" />近 7 天热度走势</>} extra={<span className="small muted">前 4 个话题 · 粗线为第一名</span>}>
        <TrendChart topics={v.hot.slice(0, 4)} />
      </Card>
    </>
  );
}

function Spark({ data }) {
  if (!data.length) return <span className="spark" aria-hidden="true" />;
  const max = Math.max(1, ...data);
  // 每天一列 4 颗方点，按比例点亮；最后一天用橙色
  return (
    <span className="spark" aria-hidden="true">
      {data.map((d, i) => {
        const on = d > 0 ? Math.max(1, Math.round((d / max) * 4)) : 0;
        return <b key={i} className={i === data.length - 1 ? "is-last" : ""}>{[0, 1, 2, 3].map((r) => <i key={r} className={r < on ? "on" : undefined} />)}</b>;
      })}
    </span>
  );
}

// 单个话题的 7 天点阵柱：从左到右、自下而上逐点点亮，最后一天橙色；柱顶标数值，柱底标日期（取接口的 sparkDates，没有就不写）。
function DayBars({ data, dates }) {
  const cols = data.map((d, i) => ({ value: d, label: dates?.[i] ? String(dates[i]).slice(5, 10) : "", hint: dates?.[i] ? String(dates[i]).slice(0, 10) : `第 ${i + 1} 天` }));
  return <div className="day-bars"><DotMatrix data={cols} rows={8} highlight={data.length - 1} showValues /></div>;
}

function TrendChart({ topics }) {
  const W = 1000, H = 220, L = 40, R = 260, T = 12, B = 26;
  // 热度是 0–100，刻度固定，不随当天最大值变（P2-9）
  const x = (i) => L + (i * (W - L - R)) / 6, y = (val) => T + (1 - val / 100) * (H - T - B);
  const text = (t) => `${t.title.length > 16 ? `${t.title.slice(0, 16)}…` : t.title} · ${t.heat}`;
  // 末端标签避让：字体就绪后用隐藏的同款文字实测包围盒定槽高，再按真实末点排开；只移标签，不移折线和方点。
  const measure = useRef(null);
  const [slot, setSlot] = useState(16);
  const key = topics.map(text).join("\n");
  useLayoutEffect(() => {
    let alive = true;
    const run = () => {
      const g = measure.current;
      if (!alive || !g) return;
      const boxes = [...g.children].map((el) => el.getBBox()).filter((b) => b.height).map((b) => ({ a: b.y, b: b.y + b.height }));
      setSlot(slotHeight(boxes));
    };
    run();
    document.fonts?.ready.then(run);
    return () => { alive = false; };
  }, [key]);
  const layout = labelLayout(topics, { H, T, B, h: slot });
  const pos = new Map(layout.mode === "labels" ? layout.labels.map((l) => [l.id, l]) : []);
  // 每点标热度、悬停 / 键盘看一天的竖线与数据卡（用户 2026-10-24 选定，稿件 docs/design-drafts/charts/hover.html）；坐标都是 viewBox 单位，卡片位置换算成像素
  const n = topics[0]?.spark.length || 0, step = (W - L - R) / 6;
  const { active, setActive, hostProps } = useChartHover(n, () => n - 1);
  const host = useRef(null);
  const vl = pointLabels(topics, { x, y, pos, text, L, R, W, H, B });
  const pick = (e) => { const r = e.currentTarget.ownerSVGElement.getBoundingClientRect(); setActive(Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left) * W / r.width - L) / step)))); };
  const px = (v) => v * (host.current?.clientWidth || W) / W;
  const day = (i) => topics[0]?.sparkDates?.[i] ? String(topics[0].sparkDates[i]).slice(5, 10) : `第 ${i + 1} 天`;
  return (
    <>
      <div ref={host} className="trend-host" role="group" aria-label="话题热度逐天数值，按左右方向键逐天查看" {...hostProps}>
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-chart" role="img" aria-label="话题热度趋势" shapeRendering="crispEdges">
        <g ref={measure} visibility="hidden" aria-hidden="true">{topics.map((t) => <text key={t.id} x={0} y={0} className="end-label">{text(t)}</text>)}</g>
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid-line" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="axis">{v}</text></g>)}
        {active >= 0 && <line className="chart-cross" x1={x(active)} x2={x(active)} y1={T} y2={H - B} />}
        {(topics[0]?.sparkDates || []).map((l, i) => <g key={l} className={i === active ? "chart-xon" : undefined}>
          {i === active && <rect x={x(i) - 22} y={H - 19} width="44" height="17" />}
          <text x={x(i)} y={H - 6} textAnchor="middle" className="axis">{String(l).slice(5, 10)}</text>
        </g>)}
        {/* 倒序绘制：第一名最后画、压在最上层，同值重合时粗线和橙点仍可见（只改绘制顺序，不改数据） */}
        {topics.map((t, k) => {
          const p = pos.get(t.id);
          return (
            <g key={t.id} className={k === 0 ? "series is-top" : "series"}>
              <polyline points={t.spark.map((val, i) => `${x(i)},${y(val)}`).join(" ")} />
              {t.spark.map((val, i) => <rect key={i} x={x(i) - 4} y={y(val) - 4} width="8" height="8" className="pt" />)}
              {p && Math.abs(p.labelY - p.pointY) > 0.5 && <line x1={W - R + 4} y1={p.pointY} x2={W - R + 8} y2={p.labelY} className="leader" />}
              {p && <text x={W - R + 10} y={p.labelY + 4} className="end-label">{t.title.length > 16 && <title>{t.title}</title>}{text(t)}</text>}
            </g>
          );
        }).reverse()}
        {vl.map((l) => !l.hidden && <text key={l.key} x={l.x.toFixed(1)} y={l.y.toFixed(1)} className={`chart-val${l.k === 0 ? " is-top" : ""}${l.i === active ? " is-on" : ""}`}>{l.text}</text>)}
        {active >= 0 && topics.map((t, k) => <rect key={t.id} className={`chart-ring ${k === 0 ? "is-top" : "is-last"}`} x={x(active) - 6} y={y(t.spark[active]) - 6} width="12" height="12" />)}
        <rect className="chart-hit" x={L} y="0" width={W - R - L} height={H} onPointerMove={pick} />
      </svg>
      <ChartTip x={active >= 0 ? px(x(active)) : null} gap={Math.max(14, px(step) / 2 + 2)} wide>
        {active >= 0 && <>
          <div className="chart-tip-head"><b>{day(active)}</b><span>热度 0–100</span></div>
          {topics.map((t, k) => <ChartTipRow key={t.id} mark={k === 0 ? "is-top" : "is-last"} name={t.title} value={heatText(t.spark[active])} />)}
        </>}
      </ChartTip>
      </div>
      {layout.mode === "legend" && (
        <ul className="trend-legend" aria-label="话题图例（末端放不下标签时显示）">
          {topics.map((t, k) => <li key={t.id} className={k === 0 ? "is-top" : undefined}><i aria-hidden="true" /><span>{t.title}</span><span className="tnum muted">{t.heat}</span></li>)}
        </ul>
      )}
    </>
  );
}

const heatText = (v) => Number.isInteger(v) ? String(v) : v.toFixed(1);

// 每点热度的摆放：四条线的每一段、每个方点、线尾标签都算障碍；同一天上半往上标、下半往下标，第一名先摆。
// 最后一天的值线尾标签里已有（「标题 · 92」），不重复标；线尾放不下改图例时照常标。
function pointLabels(topics, { x, y, pos, text, L, R, W, H, B }) {
  const segments = [], marks = [], boxes = [], items = [];
  const w12 = (s) => [...s].reduce((a, c) => a + (/[　-鿿＀-￯]/.test(c) ? 12 : 6.7), 0); // 线尾标签 12px 字宽估算
  topics.forEach((t) => t.spark.forEach((v, i) => {
    marks.push({ x: x(i) - 4, y: y(v) - 4, w: 8, h: 8 });
    if (i < t.spark.length - 1) segments.push([x(i), y(v), x(i + 1), y(t.spark[i + 1])]);
  }));
  topics.forEach((t) => { const p = pos.get(t.id); if (p) boxes.push({ x: W - R + 10, y: p.labelY - 6, w: w12(text(t)), h: 13 }); });
  topics.forEach((t, k) => t.spark.forEach((v, i) => {
    if (i === t.spark.length - 1 && pos.has(t.id)) return;
    const higher = topics.filter((o) => o.spark[i] > v).length;
    items.push({ key: `${t.id}-${i}`, i, k, x: x(i), y: y(v), r: 4, text: heatText(v), side: higher < topics.length / 2 ? "up" : "down" });
  }));
  const placed = placeLabels(items, { segments, marks, boxes, bounds: { x: L - 4, y: 0, w: W - R - L + 8, h: H - B - 2 } });
  return items.map((it, j) => ({ ...it, ...placed[j] }));
}
