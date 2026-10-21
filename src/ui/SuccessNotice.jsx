import { useEffect, useRef, useState } from "react";

// 成功提示统一在3秒内按帧淡出；错误、待处理与长期状态不经过这里。
export function SuccessNotice({ children, onClose, identity, className = "" }) {
  const [frame, setFrame] = useState(0), close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    setFrame(0);
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      setFrame(Math.min(30, Math.floor(elapsed / 100)));
      if (elapsed >= 3000) { clearInterval(timer); close.current?.(); }
    }, 100);
    return () => clearInterval(timer);
  }, [identity]);
  if (frame >= 30) return null;
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return <div className={className} role="status" style={{ opacity: reduced ? 1 : Math.min(1, (30 - frame) / 18) }}>{children}</div>;
}
