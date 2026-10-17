import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import Thumb from "../../ui/Thumb.jsx";
import { Button, Loadable, PageHeader, Placeholder, SampleBadge, StatStrip, Tag, useToast } from "../../ui/components.jsx";
import { PROMO_FIELDS, currentMonth, deliveryMonth, shiftMonth, shortMonth } from "../../constants.js";
import { SAMPLE_PRICE_CHARTS } from "../../samples/v3.js";
import { calc, money, pct, signed } from "./PricesView.jsx";

// SKU 档案（第三轮提案 5）：一个 SKU 一页说清——每个月的政策、价格方案、单价阶梯和价格图版本。
// 不新增汇总接口：政策读促销表（真实）；价格方案读价格接口；价格图读 /api/v3/price/charts。后两者未实现时显示示例。
// 跨月表沿用方案汇总的「改」：和上一个有数据的月份不同就标出，悬停看旧值。

const md = (d) => d.slice(5);
const activeIn = (s, m) => Boolean(s.from) && s.from <= `${m}-31` && (!s.to || s.to >= `${m}-01`);

// 「¥4300（赠课版）」→ { num: 4300, note: "赠课版" }；读不出数字时 num 为 null。
function parsePrice(text = "") {
  const n = text.match(/\d[\d,]*/);
  const note = text.match(/[（(]([^）)]+)[）)]/);
  return { num: n ? Number(n[0].replace(/,/g, "")) : null, note: note ? note[1] : "" };
}

export default function SkuView({ route = [] }) {
  const [line = "", name = ""] = route;
  const promos = useApi("/api/promos");
  const skus = useApi("/api/v3/price/skus");
  const priceSku = skus.data?.find((s) => s.line === line && s.name === name) || null;
  const schemes = useApi(priceSku ? `/api/v3/price/schemes?sku=${encodeURIComponent(priceSku.id)}` : null);
  const charts = useApi(`/api/v3/price/charts?line=${encodeURIComponent(line)}&sku=${encodeURIComponent(name)}`, SAMPLE_PRICE_CHARTS);
  const sources = [promos, skus, charts, ...(priceSku ? [schemes] : [])];
  const failed = sources.find((s) => s.error);
  const state = failed || (sources.some((s) => s.loading) ? { loading: true } : { data: true });
  const price = priceSku && schemes.data ? { ...schemes.data, sku: priceSku } : null; // 接口里的 sku 是 id，这里换成完整的 SKU（含档位、原价）
  const chartData = charts.isSample && (charts.data.line !== line || charts.data.sku !== name) ? null : charts.data || null; // 示例只对应示例里的那个 SKU
  // 「示例」只在页面上真的显示了示例数据时才标
  const sample = (price && [skus, schemes].find((s) => s.isSample)) || (chartData && charts.isSample && charts);
  const [toast, showToast] = useToast();
  const rows = (promos.data || []).filter((r) => r.line === line && r.sku === name).sort((a, b) => a.month.localeCompare(b.month));
  async function copyPolicy() {
    const text = rows.map((r) => `${r.month} ${r.line} · ${r.sku}\n${PROMO_FIELDS.map(([f, l]) => `${l}：${r[f]}`).join("\n")}`).join("\n\n");
    try { await navigator.clipboard.writeText(text); showToast(`已复制 ${rows.length} 个月的政策`); }
    catch { showToast("复制失败：浏览器不允许写剪贴板"); }
  }
  const actions = <>
    {sample && <SampleBadge task={sample.task} />}
    <Button disabled={!rows.length} onClick={copyPolicy}><PixelIcon name="copy" />复制各月政策</Button>
    {priceSku && <a className="btn btn-primary" href={href("marketing", "prices", priceSku.id)}><PixelIcon name="edit" />打开价格记录</a>}
  </>;
  return (
    <div className="sku-page">
      <a className="back-link" href={href("marketing", "prices")}><PixelIcon name="left" />价格记录</a>
      <PageHeader title={<><PixelIcon name="price" />{name || "SKU"}</>} subtitle={`${line} · SKU 档案：每个月的政策、价格方案和价格图，一页看齐`} actions={actions} />
      <Loadable state={state} name="SKU 档案" big>
        {() => {
          if (!rows.length && !price) return (
            <Placeholder icon="search" title={`没找到「${line} · ${name}」`} action={<a className="btn" href={href("marketing", "plans")}>去方案汇总</a>}>
              促销表和价格记录里都没有这个 SKU。
            </Placeholder>
          );
          return <SkuBoard line={line} rows={rows} price={price} charts={chartData} />;
        }}
      </Loadable>
      {toast}
    </div>
  );
}

