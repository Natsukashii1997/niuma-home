import { route, readBody, respond } from '../http.mjs';

// 飞书知识库页：目录树、同步、画布布局，以及 Chrome 收藏插件用的快捷收藏与配对码（/api/v3/kb/collect*）。
export function kbRoutes({ kb }) {
  return [
    route('POST', '/api/v3/kb/collect', respond(async req => { kb.collectPairing.guard(req,{extension:true}); return kb.collect(await readBody(req)); })),
    route('GET', '/api/v3/kb/collect/recent', respond(req => { kb.collectPairing.guard(req); return kb.recentCollections(); })),
    route('GET', '/api/v3/kb/collect/pairing', respond(req => { kb.collectPairing.guard(req); return kb.collectPairing.read(); })),
    route('POST', '/api/v3/kb/collect/pairing/preview', respond(req => { kb.collectPairing.guard(req); return kb.collectPairing.preview(); })),
    route('POST', '/api/v3/kb/collect/pairing/rotate', respond(async req => { kb.collectPairing.guard(req); return kb.collectPairing.rotate(await readBody(req)); })),
    route('GET', '/api/v3/kb/tree', respond(() => kb.list())),
    route('POST', '/api/v3/kb/refresh', respond(() => kb.list({ refresh: true }))),
    route('POST', '/api/v3/kb/preview', respond(async req => kb.preview(await readBody(req)))),
    route('POST', '/api/v3/kb/confirm', respond(async req => kb.confirm(await readBody(req)))),
    route('POST', '/api/v3/kb/quick', respond(async req => kb.quick(await readBody(req)))),
    route('GET', '/api/v3/kb/layout', respond(() => kb.layout())),
    route('PUT', '/api/v3/kb/layout', respond(async req => kb.saveLayout(await readBody(req)))),
    route('GET', '/api/v3/kb/operations/:id', respond((req, { params }) => kb.status(params.id))),
    route('POST', '/api/v3/kb/operations/:id/reconcile', respond(async (req, { params }) => kb.reconcile(params.id, await readBody(req)))),
  ];
}
