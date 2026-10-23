import { beijingText } from './v3-common.mjs';
import { getRecord, listRecords } from './local-records.mjs';
import { availablePriceMatrices, priceSettings } from './price.mjs';

export function todoView({ timeline, projects, campaign, matrices, settings, personal = [] }, now = Date.now()) {
  const items = [], today = beijingText(now).slice(0, 10), day = Date.parse(`${today}T00:00:00Z`);
  const node = (n, name, href) => {
    if (n.done) return;
    // text 是主行（节点名），sub 是次行小字（项目 · 负责人 · 到期），首页卡两行显示（用户 2026-10-23）
    if (n.gate && n.gateReady === true) items.push({ kind: '审核', text: n.t, sub: name, due: n.due || '', href, urgent: true });
    if (n.dueDate && /^20\d{2}-\d{2}-\d{2}$/.test(n.dueDate)) {
      const left = (Date.parse(`${n.dueDate}T00:00:00Z`) - day) / 86400000;
      if (left <= 2) items.push({ kind: '项目', text: n.t, sub: `${name} · ${n.owner || '负责人未填写'} · ${left < 0 ? `逾期${-left}天` : left === 0 ? '今天到期' : `${left}天内到期`}`, due: n.dueDate.slice(5), dueDate: n.dueDate, href, urgent: left <= 0 });
    }
  };
  for (const p of projects) for (const n of p.nodes || []) { node(n, p.name, '#/projects'); for (const child of n.childNodes || []) node(child, p.name, '#/projects'); }
  // 空模板或未完成门禁都不等于已提交审核；来源必须显式提供待审事实。
  if (campaign) for (const phase of campaign.phases) for (const n of phase.nodes) node({ ...n, dueDate: '' }, campaign.name, '#/projects/campaign');
  for (const matrix of matrices) for (const scheme of matrix.schemes) {
    if (scheme.status === '历史') continue;
    const broken = matrix.tiers.filter((hours, i) => 1 - settings.costPerHour * (hours + scheme.gifts[i]) / scheme.prices[i] < settings.floorMargin);
    if (broken.length && !scheme.breachReason?.trim()) items.push({ kind: '价格', text: `${scheme.name} · ${broken.join('/')}课时低于毛利底线，需填原因`, sub: matrix.name, due: '', href: '#/marketing/prices', urgent: true });
  }
  const open = timeline.anomalies.filter(a => !a.ruling && a.verification?.status !== 'confirmed').length; // 与时间线页面的待确认口径一致
  if (open) items.push({ kind: '时间线', text: `${open} 条 AI 推测`, due: '', href: '#/user/timeline/anomalies' });
  for (const item of personal.filter(x => !x.done)) items.push({ kind: '待办', text: item.title || item.text, due: item.due || '', href: '#/home' });
  return items;
}

export function createTodoReader(db, { timeline, projects, now = Date.now }) {
  return async () => {
    const [tl, ps] = await Promise.all([timeline(), projects.list()]);
    return todoView({ timeline: tl, projects: ps, campaign: getRecord(db, 'campaign', 'current'), matrices: availablePriceMatrices(db), settings: priceSettings(db), personal: listRecords(db, 'selftalk-todo') }, now());
  };
}
