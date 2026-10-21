import { useEffect, useRef } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Loadable, SampleBadge } from "../../ui/components.jsx";
import { PROMO_FIELDS, deliveryMonth } from "../../constants.js";

// SKU 档案侧栏（用户 2026-10-19）：方案汇总里点「档案」从右侧打开，只保留「跨月政策」，按月份从上到下排，交付月在最上面。
// 政策读促销表；价格方案读价格记录接口（未接入或没有这个 SKU 时显示「—」）。
// 沿用方案汇总的「改」：和上一个有数据的月份不同就标出，悬停看旧值。

const activeIn = (s, m) => s.status !== "已记录" && Boolean(s.from) && s.from <= `${m}-31` && (!s.to || s.to >= `${m}-01`);

export default function SkuDrawer({ line, sku, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  const promos = useApi("/api/promos");
  const skus = useApi("/api/v3/price/skus");
  const priceSku = skus.data?.find((s) => s.line === line && (s.name === sku || s.aliases?.includes(sku))) || null;
  const schemes = useApi(priceSku ? `/api/v3/price/schemes?sku=${encodeURIComponent(priceSku.id)}` : null);
  const sample = priceSku && schemes.isSample ? schemes : null;
  return (
    <dialog ref={ref} className="sku-drawer" aria-label={`${sku} 跨月政策`} onClose={onClose} onCancel={onClose}
      onClick={(event) => { if (event.target === ref.current) ref.current.close(); }}>
      <div className="card-head">
        <h2><PixelIcon name="calendar" />{sku}<span className="sku-drawer-line">{line} · 跨月政策</span></h2>
        <button type="button" className="icon-btn" onClick={() => ref.current.close()} aria-label="关闭"><PixelIcon name="close" /></button>
      </div>
      <div className="sku-drawer-body">
        <p className="legend small"><i className="changed-dot" /> 与上一个有数据的月份不同，悬停看旧值{sample && <SampleBadge task={sample.task} />}</p>
        <Loadable state={promos} name="跨月政策">
          {(rows) => <PolicyMonths line={line} rows={rows.filter((r) => r.line === line && r.sku === sku)}
            schemes={priceSku && schemes.data ? schemes.data.schemes || [] : null} />}
        </Loadable>
      </div>
    </dialog>
  );
}

function PolicyMonths({ line, rows, schemes }) {
  const dm = deliveryMonth();
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  const months = [...new Set([...rows.map((r) => r.month), dm])].sort(); // 先按时间正序算「改」，显示时倒过来
  const fields = [
    ...PROMO_FIELDS.map(([f, label]) => ({ label, value: (m) => byMonth.get(m)?.[f] ?? null })),
    {
      label: "价格方案",
      value: (m) => {
        const list = (schemes || []).filter((s) => activeIn(s, m));
        return list.length ? list.map((s) => s.status === "草稿" ? `${s.name}（草稿）` : s.name).join(" / ") : null;
      },
    },
  ];
  const prev = new Map();
  const cells = months.map((m) => ({
    month: m,
    cells: fields.map((field) => {
      const v = field.value(m);
      const last = prev.get(field.label);
      const changed = v !== null && last && last.v !== v ? last : null;
      if (v !== null) prev.set(field.label, { m, v });
      return { label: field.label, v, changed };
    }),
  })).reverse();

  return cells.map(({ month, cells: list }) => {
    const empty = !byMonth.has(month);
    return (
      <section key={month} className={`sku-month${month === dm ? " is-dm" : ""}`}>
        <h3>{month}{month === dm && <b>交付月</b>}
          {empty && <a className="link" href={href("marketing", "plans", month, line)}>去录入方案</a>}</h3>
        <dl className="sku-fields">
          {list.map(({ label, v, changed }) => <div key={label} className="sku-field">
            <dt>{label}</dt>
            <dd className={[v === null && "none", v === "无" && "none", changed && "changed"].filter(Boolean).join(" ")}
              title={changed ? `${changed.m}：${changed.v}` : undefined}>
              {v === null ? (label === "价格方案" ? "—" : "未录入") : v}
            </dd>
          </div>)}
        </dl>
      </section>
    );
  });
}
