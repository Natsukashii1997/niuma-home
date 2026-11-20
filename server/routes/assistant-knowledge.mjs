import { route, readBody, respond } from '../http.mjs';
import { createKnowledgeService } from '../assistant-knowledge.mjs';


export function routes(db, options = {}) {
  const knowledge = createKnowledgeService(db, options);
  return [
    route('GET', '/api/v3/assistants/:id/knowledge', respond((req, { params }) => knowledge.list(params.id))),
    route('POST', '/api/v3/assistants/:id/knowledge/preview', respond(async (req, { params }) => knowledge.preview(params.id, await readBody(req)))),
    route('POST', '/api/v3/assistants/:id/knowledge', respond(async (req, { params }) => knowledge.confirm(params.id, await readBody(req), 'add'))),
    route('DELETE', '/api/v3/assistants/:id/knowledge', respond(async (req, { params }) => knowledge.confirm(params.id, await readBody(req), 'delete'))),
  ];
}
