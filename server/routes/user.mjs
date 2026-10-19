import { json, pending, readJson, route } from '../http.mjs';
import { createTimelineReader } from '../timeline.mjs';
import { createNeedsService } from '../needs.mjs';
import { failure } from '../v3-common.mjs';
import { createStrategyExportService } from '../feishu-export.mjs';
import { createManualNeeds } from '../manual-needs.mjs';
import { createRulingService, withRulings } from '../timeline-rulings.mjs';

export const handleV3 = fn => async (req, res, context) => {
  try { json(res, 200, await fn(req, context)); }
  catch (error) { json(res, error.status || 500, { error: error.status ? error.message : '处理失败，请重新读取后再操作', ...(error.code && { code: error.code }), ...(error.receipt && { receipt: error.receipt }) }); }
};
async function body(req) {
  try { return await readJson(req); } catch { throw failure(400, '请求内容不是有效 JSON'); }
}
export function createUserServices(db, options = {}) {
  const raw = createTimelineReader(db, options.timeline);
  // 页面、需求推导、首页待办看到的都是叠加了人工裁定的时间线；裁定本身对照原始快照。
  const timeline = async opts => withRulings(db, await raw(opts));
  const needs = createNeedsService(db, timeline, options.needs);
  return { timeline, needs, strategyExports: createStrategyExportService(db, needs, options.exports), manualNeeds: createManualNeeds(db, { voice: options.voiceReader, ...options.manualNeeds }), rulings: createRulingService(db, raw, options.rulings) };
}
export function userRoutes(services) {
  const { timeline, needs, strategyExports, manualNeeds, rulings } = services;
  return [
    // 月度用户策略（docs/用户策略规范.md）：生成与保存待 T13，未实现前前端显示 2026-11 示例。
    route('GET', '/api/v3/user-strategy', pending('T13-用户策略生成')),
    route('POST', '/api/v3/timeline/anomalies/:key/preview', handleV3(async (req, { params }) => rulings.preview(params.key, await body(req)))),
    route('POST', '/api/v3/timeline/anomalies/confirm', handleV3(async req => rulings.confirm(await body(req)))),
    // 手写 / Voice 转来的需求草稿：路径与 /api/v3/needs/:id 分开，避免被当成需求编号。
    route('GET', '/api/v3/manual-needs', handleV3(() => manualNeeds.list())),
    route('POST', '/api/v3/manual-needs/preview', handleV3(async req => manualNeeds.preview(await body(req)))),
    route('POST', '/api/v3/manual-needs/:id/remove-preview', handleV3((req, { params }) => manualNeeds.removePreview(params.id))),
    route('POST', '/api/v3/manual-needs/confirm', handleV3(async req => manualNeeds.confirm(await body(req)))),
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
