import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { CodexClient } from "../../server/codex.mjs";

export function fakeAppServer(t) {
  const requests = [], controls = {};
  const model = (name) => ({ id: `id-${name}`, model: name, displayName: name, description: "测试模型", hidden: false, isDefault: name === "a", defaultReasoningEffort: "medium", supportedReasoningEfforts: [{ reasoningEffort: "medium", description: "标准" }, { reasoningEffort: "high", description: "深入" }] });
  let current = { model: "a", reasoningEffort: "medium" };
  const client = new CodexClient({ requestTimeout: 5000, spawnProcess: () => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough();
    const output = (message) => child.stdout.write(JSON.stringify(message) + "\n");
    child.kill = () => queueMicrotask(() => child.emit("exit", 0));
    let buffer = "";
    child.stdin.on("data", (chunk) => {
      buffer += chunk; let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const r = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); requests.push(r);
        if (!r.method || r.id === undefined) continue;
        const finish = (result) => output({ id: r.id, result });
        const fail = (message) => output({ id: r.id, error: { message } });
        if (controls.handle?.(r, finish, fail) === false) continue;
        const safe = { approvalPolicy: "never", sandbox: { type: "readOnly", networkAccess: false } };
        const defaults = { initialize: {}, "config/read": { config: {} }, "model/list": { data: [model("a"),model("b")], nextCursor: null }, "thread/start": { thread: { id: "thread", environments: [] }, ...safe, ...current }, "thread/read": { thread: { id: "thread", cwd: "/temporary" } }, "thread/resume": { ...safe, ...current } };
        if (r.method === "turn/start") {
          current = { model: r.params.model, reasoningEffort: r.params.effort };
          finish({ turn: { id: "turn" } });
          controls.complete = () => output({ method: "turn/completed", params: { threadId: r.params.threadId, turn: { id: "turn", status: "completed" } } });
          if (!controls.holdTurn) controls.complete();
        } else queueMicrotask(() => finish(defaults[r.method] ?? {}));
      }
    }); return child;
  } });
  t.after(() => client.close()); return { client, requests, controls };
}