function SkuBoard({ line, rows, price, charts }) {
  const dm = deliveryMonth();
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  // 列：从最早有数据的月份（最多往前 5 个月，至少 3 个月）到交付月。
  let start = rows[0]?.month || dm;
  if (start < shiftMonth(dm, -5)) start = shiftMonth(dm, -5);
  if (start > shiftMonth(dm, -3)) start = shiftMonth(dm, -3);
  const end = rows.length && rows[rows.length - 1].month > dm ? rows[rows.length - 1].month : dm;
  const months = [];
  for (let m = start; m <= end; m = shiftMonth(m, 1)) months.push(m);

  const schemes = price?.schemes || [];
  const base = schemes.find((s) => s.kind === "常规" && activeIn(s, dm)) || schemes.find((s) => s.kind === "常规") || schemes[0];
  const target = schemes.find((s) => s.kind === "活动" && activeIn(s, dm)) || base;
  const versions = charts ? [...charts.versions].sort((a, b) => a.month.localeCompare(b.month)) : [];
  const chartOf = (m) => versions.find((v) => v.month === m);

  return (
    <>
      <StatStrip items={stats({ dm, rows, price, base, target, versions })} />
      <PolicyTable dm={dm} line={line} months={months} byMonth={byMonth} schemes={price ? schemes : null} chartOf={charts ? chartOf : null} />
      <div className="cols-6-6 sku-split">
        <Ladder dm={dm} price={price} base={base} target={target} />
        <ChartVersions versions={versions.slice(-4)} known={Boolean(charts)} dm={dm} />
      </div>
    </>
  );
}

function stats({ dm, rows, price, base, target, versions }) {
  const cm = currentMonth();
  const past = rows.filter((r) => r.month <= cm).reverse();
  const cur = past[0];
  let since = cur?.month;
  for (const r of past.slice(1)) { if (r.price !== cur.price) break; since = r.month; }
  const p = parsePrice(cur?.price);
  const items = [{
    label: "当前正价",
    value: p.num === null ? "—" : `¥${money(p.num)}`,
    foot: cur ? [p.num === null ? cur.price : p.note, `${shortMonth(since)}起未变`].filter(Boolean).join(" · ") : "促销表里还没有",
  }];
  if (price && target) {
    const c = (s, i) => calc(s, i, price.sku.tiers, price.sku.unitOrig, price.costPerHour);
    const tiers = price.sku.tiers;
    const own = target !== base;
    const unit = c(target, 0).unit;
    const breaches = tiers.map((_, i) => c(target, i)).filter((v) => v.margin < price.floorMargin);
    const worst = breaches.sort((a, b) => a.margin - b.margin)[0];
    items.push(
      { label: `${shortMonth(dm)}价格方案`, value: own ? target.status : "沿用常规", tone: own && target.status === "草稿" ? "warn" : undefined,
        foot: own ? `${target.name} · ${md(target.from)} → ${target.to ? md(target.to) : "长期"}` : base.name },
      { label: `${tiers[0]}h 单价`, value: money(unit), unit: "/h", foot: own ? `比${base.name} ${signed(unit - c(base, 0).unit)}/h` : base.name },
      { label: "毛利底线", value: String(breaches.length), unit: " 档低于", tone: breaches.length ? "risk" : undefined,
        foot: worst ? `${worst.h}h 毛利 ${pct(worst.margin)} · 底线 ${pct(price.floorMargin)}` : `各档毛利都不低于 ${pct(price.floorMargin)}` },
    );
  } else {
    items.push({ label: `${shortMonth(dm)}价格方案`, value: "—", tone: "muted", foot: "价格记录里还没有这个 SKU" });
  }
  const files = versions.filter((v) => v.state === "file");
  const atDm = versions.find((v) => v.month === dm);
  items.push({
    label: "价格图",
    value: files.length ? `v${files[files.length - 1].version}` : "—",
    tone: files.length ? undefined : "muted",
    foot: !versions.length ? "还对不上这个 SKU" : !atDm ? `${shortMonth(dm)}还没有` : atDm.state === "file" ? `${shortMonth(dm)}已交付 v${atDm.version}` : `${shortMonth(dm)}待交付`,
  });
  return items;
}

