import { useEffect, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { Loadable, Modal, SampleBadge, Tag } from "../../ui/components.jsx";

// Codex 重置预警（v3）：窗口条下方一行 + 首页大卡；有新信号时高亮。数据源 aihot.news。
// 两种状态（用户 2026-10-18）：
//   等待重置 —— 上次重置日期 + Tibo 原话中译 + 发布月日时分 + 距离重置大约还有多久；
//   已重置   —— 上次重置日期 + 距上次重置过去几天几时 + 下次重置时间未公开。
// 只写 Tibo 的发布时间，不写检查时间。定时检查和推送未启用，只在详情里照实写。
const STAGE_TONE = { 预告: "blue", 确认: "green", 修正: "amber", 撤回: "red" };

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  return now;
}
const split = (ms) => { const m = Math.floor(Math.max(0, ms) / 60000); return { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60), mi: m % 60 }; };
const pad = (n) => String(n).padStart(2, "0");
const dhm = ({ d, h, mi }) => `${d ? `${d} 天 ` : ""}${h} 小时 ${mi} 分`;

// 页面统一用的状态；旧接口没有 reset 字段时按「未知」处理。
function resetOf(c, now) {
  const r = c.reset || { state: "unknown", lastReset: "", announce: null };
  const a = r.announce;
  const eta = a?.eta ? Date.parse(a.eta) : null;
  return {
    ...r,
    sinceMs: r.lastResetAt ? now - Date.parse(r.lastResetAt) : null,
    leftMs: eta != null ? eta - now : null,
    // 时间说明：有预计时间就倒数；过了预计时间还没确认，照实写；没给时间就说没给。
    timeNote: !a ? "" : eta == null ? "Tibo 没说具体时间" : eta <= now ? `已过预计时间（${a.etaLabel || "北京时间"}），等待确认` : `距离重置还有大约 ${dhm(split(eta - now))}${a.etaInferred ? "（推算）" : ""}`,
  };
}

function CodexDetail({ c }) {
  return (
    <div className="codex-detail">
      <dl className="kv">
        <dt>数据源</dt><dd className="mono small">aihot.news/api/v1/codex-resets/recent</dd>
        <dt>上次重置</dt><dd>{c.reset?.lastReset || "数据源里没有已确认的重置"}</dd>
        <dt>读取</dt><dd>{c.nextCheck ? `下次检查 ${c.nextCheck}` : "定时检查未启用：打开工作台时读取一次"}</dd>
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
  const now = useNow();
  const c = state.data;
  if (!c) return null;
  const r = resetOf(c, now);
  const last = r.lastReset ? `上次重置 ${r.lastReset}` : "上次重置未知";
  return (
    <>
      <button type="button" className={`codex-strip${c.isNew ? " is-new" : ""}`} onClick={() => setOpen(true)}>
        <PixelIcon name="alert" />
        <span className="codex-stage">Codex 重置 · {r.state === "pending" ? "等待重置" : r.state === "done" ? "已重置" : "暂无信号"}</span>
        <span className="codex-when">{last}</span>
        {r.state === "pending" && <>
          <span className="codex-quote">Tibo：“{r.announce.zh || r.announce.quote}”</span>
          <span className="codex-when tnum">发布 {r.announce.posted}</span>
          <span className="codex-cd tnum">{r.timeNote}</span>
        </>}
        {r.state === "done" && <>
          <span className="codex-cd tnum">已过去 {dhm(split(r.sinceMs))}</span>
          <span className="codex-quote">下次重置时间未公开</span>
        </>}
        {state.isSample && <SampleBadge task={state.task} />}
        <span className="codex-more">详情<PixelIcon name="right" /></span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} icon="alert" title="Codex 重置预警 · 历史与规则"><CodexDetail c={c} /></Modal>
    </>
  );
}

function Blocks({ ms, unknown, label }) {
  const t = split(ms || 0);
  const cell = (v, u) => <span><b>{unknown ? "--" : pad(v)}</b><em>{u}</em></span>;
  return <div className={`countdown${unknown ? " is-unknown" : ""}`} aria-label={label}>{cell(t.d, "DAYS")}<i>:</i>{cell(t.h, "HRS")}<i>:</i>{cell(t.mi, "MIN")}</div>;
}

// 首页大卡：左边 Tibo 原帖 + 中译 + 发布时间（等待重置）或「已重置」说明；右边倒计时 / 已过去时长。
export function CodexCard({ className = "" }) {
  const state = useApi("/api/v3/codex-reset");
  const [open, setOpen] = useState(false);
  const now = useNow();
  const c = state.data;
  if (!c) return (
    <section className={`card ${className}`}>
      <div className="card-head"><h2><PixelIcon name="alert" /> Codex 重置预警</h2></div>
      <div className="card-body"><Loadable state={state} name="Codex 重置预警">{() => null}</Loadable></div>
    </section>
  );
  const r = resetOf(c, now), a = r.announce;
  return (
    <section className={`card ${className}`} data-dither="">
      <div className="card-head">
        <h2><PixelIcon name="alert" /> Codex 重置预警</h2>
        <div className="card-extra">
          {state.isSample && <SampleBadge task={state.task} />}
          {r.state === "pending" && <Tag tone="blue">等待重置</Tag>}
          <button type="button" className="link-btn" onClick={() => setOpen(true)}>历史与规则<PixelIcon name="right" /></button>
        </div>
      </div>
      <div className="codex-card">
        <div className="codex-main">
          <div className="codex-meta label"><span>上次额度重置 · {r.lastReset || "未知"}</span>{a && <span>TIBO · 发布 {a.posted}</span>}</div>
          {r.state === "pending" ? <>
            <p className="codex-zh codex-zh-lead">{a.zh || a.quote}</p>
            {a.zh && <blockquote className="codex-src">“{a.quote}”</blockquote>}
            <div className="codex-foot"><span className="label">{r.timeNote}</span></div>
          </> : r.state === "done" ? <>
            <p className="codex-done">已重置</p>
            <p className="codex-zh">距离上次重置已经过去 {dhm(split(r.sinceMs))}，下次重置时间未公开。</p>
          </> : <p className="codex-zh">数据源里还没有重置记录。</p>}
        </div>
        <div className="codex-count">
          {r.state === "pending" ? <>
            <span className="label">预计重置 · 北京时间</span>
            <strong>{a.etaLabel ? a.etaLabel.replace(/^北京时间\s*/, "") : "Tibo 没说具体时间"}</strong>
            {r.leftMs != null && r.leftMs <= 0 ? <span className="codex-past">已过预计时间，等待确认</span>
              : <Blocks ms={r.leftMs} unknown={r.leftMs == null} label={r.leftMs == null ? "没有预计时间，不倒计时" : `剩 ${dhm(split(r.leftMs))}`} />}
            <span className="small muted">{r.leftMs == null ? "没有预计时间，不倒计时" : a.etaInferred ? "按 Tibo 原话推算" : "按 Tibo 原话换算成北京时间"}</span>
          </> : <>
            <span className="label">上次重置 · 北京时间</span>
            <strong>{r.lastReset || "--"}</strong>
            <Blocks ms={r.sinceMs} unknown={r.sinceMs == null} label={r.sinceMs == null ? "上次重置时间未知" : `已过去 ${dhm(split(r.sinceMs))}`} />
            <span className="small muted">已过去的时长 · 下次重置时间未公开</span>
          </>}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} icon="alert" title="Codex 重置预警 · 历史与规则"><CodexDetail c={c} /></Modal>
    </section>
  );
}
