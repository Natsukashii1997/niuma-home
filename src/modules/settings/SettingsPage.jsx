import { useEffect, useRef, useState } from "react";
import { StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button, Card, Loadable, PageHeader, SampleBadge, Tag } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { PixelIcon } from "../../ui/bitmap.jsx";

const fields = [
  { key: "brand_base_url", label: "品牌多维表格链接", hint: "用于品牌页的「在飞书打开」入口。", placeholder: "https://你的团队.feishu.cn/base/…" },
  { key: "report_doc_url", label: "日报文档链接", hint: "日/周报页与首页从这份文档读取日报；未配置周报文档时，也从这里识别周报。", placeholder: "https://你的团队.feishu.cn/docx/…" },
  { key: "weekly_doc_url", label: "周报文档链接（可选）", hint: "不填时，从日报文档中识别周报。", placeholder: "https://你的团队.feishu.cn/docx/…" },
  { key: "material_types", label: "物料类型清单", hint: "每行一个类型；预览时自动去掉空行、首尾空白和重复项。", placeholder: "价格图\n试听海报\n选课海报\n活动海报\n朋友圈三宫格\n朋友圈九宫格" },
];

function displayValue(key, value) {
  if (key === "material_types") {
    try {
      const types = JSON.parse(value);
      if (Array.isArray(types) && types.every((type) => typeof type === "string")) return types.join("\n");
    } catch { /* 保留无法解析的旧值供用户核对。 */ }
  }
  return value;
}

function previewValue(key, draft) {
  if (key === "material_types") {
    const types = [...new Set(draft.split(/\r?\n/).map((type) => type.trim()).filter(Boolean))];
    if (!types.length) throw new Error("请至少填写一个物料类型");
    return JSON.stringify(types);
  }
  const value = draft.trim();
  let url;
  try { url = new URL(value); } catch { throw new Error("请输入有效的 HTTPS 飞书链接"); }
  const allowed = ["feishu.cn", "larksuite.com"].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  if (!/^https:\/\/[^/]/i.test(value) || /[\s\\]/.test(value) || url.protocol !== "https:" || !allowed || url.username || url.password) {
    throw new Error("链接须为 HTTPS 飞书域名（feishu.cn、larksuite.com 或其子域），且不能含账号或空白字符");
  }
  return value;
}

export default function SettingsPage() {
  const state = useApi("/api/settings");
  const v3 = useV3Settings();
  const [dailyRevision, setDailyRevision] = useState(0);
  const [dailyPending, setDailyPending] = useState(false);
  const onDailyState = pending => { setDailyPending(pending); setDailyRevision(value => value + 1); };
  const form = (settings, key) => { const field = fields.find((f) => f.key === key); return <SettingForm key={key} field={field} initialValue={settings[key] || ""} dailyRevision={dailyRevision} dailyPending={dailyPending} onDailyState={onDailyState} />; };
  return <>
    <PageHeader title="设置" subtitle="每项单独编辑、预览确认后保存并回读；飞书身份固定只读；演示口径标「示例」" />
    <Loadable state={state} name="设置" big>{(settings) => <div className="settings-page set-groups">
      <SetGroup title="数据源" icon="link">{form(settings, "report_doc_url")}{form(settings, "weekly_doc_url")}
        <V3Rows v3={v3} keys={["timeline_source", "project_base_url", "project_table_id", "kb_space_id", "mentor_sources"]} /></SetGroup>
      <SetGroup title="营销" icon="marketing">{form(settings, "material_types")}
        <V3Rows v3={v3} keys={["campaign_table_id", "price_sku_table_id", "price_floor_margin", "price_cost_per_hour"]} />
        <div className="set-row"><div className="set-row-head"><span className="set-label">NAS 物料目录</span><span className="set-value muted">暂缓接入（你会重新整理目录）；工作台不扫描、不挂载 NAS</span></div></div></SetGroup>
      <SetGroup title="飞书身份与预算" icon="send"><V3Rows v3={v3} keys={["lark_profile", "lark_app_id", "voice_budget"]} />
        <div className="set-row"><div className="set-row-head"><span className="set-label">机械邪龙兽推送</span><span className="set-value muted">未启用：不新增定时任务，不推送</span></div></div></SetGroup>
      <SetGroup title="入口" icon="brand">{form(settings, "brand_base_url")}</SetGroup>
    </div>}</Loadable>
  </>;
}

