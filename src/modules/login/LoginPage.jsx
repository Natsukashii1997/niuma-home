import { useEffect, useRef, useState } from "react";
import { OceanEngine } from "../../vendor/ascii-sharks/index.ts";
import { frames, prefersReducedMotion } from "../../ui/bitmap.jsx";

// 登录页：ASCII 鲨鱼背景 + 终端标题 + 单行登录框（用户 2026-11-02 定稿的「C3 白雾」）。
// 账号密码由服务端从数据目录 login.json 读出预填，回车或点箭头进入；同一个标签页里进过一次就不再出现。
const SHARKS = ["greathammer", "nurse", "mako", "classic"].map((kind, i) => ({ kind, size: 1 - i * 0.1 }));
const ENTERED = "niuma-entered";

export const hasEntered = () => {
  try { return sessionStorage.getItem(ENTERED) === "1"; } catch { return false; }
};

export default function LoginPage({ onEnter }) {
  const canvas = useRef(null);
  const form = useRef(null);
  const [saved, setSaved] = useState(null);
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cursorOn, setCursorOn] = useState(true);

  useEffect(() => {
    const engine = new OceanEngine(canvas.current, SHARKS);
    return () => engine.destroy();
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/login").then((r) => r.json()).catch(() => ({ configured: false, account: "", password: "" })).then((login) => {
      if (!alive) return;
      setSaved(login);
      setAccount(login.account);
      setPassword(login.password);
    });
    return () => { alive = false; };
  }, []);

  // 标题光标：按帧亮灭（15 帧/秒，8 帧一换），减少动态效果时常亮
  useEffect(() => (prefersReducedMotion() ? undefined : frames((f) => { if (f % 8 === 0) setCursorOn((on) => !on); })), []);

  // 焦点不在输入框时按回车也能进
  useEffect(() => {
    const onKey = (e) => {
      const inForm = e.target instanceof Node && form.current?.contains(e.target); // 框内回车由表单自己提交
      if (e.key === "Enter" && !inForm) form.current?.requestSubmit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = (e) => {
    e.preventDefault();
    if (!saved) return;
    if (saved.configured && (account !== saved.account || password !== saved.password)) { setError("账号或密码不对"); return; }
    try { sessionStorage.setItem(ENTERED, "1"); } catch { /* 无痕模式等存不了，下次再进一次即可 */ }
    onEnter();
  };

  return (
    <div className="login">
      <div className="login-stage"><canvas ref={canvas} aria-hidden="true" /></div>
      <div className="login-fog" />
      <div className="login-center">
        <h1 className="login-title" aria-label="牛马之家">
          <span className="login-prompt">&gt;</span>牛马之家<span className={`login-cursor${cursorOn ? "" : " off"}`} />
        </h1>
        <form ref={form} className="login-form" autoComplete="off" onSubmit={submit}>
          <div className="login-glass">
            <input aria-label="账号" placeholder="账号" value={account} onChange={(e) => { setAccount(e.target.value); setError(""); }} />
            <span className="login-sep" />
            <input aria-label="密码" type="password" placeholder="密码" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} />
            <button className="login-go" type="submit" aria-label="进入">→</button>
          </div>
          <div className="login-error" role="alert">{error}</div>
        </form>
      </div>
    </div>
  );
}
