import { useState } from "react";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { MonthSwitch, StatusMark } from "../../ui/components.jsx";
import { PROMO_LINES as LINES, currentMonth, deliveryMonth } from "../../constants.js";
import PlanEditor from "./PlanEditor.jsx";
import PromosView from "./PromosView.jsx";

// 月度促销（v3）：上半是当月促销——选月份、业务线，直接在填写框里粘贴 → 解析 → 处理 → 确认；
// 下半是方案汇总（原促销表）。路由 marketing/plans/<月份>/<业务线>，默认交付月、第一条业务线。
export default function PlansView({ route = [], dossier = null }) {
  const [m, l] = route;
  const month = /^\d{4}-\d{2}$/.test(m || "") ? m : deliveryMonth();
  const line = LINES.includes(l) ? l : LINES[0];
  const [rev, setRev] = useState(0); // 入库后加一，让状态和汇总重新读取
  const go = (mm, ll) => { location.hash = href("marketing", "plans", mm, ll); };
  const mark = month === deliveryMonth() ? "交付月" : month === currentMonth() ? "本月" : null;
  return (
    <>
      <section className="mp-block">
        <div className="mp-head">
          <h2>当月促销</h2>
          <MonthSwitch month={month} mark={mark} onChange={(mm) => go(mm, line)} />
          <LineSwitch key={rev} month={month} line={line} onChange={(ll) => go(month, ll)} />
        </div>
        <PlanEditor month={month} line={line} onSaved={() => setRev((n) => n + 1)} />
      </section>
      <section className="mp-block">
        <div className="mp-head">
          <h2>方案汇总</h2>
          <span className="small muted">全部月份已入库的促销 SKU；标「改」的格子与上一个有数据的月份不同</span>
        </div>
        <PromosView key={rev} dossier={dossier} />
      </section>
    </>
  );
}

// 业务线切换：每条线标出本月录入状态（已录原文 / 有 SKU 无原文 / 未录入）。
function LineSwitch({ month, line, onChange }) {
  const plans = useApi("/api/plans");
  const promos = useApi("/api/promos");
  return (
    <div className="line-switch" role="tablist" aria-label="业务线">
      {LINES.map((l) => {
        const skus = promos.data ? promos.data.filter((p) => p.month === month && p.line === l).length : 0;
        const raw = plans.data?.some((p) => p.month === month && p.line === l);
        const state = raw ? "done" : skus ? "part" : "todo";
        const hint = raw ? `已录入 · ${skus} SKU` : skus ? `${skus} SKU · 无原文` : "未录入";
        return (
          <button key={l} type="button" role="tab" aria-selected={l === line} className={l === line ? "active" : ""} onClick={() => onChange(l)}>
            <StatusMark state={state} />
            <span>{l}</span>
            <em>{plans.data && promos.data ? hint : "…"}</em>
          </button>
        );
      })}
    </div>
  );
}
