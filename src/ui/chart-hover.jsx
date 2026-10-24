import { useLayoutEffect, useRef, useState } from "react";

// 折线图悬停 / 键盘（2026-10-24 用户选定，稿件 docs/design-drafts/charts/hover.html）：业务页趋势图与 Voice 热度走势共用。
// 鼠标移进图里停在最近的一列，移出收起；Tab 到图上停在 start() 那列，← → 逐列、Home / End 到头尾、Esc 收起，离开就收起。
// 竖线、方框、月份反色由各图按 active 自己画；不加动效，随列跳。
export function useChartHover(n, start) {
  const [active, setActive] = useState(-1);
  const step = d => setActive(a => a < 0 ? start() : Math.max(0, Math.min(n - 1, a + d)));
  const keys = { ArrowLeft: () => step(-1), ArrowRight: () => step(1), Home: () => setActive(0), End: () => setActive(n - 1), Escape: () => setActive(-1) };
  const hostProps = {
    tabIndex: 0,
    onFocus: () => setActive(a => a < 0 ? start() : a),
    onBlur: () => setActive(-1),
    onPointerLeave: () => setActive(-1),
    onKeyDown: e => { if (keys[e.key]) { e.preventDefault(); keys[e.key](); } },
  };
  return { active, setActive, hostProps };
}

// 数据卡：放在竖线右边（让开半列宽，不盖住这一列的数值），右边放不下换左边，始终夹在图框里（父元素要 position: relative）。
// 直角、2px 墨框；浮起感用右下错位 6px 的墨色网点（同书架悬停卡 .kbs-tip），不用阴影。x 为空时收起。
export function ChartTip({ x, gap, wide = false, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current, host = el?.offsetParent;
    if (!el || !host || x == null) return;
    const W = host.clientWidth, H = host.clientHeight, cw = el.offsetWidth + 6, ch = el.offsetHeight + 6;
    let left = x + gap;
    if (left + cw > W) left = x - gap - cw;
    el.style.left = `${Math.max(0, Math.min(W - cw, left))}px`;
    el.style.top = `${Math.max(0, Math.min(H - ch, 8))}px`;
  });
  return <div ref={ref} className={`chart-tip${wide ? " is-wide" : ""}`} hidden={x == null} aria-live="polite">
    <div className="chart-tip-sh" />
    <div className="chart-tip-card">{children}</div>
  </div>;
}

// 卡里一条线一行：行首方点照图上的画法（mark：is-now / is-part / is-last / is-pace / is-top），sub 是值下面的小字
export function ChartTipRow({ mark, color, name, value, sub, className = "" }) {
  return <div className={`chart-tip-row ${className}`}>
    <i className={`chart-tip-mk ${mark}`} style={color ? { color } : undefined} />
    <span className="chart-tip-name" title={name}>{name}</span>
    <span className="chart-tip-v">{value}</span>
    {sub && <span className="chart-tip-x">{sub}</span>}
  </div>;
}
