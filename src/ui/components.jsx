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
export function Tabs({ items, active }) {
  return (
    <nav className="tabs">
      {items.map((t) => (
        <a key={t.key} href={t.href} className={t.key === active ? "active" : ""}>
          {t.label}
        </a>
      ))}
    </nav>
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
export function Tag({ tone = "neutral", children }) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}

export function SampleBadge({ task }) {
  return <span className="sample-badge" title={task ? `接口待实现，见 docs/tasks/${task}.md` : "示例数据"}>示例{task ? ` · ${task}` : ""}</span>;
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
export function Loadable({ state, children }) {
  if (state.loading) return <p className="muted">加载中…</p>;
  if (state.error) return <p className="error">{state.error}</p>;
  return children(state.data);
}
