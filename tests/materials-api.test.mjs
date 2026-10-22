import { legacyHeaders } from "./helpers/legacy-headers.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, readdirSync, rmSync, readFileSync, symlinkSync } from "node:fs";
import path from "node:path";
import { openDb, savePromo } from "../server/db.mjs";
import { routes } from "../server/routes/marketing.mjs";
import { match, json } from "../server/http.mjs";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=", "base64");
const material = { month: "2026-09", line: "大学辅导", name: "九月海报", type: "海报", skus: [], note: "两行\n备注" };

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, "必须使用隔离数据目录");
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, "materials-"));
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
  const request = (method, url, body, type = "application/json") => fetch(`http://127.0.0.1:${server.address().port}${url}`, {
    method, headers: { "content-type": type, ...legacyHeaders(db, method, url) }, body: body === undefined ? undefined : type === "application/json" ? JSON.stringify(body) : body,
  });
  const create = async (value = material) => {
    const response = await request("POST", "/api/materials", value);
    assert.equal(response.status, 201); return response.json();
  };
  const list = async (query = "") => (await request("GET", "/api/materials" + query)).json();
  return { dir, db, request, create, list };
}

test("物料可新建、局部编辑、按三项筛选；关联 SKU 只取同月同业务线", async (t) => {
  const { db, request, create, list } = await setup(t);
  savePromo(db, { month: "2026-09", line: "大学辅导", sku: "套餐甲", trial: "无", price: "无", newDeal: "无", renewal: "无" });
  const first = await create({ ...material, skus: ["套餐甲"] });
  assert.deepEqual(first.images, []); assert.deepEqual(first.skus, ["套餐甲"]); assert.ok(first.createdAt);
  const edit = await request("PATCH", `/api/materials/${first.id}`, { name: "更新后的海报" });
  assert.equal(edit.status, 200); assert.equal((await edit.json()).note, material.note);
  await create({ ...material, month: "2026-08", type: "其他" });
  assert.equal((await list("?month=2026-09&line=" + encodeURIComponent("大学辅导") + "&type=" + encodeURIComponent("海报"))).length, 1);
  assert.equal((await request("PATCH", `/api/materials/${first.id}`, { line: "国际课程" })).status, 400);
  assert.equal((await request("PATCH", `/api/materials/${first.id}`, { line: "国际课程", skus: [] })).status, 200);
  for (const value of [{ ...material, month: "2026-13" }, { ...material, name: " " }, { ...material, skus: ["不存在"] }, { ...material, type: "" }]) {
    assert.equal((await request("POST", "/api/materials", value)).status, 400);
  }
  assert.equal((await request("PATCH", "/api/materials/9999", { name: "不存在" })).status, 404);
});

test("多图上传可回读原字节；图片和物料删除同时移除文件，不能跨物料删除", async (t) => {
  const { dir, request, create, list } = await setup(t);
  const first = await create(); const second = await create({ ...material, name: "其他物料" });
  const images = [];
  for (let i = 0; i < 2; i++) {
    const response = await request("POST", `/api/materials/${first.id}/images?name=poster.PNG`, png, "image/png");
    assert.equal(response.status, 201); const image = await response.json(); images.push(image);
    assert.match(image.url, /^\/api\/images\/[0-9a-f-]+\.PNG$/);
    const read = await request("GET", image.url);
    assert.equal(read.headers.get("content-type"), "image/png");
    assert.equal(read.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await read.arrayBuffer()), png);
  }
  assert.equal((await list()).find((item) => item.id === first.id).images.length, 2);
  assert.equal((await request("DELETE", `/api/materials/${second.id}/images/${images[0].id}`)).status, 404);
  assert.equal((await request("DELETE", `/api/materials/${first.id}/images/${images[0].id}`)).status, 200);
  assert.equal((await request("GET", images[0].url)).status, 404);
  assert.equal(readdirSync(path.join(dir, "images")).length, 1);
  assert.equal((await request("DELETE", `/api/materials/${first.id}`)).status, 200);
  assert.equal((await request("GET", images[1].url)).status, 404);
  assert.equal(readdirSync(path.join(dir, "images")).length, 0);
  assert.equal((await list()).length, 1);
});

test("非图片、伪装类型、空图、超限和路径穿越均被拒绝", async (t) => {
  const { request, create, dir, list } = await setup(t);
  const first = await create();
  for (const [name, type, bytes, status] of [
    ["a.svg", "image/svg+xml", Buffer.from("<svg/>"), 415],
    ["a.html", "image/png", png, 415],
    ["a.jpg", "image/jpeg", png, 415],
    ["a.png", "image/png", Buffer.from("not an image"), 415],
    ["a.png", "image/png", Buffer.alloc(0), 415],
    ["a.png", "image/png", Buffer.alloc(20 * 1024 * 1024 + 1), 413],
  ]) assert.equal((await request("POST", `/api/materials/${first.id}/images?name=${name}`, bytes, type)).status, status);
  for (const file of ["..%2Fwork-desk.db", "..%5Cwork-desk.db", "%2Fetc%2Fpasswd", "%252e%252e%252fwork-desk.db", "test.svg"]) {
    assert.ok((await request("GET", `/api/images/${file}`)).status >= 400);
  }
  assert.equal((await list())[0].images.length, 0);
  assert.deepEqual(readdirSync(path.join(dir, "images")), []);
});

