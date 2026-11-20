import { route, readBody, respond } from '../http.mjs';

// 项目页：项目推进（飞书来源）与本地项目的新建、删除、恢复。带教在 routes/mentor.mjs，知识库在 routes/kb.mjs。
export function projectRoutes({ projects }) {
  return [
    route('GET', '/api/v3/projects', respond(() => projects.list())),
    // 新建本地项目：路径与 /api/v3/projects/:id 分开，避免被当成项目编号。
    route('POST', '/api/v3/local-projects/preview', respond(async req => projects.createPreview(await readBody(req)))),
    route('POST', '/api/v3/local-projects/confirm', respond(async req => projects.createConfirm(await readBody(req)))),
    route('GET', '/api/v3/local-projects', respond((req, { url }) => projects.localList({ deleted: url.searchParams.get('deleted') === 'true' }))),
    route('POST', '/api/v3/local-projects/:id/remove-preview', respond(async (req, { params }) => projects.removePreview(params.id, await readBody(req)))),
    route('DELETE', '/api/v3/local-projects/:id', respond(async (req, { params }) => projects.removeConfirm(params.id, await readBody(req)))),
    route('POST', '/api/v3/local-projects/:id/restore-preview', respond(async (req, { params }) => projects.restorePreview(params.id, await readBody(req)))),
    route('POST', '/api/v3/local-projects/:id/restore', respond(async (req, { params }) => projects.restoreConfirm(params.id, await readBody(req)))),
    route('POST', '/api/v3/projects/sync', respond(() => projects.list({ refresh: true }))),
    route('POST', '/api/v3/projects/:id/preview', respond(async (req, { params }) => projects.preview(params.id, await readBody(req)))),
    route('PATCH', '/api/v3/projects/:id', respond(async (req, { params }) => projects.confirm(params.id, await readBody(req)))),
    route('PATCH', '/api/v3/projects', respond(async req => { const value = await readBody(req); return projects.confirm(value.id, value); })),
  ];
}
