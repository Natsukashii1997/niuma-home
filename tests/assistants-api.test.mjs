import { legacyHeaders } from "./helpers/legacy-headers.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { openDb, listAssistants } from "../server/db.mjs";
import { routes } from "../server/routes/assistants.mjs";
import { match, json } from "../server/http.mjs";

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, "assistants-")), db = openDb(dir);
  const calls = [], history = [], sessions = [{ threadId: "import-1", name: "命名会话", updatedAt: "2026-10-14T00:00:00Z", cwd: "/original" }, { threadId: "import-2", name: "命名会话", updatedAt: "2026-10-14T00:00:00Z", cwd: "/another" }];
  const client = { listSessions: async () => sessions, messages: async () => history, create: async (value) => { calls.push(value); return "created"; }, send: async (id,text,emit) => { history.push({ role: "user", text }, { role: "assistant", text: "回复" }); emit("delta", { text: "回复", itemId: "a" }); emit("done", {}); } };
  const handlers = routes(db, client);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost"), found = match(handlers, req.method, url.pathname);
    if (!found) return json(res, 404, {});
    try { await found.handler(req,res,{params:found.params,url}); } catch (e) { json(res, 500, {error:e.message}); }
  });
  await new Promise((resolve) => server.listen(0,"127.0.0.1",resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); rmSync(dir,{recursive:true,force:true}); });
  const request = (method,url,body) => fetch(`http://127.0.0.1:${server.address().port}${url}`, {method,headers:{"content-type":"application/json",...legacyHeaders(db,method,url)},body:body===undefined?undefined:JSON.stringify(body)});
  return { db,dir,calls,client,request };
}

test("助手新增编辑、延迟建会话、隔离目录与说明只传首次，消息历史回读", async (t) => {
  const { request,db,dir,calls } = await setup(t);
  // 新库自带四个预设助手（文案 / 面试 / 绩效 / 通知），说明是预设初稿。
  assert.deepEqual(listAssistants(db).map((a) => a.preset), ["copywriter", "interview", "performance", "notice"]);
  assert.ok(listAssistants(db).every((a) => a.instructions.length > 100 && a.codexThreadId === null));
  assert.equal((await request("POST","/api/assistants",{name:" "})).status,400);
  const a = await (await request("POST","/api/assistants",{name:"自建助手",instructions:"初始说明"})).json();
  assert.equal(a.kind,"custom"); assert.equal(a.codexThreadId,null); assert.equal(calls.length,0);
  assert.deepEqual(await (await request("GET",`/api/assistants/${a.id}/messages`)).json(),[]);
  const stream = await (await request("POST",`/api/assistants/${a.id}/messages`,{text:"你好"})).text();
  assert.match(stream,/event: delta/); assert.match(stream,/event: done/);
  assert.equal(calls[0].cwd,path.join(realpathSync(dir),"assistants",String(a.id))); assert.equal(calls[0].instructions,"初始说明");
  await request("PATCH",`/api/assistants/${a.id}`,{instructions:"未来说明"});
  await (await request("POST",`/api/assistants/${a.id}/messages`,{text:"继续"})).text();
  assert.equal(calls.length,1); assert.equal((await (await request("GET",`/api/assistants/${a.id}/messages`)).json()).length,4);
  assert.equal((await request("GET","/api/assistants/999/messages")).status,404);
});

test("批量导入按线程去重、同名不同会话可选、已绑定置灰，事务失败不部分写入", async (t) => {
  const { request, db } = await setup(t);
  const base = listAssistants(db).length; // 四个预设助手
  assert.equal((await request("POST","/api/assistants/import",{threadIds:["missing"]})).status,400);
  const first = await (await request("POST","/api/assistants/import",{threadIds:["import-1","import-1"]})).json();
  assert.equal(first.length,1); assert.equal(first[0].kind,"imported");
  await request("POST","/api/assistants/import",{threadIds:["import-1"]});
  assert.equal(listAssistants(db).length,base + 1);
  const sessions = await (await request("GET","/api/codex/sessions")).json(); assert.equal(sessions[0].imported,true); assert.equal(sessions[1].imported,undefined);
  db.exec("CREATE TRIGGER reject_import BEFORE INSERT ON assistants WHEN NEW.codex_thread_id = 'import-2' BEGIN SELECT RAISE(ABORT, '拒绝'); END");
  assert.equal((await request("POST","/api/assistants/import",{threadIds:["import-1","import-2"]})).status,500);
  assert.equal(listAssistants(db).length,base + 1);
  db.exec("DROP TRIGGER reject_import");
  assert.equal((await request("POST","/api/assistants/import",{threadIds:["import-2"]})).status,200);
  assert.equal(listAssistants(db).length,base + 2);
});

test("同助手并发拒绝且只建一个线程，失败走 SSE error 不冒充完成", async (t) => {
  const { request, client, calls } = await setup(t);
  let release; client.send = () => new Promise((resolve,reject) => { release = () => reject(new Error("额度不足")); });
  const response = await request("POST","/api/assistants/1/messages",{text:"问题"});
  while (!release) await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await request("POST","/api/assistants/1/messages",{text:"重复"})).status,409);
  assert.equal((await request("GET","/api/assistants/1/messages")).status,409);
  release(); const stream = await response.text(); assert.match(stream,/event: error/); assert.match(stream,/额度不足/); assert.doesNotMatch(stream,/event: done/); assert.equal(calls.length,1);
});

