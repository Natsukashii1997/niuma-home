import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getSettings, materialImageDir } from './db.mjs';
import { beijingText, failure, saveSnapshot } from './v3-common.mjs';
import { recordSource } from './source-status.mjs';
import { CACHE_IMAGE_TARGET_BYTES, cacheImageWarning, checkCacheImage, compressCachedJpeg } from './image-cache.mjs';

// NAS 月度物料（用户 2026-10-19）：原件留在公司 NAS，由用户在 Finder 用 SMB 挂载；工作台只读扫描、只缓存缩略图。
// 目录：<根>/YYYY-M月/<含业务线名的文件夹>/…；每月命名会变，只认文件名里的关键词。「营销物料」文件夹不扫。
export const NAS_DEFAULT_ROOT = '/Volumes/跨部门综合资料/8.月度物料';
export const NAS_LINES = {
  大学辅导: [
    { key: '价格图', keyword: '同步辅导', note: '同步辅导价格图' },
    { key: '选课指导', keyword: '选课指导' },
    { key: '试听海报', keyword: '试听' },
    { key: '活动海报', keyword: '活动', many: true },
  ],
  国际课程: [
    { key: '价格图', keyword: '国际课程课程课时卡', aliases: ['国际课程课时卡'] },
    { key: '活动海报', keyword: '活动', many: true },
  ],
};
const IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const SKIP_DIRS = new Set(['营销物料']);
const stem = (file) => path.basename(file).replace(IMAGE, '');
const zh = (a, b) => a.localeCompare(b, 'zh', { numeric: true });
// 同一类型多张时的「第一张」：层级浅的优先，再按文件名自然序（「海报1」先于「海报1-1」「海报2」），再按路径短的。
const firstOrder = (a, b) => a.split('/').length - b.split('/').length || zh(stem(a), stem(b)) || a.length - b.length || zh(a, b);

// 活动名：去掉末尾的（模考）、-1课时、-1、数字等版本后缀，同名活动只留一张。
export function activityName(file) {
  let name = stem(file), last;
  do {
    last = name;
    name = name.replace(/\s*[（(][^（）()]*[)）]\s*$/, '').replace(/\s*-[^-]*\d[^-]*$/, '').replace(/[\s\d]+$/, '');
  } while (name !== last);
  return name.trim() || stem(file);
}

