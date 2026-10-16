import { useState } from "react";
import { PixelIcon, TypeText } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Card, Loadable, PageHeader, SampleBadge, StatStrip, Tag, useToast } from "../../ui/components.jsx";
import { SAMPLE_VOICE } from "../../samples/v3.js";

// Voice · 留学之声（v3，侧栏独立模块）：留学生最近在讨论什么。基于本机运行的 AIHOT 引擎，免费英文信源；
// 只看多数人的共性——同一人 / 同一矩阵只算一个来源，独立来源 ≥ 5 才上榜。
const TREND = { surge: ["急升", "is-surge"], rising: ["上升", "is-up"], up: ["上升", "is-up"], flat: ["平稳", ""], down: ["回落", "is-down"] };
const COUNTRY = ["澳洲", "新西兰", "英国", "美国", "加拿大", "香港", "新加坡", "马来西亚"];
const DAYS = ["10-10", "10-11", "10-12", "10-13", "10-14", "10-15", "10-16"];

export default function VoicePage() {
  const state = useApi("/api/v3/voice", SAMPLE_VOICE);
  return (
    <>
      <PageHeader title="Voice" subtitle="留学之声：留学生最近在讨论什么。只看多数人的共性——同一人或同一矩阵只算一个来源，独立来源 ≥ 5 才上榜。"
        actions={state.data && <>{state.isSample && <SampleBadge task={state.task} />}<span className="small muted">本机运行 · 上次抓取 {state.data.updatedAt} · 下次 {state.data.nextAt}</span></>} />
      <Loadable state={state} name="留学之声" big>{(v) => <VoiceBoard v={v} />}</Loadable>
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

function VoiceBoard({ v }) {
  const [scope, setScope] = useState("");
  const [kind, setKind] = useState("");
  const [word, setWord] = useState("");
  const [sel, setSel] = useState(v.hot[0].id);
  const [toast, showToast] = useToast();
  const tags = [...new Set(v.hot.flatMap((t) => t.tags))];
  const countries = tags.filter((t) => COUNTRY.includes(t));
  const schools = tags.filter((t) => !COUNTRY.includes(t));
  const kinds = [...new Set(v.hot.map((t) => t.kind))];
  const list = v.hot.filter((t) => (!scope || t.tags.includes(scope)) && (!kind || t.kind === kind) && (!word || `${t.title}${t.summary}`.includes(word)));
  const cur = list.find((t) => t.id === sel) || list[0];
  const rising = [...v.hot].sort((a, b) => (b.spark[6] - b.spark[5]) - (a.spark[6] - a.spark[5])).slice(0, 3);
  const s = v.stats;
  return (
    <>
      <StatStrip items={[
        { label: "今日上榜话题", value: s.topics, foot: `新增 ${s.newTopics} · 急升 ${s.surge}` },
        { label: "独立来源 · 48 小时", value: s.participants, foot: `个案已过滤 ${s.filtered}` },
        { label: "信源", value: s.sourceCount, foot: `${s.sources} · 免费` },
        { label: "本月模型费用", value: `¥${v.budget.used.toFixed(2)}`, unit: ` / ${v.budget.limit}`, foot: <><span className="stat-bar"><i style={{ width: `${(v.budget.used / v.budget.limit) * 100}%` }} /></span>超预算自动停</> },
      ]} />
      <div className="voice-top cols-6-6">
        <Card title={<><PixelIcon name="voice" />大家在说什么</>} extra={word ? <button type="button" className="link-btn" onClick={() => setWord("")}>清除「{word}」</button> : <span className="small muted">点一个词，下面的热榜只看相关话题</span>}>
          <VoiceCloud cloud={v.cloud} size={1.1} onPick={setWord} />
        </Card>
        <Card title={<><PixelIcon name="reports" />今日摘要</>} extra={<span className="small muted">覆盖昨天 08:00 — 今天 08:00</span>}>
          <div className="ai-box"><span className="label"><PixelIcon name="spark" />AI 总述</span><TypeText text={v.daily} /></div>
          <div className="label voice-sub">上升最快</div>
          <ol className="list rising-list">{rising.map((t) => <li key={t.id}><button type="button" className="link-btn" onClick={() => { setWord(""); setScope(""); setKind(""); setSel(t.id); }}>{t.title}</button><span className={`trend ${TREND[t.trend][1]}`}>{TREND[t.trend][0]} +{(t.spark[6] - t.spark[5]).toFixed(0)}</span></li>)}</ol>
        </Card>
      </div>
      <div className="toolbar">
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
                    <span className="tag-row"><Tag tone="ink">{t.kind}</Tag>{t.tags.map((g) => <Tag key={g}>{g}</Tag>)}</span>
                  </span>
                  <span className="hot-heat"><b className="tnum">{t.heat.toFixed(1)}</b><span className="small muted">{t.part} 个来源</span><span className={`trend ${TREND[t.trend][1]}`}>{TREND[t.trend][0]}</span></span>
                  <Spark data={t.spark} />
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
                <DayBars data={cur.spark} />
                <div className="ai-box"><span className="label"><PixelIcon name="spark" />共性摘要</span>{cur.summary}</div>
                <div className="label">代表来源 · {cur.sources.length}</div>
                <ul className="src-list">{cur.sources.map(([t, src]) => <li key={t}><q>{t}</q><span className="tnum small muted">{src}</span></li>)}</ul>
                <div className="label">关联主线需求</div>
                {cur.need ? <a className="chip" href={href("user", "strategy")}><PixelIcon name="link" />{cur.need}</a> : <span className="small muted">还没有对应的主线需求</span>}
                <div className="row"><Button onClick={() => showToast("已生成主线需求草稿，去用户策略页采纳（示例）")}><PixelIcon name="plus" />转为主线需求草稿</Button></div>
              </div>
            </section>
          )}
        </div>
      )}
      <Card title={<><PixelIcon name="trend" />近 7 天热度走势</>} extra={<span className="small muted">前 4 个话题 · 粗线为第一名</span>}>
        <TrendChart topics={v.hot.slice(0, 4)} />
      </Card>
      {toast}
    </>
  );
}

