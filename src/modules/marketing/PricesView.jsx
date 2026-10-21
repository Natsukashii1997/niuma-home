import { useEffect, useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiRead, apiSend, useApi } from "../../api.js";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { deliveryMonth } from "../../constants.js";
import { Button, Loadable, Placeholder, SampleBadge, Tag } from "../../ui/components.jsx";

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

// 四个主页签；稳分系列按子产品分别展示和保存，沿用同一套价格矩阵交互。
// 路由 marketing/prices/<表 id>：从 SKU 档案、⌘K 进来时直接选中该表。
export default function PricesView({ route = [] }) {
  const skus = useApi("/api/v3/price/skus");
  const [picked, setSku] = useState(route[0] || "");
  const sku = picked || skus.data?.[0]?.id || "";
  const selected = skus.data?.find((s) => s.id === sku);
  const selectedGroup = selected?.groupId || sku;
  const schemes = useApi(sku ? `/api/v3/price/schemes?sku=${encodeURIComponent(sku)}` : null);
  const [fresh, setFresh] = useState(null); // 保存后回读到的方案
  const [notice, setNotice] = useState("");
  return (
    <Loadable state={skus} name="SKU 列表" big>
      {(list) => (
        <>
          <div className="toolbar">
            <div className="sku-tabs" role="tablist" aria-label="SKU">
              {list.filter((s, i) => !s.groupId || list.findIndex((x) => x.groupId === s.groupId) === i).map((s) => (
                <button key={s.id} type="button" role="tab" aria-selected={(s.groupId || s.id) === selectedGroup} className={(s.groupId || s.id) === selectedGroup ? "active" : ""} onClick={() => setSku(s.id)}>
                  <span className="small muted">{s.line}</span>{s.groupLabel || s.label || s.name}
                </button>
              ))}
            </div>
            <span className="spacer" />
            {(fresh?.sku === sku ? fresh.origin === "demo" : schemes.isSample) && <SampleBadge task={schemes.task} />}
          </div>
          {selected?.groupId && <div className="toolbar">
            <span className="small muted">系列产品</span>
            <div className="sku-tabs" role="tablist" aria-label="稳分系列产品">
              {list.filter((s) => s.groupId === selected.groupId).map((s) => <button key={s.id} type="button" role="tab" aria-selected={s.id === sku} className={s.id === sku ? "active" : ""} onClick={() => setSku(s.id)}>{s.label || s.name}</button>)}
            </div>
          </div>}
          <SavedNote text={notice} onClose={() => setNotice("")} />
          <Loadable state={schemes} name="价格方案" big>{(data) => { const d = fresh?.sku === sku ? fresh : data; return <PriceBoard key={`${sku}-${JSON.stringify(d.schemes).length}-${fresh ? 1 : 0}`} sku={{ ...(list.find((s) => s.id === sku) || list[0]), unitOrig: d.unitOrig, tiers: d.tiers }} data={d} onSaved={(back, text = "") => { setFresh(back); setNotice(text); }} onEdit={() => setNotice("")} />; }}</Loadable>
        </>
      )}
    </Loadable>
  );
}

// 保存：整张矩阵预览 → 确认 → 回读。「已记录」是无生效承诺的价格档案。
const SCHEME_KEYS = ["id", "name", "kind", "status", "from", "to", "prices", "gifts"];
function cleanScheme(s) {
  const out = Object.fromEntries(SCHEME_KEYS.filter((k) => s[k] !== undefined).map((k) => [k, s[k]]));
  return out;
}

