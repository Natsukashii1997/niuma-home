import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createInterface } from "node:readline";
import { openDb } from "../server/db.mjs";
import { match } from "../server/http.mjs";
import { agentRoutes } from "../server/routes/agent.mjs";
import { issueAgentToken, revokeAgent } from "../server/agent-access.mjs";

// 智能体接入（workdesk MCP）：凭据、按工具授权、提问人必填与调用记录；再用真实子进程走一遍 MCP 握手和调用。

const services = {
  mentor: { list: async () => [{ name: "林瑶", role: "管培生", url: "https://x.feishu.cn/docx/A", logs: [{ date: "2026-10-29", t: "第一篇", src: "s1" }, { date: "2026-10-30", t: "第二篇", src: "s2" }],
    items: [{ id: "q1", kind: "提问", text: "旧问题", date: "2026-10-29", log: "第一篇", src: "s1", reply: { text: "答复", state: "sent", at: "2026-10-30T00:00:00Z", as: "x" } }, { id: "q2", kind: "提问", text: "新问题", date: "2026-10-30", log: "第二篇", src: "s2", reply: null }] }] },
  mentorPath: { get: () => ({ today: "2026-11-02", trainees: [{ name: "林瑶", role: "管培生", hasLog: true, path: { plan: { name: "路径 V2.4" }, start: "2026-05-12", end: "2026-08-11", todayD: 120, days: 65, pass: 70, reviewer: "常浩",
    lines: [{ name: "业务线", stages: [{ id: "P1", title: "入职", dates: ["2026-05-12", "2026-05-13"], status: "doing", late: 3, review: "初筛", pass: "≥70", record: null, steps: [{ text: "不该出现" }] }] }] } }] }) },
  projects: { list: async () => [{ id: "p1", name: "项目一", status: "推进中", phase: 1, phases: ["启动", "计划"], completion: 0.5, taskCount: 4, taskDone: 2, nodes: [{ t: "定义", ph: "启动", owner: "林瑶", done: true, startDate: "2026-07-14", dueDate: "2026-07-20", doneDate: "2026-07-20", overdue: "未逾期", gate: false, milestone: false, deliverables: [] }] }] },
  userStrategy: { get: month => ({ month, status: "未准备" }) },
};

async function setup(t) {
  const db = openDb(mkdtempSync(path.join(tmpdir(), "agent-mcp-")));
  const routes = agentRoutes(db, services);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const found = match(routes, req.method, url.pathname);
    if (!found) { res.writeHead(404); return res.end("{}"); }
    await found.handler(req, res, { params: found.params, url });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, p, { token, body } = {}) => fetch(base + p, { method, headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) }, ...(body && { body: JSON.stringify(body) }) })
    .then(async r => ({ status: r.status, body: await r.json() }));
  const calls = () => db.prepare("SELECT agent,tool,caller,status FROM agent_calls ORDER BY id").all().map(r => ({ ...r, caller: JSON.parse(r.caller) }));
  return { db, base, call, calls };
}

const caller = { platform: "feishu", chatType: "dm", userId: "ou_owner" };

test("凭据：没带、格式不对、撤销后都 401，且不记调用", async t => {
  const { db, call, calls } = await setup(t);
  const token = issueAgentToken(db, "agumon", ["project_list"]);
  assert.equal((await call("GET", "/api/v3/agent/tools")).status, 401);
  assert.equal((await call("GET", "/api/v3/agent/tools", { token: "wdk_wrong" })).status, 401);
  assert.equal((await call("POST", "/api/v3/agent/tools/project_list", { token: token.slice(0, -1) + (token.endsWith("A") ? "B" : "A"), body: { caller } })).status, 401);
  assert.equal((await call("GET", "/api/v3/agent/tools", { token })).status, 200);
  revokeAgent(db, "agumon");
  assert.equal((await call("GET", "/api/v3/agent/tools", { token })).status, 401);
  assert.deepEqual(calls(), []);
});

test("轮换：再次签发后旧凭据作废", async t => {
  const { db, call } = await setup(t);
  const old = issueAgentToken(db, "agumon", ["project_list"]);
  const fresh = issueAgentToken(db, "agumon", ["project_list"]);
  assert.equal((await call("GET", "/api/v3/agent/tools", { token: old })).status, 401);
  assert.equal((await call("GET", "/api/v3/agent/tools", { token: fresh })).status, 200);
});

