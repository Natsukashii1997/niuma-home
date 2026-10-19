import { useState } from "react";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { MonthSwitch, StatusMark } from "../../ui/components.jsx";
import { PROMO_LINES as LINES, currentMonth, deliveryMonth } from "../../constants.js";
import PlanEditor from "./PlanEditor.jsx";
import PromosView from "./PromosView.jsx";

// 月度促销（v3）：上半是当月促销——选月份，直接在填写框里粘贴 → 解析 → 处理 → 确认；业务线按原文【…板块】自动识别，
// 上方状态块只显示各业务线本月录入情况，不用点选（用户 2026-10-19）。
// 下半是方案汇总（原促销表）。路由 marketing/plans/<月份>（旧地址后面带的业务线忽略），默认当月。
export default function PlansView({ route = [], dossier = null }) {
  const [m] = route;
  const month = /^\d{4}-\d{2}$/.test(m || "") ? m : currentMonth();
  const [rev, setRev] = useState(0); // 入库后加一，让状态和汇总重新读取
  const [editing, setEditing] = useState(null); // 录入框里识别出的业务线
  const mark = month === deliveryMonth() ? "交付月" : month === currentMonth() ? "本月" : null;
  return (
    <>
      <section className="mp-block">
        <div className="mp-head">
          <h2>当月促销</h2>
          <MonthSwitch month={month} mark={mark} onChange={(mm) => { location.hash = href("marketing", "plans", mm); }} />
          <LineStatus key={rev} month={month} editing={editing} />
        </div>
        <PlanEditor month={month} onSaved={() => setRev((n) => n + 1)} onLine={setEditing} />
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

// 业务线录入状态（只读）：每条线标出本月录入情况（已录原文 / 有 SKU 无原文 / 未录入）；录入框识别出的那条标「录入中」。
function LineStatus({ month, editing }) {
  const plans = useApi("/api/plans");
  const promos = useApi("/api/promos");
  return (
    <div className="line-status" aria-label="各业务线本月录入情况">
      {LINES.map((l) => {
        const skus = promos.data ? promos.data.filter((p) => p.month === month && p.line === l).length : 0;
        const raw = plans.data?.some((p) => p.month === month && p.line === l);
        const state = raw ? "done" : skus ? "part" : "todo";
        const hint = raw ? `已录入 · ${skus} SKU` : skus ? `${skus} SKU · 无原文` : "未录入";
        return (
          <div key={l} className={`line-status-item${l === editing ? " is-editing" : ""}`}>
            <StatusMark state={state} />
            <span>{l}</span>
            <em>{plans.data && promos.data ? hint : "…"}</em>
            {l === editing && <b>录入中</b>}
          </div>
        );
      })}
    </div>
  );
}
