import { route } from '../http.mjs';
import { requireMonth } from '../v3-common.mjs';
import { handleV3 } from './user.mjs';

export function deliveryRoutes(needs) {
  return [route('GET', '/api/v3/months/:month', handleV3(async (req, { params: { month } }) => {
    requireMonth(month);
    const data = await needs.list(month), accepted = data.needs.filter(n => n.status === '已采纳').length;
    const review = data.needs.filter(n => n.status === '待复核').length;
    return { month, campaign: null, steps: [
      { key: 'needs', label: '主线需求', state: data.needs.length && accepted === data.needs.length ? 'done' : accepted ? 'part' : 'todo', meta: `${data.needs.length} 条 · ${accepted} 条已采纳${review ? ` · ${review} 条待复核` : ''}`, href: '#/user/strategy' },
      { key: 'prices', label: '价格方案', state: 'todo', meta: '未接入 · 第 3 批', href: '#/marketing/prices' },
      { key: 'materials', label: '物料交付', state: 'todo', meta: 'NAS 未接入 · 第 4 批', href: '#/marketing/materials' },
      { key: 'brief', label: '设计 brief', state: 'todo', meta: '未接入 · 第 3 批', href: '#/marketing/brief' },
      { key: 'campaign', label: '营销战役', state: 'todo', meta: '未接入 · 第 3 批', href: '#/marketing/campaign' },
    ] };
  }))];
}
