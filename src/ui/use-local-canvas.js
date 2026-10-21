import { useEffect, useRef, useState } from "react";
import { apiSend } from "../api.js";

// 每次动作排队；下一次使用上次已核对的版本，避免快速粘贴与拖动相互覆盖。
export function useLocalCanvas(initial, endpoint, onNotice) {
  const base = useRef(initial), queue = useRef([]), running = useRef(false), reconciling = useRef(false), mounted = useRef(true);
  const [value, setValue] = useState(initial.value), [busy, setBusy] = useState(false), [error, setError] = useState(""), [canRetry, setCanRetry] = useState(false);
  const blocked = useRef(false), notify = useRef(onNotice); notify.current = onNotice;
  const paint = () => { if (mounted.current) setValue(queue.current.reduce((v, j) => j.apply(v), base.current.value)); };
  useEffect(() => { mounted.current = true; const leave = e => { if (queue.current.length) { e.preventDefault(); e.returnValue = ""; } }; addEventListener("beforeunload", leave); return () => { mounted.current = false; removeEventListener("beforeunload", leave); }; }, []);
  async function drain() {
    if (running.current || blocked.current) return;
    running.current = true; if (mounted.current) setBusy(true);
    while (queue.current.length && !blocked.current) {
      const job = queue.current[0];
      const body = job.body ||= { value: job.apply(base.current.value), baseRevision: base.current.revision, requestId: job.id };
      try {
        let saved;
        try { saved = await apiSend("PUT", endpoint, body); }
        catch (e) {
          // 网络回包丢失只核对收据，不重复写入。
          if (e.status && e.status < 500) throw e;
          saved = await apiSend("GET", `${endpoint}/saves/${job.id}`);
          if (!saved) throw e;
        }
        const back = await apiSend("GET", `${endpoint}/state`);
        if (back.revision !== saved.revision) throw new Error("内容已在其他页面变化，请重新读取后继续");
        base.current = back; queue.current.shift(); paint();
        if (job.message && mounted.current) notify.current?.(job.message);
      } catch (e) {
        blocked.current = true;
        if (mounted.current) setError(`${e.message}。当前草稿已保留，请重新读取核对后继续。`);
      }
    }
    running.current = false; if (mounted.current) setBusy(false);
  }
  const change = (apply, message = "") => {
    if (blocked.current) return;
    queue.current.push({ id: crypto.randomUUID(), apply, message }); paint(); void drain();
  };
  const reread = async () => {
    if (reconciling.current || running.current) return;
    reconciling.current = true; setBusy(true); setCanRetry(false);
    try {
      let committed = false;
      const job = queue.current[0];
      if (job) {
        const result = await apiSend("GET", `${endpoint}/operations/${job.id}`);
        if (result.status === "pending") { setError("上次保存仍在处理中，草稿保留；请稍后再次核对。"); return; }
        committed = result.status === "saved";
      }
      const back = await apiSend("GET", `${endpoint}/state`);
      if (committed && queue.current[0]?.id === job.id) queue.current.shift();
      base.current = back;
      // 只消费已确认保存的一项，后续图片和修改始终留在草稿队列。
      for (const pending of queue.current) { pending.body = null; pending.id = crypto.randomUUID(); }
      paint();
      if (queue.current.length) { setCanRetry(true); setError(`已核对当前保存结果，保留 ${queue.current.length} 项草稿。点击继续保存即可完成。`); }
      else { blocked.current = false; setCanRetry(false); setError(""); }
    } catch (e) { setError(e.message); }
    finally { reconciling.current = false; setBusy(false); }
  };
  const retry = () => { if (!canRetry) return; blocked.current = false; setCanRetry(false); setError(""); void drain(); };

  return { value, change, busy, error, reread, retry, canRetry, locked: !!error };
}
