// 全站原生滚动条：滚动/进入滚动区域时显示，闲置后按帧淡出；不接管滚轮、键盘或滑块位置。
export function installAutoHideScrollbars() {
  const timers = new Map();
  let held = null;
  const clear = (el) => { clearTimeout(timers.get(el)); timers.delete(el); };
  const fade = (el, level = 8) => {
    clear(el);
    if (held === el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const next = reduced ? 0 : level - 1;
    if (next <= 0 || !el.isConnected) {
      el.style.removeProperty('--scroll-thumb-alpha');
      delete el.dataset.scrollbarVisible;
      return;
    }
    el.style.setProperty('--scroll-thumb-alpha', String(next * .07));
    timers.set(el, setTimeout(() => fade(el, next), 66));
  };
  const show = (el) => {
    if (!el) return;
    clear(el);
    el.style.setProperty('--scroll-thumb-alpha', '.56');
    el.dataset.scrollbarVisible = 'true';
    timers.set(el, setTimeout(() => fade(el), 800));
  };
  const scroller = (target) => {
    for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if ((el.scrollHeight > el.clientHeight && /auto|scroll/.test(style.overflowY)) ||
          (el.scrollWidth > el.clientWidth && /auto|scroll/.test(style.overflowX))) return el;
    }
    return document.scrollingElement;
  };
  document.addEventListener('scroll', (e) => show(e.target === document ? document.scrollingElement : e.target), { capture: true, passive: true });
  document.addEventListener('pointerover', (e) => {
    const el = scroller(e.target);
    if (el && (!e.relatedTarget || !el.contains(e.relatedTarget))) show(el);
  }, { passive: true });
  document.addEventListener('pointerdown', (e) => { held = scroller(e.target); show(held); }, { passive: true });
  const release = () => { const el = held; held = null; show(el); };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  window.addEventListener('blur', release);
}
