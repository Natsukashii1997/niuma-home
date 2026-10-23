import { useEffect, useState } from "react";
import { StepProgress } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button, Card, Loadable, PageHeader, SampleBadge, StatStrip, Tag } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { PixelIcon } from "../../ui/bitmap.jsx";

const fields = [
  { key: "brand_base_url", label: "品牌多维表格链接", hint: "品牌页从这张表只读品牌数据（各版本表），也用于「在飞书打开」；留空读默认品牌表。", placeholder: "https://你的团队.feishu.cn/base/…" },
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

// 按用途分组：每组对应工作台里用到它的页面。item：old = 旧四键表单，v3 = 工作台配置，其余为专用行。
const GROUPS = [
  { id: "reports", title: "日报 · 周报", icon: "reports", use: "首页、日/周报页", items: [["old", "report_doc_url"], ["old", "weekly_doc_url"]] },
  { id: "project", title: "项目与用户", icon: "project", use: "项目页、用户页、管培生", items: [["v3", "project_base_url"], ["v3", "project_table_id"], ["v3", "timeline_source"], ["v3", "timeline_years"], ["v3", "mentor_sources"]] },
  { id: "kb", title: "知识库收藏", icon: "kb", use: "知识库页、Chrome 扩展", items: [["v3", "kb_space_id"], ["v3", "kb_collect_space"], ["rules"], ["pairing"]] },
  { id: "marketing", title: "营销与品牌", icon: "marketing", use: "营销页、品牌页、价格", items: [["old", "brand_base_url"], ["old", "material_types"], ["v3", "campaign_table_id"], ["v3", "price_sku_table_id"], ["v3", "price_floor_margin"], ["v3", "price_cost_per_hour"]] },
  { id: "push", title: "推送与预算", icon: "send", use: "机械邪龙兽、留学之声", items: [["push"], ["v3", "voice_budget"]] },
  { id: "fixed", title: "只读与暂缓", icon: "lock", use: "固定身份、暂缓接入", items: [["v3", "lark_profile"], ["v3", "lark_app_id"], ["nas"]] },
];
const ITEM_LABEL = { rules: "收藏规则", pairing: "扩展配对码", push: "机械邪龙兽推送", nas: "NAS 物料目录" };
const itemLabel = ([type, key]) => type === "old" ? fields.find((f) => f.key === key).label : type === "v3" ? V3_FIELDS[key].label : ITEM_LABEL[type];

// 行状态：ok 已保存/已配置，default 用默认值，demo 演示口径待确定，missing 未配置，fixed 只读/暂缓/未启用。
function itemStatus([type, key], settings, v3data) {
  if (type === "old") return settings[key] ? "ok" : "missing";
  if (type === "pairing") return "ok";
  if (type === "nas") return "fixed";
  if (!v3data) return "loading";
  const k = type === "rules" ? RULES_KEY : type === "push" ? PUSH_KEY : key;
  if (v3data.readonly.includes(k)) return "fixed";
  if (v3data.demoDefaults.includes(k) && v3data.saved[k] === undefined) return "demo";
  return v3data.saved[k] !== undefined ? "ok" : "default";
}

export default function SettingsPage() {
  const state = useApi("/api/settings");
  const v3 = useV3Settings();
  const [saved, setSaved] = useState({}); // 旧四键保存后的新值（回读一致后记在这里，StatStrip 和行头跟着变）
  const [dailyBusy, setDailyBusy] = useState(false); // 日报来源保存中或结果待核对：周报行先等
  const [dailyRevision, setDailyRevision] = useState(0); // 日报来源变了：周报行的旧预览作废
  const row = (settings, item) => {
    const [type, key] = item;
    if (type === "old") {
      return <LegacySettingRow key={key} field={fields.find((f) => f.key === key)} value={saved[key] ?? settings[key] ?? ""}
        dailyBusy={key === "weekly_doc_url" && dailyBusy} dailyRevision={key === "weekly_doc_url" ? dailyRevision : 0}
        onBusy={key === "report_doc_url" ? setDailyBusy : undefined}
        onSaved={(value) => { setSaved((old) => ({ ...old, [key]: value })); if (key === "report_doc_url") setDailyRevision((n) => n + 1); }} />;
    }
    if (type === "v3") return <V3Rows key={key} v3={v3} keys={[key]} />;
    if (type === "rules") return <CollectRulesRow key="rules" v3={v3} />;
    if (type === "pairing") return <PairingRow key="pairing" />;
    if (type === "push") return <PushRow key="push" v3={v3} />;
    return <div key="nas" className="set-row"><div className="set-row-head"><span className="set-label">NAS 物料目录</span><span className="set-value muted">/Volumes/跨部门综合资料/8.月度物料（Finder 用 SMB 挂载；工作台只读扫描、只存缩略图）</span><Tag>只读</Tag></div></div>;
  };
  return <>
    <PageHeader title="设置" subtitle="按用途分组；每项单独编辑、预览确认后保存并回读；飞书身份固定只读" />
    <Loadable state={state} name="设置" big>{(settings) => {
      const merged = { ...settings, ...saved };
      const groups = GROUPS.map((g) => ({ ...g, rows: g.items.map((item) => ({ item, label: itemLabel(item), status: itemStatus(item, merged, v3.data) })) }));
      const all = groups.flatMap((g) => g.rows);
      const count = (s) => all.filter((r) => r.status === s).length;
      const todo = all.filter((r) => r.status === "demo" || r.status === "missing");
      const cards = (list) => list.map((g) => <SetGroup key={g.id} title={g.title} icon={g.icon} extra={<GroupCount group={g} />}>{g.rows.map((r) => row(merged, r.item))}</SetGroup>);
      return <div className="settings-page set-groups">
        <StatStrip items={[
          { label: "已保存", value: count("ok"), tone: "ok", foot: "你保存过的值" },
          { label: "默认值", value: count("default"), foot: "未改过，用工作台内置值" },
          { label: "待你确定", value: todo.length, tone: todo.length ? "signal" : "muted", foot: todo.map((r) => r.label).join("、") || "没有待处理项" },
          { label: "飞书身份", value: "codex", foot: "机械邪龙兽 · 固定只读" },
        ]} />
        {cards(groups)}
      </div>;
    }}</Loadable>
  </>;
}

function GroupCount({ group }) {
  const n = (s) => group.rows.filter((r) => r.status === s).length;
  const parts = [`${group.rows.length} 项`, n("ok") && `${n("ok")} 已保存`, (n("demo") + n("missing")) && `${n("demo") + n("missing")} 待确定`].filter(Boolean);
  return <span className="set-count"><span className="muted">{group.use}</span>{parts.join(" · ")}</span>;
}

// 旧四键（日报、周报、品牌表、物料类型）：2026-10-23 并入 WriteBox，和 V3 行同一套「预览 → 确认 → 回读」，
// 预览与确认同样走 /api/settings/:key/preview 与 PUT /api/settings/:key（previewId）。周报链接保存前先试读一次。
// 预览失效 / 输入被拒 / 结果不明的分类与锁定由 useWriteFlow 统一处理；回读不一致或清空后配置键仍在都不算保存。
function LegacySettingRow({ field, value, dailyBusy = false, dailyRevision = 0, onBusy, onSaved }) {
  const { key, label, hint, placeholder } = field;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => displayValue(key, value));
  const [error, setError] = useState("");
  const [trial, setTrial] = useState(null); // 周报试读：{ busy } / { result } / { error }
  const flow = useWriteFlow();
  const locked = flow.busy || flow.phase === "unknown" || dailyBusy;
  useEffect(() => { onBusy?.(flow.busy || flow.phase === "unknown"); }, [flow.busy, flow.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (dailyRevision) { flow.reset(); setTrial(null); setError("日报来源已改，请重新预览周报链接。"); } }, [dailyRevision]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (text) => { setDraft(text); flow.reset(); setError(""); setTrial(null); };
  const serverPreview = async (v) => {
    const pv = await apiSend("POST", `/api/settings/${key}/preview`, { value: v });
    if (!pv || pv.key !== key || typeof pv.previewId !== "string" || typeof pv.value !== "string") throw new Error("预览结果无效，请重试");
    return pv;
  };
  const preview = async () => {
    setError(""); setTrial(null);
    let local;
    if (key === "weekly_doc_url" && draft.trim() === "") local = ""; // 清空周报来源：改为从日报文档识别周报
    else { try { local = previewValue(key, draft); } catch (e) { setError(e.message); return; } }
    if (key === "weekly_doc_url" && local) {
      setTrial({ busy: true });
      try {
        const result = await apiSend("POST", "/api/reports/source-preview", { role: "weekly", url: local });
        if (!result || !Number.isInteger(result.count) || !Array.isArray(result.unrecognized)) throw new Error("试读结果无效，请重试");
        setTrial({ result });
      } catch (e) { setTrial({ error: e.message }); setError(e.message); return; }
    }
    flow.preview(() => serverPreview(local));
  };
  const readValue = async () => {
    const settings = await apiSend("GET", "/api/settings");
    if (!settings || Array.isArray(settings) || typeof settings !== "object" || (settings[key] !== undefined && typeof settings[key] !== "string")) throw new Error("配置回读内容无效");
    return settings[key];
  };
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", `/api/settings/${key}`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      if (receipt?.key !== key || receipt.value !== pv.value) return false;
      const actual = await readValue();
      if (pv.value === "") { if (actual !== undefined) return "周报来源清空后应删除配置键，请重新核对"; }
      else if (actual !== pv.value) return false;
      onSaved?.(pv.value); setDraft(displayValue(key, pv.value));
      return true;
    },
  );
  const reread = async () => {
    try { const actual = await readValue(); onSaved?.(actual || ""); setDraft(displayValue(key, actual || "")); setError(""); flow.resolve(); }
    catch (e) { setError(`重新读取失败：${e.message}。请稍后再次读取。`); }
  };
  const expanded = open || flow.phase !== "idle";
  return (
    <div className={`set-row${expanded ? " is-open" : ""}`}>
      <div className="set-row-head">
        <span className="set-label">{label}</span>
        <span className="set-value">{value ? displayValue(key, value).split("\n").join(" · ") : <span className="muted">尚未配置</span>}</span>
        <Tag tone={value ? "green" : "neutral"}>{value ? "已配置" : "未配置"}</Tag>
        <Button onClick={() => { setOpen((v) => !v); flow.reset(); setError(""); setTrial(null); setDraft(displayValue(key, value)); }} disabled={flow.busy || flow.phase === "unknown"}><PixelIcon name={expanded ? "up" : "edit"} />{expanded ? "收起" : "编辑"}</Button>
      </div>
      {expanded && <div className="set-edit stack-sm">
        <span className="small muted">{hint}</span>
        {key === "material_types"
          ? <textarea className="review-box" value={draft} rows={5} placeholder={placeholder} disabled={locked} aria-label={label} onChange={(e) => change(e.target.value)} />
          : <input className="set-input" type="text" inputMode="url" value={draft} placeholder={placeholder} disabled={locked} aria-label={label} onChange={(e) => change(e.target.value)} />}
        {trial?.busy && <StepProgress label="试读周报来源" />}
        {error && <p className="small warn-text" role="alert">{error}</p>}
        {dailyBusy && <p className="small muted">日报来源正在保存或结果待核对，请先完成日报回读。</p>}
        <div className="row"><span className="spacer" />
          {key === "weekly_doc_url" && <Button disabled={locked} onClick={() => change("")}>清空</Button>}
          <Button variant="primary" onClick={preview} disabled={locked || flow.phase === "preview"}><PixelIcon name="eye" />预览保存</Button>
        </div>
        <WriteBox flow={flow} title={`${label} · 保存预览`} savedText={`已保存${label}，回读核对一致`} onConfirm={confirm} onRepreview={preview} onReread={reread}>
          {(pv) => <dl className="kv">
            <dt>原值</dt><dd><pre className="pre diff-old">{pv.before ? displayValue(key, pv.before) : "（尚未配置）"}</pre></dd>
            <dt>新值</dt><dd><pre className="pre diff-new">{pv.value === "" ? "（清空：改为从日报文档识别周报）" : displayValue(key, pv.value)}</pre></dd>
            {trial?.result && <><dt>试读</dt><dd>识别到 {trial.result.count} 篇周报 · {trial.result.unrecognized.length} 个标题未识别{trial.result.latest ? `；最新：${trial.result.latest.title}（${trial.result.latest.date}）` : ""}{trial.result.sameAsDaily ? "；与日报文档相同，将按单文档方式读取" : ""}</dd></>}
            <dt>写到哪里</dt><dd>工作台本地配置；下次读取对应来源时生效</dd>
          </dl>}
        </WriteBox>
      </div>}
    </div>
  );
}

