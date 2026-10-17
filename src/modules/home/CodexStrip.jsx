import { useEffect, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { Loadable, Modal, SampleBadge, Tag } from "../../ui/components.jsx";

// Codex 重置预警（v3）：窗口条下方一行 + 首页大卡；有新信号时高亮。数据源 aihot.news。
// 定时检查和机械邪龙兽推送目前都没启用（nextCheck 为 null、pushed 为 false）：页面照实写「未启用」，不写成已经在跑；下次重置时间未公布时写「未知」，不显示倒计时。
const STAGES = ["预告", "确认", "修正", "撤回"];
const STAGE_TONE = { 预告: "blue", 确认: "green", 修正: "amber", 撤回: "red" };

function useCountdown(target) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, new Date(target) - now);
  const m = Math.floor(ms / 60000);
  return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), mi: m % 60, past: ms === 0 };
}

const pad = (n) => String(n).padStart(2, "0");

function CodexDetail({ c }) {
  return (
    <div className="codex-detail">
      <dl className="kv">
        <dt>数据源</dt><dd className="mono small">aihot.news/api/v1/codex-resets/recent</dd>
        <dt>检查</dt><dd>{c.nextCheck ? `下次检查 ${c.nextCheck}` : "定时检查未启用：打开工作台时读取一次"}；上次检查 {c.checked}</dd>
        <dt>推送</dt><dd>{c.pushed ? "机械邪龙兽已推送这一条" : "推送未启用，没有推送记录"}</dd>
        <dt>失效</dt><dd>数据源读取失败时，这里显示失败原因和上次成功检查的时间</dd>
      </dl>
      <div className="label">最近帖子 · 北京时间</div>
      <ul className="list">{[{ stage: c.stage, time: c.posted, text: c.quote }, ...c.history].map((h) => <li key={h.time}><span className="tnum small muted">{h.time}</span><Tag tone={STAGE_TONE[h.stage]}>{h.stage}</Tag><span className="mono small">{h.text}</span></li>)}</ul>
    </div>
  );
}

export function CodexStrip() {
  const state = useApi("/api/v3/codex-reset");
  const [open, setOpen] = useState(false);
  const c = state.data;
  const cd = useCountdown(c?.next || 0);
  if (!c) return null;
  return (
    <>
      <button type="button" className={`codex-strip${c.isNew ? " is-new" : ""}`} onClick={() => setOpen(true)}>
        <PixelIcon name="alert" />
        <span className="codex-stage">Codex 重置 · {c.stage}</span>
        <span className="codex-when">{c.label}</span>
        {c.next && <span className={`codex-cd tnum${cd.past ? " is-past" : ""}`}>{cd.past ? "已到重置时间" : `剩 ${cd.d} 天 ${cd.h} 小时 ${cd.mi} 分`}</span>}
        <span className="codex-quote">“{c.quote}”</span>
        {state.isSample && <SampleBadge task={state.task} />}
        <span className="codex-more">详情<PixelIcon name="right" /></span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} icon="alert" title="Codex 重置预警 · 历史与规则"><CodexDetail c={c} /></Modal>
    </>
  );
}

// 首页大卡：左边原帖 + 中译 + 阶段，右边北京时间倒计时。
export function CodexCard({ className = "" }) {
  const state = useApi("/api/v3/codex-reset");
  const [open, setOpen] = useState(false);
  const c = state.data;
  const cd = useCountdown(c?.next || 0);
  if (!c) return (
    <section className={`card ${className}`}>
      <div className="card-head"><h2><PixelIcon name="alert" /> Codex 重置预警</h2></div>
      <div className="card-body"><Loadable state={state} name="Codex 重置预警">{() => null}</Loadable></div>
    </section>
  );
  const nextCheck = c.nextCheck && !/未安排/.test(c.nextCheck) ? c.nextCheck : null;
  return (
    <section className={`card ${className}`}>
      <div className="card-head">
        <h2><PixelIcon name="alert" /> Codex 重置预警</h2>
        <div className="card-extra">
          {state.isSample && <SampleBadge task={state.task} />}
          <Tag tone={STAGE_TONE[c.stage]}>{c.stage}</Tag>
          <button type="button" className="link-btn" onClick={() => setOpen(true)}>历史与规则<PixelIcon name="right" /></button>
        </div>
      </div>
      <div className="codex-card">
        <div className="codex-main">
          <div className="codex-meta label"><span>TIBO · @{c.author}</span><span>发布 {c.posted} · 检查 {c.checked}</span></div>
          <blockquote className="codex-src">“{c.quote}”</blockquote>
          <p className="codex-zh">{c.quoteZh}</p>
          <div className="codex-foot">
            <span className="codex-stages">{STAGES.map((s) => <Tag key={s} tone={s === c.stage ? "ink" : "neutral"}>{s}</Tag>)}</span>
            <span className="label">{nextCheck ? `下次检查 ${nextCheck}` : "定时检查未启用"} · {c.pushed ? "已推送" : "推送未启用"}</span>
          </div>
        </div>
        <div className="codex-count">
          <span className="label">下次重置 · 北京时间</span>
          <strong>{c.label.replace(/^北京时间\s*/, "")}</strong>
          {!c.next ? <span className="small muted">时间未知：官方还没公布，不显示倒计时</span> : cd.past ? <span className="codex-past">已到重置时间</span> : (
            <div className="countdown" aria-label={`剩 ${cd.d} 天 ${cd.h} 小时 ${cd.mi} 分`}>
              <span><b>{pad(cd.d)}</b><em>DAYS</em></span><i>:</i>
              <span><b>{pad(cd.h)}</b><em>HRS</em></span><i>:</i>
              <span><b>{pad(cd.mi)}</b><em>MIN</em></span>
            </div>
          )}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} icon="alert" title="Codex 重置预警 · 历史与规则"><CodexDetail c={c} /></Modal>
    </section>
  );
}
