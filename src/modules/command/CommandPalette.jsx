import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { PixelIcon } from "../../ui/bitmap.jsx";
import { useApi } from "../../api.js";
import { href } from "../../router.js";
import { Tag } from "../../ui/components.jsx";
import { deliveryMonth } from "../../constants.js";
import { SAMPLE_KB, SAMPLE_NEEDS, SAMPLE_TIMELINE } from "../../samples/v3.js";
import { GROUP_LABEL, SCOPES, buildActions, buildDocs, buildNeeds, buildPages, buildSchools, buildSkus, parseQuery, pushRecent, readRecent, search } from "./command-index.js";

// ⌘K 命令面板（第三轮提案 2）：任何页面按 ⌘K / Ctrl+K 打开。按对象找：页面、SKU、学校、主线需求、知识库文档、操作。
// ↑↓ 选择，↵ 打开，Tab / ⇧Tab 切换范围，输入「>」只搜操作，Esc 关闭。没输入时显示最近打开的 5 项和全部页面。
// 第一次打开时才读接口；接口未实现时用示例建索引，该组标「示例」。

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function CommandPalette({ open, onClose }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (open) setArmed(true); }, [open]);
  const promos = useApi(armed ? "/api/promos" : null);
  const timeline = useApi(armed ? "/api/v3/timeline" : null, SAMPLE_TIMELINE);
  const needs = useApi(armed ? `/api/v3/needs?month=${deliveryMonth()}` : null, SAMPLE_NEEDS);
  const kb = useApi(armed ? "/api/v3/kb/tree" : null, SAMPLE_KB);
  const items = useMemo(() => {
    const mark = (list, state) => (state.isSample ? list.map((it) => ({ ...it, sample: true })) : list);
    return [
      ...buildPages(),
      ...buildSkus(promos.data || []),
      ...buildActions(promos.data || []),
      ...mark(buildSchools(timeline.data, today()), timeline),
      ...mark(buildNeeds(needs.data), needs),
      ...mark(buildDocs(kb.data), kb),
    ];
  }, [promos.data, timeline.data, needs.data, kb.data, timeline.isSample, needs.isSample, kb.isSample]);
  const loading = [promos, timeline, needs, kb].some((s) => s.loading);
  const failed = [["促销表", promos], ["时间线", timeline], ["主线需求", needs], ["知识库", kb]].filter(([, s]) => s.error).map(([n]) => n);
  if (!open) return null;
  return <Palette items={items} loading={armed && loading} failed={failed} onClose={onClose} />;
}