test("插库失败或创建后写入失败，不留下孤立图片；文件目录异常不写记录", async (t) => {
  const { dir, db, create, request, list } = await setup(t);
  const first = await create();
  db.exec("CREATE TRIGGER reject_image BEFORE INSERT ON material_images BEGIN SELECT RAISE(ABORT, 'test'); END;");
  assert.equal((await request("POST", `/api/materials/${first.id}/images`, png, "image/png")).status, 500);
  assert.deepEqual(readdirSync(path.join(dir, "images")), []);
  db.exec("DROP TRIGGER reject_image");
  const fs = (await import("node:fs")).default;
  const original = fs.writeFileSync;
  const mocked = t.mock.method(fs, "writeFileSync", (file, bytes, options) => {
    original(file, bytes.subarray(0, 10), options);
    throw Object.assign(new Error("模拟磁盘写满"), { code: "ENOSPC" });
  });
  assert.equal((await request("POST", `/api/materials/${first.id}/images`, png, "image/png")).status, 500);
  mocked.mock.restore();
  assert.deepEqual(readdirSync(path.join(dir, "images")), []);
  fs.renameSync(path.join(dir, "images"), path.join(dir, "images-away"));
  assert.equal((await request("POST", `/api/materials/${first.id}/images`, png, "image/png")).status, 500);
  assert.equal((await list())[0].images.length, 0);
});

test("数据库删除失败、文件清理中途失败均恢复记录和原文件", async (t) => {
  const { dir, db, create, request, list } = await setup(t);
  const first = await create();
  const images = [];
  for (let i = 0; i < 2; i++) images.push(await (await request("POST", `/api/materials/${first.id}/images`, png, "image/png")).json());
  db.exec("CREATE TRIGGER reject_delete BEFORE DELETE ON materials BEGIN SELECT RAISE(ABORT, 'test'); END;");
  assert.equal((await request("DELETE", `/api/materials/${first.id}`)).status, 500);
  assert.equal((await list())[0].images.length, 2);
  db.exec("DROP TRIGGER reject_delete");
  const fs = (await import("node:fs")).default;
  const original = fs.unlinkSync;
  let calls = 0;
  const mocked = t.mock.method(fs, "unlinkSync", (file) => {
    if (++calls === 2) throw Object.assign(new Error("模拟清理失败"), { code: "EIO" });
    return original(file);
  });
  assert.equal((await request("DELETE", `/api/materials/${first.id}`)).status, 500);
  mocked.mock.restore();
  assert.equal((await list())[0].images.length, 2);
  for (const image of images) {
    assert.deepEqual(readFileSync(path.join(dir, "images", path.basename(image.url))), png);
    assert.equal((await request("GET", image.url)).status, 200);
  }
  assert.equal(readdirSync(path.join(dir, "images")).length, 2);
  assert.equal((await request("DELETE", `/api/materials/${first.id}`)).status, 200);
  assert.equal((await list()).length, 0);
});

test("登记文件也不能通过符号链接读取库外内容；文件缺失仍可删除记录", async (t) => {
  const { dir, create, request, list } = await setup(t);
  const first = await create();
  const image = await (await request("POST", `/api/materials/${first.id}/images`, png, "image/png")).json();
  const file = path.join(dir, "images", path.basename(image.url));
  rmSync(file); symlinkSync(path.join(dir, "work-desk.db"), file);
  assert.equal((await request("GET", image.url)).status, 404);
  rmSync(file);
  assert.equal((await request("DELETE", `/api/materials/${first.id}/images/${image.id}`)).status, 200);
  assert.deepEqual((await list())[0].images, []);
});

test("分块上传按实际大小限流，20MB 边界可上传且不依赖文件名", async (t) => {
  const { create, request, list } = await setup(t);
  const first = await create();
  const exact = Buffer.alloc(20 * 1024 * 1024); png.copy(exact);
  assert.equal((await request("POST", `/api/materials/${first.id}/images`, exact, "image/png")).status, 201);
  const stream = new ReadableStream({ start(controller) { controller.enqueue(exact); controller.enqueue(new Uint8Array([1])); controller.close(); } });
  // 使用实际路由所在的地址，chunked 请求不发送 Content-Length。
  const base = (await request("GET", "/api/materials")).url;
  const response = await fetch(`${base}/${first.id}/images`, { method: "POST", headers: { "content-type": "image/png" }, body: stream, duplex: "half" });
  assert.equal(response.status, 413);
  assert.equal((await list())[0].images.length, 1);
});
