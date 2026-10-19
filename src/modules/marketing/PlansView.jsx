import { useEffect, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Button, MonthSwitch, StatusMark, useToast } from "../../ui/components.jsx";
import { LINES, PROMO_LINES, currentMonth, deliveryMonth } from "../../constants.js";
import PlanEditor from "./PlanEditor.jsx";
import PromosView from "./PromosView.jsx";

// 月度促销（v3）：上半是当月促销——选月份，直接在填写框里粘贴 → 解析 → 处理 → 确认；业务线按原文【…板块】自动识别，
// 上方状态块只显示各业务线本月录入情况，不用点选（用户 2026-10-19）。
// 当月已录入原文时，上半先显示三个原文框（大学辅导 · 国际课程 · 申诉服务，一行排开，可一键复制）；点「粘贴新方案」才展开录入（用户 2026-10-19）。
// 下半是方案汇总（原促销表），只含大学辅导、国际课程。路由 marketing/plans/<月份>（旧地址后面带的业务线忽略），默认当月。
export default function PlansView({ route = [], dossier = null }) {
  const [m] = route;
  const month = /^\d{4}-\d{2}$/.test(m || "") ? m : currentMonth();
  const [rev, setRev] = useState(0); // 入库后加一，让状态和汇总重新读取
  const [editing, setEditing] = useState(null); // 录入框里识别出的业务线
  const [pasting, setPasting] = useState(false); // 已录入时展开录入框
  const plans = useApi("/api/plans");
  useEffect(() => { if (rev) plans.reload(); }, [rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const recorded = plans.data?.some((p) => p.month === month) || false;
  const mark = month === deliveryMonth() ? "交付月" : month === currentMonth() ? "本月" : null;
  const showEditor = (plans.data || plans.error) && (!recorded || pasting); // 读完再决定，避免先闪一下录入框
  return (
    <>
      <section className="mp-block">
        <div className="mp-head">
          <h2>当月促销</h2>
          <MonthSwitch month={month} mark={mark} onChange={(mm) => { setPasting(false); location.hash = href("marketing", "plans", mm); }} />
          <LineStatus key={rev} month={month} editing={editing} />
          {recorded && <><span className="spacer" /><Button onClick={() => setPasting((v) => !v)}><PixelIcon name={pasting ? "close" : "plus"} />{pasting ? "收起录入" : "粘贴新方案"}</Button></>}
        </div>
        {recorded && <RawBoard key={`${month}-${rev}`} month={month} plans={plans.data} />}
        {showEditor && <PlanEditor month={month} onSaved={() => setRev((n) => n + 1)} onLine={setEditing} />}
      </section>
      <section className="mp-block">
        <div className="mp-head">
          <h2>方案汇总</h2>
          <span className="small muted">大学辅导、国际课程全部月份已入库的促销 SKU；标「改」的格子与上一个有数据的月份不同。申诉服务只存原文</span>
        </div>
        <PromosView key={rev} dossier={dossier} />
      </section>
    </>
  );
}

// 方案原文：三条业务线一行排开，各自一键复制（有粘贴时的 HTML 就连格式一起复制）。
function RawBoard({ month, plans }) {
  const [toast, showToast] = useToast();
  return (
    <div className="plan-raw-board">
      {LINES.map((l) => <RawBox key={l} month={month} line={l} has={plans.some((p) => p.month === month && p.line === l)} showToast={showToast} />)}
      {toast}
    </div>
  );
}

function RawBox({ month, line, has, showToast }) {
  const plan = useApi(has ? `/api/plans/${encodeURIComponent(month)}/${encodeURIComponent(line)}` : null);
  const data = plan.data;
  async function copy() {
    try {
      if (data.rawHtml) {
        await navigator.clipboard.write([new ClipboardItem({
          "text/plain": new Blob([data.rawText], { type: "text/plain" }),
          "text/html": new Blob([data.rawHtml], { type: "text/html" }),
        })]);
      } else await navigator.clipboard.writeText(data.rawText);
      showToast(`已复制${line}原文${data.rawHtml ? "（含格式）" : ""}`);
    } catch { showToast("复制失败：浏览器不允许写剪贴板"); }
  }
  return (
    <section className={`card plan-raw${has ? "" : " is-empty"}`}>
      <div className="card-head">
        <h2>{line}</h2>
        <div className="card-extra">
          {data?.savedAt && <span className="small muted tnum">{data.savedAt.slice(5, 16).replace("T", " ")} 录入</span>}
          <Button className="btn btn-xs" onClick={copy} disabled={!data}><PixelIcon name="copy" />复制</Button>
        </div>
      </div>
      {!has ? <p className="small muted">本月未录入</p>
        : plan.error ? <p className="risk-text small">原文读取失败：{plan.error}</p>
        : <pre className="plan-raw-text">{data ? data.rawText : "读取中…"}</pre>}
    </section>
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
        const hint = raw ? (PROMO_LINES.includes(l) ? `已录入 · ${skus} SKU` : "已录入原文") : skus ? `${skus} SKU · 无原文` : "未录入";
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
