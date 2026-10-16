import { useEffect, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { SampleBadge, Segmented, useToast } from "../../ui/components.jsx";
import { SAMPLE_SELFTALK } from "../../samples/v3.js";

// 自言自语（v3）：把发给自己的飞书消息拉回来回看。操作悬停才出现；键盘 J/K 上下、S 标记、E 归档、T 转待办、N 转主线需求。
const TAG = { star: ["有价值", "is-star"], todo: ["已转待办", "is-done"], need: ["已转主线需求", "is-done"], archived: ["已归档", "is-arch"] };

export function SelfTalkButton({ open, onToggle }) {
  const state = useApi("/api/v3/selftalk", SAMPLE_SELFTALK);
  const unread = state.data?.items.filter((i) => !i.tag).length || 0;
  return <button type="button" className="chrome-btn" aria-expanded={open} onClick={onToggle} title="自言自语（Esc 关闭）"><PixelIcon name="chat" />自言自语{unread > 0 && <b>{unread}</b>}</button>;
}

export function SelfTalkDrawer({ open, onClose }) {
  const state = useApi(open ? "/api/v3/selftalk" : null, SAMPLE_SELFTALK);
  if (!open) return null;
  return <aside className="selftalk" aria-label="自言自语">{state.data ? <Drawer data={state.data} sample={state.isSample ? state.task : null} onClose={onClose} /> : <p className="muted" style={{ padding: 16 }}>读取中…</p>}</aside>;
}

function Drawer({ data, sample, onClose }) {
  const [items, setItems] = useState(data.items);
  const [filter, setFilter] = useState("open");
  const [cur, setCur] = useState(0);
  const [toast, showToast] = useToast();
  const list = items.filter((i) => filter === "all" || (filter === "open" ? !i.tag : filter === "star" ? i.tag === "star" : i.tag === "archived"));
  const act = (id, tag) => {
    setItems((old) => old.map((i) => i.id === id ? { ...i, tag: i.tag === tag ? "" : tag } : i));
    if (tag === "todo") showToast("已转为待办（示例，未写入）");
    if (tag === "need") showToast("已生成主线需求草稿，去「用户 · 主线需求」采纳（示例）");
  };
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest?.("input, textarea, [contenteditable]")) return;
      const it = list[cur];
      if (e.key === "j") setCur((c) => Math.min(list.length - 1, c + 1));
      else if (e.key === "k") setCur((c) => Math.max(0, c - 1));
      else if (it && e.key === "s") act(it.id, "star");
      else if (it && e.key === "e") act(it.id, "archived");
      else if (it && e.key === "t") act(it.id, "todo");
      else if (it && e.key === "n") act(it.id, "need");
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
      <div className="st-digest"><span className="label"><PixelIcon name="spark" />本周值得回看 · AI{sample && <SampleBadge task={sample} />}</span><p>{data.digest}</p></div>
      <div className="st-filter"><Segmented options={[["open", `未处理 ${items.filter((i) => !i.tag).length}`], ["star", "有价值"], ["archived", "已归档"], ["all", "全部"]]} value={filter} onChange={(v) => { setFilter(v); setCur(0); }} /></div>
      <ol className="st-list">
        {list.map((i, k) => {
          const day = i.day !== lastDay ? <li className="st-day label" key={`d${i.id}`}>{i.day}</li> : null;
          lastDay = i.day;
          return [day, (
            <li key={i.id} className={`st-item${k === cur ? " is-cur" : ""}${i.tag === "archived" ? " is-arch" : ""}`} onClick={() => setCur(k)}>
              <div className="st-meta"><span className="tnum small muted">{i.time}</span>{i.link && <span className="st-tag">链接</span>}{i.tag && <span className={`st-tag ${TAG[i.tag][1]}`}>{TAG[i.tag][0]}</span>}</div>
              <p>{i.text}</p>
              <div className="st-actions">
                <button type="button" title="标记有价值（S）" className={i.tag === "star" ? "is-on" : ""} onClick={() => act(i.id, "star")}><PixelIcon name="star" /></button>
                <button type="button" title="归档（E）" onClick={() => act(i.id, "archived")}><PixelIcon name="archive" /></button>
                <button type="button" title="转为待办（T）" onClick={() => act(i.id, "todo")}>转待办</button>
                <button type="button" title="转为主线需求草稿（N）" onClick={() => act(i.id, "need")}>转主线需求</button>
              </div>
            </li>
          )];
        })}
        {!list.length && <li className="small muted st-empty">这一栏没有消息</li>}
      </ol>
      <div className="st-foot"><span className="small muted"><kbd>J</kbd><kbd>K</kbd> 上下 · <kbd>S</kbd> 标记 · <kbd>E</kbd> 归档 · <kbd>T</kbd> 待办 · <kbd>N</kbd> 需求</span><button type="button" className="link-btn" onClick={() => showToast("已拉取：没有新的自发消息（示例）")}>拉取新消息</button></div>
      {toast}
    </>
  );
}
