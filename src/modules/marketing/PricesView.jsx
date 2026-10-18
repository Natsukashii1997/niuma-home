import { useEffect, useMemo, useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiRead, apiSend, useApi } from "../../api.js";
import { SavedNote, WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { deliveryMonth } from "../../constants.js";
import { href } from "../../router.js";
import { Button, Loadable, SampleBadge, Tag } from "../../ui/components.jsx";

// 价格（v3）：一张课时卡（5–200 小时）× 多套价格方案的矩阵。
// 比较方式：同一档跨方案（相对基准方案的差价）、同一方案跨档位（单价阶梯，倒挂标出）。
// 口径：课时单价 = 总价 ÷（课时 + 赠送），付费单价 = 总价 ÷ 课时（对应原表的「每课时单价」）。

export const money = (n) => Math.round(n).toLocaleString("en-US");
export const pct = (v) => `${Math.round(v * 100)}%`;
export const signed = (n) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : "±0");

export function calc(scheme, i, tiers, unitOrig, costPerHour) {
  const h = tiers[i], gift = scheme.gifts[i] || 0, price = scheme.prices[i];
  const orig = h * unitOrig;
  return {
    h, gift, price, orig,
    unit: price / (h + gift),
    paid: price / h,
    discount: price / orig,
    subsidy: orig - price,
    margin: (price - costPerHour * (h + gift)) / price,
  };
}

