import { json, readJson, route } from '../http.mjs';
import { createTimelineReader } from '../timeline.mjs';
import { createNeedsService } from '../needs.mjs';
import { failure } from '../v3-common.mjs';
import { createStrategyExportService } from '../feishu-export.mjs';

export const handleV3 = fn => async (req, res, context) => {
  try { json(res, 200, await fn(req, context)); }
  catch (error) { json(res, error.status || 500, { error: error.status ? error.message : '处理失败，请重新读取后再操作', ...(error.code && { code: error.code }), ...(error.receipt && { receipt: error.receipt }) }); }
};
async function body(req) {
  try { return await readJson(req); } catch { throw failure(400, '请求内容不是有效 JSON'); }
}
export function createUserServices(db, options = {}) {
  const timeline = createTimelineReader(db, options.timeline);
  const needs = createNeedsService(db, timeline, options.needs);
  return { timeline, needs, strategyExports: createStrategyExportService(db, needs, options.exports) };
}
export function userRoutes(services) {
  const { timeline, needs, strategyExports } = services;
  return [
    route('GET', '/api/v3/timeline', handleV3(() => timeline())),
    route('POST', '/api/v3/timeline/sync', handleV3(() => timeline({ refresh: true }))),
    route('GET', '/api/v3/needs', handleV3((req, { url }) => needs.list(url.searchParams.get('month')))),
    route('POST', '/api/v3/needs/:id/preview', handleV3(async (req, { params }) => needs.preview(params.id, await body(req)))),
    route('POST', '/api/v3/needs/:id/adopt', handleV3(async (req, { params }) => needs.confirm(params.id, await body(req)))),
    route('PATCH', '/api/v3/needs/:id/strategy', handleV3(async (req, { params }) => needs.confirm(params.id, await body(req), true))),
    route('POST', '/api/v3/needs/:id/strategy/export-preview', handleV3(async (req, { params }) => strategyExports.preview(params.id, await body(req)))),
    route('POST', '/api/v3/needs/:id/strategy/export', handleV3(async (req, { params }) => strategyExports.confirm(params.id, await body(req)))),
    route('GET', '/api/v3/needs/:id/strategy/exports/:operationId', handleV3((req, { params }) => strategyExports.status(params.id, params.operationId))),
    route('POST', '/api/v3/needs/:id/strategy/exports/:operationId/reconcile', handleV3((req, { params }) => strategyExports.reconcile(params.id, params.operationId))),
  ];
}
