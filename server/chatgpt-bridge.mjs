// ChatGPT 桥（issue #15）：牛马之家与「牛马之家 · 收藏」插件之间的任务中转。
// 页面发消息 → 这里排队 → 插件长轮询取走 → 插件在 chatgpt.com 对应会话里填字发送、读回复 → 逐段回传。
// 只放内存：服务重启后没做完的任务直接失效，页面报错，由本人重新读取核对。不碰 ChatGPT 的接口、cookie 和 token。

const CHATGPT_URL = /^https:\/\/chatgpt\.com\/(?:g\/[A-Za-z0-9-]+\/)?c\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// 只收会话链接本身：去掉查询参数和锚点；不是 chatgpt.com 的会话链接返回 null。
export function normalizeChatgptUrl(raw) {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    const value = `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
    return CHATGPT_URL.test(value) ? value : null;
  } catch { return null; }
}

const OFFLINE = "ChatGPT 桥没连上：请打开 Chrome，确认「牛马之家 · 收藏」插件已启用、已填配对码，并已登录 ChatGPT";

export function createChatgptBridge({ now = Date.now, pollMs = 25000, pickupMs = 15000, idleMs = 60000, onlineMs = 45000 } = {}) {
  const queue = [], waiters = [], jobs = new Map();
  let seenAt = 0, sequence = 0;
  const online = () => seenAt > 0 && now() - seenAt < onlineMs;

  function finish(job, error, result) {
    if (job.over) return;
    job.over = true; clearTimeout(job.timer); jobs.delete(job.id);
    const at = queue.indexOf(job); if (at >= 0) queue.splice(at, 1);
    if (error) job.reject(new Error(error)); else job.resolve(result);
  }
  // 插件取走后每 20 秒报一次平安；超过 idleMs 没有任何消息就当插件断了。
  const arm = (job, ms, error) => { clearTimeout(job.timer); job.timer = setTimeout(() => finish(job, error), ms); };
  const pickedTimeout = "ChatGPT 页面长时间没有回应，结果尚未确认：请到 ChatGPT 页面核对后再重新读取";
  function hand(job) {
    job.picked = true; arm(job, idleMs, pickedTimeout);
    return { id: job.id, type: job.type, url: job.url, ...(job.text && { text: job.text }) };
  }

  // type：send（发一条并等回复）/ history（读页面上已加载的消息）。send 的进度经 onEvent 以 delta / done 给出。
  function request(type, { url, text, onEvent = () => {}, signal } = {}) {
    if (!online()) return Promise.reject(new Error(OFFLINE));
    return new Promise((resolve, reject) => {
      const job = { id: `cg-${now().toString(36)}-${++sequence}`, type, url, text, onEvent, resolve, reject, last: "" };
      jobs.set(job.id, job);
      arm(job, pickupMs, OFFLINE);
      // 页面断开：还没取走的直接撤回；已经交给插件的消息收不回，只停止转发。
      signal?.addEventListener("abort", () => finish(job, null, null), { once: true });
      const waiter = waiters.shift();
      if (waiter) waiter(hand(job)); else queue.push(job);
    });
  }

  // 插件长轮询：有任务立刻交出，没有就等到 pollMs 返回 null。
  function next(signal) {
    seenAt = now();
    const job = queue.shift();
    if (job) return Promise.resolve(hand(job));
    return new Promise((resolve) => {
      const done = (value) => { clearTimeout(timer); const at = waiters.indexOf(done); if (at >= 0) waiters.splice(at, 1); resolve(value); };
      const timer = setTimeout(() => done(null), pollMs);
      signal?.addEventListener("abort", () => done(null), { once: true });
      waiters.push(done);
    });
  }

  // 插件回传：alive（平安）/ delta（到目前为止的完整回复）/ done（最终回复）/ history（消息列表）/ error。
  function report(id, body) {
    seenAt = now();
    const job = jobs.get(id);
    if (!job || !job.picked) return false;
    const type = body?.type;
    if (type === "error") { finish(job, typeof body.error === "string" && body.error ? body.error : "ChatGPT 页面报错"); return true; }
    arm(job, idleMs, pickedTimeout);
    if (type === "alive") return true;
    if (job.type === "history" && type === "history" && Array.isArray(body.messages)) {
      const messages = body.messages.filter((m) => (m?.role === "user" || m?.role === "assistant") && typeof m.text === "string").map((m) => ({ role: m.role, text: m.text }));
      finish(job, null, messages); return true;
    }
    if (job.type === "send" && (type === "delta" || type === "done") && typeof body.text === "string") {
      // 页面重排可能改动前面已显示的字：能接上就只发新增部分，接不上就整段替换。
      if (body.text !== job.last) {
        const append = body.text.startsWith(job.last);
        job.onEvent("delta", { itemId: "chatgpt", text: append ? body.text.slice(job.last.length) : body.text, ...(!append && { replace: true }) });
        job.last = body.text;
      }
      if (type === "done") { job.onEvent("done", {}); finish(job, null, body.text); }
      return true;
    }
    return false;
  }

  return { request, next, report, status: () => ({ connected: online(), seenAt: seenAt ? new Date(seenAt).toISOString() : null }) };
}
