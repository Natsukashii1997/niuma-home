import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Loadable, Tag } from "../../ui/components.jsx";
import { LINES, currentMonth, monthLabel } from "../../constants.js";

// 方案卡片墙：每月一行，每条业务线一张卡片，显示录入状态。
export default function PlansView() {
  const promos = useApi("/api/promos");
  const plans = useApi("/api/plans");
  return (
    <Loadable state={promos}>
      {(promoRows) => (
        <Loadable state={plans}>
          {(planRows) => <PlanWall promos={promoRows} plans={planRows} />}
        </Loadable>
      )}
    </Loadable>
  );
}

function PlanWall({ promos, plans }) {
  const months = [...new Set([currentMonth(), ...promos.map((p) => p.month), ...plans.map((p) => p.month)])].sort().reverse();
  return (
    <div className="stack">
      {months.map((month) => (
        <section key={month}>
          <h3 className="section-title">{monthLabel(month)}</h3>
          <div className="grid-3">
            {LINES.map((line) => {
              const skuCount = promos.filter((p) => p.month === month && p.line === line).length;
              const hasPlan = plans.some((p) => p.month === month && p.line === line);
              return (
                <a key={line} className="plan-card" data-dither="" href={href("marketing", "plans", month, line)}>
                  <div className="plan-card-top">
                    <strong>{line}</strong>
                    <PixelIcon name="right" size={16} className="muted" />
                  </div>
                  <div className="plan-card-meta">
                    {hasPlan ? (
                      <Tag tone="green">已录入原文</Tag>
                    ) : skuCount ? (
                      <Tag tone="blue">有数据 · 无原文</Tag>
                    ) : (
                      <Tag>未录入</Tag>
                    )}
                    <span className="muted">{skuCount ? `${skuCount} 个 SKU` : "—"}</span>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
