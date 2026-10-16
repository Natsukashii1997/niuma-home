import { useApi } from "../../api.js";
import { daysToDeadline, deliveryMonth } from "../../constants.js";

// 底部状态栏（第三轮提案 7）：把散在各页的数据源状态收到一处——飞书各来源的同步时间、NAS、Voice 预算、交付月倒计时；右侧是 ⌘K 入口。
// 只写真实数据：接口未实现的项显示「未接入」灰点，不放示例；出问题时琥珀点，悬停看原因。只读，不触发任何同步。
// 日报这里不读：/api/reports 会去飞书拉文档，状态栏不该触发外部读取，等有只读的状态接口再接。Codex 横条照旧在顶部，这里不放 Codex。

const STALE_DAYS = 7;
const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);

// state 来自 useApi(path, null)：接口返回 501 时 isSample 为真（未接入）；read 把真实数据变成 { value, warn, title }。
function item(label, state, read) {
  if (state.loading) return { label, tone: "off", value: "…" };
  if (state.isSample) return { label, tone: "off", value: "未接入", title: `${label}：接口还没实现（V3-接口清单），这里不显示示例` };
  if (state.error) return { label, tone: "warn", value: "读取失败", title: `${label}：${state.error}` };
  const r = read(state.data);
  return { label, tone: r.warn ? "warn" : "ok", value: r.value, title: r.title };
}

function readTimeline(d) {
  const at = new Date(String(d.syncedAt).replace(" ", "T"));
  const days = Math.floor((Date.now() - at) / 86400000);
  const sameDay = new Date().toDateString() === at.toDateString();
  return {
    value: sameDay ? d.syncedAt.slice(11, 16) : d.syncedAt.slice(5, 16),
    warn: !(days < STALE_DAYS),
    title: days < STALE_DAYS ? `用户时间线 · ${d.source} · 同步于 ${d.syncedAt}` : `用户时间线已经 ${days} 天没同步，去时间线页点「同步」`,
  };
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
  const timeline = useApi("/api/v3/timeline", null);
  const kb = useApi("/api/v3/kb/tree", null);
  const nas = useApi("/api/v3/nas", null);
  const voice = useApi("/api/v3/voice", null);
  const dm = deliveryMonth(), days = daysToDeadline(dm);
  const feishu = [
    { label: "日报", tone: "off", value: "未接入", title: "日报：状态栏不直接读飞书文档，等只读的状态接口" },
    item("时间线", timeline, readTimeline),
    item("知识库", kb, (d) => ({ value: d.readAt, title: `${d.space} · 读取于 ${d.readAt}` })),
  ];
  const nasItem = item("", nas, (d) => d.reachable === false
    ? { value: "连不上", warn: true, title: `NAS ${d.root} 连不上，物料墙暂时看不到新文件` }
    : { value: `${d.network} · 缩略图 ${Math.round(d.thumbBytes / 1048576)} MB`, title: `${d.root} · 上次扫描 ${d.lastScanAt}` });
  const voiceItem = item("", voice, (d) => {
    const { used, limit } = d.budget;
    return { value: `¥${used.toFixed(2)} / ${limit}`, warn: used >= limit * 0.8, title: used >= limit * 0.8 ? `本月预算已用 ${Math.round((used / limit) * 100)}%` : `本月预算 ${limit} 元，已用 ${used.toFixed(2)} 元` };
  });
  return (
    <footer className="statusbar" aria-label="数据源状态">
      <Group name="飞书" items={feishu} />
      <Group name="NAS" items={[nasItem]} />
      <Group name="Voice 预算" items={[voiceItem]} />
      <span className={`sb-item${days <= 3 ? " is-warn" : ""}`} title={`交付截止：交付月前一个月的最后一天`}>交付月 {dm} · 还有 {days} 天</span>
      <span className="spacer" />
      <button type="button" className="sb-cmd" onClick={onCommand} title="打开命令面板"><kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>命令</button>
      <span className="sb-host">{location.host}</span>
    </footer>
  );
}
