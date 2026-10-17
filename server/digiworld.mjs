import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { failure } from './v3-common.mjs';

// 只读数码世界（personal-ai-workbench）的收藏：data/collection/state.json 和本地图片，不调用它的接口、不写它的任何文件。
// state.json 是 { sha256, state }，sha256 = sha256(JSON.stringify(state))；校验不一致（可能正在写）或 schema 不是 1 时拒绝，不猜。
// 图文笔记取全部图片，视频笔记只取封面。导入走设计参考画布原有的「预览 → 确认 → 回读」，由画布接口压缩存图。
export const digiworldDir = () => process.env.WORKDESK_DIGIWORLD_DIR || path.resolve('..', 'personal-ai-workbench', 'data');
export const digiworldSource = id => `数码世界笔记 ${id}`;
export const DEFAULT_GROUP = '设计参考'; // 用户 10-17 约定：数码世界里这个分组的收藏默认导入
const unavailable = message => Object.assign(failure(503, message), { code: 'DIGIWORLD_UNAVAILABLE' });
const MEDIA = /^\/collection-media\/([a-f0-9]{32})\/media\/([A-Za-z0-9_-]{1,64})\/([A-Za-z0-9_-]{1,64}\.(?:webp|jpe?g|png))$/;
const IMAGE = [['image/png', b => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))], ['image/jpeg', b => b[0] === 255 && b[1] === 216 && b[2] === 255], ['image/webp', b => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP']];

function readNoFollow(file, max) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > max) return null;
    return fs.readFileSync(fd);
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

export function readCollection(dir = digiworldDir()) {
  if (!path.isAbsolute(dir)) throw unavailable('数码世界数据目录须为绝对路径');
  const root = path.join(dir, 'collection'), raw = readNoFollow(path.join(root, 'state.json'), 20 * 1024 * 1024);
  if (!raw) throw unavailable('读不到数码世界收藏数据（personal-ai-workbench/data/collection/state.json）');
  let envelope;
  try { envelope = JSON.parse(raw.toString('utf8')); } catch { throw unavailable('数码世界收藏数据不是有效 JSON，可能正在写入，请稍后重试'); }
  if (typeof envelope?.sha256 !== 'string' || createHash('sha256').update(JSON.stringify(envelope.state)).digest('hex') !== envelope.sha256) throw unavailable('数码世界收藏数据校验失败（可能正在写入），请稍后重试');
  const state = envelope.state;
  if (state?.schema !== 1 || !Array.isArray(state.notes)) throw unavailable(`数码世界收藏数据格式已变化（schema ${state?.schema}），工作台暂不支持，未读取`);
  const categories = state.categories && typeof state.categories === 'object' ? state.categories : {};
  // 桌面分组（数码世界收藏页上拖卡片的分组）：noteGroupMap 记笔记编号 → 分组编号，没分组的是 loose。
  const groups = Array.isArray(state.desk?.groups) ? state.desk.groups.filter(g => typeof g?.id === 'string' && typeof g.name === 'string') : [];
  const groupOf = id => groups.find(g => g.id === state.desk?.noteGroupMap?.[id])?.name || '';
  const notes = state.notes.filter(n => n && typeof n.id === 'string' && typeof n.title === 'string').map(n => {
    const urls = n.type === 'video' ? [n.coverUrl] : Array.isArray(n.imageUrls) ? n.imageUrls : [];
    const images = urls.flatMap(url => {
      const m = typeof url === 'string' && url.match(MEDIA);
      if (!m || m[2] !== n.id) return [];
      const file = path.join(root, 'versions', m[1], 'media', m[2], m[3]);
      return file.startsWith(path.join(root, 'versions') + path.sep) ? [file] : [];
    });
    const sourceUrl = typeof n.sourceUrl === 'string' && /^https:\/\//.test(n.sourceUrl) ? n.sourceUrl : '';
    return { id: n.id, title: n.title.slice(0, 200), type: n.type === 'video' ? 'video' : 'normal', category: typeof categories[n.id] === 'string' ? categories[n.id] : '', group: groupOf(n.id), origin: typeof n.origin === 'string' ? n.origin : '', sourceUrl, images };
  });
  return { revision: state.revision, groups: groups.map(g => g.name), notes };
}

export function collectionImage(id, n, dir = digiworldDir()) {
  const note = readCollection(dir).notes.find(x => x.id === id);
  const file = note?.images[Number(n)];
  if (!file || !/^\d+$/.test(String(n))) throw failure(404, '这张收藏图片不存在');
  const bytes = readNoFollow(file, 8 * 1024 * 1024);
  const type = bytes && IMAGE.find(([, ok]) => ok(bytes));
  if (!type) throw failure(404, '收藏图片读不到或不是 PNG / JPEG / WEBP');
  return { bytes, type: type[0] };
}
