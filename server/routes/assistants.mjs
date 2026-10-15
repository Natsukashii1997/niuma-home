import { json, route, readJson } from "../http.mjs";
import { listAssistants, getAssistant, saveAssistant, importAssistants, bindAssistantThread, assistantDirectory } from "../db.mjs";
import { codex } from "../codex.mjs";

export function routes(db, client = codex) {
  const sending = new Set();
  const assistant = (id) => /^\d+$/.test(id) && getAssistant(db, id);
  const fields = (body, previous = {}) => {
    const value = { name: body.name ?? previous.name, instructions: body.instructions ?? previous.instructions ?? "" };
    if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 200) throw new Error("助手名称须为 1–200 字");
    if (typeof value.instructions !== "string" || value.instructions.length > 20000) throw new Error("预设说明须为不超过 20000 字的文本");
    return { name: value.name.trim(), instructions: value.instructions };
  };
  const edit = async (req, res, previous) => {
    let body, value;
    try {
      body = await readJson(req);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("请输入有效的助手设置");
      value = fields(body, previous);
    } catch (e) { return json(res, 400, { error: e.message }); }
    if (previous) {
      if (sending.has(previous.id)) return json(res, 409, { error: "该助手正在回复，请结束后修改设置" });
      const changesModel = Object.hasOwn(body, "model") || Object.hasOwn(body, "effort");
      const clearing = body.model === null && body.effort === null;
      const models = changesModel && !clearing ? await client.models() : null;
      // 请求体和模型列表都可能等待；写入前重新读取，避免覆盖并发编辑或回复中的设置。
      if (sending.has(previous.id)) return json(res, 409, { error: "该助手正在回复，请结束后修改设置" });
      previous = getAssistant(db, previous.id);
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
    json(res, previous ? 200 : 201, saveAssistant(db, value, previous?.id));
  };
  return [
    route("GET", "/api/assistants", (req, res) => json(res, 200, listAssistants(db))),
    route("POST", "/api/assistants", (req, res) => edit(req, res)),
    route("PATCH", "/api/assistants/:id", (req, res, { params }) => {
      const value = assistant(params.id);
      return value ? edit(req, res, value) : json(res, 404, { error: "助手不存在" });
    }),
    route("GET", "/api/codex/models", async (req, res) => json(res, 200, await client.models())),
    route("GET", "/api/assistants/:id/runtime", async (req, res, { params }) => {
      const value = assistant(params.id);
      if (!value) return json(res, 404, { error: "助手不存在" });
      if (sending.has(value.id)) return json(res, 409, { error: "该助手正在回复，请稍后读取生效值" });
      json(res, 200, value.codexThreadId ? await client.runtime(value.codexThreadId) : null);
    }),
    route("GET", "/api/assistants/:id/messages", async (req, res, { params }) => {
      const value = assistant(params.id);
      if (!value) return json(res, 404, { error: "助手不存在" });
      if (sending.has(value.id)) return json(res, 409, { error: "该助手仍在回复，请稍后重新读取历史" });
      json(res, 200, value.codexThreadId ? await client.messages(value.codexThreadId) : []);
    }),
    route("POST", "/api/assistants/:id/messages", async (req, res, { params }) => {
      const value = assistant(params.id);
      if (!value) return json(res, 404, { error: "助手不存在" });
      const { text } = await readJson(req);
      if (typeof text !== "string" || !text.trim() || text.length > 50000) return json(res, 400, { error: "请输入 1–50000 字的消息" });
      if (sending.has(value.id)) return json(res, 409, { error: "该助手仍在回复，请稍后重新读取历史" });
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
        let threadId = current.codexThreadId;
        if (!threadId) {
          threadId = await client.create({ cwd: assistantDirectory(db, current.id), name: current.name, instructions: current.instructions });
          threadId = bindAssistantThread(db, current.id, threadId).codexThreadId;
        }
        await client.send(threadId, text.trim(), emit, controller.signal, { model: current.model, effort: current.effort });
      } catch (error) { emit("error", { error: error.message }); }
      finally { clearInterval(heartbeat); sending.delete(value.id); res.off("close", disconnected); res.end(); }
    }),
    route("GET", "/api/codex/sessions", async (req, res) => {
      const imported = new Set(listAssistants(db).map((a) => a.codexThreadId));
      json(res, 200, (await client.listSessions()).map((s) => ({ ...s, ...(imported.has(s.threadId) && { imported: true }) })));
    }),
    route("POST", "/api/assistants/import", async (req, res) => {
      const { threadIds } = await readJson(req);
      if (!Array.isArray(threadIds) || !threadIds.length || threadIds.length > 100 || threadIds.some((id) => typeof id !== "string" || !id)) return json(res, 400, { error: "请选择 1–100 个会话" });
      const ids = [...new Set(threadIds)]; const sessions = await client.listSessions();
      const selected = ids.map((id) => sessions.find((s) => s.threadId === id));
      if (selected.some((s) => !s)) return json(res, 400, { error: "部分会话已不可用或没有名称，请重新读取列表" });
      json(res, 200, importAssistants(db, selected));
    }),
  ];
}
