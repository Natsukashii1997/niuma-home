import test from "node:test";
import assert from "node:assert/strict";
import { apiSend, invalidateReads, readShared } from "../src/api.js";

// useApi 的读取共享（src/api.js readShared，2026-10-23 审核第 4 条）：进行中的同路径请求共用一个 fetch，结果 3 秒内复用；
// reload（force）和写请求都让缓存失效。

const response = (body, { status = 200, demo = false } = {}) => ({
  ok: status < 400, status, headers: { get: (k) => (k === "x-workdesk-data-origin" && demo ? "demo" : null) }, json: async () => body,
});

function stub(t, impl) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (path, init) => { calls.push({ path, init }); return impl(path, init, calls.length); };
  t.after(() => { globalThis.fetch = original; invalidateReads(); });
  return calls;
}

test("同一路径同时发起的读取只请求一次，3 秒内再读复用结果", async (t) => {
  const calls = stub(t, (path) => response({ path }));
  const [a, b] = await Promise.all([readShared("/api/plans"), readShared("/api/plans")]);
  assert.equal(calls.length, 1);
  assert.equal(a, b);
  assert.deepEqual(a.body, { path: "/api/plans" });
  const c = await readShared("/api/plans");
  assert.equal(calls.length, 1, "3 秒内复用");
  assert.equal(c, a);
  await readShared("/api/promos");
  assert.equal(calls.length, 2, "不同路径各自请求");
});

test("force 重读会绕过缓存并替换进行中的请求", async (t) => {
  const calls = stub(t, (path, init, n) => response({ n }));
  assert.deepEqual((await readShared("/api/plans")).body, { n: 1 });
  assert.deepEqual((await readShared("/api/plans", true)).body, { n: 2 });
  assert.equal(calls.length, 2);
  assert.deepEqual((await readShared("/api/plans")).body, { n: 2 }, "之后复用最新一次的结果");
});

test("失败的读取不进缓存；状态码与演示口径头原样带回", async (t) => {
  let n = 0;
  stub(t, () => { n += 1; return n === 1 ? Promise.reject(new Error("断网")) : response({ task: "T0" }, { status: 501, demo: true }); });
  await assert.rejects(readShared("/api/x"), /断网/);
  const r = await readShared("/api/x");
  assert.deepEqual([r.ok, r.status, r.demo, r.body], [false, 501, true, { task: "T0" }]);
  assert.equal(n, 2);
});

test("apiSend 的写请求让已缓存的读取失效，GET 不影响", async (t) => {
  const calls = stub(t, (path, init) => (init?.method === "PATCH" ? response({ ok: true }) : response({ at: calls.length })));
  await readShared("/api/plans");
  await apiSend("GET", "/api/other");
  await readShared("/api/plans");
  assert.equal(calls.filter((c) => c.path === "/api/plans").length, 1, "GET 之后仍复用");
  await apiSend("PATCH", "/api/plans/2026-10/x", { a: 1 });
  await readShared("/api/plans");
  assert.equal(calls.filter((c) => c.path === "/api/plans").length, 2, "写过之后重新读");
});
