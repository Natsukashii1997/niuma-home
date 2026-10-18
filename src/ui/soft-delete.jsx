import { useState } from "react";
import { apiSend } from "../api.js";
import { PixelIcon, StepProgress } from "./bitmap.jsx";
import { Button } from "./components.jsx";
import { WriteBox, useWriteFlow } from "./write-flow.jsx";

// 本地对象的软删除与恢复（docs/API.md「本地项目与历史战役 · 删除与恢复」）。
// 确认后同时重读默认列表和已删除列表：对象在正确的那一边、回执状态一致，才算完成；回执本身不算。
// api = { base: "/api/v3/local-projects", active: "/api/v3/projects" }，active 是页面原来用的默认列表。
const itemsOf = (x) => (Array.isArray(x) ? x : x?.items || []);
const enc = encodeURIComponent;

// 按字符串比较 id：有的默认列表给数字 id（如 /api/assistants），删除接口统一用字符串。
export async function readPlacement(api, id) {
  const [active, deleted] = await Promise.all([apiSend("GET", api.active), apiSend("GET", `${api.base}?deleted=true`)]);
  const has = (list) => itemsOf(list).some((o) => String(o.id) === String(id));
  return { active, deleted: itemsOf(deleted), inActive: has(active), inDeleted: has(deleted) };
}

export const timeText = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "时间未知" : d.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\//g, "-");
};

// 明确被拒绝（4xx，没有写入）时顺手重读两个列表：对象可能已在别处被删除或恢复，页面要跟上实际状态。
// 5xx / 网络中断属于结果不明，不自动重读，交给「重新读取核对」。
const refreshOnReject = (api, onPlaced, run) => async (...args) => {
  try { return await run(...args); }
  catch (e) { if (e.status && e.status < 500) readPlacement(api, null).then(onPlaced, () => {}); throw e; }
};

// 删除：flow 由页面持有（WriteBox 放在页面合适的位置）。onPlaced(placement) 用回读结果刷新页面。
export function useSoftRemove(api, onPlaced) {
  const flow = useWriteFlow();
  const [lastId, setLastId] = useState(null);
  const preview = (id) => { setLastId(id); flow.reset(); return flow.preview(refreshOnReject(api, onPlaced, () => apiSend("POST", `${api.base}/${enc(id)}/remove-preview`, {}))); };
  const confirm = () => flow.confirm(
    refreshOnReject(api, onPlaced, (pv) => apiSend("DELETE", `${api.base}/${enc(pv.id)}`, { previewId: pv.previewId, confirm: true })),
    async (receipt, pv) => {
      const r = await readPlacement(api, pv.id);
      onPlaced(r);
      return receipt?.deleted === true && !r.inActive && r.inDeleted;
    },
  );
  const reread = async () => { onPlaced(await readPlacement(api, null)); flow.resolve(); };
  return { flow, preview, confirm, reread, repreview: () => lastId && preview(lastId) };
}

// 已删除列表 + 恢复。deleted 由页面持有（删除后页面拿回读结果更新它，两边保持一致）。
export function DeletedList({ api, deleted, onPlaced, noun, describe, children }) {
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState({ busy: false, error: "" });
  const [lastId, setLastId] = useState(null); // 预览本身失败时 flow 里没有预览内容，重新预览靠它
  const flow = useWriteFlow();
  const locked = flow.busy || flow.phase === "unknown";
  async function reload() {
    setLoad({ busy: true, error: "" });
    try { onPlaced(await readPlacement(api, null)); setLoad({ busy: false, error: "" }); }
    catch (e) { setLoad({ busy: false, error: e.message }); }
  }
  const preview = (id) => { setLastId(id); flow.reset(); flow.preview(refreshOnReject(api, onPlaced, () => apiSend("POST", `${api.base}/${enc(id)}/restore-preview`, {}))); };
  const confirm = () => flow.confirm(
    refreshOnReject(api, onPlaced, (pv) => apiSend("POST", `${api.base}/${enc(pv.id)}/restore`, { previewId: pv.previewId, confirm: true })),
    async (receipt, pv) => {
      const r = await readPlacement(api, pv.id);
      onPlaced(r);
      return receipt?.deleted === false && r.inActive && !r.inDeleted;
    },
  );
  const reread = async () => { await reload(); flow.resolve(); };
  return (
    <div className="trash">
      <button type="button" className="trash-toggle link-btn" aria-expanded={open} onClick={() => { if (locked) return; setOpen(!open); flow.reset(); }}>
        <PixelIcon name="archive" />已删除的{noun}<span className="tnum">{deleted.length}</span><PixelIcon name={open ? "up" : "down"} />
      </button>
      {open && (
        <div className="trash-body">
          <div className="row"><span className="small muted">软删除：内容全部保留，可以恢复到原编号；不影响飞书。</span><span className="spacer" />
            <Button className="btn btn-xs" onClick={reload} disabled={load.busy || locked}><PixelIcon name="refresh" />{load.busy ? "读取中" : "重新读取"}</Button></div>
          {load.busy && <StepProgress label={`读取已删除的${noun}`} />}
          {load.error && <p className="small risk-text">读取失败：{load.error}（下面仍是上次读到的列表）</p>}
          {deleted.length ? (
            <ul className="trash-list">{deleted.map((o) => (
              <li key={o.id}>
                <span className="trash-main"><strong>{describe(o).name}</strong><span className="small muted">{describe(o).meta} · 删除于 {timeText(o.deletion?.at)}</span></span>
                <Button className="btn btn-xs" disabled={locked} onClick={() => preview(o.id)}><PixelIcon name="left" />预览恢复</Button>
              </li>
            ))}</ul>
          ) : <p className="small muted">没有已删除的{noun}。</p>}
          <WriteBox flow={flow} className="soft-delete" title={`恢复${noun}预览`} confirmLabel="确认恢复" savedText={`已恢复，回读核对：已回到${noun}列表，已删除列表里不再有它`} onConfirm={confirm} onRepreview={() => lastId && preview(lastId)} onReread={reread}>
            {children}
          </WriteBox>
        </div>
      )}
    </div>
  );
}