function SetGroup({ title, icon, extra, children }) {
  return <Card title={<><PixelIcon name={icon} />{title}</>} extra={extra}><div className="set-rows">{children}</div></Card>;
}

// v3 新增的配置项：读 /api/v3/settings 的实际值；每项单独编辑 → 预览 → 确认保存 → 回读。
// 飞书 profile 和应用身份固定只读；毛利底线、课时成本还是演示口径，标「示例」直到你保存自己的值。
const V3_FIELDS = {
  timeline_source: { label: "用户时间线来源", hint: "飞书《2026海外大学时间线》：标题、表格 token、链接（JSON）", json: true },
  timeline_years: { label: "时间线后加年份", hint: "在「用户时间」页点「年份」添加，这里只看（JSON）", json: true },
  project_base_url: { label: "项目多维表格", hint: "AI管培工作台的多维表格链接" },
  project_table_id: { label: "项目推进数据表", hint: "以 tbl 开头" },
  kb_space_id: { label: "知识库空间", hint: "工作台当前连接的知识空间 ID（数字）" },
  kb_collect_space: { label: "收藏目标空间", hint: "快捷收藏建快捷方式的知识空间 ID（数字）；换空间后，收藏规则里的目录也要换成新空间的目录" },
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
// JSON 配置在列表里只显示摘要（几条 + 名称），完整 JSON 在「编辑」里看。
const summary = (v) => {
  try {
    const j = JSON.parse(v); const name = (x) => x?.title || x?.name || x?.label || "";
    if (Array.isArray(j)) { const names = j.map(name).filter(Boolean); return `${j.length} 条${names.length ? `：${names.slice(0, 4).join("、")}${names.length > 4 ? " 等" : ""}` : ""}`; }
    return j && typeof j === "object" ? `1 个来源${name(j) ? `：${name(j)}` : ""}` : String(v);
  } catch { return v || "未设置"; }
};

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
        <span className="set-value" title={field.json ? pretty(k, values[k] ?? "") : undefined}>{field.json ? summary(values[k] ?? "") : values[k] || "未设置"}{isDemo && <span className="warn-text small">（演示口径，待你确定）</span>}</span>
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

// 知识库收藏规则（T12，kb_collect_rules）：每个一级目录一行，只改关键词；目录本身（nodeToken）不在这里增删。
// 存成 JSON，仍走 V3 设置的预览 → 确认 → 回读；预览时后端会逐个核对目录在收藏目标空间里真实存在。
const RULES_KEY = "kb_collect_rules";
const parseRules = (v) => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : null; } catch { return null; } };
const splitKeywords = (t) => [...new Set(t.split(/[、,，;；\s]+/).map((x) => x.trim()).filter(Boolean))];
const kwText = (r) => (r.keywords || []).join("、");

