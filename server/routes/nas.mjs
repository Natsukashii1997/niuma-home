import path from 'node:path';
import { json, route } from '../http.mjs';
import { createNasMaterials } from '../nas-materials.mjs';

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const fail = (res, error) => json(res, error.status || 500, { error: error.status ? error.message : 'NAS 物料读取失败，请稍后重试' });
const image = (res, type, bytes, cache) => {
  res.writeHead(200, { 'content-type': type, 'content-length': bytes.length, 'x-content-type-options': 'nosniff', 'cache-control': cache });
  res.end(bytes);
};

// NAS 月度物料：只读。GET 读最近一次扫描（没有就先扫一次），POST /scan 重新扫描。
export function routes(db, options = {}) {
  const nas = createNasMaterials(db, options);
  return [
    route('GET', '/api/v3/nas', async (req, res) => { try { json(res, 200, await nas.read()); } catch (e) { fail(res, e); } }),
    route('POST', '/api/v3/nas/scan', async (req, res) => { try { json(res, 200, await nas.scan()); } catch (e) { fail(res, e); } }),
    route('GET', '/api/v3/nas/thumb/:id', (req, res, { params }) => { try { image(res, 'image/jpeg', nas.thumb(params.id), 'private, max-age=86400'); } catch (e) { fail(res, e); } }),
    route('GET', '/api/v3/nas/original/:id', (req, res, { params }) => {
      try { const { item, bytes } = nas.original(params.id); image(res, MIME[path.extname(item.path).toLowerCase()] || 'application/octet-stream', bytes, 'no-store'); }
      catch (e) { fail(res, e); }
    }),
  ];
}
