import { useEffect, useMemo, useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { Button, Loadable, SampleBadge, Segmented, Tag, useToast } from "../../ui/components.jsx";
import { SAMPLE_PRICE_SKUS, SAMPLE_PRICE_SCHEMES } from "../../samples/v3.js";

// 价格（v3）：一张课时卡（5–200 小时）× 多套价格方案的矩阵。
// 比较方式：同一档跨方案（相对基准方案的差价）、同一方案跨档位（单价阶梯，倒挂标出）。
// 口径：课时单价 = 总价 ÷（课时 + 赠送），付费单价 = 总价 ÷ 课时（对应原表的「每课时单价」）。

const money = (n) => Math.round(n).toLocaleString("en-US");
const pct = (v) => `${Math.round(v * 100)}%`;
const signed = (n) => (n > 0 ? `+${money(n)}` : n < 0 ? `−${money(-n)}` : "±0");

function calc(scheme, i, tiers, unitOrig, costPerHour) {
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

export default function PricesView() {
  const skus = useApi("/api/v3/price/skus", SAMPLE_PRICE_SKUS);
  const [sku, setSku] = useState(SAMPLE_PRICE_SKUS[0].id);
  const schemes = useApi(`/api/v3/price/schemes?sku=${sku}`, SAMPLE_PRICE_SCHEMES);
  return (
    <Loadable state={skus}>
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
            <span className="spacer" />
            {(skus.isSample || schemes.isSample) && <SampleBadge task={schemes.task || skus.task} />}
          </div>
          <Loadable state={schemes}>{(data) => <PriceBoard key={sku} sku={list.find((s) => s.id === sku) || list[0]} data={data} />}</Loadable>
        </>
      )}
    </Loadable>
  );
}

function PriceBoard({ sku, data }) {
  const [schemes, setSchemes] = useState(data.schemes);
  const [base, setBase] = useState(data.schemes[0].id);
  const [show, setShow] = useState(["regular", "d11", "cny", "gift"].filter((id) => data.schemes.some((s) => s.id === id)));
  const [hover, setHover] = useState(-1);
  const [editing, setEditing] = useState(null); // { scheme, i }
  const [toast, showToast] = useToast();
  const tiers = sku.tiers;
  const visible = schemes.filter((s) => show.includes(s.id));
  const baseScheme = schemes.find((s) => s.id === base) || schemes[0];
  const c = (s, i) => calc(s, i, tiers, sku.unitOrig, data.costPerHour);
  const save = (schemeId, i, value) => {
    setSchemes((old) => old.map((s) => s.id !== schemeId ? s : { ...s, prices: s.prices.map((p, j) => (j === i ? value : p)) }));
    showToast(`已改为 ${money(value)}（示例，未写入）`);
  };
  const addScheme = () => {
    const id = `new-${Date.now()}`;
    setSchemes((old) => [...old, { id, name: "新方案", kind: "活动", status: "草稿", from: "", to: "", prices: [...baseScheme.prices], gifts: tiers.map(() => 0) }]);
    setShow((old) => [...old, id]);
    showToast("已按基准方案复制出一列草稿，直接改格子里的总价");
  };
  return (
    <>
      <div className="toolbar price-toolbar">
        <label className="select"><span>基准方案</span>
          <select value={base} onChange={(e) => setBase(e.target.value)}>{schemes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        </label>
        <span className="price-show">
          {schemes.map((s) => (
            <label key={s.id} className="chk"><input type="checkbox" checked={show.includes(s.id)} disabled={s.id === base}
              onChange={(e) => setShow((old) => e.target.checked ? [...old, s.id] : old.filter((x) => x !== s.id))} />{s.name}</label>
          ))}
        </span>
        <span className="spacer" />
        <span className="small muted">原价 {sku.unitOrig} 元/小时 · 毛利底线 {pct(data.floorMargin)} · 课时成本 {data.costPerHour} 元</span>
        <Button variant="primary" onClick={addScheme}><PixelIcon name="plus" />新增方案</Button>
      </div>

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
                    <Tag tone={s.status === "生效中" ? "green" : s.status === "草稿" ? "orange" : "neutral"}>{s.status}</Tag>
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
                      {breach && <div className="price-flag">毛利 {pct(v.margin)} · 低于底线</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted price-note">单价 = 总价 ÷（课时 + 赠送）；付费单价 = 总价 ÷ 课时；折扣 = 总价 ÷ 原价；差价相对基准方案。点击总价可以直接改，Enter 保存，Tab / ⇧Tab 换到下 / 上一档，Esc 取消。</p>
      {toast}
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

// 课时单价阶梯：每套方案一条折线（基准为粗墨线，其余细线 + 不同端点形状），悬停某一档时竖线对齐并列出各方案数值。
const MARKS = ["square", "ring", "diamond", "dot", "square", "ring"];
function UnitChart({ schemes, base, tiers, c, hover, setHover }) {
  const W = 1000, H = 190, L = 56, R = 16, T = 16, B = 30;
  const values = schemes.flatMap((s) => tiers.map((_, i) => c(s, i).unit));
  const min = Math.floor(Math.min(...values) / 50) * 50, max = Math.ceil(Math.max(...values) / 50) * 50;
  const x = (i) => L + (i * (W - L - R)) / (tiers.length - 1);
  const y = (v) => T + ((max - v) * (H - T - B)) / Math.max(1, max - min);
  const ticks = useMemo(() => { const out = []; for (let v = min; v <= max; v += 50) out.push(v); return out; }, [min, max]);
  return (
    <div className="unit-chart">
      <div className="unit-chart-head"><span className="label">课时单价阶梯（元/小时，含赠送）</span>
        <span className="unit-legend">{schemes.map((s, k) => <span key={s.id} className={s.id === base ? "is-base" : ""}><Mark kind={MARKS[k]} />{s.name}</span>)}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="课时单价随课时档位变化" onMouseLeave={() => setHover(-1)}>
        {ticks.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid-line" /><text x={L - 8} y={y(v) + 4} className="axis" textAnchor="end">{v}</text></g>)}
        {tiers.map((h, i) => <text key={h} x={x(i)} y={H - 8} className={`axis${hover === i ? " is-hot" : ""}`} textAnchor="middle">{h}h</text>)}
        {hover >= 0 && <line x1={x(hover)} x2={x(hover)} y1={T - 6} y2={H - B} className="cross" />}
        {schemes.map((s, k) => (
          <g key={s.id} className={s.id === base ? "series is-base" : "series"}>
            <polyline points={tiers.map((_, i) => `${x(i)},${y(c(s, i).unit)}`).join(" ")} />
            {tiers.map((_, i) => <MarkAt key={i} kind={MARKS[k]} cx={x(i)} cy={y(c(s, i).unit)} />)}
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