function CollectRulesRow({ v3 }) {
  const flow = useWriteFlow();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [err, setErr] = useState("");
  if (!v3.data) return null; // 上面的 V3 行已在显示读取状态
  const { values, saved } = v3.data;
  const raw = values[RULES_KEY];
  const rules = parseRules(raw);
  const total = rules ? rules.reduce((n, r) => n + (r.keywords?.length || 0), 0) : 0;
  const edit = () => { setOpen((o) => !o); flow.reset(); setErr(""); setDraft((rules || []).map(kwText)); };
  const change = (i, t) => { setDraft((d) => d.map((x, j) => (j === i ? t : x))); setErr(""); flow.reset(); };
  const preview = () => {
    const kws = draft.map(splitKeywords);
    const long = kws.flat().find((x) => x.length > 20);
    if (long) { setErr(`关键词「${long}」超过 20 字`); return; }
    if (kws.flat().length > 200) { setErr(`关键词共 ${kws.flat().length} 个，上限 200`); return; }
    const value = JSON.stringify(rules.map((r, i) => ({ ...r, keywords: kws[i] })));
    flow.preview(() => apiSend("POST", `/api/settings/${RULES_KEY}/preview`, { value }));
  };
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", `/api/settings/${RULES_KEY}`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => { const back = await apiSend("GET", "/api/v3/settings"); const ok = back.values[RULES_KEY] === pv.value && back.saved[RULES_KEY] === pv.value; if (ok) v3.setData(back); return ok; },
  );
  const reread = async () => { const back = await apiSend("GET", "/api/v3/settings"); flow.resolve(); v3.setData(back); };
  return (
    <div className="set-row">
      <div className="set-row-head">
        <span className="set-label">收藏规则</span>
        <span className="set-value">{rules ? rules.length ? `${rules.length} 个目录 · ${total} 个关键词` : "未设自动归类 · 收藏到根目录" : <span className="warn-text">已保存的值不是规则表，请到这里重新保存</span>}</span>
        {saved[RULES_KEY] !== undefined ? <Tag tone="green">已保存</Tag> : <Tag>默认值</Tag>}
        <Button onClick={edit} disabled={!rules || flow.busy || flow.phase === "unknown"}><PixelIcon name="edit" />{open ? "收起" : "编辑"}</Button>
      </div>
      {open && rules && (
        <div className="set-edit stack-sm">
          <span className="small muted">收藏时用文档标题和它原来所在的上级目录标题匹配（不分大小写）：只命中一个目录就放那里；未设规则、命中多个或都没命中，放知识库根目录。关键词用顿号或逗号分隔，单个不超过 20 字，总数不超过 200；非空规则表保留一个没有关键词的目录。</span>
          <table className="grid compact set-rules"><thead><tr><th>目录</th><th>关键词</th></tr></thead>
            <tbody>{rules.map((r, i) => <tr key={r.nodeToken}><td className="set-rules-dir">{r.title}</td><td><input className="set-input" value={draft[i] ?? ""} onChange={(e) => change(i, e.target.value)} placeholder="（无，作兜底）" aria-label={`${r.title} 的关键词`} /></td></tr>)}</tbody></table>
          {err && <p className="small warn-text">{err}</p>}
          <div className="row"><span className="spacer" /><Button variant="primary" onClick={preview} disabled={flow.busy || flow.phase === "unknown"}><PixelIcon name="eye" />预览保存</Button></div>
          <WriteBox flow={flow} title="收藏规则 · 保存预览" onConfirm={confirm} onRepreview={preview} onReread={reread}>
            {(pv) => <RulesDiff before={parseRules(pv.before ?? raw) || []} after={parseRules(pv.value) || []} unsaved={pv.before == null} />}
          </WriteBox>
        </div>
      )}
    </div>
  );
}

