import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { MAX_JSON_BYTES, checkOrigin, readJson } from "../server/http.mjs";

// 全站请求来源校验（server/http.mjs checkOrigin，index.mjs 对全部 /api/ 调用）与请求正文限制。

const req = (headers) => ({ headers });

test("checkOrigin：本机页面同源放行，不带 Origin 的本机请求（curl、脚本）放行", () => {
  assert.equal(checkOrigin(req({ host: "127.0.0.1:5280", origin: "http://127.0.0.1:5280" })), null);
  assert.equal(checkOrigin(req({ host: "localhost:5280", origin: "http://localhost:5280" })), null);
  assert.equal(checkOrigin(req({ host: "[::1]:5280", origin: "http://[::1]:5280" })), null);
  assert.equal(checkOrigin(req({ host: "127.0.0.1:5281", origin: "http://127.0.0.1:5281" })), null, "Vite 开发页代理保留页面 Host");
  assert.equal(checkOrigin(req({ host: "127.0.0.1:5280" })), null, "无 Origin 放行");
});

test("checkOrigin：外站页面、Origin 为 null、Host 不是本机都拒绝", () => {
  assert.match(checkOrigin(req({ host: "127.0.0.1:5280", origin: "https://evil.example" })), /本机页面/);
  assert.match(checkOrigin(req({ host: "127.0.0.1:5280", origin: "null" })), /本机页面/);
  assert.match(checkOrigin(req({ host: "127.0.0.1:5280", origin: "http://127.0.0.1:5281" })), /本机页面/, "端口不同也不算同源");
  assert.match(checkOrigin(req({ host: "niuma.example.com" })), /Host/);
  assert.match(checkOrigin(req({})), /Host/);
  assert.match(checkOrigin(req({ host: "127.0.0.1:5280", origin: ["a", "b"] })), /Origin/);
});

test("checkOrigin：chrome-extension 来源只在 allowExtension 的路由放行", () => {
  const ext = { host: "127.0.0.1:5280", origin: `chrome-extension://${"a".repeat(32)}` };
  assert.equal(checkOrigin(req(ext), { allowExtension: true }), null);
  assert.match(checkOrigin(req(ext)), /扩展/);
  assert.match(checkOrigin(req({ ...ext, origin: "chrome-extension://short" })), /本机页面/, "格式不对的扩展 Origin 按普通外来源处理");
});

const body = (text, headers = {}) => Object.assign(Readable.from(text === undefined ? [] : [Buffer.from(text)]), { headers, resume() { return this; } });

test("readJson：JSON 正文按 content-type 接收，不带 content-type 的（curl、脚本）按 JSON 解析，空正文返回 {}", async () => {
  assert.deepEqual(await readJson(body('{"a":1}', { "content-type": "application/json; charset=utf-8" })), { a: 1 });
  assert.deepEqual(await readJson(body('{"a":1}', {})), { a: 1 });
  assert.deepEqual(await readJson(body(undefined, {})), {});
  assert.deepEqual(await readJson(body("", { "content-type": "text/plain" })), {});
});

test("readJson：非 JSON content-type 的正文拒绝 415，超过 2MB 拒绝 413", async () => {
  await assert.rejects(readJson(body('{"a":1}', { "content-type": "text/plain" })), (e) => e.status === 415, "跨站简单请求带的 text/plain 拒绝");
  await assert.rejects(readJson(body('{"a":1}', { "content-type": "multipart/form-data; boundary=x" })), (e) => e.status === 415);
  await assert.rejects(readJson(body("{}", { "content-type": "application/json", "content-length": String(MAX_JSON_BYTES + 1) })), (e) => e.status === 413);
  const big = Readable.from([Buffer.alloc(MAX_JSON_BYTES), Buffer.alloc(2)]);
  Object.assign(big, { headers: { "content-type": "application/json" }, resume() { return this; } });
  await assert.rejects(readJson(big), (e) => e.status === 413, "没有 content-length 时按实际字节数截断");
});
