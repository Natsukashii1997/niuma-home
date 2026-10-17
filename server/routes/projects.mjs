import { readJson, route } from '../http.mjs';
import { handleV3 } from './user.mjs';
import { failure } from '../v3-common.mjs';
import { createProjectService } from '../projects.mjs';
import { createMentorService } from '../mentor.mjs';
import { createKnowledgeTreeService } from '../knowledge-tree.mjs';

async function body(req) { try { return await readJson(req); } catch { throw failure(400, '请求内容不是有效 JSON'); } }
export function createProjectServices(db, options = {}) {
  return { projects: createProjectService(db, options.projects), mentor: createMentorService(db, options.mentor), kb: createKnowledgeTreeService(db, options.kb) };
}
export function projectRoutes({ projects, mentor, kb }) {
  return [
    route('GET', '/api/v3/projects', handleV3(() => projects.list())),
    // 新建本地项目：路径与 /api/v3/projects/:id 分开，避免被当成项目编号。
    route('POST', '/api/v3/local-projects/preview', handleV3(async req => projects.createPreview(await body(req)))),
    route('POST', '/api/v3/local-projects/confirm', handleV3(async req => projects.createConfirm(await body(req)))),
    route('POST', '/api/v3/projects/sync', handleV3(() => projects.list({ refresh: true }))),
    route('POST', '/api/v3/projects/:id/preview', handleV3(async (req, { params }) => projects.preview(params.id, await body(req)))),
    route('PATCH', '/api/v3/projects/:id', handleV3(async (req, { params }) => projects.confirm(params.id, await body(req)))),
    route('PATCH', '/api/v3/projects', handleV3(async req => { const value = await body(req); return projects.confirm(value.id, value); })),
    route('GET', '/api/v3/mentor', handleV3(() => mentor.list())),
    route('POST', '/api/v3/mentor/refresh', handleV3(() => mentor.list({ refresh: true }))),
    route('POST', '/api/v3/mentor/:name/records/preview', handleV3(async (req, { params }) => mentor.preview(params.name, await body(req)))),
    route('POST', '/api/v3/mentor/:name/records', handleV3(async (req, { params }) => mentor.confirm(params.name, await body(req)))),
    route('POST', '/api/v3/mentor/:name/draft/preview', handleV3(async (req, { params }) => mentor.previewDraft(params.name, await body(req)))),
    route('POST', '/api/v3/mentor/:name/draft', handleV3(async (req, { params }) => mentor.confirmDraft(params.name, await body(req)))),
    route('GET', '/api/v3/kb/tree', handleV3(() => kb.list())),
    route('POST', '/api/v3/kb/refresh', handleV3(() => kb.list({ refresh: true }))),
    route('POST', '/api/v3/kb/preview', handleV3(async req => kb.preview(await body(req)))),
    route('POST', '/api/v3/kb/confirm', handleV3(async req => kb.confirm(await body(req)))),
    route('GET', '/api/v3/kb/operations/:id', handleV3((req, { params }) => kb.status(params.id))),
    route('POST', '/api/v3/kb/operations/:id/reconcile', handleV3(async (req, { params }) => kb.reconcile(params.id, await body(req)))),
  ];
}