function PriceBoard({ sku, data, onSaved, onEdit }) {
  const [schemes, setSchemesRaw] = useState(data.schemes);
  const [unitOrig, setUnitOrigRaw] = useState(sku.unitOrig);
  const flow = useWriteFlow();
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
  const blanks = schemes.reduce((n, s) => n + s.prices.filter((p) => p == null).length, 0);
  const body = () => ({ unitOrig, tiers, schemes: schemes.map(cleanScheme) });
  const preview = () => flow.preview(() => apiSend("POST", `/api/v3/price/schemes/preview?sku=${encodeURIComponent(sku.id)}`, body()));
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", `/api/v3/price/schemes?sku=${encodeURIComponent(sku.id)}`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      const back = await apiRead(`/api/v3/price/schemes?sku=${encodeURIComponent(sku.id)}`);
      const ok = JSON.stringify(back.schemes) === JSON.stringify(pv.value.schemes);
      if (ok) onSaved(back, `价格方案已保存，回读核对一致${back.costOrigin === "demo" ? "（成本和毛利底线仍是演示口径）" : ""}`);
      return ok;
    },
  );
  const reread = async () => { const back = await apiRead(`/api/v3/price/schemes?sku=${encodeURIComponent(sku.id)}`); flow.resolve(); onSaved({ ...back }); };
  return (
    <>
      {(data.source || data.costOrigin === "demo") && <p className="small muted">{data.source && <>价格来源：{data.source}。生效日期未提供，按档案记录。 </>}{data.costOrigin === "demo" && "成本和毛利底线仍为演示口径，毛利仅作估算。"}</p>}
      <div className="toolbar">
        {schemes.length ? <>
          <label className="select"><span>基准方案</span>
            <select value={base} onChange={(e) => setBase(e.target.value)}>{schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
          <span className="price-show">
            {schemes.map((s) => {
              const on = !hidden.includes(s.id) || s.id === base;
              return (
                <button type="button" key={s.id} className={`price-chip ${seriesClass(s)}${on ? "" : " is-off"}`} aria-pressed={on} disabled={s.id === base}
                  title={s.id === base ? "基准方案始终显示" : on ? "点击隐藏这套方案" : "点击显示这套方案"}
                  onClick={() => setHidden((old) => on ? [...old, s.id] : old.filter((x) => x !== s.id))}>
                  <i className="price-chip-box" />{s.name}
                </button>
              );
            })}
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
          <dt>写到哪里</dt><dd>工作台本地价格记录{data.costOrigin === "demo" && "；成本和毛利底线仍是演示口径"}</dd>
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
                    {s.from && !s.to && s.status !== "已记录" ? <Tag tone="neutral">长期生效</Tag> : <>
                      <Tag tone={s.status === "生效中" ? "green" : s.status === "草稿" ? "amber" : "neutral"}>{s.status}</Tag>
                      <span>{periodText(s)}</span>
                    </>}
                  </div>
                  <button type="button" className="scheme-ins" disabled={locked} aria-label={`在「${s.name}」右边插入新方案`} title="在这里插入一列新方案（复制左边一列的价格）"
                    onMouseEnter={() => setSeam(s.id)} onMouseLeave={() => setSeam(null)} onFocus={() => setSeam(s.id)} onBlur={() => setSeam(null)} onClick={() => insertAfter(s.id)}><span>+</span></button>
                  {panel === s.id && <SchemePanel scheme={s} isBase={s.id === base} locked={locked} alignRight={k > 0 && k >= visible.length - 2}
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
                  // 总价以元取整时会产生不足一元的差异；仅超出两档取整区间才提示单价倒挂。
                  const inverted = prev && !prev.empty && !v.empty && (v.price - .5) / v.h > (prev.price + .5) / prev.h;
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

      {/* 定价模拟器（用户 2026-10-19）：替换原来的课时单价折线图，先留空位，具体做法回头再讨论。 */}
      <section className="card price-sim">
        <div className="card-head"><h2><PixelIcon name="spark" /> 定价模拟器</h2></div>
        <div className="card-body"><Placeholder icon="price" title="待设计">定价模拟器放在这里，具体怎么做回头再讨论。</Placeholder></div>
      </section>
    </>
  );
}

// 列面板：原「方案设置」卡的字段搬到这里，外加设为基准、删除。基准方案不能删，要先换基准。
function SchemePanel({ scheme: x, isBase, locked, alignRight, onChange, onBase, onRemove, onClose }) {
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
      <label className="scheme-field"><span>状态</span><select className="cell-input" value={x.status} disabled={locked} onChange={(e) => onChange({ status: e.target.value })}>{["生效中", "草稿", "历史", "已记录"].map((k) => <option key={k}>{k}</option>)}</select></label>
      {x.status === "已记录" && <p className="small muted">仅作价格档案，不代表已生效；日期可留空。</p>}
      <div className="scheme-field"><span>生效期</span><span className="scheme-dates">
        <input className="cell-input date" value={x.from} placeholder="开始" aria-label="开始日期" disabled={locked} onChange={(e) => onChange({ from: e.target.value.trim() })} /> →
        <input className="cell-input date" value={x.to} placeholder="长期" aria-label="结束日期" disabled={locked} onChange={(e) => onChange({ to: e.target.value.trim() })} /></span></div>
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

// 列头生效期文字「10.15–11.30」；没有结束日期的长期方案只显示「长期生效」方框，不显示状态（用户 2026-10-19）。
const md = (d) => d.slice(5).replace("-", ".");
function periodText(s) { return !s.from ? "未设日期" : s.to ? `${md(s.from)}–${md(s.to)}` : s.status === "已记录" ? `${md(s.from)}起` : "长期生效"; }

// 方案配色（用户 2026-10-18 指定，10-19 改名）：常规价格墨色、双11价格红、新春价格橙黄、赠课价格绿；按方案名对应（编号兜底），别的表里新建同名方案也同色。
const SERIES_COLORS = { 常规价格: "ink", 双11价格: "red", 新春价格: "amber", 赠课价格: "green" };
const SERIES_IDS = { regular: "ink", d11: "red", cny: "amber", gift: "green" };
function seriesClass(s) { const color = SERIES_COLORS[s.name] || SERIES_IDS[s.id]; return color ? `has-color c-${color}` : ""; }
