import { SuccessNotice } from "./SuccessNotice.jsx";
import { useRef, useState } from "react";
import { PixelIcon, StepProgress } from "./bitmap.jsx";
import { Button } from "./components.jsx";
import { CONFLICT_CODES, IDLE, canConfirm, canReset, classifyFailure } from "./write-flow-state.js";

// 写操作统一流程：预览 → 明确确认 → 提交 → 回读。预览内容在 flow.pv（flow.preview 是生成预览的方法）。只有回读核对一致才进入「已保存」，本地状态变化和成功提示都不算保存。
// 用法：
//   const flow = useWriteFlow();
//   flow.preview(() => apiSend("POST", ".../preview", body));             // 生成预览（输入变化时调 flow.reset() 让它失效）
//   flow.confirm((p) => apiSend("PATCH", ..., { previewId: p.previewId, confirm: true }),
//                async (receipt) => { const fresh = await apiSend("GET", ...); return 是否与预览一致; });
//   <WriteBox flow={flow} ...>{(p) => 预览内容}</WriteBox>
export function useWriteFlow() {
  const [state, setState] = useState(IDLE);
  const cur = useRef(IDLE);
  const gen = useRef(0);
  const set = (v) => { cur.current = v; setState(v); };

  async function preview(run) {
    if (!canReset(cur.current.phase)) return null;
    const my = ++gen.current;
    set({ phase: "previewing" });
    try {
      const p = await run();
      if (gen.current === my) set({ phase: "preview", pv: p });
      return p;
    } catch (e) {
      // 预览本身不写入：失败一般是「改了再试」；但后端带回未结的操作记录（同一对象上次结果不明）时要锁住，先核对。
      const kind = e.receipt || e.code === "EXPORT_RESULT_UNKNOWN" ? "unknown" : e.status === 409 && !CONFLICT_CODES.has(e.code) ? "stale" : "error";
      if (gen.current === my) set({ phase: kind, error: e.message, code: e.code, receipt: e.receipt });
      return null;
    }
  }

  async function confirm(run, readback) {
    if (!canConfirm(cur.current.phase)) return false; // 防重复点击：提交中不再发第二次
    const { pv: p } = cur.current;
    const my = ++gen.current;
    set({ phase: "confirming", pv: p });
    let receipt;
    try {
      receipt = await run(p);
    } catch (e) {
      const kind = classifyFailure(e);
      set({ phase: kind, pv: p, error: e.message, code: e.code, receipt: e.receipt });
      return false;
    }
    try {
      const ok = await readback(receipt, p);
      if (gen.current !== my) return false;
      // 回读返回一句话：结果已知但没有全部完成（如只执行了一部分），按「没有完成」显示，不锁住。
      if (typeof ok === "string") { set({ phase: "error", pv: p, receipt, error: ok }); return false; }
      set(ok ? { phase: "saved", pv: p, receipt } : { phase: "unknown", pv: p, receipt, error: "已提交，但回读到的内容和预览不一致" });
      return Boolean(ok);
    } catch (e) {
      set({ phase: "unknown", pv: p, receipt, error: `已提交，但回读失败：${e.message}` });
      return false;
    }
  }

  // 输入变化 / 取消：旧预览作废。结果不明时不能清，必须先重新读取核对（resolve）。
  const reset = () => { if (!canReset(cur.current.phase)) return; gen.current++; set(IDLE); };
  const resolve = () => { gen.current++; set(IDLE); };
  return { ...state, preview, confirm, reset, resolve, busy: state.phase === "previewing" || state.phase === "confirming" };
}

// 预览与确认框。children 可以是函数：(preview) => 预览内容（必须写清楚实际目标和改动）。
export function WriteBox({ flow, title = "保存前预览", confirmLabel = "确认保存", savedText = "已保存，回读核对一致", onConfirm, onRepreview, onReread, children, className = "" }) {
  const { phase } = flow;
  if (phase === "idle") return null;
  const body = typeof children === "function" ? (flow.pv ? children(flow.pv) : null) : children;
  if (phase === "previewing") return <div className={`write-box ${className}`}><StepProgress label="生成预览" /></div>;
  if (phase === "preview" || phase === "confirming") return (
    <div className={`write-box is-preview ${className}`} role="region" aria-label={title}>
      <div className="write-head"><PixelIcon name="eye" /><strong>{title}</strong><span className="small muted">确认前不会写入{flow.pv?.expiresAt ? ` · ${expiresText(flow.pv.expiresAt)}前有效` : ""}</span></div>
      {body && <div className="write-body">{body}</div>}
      <div className="write-actions">
        <Button onClick={flow.reset} disabled={phase === "confirming"}>取消</Button>
        <Button variant="primary" onClick={onConfirm} disabled={phase === "confirming"}>{phase === "confirming" ? "提交中…" : confirmLabel}</Button>
      </div>
    </div>
  );
  if (phase === "saved") return (
    <SuccessNotice className={`write-box is-saved ${className}`} onClose={flow.resolve} identity={flow.receipt}>
      <div className="write-head"><PixelIcon name="check" /><strong>{savedText}</strong></div>
    </SuccessNotice>
  );
  if (phase === "stale") return (
    <div className={`write-box is-warn ${className}`} role="alert">
      <div className="write-head"><PixelIcon name="alert" /><strong>预览已失效</strong></div>
      <p className="write-msg">{flow.error}。{/重新预览/.test(flow.error || "") ? "没有写入。" : "没有写入，请按当前内容重新预览。"}</p>
      <div className="write-actions"><Button onClick={flow.resolve}>关闭</Button>{onRepreview && <Button variant="primary" onClick={onRepreview}>重新预览</Button>}</div>
    </div>
  );
  if (phase === "unknown") return (
    <div className={`write-box is-unknown ${className}`} role="alert">
      <div className="write-head"><PixelIcon name="alert" /><strong>结果不明，已停止</strong></div>
      <p className="write-msg">{flow.error}。不会自动重试，也不要重复提交；先重新读取，核对实际是否已经写入。</p>
      {flow.receipt && <p className="write-msg small">操作记录：{flow.receipt.operationId || flow.receipt.id || "已保存在本机"}{flow.receipt.status ? ` · ${flow.receipt.status}` : ""}</p>}
      <div className="write-actions">{onReread && <Button variant="primary" onClick={onReread}><PixelIcon name="refresh" />重新读取核对</Button>}</div>
    </div>
  );
  return (
    <div className={`write-box is-error ${className}`} role="alert">
      <div className="write-head"><PixelIcon name="alert" /><strong>没有完成</strong></div>
      <p className="write-msg">{flow.error}</p>
      <div className="write-actions"><Button onClick={flow.resolve}>关闭</Button></div>
    </div>
  );
}

function expiresText(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// 保存成功后页面要按回读结果重建时（组件会重新挂载、流程状态随之清空），由外层显示这条结果。
export function SavedNote({ text, onClose, identity = text }) {
  if (!text) return null;
  return (
    <SuccessNotice className="write-box is-saved" onClose={onClose} identity={identity}>
      <div className="write-head"><PixelIcon name="check" /><strong>{text}</strong></div>
    </SuccessNotice>
  );
}