function Palette({ items, loading, failed, onClose }) {
  const [text, setText] = useState("");
  const [scope, setScope] = useState("all");
  const [active, setActive] = useState(0);
  const [note, setNote] = useState("");
  const [recent, setRecent] = useState(readRecent);
  const input = useRef(null);
  const list = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);

  const parsed = parseQuery(text, scope);
  const groups = useMemo(() => {
    const found = search(items, text, scope);
    if (found) return found;
    const pages = items.filter((it) => it.kind === "page" && (parsed.scope === "all" || parsed.scope === "page"));
    const pool = parsed.scope === "all" ? items : items.filter((it) => it.kind === parsed.scope);
    const out = [];
    if (parsed.scope === "all" && recent.length) out.push({ kind: "recent", label: GROUP_LABEL.recent, total: recent.length, items: recent });
    if (parsed.scope === "all" || parsed.scope === "page") out.push({ kind: "page", label: GROUP_LABEL.page, total: pages.length, items: pages });
    else out.push({ kind: parsed.scope, label: GROUP_LABEL[parsed.scope], total: pool.length, items: pool.slice(0, 50) });
    return out;
  }, [items, text, scope, recent, parsed.scope]);
  const flat = groups.flatMap((g) => g.items);
  const cur = flat[Math.min(active, flat.length - 1)];
  useEffect(() => { setActive(0); }, [text, scope]);
  useEffect(() => { list.current?.querySelector(".cmdk-row.is-sel")?.scrollIntoView({ block: "nearest" }); }, [active]);

  async function run(item) {
    if (!item) return;
    if (item.copy) {
      try { await navigator.clipboard.writeText(item.copy); setNote(`已复制：${item.title.replace(/^复制 /, "")}`); }
      catch { setNote("复制失败：浏览器不允许写剪贴板"); }
      return;
    }
    setRecent(pushRecent(item));
    onClose();
    location.hash = item.href;
  }
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (flat.length ? (i + 1) % flat.length : 0)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0)); }
    else if (e.key === "Enter") { e.preventDefault(); run(cur); }
    else if (e.key === "Tab") {
      e.preventDefault();
      const i = SCOPES.findIndex(([k]) => k === parsed.scope);
      pickScope(SCOPES[(i + (e.shiftKey ? SCOPES.length - 1 : 1)) % SCOPES.length][0]);
    }
  }
  // 换范围时去掉开头的「>」，否则范围会一直锁在「操作」
  function pickScope(k) {
    setScope(k);
    if (text.trimStart().startsWith(">")) setText(text.trimStart().slice(1).trimStart());
  }
  let n = -1;
  return (
    <>
      <div className="cmdk-dim" onMouseDown={onClose} aria-hidden="true" />
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="命令面板" onKeyDown={onKey}>
        <div className="cmdk-input">
          <PixelIcon name="search" />
          <input ref={input} value={text} onChange={(e) => { setText(e.target.value); setNote(""); }} placeholder="搜索页面、SKU、学校、需求、文档；输入 > 只搜操作"
            aria-label="搜索" aria-controls="cmdk-list" aria-activedescendant={cur ? `cmdk-${cur.id}` : undefined} spellCheck={false} />
          <kbd>Esc</kbd>
        </div>
        <div className="cmdk-scopes" role="tablist" aria-label="搜索范围">
          {SCOPES.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={parsed.scope === k} className={parsed.scope === k ? "is-on" : ""} tabIndex={-1}
              onClick={() => { pickScope(k); input.current?.focus(); }}>{label}</button>
          ))}
          <span className="cmdk-hint">Tab 切换范围 · 输入 &gt; 只搜操作</span>
        </div>
        <div className="cmdk-body">
          <div className="cmdk-list" id="cmdk-list" role="listbox" ref={list}>
            {!flat.length && <div className="cmdk-empty">{loading ? "正在读取…" : `没有找到「${parsed.q}」`}</div>}
            {groups.map((g) => (
              <div key={g.kind} role="group" aria-label={g.label}>
                <div className="cmdk-group">{g.label} · {g.total}{g.items.some((it) => it.sample) && <span className="sample-badge">示例</span>}</div>
                {g.items.map((it) => {
                  n += 1;
                  const i = n;
                  return (
                    <div key={it.id} id={`cmdk-${it.id}`} role="option" aria-selected={it === cur} className={`cmdk-row${it === cur ? " is-sel" : ""}`}
                      onMouseMove={() => active !== i && setActive(i)} onClick={() => run(it)}>
                      <PixelIcon name={it.icon || "right"} />
                      <span className="cmdk-title"><Hl text={it.title} q={parsed.q} /><span className="cmdk-sub">{it.sub}</span></span>
                      <span className="cmdk-go">{it === cur ? `${it.go || "打开"} ↵` : it.go}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <Preview item={cur} onClose={onClose} />
        </div>
        <div className="cmdk-foot">
          <span>↑↓ 选择</span><span>↵ 打开</span><span>Esc 关闭</span>
          <span className="cmdk-note">{note || (failed.length ? `读取失败：${failed.join("、")}` : loading ? "正在读取数据…" : "")}</span>
        </div>
      </div>
    </>
  );
}

// 命中的那一段用浅琥珀底标出；选中行改成橙底白字（样式里处理）。
function Hl({ text, q }) {
  const w = q.split(/\s+/).find(Boolean);
  const i = w ? text.toLowerCase().indexOf(w.toLowerCase()) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + w.length)}</mark>{text.slice(i + w.length)}</>;
}

// 右侧预览：选中项的关键信息 + 可以去的地方。
function Preview({ item, onClose }) {
  if (!item) return <aside className="cmdk-pre" />;
  const p = item.preview || { kind: item.kind };
  const links = [[item.copy ? "复制" : "打开", null, "↵"]];
  let head = GROUP_LABEL[item.kind] || "", body = null;
  if (p.kind === "sku") {
    head = "SKU · 预览";
    body = <dl className="kv">
      <dt>最近</dt><dd>{p.latest.month}<span className="muted">（共 {p.months.length} 个月有政策）</span></dd>
      <dt>试听</dt><dd>{p.latest.trial}</dd>
      <dt>正价</dt><dd>{p.latest.price}</dd>
      <dt>新签</dt><dd><span className="clamp-2">{p.latest.newDeal}</span></dd>
      <dt>续费</dt><dd><span className="clamp-2">{p.latest.renewal}</span></dd>
    </dl>;
    links[0] = ["打开 SKU 档案", null, "↵"];
    links.push(["方案汇总", href("marketing", "plans")], ["价格记录", href("marketing", "prices")]);
  } else if (p.kind === "school") {
    head = "学校 · 接下来的节点";
    body = p.next.length
      ? <dl className="kv is-dates">{p.next.map((e) => <Fragment key={`${e.from}${e.type}`}><dt>{e.from.slice(5)}{e.to && e.to !== e.from ? ` → ${e.to.slice(5)}` : ""}</dt><dd>{e.type}</dd></Fragment>)}</dl>
      : <p className="small muted">时间线里今天以后没有这所学校的节点。</p>;
    links[0] = ["看明细表", null, "↵"];
  } else if (p.kind === "need") {
    const x = p.need;
    head = "主线需求 · 预览";
    body = <dl className="kv">
      <dt>时间窗</dt><dd className="tnum">{x.when}</dd>
      <dt>学校</dt><dd>{x.schools} 校</dd>
      <dt>需求</dt><dd>{x.need}</dd>
      <dt>痛点</dt><dd>{x.pain}</dd>
      <dt>状态</dt><dd><Tag tone={x.status === "已采纳" ? "green" : "amber"}>{x.status}</Tag></dd>
    </dl>;
    links[0] = ["在用户策略里打开", null, "↵"];
  } else if (p.kind === "doc") {
    head = "知识库文档 · 预览";
    body = <dl className="kv">
      <dt>位置</dt><dd>{p.path}</dd>
      {p.doc.updated && <><dt>更新</dt><dd className="tnum">{p.doc.updated}</dd></>}
      {p.doc.tags?.length > 0 && <><dt>标签</dt><dd>{p.doc.tags.map((t) => <Tag key={t}>{t}</Tag>)}</dd></>}
      {p.doc.excerpt && <><dt>摘要</dt><dd><span className="clamp-3">{p.doc.excerpt}</span></dd></>}
    </dl>;
  } else {
    body = <p className="small muted">{p.desc || item.sub}</p>;
  }
  return (
    <aside className="cmdk-pre" aria-label="预览">
      <span className="label">{head}{item.sample && " · 示例"}</span>
      <h3>{p.kind === "sku" ? p.sku : item.title}</h3>
      {p.kind === "sku" && <span className="small muted">{p.line}</span>}
      {body}
      <div className="cmdk-acts">
        {links.map(([label, to, key]) => to
          ? <a key={label} href={to} onClick={onClose}><span>{label}</span><PixelIcon name="right" /></a>
          : <span key={label}><span>{label}</span><kbd>{key}</kbd></span>)}
      </div>
    </aside>
  );
}
