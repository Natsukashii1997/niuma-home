import { readJson, route } from '../http.mjs';
import { failure } from '../v3-common.mjs';
import { internalVoiceFor } from '../internal-voice.mjs';
import { handleV3 } from './user.mjs';

// 内部原声（#49，docs/API.md「内部原声」）：状态、手动拉取（预览 → 确认）。拉取在后台跑，进度看 status 里的 runs。
async function body(req) {
  try { return await readJson(req); } catch { throw failure(400, '请求内容不是有效 JSON'); }
}
export function routes(db, options) {
  const voice = () => internalVoiceFor(db, options);
  return [
    route('GET', '/api/v3/internal-voice/status', handleV3(() => voice().status())),
    route('POST', '/api/v3/internal-voice/pull/preview', handleV3(async req => voice().preview(await body(req)))),
    route('POST', '/api/v3/internal-voice/pull/confirm', handleV3(async req => voice().confirm(await body(req)))),
  ];
}