export function monthKey(folder) {
  const m = /^(\d{4})-(\d{1,2})月$/.exec(folder);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2].padStart(2, '0')}` : null;
}

// 纯识别：files 为某月某业务线下的相对路径（相对 NAS 根）。返回 { 类型: [{ name, path, others: [...] }] }。
export function recognize(line, files) {
  const sorted = [...files].sort(firstOrder), taken = new Set(), out = {};
  for (const type of NAS_LINES[line]) {
    const hits = sorted.filter((f) => !taken.has(f) && [type.keyword, ...(type.aliases || [])].some(keyword => stem(f).includes(keyword)));
    hits.forEach((f) => taken.add(f));
    const groups = new Map();
    for (const f of hits) {
      const name = type.many ? activityName(f) : type.key;
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(f);
    }
    out[type.key] = [...groups].map(([name, list]) => ({ name, path: list[0], others: list.slice(1) }));
  }
  return out;
}

function walk(root, rel) {
  let entries;
  try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return []; }
  return entries.flatMap((e) => {
    if (e.name.startsWith('.')) return [];
    const child = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walk(root, child);
    return e.isFile() && IMAGE.test(e.name) ? [child] : [];
  });
}

// 默认用 macOS 自带 sips 生成长边 640 的 JPEG 缩略图；测试注入替身。
const sipsThumb = async (source, target) => { fs.writeFileSync(target, await compressCachedJpeg(source, { maxEdge: 640, quality: 80 }), { mode: 0o600 }); };

export function createNasMaterials(db, { thumbDir = path.join(path.dirname(materialImageDir(db)), 'nas-thumbs'), makeThumb = sipsThumb, now = Date.now } = {}) {
  const root = () => getSettings(db).nas_root || NAS_DEFAULT_ROOT;
  const reachable = () => { try { return fs.statSync(root()).isDirectory(); } catch { return false; } };
  const saved = () => {
    const row = db.prepare('SELECT payload FROM v3_snapshots WHERE kind=?').get('nas');
    return row ? JSON.parse(row.payload) : null;
  };
  const thumbBytes = () => { try { return fs.readdirSync(thumbDir).reduce((sum, f) => sum + fs.statSync(path.join(thumbDir, f)).size, 0); } catch { return 0; } };
  const validThumb = file => { try { const s = fs.lstatSync(file); return s.isFile() && s.size > 0; } catch { return false; } };
  let scanning = null;

  async function scanOnce() {
    const base = root(), attemptAt = now();
    if (!reachable()) {
      recordSource(db, 'nas', { identity: base, attemptAt, error: 'NAS 未挂载：请在 Finder 按 ⌘K 连接 smb://172.16.1.10' });
      throw failure(503, 'NAS 未挂载：请在 Finder 按 ⌘K 连接 smb://172.16.1.10 后再扫描');
    }
    fs.mkdirSync(thumbDir, { recursive: true });
    const folders = fs.readdirSync(base, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => [d.name, monthKey(d.name)]).filter(([, m]) => m);
    const months = [...new Set(folders.map(([, month]) => month))].sort(zh);
    const lines = {};
    for (const line of Object.keys(NAS_LINES)) {
      lines[line] = { types: NAS_LINES[line].map(({ key, keyword, many }) => ({ key, keyword, many: !!many })), cells: {} };
      for (const month of months) {
        const dirs = folders.filter(([, key]) => key === month).flatMap(([folder]) => fs.readdirSync(path.join(base, folder), { withFileTypes: true })
          .filter(d => d.isDirectory() && d.name.includes(line)).map(d => `${folder}/${d.name}`));
        const files = dirs.flatMap(dir => walk(base, dir));
        for (const [type, items] of Object.entries(recognize(line, files))) {
          lines[line].cells[`${month}|${type}`] = await Promise.all(items.map(async (item) => {
            const stat = fs.statSync(path.join(base, item.path));
            const id = createHash('sha1').update(`${item.path}\n${stat.size}\n${stat.mtimeMs}`).digest('hex').slice(0, 20);
            const thumb = path.join(thumbDir, `${id}.jpg`);
            let hasThumb = validThumb(thumb);
            if (!hasThumb) {
              const temporary = fs.mkdtempSync(path.join(thumbDir, '.pending-'));
              try {
                const output = path.join(temporary, 'thumb.jpg');
                await makeThumb(path.join(base, item.path), output);
                checkCacheImage(fs.readFileSync(output));
                fs.renameSync(output, thumb); hasThumb = true;
              } catch { fs.rmSync(thumb, { force: true }); hasThumb = false; }
              finally { fs.rmSync(temporary, { recursive: true, force: true }); }
            }
            return { id, name: item.name, path: item.path, file: path.basename(item.path), size: stat.size, others: item.others, thumb: hasThumb ? `/api/v3/nas/thumb/${id}` : null };
          }));
        }
      }
    }
    const payload = { root: base, scannedAt: attemptAt, months, lines };
    const at = new Date(attemptAt).toISOString();
    saveSnapshot(db, 'nas', payload, at);
    recordSource(db, 'nas', { identity: base, attemptAt, at, extra: { network: 'SMB 挂载', thumbBytes: thumbBytes() } });
    return payload;
  }
  const scan = () => (scanning ||= scanOnce().finally(() => { scanning = null; }));

  const view = (payload) => {
    const ids = new Set(Object.values(payload.lines).flatMap(line => Object.values(line.cells).flat()).map(item => item.id));
    const oversized = [...ids].filter(id => { try { return fs.statSync(path.join(thumbDir, `${id}.jpg`)).size > CACHE_IMAGE_TARGET_BYTES; } catch { return false; } }).length;
    return { ...payload, root: root(), reachable: reachable(), lastScanAt: beijingText(payload.scannedAt), thumbBytes: thumbBytes(), warning: cacheImageWarning(oversized) };
  };
  const findItem = (id) => {
    const payload = saved();
    for (const line of Object.values(payload?.lines || {})) for (const items of Object.values(line.cells)) {
      const hit = items.find((i) => i.id === id);
      if (hit) return hit;
    }
    throw failure(404, '没有这张物料，请重新扫描');
  };
  return {
    async read() {
      const payload = saved();
      if (payload && payload.root === root()) return view(payload);
      return view(await scan());
    },
    async scan() { return view(await scan()); },
    thumb(id) {
      if (!/^[0-9a-f]{20}$/.test(id)) throw failure(404, '缩略图不存在');
      try { return fs.readFileSync(path.join(thumbDir, `${id}.jpg`)); } catch { throw failure(404, '缩略图不存在，请重新扫描'); }
    },
    // 原图只按扫描结果里的 id 取，不接受任意路径。
    original(id) {
      const item = findItem(id);
      if (!reachable()) throw failure(503, 'NAS 未挂载，暂时打不开原图');
      const file = path.join(root(), item.path);
      if (!file.startsWith(root() + path.sep)) throw failure(404, '没有这张物料');
      try { return { item, bytes: fs.readFileSync(file) }; } catch { throw failure(404, '原图已不在 NAS 上，请重新扫描'); }
    },
  };
}
