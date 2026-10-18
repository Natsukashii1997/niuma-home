// 扩展弹窗：填配对码和本机端口，保存后用空链接检查一次（不会写入）。
const $ = (id) => document.getElementById(id);
const status = $("status");
const ready = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });

ready.then(() => chrome.storage.local.get(["code", "port"])).then(({ code = "", port = 5280 }) => {
  $("code").value = code;
  $("port").value = port;
  status.textContent = code ? "已填配对码" : "还没配对";
});

$("pair").addEventListener("submit", async (e) => {
  e.preventDefault();
  await ready;
  await chrome.storage.local.set({ code: $("code").value.trim(), port: Number($("port").value) });
  status.textContent = "已保存，正在检查…";
  const r = await chrome.runtime.sendMessage({ type: "CHECK" });
  status.textContent = r?.ok ? "配对成功，可以去飞书文档页点「收藏」了" : `已保存，但检查没通过：${r?.error || "未知错误"}`;
  status.className = r?.ok ? "ok" : "err";
});

$("clear").addEventListener("click", async () => {
  await ready;
  await chrome.storage.local.remove("code");
  $("code").value = "";
  status.textContent = "配对码已清除";
  status.className = "";
});

$("open").addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_HOME" }));
