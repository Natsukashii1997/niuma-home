import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdir } from "node:fs/promises";

// 与本机 codex-cli 0.160.1 生成协议保持一致。不覆盖模型、推理强度或账号。
const disabledFeatures = ["shell_tool", "shell_snapshot", "hooks", "plugins", "apps", "multi_agent", "multi_agent_v2", "memories", "skill_mcp_dependency_install", "browser_use", "computer_use", "image_generation", "workspace_dependencies", "tool_suggest"];
export const launchArgs = ["app-server", ...disabledFeatures.flatMap((key) => ["-c", `features.${key}=false`]), "-c", "notify=[]", "-c", "memories.use_memories=false", "-c", "memories.generate_memories=false"];
const readonly = { approvalPolicy: "never", sandbox: "read-only" };
const policy = "这是个人工作台的只读文本助手。仅回答用户，不执行命令、不写入或修改文件、不调用外部工具。写文件或执行命令的请求须说明无法执行。";

export function startParams({ cwd, instructions = "" }, config) {
  return { cwd, ...readonly, config, environments: [], dynamicTools: [], selectedCapabilityRoots: [], developerInstructions: `${policy}\n\n${instructions}`, historyMode: "paginated" };
}
export function turnParams(threadId, text) {
  return { threadId, input: [{ type: "text", text, text_elements: [] }], approvalPolicy: "never", sandboxPolicy: { type: "readOnly", networkAccess: false }, environments: [] };
}
export function historyMessage({ item, startedAtMs }) {
  const text = item.type === "userMessage" ? item.content.filter((part) => part.type === "text").map((part) => part.text).join("\n") : item.type === "agentMessage" ? item.text : null;
  return text === null ? null : { role: item.type === "userMessage" ? "user" : "assistant", text, ...(startedAtMs && { at: new Date(startedAtMs).toISOString() }) };
}
export function deniedResponse(method) {
  if (["item/commandExecution/requestApproval", "item/fileChange/requestApproval"].includes(method)) return { decision: "decline" };
  if (["execCommandApproval", "applyPatchApproval"].includes(method)) return { decision: "abort" };
  if (method === "item/permissions/requestApproval") return { permissions: {}, scope: "turn" };
  if (method === "item/tool/call") return { success: false, contentItems: [{ type: "inputText", text: "工作台仅支持只读文本对话，工具调用已禁用。" }] };
  if (method === "item/tool/requestUserInput") return { answers: {} };
  if (method === "mcpServer/elicitation/request") return { action: "decline", content: null };
  return null;
}