test("授权：工具清单只列本 agent 被授权的；越权 403、未知 404、缺提问人 400，都记进调用记录", async t => {
  const { db, call, calls } = await setup(t);
  const token = issueAgentToken(db, "agumon", ["project_list", "strategy_month"]);
  const list = await call("GET", "/api/v3/agent/tools", { token });
  assert.deepEqual(list.body.tools.map(x => x.name), ["project_list", "strategy_month"]);
  assert.equal(list.body.tools[1].inputSchema.required[0], "month");
  assert.equal((await call("POST", "/api/v3/agent/tools/mentor_trainees", { token, body: { caller } })).status, 403);
  assert.equal((await call("POST", "/api/v3/agent/tools/drop_table", { token, body: { caller } })).status, 404);
  assert.equal((await call("POST", "/api/v3/agent/tools/project_list", { token, body: {} })).body.code, "CALLER_REQUIRED");
  assert.equal((await call("POST", "/api/v3/agent/tools/project_list", { token, body: { caller: { userId: " " } } })).status, 400);
  assert.equal((await call("POST", "/api/v3/agent/tools/strategy_month", { token, body: { caller, arguments: { month: "11月" } } })).status, 400);
  const ok = await call("POST", "/api/v3/agent/tools/project_list", { token, body: { caller } });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.result[0], { id: "p1", name: "项目一", status: "推进中", phase: "计划", completion: 0.5, tasks: { total: 4, done: 2 },
    nodes: [{ title: "定义", phase: "启动", owner: "林瑶", done: true, start: "2026-07-14", due: "2026-07-20", doneAt: "2026-07-20", overdue: "未逾期", gate: false, milestone: false, deliverables: [] }] });
  assert.deepEqual(calls().map(c => [c.tool, c.status]), [["mentor_trainees", 403], ["drop_table", 404], ["project_list", 400], ["project_list", 400], ["strategy_month", 400], ["project_list", 200]]);
  assert.deepEqual(calls().at(-1), { agent: "agumon", tool: "project_list", caller, status: 200 });
});

test("带教工具：进度视图去掉页面字段，提问按 since 过滤并带回复状态，查无此人 404", async t => {
  const { db, call } = await setup(t);
  const token = issueAgentToken(db, "agumon", ["mentor_trainees", "mentor_questions"]);
  const trainees = (await call("POST", "/api/v3/agent/tools/mentor_trainees", { token, body: { caller } })).body.result;
  const [p] = trainees.trainees;
  assert.equal(p.latestLog, "2026-10-30");
  assert.equal(p.unanswered, 1);
  assert.deepEqual(p.path.lines[0].stages[0], { id: "P1", title: "入职", from: "2026-05-12", to: "2026-05-13", status: "doing", late: 3, review: "初筛", passRule: "≥70", record: null });
  const q = (await call("POST", "/api/v3/agent/tools/mentor_questions", { token, body: { caller, arguments: { name: "林瑶", since: "2026-10-30" } } })).body.result;
  assert.deepEqual(q.logs, [{ date: "2026-10-30", title: "第二篇", src: "s2" }]);
  assert.deepEqual(q.items.map(i => [i.id, i.reply]), [["q2", null]]);
  const all = (await call("POST", "/api/v3/agent/tools/mentor_questions", { token, body: { caller, arguments: { name: "林瑶" } } })).body.result;
  assert.deepEqual(all.items[0].reply, { text: "答复", state: "sent", at: "2026-10-30T00:00:00Z" });
  assert.equal((await call("POST", "/api/v3/agent/tools/mentor_questions", { token, body: { caller, arguments: { name: "张三" } } })).status, 404);
});

function mcp(t, env) {
  const child = spawn(process.execPath, ["server/mcp-workdesk.mjs"], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "inherit"] });
  t.after(() => child.kill());
  const waiting = new Map();
  createInterface({ input: child.stdout }).on("line", line => { const msg = JSON.parse(line); waiting.get(msg.id)?.(msg); });
  let id = 0;
  return (method, params) => new Promise(resolve => { id += 1; waiting.set(id, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`); });
}

test("MCP 子进程：握手、列工具、调用时把 _caller 单独上送，服务端拒绝时 isError", async t => {
  const { db, base, calls } = await setup(t);
  const token = issueAgentToken(db, "agumon", ["strategy_month"]);
  const rpc = mcp(t, { WORKDESK_URL: base, WORKDESK_AGENT_TOKEN: token });
  const init = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.deepEqual((await rpc("tools/list")).result.tools.map(x => x.name), ["strategy_month"]);
  const ok = await rpc("tools/call", { name: "strategy_month", arguments: { month: "2026-11", _caller: caller } });
  assert.deepEqual(JSON.parse(ok.result.content[0].text), { month: "2026-11", status: "未准备" });
  assert.equal(ok.result.isError, undefined);
  const denied = await rpc("tools/call", { name: "strategy_month", arguments: { month: "2026-11" } });
  assert.equal(denied.result.isError, true);
  assert.match(denied.result.content[0].text, /HTTP 400.*提问人/);
  assert.equal((await rpc("nope")).error.code, -32601);
  assert.deepEqual(calls().map(c => [c.caller.userId, c.status]), [["ou_owner", 200], [undefined, 400]]);
});

test("MCP 子进程：凭据错误时列工具返回错误，不给出任何工具", async t => {
  const { base } = await setup(t);
  const rpc = mcp(t, { WORKDESK_URL: base, WORKDESK_AGENT_TOKEN: "" });
  await rpc("initialize", {});
  assert.match((await rpc("tools/list")).error.message, /凭据/);
});
