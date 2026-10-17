import { route, readJson } from '../http.mjs';
import { createSelfTalkService } from '../selftalk.mjs';
import { failure } from '../v3-common.mjs';
import { handleV3 } from './user.mjs';

async function body(req) {
  try { return await readJson(req); } catch { throw failure(400, '请求内容不是有效 JSON'); }
}

export function routes(db, options = {}) {
  const selftalk = createSelfTalkService(db, options);
  return [
    route('GET', '/api/v3/selftalk', handleV3(() => selftalk.list())),
    route('POST', '/api/v3/selftalk/sync', handleV3(() => selftalk.list({ refresh: true }))),
    route('POST', '/api/v3/selftalk/digest/preview', handleV3(async req => selftalk.previewDigest(await body(req)))),
    route('POST', '/api/v3/selftalk/digest', handleV3(async req => selftalk.confirmDigest(await body(req)))),
    route('POST', '/api/v3/selftalk/:id/preview', handleV3(async (req, { params }) => selftalk.preview(params.id, await body(req)))),
    route('PATCH', '/api/v3/selftalk/:id', handleV3(async (req, { params }) => selftalk.confirm(params.id, await body(req)))),
    route('PATCH', '/api/v3/selftalk', handleV3(async req => { const data = await body(req); return selftalk.confirm(data?.id, data); })),
  ];
}
