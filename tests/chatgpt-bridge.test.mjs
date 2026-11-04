import { legacyHeaders } from "./helpers/legacy-headers.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { openDb, listAssistants } from "../server/db.mjs";
import { routes } from "../server/routes/assistants.mjs";
import { createChatgptBridge, normalizeChatgptUrl } from "../server/chatgpt-bridge.mjs";
import { match, json } from "../server/http.mjs";

const URL_A = "https://chatgpt.com/c/6a4bb8a9-e690-83ea-bd02-939364b22823";

test("ChatGPT 会话链接只收 chatgpt.com 的会话地址，去掉查询参数", () => {
  assert.equal(normalizeChatgptUrl(` ${URL_A}?model=x#top `), URL_A);
  assert.equal(normalizeChatgptUrl("https://chatgpt.com/g/g-p-abc123/c/6a4bb8a9-e690-83ea-bd02-939364b22823/"), "https://chatgpt.com/g/g-p-abc123/c/6a4bb8a9-e690-83ea-bd02-939364b22823");
  for (const bad of ["http://chatgpt.com/c/6a4bb8a9-e690-83ea-bd02-939364b22823", "https://chat.openai.com/c/6a4bb8a9-e690-83ea-bd02-939364b22823", "https://chatgpt.com/", "https://chatgpt.com/c/abc", "不是链接", 42, null]) assert.equal(normalizeChatgptUrl(bad), null, String(bad));
});

test("桥：插件不在线直接报错；在线时排队、逐段转发、整段替换、结束", async () => {
  const bridge = createChatgptBridge({ pollMs: 50 });
  await assert.rejects(bridge.request("send", { url: URL_A, text: "你好" }), /ChatGPT 桥没连上/);
  assert.equal(bridge.status().connected, false);
  assert.equal(await bridge.next(), null); // 空轮询也算在线
  assert.equal(bridge.status().connected, true);
  const events = [];
  const reply = bridge.request("send", { url: URL_A, text: "你好", onEvent: (e, d) => events.push([e, d]) });
  const job = await bridge.next();
  assert.deepEqual({ type: job.type, url: job.url, text: job.text }, { type: "send", url: URL_A, text: "你好" });
  assert.equal(bridge.report("不存在", { type: "alive" }), false);
  assert.ok(bridge.report(job.id, { type: "alive" }));
  assert.ok(bridge.report(job.id, { type: "delta", text: "你" }));
  assert.ok(bridge.report(job.id, { type: "delta", text: "你好呀" }));
  assert.ok(bridge.report(job.id, { type: "delta", text: "您好呀" }));
  assert.ok(bridge.report(job.id, { type: "done", text: "您好呀！" }));
  assert.equal(await reply, "您好呀！");
  assert.deepEqual(events, [["delta", { itemId: "chatgpt", text: "你" }], ["delta", { itemId: "chatgpt", text: "好呀" }], ["delta", { itemId: "chatgpt", text: "您好呀", replace: true }], ["delta", { itemId: "chatgpt", text: "！" }], ["done", {}]]);
  assert.equal(bridge.report(job.id, { type: "delta", text: "迟到" }), false); // 结束后的迟到消息不再转发
});

