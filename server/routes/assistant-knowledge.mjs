import { route, readJson } from '../http.mjs';
import { createKnowledgeService } from '../assistant-knowledge.mjs';
import { failure } from '../v3-common.mjs';
import { handleV3 } from './user.mjs';

async function body(req) {
  try { return await readJson(req); } catch { throw failure(400, '请求内容不是有效 JSON'); }
}

export function routes(db, options = {}) {
  const knowledge = createKnowledgeService(db, options);
  return [
    route('GET', '/api/v3/assistants/:id/knowledge', handleV3((req, { params }) => knowledge.list(params.id))),
    route('POST', '/api/v3/assistants/:id/knowledge/preview', handleV3(async (req, { params }) => knowledge.preview(params.id, await body(req)))),
    route('POST', '/api/v3/assistants/:id/knowledge', handleV3(async (req, { params }) => knowledge.confirm(params.id, await body(req), 'add'))),
    route('DELETE', '/api/v3/assistants/:id/knowledge', handleV3(async (req, { params }) => knowledge.confirm(params.id, await body(req), 'delete'))),
  ];
}