export class CodexClient {
  constructor({ spawnProcess = () => spawn("codex", launchArgs, { stdio: ["pipe", "pipe", "ignore"], shell: false }), requestTimeout = 60000, turnTimeout = 600000 } = {}) {
    this.spawnProcess = spawnProcess;
    this.requestTimeout = requestTimeout;
    this.turnTimeout = turnTimeout;
    this.pending = new Map(); this.loaded = new Set(); this.active = new Set();
    this.events = new EventEmitter(); this.events.setMaxListeners(0); this.sequence = 0;
  }
  async ready() {
    if (this.starting) return this.starting;
    const child = this.spawnProcess(); this.child = child;
    let buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (child !== this.child) return;
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        try { this.receive(JSON.parse(line)); } catch { this.fail(child, new Error("Codex 返回了无效协议数据")); break; }
      }
    });
    child.on("error", () => this.fail(child, new Error("无法启动本机 Codex，请检查 CLI 安装与登录状态")));
    child.on("exit", () => this.fail(child, new Error("Codex 进程已退出；请重新读取历史核对，本轮不会自动重发")));
    child.stdin.on("error", () => this.fail(child, new Error("Codex 连接已中断")));
    this.starting = this.rpc("initialize", { clientInfo: { name: "work_desk", title: "个人工作台", version: "0.1.0" }, capabilities: { experimentalApi: true } }).then(() => this.write({ method: "initialized" }));
    return this.starting;
  }
  write(message) { this.child?.stdin.write(`${JSON.stringify(message)}\n`); }
  rpc(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.child) return reject(new Error("Codex 尚未连接"));
      const id = ++this.sequence;
      const timer = setTimeout(() => this.fail(this.child, new Error("Codex 请求超时；请核对历史，不要直接重发")), this.requestTimeout);
      this.pending.set(id, { resolve, reject, timer }); this.write({ id, method, params });
    });
  }
  receive(message) {
    if (message.method && message.id !== undefined) {
      const result = deniedResponse(message.method);
      this.write(result ? { id: message.id, result } : { id: message.id, error: { code: -32601, message: "工作台不支持此操作" } });
    } else if (message.id !== undefined) {
      const pending = this.pending.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
    } else this.events.emit("notification", message);
  }
  fail(child, error) {
    if (!child || child !== this.child) return;
    this.child = null; this.starting = null; this.loaded.clear();
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear(); this.events.emit("failure", error); child.kill();
  }
  close() { this.fail(this.child, new Error("工作台已关闭 Codex 连接")); }
  async request(method, params) { await this.ready(); return this.rpc(method, params); }
  async pages(method, params) {
    const rows = [], cursors = new Set(); let cursor;
    do {
      const result = await this.request(method, { ...params, limit: 100, ...(cursor && { cursor }) });
      rows.push(...result.data); cursor = result.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error("Codex 分页游标重复，读取未完成");
      cursors.add(cursor);
    } while (cursor);
    return rows;
  }
  async listSessions() {
    const threads = await this.pages("thread/list", { modelProviders: [], sourceKinds: ["cli", "vscode", "exec", "appServer"], sortKey: "updated_at", sortDirection: "desc", archived: false, useStateDbOnly: true });
    return threads.filter((t) => t.name?.trim()).map((t) => ({ threadId: t.id, name: t.name, updatedAt: new Date(t.updatedAt * 1000).toISOString(), cwd: t.cwd }));
  }
  async readThread(threadId) { return (await this.request("thread/read", { threadId, includeTurns: false })).thread; }
  async messages(threadId) {
    const metadata = await this.readThread(threadId);
    if (metadata.historyMode === "legacy") {
      const { thread } = await this.request("thread/read", { threadId, includeTurns: true });
      return thread.turns.flatMap((turn) => turn.items.map((item) => historyMessage({ item }))).filter(Boolean);
    }
    return (await this.pages("thread/items/list", { threadId, sortDirection: "asc" })).map(historyMessage).filter(Boolean);
  }
  async safeConfig(cwd) {
    const { config } = await this.request("config/read", { cwd, includeLayers: false });
    // 空表不会清除继承配置，按该目录实际配置逐个禁用 MCP。
    return { mcp_servers: Object.fromEntries(Object.keys(config.mcp_servers || {}).map((name) => [name, { enabled: false }])) };
  }
  checkPermissions(result) {
    if (result.approvalPolicy !== "never" || result.sandbox?.type !== "readOnly" || result.sandbox.networkAccess !== false) throw new Error("Codex 未采用要求的只读权限，已停止发送");
  }
  async create({ cwd, name, instructions }) {
    await mkdir(cwd, { recursive: true });
    const config = await this.safeConfig(cwd);
    const result = await this.request("thread/start", startParams({ cwd, instructions }, config));
    this.checkPermissions(result);
    if (result.thread.environments?.length !== 0) throw new Error("Codex 执行环境未关闭，已停止发送");
    this.loaded.add(result.thread.id);
    await this.request("thread/name/set", { threadId: result.thread.id, name });
    return result.thread.id;
  }
  async resume(threadId) {
    await this.ready();
    if (this.loaded.has(threadId)) return;
    const thread = await this.readThread(threadId);
    const config = await this.safeConfig(thread.cwd);
    const result = await this.request("thread/resume", { threadId, cwd: thread.cwd, ...readonly, config, excludeTurns: true });
    this.checkPermissions(result);
    if (result.thread?.status?.type === "active") throw new Error("该 Codex 会话仍有进行中的回复，请稍后重试");
    this.loaded.add(threadId);
  }
  async send(threadId, text, emit, signal) {
    if (this.active.has(threadId)) throw new Error("该会话正在回复，请稍后重新读取历史");
    this.active.add(threadId);
    try {
      await this.resume(threadId);
      if (signal?.aborted) throw new Error("发送已取消");
      await new Promise((resolve, reject) => {
        let turnId, finished = false, queued = [], abortTimer;
        const items = new Map();
        const timer = setTimeout(() => this.fail(this.child, new Error("Codex 回复超时，请重新读取历史核对")), this.turnTimeout);
        const finish = (error) => {
          if (finished) return; finished = true; clearTimeout(timer); clearTimeout(abortTimer);
          this.events.off("notification", notification); this.events.off("failure", finish); signal?.removeEventListener("abort", abort);
          error ? reject(error) : resolve();
        };
        const abort = () => {
          if (!turnId || finished || abortTimer) return;
          // 中断请求返回不代表轮次已停止；收到完成事件前保留发送锁。
          abortTimer = setTimeout(() => this.fail(this.child, new Error("中断未确认，已关闭连接，请核对历史")), 10000);
          this.rpc("turn/interrupt", { threadId, turnId }).catch((error) => this.fail(this.child, error));
        };
        const notification = ({ method, params }) => {
          if (params?.threadId !== threadId) return;
          if (!turnId) { queued.push({ method, params }); return; }
          if ((params.turnId || params.turn?.id) !== turnId) return;
          if (method === "item/agentMessage/delta") {
            items.set(params.itemId, (items.get(params.itemId) || "") + params.delta);
            emit("delta", { text: params.delta, itemId: params.itemId });
          } else if (method === "item/completed" && params.item?.type === "agentMessage") {
            const old = items.get(params.item.id) || "";
            const text = params.item.text;
            if (text.startsWith(old) && text.length > old.length) emit("delta", { text: text.slice(old.length), itemId: params.item.id });
            items.set(params.item.id, text);
          } else if (method === "turn/completed") {
            if (signal?.aborted) finish(new Error("发送已取消，请重新读取历史核对"));
            else if (params.turn.status === "completed") { emit("done", {}); finish(); }
            else finish(new Error(params.turn.error?.message || `本轮未完成：${params.turn.status}`));
          } else if (method === "error" && !params.willRetry) this.fail(this.child, new Error(params.error?.message || "Codex 回复失败"));
        };
        this.events.on("notification", notification); this.events.on("failure", finish); signal?.addEventListener("abort", abort, { once: true });
        this.rpc("turn/start", turnParams(threadId, text)).then((result) => {
          turnId = result.turn.id;
          if (signal?.aborted) abort();
          const buffered = queued; queued = []; buffered.forEach(notification);
        }, finish);
      });
    } finally { this.active.delete(threadId); }
  }
}

export const codex = new CodexClient();
process.once("exit", () => codex.close());
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { codex.close(); process.exit(0); });