function RulesDiff({ before, after, unsaved }) {
  const old = new Map(before.map((r) => [r.nodeToken, kwText(r)]));
  const changed = after.filter((r) => old.get(r.nodeToken) !== kwText(r));
  return <>
    <p className="small muted">{unsaved ? "原来用的是默认规则。" : ""}{changed.length ? `改动 ${changed.length} 个目录` : "关键词没有变化"}；写到工作台本地配置，下次收藏预览时生效，不改飞书。</p>
    {changed.length > 0 && <table className="grid compact set-rules-diff"><thead><tr><th>目录</th><th>原关键词</th><th>新关键词</th></tr></thead>
      <tbody>{changed.map((r) => <tr key={r.nodeToken}><td>{r.title}</td><td><code className="diff-old">{old.get(r.nodeToken) || "（无）"}</code></td><td><code className="diff-new">{kwText(r) || "（无）"}</code></td></tr>)}</tbody></table>}
  </>;
}

// Chrome 扩展「牛马之家 · 收藏」的配对码（T12）：扩展请求必须带它。可以显示、复制；重新生成走预览 → 确认 → 回读，旧码立即失效。
function PairingRow() {
  const state = useApi("/api/v3/kb/collect/pairing");
  const [fresh, setFresh] = useState(null);
  const [show, setShow] = useState(false);
  const [note, setNote] = useState("");
  const flow = useWriteFlow();
  const head = (value, tag, action) => <div className="set-row-head"><span className="set-label">扩展配对码</span>{value}{tag}{action}</div>;
  if (!state.data) return <div className="set-row set-pairing"><Loadable state={state} name="扩展配对码">{() => null}</Loadable></div>;
  const { code, createdAt } = fresh || state.data;
  const copy = async () => { try { await navigator.clipboard.writeText(code); setNote("已复制。在 Chrome 里点扩展图标，粘贴到「配对码」"); } catch { setShow(true); setNote("复制失败，已显示完整配对码，请手动复制"); } };
  const preview = () => { setNote(""); flow.preview(() => apiSend("POST", "/api/v3/kb/collect/pairing/preview", {})); };
  const confirm = () => flow.confirm(
    (pv) => apiSend("POST", "/api/v3/kb/collect/pairing/rotate", { previewId: pv.previewId, confirm: true }),
    async (receipt) => { const back = await apiSend("GET", "/api/v3/kb/collect/pairing"); const ok = back.code === receipt.code && back.code !== code; if (ok) { setFresh(back); setShow(true); } return ok; },
  );
  const reread = async () => { const back = await apiSend("GET", "/api/v3/kb/collect/pairing"); flow.resolve(); setFresh(back); };
  return (
    <div className="set-row set-pairing">
      {/* 显示/隐藏跟在码后面，复制占按钮列，与上面各行的「状态｜编辑」两列对齐。 */}
      {head(<span className="set-value set-pairing-code"><code>{show ? code : `${code.slice(0, 6)}…${code.slice(-4)}`}</code><button type="button" className="link-btn" onClick={() => setShow((v) => !v)}>{show ? "隐藏" : "显示"}</button></span>,
        <Tag tone="green">已生成</Tag>,
        <Button onClick={copy}><PixelIcon name="copy" />复制</Button>)}
      <div className="set-edit stack-sm set-pairing-foot">
        <span className="small muted">Chrome 扩展「牛马之家 · 收藏」第一次使用时填这个码；生成于 {new Date(createdAt).toLocaleString("zh-CN", { hour12: false })}。<button type="button" className="link-btn" onClick={preview} disabled={flow.busy || flow.phase === "unknown"}>重新生成</button>{note && ` ${note}`}</span>
        <WriteBox flow={flow} title="重新生成配对码 · 预览" confirmLabel="确认重新生成" savedText="已生成新配对码，回读一致；请在扩展里重新填写" onConfirm={confirm} onRepreview={preview} onReread={reread}>
          <p className="small">旧配对码会立即失效，Chrome 扩展要重新填写新码才能收藏。只改工作台本机配置，不改飞书。</p>
        </WriteBox>
      </div>
    </div>
  );
}

