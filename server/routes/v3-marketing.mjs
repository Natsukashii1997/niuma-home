import { json, readJson, route } from '../http.mjs';
import { createPriceService } from '../price.mjs';
import { createCampaignService } from '../campaigns.mjs';
import { createBriefService } from '../briefs.mjs';
import { failure } from '../v3-common.mjs';

const handle = fn => async (req, res, context) => {
  try {
    const result = await fn(req, context);
    if (result?.origin === 'demo' || Array.isArray(result) && result.some(row => row.origin === 'demo')) {
      // 当前 useApi 仅凭 501 显示示例标记；保留演示标记，等待 Claude 接入 origin 后再统一 200。
      res.setHeader('x-workdesk-data-origin', 'demo');
      return json(res, 501, Array.isArray(result) ? result : { ...result, task: '演示数据（待正式价格表）' });
    }
    json(res, 200, result);
  } catch (error) {
    json(res, error.status || 500, { error: error.status ? error.message : '营销数据处理失败，请重新读取后再操作', ...(error.code && { code: error.code }), ...(error.receipt && { receipt: error.receipt }) });
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
    route('GET', '/api/v3/briefs/:month', handle((req, { params }) => briefs.read(params.month))),
    route('POST', '/api/v3/briefs/:month/preview', handle(async (req, { params }) => briefs.preview(params.month, await body(req)))),
    route('PUT', '/api/v3/briefs/:month', handle(async (req, { params }) => briefs.confirm(params.month, await body(req)))),
    route('POST', '/api/v3/briefs/:month/export-preview', handle(async (req, { params }) => briefs.exportPreview(params.month, await body(req)))),
    route('POST', '/api/v3/briefs/:month/export', handle(async (req, { params }) => briefs.exportConfirm(params.month, await body(req)))),
    route('GET', '/api/v3/briefs/:month/exports/:operationId', handle((req, { params }) => briefs.exportStatus(params.month, params.operationId))),
    route('POST', '/api/v3/briefs/:month/exports/:operationId/reconcile', handle((req, { params }) => briefs.exportReconcile(params.month, params.operationId))),
  ];
}
