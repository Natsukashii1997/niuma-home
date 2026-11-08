import { json, readJson, route } from '../http.mjs';
import { createTimelineReader } from '../timeline.mjs';
import { createNeedsService } from '../needs.mjs';
import { failure } from '../v3-common.mjs';
import { createStrategyExportService } from '../feishu-export.mjs';
import { createManualNeeds } from '../manual-needs.mjs';
import { createRulingService, withRulings } from '../timeline-rulings.mjs';
import { createUserStrategyService } from '../user-strategy.mjs';
import { createTimelineYearService } from '../timeline-years.mjs';

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
  return { timeline, needs, strategyExports: createStrategyExportService(db, needs, options.exports), manualNeeds: createManualNeeds(db, { voice: options.voiceReader, ...options.manualNeeds }), rulings: createRulingService(db, raw, options.rulings), userStrategy: createUserStrategyService(db, options.userStrategy),
    timelineYears: createTimelineYearService(db, { ...(options.timeline?.readSheets && { readSheets: options.timeline.readSheets }), ...options.timelineYears, refresh: () => timeline({ refresh: true }) }) };
}
// cellIndex 只给月度策略生成 Evidence 用（含全部原格原文），不随时间线接口下发给页面。
const forPage = ({ cellIndex, ...rest }) => rest;
export function userRoutes(services) {
  const { timeline, needs, strategyExports, manualNeeds, rulings, userStrategy, timelineYears } = services;
  return [
    // 月度用户策略（T13，docs/用户策略规范.md）：用户情况内置可改，促销策略按钮生成；修改 / 生成 / 定稿都先预览，再用同一个 confirm 写入并回读。
    route('GET', '/api/v3/user-strategy', handleV3((req, { url }) => userStrategy.get(url.searchParams.get('month')))),
    route('POST', '/api/v3/user-strategy/generate/preview', handleV3(async req => userStrategy.previewGenerate(await body(req)))),
    route('POST', '/api/v3/user-strategy/:month/edit/preview', handleV3(async (req, { params }) => userStrategy.previewEdit(params.month, await body(req)))),
    route('POST', '/api/v3/user-strategy/:month/finalize/preview', handleV3((req, { params }) => userStrategy.previewFinalize(params.month))),
    route('POST', '/api/v3/user-strategy/:month/confirm', handleV3(async (req, { params }) => userStrategy.confirm(params.month, await body(req)))),
    route('POST', '/api/v3/timeline/anomalies/:key/preview', handleV3(async (req, { params }) => rulings.preview(params.key, await body(req)))),
    route('POST', '/api/v3/timeline/anomalies/confirm', handleV3(async req => rulings.confirm(await body(req)))),
    // 手写 / Voice 转来的需求草稿：路径与 /api/v3/needs/:id 分开，避免被当成需求编号。
    route('GET', '/api/v3/manual-needs', handleV3(() => manualNeeds.list())),
    route('POST', '/api/v3/manual-needs/preview', handleV3(async req => manualNeeds.preview(await body(req)))),
    route('POST', '/api/v3/manual-needs/:id/remove-preview', handleV3((req, { params }) => manualNeeds.removePreview(params.id))),
    route('POST', '/api/v3/manual-needs/confirm', handleV3(async req => manualNeeds.confirm(await body(req)))),
    route('GET', '/api/v3/timeline', handleV3(async () => forPage(await timeline()))),
    route('POST', '/api/v3/timeline/sync', handleV3(async () => forPage(await timeline({ refresh: true })))),
    // 登记新年份的时间表：先预览（只读校验结构），确认后写设置并同步回读。
    route('POST', '/api/v3/timeline/years/preview', handleV3(async req => timelineYears.preview(await body(req)))),
    route('POST', '/api/v3/timeline/years/confirm', handleV3(async req => timelineYears.confirm(await body(req)))),
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