// 机械邪龙兽推送 Codex 重置：开关写 V3 配置 codex_push_enabled，走预览 → 确认 → 回读；下面照实显示检查与推送记录。
const PUSH_KEY = "codex_push_enabled";
const PUSH_STATUS = { sent: "已推送", failed: "推送失败", unknown: "结果不明" };
function PushRow({ v3 }) {
  const state = useApi("/api/v3/codex-push");
  const [fresh, setFresh] = useState(null);
  const flow = useWriteFlow();
  if (!v3.data) return null; // 上面的 V3 行已在显示读取状态
  const on = v3.data.values[PUSH_KEY] === "1";
  const push = fresh || state.data;
  const next = on ? "0" : "1";
  const preview = () => flow.preview(() => apiSend("POST", `/api/settings/${PUSH_KEY}/preview`, { value: next }));
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", `/api/settings/${PUSH_KEY}`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      const back = await apiSend("GET", "/api/v3/settings");
      const ok = back.values[PUSH_KEY] === pv.value && back.saved[PUSH_KEY] === pv.value;
      if (ok) { v3.setData(back); setFresh(await apiSend("GET", "/api/v3/codex-push")); }
      return ok;
    },
  );
  const reread = async () => { const back = await apiSend("GET", "/api/v3/settings"); flow.resolve(); v3.setData(back); setFresh(await apiSend("GET", "/api/v3/codex-push")); };
  const last = push?.lastPush;
  return (
    <div className="set-row">
      <div className="set-row-head">
        <span className="set-label">机械邪龙兽推送</span>
        <span className="set-value">{on ? "已开启 · 每 4 小时检查 Codex 重置，有新重置时私聊发给你" : <span className="muted">未开启：不检查、不推送</span>}</span>
        <Tag tone={on ? "green" : "neutral"}>{on ? "已开启" : "未开启"}</Tag>
        <Button onClick={preview} disabled={flow.busy || flow.phase === "unknown"}><PixelIcon name={on ? "close" : "send"} />{on ? "关闭" : "开启"}</Button>
      </div>
      <div className="set-edit stack-sm set-push-foot">
        {state.error && !fresh ? <span className="small warn-text">推送状态读取失败：{state.error}</span> : push && <dl className="kv set-push-kv">
          <dt>发送</dt><dd>{push.sender} → {push.recipient}</dd>
          <dt>上次检查</dt><dd>{push.lastCheck ? <>{push.lastCheck.at}{push.lastCheck.error && <span className="warn-text">数据源读取失败：{push.lastCheck.error}</span>}</> : <span className="muted">还没检查过</span>}{on && push.nextCheck && <span className="muted">· 下次 {push.nextCheck}</span>}</dd>
          <dt>上次推送</dt><dd>{last ? <><span>{last.at}</span><Tag tone={last.status === "sent" ? "green" : last.status === "failed" ? "red" : "amber"}>{PUSH_STATUS[last.status]}</Tag><span>{last.summary}</span></> : <span className="muted">{on ? (push.baseline ? "刚开启：第一次检查只记下已有的重置，不推" : "还没有新的重置需要推送") : "没有推送记录"}</span>}</dd>
          {last?.error && <><dt>失败原因</dt><dd className="warn-text">{last.error}</dd></>}
        </dl>}
        <WriteBox flow={flow} title={`${on ? "关闭" : "开启"}机械邪龙兽推送 · 预览`} confirmLabel={`确认${on ? "关闭" : "开启"}`} savedText={`已${on ? "开启" : "关闭"}推送，回读一致`} onConfirm={confirm} onRepreview={preview} onReread={reread}>
          {(pv) => <dl className="kv"><dt>原值</dt><dd>{pv.before === "1" ? "开启" : "关闭"}{pv.before === null && "（默认）"}</dd><dt>新值</dt><dd><code className="diff-new">{pv.value === "1" ? "开启" : "关闭"}</code></dd>
            <dt>之后</dt><dd>{pv.value === "1" ? "10 分钟内做第一次检查，只记下已有的重置、不推；之后每 4 小时检查一次，同一次重置只推一次，由机械邪龙兽（机器人身份）私聊发给你本人。" : "不再检查、不再推送；已有的推送记录保留。"}</dd>
            <dt>写到哪里</dt><dd>工作台本地配置，不改飞书</dd></dl>}
        </WriteBox>
      </div>
    </div>
  );
}
