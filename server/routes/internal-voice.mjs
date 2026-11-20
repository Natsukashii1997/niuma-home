import { route, readBody, respond } from '../http.mjs';
import { internalVoiceFor } from '../internal-voice.mjs';

// 内部原声（#49，docs/API.md「内部原声」）：状态、手动拉取（预览 → 确认）。拉取在后台跑，进度看 status 里的 runs。
export function routes(db, options) {
  const voice = () => internalVoiceFor(db, options);
  return [
    route('GET', '/api/v3/internal-voice/status', respond(() => voice().status())),
    route('POST', '/api/v3/internal-voice/pull/preview', respond(async req => voice().preview(await readBody(req)))),
    route('POST', '/api/v3/internal-voice/pull/confirm', respond(async req => voice().confirm(await readBody(req)))),
  ];
}
