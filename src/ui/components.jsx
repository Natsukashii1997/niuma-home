import { useEffect, useRef, useState } from "react";
import { PixelIcon, StepProgress } from "./bitmap.jsx";
// 公共组件。新页面优先复用这里的组件，样式见 docs/STYLE-GUIDE.md。

export function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

// dither：悬停时用抖动网点逐档加深（④）
export function Card({ title, extra, children, className = "", dither = false }) {
  return (
    <section className={`card ${className}`} data-dither={dither ? "" : undefined}>
      {(title || extra) && (
        <div className="card-head">
          <h2>{title}</h2>
          {extra && <div className="card-extra">{extra}</div>}
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

// 页签：items = [{ key, label, href }]
// 页签。item.desc 是该页签的说明，显示在页签下第一行，随页签切换（二次评审 P2-2）。
export function Tabs({ items, active }) {
  const desc = items.find((t) => t.key === active)?.desc;
  return (
    <>
      <nav className="tabs">
        {items.map((t) => (
          <a key={t.key} href={t.href} className={t.key === active ? "active" : ""}>
            {t.label}
          </a>
        ))}
      </nav>
      {desc && <p className="tab-desc">{desc}</p>}
    </>
  );
}

// 分段切换：options = [[value, label]]
export function Segmented({ options, value, onChange }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={v} className={v === value ? "active" : ""} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// 下拉筛选；options 为字符串数组，第一项固定为「全部」（值为空字符串）
export function Select({ label, value, options, onChange }) {
  return (
    <label className="select">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">全部</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

export function FilterBar({ children }) {
  return <div className="filter-bar">{children}</div>;
}

// tone: neutral / blue / green / orange / red
// 节点勾选框：14px 墨框，勾上后白底 + 像素对勾（不再整块涂黑，二次评审 P2-4）。营销战役、项目推进共用。
export function NodeCheck({ checked, onChange, label }) {
  return <span className="node-check"><input type="checkbox" checked={checked} onChange={onChange} aria-label={label} />{checked && <PixelIcon name="tick" />}</span>;
}

export function Tag({ tone = "neutral", children }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function SampleBadge({ task }) {
  const title = !task ? "示例数据" : /^演示/.test(task) ? `${task}：不是正式业务数据` : `示例数据：接口待实现，见 docs/tasks/${task}.md`;
  return <span className="sample-badge" title={title}>示例</span>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Button({ variant = "default", children, ...props }) {
  return (
    <button className={`btn btn-${variant}`} {...props}>
      {children}
    </button>
  );
}

// 尚未实现的操作：可见但不可点，悬停显示派单编号
export function PendingButton({ task, variant = "default", children }) {
  return (
    <button className={`btn btn-${variant}`} disabled title={`待实现，见 docs/tasks/${task}.md`}>
      {children}
    </button>
  );
}

// 统一处理 useApi 的加载中 / 出错状态；正常时渲染 children(data)
// 加载：卡片里用 3 行网点骨架（无字区域）；整页级（big）用按帧加载⑥。报错：写明哪份数据、原因，并给「重新读取」。
export function Loadable({ state, name = "", big = false, children }) {
  if (state.loading) return big
    ? <div className="state-loading is-big" role="status"><StepProgress label={`读取${name || "数据"}`} /></div>
    : <div className="state-loading" role="status" aria-label={`正在读取${name}`}><i /><i /><i /></div>;
  if (state.error) return (
    <div className="state-error" role="alert">
      <strong>{name ? `${name}读取失败` : "读取失败"}</strong>
      <span className="small">{state.error}</span>
      {state.reload && <Button onClick={state.reload}><PixelIcon name="refresh" />重新读取</Button>}
    </div>
  );
  return children(state.data);
}

/* ---------- v3 新增 ---------- */

// 弹窗：用原生 <dialog>，Esc 关闭；遮罩为墨色网点（STYLE-GUIDE v2.1）。
export function Modal({ open, onClose, title, icon, children, footer, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`modal${wide ? " is-wide" : ""}`} onClose={onClose} onCancel={onClose}>
      {open && <>
        <div className="card-head"><h2>{icon && <PixelIcon name={icon} />}{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭"><PixelIcon name="close" /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </>}
    </dialog>
  );
}

// 轻提示：只写明做了什么；原型阶段的写操作统一说明「示例，未写入」。
export function useToast() {
  const [text, setText] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (t) => { setText(t); clearTimeout(timer.current); timer.current = setTimeout(() => setText(""), 2600); };
  const node = text ? <div className="toast" role="status"><PixelIcon name="check" /><span>{text}</span></div> : null;
  return [node, show];
}

// 月份切换：‹ 上月 · 当前 · 下月 ›；current 为交付月时加标记。
export function MonthSwitch({ month, onChange, mark }) {
  const [y, m] = month.split("-").map(Number);
  const shift = (d) => { const x = new Date(y, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`; };
  return (
    <span className="month-switch">
      <button type="button" onClick={() => onChange(shift(-1))} aria-label="上个月"><PixelIcon name="left" /></button>
      <span className="is-cur">{month}{mark && <em>{mark}</em>}</span>
      <button type="button" onClick={() => onChange(shift(1))} aria-label="下个月"><PixelIcon name="right" /></button>
    </span>
  );
}

// 状态符号：done ■ / part ▣ / todo □ / warn（橙）
export function StatusMark({ state, label }) {
  return <span className={`status-mark is-${state}`} title={label}><i aria-hidden="true" />{label && <span>{label}</span>}</span>;
}

// 未实现的页面或区块：说明清楚在等什么。
export function Placeholder({ icon = "clock", title, children, action }) {
  return <div className="empty placeholder"><PixelIcon name={icon} size={32} /><strong>{title}</strong>{children && <p>{children}</p>}{action}</div>;
}

// 阶段条（二次评审 P1-10）：编号 + 名称 + 一行说明；当前步 4px 橙顶条；
// 右上状态方块：done 完成（绿）、cur 进行中（蓝半实心）、left 有遗留（琥珀）、todo 未开始（空心）。
export function PhaseSteps({ items }) {
  return (
    <ol className="phase-steps">
      {items.map((it, i) => (
        <li key={it.key ?? i} className={`is-${it.state}`}>
          <div className="phase-step-no"><b>{String(i + 1).padStart(2, "0")}</b><i aria-hidden="true" /></div>
          <strong>{it.name}</strong>
          {it.note && <span className="small muted">{it.note}</span>}
        </li>
      ))}
    </ol>
  );
}

// 概况数字条（v2.2）：等宽格、左对齐，标签 → 数字 → 说明；item 带 onClick 时整格是按钮（如健康检查筛选）。
export function StatStrip({ items }) {
  return (
    <div className="stat-strip">
      {items.map((it) => {
        const cls = `stat${it.tone ? ` is-${it.tone}` : ""}${it.active ? " is-on" : ""}`;
        const body = <><span className="stat-label">{it.label}</span><span className="stat-value">{it.value}{it.unit && <small>{it.unit}</small>}</span><span className="stat-foot">{it.foot}</span></>;
        return it.onClick
          ? <button key={it.label} type="button" className={cls} onClick={it.onClick} disabled={it.disabled} title={it.title}>{body}</button>
          : <div key={it.label} className={cls}>{body}</div>;
      })}
    </div>
  );
}
