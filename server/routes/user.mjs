import { route, readBody, respond } from '../http.mjs';
import { createTimelineReader } from '../timeline.mjs';
import { createNeedsService } from '../needs.mjs';
import { createStrategyExportService } from '../feishu-export.mjs';
import { createManualNeeds } from '../manual-needs.mjs';
import { createRulingService, withRulings } from '../timeline-rulings.mjs';
import { createStrategyService } from '../strategy-service.mjs';
import { createUserStrategyService } from '../user-strategy.mjs';
import { createTimelineYearService } from '../timeline-years.mjs';

export function createUserServices(db, options = {}) {
  const raw = createTimelineReader(db, options.timeline);
  // 页面、需求推导、首页待办看到的都是叠加了人工裁定的时间线；裁定本身对照原始快照。
  const timeline = async opts => withRulings(db, await raw(opts));
  const needs = createNeedsService(db, timeline, options.needs);
  return { timeline, needs, strategyExports: createStrategyExportService(db, needs, options.exports), manualNeeds: createManualNeeds(db, { voice: options.voiceReader, ...options.manualNeeds }), rulings: createRulingService(db, raw, options.rulings), userStrategy: createUserStrategyService(db, options.userStrategy), strategy: createStrategyService(db, { readTimeline: timeline, ...options.strategy }),
    timelineYears: createTimelineYearService(db, { ...(options.timeline?.readSheets && { readSheets: options.timeline.readSheets }), ...options.timelineYears, refresh: () => timeline({ refresh: true }) }) };
}
// cellIndex 只给月度策略生成 Evidence 用（含全部原格原文），不随时间线接口下发给页面。
const forPage = ({ cellIndex, ...rest }) => rest;
export function userRoutes(services) {
  const { timeline, needs, strategyExports, manualNeeds, rulings, userStrategy, timelineYears, strategy } = services;
  return [
    // 月度用户策略 v2（docs/策略规则/）：skill 经 strategy_submit 提交，页面预览、确认后生成不可变 revision；确认与拒绝只在页面。
    route('GET', '/api/v3/strategy-v2', respond((req, { url }) => strategy.get(url.searchParams.get('month')))),
    route('GET', '/api/v3/strategy-v2/revisions', respond((req, { url }) => strategy.revisions(url.searchParams.get('month')))),
    route('GET', '/api/v3/strategy-v2/revisions/:id', respond((req, { params }) => strategy.revision(params.id))),
    route('GET', '/api/v3/strategy-v2/submissions', respond((req, { url }) => strategy.submissions(url.searchParams.get('month')))),
    route('GET', '/api/v3/strategy-v2/evidence', respond((req, { url }) => strategy.evidence(url.searchParams.get('month')))),
    route('GET', '/api/v3/strategy-v2/submissions/:id/preview', respond((req, { params }) => strategy.preview(params.id))),
    route('POST', '/api/v3/strategy-v2/submissions/:id/confirm', respond(async (req, { params }) => strategy.confirm(params.id, await readBody(req)))),
    route('POST', '/api/v3/strategy-v2/submissions/:id/reject', respond(async (req, { params }) => strategy.reject(params.id, await readBody(req)))),
    route('POST', '/api/v3/strategy-v2/:month/rollback', respond(async (req, { params }) => strategy.rollback(params.month, await readBody(req)))),
    route('POST', '/api/v3/strategy-v2/:month/bizcard/preview', respond(async (req, { params }) => strategy.previewBizcard(params.month, await readBody(req)))),
    route('POST', '/api/v3/strategy-v2/:month/bizcard/confirm', respond(async (req, { params }) => strategy.confirmBizcard(params.month, await readBody(req)))),
    // 月度用户策略（T13，docs/用户策略规范.md）：用户情况内置可改，促销策略按钮生成；修改 / 生成 / 定稿都先预览，再用同一个 confirm 写入并回读。
    route('GET', '/api/v3/user-strategy', respond((req, { url }) => userStrategy.get(url.searchParams.get('month')))),
    route('POST', '/api/v3/user-strategy/generate/preview', respond(async req => userStrategy.previewGenerate(await readBody(req)))),
    route('POST', '/api/v3/user-strategy/:month/edit/preview', respond(async (req, { params }) => userStrategy.previewEdit(params.month, await readBody(req)))),
    route('POST', '/api/v3/user-strategy/:month/finalize/preview', respond((req, { params }) => userStrategy.previewFinalize(params.month))),
    route('POST', '/api/v3/user-strategy/:month/confirm', respond(async (req, { params }) => userStrategy.confirm(params.month, await readBody(req)))),
    route('POST', '/api/v3/timeline/anomalies/:key/preview', respond(async (req, { params }) => rulings.preview(params.key, await readBody(req)))),
    route('POST', '/api/v3/timeline/anomalies/confirm', respond(async req => rulings.confirm(await readBody(req)))),
    // 手写 / Voice 转来的需求草稿：路径与 /api/v3/needs/:id 分开，避免被当成需求编号。
    route('GET', '/api/v3/manual-needs', respond(() => manualNeeds.list())),
    route('POST', '/api/v3/manual-needs/preview', respond(async req => manualNeeds.preview(await readBody(req)))),
    route('POST', '/api/v3/manual-needs/:id/remove-preview', respond((req, { params }) => manualNeeds.removePreview(params.id))),
    route('POST', '/api/v3/manual-needs/confirm', respond(async req => manualNeeds.confirm(await readBody(req)))),
    route('GET', '/api/v3/timeline', respond(async () => forPage(await timeline()))),
    route('POST', '/api/v3/timeline/sync', respond(async () => forPage(await timeline({ refresh: true })))),
    // 登记新年份的时间表：先预览（只读校验结构），确认后写设置并同步回读。
    route('POST', '/api/v3/timeline/years/preview', respond(async req => timelineYears.preview(await readBody(req)))),
    route('POST', '/api/v3/timeline/years/confirm', respond(async req => timelineYears.confirm(await readBody(req)))),
    route('GET', '/api/v3/needs', respond((req, { url }) => needs.list(url.searchParams.get('month')))),
    route('POST', '/api/v3/needs/:id/preview', respond(async (req, { params }) => needs.preview(params.id, await readBody(req)))),
    route('POST', '/api/v3/needs/:id/adopt', respond(async (req, { params }) => needs.confirm(params.id, await readBody(req)))),
    route('PATCH', '/api/v3/needs/:id/strategy', respond(async (req, { params }) => needs.confirm(params.id, await readBody(req), true))),
    route('POST', '/api/v3/needs/:id/strategy/export-preview', respond(async (req, { params }) => strategyExports.preview(params.id, await readBody(req)))),
    route('POST', '/api/v3/needs/:id/strategy/export', respond(async (req, { params }) => strategyExports.confirm(params.id, await readBody(req)))),
    route('GET', '/api/v3/needs/:id/strategy/exports/:operationId', respond((req, { params }) => strategyExports.status(params.id, params.operationId))),
    route('POST', '/api/v3/needs/:id/strategy/exports/:operationId/reconcile', respond((req, { params }) => strategyExports.reconcile(params.id, params.operationId))),
  ];
}
