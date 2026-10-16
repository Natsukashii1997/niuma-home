import { useApi } from "../../api.js";
import { daysToDeadline, deliveryMonth } from "../../constants.js";

// 底部状态栏（第三轮提案 7）：各数据源的同步状态收在一处——飞书（日报、周报、时间线、知识库）、NAS、Voice、交付月倒计时；右侧是 ⌘K 入口。
// 只读 /api/v3/status 一个接口：后端只查数据库，不触发飞书、NAS 或网络读取；不再为了一个时间去拉整份时间线、知识库或 Voice。
// 点：绿 = 最近一次成功；琥珀 = 最近一次失败或太久没同步（悬停看原因，失败时仍写上次成功时间）；灰空心 = 未接入或从没读过。
// Codex 照旧只在顶部横条，这里不放。

const STALE_DAYS = 7;
const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);
const toDate = (at) => new Date(String(at).replace(" ", "T"));
const short = (at) => (toDate(at).toDateString() === new Date().toDateString() ? at.slice(11, 16) : at.slice(5, 16));

// 一个来源 → { label, tone, value, title }。stale 为 true 时，超过 STALE_DAYS 天没成功也标琥珀。
export function sourceItem(label, s, { stale = false } = {}) {
  if (!s || s.state === "off") return { label, tone: "off", value: "未接入", title: `${label}：接口还没实现` };
  if (s.state === "never") return { label, tone: "off", value: "未读取", title: `${label}：已接入，还没有成功读取过` };
  if (s.state === "error") return { label, tone: "warn", value: s.at ? `失败 · 上次 ${short(s.at)}` : "失败", title: `${label}：${s.error || "最近一次读取失败"}${s.at ? `（上次成功 ${s.at}）` : ""}` };
  const days = s.at ? Math.floor((Date.now() - toDate(s.at)) / 86400000) : 0;
  if (stale && days >= STALE_DAYS) return { label, tone: "warn", value: short(s.at), title: `${label}已经 ${days} 天没同步（上次 ${s.at}）` };
  return { label, tone: "ok", value: s.at ? short(s.at) : "正常", title: `${label}：最近一次成功 ${s.at || ""}` };
}

function Group({ name, items }) {
  const tone = items.some((i) => i.tone === "warn") ? "warn" : items.some((i) => i.tone === "ok") ? "ok" : "off";
  return (
    <span className={`sb-group is-${tone}`}>
      <i className="sb-dot" aria-hidden="true" /><b>{name}</b>
      {items.map((i) => <span key={i.label || name} className={`sb-item is-${i.tone}`} title={i.title}>{i.label && `${i.label} `}{i.value}</span>)}
    </span>
  );
}

export function StatusBar({ onCommand }) {
  const state = useApi("/api/v3/status");
  const dm = deliveryMonth(), days = daysToDeadline(dm);
  const src = state.data?.sources || {};
  const pending = (label) => ({ label, tone: state.error ? "warn" : "off", value: state.error ? "状态读取失败" : "…", title: state.error || "" });
  const pick = (label, key, opts) => (state.data ? sourceItem(label, src[key], opts) : pending(label));
  const nas = state.data && src.nas?.state === "ok"
    ? { label: "", tone: "ok", value: `${src.nas.network || "已连接"}${src.nas.thumbBytes != null ? ` · 缩略图 ${Math.round(src.nas.thumbBytes / 1048576)} MB` : ""}`, title: `NAS：最近一次扫描 ${src.nas.at || ""}` }
    : pick("", "nas");
  const v = src.voice;
  const voice = state.data && v?.state === "ok" && v.limit
    ? { label: "", tone: v.used >= v.limit * 0.8 ? "warn" : "ok", value: `¥${Number(v.used).toFixed(2)} / ${v.limit}`, title: `本月预算 ${v.limit} 元，已用 ${Number(v.used).toFixed(2)} 元` }
    : state.data && v?.state === "error" ? { label: "", tone: "warn", value: "来源不可用", title: `Voice：${v.error || "最近一次采集失败"}` } : pick("", "voice");
  return (
    <footer className="statusbar" aria-label="数据源状态">
      <Group name="飞书" items={[pick("日报", "daily"), pick("周报", "weekly"), pick("时间线", "timeline", { stale: true }), pick("知识库", "kb")]} />
      <Group name="NAS" items={[nas]} />
      <Group name="Voice" items={[voice]} />
      <span className={`sb-item${days <= 3 ? " is-warn" : ""}`} title="交付截止：交付月前一个月的最后一天">交付月 {dm} · 还有 {days} 天</span>
      <span className="spacer" />
      <button type="button" className="sb-cmd" onClick={onCommand} title="打开命令面板"><kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>命令</button>
      <span className="sb-host">{location.host}</span>
    </footer>
  );
}
