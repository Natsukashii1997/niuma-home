import { legacyWrite, legacyReplay, materialVersion, withMaterialVersion } from "../legacy-writes.mjs";
import { randomUUID, createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { json, readJson, route } from "../http.mjs";
import { listPromos, listMaterials, getMaterial, saveMaterial, listMaterialImages, materialImageDir,
  addMaterialImage, hasMaterialImageFile, deleteMaterial } from "../db.mjs";

const maxImageSize = 20 * 1024 * 1024;
const mimeTypes = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };
const safeFile = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$/i;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const handler = (action) => async (req, res, context) => {
  try { await action(req, res, context); }
  catch (error) { json(res, error.status || 500, { error: error.status ? error.message : "物料处理失败，请刷新核对后再操作", ...(error.code && { code: error.code }) }); }
};
const parseId = (value) => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) fail(404, "物料或图片不存在");
  return Number(value);
};
const requireMaterial = (db, id) => {
  const item = getMaterial(db, id);
  if (!item) fail(404, "物料不存在");
  return item;
};

async function materialBody(req) {
  try { return await readJson(req); } catch { fail(400, "请求内容不是有效的 JSON"); }
}
function materialValue(body, db, previous = { skus: [], note: "" }) {
  if (!body || Array.isArray(body) || typeof body !== "object") fail(400, "物料字段无效");
  const value = { ...previous, ...body };
  if (typeof value.month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.month)) fail(400, "月份须为 YYYY-MM");
  if (!["大学辅导", "国际课程", "申诉服务"].includes(value.line)) fail(400, "业务线无效");
  for (const key of ["name", "type"]) {
    if (typeof value[key] !== "string" || !value[key].trim()) fail(400, "请填写物料名称和类型");
    value[key] = value[key].trim();
  }
  if (typeof value.note !== "string" || !Array.isArray(value.skus) || value.skus.some((sku) => typeof sku !== "string")) fail(400, "备注或关联 SKU 格式无效");
  const allowed = new Set(listPromos(db).filter((p) => p.month === value.month && p.line === value.line).map((p) => p.sku));
  if (value.skus.some((sku) => !allowed.has(sku))) fail(400, "关联 SKU 须来自同月同业务线的促销表");
  value.skus = [...new Set(value.skus)];
  return value;
}

function imageMime(bytes) {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString("ascii", 12, 16) === "IHDR") return "image/png";
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217) return "image/jpeg";
  if (bytes.length >= 13 && ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6))) return "image/gif";
  if (bytes.length >= 16 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function imageBody(req) {
  if (Number(req.headers["content-length"]) > maxImageSize) { req.resume(); fail(413, "单张图片不能超过 20MB"); }
  let size = 0;
  const chunks = [];
  // 以实际流量计数，不信任 Content-Length；超限后只排空流，不继续占用内存。
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= maxImageSize) chunks.push(chunk);
  }
  if (size > maxImageSize) fail(413, "单张图片不能超过 20MB");
  return Buffer.concat(chunks);
}

