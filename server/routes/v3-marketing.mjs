import { json, readJson, route } from '../http.mjs';
import { createPriceService } from '../price.mjs';
import { createCampaignService } from '../campaigns.mjs';
import { createBriefService } from '../briefs.mjs';
import { failure } from '../v3-common.mjs';

const handle = fn => async (req, res, context) => {
  try {
    const result = await fn(req, context);
    if (result?.origin === 'demo' || Array.isArray(result) && result.some(row => row.origin === 'demo')) {
      // 演示口径：200 + 数据里的 origin:'demo'（另加响应头），前端据此标「示例」；不再借 501 冒充未实现。
      res.setHeader('x-workdesk-data-origin', 'demo');
      return json(res, 200, Array.isArray(result) ? result : { ...result, task: '演示数据（待正式价格表）' });
    }
    json(res, 200, result);
  } catch (error) {
    json(res, error.status || 500, { error: error.status ? error.message : '营销数据处理失败，请重新读取后再操作', ...(error.code && { code: error.code }), ...(error.receipt && { receipt: error.receipt }), ...(error.conflict && {conflict:error.conflict}) });
  }
};
async function body(req) { try { return await readJson(req); } catch { throw failure(400, '请求内容不是有效 JSON'); } }

export function routes(db, options = {}) {
  const price = createPriceService(db, options.price), campaign = createCampaignService(db, options.campaign), briefs = createBriefService(db, options.briefs);
  return [
    route('GET', '/api/v3/price/skus', handle(() => price.skus())),
    route('GET', '/api/v3/price/schemes', handle((req, { url }) => price.schemes(url.searchParams.get('sku')))),
    route('POST', '/api/v3/price/schemes/preview', handle(async (req, { url }) => price.preview(url.searchParams.get('sku'), await body(req)))),
    route('PUT', '/api/v3/price/schemes', handle(async (req, { url }) => price.confirm(url.searchParams.get('sku'), await body(req)))),
    route('GET', '/api/v3/campaigns/current', handle(() => campaign.current())),
    route('POST', '/api/v3/campaigns/current/preview', handle(async req => campaign.preview(await body(req)))),
    route('PATCH', '/api/v3/campaigns/current', handle(async req => campaign.confirm(await body(req)))),
    route('GET', '/api/v3/campaigns/history', handle((req, { url }) => campaign.history({ deleted: url.searchParams.get('deleted') === 'true' }))),
    route('POST', '/api/v3/campaigns/history/:id/remove-preview', handle(async (req, { params }) => campaign.removePreview(params.id, await body(req)))),
    route('DELETE', '/api/v3/campaigns/history/:id', handle(async (req, { params }) => campaign.removeConfirm(params.id, await body(req)))),
    route('POST', '/api/v3/campaigns/history/:id/restore-preview', handle(async (req, { params }) => campaign.restorePreview(params.id, await body(req)))),
    route('POST', '/api/v3/campaigns/history/:id/restore', handle(async (req, { params }) => campaign.restoreConfirm(params.id, await body(req)))),
    route('POST', '/api/v3/campaigns/current/archive-preview', handle(() => campaign.archivePreview())),
    route('POST', '/api/v3/campaigns/current/archive', handle(async req => campaign.archiveConfirm(await body(req)))),
    route('GET', '/api/v3/briefs/:month', handle((req, { params }) => briefs.read(params.month))),
    route('POST', '/api/v3/briefs/:month/autosave', handle(async (req, { params }) => briefs.autosave(params.month, await body(req)))),
    route('POST', '/api/v3/briefs/:month/generate', handle(async (req, { params }) => briefs.generate(params.month, await body(req)))),
    route('POST', '/api/v3/briefs/:month/preview', handle(async (req, { params }) => briefs.preview(params.month, await body(req)))),
    route('PUT', '/api/v3/briefs/:month', handle(async (req, { params }) => briefs.confirm(params.month, await body(req)))),
    route('GET', '/api/v3/briefs/:month/attachments', handle((req, { params }) => briefs.attachments.list(params.month))),
    route('POST', '/api/v3/briefs/:month/attachments/preview', handle(async (req, { params }) => briefs.attachments.preview(params.month, await body(req)))),
    route('POST', '/api/v3/briefs/:month/attachments/confirm', handle(async (req, { params }) => briefs.attachments.confirm(params.month, await body(req)))),
    route('POST', '/api/v3/briefs/:month/attachments/:id/remove-preview', handle((req, { params }) => briefs.attachments.removePreview(params.month, params.id))),
    route('GET', '/api/v3/briefs/:month/attachments/:id/file', (req, res, { params, url }) => {
      try {
        const { record, bytes } = briefs.attachments.file(params.month, params.id);
        const inline = record.type.startsWith('image/') && url.searchParams.get('download') !== '1';
        res.writeHead(200, { 'content-type': record.type, 'content-length': bytes.length, 'x-content-type-options': 'nosniff', 'cache-control': 'no-store', 'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(record.name)}` });
        res.end(bytes);
      } catch (error) { json(res, error.status || 500, { error: error.status ? error.message : '附件读取失败' }); }
    }),
    route('POST', '/api/v3/briefs/:month/export-preview', handle(async (req, { params }) => briefs.exportPreview(params.month, await body(req)))),
    route('POST', '/api/v3/briefs/:month/export', handle(async (req, { params }) => briefs.exportConfirm(params.month, await body(req)))),
    route('GET', '/api/v3/briefs/:month/exports/:operationId', handle((req, { params }) => briefs.exportStatus(params.month, params.operationId))),
    route('POST', '/api/v3/briefs/:month/exports/:operationId/resume', handle((req, { params }) => briefs.exportResume(params.month, params.operationId))),
    route('POST', '/api/v3/briefs/:month/exports/:operationId/reconcile', handle((req, { params }) => briefs.exportReconcile(params.month, params.operationId))),
  ];
}
