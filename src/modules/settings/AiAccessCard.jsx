import { useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button, Card, Loadable, Segmented, Tag } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { beijingTime } from "../../constants.js";

// 设置 · AI 接入（全局规则 P-13，常浩 2026-11-20 选定 A 版「一张总表」）：执行方状态与默认切换、功能清单、对外开放、数据对象。
// 数据来自 GET /api/v3/ai-access（出处 server/ai-executor.mjs）；改默认执行方、功能执行方与备用方都走预览 → 确认 → 回读。
const PATH = "/api/v3/ai-access";
const BAD = ["未安装", "未登录", "额度用尽", "调用失败"];
const tone = (state) => (state === "可用" ? "green" : BAD.includes(state) ? "red" : "neutral");
const NAMES = { codex: "Codex", claude: "Claude" };
const parseFeatures = (raw) => { try { const v = JSON.parse(raw || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; } };

export function AiAccessCard() {
  const state = useApi(PATH);
  const [fresh, setFresh] = useState(null);
  const [checking, setChecking] = useState(false);
  const [open, setOpen] = useState(null); // 正在编辑的功能 id
  const data = fresh || state.data;
  const reread = async () => { const back = await apiSend("GET", PATH); setFresh(back); return back; };
  async function recheck() {
    setChecking(true);
    try { setFresh(await apiSend("GET", `${PATH}?refresh=1`)); } finally { setChecking(false); }
  }
  const head = data && <span className="set-count"><span className="muted">谁来产出、怎么接、读什么、写到哪</span>{data.features.length + data.fixed.length} 个功能 · 最近检查 <span className="tnum">{beijingTime(data.checkedAt)}</span></span>;
  return (
    <Card className="aia" title={<><PixelIcon name="agent" />AI 接入</>} extra={<>{head}<Button onClick={recheck} disabled={checking || !data}><PixelIcon name="refresh" />{checking ? "检查中…" : "重新检查"}</Button></>}>
      <Loadable state={{ ...state, data }} name="AI 接入">{(d) => <>
        <Executors data={d} onSaved={setFresh} reread={reread} />
        <div className="aia-sub"><span className="label">功能清单</span><span className="small muted">改执行方或备用方：点「编辑」→ 预览 → 确认；下一次调用生效，正在跑的照旧跑完</span></div>
        <div className="table-wrap"><table className="grid compact aia-grid">
          <thead><tr><th>功能</th><th>执行方</th><th>备用执行方</th><th>接入方式</th><th>读哪些数据</th><th>产出写到哪里</th><th>最近一次产出</th><th /></tr></thead>
          <tbody>
            {d.features.map((f) => <FeatureRows key={f.id} f={f} data={d} open={open === f.id} onToggle={() => setOpen(open === f.id ? null : f.id)} onSaved={setFresh} reread={reread} />)}
            {d.fixed.map((f) => <tr key={f.id}>
              <td><b>{f.name}</b><div className="small muted">{f.where}</div></td>
              <td><Tag tone="amber">{f.only}</Tag><div className="small muted">{f.reason}</div></td>
              <td>—</td><td>{f.access}</td><td>{f.read}</td><td>{f.write}</td><td className="muted">见 {f.where}</td><td />
            </tr>)}
          </tbody>
        </table></div>
        <div className="aia-2col">
          <div>{d.openings.map((o) => <div key={o.id}>
            <div className="aia-sub"><span className="label">对外开放</span><Tag tone={o.agents.length ? "blue" : "neutral"}>{o.agents.length ? "开着" : "没有凭据，连不进来"}</Tag></div>
            <table className="grid compact aia-kvt"><tbody>
              <tr><th>接口</th><td>{o.name}（{o.access}）</td></tr>
              <tr><th>对谁</th><td>{o.who}</td></tr>
              <tr><th>能读</th><td>{o.read}</td></tr>
              <tr><th>能写</th><td>{o.write}</td></tr>
              <tr><th>已发凭据</th><td>{o.agents.length ? o.agents.map((a) => <div key={a.agent}>{a.agent} · {a.tools.length} 个工具 · 最近调用 <span className="tnum">{a.lastCallAt ? beijingTime(a.lastCallAt) : "还没有"}</span></div>) : <span className="muted">还没有签发</span>}</td></tr>
              <tr><th>怎么关</th><td>{o.off}</td></tr>
            </tbody></table>
          </div>)}</div>
          <div>
            <div className="aia-sub"><span className="label">数据对象</span><span className="small muted">只展示或采集，不算执行方，不参与切换</span></div>
            <table className="grid compact aia-data"><thead><tr><th>名称</th><th>用在哪</th><th>来源</th></tr></thead>
              <tbody>{d.dataObjects.map((o) => <tr key={o.id}><td><b>{o.name}</b></td><td>{o.where}</td><td>{o.source}</td></tr>)}</tbody></table>
          </div>
        </div>
      </>}</Loadable>
    </Card>
  );
}

function Executors({ data, onSaved, reread }) {
  const flow = useWriteFlow();
  const current = data.defaultExecutor, def = data.executors.find((e) => e.id === current);
  const followers = data.features.filter((f) => f.followsDefault).map((f) => f.name);
  const preview = (value) => { if (value !== current) flow.preview(() => apiSend("POST", "/api/settings/ai_default_executor/preview", { value })); };
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", "/api/settings/ai_default_executor", { previewId: pv.previewId, confirm: true }),
    async (_receipt, pv) => { const back = await reread(); const ok = back.defaultExecutor === pv.value && back.saved.ai_default_executor === pv.value; if (ok) onSaved(back); return ok; },
  );
  const locked = flow.busy || flow.phase === "unknown";
  return <>
    <div className="aia-sub"><span className="label">执行方</span><span className="aia-def"><span className="small muted">默认执行方</span>
      <Segmented options={[["codex", "Codex"], ["claude", "Claude"]]} value={flow.pv?.value || current} onChange={(v) => { if (!locked) preview(v); }} /></span></div>
    {def && BAD.includes(def.state) && <p className="risk-text small aia-warn">默认执行方 {def.name} 现在{def.state}：跟随默认、又没设备用方的功能会直接报错，不会自动换另一家。</p>}
    <WriteBox flow={flow} title="默认执行方 · 保存预览" savedText="已切换默认执行方，回读一致" onConfirm={confirm} onRepreview={() => preview(flow.pv?.value)} onReread={async () => { onSaved(await reread()); flow.resolve(); }}>
      {(pv) => <dl className="kv"><dt>原值</dt><dd>{NAMES[pv.before] || "Codex（默认）"}</dd><dt>新值</dt><dd><code className="diff-new">{NAMES[pv.value]}</code></dd>
        <dt>影响</dt><dd>{followers.length ? `跟随默认的功能下一次改由 ${NAMES[pv.value]} 产出：${followers.join("、")}` : "没有跟随默认的功能"}；正在跑的按原执行方跑完，不用重启。</dd>
        <dt>写到哪里</dt><dd>工作台本地配置</dd></dl>}
    </WriteBox>
    <div className="aia-ex3">{data.executors.map((e) => <div key={e.id} className={e.id === current ? "aia-ex is-def" : "aia-ex"}>
      <div className="aia-ex-top"><b>{e.name}</b>{e.id === current ? <Tag tone="ink">默认</Tag> : e.fixed ? <Tag tone="frame">不参与切换</Tag> : null}<Tag tone={tone(e.state)}>{e.state}</Tag></div>
      <dl className="aia-kv">
        <dt className="label">接入</dt><dd>{e.access}{e.version ? ` · ${e.version}` : ""}</dd>
        <dt className="label">登录</dt><dd>{e.login || "—"}</dd>
        <dt className="label">模型</dt><dd>{e.model || "—"}</dd>
        {e.stateAt && <><dt className="label">额度</dt><dd className="risk-text">最近一次调用报额度用尽（<span className="tnum">{beijingTime(e.stateAt)}</span>）</dd></>}
      </dl>
    </div>)}</div>
  </>;
}

