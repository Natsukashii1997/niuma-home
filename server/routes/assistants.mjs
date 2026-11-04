import { legacyWrite, legacyReplay, legacyReceipt, assistantVersion, withAssistantVersion } from "../legacy-writes.mjs";
import { json, route, readJson } from "../http.mjs";
import { listAssistants, getAssistant, saveAssistant, importAssistants, bindAssistantThread, assistantDirectory } from "../db.mjs";
import { assistantConversations, requireConversation, selectAssistantConversation } from "../assistant-conversations.mjs";
import { codex } from "../codex.mjs";
import { composeKnowledgeInstructions } from "../assistant-knowledge.mjs";
import { routes as knowledgeRoutes } from "./assistant-knowledge.mjs";
import { handleV3 } from "./user.mjs";
import { failure } from "../v3-common.mjs";
import { createLocalDeletions, deletionFailure, deletionState } from "../local-deletions.mjs";
import { createChatgptBridge, normalizeChatgptUrl } from "../chatgpt-bridge.mjs";
import { createCollectPairing } from "../kb-collect-pairing.mjs";

const guarded = action => async (req, res, context) => { try { return await action(req, res, context); } catch (error) { return json(res, error.status || 500, { error: error.status ? error.message : "助手保存失败，请重新读取核对", ...(error.code && { code: error.code }) }); } };

async function body(req) { try { return await readJson(req); } catch { throw failure(400, "请求内容不是有效 JSON"); } }

