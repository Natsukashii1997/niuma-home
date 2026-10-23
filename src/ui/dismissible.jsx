import { useState } from "react";
import { PixelIcon } from "./bitmap.jsx";

// 常驻提示可点 × 关掉（用户 2026-10-23）：记在本机浏览器，同一条内容不再出现；stamp 变了（新的报错、数字或依据）才再出现。
// 操作说明类提示传固定的 stamp，关掉后一直不再出现。存不了（无痕模式等）就只关本次。
export function useDismissed(id, stamp) {
  const key = `niuma:dismiss:${id}`, value = String(stamp);
  const [closed, setClosed] = useState(() => { try { return localStorage.getItem(key); } catch { return null; } });
  const close = () => { try { localStorage.setItem(key, value); } catch { /* 存不了就只关本次 */ } setClosed(value); };
  return [closed === value, close];
}

export function DismissibleNote({ id, stamp, as: Tag = "p", className = "", children, ...rest }) {
  const [hidden, close] = useDismissed(id, stamp);
  if (hidden) return null;
  return (
    <Tag className={`${className} has-close`} {...rest}>
      <span>{children}</span>
      <button type="button" className="icon-btn note-close" onClick={close} aria-label="关闭这条提示"><PixelIcon name="close" /></button>
    </Tag>
  );
}
