import { beijingText, requireMonth } from './v3-common.mjs';
import { getRecord, listRecords } from './local-records.mjs';
import { availablePriceMatrices, priceSettings } from './price.mjs';

export function todoView({ timeline, needs, projects, campaign, matrices, settings, personal = [] }, now = Date.now()) {
  const items = [], today = beijingText(now).slice(0, 10), day = Date.parse(`${today}T00:00:00Z`);
  const node = (n, name, href) => {
    if (n.done) return;
    if (n.gate && n.gateReady === true) items.push({ kind: '审核', text: `${name} · ${n.t}`, due: n.due || '', href, urgent: true });
    if (n.dueDate && /^20\d{2}-\d{2}-\d{2}$/.test(n.dueDate)) {
      const left = (Date.parse(`${n.dueDate}T00:00:00Z`) - day) / 86400000;
      if (left <= 2) items.push({ kind: '项目', text: `${name} · ${n.t} · ${n.owner || '负责人未填写'} · ${left < 0 ? `逾期${-left}天` : left === 0 ? '今天到期' : `${left}天内到期`}`, due: n.dueDate.slice(5), dueDate: n.dueDate, href, urgent: left <= 0 });
    }
  };
  for (const p of projects) for (const n of p.nodes || []) { node(n, p.name, '#/projects'); for (const child of n.childNodes || []) node(child, p.name, '#/projects'); }
  // 空模板或未完成门禁都不等于已提交审核；来源必须显式提供待审事实。
  if (campaign) for (const phase of campaign.phases) for (const n of phase.nodes) node({ ...n, dueDate: '' }, campaign.name, '#/projects/campaign');
  for (const matrix of matrices) for (const scheme of matrix.schemes) {
    if (scheme.status === '历史') continue;
    const broken = matrix.tiers.filter((hours, i) => 1 - settings.costPerHour * (hours + scheme.gifts[i]) / scheme.prices[i] < settings.floorMargin);
    if (broken.length && !scheme.breachReason?.trim()) items.push({ kind: '价格', text: `${matrix.name} · ${scheme.name} · ${broken.join('/')}课时低于毛利底线，需填原因`, due: '', href: '#/marketing/prices', urgent: true });
  }
  const open = timeline.anomalies.filter(a => !a.ruling).length; // 已人工裁定的不再算待确认
  if (open) items.push({ kind: '时间线', text: `${open} 条异常待确认`, due: '', href: '#/user/timeline/anomalies' });
  const draft = needs.needs.filter(n => n.status === '草稿').length, review = needs.needs.filter(n => n.status === '待复核').length;
  if (draft || review) items.push({ kind: '需求', text: [draft && `${draft} 条主线需求草稿待采纳`, review && `${review} 条已采纳需求待复核`].filter(Boolean).join('；'), due: '', href: '#/user/strategy' });
  for (const item of personal.filter(x => !x.done)) items.push({ kind: '待办', text: item.title || item.text, due: item.due || '', href: '#/home' });
  return items;
}

export function createTodoReader(db, { timeline, needs, projects, now = Date.now }) {
  return async (month) => {
    const today = beijingText(now()).slice(0, 10);
    month ||= new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 7);
    requireMonth(month);
    const [tl, ns, ps] = await Promise.all([timeline(), needs.list(month), projects.list()]);
    return todoView({ timeline: tl, needs: ns, projects: ps, campaign: getRecord(db, 'campaign', 'current'), matrices: availablePriceMatrices(db), settings: priceSettings(db), personal: listRecords(db, 'selftalk-todo') }, now());
  };
}