// Keep descriptors alive until both the business rows and durable receipt commit.
// A receipt/commit failure must restore files, not only SQLite rows.
function fileDeletion(db, id, imageId) {
  const staged = [];
  return {
    mutate() {
      const images = listMaterialImages(db, id).filter(image => !imageId || image.id === imageId);
      if (imageId && !images.length) fail(404, "该物料中没有这张图片");
      for (const image of images) {
        if (!safeFile.test(image.file)) fail(500, "图片文件名异常，未执行删除");
        const source = path.join(materialImageDir(db), image.file);
        const target = path.join(materialImageDir(db), `.delete-${randomUUID()}`);
        let descriptor;
        try { descriptor = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
        catch (error) { if (error.code === "ENOENT") continue; throw error; }
        const entry = { source, target, descriptor, moved: false, removed: false };
        staged.push(entry);
        fs.renameSync(source, target); entry.moved = true;
      }
      deleteMaterial(db, id, imageId, () => {
        for (const entry of staged) { fs.unlinkSync(entry.target); entry.removed = true; }
      });
      return imageId ? { ok: true, materialId: id, writeVersion: materialVersion(requireMaterial(db, id)) } : { ok: true, id };
    },
    rollback() {
      for (const entry of [...staged].reverse()) {
        if (entry.removed) fs.writeFileSync(entry.source, fs.readFileSync(entry.descriptor), { flag: "wx" });
        else if (entry.moved) fs.renameSync(entry.target, entry.source);
      }
    },
    finally() { for (const entry of staged) fs.closeSync(entry.descriptor); },
  };
}

export function routes(db) {
  return [
    route("GET", "/api/materials", handler((req, res, { url }) => json(res, 200, listMaterials(db, Object.fromEntries(url.searchParams)).map(withMaterialVersion)))),
    route("POST", "/api/materials", handler(async (req, res) => {
      const payload = await materialBody(req), scope = "POST /api/materials";
      const replay = legacyReplay(db, req, scope, payload);
      if (replay) return json(res, 201, replay.result);
      const value = materialValue(payload, db);
      json(res, 201, legacyWrite(db, req, { scope, payload, mutate: () => withMaterialVersion(saveMaterial(db, value)) }));
    })),
    route("PATCH", "/api/materials/:id", handler(async (req, res, { params }) => {
      const id = parseId(params.id), payload = await materialBody(req), scope = `PATCH /api/materials/${id}`;
      const replay = legacyReplay(db, req, scope, payload);
      if (replay) return json(res, 200, replay.result);
      const value = materialValue(payload, db, requireMaterial(db, id));
      json(res, 200, legacyWrite(db, req, { scope, payload, version: () => materialVersion(requireMaterial(db, id)), mutate: () => withMaterialVersion(saveMaterial(db, value, id)) }));
    })),
    route("DELETE", "/api/materials/:id", handler(async (req, res, { params }) => {
      const id = parseId(params.id), scope = `DELETE /api/materials/${id}`, payload = await materialBody(req);
      json(res, 200, legacyWrite(db, req, { scope, payload, version: () => materialVersion(requireMaterial(db, id)), ...fileDeletion(db, id) }));
    })),
    route("POST", "/api/materials/:id/images", handler(async (req, res, { params, url }) => {
      const id = parseId(params.id);
      const mime = req.headers["content-type"]?.split(";")[0].trim().toLowerCase();
      const ext = url.searchParams.has("name") ? path.extname(url.searchParams.get("name")) : Object.keys(mimeTypes).find(ext => mimeTypes[ext] === mime);
      if (!ext || mimeTypes[ext.toLowerCase()] !== mime) { req.resume(); fail(415, "只接受 PNG、JPG、JPEG、WEBP、GIF 图片，扩展名须与类型一致"); }
      const bytes = await imageBody(req);
      if (!mime || imageMime(bytes) !== mime) fail(415, "文件内容不是所声明的图片格式");
      const payload = { mime, name: url.searchParams.get("name"), sha256: createHash('sha256').update(bytes).digest('hex') };
      const scope = `POST /api/materials/${id}/images`;
      let target, descriptor;
      const result = legacyWrite(db, req, { scope, payload, version: () => materialVersion(requireMaterial(db, id)),
        mutate() {
          const file = randomUUID() + ext;
          target = path.join(materialImageDir(db), file);
          descriptor = fs.openSync(target, "wx");
          fs.writeFileSync(descriptor, bytes);
          const image = addMaterialImage(db, id, file);
          return { ...image, materialId: id, writeVersion: materialVersion(requireMaterial(db, id)) };
        },
        rollback() { if (descriptor !== undefined && target) fs.unlinkSync(target); },
        finally() { if (descriptor !== undefined) fs.closeSync(descriptor); },
      });
      json(res, 201, result);
    })),
    route("DELETE", "/api/materials/:id/images/:imageId", handler(async (req, res, { params }) => {
      const id = parseId(params.id), imageId = parseId(params.imageId), payload = await materialBody(req);
      json(res, 200, legacyWrite(db, req, { scope: `DELETE /api/materials/${id}/images/${imageId}`, payload, version: () => materialVersion(requireMaterial(db, id)), ...fileDeletion(db, id, imageId) }));
    })),
    route("GET", "/api/images/:file", handler((req, res, { params: { file } }) => {
      if (!safeFile.test(file) || !hasMaterialImageFile(db, file)) fail(404, "图片不存在");
      let descriptor;
      let bytes;
      try {
        descriptor = fs.openSync(path.join(materialImageDir(db), file), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        bytes = fs.readFileSync(descriptor);
      } catch { fail(404, "图片不存在或不可读取"); }
      finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
      res.writeHead(200, { "content-type": mimeTypes[path.extname(file).toLowerCase()], "x-content-type-options": "nosniff", "cache-control": "no-store" });
      res.end(bytes);
    })),
  ];
}
