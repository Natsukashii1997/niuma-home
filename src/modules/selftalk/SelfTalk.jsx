import { useEffect, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { apiSend, useApi } from "../../api.js";
import { Button, Segmented } from "../../ui/components.jsx";
import { WriteBox, useWriteFlow } from "../../ui/write-flow.jsx";
import { deliveryMonth, isoWeek } from "../../constants.js";

// 自言自语（v3）：把发给自己的飞书消息（最近 10 天）拉回来回看。操作悬停才出现；键盘 J/K 上下，S 标记、E 归档、T 转待办、N 转主线需求。
// 每个处理都只存工作台本地：按键或点按钮只生成预览，确认后才保存并回读。图片等非文本消息只能标记或归档，不能转待办或需求。
// 周汇总由 AI 起草，只在你点「生成周汇总」时调用一次本机 Codex；只汇总已经结束、而且最近 10 天完整覆盖的自然周。
const TAG = { star: ["有价值", "is-star"], todo: ["已转待办", "is-done"], need: ["已转主线需求", "is-done"], archived: ["已归档", "is-arch"] };
const ACTION = { star: "标记有价值", archived: "归档", todo: "转为待办", need: "转为主线需求草稿", "": "撤销处理" };
const isText = (i) => ["text", "post"].includes(i.type);

export function SelfTalkButton({ open, onToggle }) {
  const state = useApi("/api/v3/selftalk");
  const unread = state.data?.items.filter((i) => !i.tag).length || 0;
  return <button type="button" className="chrome-btn" aria-expanded={open} onClick={onToggle} title="自言自语（Esc 关闭）"><PixelIcon name="chat" />自言自语{unread > 0 && <b>{unread}</b>}</button>;
}

export function SelfTalkDrawer({ open, onClose }) {
  const state = useApi(open ? "/api/v3/selftalk" : null);
  if (!open) return null;
  return (
    <aside className="selftalk" aria-label="自言自语">
      {state.data ? <Drawer initial={state.data} onClose={onClose} />
        : state.error ? <p className="risk-text small" style={{ padding: 16 }}>读取失败：{state.error}</p>
        : <p className="muted" style={{ padding: 16 }}>读取中…</p>}
    </aside>
  );
}

// 上一个已经结束的自然周（周一到周日）。
const lastWeek = () => { const d = new Date(); d.setDate(d.getDate() - 7); return isoWeek(d); };

function Drawer({ initial, onClose }) {
  const [data, setData] = useState(initial);
  const items = data.items;
  const [filter, setFilter] = useState("open");
  const [cur, setCur] = useState(0);
  const [pending, setPending] = useState(null); // { item, tag }：正在预览的处理
  const [sync, setSync] = useState({ busy: false, note: "" });
  const [week, setWeek] = useState(lastWeek());
  const flow = useWriteFlow();
  const digest = useWriteFlow();
  const list = items.filter((i) => filter === "all" || (filter === "open" ? !i.tag : filter === "star" ? i.tag === "star" : i.tag === "archived"));
  const locked = flow.busy || flow.phase === "unknown";
  const act = (item, tag0) => run(item, item.tag === tag0 ? "" : tag0); // 再按一次是撤销
  const run = (item, tag) => {
    if (locked) return;
    if (["todo", "need"].includes(tag) && !isText(item)) return;
    setPending({ item, tag });
    flow.reset();
    flow.preview(() => apiSend("POST", `/api/v3/selftalk/${encodeURIComponent(item.id)}/preview`, { tag, ...(tag === "need" ? { month: deliveryMonth() } : {}) }));
  };
  const reload = async () => { const fresh = await apiSend("GET", "/api/v3/selftalk"); setData(fresh); return fresh; };
  const confirm = () => flow.confirm(
    (pv) => apiSend("PATCH", `/api/v3/selftalk/${encodeURIComponent(pending.item.id)}`, { previewId: pv.previewId, confirm: true }),
    async () => { const fresh = await reload(); return fresh.items.find((x) => x.id === pending.item.id)?.tag === pending.tag; },
  );
  const reread = async () => { await reload(); flow.resolve(); setPending(null); };
  async function pull() {
    setSync({ busy: true, note: "" });
    try { const fresh = await apiSend("POST", "/api/v3/selftalk/sync"); setData(fresh); setSync({ busy: false, note: `已拉取：最近 10 天共 ${fresh.items.length} 条 · ${fresh.pulledAt}` }); }
    catch (e) { setSync({ busy: false, note: `拉取失败：${e.message}` }); }
  }
  const previewDigest = () => digest.preview(() => apiSend("POST", "/api/v3/selftalk/digest/preview", { week }));
  const confirmDigest = () => digest.confirm(
    (pv) => apiSend("POST", "/api/v3/selftalk/digest", { week: pv.value.week, previewId: pv.previewId, confirm: true }),
    async (receipt, pv) => { const fresh = await reload(); return fresh.digest === pv.value.text; },
  );
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.("input, textarea, [contenteditable]")) return;
      if (e.metaKey || e.ctrlKey) return; // ⌘K 是命令面板，不当作「上一条」
      const it = list[cur];
      if (e.key === "j") setCur((c) => Math.min(list.length - 1, c + 1));
      else if (e.key === "k") setCur((c) => Math.max(0, c - 1));
      else if (it && e.key === "s") act(it, "star");
      else if (it && e.key === "e") act(it, "archived");
      else if (it && e.key === "t") act(it, "todo");
      else if (it && e.key === "n") act(it, "need");
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  let lastDay = "";
  return (
    <>
      <div className="st-head">
        <div><h2><PixelIcon name="chat" />自言自语</h2><span className="small muted">发给自己的飞书消息 · 最近 10 天 · 拉取于 {data.pulledAt}</span></div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭"><PixelIcon name="close" /></button>
      </div>
      <div className="st-digest">
        <span className="label"><PixelIcon name="spark" />周汇总 · AI 草稿（人工确认后保存）</span>
        {data.digest ? <p>{data.digest}</p> : <p className="small muted">还没有确认过的周汇总。</p>}
        <div className="row st-digest-row">
          <input className="week-input" value={week} onChange={(e) => { setWeek(e.target.value.trim()); digest.reset(); }} aria-label="周次 YYYY-Www" />
          <Button className="btn btn-xs" onClick={previewDigest} disabled={digest.busy || digest.phase === "unknown"}><PixelIcon name="spark" />生成周汇总</Button>
        </div>
        <WriteBox flow={digest} title="周汇总预览（AI 草稿）" confirmLabel="确认保存" savedText="周汇总已保存，回读核对一致" onConfirm={confirmDigest} onRepreview={previewDigest} onReread={async () => { await reload(); digest.resolve(); }}>
          {(pv) => <><p className="small muted">{pv.value.week} · {pv.value.counts?.total ?? "?"} 条消息 · AI 生成，待你核对</p><pre>{pv.value.text}</pre></>}
        </WriteBox>
      </div>
      <div className="st-filter"><Segmented options={[["open", `未处理 ${items.filter((i) => !i.tag).length}`], ["star", "有价值"], ["archived", "已归档"], ["all", "全部"]]} value={filter} onChange={(v) => { setFilter(v); setCur(0); }} /></div>
      <WriteBox flow={flow} title="处理预览" className="st-write" savedText={flow.receipt?.reversal?.length ? `处理已撤销；${flow.receipt.reversal.map((entry) => `${entry.label}${entry.action === "remove" ? "已撤回" : "已保留"}`).join("，")}` : "已保存，回读核对一致"} onConfirm={confirm} onRepreview={() => pending && run(pending.item, pending.tag)} onReread={reread}>
        {(pv) => pending && <dl className="kv">
          <dt>消息</dt><dd>{pending.item.text.length > 60 ? `${pending.item.text.slice(0, 60)}…` : pending.item.text}</dd>
          <dt>处理</dt><dd><span className="diff-old">{pending.item.tag ? TAG[pending.item.tag][0] : "未处理"}</span> → <span className="diff-new">{ACTION[pending.tag]}</span>{pending.tag === "need" ? `（进入 ${deliveryMonth()} 主线需求，待你在用户策略里采纳）` : ""}</dd>
          {pv.value?.reversal?.map((entry) => <span key={entry.kind} style={{ display: "contents" }}><dt>{entry.label}</dt><dd>{entry.action === "remove" ? "撤回" : "保留"}：{entry.reason}</dd></span>)}
          <dt>写到哪里</dt><dd>工作台本地，不改飞书消息</dd>
        </dl>}
      </WriteBox>
      <ol className="st-list">
        {list.map((i, k) => {
          const day = i.day !== lastDay ? <li className="st-day label" key={`d${i.id}`}>{i.day}</li> : null;
          lastDay = i.day;
          const text = isText(i);
          return [day, (
            <li key={i.id} className={`st-item${k === cur ? " is-cur" : ""}${i.tag === "archived" ? " is-arch" : ""}${pending?.item.id === i.id && flow.phase !== "idle" ? " is-pending" : ""}`} onClick={() => setCur(k)}>
              <div className="st-meta"><span className="tnum small muted">{i.time}</span>{!text && <span className="st-tag">{i.type === "image" ? "图片" : "非文本"}</span>}{i.tag && <span className={`st-tag ${TAG[i.tag][1]}`}>{TAG[i.tag][0]}</span>}</div>
              <p>{i.text}</p>
              {i.reversal?.some((entry) => entry.action === "keep") && <p className="small muted">已撤销处理标记；{i.reversal.filter((entry) => entry.action === "keep").map((entry) => `${entry.label}因${entry.reason}仍保留`).join("；")}</p>}
              <div className="st-actions">
                <button type="button" title="标记有价值（S）" className={i.tag === "star" ? "is-on" : ""} disabled={locked} onClick={() => act(i, "star")}><PixelIcon name="star" /></button>
                <button type="button" title="归档（E）" disabled={locked} onClick={() => act(i, "archived")}><PixelIcon name="archive" /></button>
                <button type="button" title={text ? "转为待办（T）" : "非文本消息请先在飞书查看"} disabled={locked || !text} onClick={() => act(i, "todo")}>转待办</button>
                <button type="button" title={text ? "转为主线需求草稿（N）" : "非文本消息请先在飞书查看"} disabled={locked || !text} onClick={() => act(i, "need")}>转主线需求</button>
              </div>
            </li>
          )];
        })}
        {!list.length && <li className="small muted st-empty">这一栏没有消息</li>}
      </ol>
      <div className="st-foot"><span className="small muted">{sync.note || <><kbd>J</kbd><kbd>K</kbd> 上下 · <kbd>S</kbd> 标记 · <kbd>E</kbd> 归档 · <kbd>T</kbd> 待办 · <kbd>N</kbd> 需求 · 都先预览</>}</span><button type="button" className="link-btn" onClick={pull} disabled={sync.busy}>{sync.busy ? "拉取中…" : "拉取新消息"}</button></div>
    </>
  );
}