test("请求体延迟到前一轮结束后，重新读取绑定而不创建孤立会话", async (t) => {
  const { request, calls } = await setup(t);
  const endpoint = (await request("GET", "/api/assistants")).url + "/1/messages";
  const { request: httpRequest } = await import("node:http");
  let delayed;
  const finished = new Promise((resolve,reject) => {
    delayed = httpRequest(endpoint,{method:"POST",headers:{"content-type":"application/json"}},res=>{res.resume();res.on("end",resolve)});
    delayed.on("error",reject); delayed.flushHeaders(); delayed.write('{"text":');
  });
  await new Promise(resolve=>setTimeout(resolve,20));
  await (await request("POST", "/api/assistants/1/messages", {text:"先完成"})).text();
  delayed.end('"后完成"}'); await finished;
  assert.equal(calls.length,1);
});

test("删除助手：预设不能删；自建软删除后不在列表、可恢复；删除后不能编辑和发消息", async (t) => {
  const { request, db } = await setup(t);
  const preset = listAssistants(db)[0];
  assert.equal((await request("POST", `/api/v3/local-assistants/${preset.id}/remove-preview`, {})).status, 400);
  const a = await (await request("POST", "/api/assistants", { name: "临时助手", instructions: "说明" })).json();
  const pv = await (await request("POST", `/api/v3/local-assistants/${a.id}/remove-preview`, {})).json();
  assert.equal(pv.value.name, "临时助手");
  assert.ok((await (await request("GET", "/api/assistants")).json()).some((x) => x.id === a.id)); // 预览不删除
  const rm = await (await request("DELETE", `/api/v3/local-assistants/${a.id}`, { previewId: pv.previewId, confirm: true })).json();
  assert.equal(rm.deleted, true);
  assert.ok(!(await (await request("GET", "/api/assistants")).json()).some((x) => x.id === a.id));
  const deleted = await (await request("GET", "/api/v3/local-assistants?deleted=true")).json();
  assert.deepEqual(deleted.items.map((x) => x.name), ["临时助手"]);
  assert.equal((await request("PATCH", `/api/assistants/${a.id}`, { name: "改名" })).status, 404);
  assert.equal((await request("POST", `/api/assistants/${a.id}/messages`, { text: "你好" })).status, 404);
  const rp = await (await request("POST", `/api/v3/local-assistants/${a.id}/restore-preview`, {})).json();
  const back = await (await request("POST", `/api/v3/local-assistants/${a.id}/restore`, { previewId: rp.previewId, confirm: true })).json();
  assert.equal(back.deleted, false);
  assert.ok((await (await request("GET", "/api/assistants")).json()).some((x) => x.id === a.id));
});

test("助手会话接口：新会话不调用模型，首次发送带最新知识，旧历史可读可续，跨助手拒绝", async t => {
  const { request, client, calls } = await setup(t);
  const histories = new Map();
  client.create = async value => { calls.push(value); const id = `thread-${calls.length}`; histories.set(id, []); return id; };
  client.send = async (id, text, emit) => { histories.get(id).push({ role: 'user', text }); emit('done', {}); };
  client.messages = async id => histories.get(id) || [];
  await (await request('POST', '/api/assistants/1/messages', { text: '旧会话' })).text();
  const knowledge = await (await request('POST', '/api/v3/assistants/1/knowledge/preview', { title: '新规则', body: '合成更新知识' })).json();
  await request('POST', '/api/v3/assistants/1/knowledge', { previewId: knowledge.previewId, confirm: true });
  assert.equal((await request('POST', '/api/assistants/1/conversations/new', {})).status, 400);
  const fresh = await (await request('POST', '/api/assistants/1/conversations/new', { expectedThreadId: 'thread-1' })).json();
  assert.equal(fresh.currentThreadId, null); assert.equal(fresh.items[0].threadId, 'thread-1'); assert.equal(calls.length, 1);
  assert.equal((await request('POST', '/api/assistants/1/messages', { text: '过期标签页', expectedThreadId: 'thread-1' })).status, 409);
  assert.deepEqual(await (await request('GET', '/api/assistants/1/messages')).json(), []);
  assert.deepEqual(await (await request('GET', '/api/assistants/1/messages?threadId=thread-1')).json(), [{ role: 'user', text: '旧会话' }]);
  assert.equal((await request('GET', '/api/assistants/2/messages?threadId=thread-1')).status, 404);
  await (await request('POST', '/api/assistants/1/messages', { text: '新会话', expectedThreadId: null })).text();
  assert.equal(calls.length, 2); assert.match(calls[1].instructions, /合成更新知识/);
  const back = await (await request('POST', '/api/assistants/1/conversations/select', { expectedThreadId: 'thread-2', threadId: 'thread-1' })).json();
  assert.equal(back.items.length, 2); assert.equal(back.currentThreadId, 'thread-1');
  await (await request('POST', '/api/assistants/1/messages', { text: '续聊旧会话', expectedThreadId: 'thread-1' })).text();
  assert.equal(calls.length, 2); assert.equal(histories.get('thread-1').length, 2); assert.equal(histories.get('thread-2').length, 1);
});

test("回复未完成时禁止新建或切换会话", async t => {
  const { request, client } = await setup(t);
  let release; client.send = () => new Promise(resolve => { release = resolve; });
  const response = await request('POST', '/api/assistants/1/messages', { text: '测试忙碌保护' });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await request('POST', '/api/assistants/1/conversations/new', { expectedThreadId: 'created' })).status, 409);
  assert.equal((await request('POST', '/api/assistants/1/conversations/select', { expectedThreadId: 'created', threadId: 'created' })).status, 409);
  release(); await response.text();
});
