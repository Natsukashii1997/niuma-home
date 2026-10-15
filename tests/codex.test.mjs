import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync } from "node:fs";
import path from "node:path";
import { CodexClient, launchArgs, deniedResponse } from "../server/codex.mjs";
import { consumeMessageStream } from "../src/modules/assistants/message-stream.js";

function fake(t, handle = () => undefined, options = {}) {
  const requests = [], children = [];
  const spawnProcess = () => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough();
    child.kill = () => queueMicrotask(() => child.emit("exit", 0));
    child.output = (message) => child.stdout.write(JSON.stringify(message) + "\n");
    let buffer = "";
    child.stdin.on("data", (chunk) => { buffer += chunk; let end; while ((end = buffer.indexOf("\n")) >= 0) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); requests.push(message);
      if (!message.method || message.id === undefined) continue;
      const output = handle(message, child);
      if (output === false) continue;
      const defaults = { "initialize": {}, "config/read": { config: { mcp_servers: { 'server.with.dot': { enabled: true } } } }, "model/list": { data: [model("model-a"), model("model-b")], nextCursor: null }, "thread/start": { thread: { id: "thread-1", environments: [] }, approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false } }, "thread/name/set": {}, "thread/read": { thread: { id: "imported", cwd: "/original-directory" } }, "thread/resume": { model: "model-a", reasoningEffort: "medium", approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false } }, "turn/interrupt": {} };
      queueMicrotask(() => child.output({ id: message.id, result: output ?? defaults[message.method] ?? {} }));
    } });
    children.push(child); return child;
  };
  const client = new CodexClient({ spawnProcess, requestTimeout: 1000, turnTimeout: 2000, ...options });
  t.after(() => client.close()); return { client, requests, children };
}
function note(child, method, extra = {}) { child.output({ method, params: { threadId: "thread-1", turnId: "turn-1", ...extra } }); }

const model = (value, hidden = false) => ({ id: `id-${value}`, model: value, displayName: value, description: `${value}说明`, hidden, isDefault: value === "model-a", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "标准" }, { reasoningEffort: "high", description: "深入" }] });

test("模型列表完整分页并过滤隐藏项，缓存十分钟；失败不伪造空列表且可重试", async (t) => {
  let now = 0, failed = false;
  const { client, requests } = fake(t, (r, child) => {
    if (r.method !== "model/list") return;
    if (failed) { queueMicrotask(() => child.output({ id: r.id, error: { message: "账号暂不可用" } })); return false; }
    return r.params.cursor ? { data: [model("model-b")], nextCursor: null } : { data: [model("model-a"), model("hidden", true)], nextCursor: "page2" };
  }, { now: () => now });
  const expected = ["model-a", "model-b"].map((value) => ({ id: `id-${value}`, model: value, displayName: value, description: `${value}说明`, isDefault: value === "model-a", defaultEffort: "medium", efforts: [{ value: "medium", description: "标准" }, { value: "high", description: "深入" }] }));
  assert.deepEqual(await client.models(), expected);
  now = 599999; assert.deepEqual(await client.models(), expected);
  assert.equal(requests.filter((r) => r.method === "model/list").length, 2);
  assert.ok(requests.filter((r) => r.method === "model/list").every((r) => r.params.includeHidden === false));
  now = 600000; failed = true; await assert.rejects(client.models(), /账号暂不可用/);
  failed = false; assert.deepEqual(await client.models(), expected);
  assert.equal(requests.filter((r) => r.method === "model/list").length, 5);
});