export function routes(db, client = codex, bridge = createChatgptBridge()) {
  const sending = new Set();
  // ChatGPT 桥的插件接口沿用收藏插件的配对码（issue #15）。
  const pairing = createCollectPairing(db);
  const assistant = (id) => /^\d+$/.test(id) && getAssistant(db, id);
  // 删除助手（用户 2026-10-18）：只能删自建和导入的，四个预设不能删；软删除可恢复，对话记录原样保留。
  const isDeleted = (id) => !!deletionState(db, "assistant", String(id))?.deleted;
  const live = (id) => { const value = assistant(id); return value && !isDeleted(value.id) ? value : null; };
  const deletions = createLocalDeletions(db, { kind: "assistant",
    load: (id) => {
      const a = assistant(id);
      if (!a) throw deletionFailure(404, "ASSISTANT_NOT_FOUND", "助手不存在");
      if (a.preset) throw deletionFailure(400, "ASSISTANT_PRESET", "预设助手不能删除");
      if (sending.has(a.id)) throw deletionFailure(409, "ASSISTANT_BUSY", "该助手正在回复，请结束后再删除");
      return { snapshot: { name: a.name, instructions: a.instructions, model: a.model, effort: a.effort, codexThreadId: a.codexThreadId }, value: { id: String(a.id), name: a.name, kind: a.kind } };
    } });
  const localList = (deleted) => ({ items: listAssistants(db).filter((a) => !a.preset && isDeleted(a.id) === deleted)
    .map((a) => ({ ...a, id: String(a.id), ...(deleted && { deletion: deletionState(db, "assistant", String(a.id)) }) })) });
  const fields = (body, previous = {}) => {
    const value = { name: body.name ?? previous.name, instructions: body.instructions ?? previous.instructions ?? "" };
    if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 200) throw new Error("助手名称须为 1–200 字");
    if (typeof value.instructions !== "string" || value.instructions.length > 20000) throw new Error("预设说明须为不超过 20000 字的文本");
    // ChatGPT 会话链接：传 null 或空串解绑；不传沿用原值。
    let chatgptUrl = previous.chatgptUrl ?? null;
    if (Object.hasOwn(body, "chatgptUrl") && body.chatgptUrl !== null && body.chatgptUrl !== "") {
      chatgptUrl = normalizeChatgptUrl(body.chatgptUrl);
      if (!chatgptUrl) throw new Error("ChatGPT 会话链接须形如 https://chatgpt.com/c/…");
    } else if (Object.hasOwn(body, "chatgptUrl")) chatgptUrl = null;
    return { name: value.name.trim(), instructions: value.instructions, chatgptUrl };
  };
  const edit = async (req, res, id) => {
    const scope = id ? `PATCH /api/assistants/${id}` : "POST /api/assistants";
    let previous;
    let body, value;
    try {
      body = await readJson(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("请输入有效的助手设置");
    } catch (e) { return json(res, 400, { error: e.message }); }
    const replay = legacyReplay(db, req, scope, body);
    if (replay) return json(res, id ? 200 : 201, replay.result);
    if (id) { previous = live(id); if (!previous) return json(res, 404, { error: "助手不存在" }); }
    try { value = fields(body, previous); } catch (e) { return json(res, 400, { error: e.message }); }
    if (previous) {
      if (sending.has(previous.id)) return json(res, 409, { error: "该助手正在回复，请结束后修改设置" });
      const changesModel = Object.hasOwn(body, "model") || Object.hasOwn(body, "effort");
      const clearing = body.model === null && body.effort === null;
      const models = changesModel && !clearing ? await client.models() : null;
      // 请求体和模型列表都可能等待；写入前重新读取，避免覆盖并发编辑或回复中的设置。
      if (sending.has(previous.id)) return json(res, 409, { error: "该助手正在回复，请结束后修改设置" });
      previous = live(previous.id);
      if (!previous) return json(res, 404, { error: "助手不存在" });
      try {
        value = { ...fields(body, previous), model: Object.hasOwn(body,"model") ? body.model : previous.model, effort: Object.hasOwn(body,"effort") ? body.effort : previous.effort };
        if (changesModel) {
          if (value.model === null) { if (value.effort !== null) throw new Error("跟随默认时强度也必须为空"); }
          else {
            const selected = models?.find((m) => m.model === value.model);
            if (!selected) throw new Error("模型不存在或当前不可用，请重新选择");
            if (value.effort !== null && !selected.efforts.some((e) => e.value === value.effort)) throw new Error("该模型不支持所选强度");
          }
        }
      } catch (e) { return json(res, 400, { error: e.message }); }
    }
    const result = legacyWrite(db, req, { scope, payload: body, ...(id && { version: () => assistantVersion(live(id)) }), mutate: () => withAssistantVersion(saveAssistant(db, value, previous?.id)) });
    json(res, previous ? 200 : 201, result);
  };
  return [
    ...knowledgeRoutes(db),
    route("GET", "/api/legacy-writes/:requestId", (req, res, { params }) => {
      const receipt = legacyReceipt(db, params.requestId);
      return receipt ? json(res, 200, receipt) : json(res, 404, { code: "WRITE_RECEIPT_UNKNOWN", error: "尚未找到完成回执，结果仍待核对，请勿另建一次操作" });
    }),
    route("GET", "/api/assistants", (req, res) => json(res, 200, listAssistants(db).filter((a) => !isDeleted(a.id)).map(withAssistantVersion))),
    route("GET", "/api/v3/local-assistants", handleV3((req, { url }) => localList(url.searchParams.get("deleted") === "true"))),
    route("POST", "/api/v3/local-assistants/:id/remove-preview", handleV3(async (req, { params }) => deletions.preview(params.id, "remove", await body(req)))),
    route("DELETE", "/api/v3/local-assistants/:id", handleV3(async (req, { params }) => deletions.confirm(params.id, "remove", await body(req)))),
    route("POST", "/api/v3/local-assistants/:id/restore-preview", handleV3(async (req, { params }) => deletions.preview(params.id, "restore", await body(req)))),
    route("POST", "/api/v3/local-assistants/:id/restore", handleV3(async (req, { params }) => deletions.confirm(params.id, "restore", await body(req)))),
    route("POST", "/api/assistants", guarded((req, res) => edit(req, res))),
    route("PATCH", "/api/assistants/:id", guarded((req, res, { params }) => edit(req, res, params.id))),
    route("GET", "/api/codex/models", async (req, res) => json(res, 200, await client.models())),
    route("GET", "/api/assistants/:id/runtime", async (req, res, { params }) => {
      const value = assistant(params.id);
      if (!value) return json(res, 404, { error: "助手不存在" });
      if (sending.has(value.id)) return json(res, 409, { error: "该助手正在回复，请稍后读取生效值" });
      json(res, 200, value.codexThreadId ? await client.runtime(value.codexThreadId) : null);
    }),
    route("GET", "/api/assistants/:id/conversations", handleV3((req, { params }) => {
      if (!live(params.id)) throw failure(404, "助手不存在");
      return assistantConversations(db, params.id);
    })),
    ...["new", "select"].map(action => route("POST", `/api/assistants/:id/conversations/${action}`, handleV3(async (req, { params }) => {
      const request = await body(req);
      const value = live(params.id);
      if (!value) throw failure(404, "助手不存在");
      if (sending.has(value.id)) throw failure(409, "该助手正在回复，请结束后切换会话");
      if (value.chatgptUrl) throw failure(400, "ChatGPT 会话在 ChatGPT 里管理，这里不切换");
      return selectAssistantConversation(db, value.id, request, { fresh: action === "new" });
    }))),
    route("GET", "/api/assistants/:id/messages", async (req, res, { params, url }) => {
      const value = assistant(params.id);
      if (!value) return json(res, 404, { error: "助手不存在" });
      if (sending.has(value.id)) return json(res, 409, { error: "该助手仍在回复，请稍后重新读取历史" });
      if (value.chatgptUrl) {
        try { return json(res, 200, await bridge.request("history", { url: value.chatgptUrl })); }
        catch (error) { return json(res, 503, { error: error.message }); }
      }
      const requestedThread = url?.searchParams.get("threadId");
      let threadId = value.codexThreadId;
      if (requestedThread) {
        try { threadId = requireConversation(db, value.id, requestedThread); }
        catch (error) { return json(res, error.status || 400, { error: error.message }); }
      }
      json(res, 200, threadId ? await client.messages(threadId) : []);
    }),
    route("POST", "/api/assistants/:id/messages", async (req, res, { params }) => {
      const value = live(params.id);
      if (!value) return json(res, 404, { error: "助手不存在" });
      const request = await readJson(req), { text } = request;
      if (typeof text !== "string" || !text.trim() || text.length > 50000) return json(res, 400, { error: "请输入 1–50000 字的消息" });
      if (sending.has(value.id)) return json(res, 409, { error: "该助手仍在回复，请稍后重新读取历史" });
      if (Object.hasOwn(request, "expectedThreadId") && getAssistant(db, value.id).codexThreadId !== request.expectedThreadId) return json(res, 409, { error: "当前会话已变化，请重新读取历史后再发送" });
      sending.add(value.id);
      const controller = new AbortController();
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      res.on("close", disconnected);
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
      res.flushHeaders();
      const emit = (event, data) => { if (!res.destroyed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
      const heartbeat = setInterval(() => { if (!res.destroyed) res.write(": 保持连接\n\n"); }, 15000);
      try {
        const current = getAssistant(db, value.id);
        if (current.chatgptUrl) { await bridge.request("send", { url: current.chatgptUrl, text: text.trim(), onEvent: emit, signal: controller.signal }); return; }
        let threadId = current.codexThreadId;
        if (!threadId) {
          threadId = await client.create({ cwd: assistantDirectory(db, current.id), name: current.name, instructions: composeKnowledgeInstructions(db, current.id, current.instructions) });
          threadId = bindAssistantThread(db, current.id, threadId).codexThreadId;
        }
        await client.send(threadId, text.trim(), emit, controller.signal, { model: current.model, effort: current.effort });
      } catch (error) { emit("error", { error: error.message }); }
      finally { clearInterval(heartbeat); sending.delete(value.id); res.off("close", disconnected); res.end(); }
    }),
    // ChatGPT 桥：status 给页面看；next / jobs 只给带配对码的插件。
    route("GET", "/api/v3/chatgpt-bridge/status", handleV3((req) => { pairing.guard(req); return bridge.status(); })),
    route("GET", "/api/v3/chatgpt-bridge/next", (req, res, context) => {
      // 长轮询：插件断开时撤掉等待，免得任务交给已经不在的连接。
      const controller = new AbortController();
      res.on("close", () => { if (!res.writableEnded) controller.abort(); });
      return handleV3(async () => { pairing.guard(req, { extension: true }); return { job: await bridge.next(controller.signal) }; })(req, res, context);
    }),
    route("POST", "/api/v3/chatgpt-bridge/jobs/:id", handleV3(async (req, { params }) => {
      pairing.guard(req, { extension: true });
      if (!bridge.report(params.id, await body(req))) throw failure(404, "任务不存在或已结束");
      return { ok: true };
    })),
    route("GET", "/api/codex/sessions", async (req, res) => {
      const imported = new Set(listAssistants(db).map((a) => a.codexThreadId));
      json(res, 200, (await client.listSessions()).map((s) => ({ ...s, ...(imported.has(s.threadId) && { imported: true }) })));
    }),
    route("POST", "/api/assistants/import", guarded(async (req, res) => {
      const payload = await body(req), { threadIds } = payload;
      const scope = "POST /api/assistants/import";
      const replay = legacyReplay(db, req, scope, payload);
      if (replay) return json(res, 200, replay.result);
      if (!Array.isArray(threadIds) || !threadIds.length || threadIds.length > 100 || threadIds.some((id) => typeof id !== "string" || !id)) return json(res, 400, { error: "请选择 1–100 个会话" });
      const ids = [...new Set(threadIds)]; const sessions = await client.listSessions();
      const selected = ids.map((id) => sessions.find((s) => s.threadId === id));
      if (selected.some((s) => !s)) return json(res, 400, { error: "部分会话已不可用或没有名称，请重新读取列表" });
      json(res, 200, legacyWrite(db, req, { scope, payload, mutate: () => importAssistants(db, selected).map(withAssistantVersion) }));
    })),
  ];
}