function SettingForm({ field, initialValue, dailyRevision, dailyPending, onDailyState }) {
  const { key, label, hint, placeholder } = field;
  const [saved, setSaved] = useState(initialValue);
  const [draft, setDraft] = useState(() => displayValue(key, initialValue));
  const [preview, setPreview] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const [trial, setTrial] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false);
  const previewVersion = useRef(0);
  const previousDaily = useRef(dailyRevision);
  const sourceBlocked = key === "weekly_doc_url" && dailyPending;
  useEffect(() => {
    if (key !== "weekly_doc_url" || previousDaily.current === dailyRevision) return;
    setTrial(null);
    previousDaily.current = dailyRevision; previewVersion.current++;
    setPreview(null); setSourcePreview(null); setNotice(dailyPending ? "日报来源正在保存或结果待核对，请先完成日报回读。" : "日报来源已核对，请重新预览周报链接。");
  }, [key, dailyRevision, dailyPending]);
  const readValue = async () => {
    const settings = await apiSend("GET", "/api/settings");
    if (!settings || Array.isArray(settings) || typeof settings !== "object" || (settings[key] !== undefined && typeof settings[key] !== "string")) throw new Error("配置回读内容无效");
    if (key === "weekly_doc_url" && settings[key] === "") throw new Error("周报来源清空后应删除配置键，请重新核对");
    return settings[key] || "";
  };
  const confirm = async () => {
    if (lock.current || uncertain || sourceBlocked || preview === null) return;
    lock.current = true; setBusy(true); setNotice(""); setError("");
    if (key === "report_doc_url") onDailyState(true);
    try {
      const result = await apiSend("PUT", `/api/settings/${key}`, { value: preview });
      const actual = await readValue();
      if (result?.key !== key || result.value !== preview || actual !== preview) throw new Error("保存值与回读结果不一致");
      if (key === "report_doc_url") onDailyState(false);
      setSaved(actual); setDraft(displayValue(key, actual)); setPreview(null); setNotice(`已保存${label}，并已回读核对。`);
    } catch (error) {
      setUncertain(true); setError(`${error.message}。保存结果尚未确认，请先重新读取配置核对。`);
    } finally { lock.current = false; setBusy(false); }
  };
  const reload = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    if (key === "report_doc_url") onDailyState(true);
    try {
      const actual = await readValue();
      if (key === "report_doc_url") onDailyState(false);
      setSaved(actual); setDraft(displayValue(key, actual)); setPreview(null); setUncertain(false); setError(""); setNotice("已重新读取当前配置，请核对下方已保存的值。");
    } catch (error) { setError(`重新读取失败：${error.message}。请稍后再次读取。`); }
    finally { lock.current = false; setBusy(false); }
  };
  const changed = (event) => { setTrial(null); setDraft(event.target.value); setPreview(null); setSourcePreview(null); setError(""); setNotice(""); };
  const previewDraft = async (event) => {
    event.preventDefault(); setNotice(""); setError("");
    if (lock.current || uncertain || sourceBlocked) return;
    if (key === "weekly_doc_url") {
      setPreview(null); setSourcePreview(null); setTrial(null);
      if (draft === "") { setPreview(""); return; }
      lock.current = true; setBusy(true);
      setTrial({});
      const version = previewVersion.current;
      try {
        const result = await apiSend("POST", "/api/reports/source-preview", { role: "weekly", url: draft });
        if (!result || !Number.isInteger(result.count) || !Array.isArray(result.unrecognized)) throw new Error("试读结果无效，请重试");
        if (version === previewVersion.current) { setSourcePreview(result); setPreview(draft); setTrial({ done: true }); }
      } catch (error) { if (version === previewVersion.current) { setError(error.message); setTrial({ error: error.message }); } }
      finally { lock.current = false; setBusy(false); }
      return;
    }
    try { setPreview(previewValue(key, draft)); } catch (error) { setPreview(null); setError(error.message); }
  };
  const [open, setOpen] = useState(false);
  const expanded = open || uncertain || busy || preview !== null;
  return <div className={`set-row${expanded ? " is-open" : ""}`}>
    <div className="set-row-head">
      <span className="set-label">{label}</span>
      <span className="set-value">{saved ? displayValue(key, saved).split("\n").join(" · ") : <span className="muted">尚未配置</span>}</span>
      <Tag tone={saved ? "green" : "neutral"}>{saved ? "已配置" : "未配置"}</Tag>
      <Button onClick={() => setOpen((v) => !v)} disabled={busy}><PixelIcon name={expanded ? "up" : "edit"} />{expanded ? "收起" : "编辑"}</Button>
    </div>
    {expanded && <form className="settings-form" aria-label={`${label}配置`} onSubmit={previewDraft}>
      <label className="settings-field" htmlFor={`setting-${key}`}>{label}</label>
      {key === "material_types"
        ? <textarea id={`setting-${key}`} value={draft} onChange={changed} rows={5} placeholder={placeholder} disabled={busy || uncertain} aria-describedby={`hint-${key}`} />
        : <input id={`setting-${key}`} type="text" inputMode="url" value={draft} onChange={changed} placeholder={placeholder} disabled={busy || uncertain} aria-describedby={`hint-${key}`} />}
      <p id={`hint-${key}`} className="muted small">{hint}</p>
      {key === "weekly_doc_url" && <Button type="button" disabled={busy || uncertain || sourceBlocked} onClick={() => {
        if (lock.current || uncertain || sourceBlocked) return;
        setTrial(null); setDraft(""); setPreview(""); setSourcePreview(null); setError(""); setNotice("");
      }}>清空</Button>}
      {trial && <StepProgress label="试读周报来源" {...trial} />}
      {error && <p className="error" role="alert">{error}</p>}
      {uncertain ? <Button type="button" disabled={busy} onClick={reload}>重新读取配置</Button> : preview !== null ? <div className="settings-preview">
        <h3 className="section-title">保存预览</h3><pre className="pre">{displayValue(key, preview)}</pre>
        {key === "weekly_doc_url" && (preview === "" ? <p>确认后将清空独立周报来源，改为从日报文档识别周报。</p> : sourcePreview && <div className="stack">
          <p>识别到 {sourcePreview.count} 篇周报 · {sourcePreview.unrecognized.length} 个标题未识别</p>
          {sourcePreview.latest && <p>最新：{sourcePreview.latest.title}（{sourcePreview.latest.date}）</p>}
          {sourcePreview.sameAsDaily && <p>与日报文档相同，将按单文档方式读取</p>}
        </div>)}
        <div className="row"><Button type="button" disabled={busy} onClick={() => setPreview(null)}>取消预览</Button><Button type="button" variant="primary" disabled={busy || sourceBlocked} onClick={confirm}>确认保存</Button></div>
      </div> : <Button type="submit" variant="primary" disabled={busy || sourceBlocked}>预览保存</Button>}
      <p className="small muted" role="status">{busy ? "正在处理，请稍候…" : notice}</p>
      {uncertain && <div className="settings-saved"><h3 className="section-title">已保存的值（上次读取，待核对）</h3><pre className="pre">{saved ? displayValue(key, saved) : "尚未配置"}</pre></div>}
    </form>}
    {!expanded && notice && <p className="small muted set-notice" role="status">{notice}</p>}
  </div>;
}