function lastText(last) {
  if (!last) return <span className="muted">还没有调用记录</span>;
  const when = <span className="tnum">{beijingTime(last.at)}</span>;
  if (!last.ok) return <span className="risk-text">失败：{(last.attempts || []).map((a) => `${NAMES[a.executor] || a.executor}${a.reason}`).join("，转交后")} · {when}</span>;
  return <>{NAMES[last.executor] || last.executor}{last.model ? ` · ${last.model}` : ""} · {when}{last.handoff && <div className="warn-text small">原定 {NAMES[last.handoff.from]}，{last.handoff.reason}，已转交</div>}</>;
}

function FeatureRows({ f, data, open, onToggle, onSaved, reread }) {
  const flow = useWriteFlow();
  const saved = parseFeatures(data.saved.ai_features);
  const own = saved[f.id] || {};
  const [executor, setExecutor] = useState(own.executor || "default");
  const [backup, setBackup] = useState(own.backup || "none");
  const effective = executor === "default" ? data.defaultExecutor : executor;
  const next = () => {
    const all = { ...saved };
    if (executor === "default" && backup === "none") delete all[f.id]; else all[f.id] = { executor, backup };
    return JSON.stringify(all);
  };
  const preview = () => flow.preview(() => apiSend("POST", "/api/settings/ai_features/preview", { value: next() }));
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", "/api/settings/ai_features", { previewId: pv.previewId, confirm: true }),
    async (_receipt, pv) => { const back = await reread(); const ok = (back.saved.ai_features ?? "{}") === pv.value; if (ok) onSaved(back); return ok; },
  );
  const locked = flow.busy || flow.phase === "unknown";
  const pick = (setter) => (v) => { if (!locked) { setter(v); flow.reset(); } };
  const describe = (raw) => { const o = parseFeatures(raw)[f.id]; return o ? `${o.executor === "default" ? "跟随默认" : NAMES[o.executor]} · 备用 ${o.backup === "none" ? "不设" : NAMES[o.backup]}` : "跟随默认 · 备用 不设"; };
  return <>
    <tr className={open ? "is-open" : ""}>
      <td><b>{f.name}</b><div className="small muted">{f.where}</div></td>
      <td>{f.followsDefault ? `跟随默认 · ${f.executorName}` : f.executorName}</td>
      <td>{f.backupName || "不设"}</td>
      <td>{f.access}</td><td>{f.read}</td><td>{f.write}</td>
      <td>{lastText(f.last)}</td>
      <td><Button onClick={onToggle} disabled={locked}><PixelIcon name={open ? "up" : "edit"} />{open ? "收起" : "编辑"}</Button></td>
    </tr>
    {open && <tr className="aia-edit"><td colSpan={8}>
      <div className="aia-pick"><span className="label">执行方</span><Segmented options={[["default", `跟随默认（${NAMES[data.defaultExecutor]}）`], ["codex", "Codex"], ["claude", "Claude"]]} value={executor} onChange={pick((v) => { setExecutor(v); if ((v === "default" ? data.defaultExecutor : v) === backup) setBackup("none"); })} /></div>
      <div className="aia-pick"><span className="label">备用执行方</span><Segmented options={[["none", "不设"], ...["codex", "claude"].filter((id) => id !== effective).map((id) => [id, NAMES[id]])]} value={backup} onChange={pick(setBackup)} />
        <span className="small muted">只在 {NAMES[effective]} 未安装、未登录、额度用尽或调用失败时转交一次；不设就直接报错并指向这里</span></div>
      <div className="aia-pick"><Button variant="primary" onClick={preview} disabled={locked || next() === (data.saved.ai_features ?? "{}")}><PixelIcon name="eye" />保存预览</Button></div>
      <WriteBox flow={flow} title={`${f.name} · 保存预览`} savedText="已保存，回读一致" onConfirm={confirm} onRepreview={preview} onReread={async () => { onSaved(await reread()); flow.resolve(); }}>
        {(pv) => <dl className="kv"><dt>原值</dt><dd>{describe(pv.before)}</dd><dt>新值</dt><dd><code className="diff-new">{describe(pv.value)}</code></dd>
          <dt>之后</dt><dd>下一次「{f.name}」由 {NAMES[effective]} 产出{backup !== "none" ? `；它不可用时转交 ${NAMES[backup]} 一次，留痕写明原因` : "；它不可用时直接报错，不换另一家"}。</dd>
          <dt>写到哪里</dt><dd>工作台本地配置</dd></dl>}
      </WriteBox>
    </td></tr>}
  </>;
}
