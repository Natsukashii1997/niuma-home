import { failure } from './v3-common.mjs';
import { createConfiguredReader, runLark } from './projects.mjs';

// 业务营收完成度（用户 2026-10-20）：原表是知识库里的多维表格《策略数据表单》，读它的仪表盘「当月策略盘」。
// 进度组件直接取飞书算好的当前值与目标（口径以仪表盘为准，改仪表盘筛选这里跟着变）；总转化率取「总转化率趋势」里本月与上月两点。
// 按组件名找组件，不写死组件 ID。只读，不写飞书。
export const REVENUE_SOURCE = {
  url: 'https://vm94j8bzy7.feishu.cn/wiki/MbZUwaURjimXmRk7sMkcJmNanEf?table=blkqXopQsvs0D8jO',
  base: 'L2M8bTP5XasRPGsTEMBcBCCHn2f', dashboard: 'blkqXopQsvs0D8jO',
};
const GROUPS = [
  { label: '总进度', items: [['total', '总营收', '当月总营收进度'], ['new', '总新签', '当月新签营收进度'], ['renew', '总续费', '当月续费营收进度']] },
  { label: '业务线', items: [['uni', '大学辅导', '大学辅导 - 总营收'], ['intl', '国课', '国际课程 - 总营收'], ['appeal', '申诉', '申诉 - 总营收']] },
];
const CONV_BLOCK = '总转化率趋势';

const num = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const pad = (n) => String(n).padStart(2, '0');

// 折线组件：按「年份」「月份」两个维度找某月的值。
function monthValue(data, year, month) {
  const alias = (name) => data.dimensions?.find((d) => d.field_name === name)?.alias;
  const y = alias('年份'), m = alias('月份');
  if (!y || !m || !Array.isArray(data.main_data)) throw failure(502, `仪表盘组件「${CONV_BLOCK}」缺少年份或月份维度`);
  const row = data.main_data.find((r) => String(r[y]?.value) === String(year) && Number(r[m]?.value) === month);
  const key = row && Object.keys(row).find((k) => k.startsWith('me_'));
  return key ? num(row[key].value) : null;
}

// 飞书仪表盘接口偶发返回通用错误码 1，马上重读就好（2026-10-27 实测）；只读，可以安全重试。仍失败就说清是哪一步、哪个错误码。
const RETRIES = 2;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function readLark(args, run, what, pause) {
  for (let attempt = 0; ; attempt++) {
    try { return await runLark(args, run); }
    catch (error) {
      if (error.status !== 502 && error.status !== 429) throw error;
      if (attempt < RETRIES) { await pause(error.retryAfterMs || 1500); continue; }
      if (error.larkCode == null) throw error;
      throw failure(502, `读取${what}时飞书接口出错（错误码 ${error.larkCode}），已重试 ${RETRIES} 次，请稍后点「重新读取」`);
    }
  }
}

export async function readRevenueSource(cfg, { run, now = Date.now, pause = sleep } = {}) {
  const common = ['--base-token', cfg.base, '--dashboard-id', cfg.dashboard];
  const listed = await readLark(['base', '+dashboard-block-list', ...common], run, '仪表盘「当月策略盘」的组件列表', pause);
  const blocks = Array.isArray(listed.blocks) ? listed.blocks : Array.isArray(listed.items) ? listed.items : null;
  if (!blocks) throw failure(502, '仪表盘「当月策略盘」的组件列表不完整');
  const blockData = (name) => {
    const block = blocks.find((b) => b?.name === name);
    if (!block) throw failure(502, `仪表盘「当月策略盘」里找不到组件「${name}」`);
    return readLark(['base', '+dashboard-block-get-data', ...common, '--block-id', block.block_id || block.id], run, `仪表盘组件「${name}」`, pause);
  };

  const groups = [];
  for (const g of GROUPS) {
    const items = [];
    for (const [key, name, blockName] of g.items) { // 逐个读，避免并发触发限流
      const point = (await blockData(blockName)).main_data?.[0];
      const current = num(point?.cur?.value), target = num(point?.target?.value);
      if (current == null || target == null) throw failure(502, `仪表盘组件「${blockName}」没有当前值或目标值`);
      items.push({ key, name, current, target });
    }
    groups.push({ label: g.label, items });
  }

  const at = new Date(now()), year = at.getFullYear(), month = at.getMonth() + 1;
  const conv = await blockData(CONV_BLOCK);
  const last = month === 1 ? [year - 1, 12] : [year, month - 1];
  const rate = monthValue(conv, year, month);
  if (rate != null) groups[0].items.push({ key: 'conv', name: '总转化率', rate, lastMonthRate: monthValue(conv, ...last) });

  const days = new Date(year, month, 0).getDate();
  return {
    period: `${year} 年 ${month} 月`, timePct: at.getDate() / days,
    updatedAt: `${pad(month)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`,
    source: cfg.url, groups,
  };
}

// 先给上次读到的结果（含重启前的快照），过期后台重读。
export function createRevenueService(db, { readSource = readRevenueSource, ...options } = {}) {
  const read = createConfiguredReader(db, 'revenue', () => REVENUE_SOURCE, readSource, { ttl: 600_000, staleWhileRevalidate: true, withStatus: true, ...options });
  return { get: options => read(options) };
}