// 跨月政策：行是字段，列是月份，交付月一列墨底。v 是用来比较「改」的值；没有数据时 v 为 null。
function PolicyTable({ dm, line, months, byMonth, schemes, chartOf }) {
  const rowsDef = [
    ...PROMO_FIELDS.map(([f, label], k) => ({
      label,
      cell: (m) => {
        const r = byMonth.get(m);
        if (r) return { v: r[f], node: <span className="clamp-3">{r[f]}</span>, full: r[f] };
        if (m !== dm) return { v: null, node: "未录入" };
        return { v: null, node: k === 0 ? <a className="link" href={href("marketing", "plans", dm, line)}>去录入方案</a> : "—" };
      },
    })),
    {
      label: "价格方案",
      cell: (m) => {
        if (!schemes) return { v: null, node: "—" };
        const list = schemes.filter((s) => activeIn(s, m));
        if (!list.length) return { v: null, node: "—" };
        return { v: list.map((s) => s.name).join(" / "), node: list.map((s) => <span key={s.id} className="sku-scheme">{s.status === "草稿" && <Tag tone="amber">草稿</Tag>}{s.name}</span>) };
      },
    },
    {
      label: "价格图",
      cell: (m) => {
        if (!chartOf) return { v: null, node: "未接入" };
        const c = chartOf(m);
        if (!c) return { v: null, node: "—" };
        if (c.state !== "file") return { v: null, node: <span className="warn-text">待交付</span> };
        return { v: `v${c.version}`, node: <span className="tnum">v{c.version}</span> };
      },
    },
    {
      label: "关联需求",
      noDiff: true,
      cell: (m) => {
        const list = (schemes || []).filter((s) => s.need && activeIn(s, m));
        return list.length ? { v: list[0].need, node: list.map((s) => <span key={s.id} className="sku-scheme">{s.need}{s.status === "草稿" && <Tag tone="amber">草稿</Tag>}</span>) } : { v: null, node: "—" };
      },
    },
  ];
  return (
    <section className="card sku-policy">
      <div className="card-head"><h2><PixelIcon name="calendar" />跨月政策</h2>
        <div className="card-extra"><span className="legend"><i className="changed-dot" /> 与上一个有数据的月份不同，悬停看旧值</span></div></div>
      <div className="table-wrap">
        <table className="grid">
          <colgroup><col style={{ width: 108 }} />{months.map((m) => <col key={m} />)}</colgroup>
          <thead><tr><th aria-label="字段" />{months.map((m) => <th key={m} className={m === dm ? "is-dm" : ""}>{m}{m === dm && <b>交付月</b>}</th>)}</tr></thead>
          <tbody>
            {rowsDef.map((row) => {
              let prev = null;
              return (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  {months.map((m) => {
                    const c = row.cell(m);
                    const changed = !row.noDiff && c.v !== null && prev && prev.v !== c.v;
                    const title = changed ? `${prev.m}：${prev.v}` : c.full && c.full.length > 40 ? c.full : undefined;
                    if (c.v !== null) prev = { m, v: c.v };
                    return <td key={m} className={[m === dm && "is-dm", changed && "changed", c.v === null && "todo"].filter(Boolean).join(" ")} title={title}>{c.node}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// 单价阶梯：交付月的活动方案对比常规方案；交付月没有活动方案时只看常规方案。
function Ladder({ dm, price, base, target }) {
  const head = <div className="card-head"><h2><PixelIcon name="trend" />单价阶梯{price && ` · ${target !== base ? `${target.name} vs ${base.name}` : base.name}`}</h2>
    <div className="card-extra"><span className="small muted">元/小时，含赠送</span></div></div>;
  if (!price || !base) return <section className="card">{head}<div className="card-body"><Placeholder icon="price" title="价格记录里还没有这个 SKU">录入价格方案后，这里按课时档对比单价和毛利。</Placeholder></div></section>;
  const { tiers, unitOrig } = price.sku;
  const c = (s, i) => calc(s, i, tiers, unitOrig, price.costPerHour);
  const own = target !== base;
  return (
    <section className="card sku-ladder">
      {head}
      <div className="table-wrap">
        <table className="grid price-matrix">
          <thead><tr><th className="r">课时</th><th className="r">{base.name}</th>{own && <><th className="r">{target.name}</th><th className="r">差</th></>}<th>毛利{own ? ` · ${shortMonth(dm)}` : ""}</th></tr></thead>
          <tbody>
            {tiers.map((h, i) => {
              const b = c(base, i), t = c(target, i);
              return (
                <tr key={h}>
                  <th scope="row" className="r tier">{h}<small>h</small></th>
                  <td className="r">{money(b.unit)}</td>
                  {own && <><td className="r">{money(t.unit)}</td><td className="r">{signed(t.unit - b.unit)}</td></>}
                  <td>{t.margin < price.floorMargin ? <span className="risk-text">{pct(t.margin)} · 低于底线</span> : <span className="muted">{pct(t.margin)}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChartVersions({ versions, known, dm }) {
  return (
    <section className="card">
      <div className="card-head"><h2><PixelIcon name="image" />价格图版本</h2>
        <div className="card-extra"><a className="link" href={href("marketing", "materials")}>物料墙<PixelIcon name="right" /></a></div></div>
      <div className="card-body">
        {!known ? (
          <Placeholder icon="image" title="价格图还对不上这个 SKU">物料按「月份 / 类型」整理，不分 SKU；对应关系等接口给出（V3-接口清单 · 价格图版本）。</Placeholder>
        ) : !versions.length ? (
          <Placeholder icon="image" title="还没有价格图">物料墙里还没有这个 SKU 的价格图。</Placeholder>
        ) : (
          <div className="ver-strip">
            {versions.map((v) => (
              <figure key={v.month}>
                {v.state === "file"
                  ? <Thumb src={v.thumb} kind="poster" title="价格图" big={v.big} />
                  : <span className="ver-pend"><PixelIcon name="clock" />待交付{v.note && <span className="small">{v.note}</span>}</span>}
                <figcaption>{shortMonth(v.month)}{v.state === "file" && ` · v${v.version}`}{v.month === dm && " · 交付月"}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
