import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { openDb } from "../server/db.mjs";
import { pageRoutes as routes } from "../server/app-routes.mjs";
import { match, json } from "../server/http.mjs";

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, "必须使用隔离数据目录");
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, "settings-"));
  const db = openDb(dir);
  const handlers = routes(db);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const found = match(handlers, req.method, url.pathname);
    if (!found) return json(res, 404, { error: "接口不存在" });
    try { await found.handler(req, res, { params: found.params, url }); }
    catch { json(res, 500, { error: "处理失败" }); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const request = (method, endpoint, body) => fetch(`http://127.0.0.1:${server.address().port}${endpoint}`, {
    method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const put = async (key, value) => {
    const preview = await request("POST", `/api/settings/${key}/preview`, { value });
    if (preview.status !== 200) return preview;
    const { previewId } = await preview.json();
    return request("PUT", `/api/settings/${key}`, { previewId, confirm: true });
  };
  const get = async () => (await request("GET", "/api/settings")).json();
  return { db, put, get, request };
}

test("三个配置键可分别保存、回读、覆盖；类型去重去空并存 JSON 字符串", async (t) => {
  const { db, put, get } = await setup(t);
  assert.deepEqual(await get(), {});
  for (const key of ["brand_base_url", "report_doc_url"]) {
    for (const value of ["https://feishu.cn/base/test", "https://team.feishu.cn/wiki/test?from=workdesk#section", "https://larksuite.com/docx/test", "https://team.larksuite.com/docx/test"]) {
      const response = await put(key, `  ${value}  `);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { key, value });
      assert.equal((await get())[key], value);
    }
  }
  const value = JSON.stringify([" 海报 ", "", "社群图", "海报", "   "]);
  const response = await put("material_types", value);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { key: "material_types", value: '["海报","社群图"]' });
  assert.equal((await get()).material_types, '["海报","社群图"]');
  assert.equal(db.prepare("SELECT value FROM settings WHERE key = 'material_types'").get().value, '["海报","社群图"]');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM settings").get().count, 3);
});

test("非法键、非 HTTPS 飞书域名和伪装链接被拒绝且不覆盖已存值", async (t) => {
  const { put, get } = await setup(t);
  assert.equal((await put("brand_base_url", "https://team.feishu.cn/base/valid")).status, 200);
  const baseline = await get();
  for (const key of ["unknown", "__proto__", "constructor", "codex_token"]) {
    assert.equal((await put(key, "https://feishu.cn/test")).status, 400);
  }
  for (const key of ["brand_base_url", "report_doc_url"]) {
    for (const value of ["", " ", null, 123, {}, [], "javascript:alert(1)", "http://feishu.cn", "https://example.com", "https://fakefeishu.cn", "https://feishu.cn.evil.example", "https://larksuite.com.evil.example", "https://feishu.cn@evil.example", "https://user@team.feishu.cn/docx/test", "https://team.feishu.cn\\@evil.example", "https://team.fei\nshu.cn/test", "https:///feishu.cn/test"]) {
      const response = await put(key, value);
      assert.equal(response.status, 400, `${key}: ${JSON.stringify(value)}`);
      assert.equal(typeof (await response.json()).error, "string");
      assert.deepEqual(await get(), baseline);
    }
  }
});

test("类型配置拒绝空清单、非字符串项或无效 JSON，请求格式错误不写入", async (t) => {
  const { put, get, request } = await setup(t);
  assert.equal((await put("material_types", '["海报"]')).status, 200);
  const baseline = await get();
  for (const value of ["[]", '["", " "]', '["海报", 1]', '[null]', '[{}]', '{}', '"海报"', "不是JSON", "", null, 123]) {
    assert.equal((await put("material_types", value)).status, 400, JSON.stringify(value));
    assert.deepEqual(await get(), baseline);
  }
  for (const body of [{}, [], null]) assert.equal((await request("PUT", "/api/settings/material_types", body)).status, 400);
  const endpoint = (await request("GET", "/api/settings")).url;
  const response = await fetch(endpoint + "/material_types", { method: "PUT", headers: { "content-type": "application/json" }, body: "{" });
  assert.equal(response.status, 400);
  assert.deepEqual(await get(), baseline);
});
