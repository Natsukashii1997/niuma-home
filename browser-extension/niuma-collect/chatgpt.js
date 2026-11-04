// 牛马之家 · ChatGPT 桥（页面一侧，issue #15）：只在后台交来任务时动作——把消息填进本会话输入框并发送，
// 边出边读回复；或读出页面上已加载的消息。不读 cookie、token、localStorage，不调 ChatGPT 的接口。
// ChatGPT 改版时最先坏的是下面 SEL 里的选择器（2026-11-04 按当时页面核对）。

const SEL = {
  editor: '.ProseMirror[contenteditable="true"], #prompt-textarea',
  unit: "[data-content-search-unit-key]",       // 每条消息一个，键名以 :user / :assistant 结尾
  state: "[data-talvt-turn-state]",             // 所在轮次：in_progress / complete
  block: "p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, table",
};
const role = (el) => el.getAttribute("data-content-search-unit-key").split(":").pop();
const units = (who) => [...document.querySelectorAll(SEL.unit)].filter((el) => !who || role(el) === who);

// 回复按段落取文字：列表补上「- 」或「1. 」，标题补「#」，跳过读屏专用的隐藏标题（如「ChatGPT 说：」）。
function textOf(el) {
  // 只取最外层的段落；列表项里嵌套的子列表项单独成行。
  const inner = (b) => b.parentElement.closest(b.tagName === "LI" ? "p, h1, h2, h3, h4, h5, h6, pre, blockquote, table" : SEL.block);
  const blocks = [...el.querySelectorAll(SEL.block)].filter((b) => !b.closest(".sr-only") && !el.contains(inner(b)));
  if (!blocks.length) return el.innerText.trim();
  return blocks.map((b) => {
    const text = b.innerText.trim();
    if (b.tagName === "LI") {
      const list = b.parentElement, depth = "  ".repeat(Math.max(0, [...ancestors(b)].filter((a) => a.tagName === "LI").length));
      const own = [...b.childNodes].filter((n) => !(n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName))).map((n) => n.textContent).join("").trim();
      return `${depth}${list?.tagName === "OL" ? `${[...list.children].indexOf(b) + 1}.` : "-"} ${own}`;
    }
    if (/^H[1-6]$/.test(b.tagName)) return `${"#".repeat(Number(b.tagName[1]))} ${text}`;
    if (b.tagName === "PRE") return "```\n" + text + "\n```";
    return text;
  }).filter(Boolean).join("\n\n");
}
function* ancestors(el) { for (let a = el.parentElement; a; a = a.parentElement) yield a; }

function checkPage(url) {
  const id = url.split("/c/").pop();
  if (!location.pathname.endsWith(`/c/${id}`)) throw new Error("ChatGPT 标签页已不在这个会话上，请重新发送");
}

// 等页面变化到满足条件：靠 MutationObserver 而不是定时轮询，标签页在后台时计时器会被浏览器放慢。
function until(check, ms, error) {
  return new Promise((resolve, reject) => {
    const hit = check(); if (hit) return resolve(hit);
    const observer = new MutationObserver(() => { const v = check(); if (v) { stop(); resolve(v); } });
    const timer = setTimeout(() => { stop(); reject(new Error(error)); }, ms);
    const stop = () => { observer.disconnect(); clearTimeout(timer); };
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["data-talvt-turn-state", "disabled"] });
  });
}

const flat = (s) => s.replace(/\s+/g, "");

async function send(job, post) {
  checkPage(job.url);
  const editor = await until(() => document.querySelector(SEL.editor), 20000, "ChatGPT 页面没有输入框：请确认已登录");
  const states = [...document.querySelectorAll(SEL.state)];
  if (states.at(-1)?.getAttribute("data-talvt-turn-state") === "in_progress") throw new Error("这个 ChatGPT 会话还在回复上一条，请稍后再发");
  if (flat(editor.innerText)) throw new Error("ChatGPT 输入框里有没发出的草稿，请先到 ChatGPT 页面处理");
  const before = units("assistant").length;
  editor.focus();
  // 按粘贴填入：换行原样保留（ChatGPT 自己就是这样处理粘贴的）。
  const data = new DataTransfer(); data.setData("text/plain", job.text);
  editor.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  if (flat(editor.innerText) !== flat(job.text)) throw new Error("没能把消息填进 ChatGPT 输入框（页面可能改版了），什么也没发送");
  const button = await until(() => { const b = editor.closest("form")?.querySelector('button[type="submit"]'); return b && !b.disabled && b; }, 5000, "ChatGPT 的发送按钮没有就绪（页面可能改版了），消息留在了输入框里没发送");
  button.click();
  const turn = await until(() => units("assistant")[before], 120000, "已点发送，但 ChatGPT 两分钟内没有开始回复：请到 ChatGPT 页面核对");
  let last = "", postedAt = 0;
  const finished = () => turn.closest(SEL.state)?.getAttribute("data-talvt-turn-state") === "complete";
  await until(() => {
    const text = textOf(turn);
    if (text !== last && Date.now() - postedAt > 300) { last = text; postedAt = Date.now(); post({ type: "delta", text }); }
    return finished();
  }, 15 * 60000, "ChatGPT 十五分钟还没回复完，结果尚未确认：请到 ChatGPT 页面核对");
  post({ type: "done", text: textOf(turn) });
}

async function history(job, post) {
  checkPage(job.url);
  await until(() => document.querySelector(SEL.editor), 20000, "ChatGPT 页面没有加载完：请确认已登录");
  post({ type: "history", messages: units().map((el) => ({ role: role(el), text: textOf(el) })).filter((m) => m.role === "user" || m.role === "assistant") });
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "BRIDGE_PING") reply({ ready: !!document.querySelector(SEL.editor) });
  return false;
});
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "niuma-bridge") return;
  port.onMessage.addListener((job) => {
    const post = (m) => { try { port.postMessage(m); } catch { /* 后台已断开 */ } };
    (job.type === "history" ? history : send)(job, post).catch((e) => post({ type: "error", error: e.message }));
  });
});
