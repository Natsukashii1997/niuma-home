import { getSettings } from './db.mjs';
import { failure } from './v3-common.mjs';
import { baseToken, createConfiguredReader, matrixRows, runLark } from './projects.mjs';

// 品牌数据（用户 2026-10-18）：飞书品牌多维表格里每一版是一张表，表名形如 V2026.09.01；只读这些版本表，物料、数据汇总等其他表不读。
// 每版的数据项：数据项ID、排序号、数据维度、指标名称、指标值、业务线、责任人；最新版另有「数据核对」（新增 / 删减 / 保留）。
// 接口只给各版原始数据（最新版在前）；版本之间的更新、改名、下线由页面按数据项ID比较。只读，不写飞书。
export const BRAND_SOURCE = { url: 'https://vm94j8bzy7.feishu.cn/base/NGImbr8D1arJcIsr0SBcx3i4n3b' };
const VERSION = /^V(\d{4})\.(\d{2})\.(\d{2})$/;

const text = (value) => typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.map((v) => typeof v === 'string' ? v : v?.text || '').join('').trim() : typeof value === 'number' ? String(value) : '';
const option = (value) => Array.isArray(value) ? (value.find((v) => typeof v === 'string') || '') : typeof value === 'string' ? value : '';
const people = (value) => Array.isArray(value) ? value.map((v) => v?.name).filter(Boolean).join('、') : '';

export function brandItem(row) {
  return {
    id: text(row['数据项ID']), sort: typeof row['排序号'] === 'number' ? row['排序号'] : null,
    dim: option(row['数据维度']), line: option(row['业务线']), name: text(row['指标名称']), value: text(row['指标值']),
    owner: people(row['责任人']), ...(option(row['数据核对']) ? { check: option(row['数据核对']) } : {}),
  };
}

export async function readBrandSource(config, { run, now = Date.now } = {}) {
  let token;
  try { token = baseToken(config.url); } catch { throw failure(400, '品牌多维表格链接须为 HTTPS 飞书多维表格链接'); }
  const common = ['--base-token', token];
  const tables = (await runLark(['base', '+table-list', ...common], run)).tables;
  if (!Array.isArray(tables)) throw failure(502, '品牌多维表格的数据表列表不完整');
  const versions = tables.filter((t) => VERSION.test(t?.name || '')).sort((a, b) => b.name.localeCompare(a.name));
  if (!versions.length) throw failure(400, '品牌多维表格里没有「V年.月.日」命名的版本表');
  const out = [];
  for (const t of versions) {
    const rows = []; let revision;
    for (;;) { // 每页最多 200 条；分页期间表版本变了就不保存
      const page = await runLark(['base', '+record-list', ...common, '--table-id', t.id, '--limit', '200', '--offset', String(rows.length)], run);
      if (typeof page.has_more !== 'boolean' || revision !== undefined && page.rev !== revision) throw failure(502, `版本表 ${t.name} 没有读完整，未保存不完整快照`);
      revision = page.rev;
      const got = matrixRows({ ...page, has_more: false }); rows.push(...got);
      if (!page.has_more) break;
      if (!got.length || rows.length >= 2000) throw failure(502, `版本表 ${t.name} 没有读完整，未保存不完整快照`);
    }
    const items = rows.map(brandItem).sort((a, b) => (a.sort ?? Infinity) - (b.sort ?? Infinity));
    const [, y, m, d] = t.name.match(VERSION);
    out.push({ version: t.name, table: t.id, date: `${y}-${m}-${d}`, items });
  }
  return { source: config.url, readAt: new Date(now()).toISOString(), versions: out };
}

// 先显示上次读到的结果（含服务重启前存下的快照），过期的话后台再读；「重新读取」现读。
export function createBrandService(db, { readSource = readBrandSource, ...options } = {}) {
  const config = () => ({ url: getSettings(db).brand_base_url || BRAND_SOURCE.url });
  const read = createConfiguredReader(db, 'brand', config, readSource, { ttl: 600_000, staleWhileRevalidate: true, withStatus: true, ...options });
  return { list: ({ refresh = false } = {}) => read({ refresh }) };
}
