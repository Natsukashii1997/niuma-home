import { useState } from "react";
import { apiSend, useApi } from "../../api.js";
import { Button, Tag } from "../../ui/components.jsx";
import { currentMonth, LINES, monthLabel } from "../../constants.js";

const defaultTypes = ["海报", "朋友圈图", "社群海报", "落地页", "其他"];
function configuredTypes(value) {
  try {
    const items = JSON.parse(value);
    if (Array.isArray(items) && items.every((item) => typeof item === "string")) {
      const types = [...new Set(items.map((item) => item.trim()).filter(Boolean))];
      if (types.length) return types;
    }
  } catch { /* 未配置或损坏时使用默认类型。 */ }
  return defaultTypes;
}

export function MaterialSummary({ value }) {
  return <div className="material-summary">
    <strong>{value.name}</strong><div className="tag-row"><Tag>{monthLabel(value.month)}</Tag><Tag>{value.line}</Tag><Tag tone="blue">{value.type}</Tag></div>
    <p>关联 SKU：{value.skus.join("、") || "未关联"}</p>
    <p className="pre">备注：{value.note || "无"}</p>
  </div>;
}

export default function MaterialEditor({ item, write, disabled, onSaved, onCancel }) {
  const settings = useApi("/api/settings");
  const promos = useApi("/api/promos");
  const types = configuredTypes(settings.data?.material_types);
  const [draft, setDraft] = useState(item ? { month: item.month, line: item.line, name: item.name, type: item.type, skus: item.skus, note: item.note }
    : { month: currentMonth(), line: LINES[0], name: "", type: "", skus: [], note: "" });
  const [preview, setPreview] = useState(null);
  const value = { ...draft, type: draft.type || types[0] };
  const available = [...new Set((promos.data || []).filter((p) => p.month === value.month && p.line === value.line).map((p) => p.sku))];
  const stale = value.skus.filter((sku) => !available.includes(sku));
  const update = (key, next) => setDraft((old) => ({ ...old, [key]: next, ...(["month", "line"].includes(key) ? { skus: [] } : {}) }));
  const save = () => write(async (refresh) => {
    const saved = await apiSend(item ? "PATCH" : "POST", item ? `/api/materials/${item.id}` : "/api/materials", preview);
    const current = (await refresh()).find((row) => row.id === saved.id);
    if (!current || Object.keys(preview).some((key) => JSON.stringify(preview[key]) !== JSON.stringify(current[key]))) throw new Error("保存后的字段回读不一致");
    onSaved(current);
  });
  return preview ? <div className="stack">
    <h3 className="section-title">{item ? "保存修改预览" : "新建物料预览"}</h3>
    <MaterialSummary value={preview} />
    <div className="row"><Button disabled={disabled} onClick={() => setPreview(null)}>返回修改</Button><Button variant="primary" disabled={disabled} onClick={save}>{item ? "确认保存修改" : "确认新建物料"}</Button></div>
  </div> : <form className="stack" onSubmit={(event) => { event.preventDefault(); setPreview({ ...value, name: value.name.trim(), type: value.type.trim() }); }}>
    <fieldset className="material-fields" disabled={disabled || settings.loading || promos.loading || !!promos.error}>
      <div className="grid-2">
        <label className="material-field">月份<input type="month" value={value.month} required onChange={(event) => update("month", event.target.value)} /></label>
        <label className="material-field">业务线<select value={value.line} onChange={(event) => update("line", event.target.value)}>{LINES.map((line) => <option key={line}>{line}</option>)}</select></label>
        <label className="material-field">物料名称<input value={value.name} required pattern=".*\S.*" onChange={(event) => update("name", event.target.value)} /></label>
        <label className="material-field">物料类型<select value={value.type} onChange={(event) => update("type", event.target.value)}>{[...new Set([...types, ...(item ? [item.type] : [])])].map((type) => <option key={type}>{type}</option>)}</select></label>
      </div>
      <fieldset className="material-skus"><legend>关联 SKU（可多选，可不选）</legend>
        {available.length ? available.map((sku) => <label key={sku}><input type="checkbox" checked={value.skus.includes(sku)} onChange={(event) => update("skus", event.target.checked ? [...value.skus, sku] : value.skus.filter((s) => s !== sku))} />{sku}</label>) : <span className="muted small">该月该业务线暂无促销 SKU，可直接保存。</span>}
        {!!stale.length && <div className="warn">原关联已不在促销表：{stale.join("、")}<Button type="button" onClick={() => update("skus", value.skus.filter((sku) => available.includes(sku)))}>移除失效关联</Button></div>}
      </fieldset>
      <label className="material-field">备注<textarea rows={3} value={value.note} onChange={(event) => update("note", event.target.value)} /></label>
    </fieldset>
    {settings.error && <p className="muted small">配置读取失败，暂用默认物料类型。</p>}
    {promos.error && <p role="alert" className="error">促销 SKU 读取失败，请关闭后重新打开：{promos.error}</p>}
    <div className="row"><Button type="button" disabled={disabled} onClick={onCancel}>取消</Button><Button variant="primary" type="submit" disabled={disabled || settings.loading || promos.loading || !!promos.error || !!stale.length}>预览物料</Button></div>
  </form>;
}
