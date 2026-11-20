import { route, readBody, respond } from '../http.mjs';
import { createSelfTalkService } from '../selftalk.mjs';


export function routes(db, options = {}) {
  const selftalk = createSelfTalkService(db, options);
  return [
    route('GET', '/api/v3/selftalk', respond(() => selftalk.list())),
    route('POST', '/api/v3/selftalk/sync', respond(() => selftalk.list({ refresh: true }))),
    route('POST', '/api/v3/selftalk/digest/preview', respond(async req => selftalk.previewDigest(await readBody(req)))),
    route('POST', '/api/v3/selftalk/digest', respond(async req => selftalk.confirmDigest(await readBody(req)))),
    route('POST', '/api/v3/selftalk/:id/preview', respond(async (req, { params }) => selftalk.preview(params.id, await readBody(req)))),
    route('PATCH', '/api/v3/selftalk/:id', respond(async (req, { params }) => selftalk.confirm(params.id, await readBody(req)))),
    route('PATCH', '/api/v3/selftalk', respond(async req => { const data = await readBody(req); return selftalk.confirm(data?.id, data); })),
  ];
}