test("选择模型和强度后真实透传；清空设置下一轮恢复全局默认，runtime 回读而非使用期望值", async (t) => {
  let effective = { model: "model-a", reasoningEffort: "medium" }, globalEffort = "medium";
  const { client, requests } = fake(t, (r, child) => {
    if (r.method === "config/read" && !r.params.cwd) return { config: { model: "model-a", model_reasoning_effort: globalEffort } };
    if (r.method === "thread/resume") return { ...effective, approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false } };
    if (r.method === "turn/start") {
      effective = { model: r.params.model ?? effective.model, reasoningEffort: r.params.effort ?? effective.reasoningEffort };
      note(child, "turn/completed", { turn: { id: "turn-1", status: "completed" } });
      return { turn: { id: "turn-1" } };
    }
  });
  await client.send("thread-1", "选 B", () => {}, undefined, { model: "model-b", effort: "high" });
  assert.deepEqual(await client.runtime("thread-1"), { model: "model-b", effort: "high" });
  await client.send("thread-1", "恢复默认", () => {}, undefined, { model: null, effort: null });
  assert.deepEqual(await client.runtime("thread-1"), { model: "model-a", effort: "medium" });
  globalEffort = "high";
  await client.send("thread-1", "跟随配置更新", () => {});
  assert.deepEqual(await client.runtime("thread-1"), { model: "model-a", effort: "high" });
  const turns = requests.filter((r) => r.method === "turn/start");
  assert.deepEqual(turns.map(({params}) => [params.model,params.effort]), [["model-b","high"],["model-a","medium"],["model-a","high"]]);
  for (const {params} of turns) {
    assert.equal(params.approvalPolicy,"never"); assert.deepEqual(params.sandboxPolicy,{ type: "readOnly", networkAccess: false }); assert.deepEqual(params.environments,[]);
  }
  assert.ok(requests.filter((r) => r.method === "thread/resume").length >= 3);
});

test("无显式全局配置时使用目录默认；无可用默认、强度非法或配置读取失败均阻止发送", async (t) => {
  let config = {}, models = [model("model-a")], fail = false;
  const {client,requests} = fake(t,(r,child)=>{
    if (r.method === "config/read") {
      if (fail) { queueMicrotask(()=>child.output({id:r.id,error:{message:"无法读取默认配置"}})); return false; }
      return {config};
    }
    if (r.method === "model/list") return {data:models,nextCursor:null};
  });
  assert.deepEqual(await client.selection({model:null,effort:null}),{model:"model-a",effort:"medium"});
  config = {model:"missing"}; await assert.rejects(client.send("thread-1","不能发送",()=>{}),/不可用/);
  config = {model:"model-a",model_reasoning_effort:"ultra"}; await assert.rejects(client.send("thread-1","不能发送",()=>{}),/强度/);
  fail = true; await assert.rejects(client.send("thread-1","不能发送",()=>{}),/读取默认配置/);
  assert.ok(!requests.some((r)=>r.method==="turn/start"));
  const none=fake(t,r=>r.method==="model/list"?{data:[],nextCursor:null}:undefined);
  await assert.rejects(none.client.selection({model:null,effort:null}),/默认模型/);
});

test("runtime 读取与发送交错时，先完成恢复读取再启动新轮，避免迟到的 resume 干扰回复",async(t)=>{
  let release, held=false;
  const {client,requests}=fake(t,(r,child)=>{
    if(r.method==="thread/read"&&!held){held=true;release=()=>child.output({id:r.id,result:{thread:{id:"thread-1",cwd:"/temporary"}}});return false;}
    if(r.method==="turn/start"){note(child,"turn/completed",{turn:{id:"turn-1",status:"completed"}});return {turn:{id:"turn-1"}};}
  });
  const reading=client.runtime("thread-1");
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  const sending=client.send("thread-1","等待读取结束",()=>{});
  await new Promise(resolve=>setImmediate(resolve));
  try { assert.ok(!requests.some(r=>r.method==="turn/start")); }
  finally { release(); await Promise.all([reading,sending]); }
});

