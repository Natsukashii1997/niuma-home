import { useEffect, useMemo, useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiRead, apiSend, useApi } from "../../api.js";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { deliveryMonth } from "../../constants.js";
import { Button, Loadable, SampleBadge, Tag } from "../../ui/components.jsx";

// 价格（v3）：一张课时卡（5–200 小时）× 多套价格方案的矩阵。
// 比较方式：同一档跨方案（相对基准方案的差价）、同一方案跨档位（单价阶梯，倒挂标出）。
// 口径：课时单价 = 总价 ÷（课时 + 赠送），付费单价 = 总价 ÷ 课时（对应原表的「每课时单价」）。

export const money = (n) => Math.round(n).toLocaleString("en-US");
export const pct = (v) => `${Math.round(v * 100)}%`;
export const signed = (n) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : "±0");

// 空表和新插入的列可能有没填的格子（null）：返回 empty，不参与计算，页面显示「填写」。原价没填时不算折扣。
export function calc(scheme, i, tiers, unitOrig, costPerHour) {
  const h = tiers[i], gift = scheme.gifts[i] || 0, price = scheme.prices[i];
  const orig = unitOrig ? h * unitOrig : null;
  if (price == null) return { h, gift, price: null, orig, empty: true };
  return {
    h, gift, price, orig,
    unit: price / (h + gift),
    paid: price / h,
    discount: orig ? price / orig : null,
    subsidy: orig ? orig - price : null,
    margin: (price - costPerHour * (h + gift)) / price,
  };
}

// 固定 4 张表（页签）：大学辅导·灵活学Lite / 安心学Max、国际课程·课时卡 / 竞赛课时卡；空表也能直接填写。
// 路由 marketing/prices/<表 id>：从 SKU 档案、⌘K 进来时直接选中该表。
export default function PricesView({ route = [] }) {
  const skus = useApi("/api/v3/price/skus");
  const [picked, setSku] = useState(route[0] || "");
  const sku = picked || skus.data?.[0]?.id || "";
  const schemes = useApi(sku ? `/api/v3/price/schemes?sku=${encodeURIComponent(sku)}` : null);
  const [fresh, setFresh] = useState(null); // 保存后回读到的方案
  const [notice, setNotice] = useState("");
  return (
    <Loadable state={skus} name="SKU 列表" big>
      {(list) => (
        <>
          <div className="toolbar">
            <div className="sku-tabs" role="tablist" aria-label="SKU">
              {list.map((s) => (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === sku} className={s.id === sku ? "active" : ""} onClick={() => setSku(s.id)}>
                  <span className="small muted">{s.line}</span>{s.label || s.name}
                </button>
              ))}
            </div>
            <span className="spacer" />
            {schemes.isSample && <SampleBadge task={schemes.task} />}
          </div>
          <SavedNote text={notice} onClose={() => setNotice("")} />
          <Loadable state={schemes} name="价格方案" big>{(data) => { const d = fresh?.sku === sku ? fresh : data; return <PriceBoard key={`${sku}-${JSON.stringify(d.schemes).length}-${fresh ? 1 : 0}`} sku={(() => { const found = list.find((s) => s.id === sku) || list[0]; return fresh?.sku === sku && fresh.unitOrig !== undefined ? { ...found, unitOrig: fresh.unitOrig } : found; })()} data={d} onSaved={(back, text = "") => { setFresh(back); setNotice(text); }} onEdit={() => setNotice("")} />; }}</Loadable>
        </>
      )}
    </Loadable>
  );
}

// 保存：整张矩阵（原价、档位、全部方案）预览 → 确认 → 回读。活动方案必须关联一条已采纳的主线需求；低于毛利底线的方案要写原因。
// 成本和毛利底线仍是演示口径，所以保存后页面继续标「示例」。
const SCHEME_KEYS = ["id", "name", "kind", "status", "from", "to", "prices", "gifts", "needId", "need", "breachReason"];
function cleanScheme(s) {
  const out = Object.fromEntries(SCHEME_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));
  if (!out.needId) { delete out.needId; delete out.need; } // 后端不接受手填的需求文字
  if (!out.breachReason) delete out.breachReason;
  return out;
}

