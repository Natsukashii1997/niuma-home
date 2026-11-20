import { route, readBody, respond } from '../http.mjs';

// 带教页：答疑与带教记录（mentor）、培养路径（mentorPath）。
export function mentorRoutes({ mentor, mentorPath }) {
  return [
    route('GET', '/api/v3/mentor', respond(() => mentor.list())),
    route('POST', '/api/v3/mentor/refresh', respond(() => mentor.list({ refresh: true }))),
    // 培养路径（按工作日排期，照飞书 V2.4）：加带教对象、调整安排、记录进度，都是预览 → 确认 → 回读，只写工作台本地
    route('GET', '/api/v3/mentor/path', respond(() => mentorPath.get())),
    route('POST', '/api/v3/mentor/path/trainees/preview', respond(async req => mentorPath.addPreview(await readBody(req)))),
    route('POST', '/api/v3/mentor/path/trainees', respond(async req => mentorPath.addConfirm(await readBody(req)))),
    route('POST', '/api/v3/mentor/path/:name/plan/preview', respond(async (req, { params }) => mentorPath.planPreview(params.name, await readBody(req)))),
    route('POST', '/api/v3/mentor/path/:name/plan', respond(async (req, { params }) => mentorPath.planConfirm(params.name, await readBody(req)))),
    route('POST', '/api/v3/mentor/path/:name/generate/preview', respond(async (req, { params }) => mentorPath.generatePreview(params.name, await readBody(req)))),
    route('POST', '/api/v3/mentor/path/:name/generate', respond(async (req, { params }) => mentorPath.importConfirm(params.name, (await readBody(req))?.previewId))),
    route('POST', '/api/v3/mentor/path/:name/stages/:id/record/preview', respond(async (req, { params }) => mentorPath.recordPreview(params.name, params.id, await readBody(req)))),
    route('POST', '/api/v3/mentor/path/:name/stages/:id/record', respond(async (req, { params }) => mentorPath.recordConfirm(params.name, params.id, await readBody(req)))),
    route('POST', '/api/v3/mentor/:name/records/preview', respond(async (req, { params }) => mentor.preview(params.name, await readBody(req)))),
    route('POST', '/api/v3/mentor/:name/records', respond(async (req, { params }) => mentor.confirm(params.name, await readBody(req)))),
    route('POST', '/api/v3/mentor/:name/draft/preview', respond(async (req, { params }) => mentor.previewDraft(params.name, await readBody(req)))),
    route('POST', '/api/v3/mentor/:name/draft', respond(async (req, { params }) => mentor.confirmDraft(params.name, await readBody(req)))),
    route('POST', '/api/v3/mentor/:name/items/:id/answer', respond(async (req, { params }) => mentor.answer(params.name, params.id, await readBody(req)))),
    route('POST', '/api/v3/mentor/:name/items/:id/reply/preview', respond(async (req, { params }) => mentor.previewReply(params.name, params.id, await readBody(req)))),
    route('POST', '/api/v3/mentor/:name/items/:id/reply', respond(async (req, { params }) => mentor.confirmReply(params.name, params.id, await readBody(req)))),
    route('POST', '/api/v3/mentor/:name/items/:id/reply/reconcile', respond((req, { params }) => mentor.reconcileReply(params.name, params.id))),
  ];
}