test("进程按需复用；新会话组装说明与硬权限，不覆盖默认模型", async (t) => {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const { client, requests, children } = fake(t);
  assert.equal(children.length, 0);
  const cwd = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, "codex-"));
  await client.create({ cwd, name: "文案助手", instructions: "回复以验收开头" });
  const params = requests.find((r) => r.method === "thread/start").params;
  assert.equal(params.cwd, cwd); assert.equal(params.sandbox, "read-only"); assert.equal(params.approvalPolicy, "never");
  assert.deepEqual(params.environments, []); assert.deepEqual(params.dynamicTools, []);
  assert.deepEqual(params.config.mcp_servers, { 'server.with.dot': { enabled: false } });
  assert.match(params.developerInstructions, /回复以验收开头/); assert.equal(params.model, undefined);
  assert.ok(launchArgs.includes("features.shell_tool=false")); assert.ok(launchArgs.includes("features.hooks=false"));
  await client.readThread("thread-1"); assert.equal(children.length, 1);
});

test("只读权限未采用时失败关闭，导入恢复使用原目录且不重设说明", async (t) => {
  const { client, requests } = fake(t);
  await client.resume("imported");
  const params = requests.find((r) => r.method === "thread/resume").params;
  assert.equal(params.cwd, "/original-directory"); assert.equal(params.approvalPolicy, "never"); assert.equal(params.developerInstructions, undefined);
  const bad = fake(t, (r) => r.method === "thread/resume" ? { approvalPolicy: "on-request", sandbox: { type: "workspaceWrite" } } : undefined);
  await assert.rejects(bad.client.resume("imported"), /未采用/);
  assert.ok(!bad.requests.some((r) => r.method === "turn/start"));
});

test("流式早到事件、UTF-8 分块、多条回复与串台过滤，完成只发一次", async (t) => {
  const events = [];
  const { client, requests } = fake(t, (r, child) => {
    if (r.method !== "turn/start") return;
    note(child, "item/agentMessage/delta", { turnId: "old-turn", itemId: "bad", delta: "旧内容" });
    note(child, "item/agentMessage/delta", { itemId: "a", delta: "你好" });
    const raw = Buffer.from(JSON.stringify({ method: "item/agentMessage/delta", params: { threadId: "thread-1", turnId: "turn-1", itemId: "a", delta: "🙂" } }) + "\n");
    const cut = raw.indexOf(Buffer.from("🙂")) + 2; child.stdout.write(raw.subarray(0, cut)); child.stdout.write(raw.subarray(cut));
    note(child, "item/completed", { item: { type: "agentMessage", id: "a", text: "你好🙂！" } });
    note(child, "item/completed", { item: { type: "agentMessage", id: "b", text: "第二段" } });
    note(child, "turn/completed", { turn: { id: "turn-1", status: "completed" } });
    return { turn: { id: "turn-1" } };
  });
  await client.send("thread-1", "消息", (event, data) => events.push([event, data]));
  assert.equal(events.filter(([e]) => e === "delta").map(([,d]) => d.text).join(""), "你好🙂！第二段");
  assert.equal(events.filter(([e]) => e === "done").length, 1);
  const params = requests.find((r) => r.method === "turn/start").params;
  assert.deepEqual(params.input, [{ type: "text", text: "消息", text_elements: [] }]);
  assert.deepEqual(params.environments, []); assert.deepEqual(params.sandboxPolicy, { type: "readOnly", networkAccess: false });
  assert.equal(client.events.listenerCount("notification"), 0);
});

test("失败/退出不发 done，不自动重放；下次请求重启且审批全部拒绝", async (t) => {
  let sent = false; const events = [];
  const { client, requests, children } = fake(t, (r, child) => {
    if (r.method === "turn/start") {
      sent = true;
      setImmediate(() => child.emit("exit", 1)); return { turn: { id: "turn-1" } };
    }
  });
  await assert.rejects(client.send("thread-1", "消息", (e) => events.push(e)), /进程已退出/);
  assert.ok(sent); assert.deepEqual(events, []); assert.equal(children.length, 1);
  await client.readThread("thread-1"); assert.equal(children.length, 2);
  assert.equal(requests.filter((r) => r.method === "turn/start").length, 1);
  for (const method of ["item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/permissions/requestApproval", "item/tool/call", "execCommandApproval", "mcpServer/elicitation/request", "unknown"]) {
    children[1].output({ id: method, method, params: {} });
    const answer = requests.at(-1); assert.equal(answer.id, method);
    if (method === "unknown") assert.equal(answer.error.code, -32601); else assert.deepEqual(answer.result, deniedResponse(method));
  }
});