function PriceBoard({ sku, data, onSaved, onEdit }) {
  const [schemes, setSchemesRaw] = useState(data.schemes);
  const [unitOrig, setUnitOrigRaw] = useState(sku.unitOrig);
  const flow = useWriteFlow();
  const needsState = useApi(`/api/v3/needs?month=${deliveryMonth()}`);
  const adoptedNeeds = (needsState.data?.needs || []).filter((n) => n.status === "已采纳");
  const locked = flow.busy || flow.phase === "unknown";
  const touched = () => { flow.reset(); onEdit(); };
  const setSchemes = (fn) => { if (locked) return; setSchemesRaw(fn); touched(); };
  const setScheme = (id, patch) => setSchemes((old) => old.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const setUnitOrig = (v) => { if (locked) return; setUnitOrigRaw(v); touched(); };
  const dirty = JSON.stringify(schemes) !== JSON.stringify(data.schemes) || unitOrig !== sku.unitOrig;
  const [basePick, setBase] = useState(data.schemes[0]?.id || "");
  const base = schemes.some((s) => s.id === basePick) ? basePick : schemes[0]?.id || "";
  const [hidden, setHidden] = useState([]);
  const [hover, setHover] = useState(-1);
  const [editing, setEditing] = useState(null); // { scheme, i }
  const [panel, setPanel] = useState(null); // 打开了列面板的方案
  const [seam, setSeam] = useState(null); // 鼠标停在哪一列右边的分隔线上
  const tiers = sku.tiers;
  const visible = schemes.filter((s) => s.id === base || !hidden.includes(s.id));
  const baseScheme = schemes.find((s) => s.id === base);
  const markOf = (s) => MARKS[schemes.indexOf(s) % MARKS.length];
  const c = (s, i) => calc(s, i, tiers, unitOrig, data.costPerHour);
  const save = (schemeId, i, value) => setSchemes((old) => old.map((s) => s.id !== schemeId ? s : { ...s, prices: s.prices.map((p, j) => (j === i ? value : p)) }));
  // 在 after 这一列右边插入新方案：价格复制左边一列、赠课清零；空表的第一列全部留空。只改草稿。
  const insertAfter = (after) => {
    if (locked) return;
    const id = `new-${Date.now()}`, left = schemes.find((s) => s.id === after);
    const dm = deliveryMonth(), [y, m] = dm.split("-").map(Number);
    const scheme = left
      ? { id, name: "新方案", kind: "活动", status: "草稿", from: `${dm}-01`, to: `${dm}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`, prices: [...left.prices], gifts: tiers.map(() => 0) }
      : { id, name: "新方案", kind: "常规", status: "草稿", from: `${dm}-01`, to: "", prices: tiers.map(() => null), gifts: tiers.map(() => 0) };
    setSchemes((old) => { const k = old.findIndex((s) => s.id === after); return [...old.slice(0, k + 1), scheme, ...old.slice(k + 1)]; });
    setSeam(null); setPanel(id);
  };
  const removeScheme = (id) => { if (id === base) return; setSchemes((old) => old.filter((s) => s.id !== id)); setPanel(null); setEditing(null); };
  const isBreach = (s) => tiers.some((_, i) => { const v = c(s, i); return !v.empty && v.margin < data.floorMargin; });
  const blanks = schemes.reduce((n, s) => n + s.prices.filter((p) => p == null).length, 0);
  const body = () => ({ unitOrig, tiers, schemes: schemes.map(cleanScheme) });
  const preview = () => flow.preview(() => apiSend("POST", `/api/v3/price/schemes/preview?sku=${encodeURIComponent(sku.id)}`, body()));
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", `/api/v3/price/schemes?sku=${encodeURIComponent(sku.id)}`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      const back = await apiRead(`/api/v3/price/schemes?sku=${encodeURIComponent(sku.id)}`);
      const ok = JSON.stringify(back.schemes) === JSON.stringify(pv.value.schemes);
      if (ok) onSaved({ ...back, unitOrig: pv.value.unitOrig }, "价格方案已保存，回读核对一致（成本和毛利底线仍是演示口径）");
      return ok;
    },
  );
  const reread = async () => { const back = await apiRead(`/api/v3/price/schemes?sku=${encodeURIComponent(sku.id)}`); flow.resolve(); onSaved({ ...back }); };
  return (
    <>
      <div className="toolbar">
        {schemes.length ? <>
          <label className="select"><span>基准方案</span>
            <select value={base} onChange={(e) => setBase(e.target.value)}>{schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
          <span className="price-show">
            {schemes.map((s) => (
              <label key={s.id} className={`chk ${seriesClass(s)}`}><input type="checkbox" checked={!hidden.includes(s.id) || s.id === base} disabled={s.id === base}
                onChange={(e) => setHidden((old) => e.target.checked ? old.filter((x) => x !== s.id) : [...old, s.id])} /><Mark kind={markOf(s)} />{s.name}</label>
            ))}
          </span>
        </> : <span className="small muted">还没有价格方案：先填原价，再点表格右边的「+」新增第一个方案</span>}
        <span className="spacer" />
        <label className="select"><span>原价</span><OrigInput value={unitOrig} disabled={locked} onChange={setUnitOrig} /><span>元/小时</span></label>
        <span className="small muted">毛利底线 {pct(data.floorMargin)} · 课时成本 {data.costPerHour} 元</span>
        <Button variant="primary" disabled={!dirty || locked} onClick={preview}><PixelIcon name="eye" />预览保存</Button>
      </div>
      {dirty && flow.phase === "idle" && <p className="small warn-text price-dirty">有改动还没保存：点「预览保存」生成预览，确认后才写入。{blanks > 0 && `还有 ${blanks} 格总价没填，填满后才能保存。`}{unitOrig == null && "原价还没填。"}</p>}
      <WriteBox flow={flow} title="价格方案保存预览" onConfirm={confirm} onRepreview={preview} onReread={reread}>
        {(pv) => <dl className="kv">
          <dt>价格表</dt><dd>{sku.line} · {sku.label || sku.name}</dd>
          <dt>原价</dt><dd>{pv.value.unitOrig} 元/小时</dd>
          <dt>方案</dt><dd>{pv.value.schemes.map((x) => `${x.name}（${x.status}）`).join("、")}</dd>
          {(() => { const gone = data.schemes.filter((x) => !pv.value.schemes.some((y) => y.id === x.id)); return gone.length ? <><dt>删除</dt><dd className="warn-text">{gone.map((x) => x.name).join("、")}</dd></> : null; })()}
          <dt>关联需求</dt><dd>{pv.value.schemes.filter((x) => x.need).map((x) => `${x.name} → ${x.need}`).join("；") || "无"}</dd>
          <dt>破底线原因</dt><dd>{pv.value.schemes.filter((x) => x.breachReason).map((x) => `${x.name}：${x.breachReason}`).join("；") || "无"}</dd>
          <dt>写到哪里</dt><dd>工作台本地价格记录；成本和毛利底线仍是演示口径，页面继续标「示例」</dd>
        </dl>}
      </WriteBox>

      <div className="table-wrap price-matrix-wrap">
        <table className="grid price-matrix">
          <thead>
            <tr>
              <th className="r">课时</th><th className="r">原价</th>
              {visible.map((s, k) => (
                <th key={s.id} className={`scheme-head${s.id === base ? " is-base" : ""}${panel === s.id ? " is-open" : ""}${seam === s.id ? " is-seam" : ""}`}>
                  <button type="button" className="scheme-grab" aria-expanded={panel === s.id} aria-label={`打开「${s.name}」的方案面板`} title="点开：改名称、类型、状态、日期，设为基准或删除"
                    onClick={() => setPanel(panel === s.id ? null : s.id)} />
                  <div className="scheme-name">{s.name}{s.id === base && <em>基准</em>}</div>
                  <div className="scheme-meta">
                    <Tag tone={s.status === "生效中" ? "green" : s.status === "草稿" ? "amber" : "neutral"}>{s.status}</Tag>
                    <span>{s.from ? `${s.from.slice(5)} → ${s.to ? s.to.slice(5) : "长期"}` : "未设日期"}</span>
                  </div>
                  {s.need && <div className="scheme-need"><PixelIcon name="target" />{s.need}</div>}
                  <button type="button" className="scheme-ins" disabled={locked} aria-label={`在「${s.name}」右边插入新方案`} title="在这里插入一列新方案（复制左边一列的价格）"
                    onMouseEnter={() => setSeam(s.id)} onMouseLeave={() => setSeam(null)} onFocus={() => setSeam(s.id)} onBlur={() => setSeam(null)} onClick={() => insertAfter(s.id)}><span>+</span></button>
                  {panel === s.id && <SchemePanel scheme={s} isBase={s.id === base} breach={isBreach(s)} adoptedNeeds={adoptedNeeds} locked={locked} alignRight={k > 0 && k >= visible.length - 2}
                    onChange={(patch) => setScheme(s.id, patch)} onBase={() => setBase(s.id)} onRemove={() => removeScheme(s.id)} onClose={() => setPanel(null)} />}
                </th>
              ))}
              <th className="scheme-add">
                <button type="button" disabled={locked} aria-label="新增方案" title={schemes.length ? "在最后新增一列方案（复制左边一列的价格）" : "新增第一个方案"}
                  onClick={() => insertAfter(visible[visible.length - 1]?.id)}><PixelIcon name="plus" /></button>
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((h, i) => (
              <tr key={h} className={hover === i ? "is-hover" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
                <th scope="row" className="r tier">{h}<small>h</small></th>
                <td className="r muted tnum">{unitOrig ? money(h * unitOrig) : "—"}</td>
                {visible.map((s) => {
                  const v = c(s, i), b = baseScheme && c(baseScheme, i);
                  const prev = i > 0 ? c(s, i - 1) : null;
                  const inverted = prev && !prev.empty && !v.empty && v.paid > prev.paid;
                  const breach = !v.empty && v.margin < data.floorMargin;
                  const isEdit = editing && editing.scheme === s.id && editing.i === i;
                  return (
                    <td key={s.id} className={`price-cell${breach ? " is-breach" : ""}${s.id === base ? " is-base" : ""}${seam === s.id ? " is-seam" : ""}`}>
                      {isEdit ? (
                        <PriceInput value={v.price ?? ""} onDone={(val, move) => { if (val !== null && val !== v.price) save(s.id, i, val); setEditing(move && i + move >= 0 && i + move < tiers.length ? { scheme: s.id, i: i + move } : null); }} />
                      ) : v.empty ? (
                        <button type="button" className="price-total is-blank" onClick={() => setEditing({ scheme: s.id, i })} title="点击填写总价">填写</button>
                      ) : (
                        <button type="button" className="price-total" onClick={() => setEditing({ scheme: s.id, i })} title="点击修改总价">{money(v.price)}</button>
                      )}
                      {!v.empty && <div className="price-sub">
                        <span title="课时单价（含赠送）">{money(v.unit)}/h</span>
                        {v.gift > 0 && <span className="gift" title="赠送课时">+{v.gift}h · 付费 {money(v.paid)}/h</span>}
                        {v.discount != null && <span title="优惠折扣">{pct(v.discount)}</span>}
                      </div>}
                      {s.id !== base && !v.empty && b && !b.empty && <div className={`price-diff${v.price < b.price ? " is-down" : ""}`}>{signed(v.price - b.price)}<span> · 单价 {signed(v.unit - b.unit)}</span></div>}
                      {inverted && <div className="price-flag">付费单价高于上一档</div>}
                      {breach && <div className="price-flag is-risk">毛利 {pct(v.margin)} · 低于底线</div>}
                    </td>
                  );
                })}
                <td className="scheme-add" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted price-note">单价 = 总价 ÷（课时 + 赠送）；付费单价 = 总价 ÷ 课时；折扣 = 总价 ÷ 原价；差价相对基准方案。点击总价可以直接改，Enter 保存，Tab / ⇧Tab 换到下 / 上一档，Esc 取消。点列头顶部的细条打开方案面板（改名称、状态、日期，设为基准或删除）；鼠标移到两列之间的竖线上点「+」插入新方案。</p>

      <UnitChart schemes={visible} base={base} tiers={tiers} c={c} markOf={markOf} hover={hover} setHover={setHover} />
    </>
  );
}

// 列面板：原「方案设置」卡的字段搬到这里，外加设为基准、删除。基准方案不能删，要先换基准。
function SchemePanel({ scheme: x, isBase, breach, adoptedNeeds, locked, alignRight, onChange, onBase, onRemove, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const away = (e) => { if (!ref.current?.contains(e.target) && !e.target.closest?.(".scheme-grab")) onClose(); };
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [onClose]);
  return (
    <div ref={ref} className={`scheme-panel${alignRight ? " is-right" : ""}`} role="dialog" aria-label={`方案「${x.name}」`}>
      <div className="scheme-panel-head"><span className="label">方案设置</span><button type="button" className="scheme-panel-close" aria-label="关闭" onClick={onClose}><PixelIcon name="close" /></button></div>
      <label className="scheme-field"><span>名称</span><input className="cell-input" value={x.name} disabled={locked} onChange={(e) => onChange({ name: e.target.value })} /></label>
      <label className="scheme-field"><span>类型</span><select className="cell-input" value={x.kind} disabled={locked} onChange={(e) => onChange({ kind: e.target.value })}>{["常规", "活动", "赠课"].map((k) => <option key={k}>{k}</option>)}</select></label>
      <label className="scheme-field"><span>状态</span><select className="cell-input" value={x.status} disabled={locked} onChange={(e) => onChange({ status: e.target.value })}>{["生效中", "草稿", "历史"].map((k) => <option key={k}>{k}</option>)}</select></label>
      <div className="scheme-field"><span>生效期</span><span className="scheme-dates">
        <input className="cell-input date" value={x.from} placeholder="开始" aria-label="开始日期" disabled={locked} onChange={(e) => onChange({ from: e.target.value.trim() })} /> →
        <input className="cell-input date" value={x.to} placeholder="长期" aria-label="结束日期" disabled={locked} onChange={(e) => onChange({ to: e.target.value.trim() })} /></span></div>
      <label className="scheme-field"><span>关联需求</span>{x.kind === "活动" || x.needId ? (
        <select className="cell-input" value={x.needId || ""} disabled={locked} onChange={(e) => { const n = adoptedNeeds.find((k) => k.id === e.target.value); onChange(n ? { needId: n.id, need: `${n.seg} · ${n.node}` } : { needId: "", need: "" }); }}>
          <option value="">{adoptedNeeds.length ? "选一条已采纳需求" : "还没有已采纳需求"}</option>
          {adoptedNeeds.map((n) => <option key={n.id} value={n.id}>{n.seg} · {n.node}</option>)}
        </select>) : <span className="muted small">只有活动方案需要</span>}</label>
      {x.need && !x.needId && <p className="small warn-text">原文「{x.need}」不是已采纳需求，保存前要重新选</p>}
      <label className="scheme-field"><span>破底线原因</span><input className="cell-input" value={x.breachReason || ""} disabled={locked || !breach} placeholder={breach ? "必填：为什么低于底线" : "未低于底线，不用填"} onChange={(e) => onChange({ breachReason: e.target.value })} /></label>
      <div className="scheme-panel-acts">
        <Button disabled={isBase} onClick={onBase}><PixelIcon name="target" />{isBase ? "已是基准" : "设为基准"}</Button>
        <Button disabled={isBase || locked} onClick={onRemove}><PixelIcon name="close" />删除方案</Button>
      </div>
      <p className={`small ${isBase ? "warn-text" : "muted"}`}>{isBase ? "基准方案不能删：先把别的方案设为基准，再回来删除。" : "删除和改动只改页面草稿，点「预览保存」确认后才写入。"}</p>
    </div>
  );
}

function OrigInput({ value, disabled, onChange }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  const commit = () => {
    const t = text.trim(), n = Number(t), next = t === "" ? null : Number.isFinite(n) && n > 0 ? n : value;
    setText(next == null ? "" : String(next));
    if (next !== value) onChange(next);
  };
  return <input className={`orig-input${value == null ? " is-blank" : ""}`} inputMode="decimal" value={text} placeholder="填写" aria-label="每小时原价" disabled={disabled}
    onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />;
}

function PriceInput({ value, onDone }) {
  const ref = useRef(null);
  const [text, setText] = useState(String(value));
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const commit = (move = 0) => { const n = Number(text.replace(/[^\d.]/g, "")); onDone(Number.isFinite(n) && n > 0 ? Math.round(n) : null, move); };
  return (
    <input ref={ref} className="price-input" inputMode="numeric" value={text} aria-label="总价"
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(0); }
        if (e.key === "Escape") { e.preventDefault(); onDone(null, 0); }
        if (e.key === "Tab") { e.preventDefault(); commit(e.shiftKey ? -1 : 1); }
      }}
      onBlur={() => commit(0)} />
  );
}

