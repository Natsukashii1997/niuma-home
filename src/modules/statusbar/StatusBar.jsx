import { useEffect, useState } from "react";
import { useApi } from "../../api.js";
import { allSources, pageInfo } from "./page-info.js";

// 底部状态栏「跟着页面」（用户 2026-10-19 选定 C 版，去掉页面图标和页面名）：最前面一个彩色小方块，后面直接写这一页的信息；
// 点开看各来源的读取时间。右边是本页快捷键、⌘K 和版本号。每页显示什么见 page-info.js。
// 只读 /api/v3/status（后端只查数据库，不触发飞书、NAS 或网络读取）；用户页另读 /api/v3/home/todo 取时间线异常数。
// Codex 照旧只在顶部横条，这里不放。

const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform || navigator.userAgent);

function Group({ name, items }) {
  const tone = items.some((i) => i.tone === "warn") ? "warn" : items.some((i) => i.tone === "ok") ? "ok" : "off";
  return (
    <span className={`sb-group is-${tone}`} role="listitem">
      <i className="sb-dot" aria-hidden="true" /><b>{name}</b>
      {items.map((i) => <span key={i.label} className={`sb-item is-${i.tone}`} title={i.title}>{i.group === "飞书" && `${i.label} `}{i.value}</span>)}
    </span>
  );
}

export function StatusBar({ page, onCommand }) {
  const state = useApi("/api/v3/status");
  useEffect(() => {
    if (page !== "kb") return undefined;
    const update = () => state.reload();
    window.addEventListener("workdesk:kb-synced", update);
    return () => window.removeEventListener("workdesk:kb-synced", update);
  }, [page, state.reload]);
  const todos = useApi(page === "user" ? "/api/v3/home/todo" : null).data; // 只有用户页才多读一次待办
  const [open, setOpen] = useState(false);
  const info = pageInfo(page, { data: state.data, error: state.error, todos });
  const sources = state.data ? allSources(state.data.sources) : [];
  return (
    <footer className="statusbar" aria-label="本页状态">
      <button type="button" className={`sb-summary is-${info.tone}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} title={info.title}>
        <i className="sb-dot" aria-hidden="true" />
        {info.segments.map((seg, n) => (
          <span key={n} className="sb-seg">{seg.map((p, k) => (typeof p === "string" ? p : <b key={k} className="sb-hot">{p.hot}</b>))}</span>
        ))}
      </button>
      {open && state.data && (
        <div className="sb-panel" role="list" aria-label="各数据源">
          <Group name="飞书" items={sources.filter((i) => i.group === "飞书")} />
          <Group name="NAS" items={sources.filter((i) => i.group === "NAS")} />
          <Group name="Voice" items={sources.filter((i) => i.group === "Voice")} />
        </div>
      )}
      <span className="spacer" />
      {info.keys.length > 0 && <span className="sb-keys">{info.keys.map(([k, t]) => <span key={k}><kbd>{k}</kbd>{t}</span>)}</span>}
      <button type="button" className="sb-cmd" onClick={onCommand} title="打开命令面板"><kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>命令</button>
      <span className="sb-host" title="当前运行的版本（提交号）">{__APP_VERSION__}</span>
    </footer>
  );
}
