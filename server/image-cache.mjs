import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { failure } from './v3-common.mjs';

// Prefer decimal 1 MB; preserve the smallest valid result if the target is unattainable.
export const CACHE_IMAGE_TARGET_BYTES = 1_000_000;
const execute = promisify(execFile);

export function checkCacheImage(bytes) {
  if (!Buffer.isBuffer(bytes) || !bytes.length) throw failure(415, '图片压缩结果无效');
  return bytes;
}

export const cacheImageWarning = count => count > 0 ? `有 ${count} 张图片压缩后仍超过 1 MB，已保留，可正常查看和整理。` : '';

export async function compressCachedJpeg(input, { run = execute, maxEdge = 1600, quality = 75 } = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'workdesk-cache-'));
  const output = path.join(temporary, 'compressed.jpg');
  const attempts = [[maxEdge, quality], [maxEdge, 65], [maxEdge, 55], ...[0.8, 0.6, 0.4].map(scale => [Math.round(maxEdge * scale), 65])];
  let best;
  try {
    for (const [edge, q] of attempts) {
      fs.rmSync(output, { force: true });
      // Always encode from the input, avoiding repeated JPEG degradation.
      await run('/usr/bin/sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(q), '--resampleHeightWidthMax', String(edge), input, '--out', output], { timeout: 20000, maxBuffer: 100000, encoding: 'utf8', shell: false });
      const bytes = fs.readFileSync(output);
      if (bytes.length < 3 || bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255) throw failure(415, '图片压缩结果无效');
      if (!best || bytes.length < best.length) best = bytes;
      if (bytes.length <= CACHE_IMAGE_TARGET_BYTES) return bytes;
    }
    return best;
  } catch (error) {
    if (best) return best;
    if (error.status) throw error;
    throw failure(415, '无法解码或压缩图片，请换一张有效图片');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
