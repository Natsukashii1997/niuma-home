import { useEffect, useRef, useState } from "react";
import { apiSend, useApi } from "../../api.js";
import { Button, Card, Loadable, PageHeader, Tag } from "../../ui/components.jsx";

const fields = [
  { key: "brand_base_url", label: "品牌多维表格链接", hint: "用于品牌页的「在飞书打开」入口。", placeholder: "https://你的团队.feishu.cn/base/…" },
  { key: "report_doc_url", label: "日报文档链接", hint: "保存日报来源链接，文档读取将在日报功能中接入。", placeholder: "https://你的团队.feishu.cn/docx/…" },
  { key: "weekly_doc_url", label: "周报文档链接（可选）", hint: "不填时，从日报文档中识别周报。", placeholder: "https://你的团队.feishu.cn/docx/…" },
  { key: "material_types", label: "物料类型清单", hint: "每行一个类型；预览时自动去掉空行、首尾空白和重复项。", placeholder: "海报\n朋友圈图\n社群海报\n落地页\n其他" },
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
  const [dailyRevision, setDailyRevision] = useState(0);
  const [dailyPending, setDailyPending] = useState(false);
  const onDailyState = pending => { setDailyPending(pending); setDailyRevision(value => value + 1); };
  return <>
    <PageHeader title="设置" subtitle="品牌链接、日报周报来源与物料类型；每项单独预览、确认保存" />
    <Loadable state={state}>{(settings) => <div className="settings-page stack">
      {fields.map((field) => <SettingForm key={field.key} field={field} initialValue={settings[field.key] || ""}
        dailyRevision={dailyRevision} dailyPending={dailyPending} onDailyState={onDailyState} />)}
    </div>}</Loadable>
  </>;
}

function SettingForm({ field, initialValue, dailyRevision, dailyPending, onDailyState }) {
  const { key, label, hint, placeholder } = field;
  const [saved, setSaved] = useState(initialValue);
  const [draft, setDraft] = useState(() => displayValue(key, initialValue));
  const [preview, setPreview] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
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
  const changed = (event) => { setDraft(event.target.value); setPreview(null); setSourcePreview(null); setError(""); setNotice(""); };
  const previewDraft = async (event) => {
    event.preventDefault(); setNotice(""); setError("");
    if (lock.current || uncertain || sourceBlocked) return;
    if (key === "weekly_doc_url") {
      setPreview(null); setSourcePreview(null);
      if (draft === "") { setPreview(""); return; }
      lock.current = true; setBusy(true);
      const version = previewVersion.current;
      try {
        const result = await apiSend("POST", "/api/reports/source-preview", { role: "weekly", url: draft });
        if (!result || !Number.isInteger(result.count) || !Array.isArray(result.unrecognized)) throw new Error("试读结果无效，请重试");
        if (version === previewVersion.current) { setSourcePreview(result); setPreview(draft); }
      } catch (error) { if (version === previewVersion.current) setError(error.message); }
      finally { lock.current = false; setBusy(false); }
      return;
    }
    try { setPreview(previewValue(key, draft)); } catch (error) { setPreview(null); setError(error.message); }
  };
  return <Card title={label} extra={<Tag tone={saved ? "green" : "neutral"}>{saved ? "已配置" : "未配置"}</Tag>}>
    <form className="settings-form" aria-label={`${label}配置`} onSubmit={previewDraft}>
      <label className="settings-field" htmlFor={`setting-${key}`}>{label}</label>
      {key === "material_types"
        ? <textarea id={`setting-${key}`} value={draft} onChange={changed} rows={5} placeholder={placeholder} disabled={busy || uncertain} aria-describedby={`hint-${key}`} />
        : <input id={`setting-${key}`} type="text" inputMode="url" value={draft} onChange={changed} placeholder={placeholder} disabled={busy || uncertain} aria-describedby={`hint-${key}`} />}
      <p id={`hint-${key}`} className="muted small">{hint}</p>
      {key === "weekly_doc_url" && <Button type="button" disabled={busy || uncertain || sourceBlocked} onClick={() => {
        if (lock.current || uncertain || sourceBlocked) return;
        setDraft(""); setPreview(""); setSourcePreview(null); setError(""); setNotice("");
      }}>清空</Button>}
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
      <div className="settings-saved"><h3 className="section-title">已保存的值{uncertain ? "（上次读取，待核对）" : ""}</h3><pre className="pre">{saved ? displayValue(key, saved) : "尚未配置"}</pre></div>
    </form>
  </Card>;
}