function SetGroup({ title, icon, children }) {
  return <Card title={<><PixelIcon name={icon} />{title}</>}><div className="set-rows">{children}</div></Card>;
}

// v3 新增的配置项：读 /api/v3/settings 的实际值；每项单独编辑 → 预览 → 确认保存 → 回读。
// 飞书 profile 和应用身份固定只读；毛利底线、课时成本还是演示口径，标「示例」直到你保存自己的值。
const V3_FIELDS = {
  timeline_source: { label: "用户时间线来源", hint: "飞书《2026海外大学时间线》：标题、表格 token、链接（JSON）", json: true },
  project_base_url: { label: "项目多维表格", hint: "AI管培工作台的多维表格链接" },
  project_table_id: { label: "项目推进数据表", hint: "以 tbl 开头" },
  kb_space_id: { label: "知识库空间", hint: "常浩的知识库的空间 ID（数字）" },
  mentor_sources: { label: "管培生日志来源", hint: "两位管培生：姓名、年份、日志文档链接（JSON）", json: true },
  campaign_table_id: { label: "营销战役模板表", hint: "以 tbl 开头" },
  price_sku_table_id: { label: "SKU 产品目录表", hint: "以 tbl 开头" },
  price_floor_margin: { label: "毛利底线", hint: "0 到 1 之间的小数，如 0.25" },
  price_cost_per_hour: { label: "课时成本（元）", hint: "每课时成本" },
  lark_profile: { label: "飞书 profile", hint: "固定为 codex，不能在这里切换" },
  lark_app_id: { label: "飞书应用（机械邪龙兽）", hint: "固定应用身份，不能在这里切换" },
  voice_budget: { label: "留学之声月预算上限（元）", hint: "0 到 10；当前免费试运行，模型和付费采集都没开" },
};
const pretty = (k, v) => { if (!V3_FIELDS[k]?.json) return v; try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; } };