// 课时单价阶梯：每套方案一条折线，放在矩阵下面。四套常用方案固定配色（用户 2026-10-18 指定）：常规优惠版墨色、双11底价红、
// 新春囤课价橙黄、赠送课时价绿；按方案名对应（编号兜底），别的表里新建同名方案也同色。其余方案维持浅灰点线，基准更粗。
// 悬停或点选图例：该线加粗、其余变淡（不再染橙色，免得和橙黄撞色）；悬停某一档时竖线对齐并列出各方案数值。
const MARKS = ["square", "ring", "diamond", "dot", "square", "ring"];
const SERIES_COLORS = { 常规优惠版: "ink", 双11底价: "red", 新春囤课价: "amber", 赠送课时价: "green" };
const SERIES_IDS = { regular: "ink", d11: "red", cny: "amber", gift: "green" };
function seriesClass(s) { const color = SERIES_COLORS[s.name] || SERIES_IDS[s.id]; return color ? `has-color c-${color}` : ""; }

function UnitChart({ schemes, base, tiers, c, markOf, hover, setHover }) {
  const W = 1000, H = 190, L = 56, R = 16, T = 16, B = 30;
  const values = schemes.flatMap((s) => tiers.map((_, i) => c(s, i)).filter((v) => !v.empty).map((v) => v.unit));
  const min = values.length ? Math.floor(Math.min(...values) / 50) * 50 : 0, max = values.length ? Math.ceil(Math.max(...values) / 50) * 50 : 0;
  const step = (W - L - R) / Math.max(1, tiers.length - 1);
  const x = (i) => L + i * step;
  const y = (v) => T + ((max - v) * (H - T - B)) / Math.max(1, max - min);
  const ticks = useMemo(() => { const out = []; for (let v = min; v <= max; v += 50) out.push(v); return out; }, [min, max]);
  const [pin, setPin] = useState(null);
  const [peek, setPeek] = useState(null);
  const focus = peek || pin;
  const order = [...schemes].sort((a, b) => rank(a.id) - rank(b.id)); // 突出的线画在最上面
  function rank(id) { return id === focus ? 2 : id === base ? 1 : 0; }
  const cls = (s) => `${seriesClass(s)}${s.id === base ? " is-base" : ""}${s.id === focus ? " is-focus" : ""}`;
  return (
    <div className="unit-chart">
      <div className="unit-chart-head"><span className="label">课时单价阶梯（元/小时，含赠送）</span>
        {values.length > 0 && <span className="unit-legend">{schemes.map((s) => (
          <button type="button" key={s.id} className={cls(s)} aria-pressed={pin === s.id} title="点一下固定高亮，再点取消"
            onMouseEnter={() => setPeek(s.id)} onMouseLeave={() => setPeek(null)} onClick={() => setPin(pin === s.id ? null : s.id)}><Mark kind={markOf(s)} />{s.name}</button>
        ))}</span>}</div>
      {!values.length ? <div className="unit-chart-empty">还没有可画的价格：填写原价和至少一个方案的总价后显示</div> : (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="课时单价随课时档位变化" className={focus ? "has-focus" : ""} onMouseLeave={() => setHover(-1)}>
          {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid-line" /><text x={L - 8} y={y(v) + 4} className="axis" textAnchor="end">{v}</text></g>)}
          {tiers.map((h, i) => <text key={h} x={x(i)} y={H - 8} className={`axis${hover === i ? " is-hot" : ""}`} textAnchor="middle">{h}h</text>)}
          {hover >= 0 && <line x1={x(hover)} x2={x(hover)} y1={T - 6} y2={H - B} className="cross" />}
          {order.map((s) => {
            const pts = tiers.map((_, i) => [i, c(s, i)]).filter(([, v]) => !v.empty);
            return (
              <g key={s.id} className={`series ${cls(s)}`}>
                <polyline points={pts.map(([i, v]) => `${x(i)},${y(v.unit)}`).join(" ")} />
                {pts.map(([i, v]) => <MarkAt key={i} kind={markOf(s)} cx={x(i)} cy={y(v.unit)} />)}
              </g>
            );
          })}
          {tiers.map((_, i) => <rect key={i} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />)}
          {hover >= 0 && (() => {
            const bx = Math.min(x(hover) + 10, W - 190), rows = schemes.map((s) => { const v = c(s, hover); return [s.name, v.empty ? "—" : money(v.unit)]; });
            return (
              <g className="tip" pointerEvents="none">
                <rect x={bx} y={T} width={180} height={18 + rows.length * 16} />
                <text x={bx + 8} y={T + 14} className="tip-title">{tiers[hover]} 小时</text>
                {rows.map(([n, v], j) => <text key={n + j} x={bx + 8} y={T + 30 + j * 16} className="tip-row">{n}<tspan x={bx + 172} textAnchor="end">{v}</tspan></text>)}
              </g>
            );
          })()}
        </svg>
      )}
    </div>
  );
}

function Mark({ kind }) {
  return <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><MarkAt kind={kind} cx={5} cy={5} /></svg>;
}
function MarkAt({ kind, cx, cy }) {
  if (kind === "ring") return <rect x={cx - 3.5} y={cy - 3.5} width={7} height={7} className="mk ring" />;
  if (kind === "diamond") return <rect x={cx - 3} y={cy - 3} width={6} height={6} transform={`rotate(45 ${cx} ${cy})`} className="mk" />;
  if (kind === "dot") return <rect x={cx - 2} y={cy - 2} width={4} height={4} className="mk" />;
  return <rect x={cx - 3.5} y={cy - 3.5} width={7} height={7} className="mk" />;
}