test("桥：读历史、插件报错、没人取走、取走后断联都会结束，不会一直挂着", async () => {
  const bridge = createChatgptBridge({ pollMs: 20, pickupMs: 30, idleMs: 30 });
  await bridge.next();
  const history = bridge.request("history", { url: URL_A });
  const job = await bridge.next();
  bridge.report(job.id, { type: "history", messages: [{ role: "user", text: "问" }, { role: "assistant", text: "答" }, { role: "system", text: "丢掉" }] });
  assert.deepEqual(await history, [{ role: "user", text: "问" }, { role: "assistant", text: "答" }]);

  const failing = bridge.request("send", { url: URL_A, text: "x" });
  bridge.report((await bridge.next()).id, { type: "error", error: "输入框里有没发出的草稿" });
  await assert.rejects(failing, /输入框里有没发出的草稿/);

  await assert.rejects(bridge.request("send", { url: URL_A, text: "没人取" }), /ChatGPT 桥没连上/);
  await bridge.next();
  const silent = bridge.request("send", { url: URL_A, text: "取走后不回" });
  await bridge.next();
  await assert.rejects(silent, /长时间没有回应/);

  // 页面断开：还没取走的任务撤回，插件之后取不到它。
  const controller = new AbortController();
  const gone = bridge.request("send", { url: URL_A, text: "撤回", signal: controller.signal });
  controller.abort();
  assert.equal(await gone, null);
  assert.equal(await bridge.next(), null);
});

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, "chatgpt-bridge-")), db = openDb(dir);
  const client = { messages: async () => [], create: async () => "codex", send: async (id, text, emit) => { emit("done", {}); }, listSessions: async () => [] };
  const handlers = routes(db, client, createChatgptBridge({ pollMs: 200 }));
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost"), found = match(handlers, req.method, url.pathname);
    if (!found) return json(res, 404, {});
    try { await found.handler(req, res, { params: found.params, url }); } catch (e) { json(res, 500, { error: e.message }); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = (method, url, body, headers = {}) => fetch(`http://127.0.0.1:${server.address().port}${url}`, { method, headers: { "content-type": "application/json", ...legacyHeaders(db, method, url), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { db, request };
}

test("助手绑定 ChatGPT 会话后，发消息与读历史都走桥；插件接口要配对码", async (t) => {
  const { db, request } = await setup(t);
  const notice = listAssistants(db).find((a) => a.preset === "notice");
  assert.equal(notice.chatgptUrl, null);
  const bad = await request("PATCH", `/api/assistants/${notice.id}`, { chatgptUrl: "https://example.com/c/1" });
  assert.equal(bad.status, 400); assert.match((await bad.json()).error, /chatgpt\.com/);
  const saved = await (await request("PATCH", `/api/assistants/${notice.id}`, { chatgptUrl: `${URL_A}?x=1` })).json();
  assert.equal(saved.chatgptUrl, URL_A);
  assert.notEqual(saved.writeVersion, (await (await request("GET", "/api/assistants")).json()).find((a) => a.preset === "interview").writeVersion);

  assert.equal((await request("GET", `/api/assistants/${notice.id}/messages`)).status, 503); // 插件还没来过
  assert.equal((await (await request("GET", "/api/v3/chatgpt-bridge/status")).json()).connected, false);
  const extension = { origin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop" };
  assert.equal((await request("GET", "/api/v3/chatgpt-bridge/next", undefined, extension)).status, 403); // 没配对码
  assert.equal((await request("GET", "/api/v3/chatgpt-bridge/status", undefined, extension)).status, 403); // 状态只给页面

  // 模拟插件：先空轮询一次上线，再取走发送任务并回传。
  assert.deepEqual(await (await request("GET", "/api/v3/chatgpt-bridge/next")).json(), { job: null });
  const sending = request("POST", `/api/assistants/${notice.id}/messages`, { text: " 写一条通知 " }).then((r) => r.text());
  const { job } = await (await request("GET", "/api/v3/chatgpt-bridge/next")).json();
  assert.equal(job.text, "写一条通知"); assert.equal(job.url, URL_A);
  assert.equal((await request("POST", `/api/v3/chatgpt-bridge/jobs/${job.id}`, { type: "delta", text: "各位" })).status, 200);
  await request("POST", `/api/v3/chatgpt-bridge/jobs/${job.id}`, { type: "done", text: "各位好" });
  const stream = await sending;
  assert.match(stream, /event: delta\ndata: {"itemId":"chatgpt","text":"各位"}/);
  assert.match(stream, /event: delta\ndata: {"itemId":"chatgpt","text":"好"}/);
  assert.match(stream, /event: done/);
  assert.equal((await request("POST", `/api/v3/chatgpt-bridge/jobs/${job.id}`, { type: "alive" })).status, 404);

  const history = request("GET", `/api/assistants/${notice.id}/messages`).then((r) => r.json());
  const read = (await (await request("GET", "/api/v3/chatgpt-bridge/next")).json()).job;
  assert.equal(read.type, "history");
  await request("POST", `/api/v3/chatgpt-bridge/jobs/${read.id}`, { type: "history", messages: [{ role: "user", text: "写一条通知" }, { role: "assistant", text: "各位好" }] });
  assert.deepEqual(await history, [{ role: "user", text: "写一条通知" }, { role: "assistant", text: "各位好" }]);

  assert.equal((await request("POST", `/api/assistants/${notice.id}/conversations/new`, { expectedThreadId: null })).status, 400);
  const cleared = await (await request("PATCH", `/api/assistants/${notice.id}`, { chatgptUrl: null })).json();
  assert.equal(cleared.chatgptUrl, null);
  assert.equal(cleared.writeVersion, (await import("../server/legacy-writes.mjs")).assistantVersion({ ...cleared, chatgptUrl: undefined })); // 解绑后版本号回到不带链接的算法
});