function useV3Settings() {
  const state = useApi("/api/v3/settings");
  const [fresh, setFresh] = useState(null);
  return { state, data: fresh || state.data, setData: setFresh };
}

function V3Rows({ v3, keys }) {
  if (!v3.data) return <div className="set-row"><Loadable state={v3.state} name="工作台配置">{() => null}</Loadable></div>;
  return keys.map((k) => <V3SettingRow key={k} k={k} v3={v3} />);
}

function V3SettingRow({ k, v3 }) {
  const { values, saved, readonly, demoDefaults } = v3.data;
  const field = V3_FIELDS[k];
  const isReadonly = readonly.includes(k);
  const isDemo = demoDefaults.includes(k) && saved[k] === undefined;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => pretty(k, values[k] ?? ""));
  const flow = useWriteFlow();
  const preview = () => flow.preview(() => apiSend("POST", `/api/settings/${k}/preview`, { value: field.json ? draft.trim() : draft }));
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", `/api/settings/${k}`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => { const back = await apiSend("GET", "/api/v3/settings"); const ok = back.values[k] === pv.value && back.saved[k] === pv.value; if (ok) v3.setData(back); return ok; },
  );
  const reread = async () => { const back = await apiSend("GET", "/api/v3/settings"); flow.resolve(); v3.setData(back); };
  return (
    <div className="set-row">
      <div className="set-row-head">
        <span className="set-label">{field.label}</span>
        <span className={`set-value${field.json ? " is-json" : ""}`}>{field.json ? <code>{pretty(k, values[k] ?? "")}</code> : values[k] || "未设置"}{isDemo && <span className="warn-text small">（演示口径，待你确定）</span>}</span>
        {isReadonly ? <Tag>固定 · 只读</Tag> : isDemo ? <SampleBadge task="演示口径" /> : saved[k] !== undefined ? <Tag tone="green">已保存</Tag> : <Tag>默认值</Tag>}
        {!isReadonly && <Button onClick={() => { setOpen((o) => !o); flow.reset(); setDraft(pretty(k, values[k] ?? "")); }} disabled={flow.busy || flow.phase === "unknown"}><PixelIcon name="edit" />{open ? "收起" : "编辑"}</Button>}
      </div>
      {open && !isReadonly && (
        <div className="set-edit">
          <span className="small muted">{field.hint}</span>
          {field.json ? <textarea className="review-box" value={draft} onChange={(e) => { setDraft(e.target.value); flow.reset(); }} />
            : <input className="set-input" value={draft} onChange={(e) => { setDraft(e.target.value); flow.reset(); }} />}
          <div className="row"><span className="spacer" /><Button variant="primary" onClick={preview} disabled={!draft.trim() || flow.busy || flow.phase === "unknown"}><PixelIcon name="eye" />预览保存</Button></div>
          <WriteBox flow={flow} title={`${field.label} · 保存预览`} onConfirm={confirm} onRepreview={preview} onReread={reread}>
            {(pv) => <dl className="kv"><dt>原值</dt><dd><code className="diff-old">{pv.before ?? "（未保存，正在用默认值）"}</code></dd><dt>新值</dt><dd><code className="diff-new">{pv.value}</code></dd><dt>写到哪里</dt><dd>工作台本地配置；下次读取对应来源时生效</dd></dl>}
          </WriteBox>
        </div>
      )}
    </div>
  );
}
