import test from "node:test";
import assert from "node:assert/strict";
import { uploadImage } from "../src/modules/marketing/upload-image.js";

test("XHR 保留原请求内容，只使用可计算的真实上传进度", async (t) => {
  let request;
  class XHR {
    upload = {};
    headers = {};
    constructor() { request = this; }
    open(...args) { this.opened = args; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(body) { this.body = body; }
  }
  const before = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = XHR;
  t.after(() => { globalThis.XMLHttpRequest = before; });
  const file = { name: "测试 海报.png" }, progress = [];
  const pending = uploadImage(12, file, "image/png", n => progress.push(n));
  assert.deepEqual(request.opened, ["POST", "/api/materials/12/images?name=%E6%B5%8B%E8%AF%95%20%E6%B5%B7%E6%8A%A5.png"]);
  assert.deepEqual(request.headers, { "content-type": "image/png" });
  assert.equal(request.body, file);
  request.upload.onprogress({ lengthComputable: false, loaded: 30, total: 100 });
  request.upload.onprogress({ lengthComputable: true, loaded: 30, total: 100 });
  request.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 });
  assert.deepEqual(progress, [0.3, 1]);
  request.status = 201; request.responseText = JSON.stringify({ id: 9, url: "/api/images/9.png" }); request.onload();
  assert.deepEqual(await pending, { id: 9, url: "/api/images/9.png" });
});

test("XHR 拒绝 HTTP、响应格式、断网与中断，不把未知结果当成功", async (t) => {
  let request;
  class XHR {
    upload = {};
    constructor() { request = this; }
    open() {}
    setRequestHeader() {}
    send() {}
  }
  const before = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = XHR;
  t.after(() => { globalThis.XMLHttpRequest = before; });
  for (const [trigger, expected] of [
    [() => { request.status = 413; request.responseText = '{"error":"超过 20MB"}'; request.onload(); }, /超过 20MB/],
    [() => { request.status = 500; request.responseText = "null"; request.onload(); }, /图片上传失败/],
    [() => { request.status = 200; request.responseText = "broken"; request.onload(); }, /无效内容/],
    [() => request.onerror(), /连接中断/],
    [() => request.onabort(), /已中断/],
    [() => request.ontimeout(), /超时/],
  ]) {
    const pending = uploadImage(1, { name: "a.png" }, "image/png", () => {});
    trigger();
    await assert.rejects(pending, expected);
  }
});

// Node 本身无 XHR；由每项测试替换后自动恢复这个测试占位。
globalThis.XMLHttpRequest = class {};
