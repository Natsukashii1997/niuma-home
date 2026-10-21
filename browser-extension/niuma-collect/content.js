// 牛马之家 · 收藏（页面按钮）：飞书文档页右下角一个「收藏」按钮，点一下交给后台收藏，结果显示在按钮上方。
// 按钮放在 Shadow DOM 里，不受飞书页面样式影响；飞书是单页应用，每秒检查一次地址，非文档页不显示。
(() => {
  if (window.top !== window || document.getElementById("niuma-collect-host")) return;
  const DOC = /^\/(wiki|docx|sheets|base|slides|mindnotes|file)\/[A-Za-z0-9]+/;
  const host = document.createElement("div");
  host.id = "niuma-collect-host";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>
    :host { all: initial; }
    .wrap { position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; font: 13px/1.5 -apple-system, "PingFang SC", sans-serif; color: #0D0E10; }
    button.main { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border: 2px solid #0D0E10; background: #0D0E10; color: #FBFBFC; font: 600 13px "SF Mono", ui-monospace, "PingFang SC", monospace; letter-spacing: .04em; cursor: pointer; box-shadow: 4px 4px 0 rgba(13,14,16,.18); }
    button.main:hover:not(:disabled) { background: #FF4F1F; border-color: #FF4F1F; }
    button.main:focus-visible { outline: 2px solid #FF4F1F; outline-offset: 2px; }
    button.main:disabled { cursor: progress; background: #686D76; border-color: #686D76; }
    .star { font-size: 14px; line-height: 1; }
    .tip { min-width: min(260px, calc(100vw - 48px)); max-width: min(340px, calc(100vw - 48px)); box-sizing: border-box; padding: 10px 12px; background: #FBFBFC; border: 2px solid #0D0E10; border-left-width: 6px; box-shadow: 4px 4px 0 rgba(13,14,16,.12); overflow-wrap: anywhere; }
    .tip[hidden] { display: none; }
    .tip.ok { border-left-color: #1E8E4E; } .tip.warn { border-left-color: #B26B00; background: #FDF2DC; } .tip.err { border-left-color: #D92D20; background: #FDECEA; }
    .tip b { display: block; margin-bottom: 2px; }
    .tip .muted { color: #686D76; font-size: 12px; }
    .tip .acts { display: flex; gap: 12px; margin-top: 6px; }
    .tip a, .tip .link { color: #0D0E10; text-decoration: underline; cursor: pointer; background: none; border: 0; padding: 0; font: inherit; font-size: 12px; }
    .tip .x { float: right; margin-left: 8px; text-decoration: none; color: #686D76; }
  </style>
  <div class="wrap"><div class="tip" role="status" hidden></div><button class="main" type="button" title="收进牛马之家当前设置的知识库：建快捷方式，原文不动"><span class="star">★</span><span class="label">收藏</span></button></div>`;
  const tip = root.querySelector(".tip"), btn = root.querySelector("button.main"), label = root.querySelector(".label");
  const REASON = { chosen: "按你选的目录", matched: "按关键词命中", unclear: "归类不明确，先放在根目录（牛马之家画布的散卡区）", first: "命中多个目录，取排最前的", fallback: "没命中关键词，放兜底目录" };
  let timer = 0;

  function show(tone, title, detail, acts = []) {
    clearTimeout(timer);
    tip.className = `tip ${tone}`;
    tip.replaceChildren();
    const x = Object.assign(document.createElement("button"), { className: "link x", textContent: "×", title: "关闭" });
    x.onclick = () => { tip.hidden = true; };
    const b = Object.assign(document.createElement("b"), { textContent: title });
    tip.append(x, b);
    if (detail) tip.append(Object.assign(document.createElement("span"), { className: "muted", textContent: detail }));
    if (acts.length) {
      const row = Object.assign(document.createElement("div"), { className: "acts" });
      for (const a of acts) row.append(a);
      tip.append(row);
    }
    tip.hidden = false;
    if (tone === "ok") timer = setTimeout(() => { tip.hidden = true; }, 8000);
  }
  const link = (text, href) => Object.assign(document.createElement("a"), { textContent: text, href, target: "_blank", rel: "noreferrer" });
  const action = (text, fn) => { const a = Object.assign(document.createElement("button"), { className: "link", textContent: text }); a.onclick = fn; return a; };
  const openHome = () => chrome.runtime.sendMessage({ type: "OPEN_HOME" });

  btn.addEventListener("click", async () => {
    if (btn.disabled) return;
    btn.disabled = true; label.textContent = "收藏中…"; tip.hidden = true;
    let r;
    try { r = await chrome.runtime.sendMessage({ type: "COLLECT" }); }
    catch { r = { ok: false, kind: "error", error: "扩展已更新，请刷新这个页面再点" }; }
    btn.disabled = false; label.textContent = "收藏";
    if (r?.ok && r.status === "created") show("ok", `已收藏到「${r.parentTitle}」`, `${REASON[r.reason] || ""}${r.matched?.length ? `：${r.matched.map((m) => m.keywords.join("、")).join("；")}` : ""}`, [link("在飞书打开", r.url)]);
    else if (r?.ok && r.status === "duplicate") show("ok", `已经在知识库里了：「${r.parentTitle}」`, r.duplicateKind === "inSpace" ? "原文就在知识库里，没有新建" : "已有指向它的快捷方式，没有新建", r.url ? [link("在飞书打开", r.url)] : []);
    else if (r?.kind === "unknown") show("warn", "结果不明，已停止", `${r.error}。不会自动重试，也不要再点；到牛马之家核对。`, [action("去牛马之家核对", openHome)]);
    else if (r?.kind === "pairing") show("err", "需要配对", r.error);
    else if (r?.kind === "offline") show("err", "没连上牛马之家", "请确认本机牛马之家在运行，然后再点一次（同一请求不会重复收藏）");
    else show("err", "没有收藏", r?.error || "未知错误");
  });

  let last = "";
  function sync() {
    const on = DOC.test(location.pathname);
    if (on && !host.isConnected) document.documentElement.append(host);
    if (!on && host.isConnected) host.remove();
    if (location.pathname !== last) { last = location.pathname; tip.hidden = true; }
  }
  sync();
  setInterval(sync, 1000);
})();