// 路由 marketing/prices/<SKU id>：从 SKU 档案、⌘K 进来时直接选中该 SKU。
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
                  <span className="small muted">{s.line}</span>{s.name}
                </button>
              ))}
            </div>
            {list.filter((s) => s.id === sku).map((s) => <a key={s.id} className="link link-btn" href={href("marketing", "sku", s.line, s.name)}>{s.name} 档案<PixelIcon name="right" /></a>)}
            <span className="spacer" />
            {(skus.isSample || schemes.isSample) && <SampleBadge task={schemes.task || skus.task} />}
          </div>
          <SavedNote text={notice} onClose={() => setNotice("")} />
          <Loadable state={schemes} name="价格方案" big>{(data) => { const d = fresh?.sku === sku ? fresh : data; return <PriceBoard key={`${sku}-${JSON.stringify(d.schemes).length}-${fresh ? 1 : 0}`} sku={list.find((s) => s.id === sku) || list[0]} data={d} onSaved={(back, text = "") => { setFresh(back); setNotice(text); }} onEdit={() => setNotice("")} />; }}</Loadable>
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
  const flow = useWriteFlow();
  const needsState = useApi(`/api/v3/needs?month=${deliveryMonth()}`);
  const adoptedNeeds = (needsState.data?.needs || []).filter((n) => n.status === "已采纳");
  const setSchemes = (fn) => { if (flow.busy || flow.phase === "unknown") return; setSchemesRaw(fn); flow.reset(); onEdit(); };
  const setScheme = (id, patch) => setSchemes((old) => old.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const dirty = JSON.stringify(schemes) !== JSON.stringify(data.schemes);
  const [base, setBase] = useState(data.schemes[0].id);
  const [show, setShow] = useState(["regular", "d11", "cny", "gift"].filter((id) => data.schemes.some((s) => s.id === id)));
  const [hover, setHover] = useState(-1);
  const [editing, setEditing] = useState(null); // { scheme, i }
  const tiers = sku.tiers;
  const visible = schemes.filter((s) => show.includes(s.id));
  const baseScheme = schemes.find((s) => s.id === base) || schemes[0];
  const c = (s, i) => calc(s, i, tiers, sku.unitOrig, data.costPerHour);
  const save = (schemeId, i, value) => setSchemes((old) => old.map((s) => s.id !== schemeId ? s : { ...s, prices: s.prices.map((p, j) => (j === i ? value : p)) }));
  const addScheme = () => {
    const id = `new-${Date.now()}`;
    const dm = deliveryMonth(), [y, m] = dm.split("-").map(Number);
    setSchemes((old) => [...old, { id, name: "新方案", kind: "活动", status: "草稿", from: `${dm}-01`, to: `${dm}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`, prices: [...baseScheme.prices], gifts: tiers.map(() => 0) }]);
    setShow((old) => [...old, id]);
  };
  const isBreach = (s) => tiers.some((_, i) => c(s, i).margin < data.floorMargin);
  const body = () => ({ unitOrig: sku.unitOrig, tiers, schemes: schemes.map(cleanScheme) });
  const preview = () => flow.preview(() => apiSend("POST", `/api/v3/price/schemes/preview?sku=${encodeURIComponent(sku.id)}`, body()));
  const confirm = () => flow.confirm(
    (pv) => apiSend("PUT", `/api/v3/price/schemes?sku=${encodeURIComponent(sku.id)}`, { previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => {
      const back = await apiRead(`/api/v3/price/schemes?sku=${encodeURIComponent(sku.id)}`);
      const ok = JSON.stringify(back.schemes) === JSON.stringify(pv.value.schemes);
      if (ok) onSaved(back, "价格方案已保存，回读核对一致（成本和毛利底线仍是演示口径）");
      return ok;
    },
  );
  const reread = async () => { const back = await apiRead(`/api/v3/price/schemes?sku=${encodeURIComponent(sku.id)}`); flow.resolve(); onSaved({ ...back }); };
  return (
    <>
      <div className="toolbar">
        <label className="select"><span>基准方案</span>
          <select value={base} onChange={(e) => setBase(e.target.value)}>{schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <span className="price-show">
          {schemes.map((s, k) => (
            <label key={s.id} className="chk"><input type="checkbox" checked={show.includes(s.id)} disabled={s.id === base}
              onChange={(e) => setShow((old) => e.target.checked ? [...old, s.id] : old.filter((x) => x !== s.id))} /><Mark kind={MARKS[k]} />{s.name}</label>
          ))}
        </span>
        <span className="spacer" />
        <span className="small muted">原价 {sku.unitOrig} 元/小时 · 毛利底线 {pct(data.floorMargin)} · 课时成本 {data.costPerHour} 元</span>
        <Button onClick={addScheme} disabled={flow.busy || flow.phase === "unknown"}><PixelIcon name="plus" />新增方案</Button>
        <Button variant="primary" disabled={!dirty || flow.busy || flow.phase === "unknown"} onClick={preview}><PixelIcon name="eye" />预览保存</Button>
      </div>
      {dirty && flow.phase === "idle" && <p className="small warn-text price-dirty">有改动还没保存：点「预览保存」生成预览，确认后才写入。</p>}
      <WriteBox flow={flow} title="价格方案保存预览" onConfirm={confirm} onRepreview={preview} onReread={reread}>
        {(pv) => <dl className="kv">
          <dt>SKU</dt><dd>{sku.line} · {sku.name}</dd>
          <dt>方案</dt><dd>{pv.value.schemes.map((x) => `${x.name}（${x.status}）`).join("、")}</dd>
          <dt>关联需求</dt><dd>{pv.value.schemes.filter((x) => x.need).map((x) => `${x.name} → ${x.need}`).join("；") || "无"}</dd>
          <dt>破底线原因</dt><dd>{pv.value.schemes.filter((x) => x.breachReason).map((x) => `${x.name}：${x.breachReason}`).join("；") || "无"}</dd>
          <dt>写到哪里</dt><dd>工作台本地价格记录；成本和毛利底线仍是演示口径，页面继续标「示例」</dd>
        </dl>}
      </WriteBox>

      <UnitChart schemes={visible} base={base} tiers={tiers} c={c} hover={hover} setHover={setHover} />

      <div className="table-wrap price-matrix-wrap">
        <table className="grid price-matrix">
          <thead>
            <tr>
              <th className="r">课时</th><th className="r">原价</th>
              {visible.map((s) => (
                <th key={s.id} className={`scheme-head${s.id === base ? " is-base" : ""}`}>
                  <div className="scheme-name">{s.name}{s.id === base && <em>基准</em>}</div>
                  <div className="scheme-meta">
                    <Tag tone={s.status === "生效中" ? "green" : s.status === "草稿" ? "amber" : "neutral"}>{s.status}</Tag>
                    <span>{s.from ? `${s.from.slice(5)} → ${s.to ? s.to.slice(5) : "长期"}` : "未设日期"}</span>
                  </div>
                  {s.need && <div className="scheme-need"><PixelIcon name="target" />{s.need}</div>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map((h, i) => (
              <tr key={h} className={hover === i ? "is-hover" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)}>
                <th scope="row" className="r tier">{h}<small>h</small></th>
                <td className="r muted tnum">{money(h * sku.unitOrig)}</td>
                {visible.map((s) => {
                  const v = c(s, i), b = c(baseScheme, i);
                  const prev = i > 0 ? c(s, i - 1) : null;
                  const inverted = prev && v.paid > prev.paid;
                  const breach = v.margin < data.floorMargin;
                  const isEdit = editing && editing.scheme === s.id && editing.i === i;
                  return (
                    <td key={s.id} className={`price-cell${breach ? " is-breach" : ""}${s.id === base ? " is-base" : ""}`}>
                      {isEdit ? (
                        <PriceInput value={v.price} onDone={(val, move) => { if (val !== null && val !== v.price) save(s.id, i, val); setEditing(move && i + move >= 0 && i + move < tiers.length ? { scheme: s.id, i: i + move } : null); }} />
                      ) : (
                        <button type="button" className="price-total" onClick={() => setEditing({ scheme: s.id, i })} title="点击修改总价">{money(v.price)}</button>
                      )}
                      <div className="price-sub">
                        <span title="课时单价（含赠送）">{money(v.unit)}/h</span>
                        {v.gift > 0 && <span className="gift" title="赠送课时">+{v.gift}h · 付费 {money(v.paid)}/h</span>}
                        <span title="优惠折扣">{pct(v.discount)}</span>
                      </div>
                      {s.id !== base && <div className={`price-diff${v.price < b.price ? " is-down" : ""}`}>{signed(v.price - b.price)}<span> · 单价 {signed(v.unit - b.unit)}</span></div>}
                      {inverted && <div className="price-flag">付费单价高于上一档</div>}
                      {breach && <div className="price-flag is-risk">毛利 {pct(v.margin)} · 低于底线</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted price-note">单价 = 总价 ÷（课时 + 赠送）；付费单价 = 总价 ÷ 课时；折扣 = 总价 ÷ 原价；差价相对基准方案。点击总价可以直接改，Enter 保存，Tab / ⇧Tab 换到下 / 上一档，Esc 取消。</p>
      <section className="card scheme-settings">
        <div className="card-head"><h2><PixelIcon name="edit" />方案设置</h2><span className="small muted">活动方案要关联一条已采纳的主线需求；低于毛利底线的方案要写原因</span></div>
        <table className="grid compact">
          <thead><tr><th>名称</th><th>类型</th><th>状态</th><th>生效期</th><th>关联需求</th><th>破底线原因</th></tr></thead>
          <tbody>{schemes.map((x) => {
            const breach = isBreach(x);
            return (
              <tr key={x.id}>
                <td><input className="cell-input" value={x.name} onChange={(e) => setScheme(x.id, { name: e.target.value })} /></td>
                <td><select className="cell-input" value={x.kind} onChange={(e) => setScheme(x.id, { kind: e.target.value })}>{["常规", "活动", "赠课"].map((k) => <option key={k}>{k}</option>)}</select></td>
                <td><select className="cell-input" value={x.status} onChange={(e) => setScheme(x.id, { status: e.target.value })}>{["生效中", "草稿", "历史"].map((k) => <option key={k}>{k}</option>)}</select></td>
                <td className="nowrap"><input className="cell-input date" value={x.from} placeholder="开始" onChange={(e) => setScheme(x.id, { from: e.target.value.trim() })} /> → <input className="cell-input date" value={x.to} placeholder="长期" onChange={(e) => setScheme(x.id, { to: e.target.value.trim() })} /></td>
                <td>{x.kind === "活动" || x.needId ? (
                  <select className="cell-input" value={x.needId || ""} onChange={(e) => { const n = adoptedNeeds.find((k) => k.id === e.target.value); setScheme(x.id, n ? { needId: n.id, need: `${n.seg} · ${n.node}` } : { needId: "", need: "" }); }}>
                    <option value="">{adoptedNeeds.length ? "选一条已采纳需求" : "还没有已采纳需求"}</option>
                    {adoptedNeeds.map((n) => <option key={n.id} value={n.id}>{n.seg} · {n.node}</option>)}
                  </select>) : <span className="muted small">—</span>}
                  {x.need && !x.needId && <span className="small warn-text">原文「{x.need}」不是已采纳需求，保存前要重新选</span>}</td>
                <td>{breach ? <input className="cell-input" value={x.breachReason || ""} placeholder="必填：为什么低于底线" onChange={(e) => setScheme(x.id, { breachReason: e.target.value })} /> : <span className="muted small">—</span>}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </section>
    </>
  );
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

// 课时单价阶梯：每套方案一条折线。默认只突出基准（粗墨线），悬停或点选图例的方案画成橙线，其余是浅灰细线（二次评审 P2-6）；
// 悬停某一档时竖线对齐并列出各方案数值。
const MARKS = ["square", "ring", "diamond", "dot", "square", "ring"];
function UnitChart({ schemes, base, tiers, c, hover, setHover }) {
  const W = 1000, H = 190, L = 56, R = 16, T = 16, B = 30;
  const values = schemes.flatMap((s) => tiers.map((_, i) => c(s, i).unit));
  const min = Math.floor(Math.min(...values) / 50) * 50, max = Math.ceil(Math.max(...values) / 50) * 50;
  const x = (i) => L + (i * (W - L - R)) / (tiers.length - 1);
  const y = (v) => T + ((max - v) * (H - T - B)) / Math.max(1, max - min);
  const ticks = useMemo(() => { const out = []; for (let v = min; v <= max; v += 50) out.push(v); return out; }, [min, max]);
  const [pin, setPin] = useState(null);
  const [peek, setPeek] = useState(null);
  const focus = peek || pin;
  const order = [...schemes].sort((a, b) => rank(a.id) - rank(b.id)); // 突出的线画在最上面
  function rank(id) { return id === focus ? 2 : id === base ? 1 : 0; }
  return (
    <div className="unit-chart">
      <div className="unit-chart-head"><span className="label">课时单价阶梯（元/小时，含赠送）</span>
        <span className="unit-legend">{schemes.map((s, k) => (
          <button type="button" key={s.id} className={`${s.id === base ? "is-base" : ""}${s.id === focus && s.id !== base ? " is-focus" : ""}`} aria-pressed={pin === s.id} title="点一下固定高亮，再点取消"
            onMouseEnter={() => setPeek(s.id)} onMouseLeave={() => setPeek(null)} onClick={() => setPin(pin === s.id ? null : s.id)}><Mark kind={MARKS[k]} />{s.name}</button>
        ))}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="课时单价随课时档位变化" onMouseLeave={() => setHover(-1)}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid-line" /><text x={L - 8} y={y(v) + 4} className="axis" textAnchor="end">{v}</text></g>)}
        {tiers.map((h, i) => <text key={h} x={x(i)} y={H - 8} className={`axis${hover === i ? " is-hot" : ""}`} textAnchor="middle">{h}h</text>)}
        {hover >= 0 && <line x1={x(hover)} x2={x(hover)} y1={T - 6} y2={H - B} className="cross" />}
        {order.map((s) => (
          <g key={s.id} className={s.id === base ? "series is-base" : s.id === focus ? "series is-focus" : "series"}>
            <polyline points={tiers.map((_, i) => `${x(i)},${y(c(s, i).unit)}`).join(" ")} />
            {tiers.map((_, i) => <MarkAt key={i} kind={MARKS[schemes.indexOf(s)]} cx={x(i)} cy={y(c(s, i).unit)} />)}
          </g>
        ))}
        {tiers.map((_, i) => <rect key={i} x={x(i) - (W - L - R) / (tiers.length - 1) / 2} y={0} width={(W - L - R) / (tiers.length - 1)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />)}
        {hover >= 0 && (() => {
          const bx = Math.min(x(hover) + 10, W - 190), rows = schemes.map((s) => [s.name, money(c(s, hover).unit)]);
          return (
            <g className="tip" pointerEvents="none">
              <rect x={bx} y={T} width={180} height={18 + rows.length * 16} />
              <text x={bx + 8} y={T + 14} className="tip-title">{tiers[hover]} 小时</text>
              {rows.map(([n, v], j) => <text key={n} x={bx + 8} y={T + 30 + j * 16} className="tip-row">{n}<tspan x={bx + 172} textAnchor="end">{v}</tspan></text>)}
            </g>
          );
        })()}
      </svg>
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