test("历史分页完整、只显示用户与助手文本；会话名称不伪造", async (t) => {
  const { client } = fake(t, (r) => {
    if (r.method === "thread/items/list") return r.params.cursor ? { data: [{ item: { type: "agentMessage", text: "回答" } }], nextCursor: null } : { data: [{ item: { type: "userMessage", content: [{ type: "text", text: "问题" }] }, startedAtMs: 1000 }, { item: { type: "reasoning", text: "隐藏" } }], nextCursor: "next" };
    if (r.method === "thread/list") return { data: [{ id: "a", name: "真实名称", updatedAt: 1, cwd: "/a" }, { id: "b", name: null, preview: "不能当名称" }], nextCursor: null };
  });
  assert.deepEqual(await client.messages("a"), [{ role: "user", text: "问题", at: "1970-01-01T00:00:01.000Z" }, { role: "assistant", text: "回答" }]);
  assert.deepEqual(await client.listSessions(), [{ threadId: "a", name: "真实名称", updatedAt: "1970-01-01T00:00:01.000Z", cwd: "/a" }]);
});

test("前端 SSE 任意字节切片可解码；提前断流或 error 均失败", async () => {
  const bytes = new TextEncoder().encode(': 心跳\n\nevent: delta\ndata: {"text":"你好🙂","itemId":"a"}\n\nevent: done\ndata: {}\n\n');
  const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }));
  const events = []; await consumeMessageStream(response, (e,d) => events.push([e,d]));
  assert.deepEqual(events, [["delta", { text: "你好🙂", itemId: "a" }], ["done", {}]]);
  await assert.rejects(consumeMessageStream(new Response('event: delta\ndata: {"text":"部分"}\n\n'), () => {}), /提前结束/);
  await assert.rejects(consumeMessageStream(new Response('event: error\ndata: {"error":"额度不足"}\n\n'), () => {}), /额度不足/);
});

test("legacy 导入历史使用 thread/read，不迁移或调用不支持的分页接口", async (t) => {
  const { client, requests } = fake(t, (r) => r.method === "thread/read" ? { thread: { historyMode: "legacy", turns: [{ items: [{ type: "userMessage", content: [{ type: "text", text: "旧问题" }] }, { type: "agentMessage", text: "旧回答" }] }] } } : undefined);
  assert.deepEqual(await client.messages("old"), [{ role: "user", text: "旧问题" }, { role: "assistant", text: "旧回答" }]);
  assert.ok(!requests.some((r) => r.method === "thread/items/list"));
});

test("断开后等待轮次中断完成才释放锁，不能把新消息 steer 入旧轮", async (t) => {
  const { client, children, requests } = fake(t, (r) => r.method === "turn/start" ? { turn: { id: "turn-1" } } : undefined);
  const abort = new AbortController();
  const sending = client.send("thread-1", "消息", () => {}, abort.signal);
  const outcome = assert.rejects(sending, /取消/);
  while (!requests.some((r) => r.method === "turn/start")) await new Promise((r) => setImmediate(r));
  abort.abort();
  await assert.rejects(client.send("thread-1", "不应插入", () => {}), /正在回复/);
  note(children[0], "turn/completed", { turn: { id: "turn-1", status: "interrupted" } });
  await outcome;
  assert.equal(client.active.size,0); assert.equal(requests.filter((r) => r.method === "turn/start").length,1);
});