function Spark({ data }) {
  const max = Math.max(...data);
  return <span className="spark" aria-hidden="true">{data.map((d, i) => <i key={i} style={{ height: `${Math.max(2, (d / max) * 22)}px` }} className={i === data.length - 1 ? "is-last" : ""} />)}</span>;
}

// 单个话题的 7 天柱状图，每根柱子标数值和日期。
function DayBars({ data }) {
  const max = Math.max(...data);
  return (
    <div className="day-bars">
      {data.map((d, i) => (
        <div key={i} className={i === data.length - 1 ? "is-last" : ""}>
          <span className="tnum">{d}</span>
          <i style={{ height: `${Math.max(3, (d / max) * 64)}px` }} />
          <em className="tnum">{DAYS[i].slice(3)}</em>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ topics }) {
  const W = 1000, H = 220, L = 40, R = 260, T = 12, B = 26;
  const max = Math.max(...topics.flatMap((t) => t.spark));
  const x = (i) => L + (i * (W - L - R)) / 6, y = (val) => T + (1 - val / max) * (H - T - B);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend-chart" role="img" aria-label="话题热度趋势">
      {[0, 0.5, 1].map((p) => <g key={p}><line x1={L} x2={W - R} y1={y(max * p)} y2={y(max * p)} className="grid-line" /><text x={L - 8} y={y(max * p) + 4} textAnchor="end" className="axis">{Math.round(max * p)}</text></g>)}
      {DAYS.map((l, i) => <text key={l} x={x(i)} y={H - 6} textAnchor="middle" className="axis">{l}</text>)}
      {topics.map((t, k) => (
        <g key={t.id} className={k === 0 ? "series is-top" : "series"}>
          <polyline points={t.spark.map((val, i) => `${x(i)},${y(val)}`).join(" ")} />
          <text x={W - R + 10} y={y(t.spark[6]) + 4} className="end-label">{t.title.length > 16 ? `${t.title.slice(0, 16)}…` : t.title} · {t.heat}</text>
        </g>
      ))}
    </svg>
  );
}
