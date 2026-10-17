import { useState } from "react";
import { DotMatrix, PixelIcon, TypeText } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, Card, Loadable, PageHeader, Placeholder, StatStrip, Tag } from "../../ui/components.jsx";
import { SavedNote } from "../../ui/write-flow.jsx";
import { ManualNeedForm } from "../user/ManualNeedForm.jsx";
import { deliveryMonth } from "../../constants.js";

// Voice · 留学之声（v3，侧栏独立模块）：留学生最近在讨论什么。基于本机运行的 AIHOT 引擎，免费英文信源；
// 只看多数人的共性——同一人 / 同一矩阵只算一个来源，独立来源 ≥ 5 才上榜。
// 接口用 503 + 错误码区分三种情况，页面分开写，不能混成一种：
//   来源不可用（未配置、读取失败、记录过期、证据不完整）→ 热榜没有接通，不显示任何话题；
//   真实读取后没有合格话题 → 合法的空榜（接口 200、hot 为空、note 写原因）；
//   其他读取失败 → 可以重新读取。
// 日期和趋势只用接口给的真实值（sparkDates、spark），不补造固定的七天。
const TREND = { surge: ["急升", "is-surge"], rising: ["上升", "is-up"], up: ["上升", "is-up"], flat: ["平稳", ""], down: ["回落", "is-down"] };
const COUNTRY = ["澳洲", "新西兰", "英国", "美国", "加拿大", "香港", "新加坡", "马来西亚"];

export function voiceIssue(state) {
  if (!state.error) return null;
  if (state.code === "VOICE_NO_QUALIFIED_TOPICS") return { kind: "empty", title: "现在没有合格的话题", text: state.error };
  if (/^VOICE_/.test(state.code || "")) return { kind: "unavailable", title: "学生讨论来源不可用，热榜没有接通", text: state.error };
  return { kind: "error", title: "留学之声读取失败", text: state.error };
}

function VoiceIssue({ issue, reload }) {
  return (
    <Placeholder icon={issue.kind === "empty" ? "voice" : "alert"} title={issue.title}
      action={issue.kind !== "unavailable" && reload ? <Button onClick={reload}><PixelIcon name="refresh" />重新读取</Button> : null}>
      <span className={issue.kind === "unavailable" ? "warn-text" : issue.kind === "error" ? "risk-text" : ""}>{issue.text}</span>
      {issue.kind === "unavailable" && <><br />免费人工试运行：模型、付费采集和定时任务都没开；这里不显示任何示例话题。</>}
    </Placeholder>
  );
}

export default function VoicePage() {
  const state = useApi("/api/v3/voice");
  const issue = voiceIssue(state);
  return (
    <>
      <PageHeader title="Voice" subtitle="留学之声：留学生最近在讨论什么。只看多数人的共性——同一人或同一矩阵只算一个来源，独立来源 ≥ 5 才上榜。"
        actions={state.data && <span className="small muted">本机运行 · 上次抓取 {state.data.updatedAt} · {state.data.nextAt ? `下次 ${state.data.nextAt}` : "人工采集，不定时"}</span>} />
      {issue ? <VoiceIssue issue={issue} reload={state.reload} /> : <Loadable state={state} name="留学之声" big>{(v) => (v.hot?.length ? <VoiceBoard v={v} /> : <VoiceIssue issue={{ kind: "empty", title: "现在没有合格的话题", text: v.note || "还没有达到 5 个独立来源的话题。" }} />)}</Loadable>}
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
  const [sel, setSel] = useState(v.hot[0]?.id);
  // 转为主线需求草稿：写进交付月；已经转过的话题直接链到那条草稿，不重复转。
  const month = deliveryMonth();
  const drafts = useApi("/api/v3/manual-needs");
  const [records, setRecords] = useState(null); // 保存后用回读到的记录，不再等重新读取
  const [converting, setConverting] = useState("");
  const [note, setNote] = useState("");
  const tags = [...new Set(v.hot.flatMap((t) => t.tags))];
  const countries = tags.filter((t) => COUNTRY.includes(t));
  const schools = tags.filter((t) => !COUNTRY.includes(t));
  const kinds = [...new Set(v.hot.map((t) => t.kind))];
  const list = v.hot.filter((t) => (!scope || t.tags.includes(scope)) && (!kind || t.kind === kind) && (!word || `${t.title}${t.summary}`.includes(word)));
  const cur = list.find((t) => t.id === sel) || list[0];
  const draft = cur && (records || drafts.data?.records || []).find((r) => r.month === month && r.voice?.id === cur.id);
  const converted = async (need) => {
    const back = await apiSend("GET", "/api/v3/manual-needs");
    const r = back.records.find((x) => x.need.id === need.id);
    if (!r || JSON.stringify(r.need) !== JSON.stringify(need)) return false;
    setRecords(back.records); setConverting(""); setNote(`已转为 ${month} 主线需求草稿，回读核对一致`);
    return true;
  };
  const rereadDrafts = async () => setRecords((await apiSend("GET", "/api/v3/manual-needs")).records);
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
                <button type="button" className={t.id === cur?.id ? "is-sel" : ""} onClick={() => { setSel(t.id); setNote(""); }}>
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
                <div className="label">关联主线需求</div>
                {cur.need ? <a className="chip" href={href("user", "strategy")}><PixelIcon name="link" />{cur.need}</a> : <span className="small muted">还没有对应的主线需求</span>}
                <SavedNote text={note} onClose={() => setNote("")} />
                {draft ? <a className="chip" href={href("user", "strategy", draft.need.id)}><PixelIcon name="link" />已转为 {month} 主线需求草稿：{draft.need.need}</a>
                  : converting === cur.id ? <ManualNeedForm key={cur.id} embedded month={month} voiceId={cur.id} title="转为主线需求草稿"
                    initial={{ seg: cur.tags.join(" · ").slice(0, 50), node: "Voice 话题", need: cur.title.slice(0, 500), pain: cur.summary.slice(0, 500) }}
                    onSaved={converted} onReread={rereadDrafts} onClose={() => setConverting("")} />
                  : <div className="row"><Button onClick={() => { setConverting(cur.id); setNote(""); }} disabled={!drafts.data && !records} title={drafts.error ? `读取已转草稿失败：${drafts.error}` : undefined}><PixelIcon name="plus" />转为主线需求草稿</Button>{drafts.error && <span className="small risk-text">读取已转草稿失败，暂不能转</span>}</div>}
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
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend-chart" role="img" aria-label="话题热度趋势" shapeRendering="crispEdges">
      {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid-line" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="axis">{v}</text></g>)}
      {(topics[0]?.sparkDates || []).map((l, i) => <text key={l} x={x(i)} y={H - 6} textAnchor="middle" className="axis">{String(l).slice(5, 10)}</text>)}
      {topics.map((t, k) => (
        <g key={t.id} className={k === 0 ? "series is-top" : "series"}>
          <polyline points={t.spark.map((val, i) => `${x(i)},${y(val)}`).join(" ")} />
          {t.spark.map((val, i) => <rect key={i} x={x(i) - 4} y={y(val) - 4} width="8" height="8" className="pt" />)}
          <text x={W - R + 10} y={y(t.spark.at(-1)) + 4} className="end-label">{t.title.length > 16 ? `${t.title.slice(0, 16)}…` : t.title} · {t.heat}</text>
        </g>
      ))}
    </svg>
  );
}
