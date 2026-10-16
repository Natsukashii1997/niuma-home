import fs from 'node:fs';
import path from 'node:path';
import { failure, beijingText } from './v3-common.mjs';
import { recordSource } from './source-status.mjs';
import { getSettings } from './db.mjs';

const fail = (status, code, message) => Object.assign(failure(status, message), { code });
const numeric = value => Number.isFinite(value) && value >= 0;
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const modes = new Set(['surge','rising','up','flat','down']);
const dayMs = 24 * 3600000;
function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,10) === value ? parsed : NaN;
}
function instant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(calendarDay(value.slice(0,10)))) return NaN;
  return Date.parse(value);
}
function originalUrl(value) {
  if (!nonempty(value) || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && url.pathname !== '/' ? url.href : null;
  } catch { return null; }
}
export function voiceView(snapshot, now = Date.now()) {
  if (snapshot?.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(snapshot.engine?.commit || '') || ['modelCallsEnabled','paidCollectorsEnabled','schedulesEnabled'].some(k => snapshot.engine[k] !== false)) throw fail(503,'VOICE_TRIAL_UNVERIFIED','留学之声试运行配置未通过免费、无调度核验');
  const checked = instant(snapshot.checkedAt);
  if (!Number.isFinite(checked) || checked > now + 300000 || now - checked > 48 * 3600000) throw fail(503,'VOICE_SNAPSHOT_STALE','留学之声试运行记录已过期，请人工重新采集');
  if (snapshot.budget?.used !== 0 || !numeric(snapshot.budget.limit) || snapshot.budget.limit > 10 || snapshot.budget.limit <= 0 || snapshot.checks?.paidRequests !== 0 || snapshot.checks?.modelRequests !== 0) throw fail(503,'VOICE_BUDGET_UNVERIFIED','尚未核对本月模型和付费请求，不能把未知费用记为零');
  const sourceReads = snapshot.checks.sourceReads;
  if (!sourceReads || !Number.isInteger(sourceReads.attempted) || sourceReads.attempted <= 0 || sourceReads.successful !== sourceReads.attempted || sourceReads.complete !== true || !Array.isArray(sourceReads.errors) || sourceReads.errors.length) throw fail(503,'VOICE_SOURCE_UNAVAILABLE','学生讨论来源尚未全部读取成功，请稍后重新采集；当前不能判断是否有合格话题');
  const data = snapshot.data;
  if (!data || !Array.isArray(data.hot) || !Array.isArray(data.cloud) || typeof data.daily !== 'string') throw fail(502,'VOICE_EXPORT_INCOMPLETE','留学之声导出数据不完整');
  const updated = typeof data.updatedAt === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(data.updatedAt) ? Date.parse(`${data.updatedAt.replace(' ','T')}:00+08:00`) : NaN;
  if (!Number.isFinite(updated) || beijingText(updated) !== data.updatedAt || updated > checked || updated > now || now - updated > 48 * 3600000) throw fail(503,'VOICE_SNAPSHOT_STALE','留学之声数据更新时间缺失或已过期，请人工重新采集');
  // 合法空榜：来源都读到了，只是没有达到门槛的话题。返回 200 + 空列表，页面写明「现在没有合格的话题」。
  if (!data.hot.length) return { empty: true, checkedAt: snapshot.checkedAt, budget: snapshot.budget, value: { updatedAt: data.updatedAt, nextAt: null, stats: null, budget: snapshot.budget, hot: [], cloud: [], daily: null, empty: true, note: '免费试运行已读取：当前还没有达到5个独立来源、并完成热度核验的留学话题' } };
  for (const key of ['topics','newTopics','surge','participants','filtered','sourceCount']) if (!numeric(data.stats?.[key])) throw fail(503,'VOICE_METRICS_PENDING','留学之声统计证据尚不完整');
  if (data.stats.topics !== data.hot.length || typeof data.stats.sources !== 'string') throw fail(502,'VOICE_EXPORT_INCOMPLETE','话题数量或来源统计不一致');
  const ids = new Set();
  for (const hot of data.hot) {
    if (!hot || !nonempty(hot.id) || ids.has(hot.id) || !nonempty(hot.title) || !nonempty(hot.summary) || !Array.isArray(hot.tags) || !hot.tags.every(nonempty) || !nonempty(hot.kind) || typeof hot.need !== 'string') throw fail(502,'VOICE_EXPORT_INCOMPLETE','留学话题字段不完整');
    ids.add(hot.id);
    const participants = hot.participantIds;
    if (!Array.isArray(participants) || !participants.every(nonempty) || new Set(participants).size < 5 || participants.length !== new Set(participants).size || hot.part !== participants.length) throw fail(503,'VOICE_INDEPENDENCE_PENDING','话题尚无至少5个独立来源的核验证据');
    // participantId 是采集端归一后的作者身份；每个身份必须绑定可核查的原文和时间。
    const authors = new Set(), originals = new Map();
    if (!Array.isArray(hot.evidence) || !hot.evidence.length) throw fail(503,'VOICE_INDEPENDENCE_PENDING','话题缺少独立参与者的原文证据');
    for (const evidence of hot.evidence) {
      const url = originalUrl(evidence?.url), published = instant(evidence?.publishedAt);
      if (!nonempty(evidence?.participantId) || evidence.sourceType !== 'student-discussion' || !url || !Number.isFinite(published) || published > Math.min(now,checked) || now - published > 48 * 3600000 || !participants.includes(evidence.participantId) || originals.has(url) && originals.get(url) !== evidence.participantId) throw fail(503,'VOICE_INDEPENDENCE_PENDING','话题须提供48小时内、按独立作者归一的学生讨论原文');
      authors.add(evidence.participantId); originals.set(url,evidence.participantId);
    }
    if (authors.size !== participants.length) throw fail(503,'VOICE_INDEPENDENCE_PENDING','参与者计数与原文证据不一致');
    if (!numeric(hot.heat) || hot.heat > 100 || !modes.has(hot.trend) || !Array.isArray(hot.spark) || hot.spark.length !== 7 || !hot.spark.every(n=>numeric(n)&&n<=100)) throw fail(503,'VOICE_HISTORY_PENDING','话题热度或七天历史不足，不能补造趋势');
    const lastDay = calendarDay(data.updatedAt.slice(0,10));
    if (!Array.isArray(hot.sparkDates) || hot.sparkDates.length !== 7 || hot.sparkDates.some((date,i)=>calendarDay(date) !== lastDay - (6-i)*dayMs)) throw fail(503,'VOICE_HISTORY_PENDING','七天趋势须附上截至数据更新日的连续真实日期');
    if (!Array.isArray(hot.sources) || !hot.sources.length || !hot.sources.every(s=>Array.isArray(s)&&s.length===2&&s.every(nonempty))) throw fail(502,'VOICE_EXPORT_INCOMPLETE','话题证据格式不完整');
  }
  if (!data.cloud.every(w=>Array.isArray(w)&&w.length===3&&typeof w[0]==='string'&&numeric(w[1])&&w[1]<=100&&['surge','up','flat','down'].includes(w[2]))) throw fail(502,'VOICE_EXPORT_INCOMPLETE','话题词云格式不完整');
  return { value: { updatedAt:data.updatedAt, nextAt:null, stats:data.stats, budget:snapshot.budget, hot:data.hot.map(({participantIds,evidence,...hot})=>hot), cloud:data.cloud, daily:data.daily }, checkedAt:snapshot.checkedAt, budget:snapshot.budget };
}

export function createVoiceReader(db, { now=Date.now, snapshotPath=()=>process.env.WORKDESK_VOICE_SNAPSHOT || '' } = {}) {
  const identity = () => typeof snapshotPath === 'function' ? snapshotPath() : snapshotPath;
  const read = async () => {
    const file = identity();
    if (!file) throw fail(503,'VOICE_NOT_CONFIGURED','留学之声引擎尚未完成免费试运行，请先核验真实学生讨论源');
    const attemptAt = now(); let fd, view;
    try {
      if (!path.isAbsolute(file)) throw fail(503,'VOICE_CONFIG_INVALID','留学之声导出文件须为明确的本机绝对路径');
      fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
      const stat=fs.fstatSync(fd); if (!stat.isFile() || stat.size>2*1024*1024) throw fail(502,'VOICE_EXPORT_INCOMPLETE','留学之声导出文件无效或过大');
      view=voiceView(JSON.parse(fs.readFileSync(fd,'utf8')),now());
      const configured = Number(getSettings(db).voice_budget ?? 10);
      if (!Number.isFinite(configured) || configured <= 0 || configured > 10) throw fail(503,'VOICE_BUDGET_UNVERIFIED','本机留学之声预算配置无效');
      view.budget = { ...view.budget, limit:Math.min(view.budget.limit,configured) };
      if (view.value) view.value.budget = view.budget;
      recordSource(db,'voice',{identity:file,attemptAt,at:view.checkedAt,extra:{used:view.budget.used,limit:view.budget.limit}});
    } catch(error) {
      const e=error.status?error:fail(503,'VOICE_EXPORT_UNAVAILABLE','留学之声试运行导出尚不可读，请完成一次人工采集');
      recordSource(db,'voice',{identity:file,attemptAt,error:e.message});throw e;
    } finally {if(fd!==undefined)fs.closeSync(fd);}
    return view.value; // 空榜也照实返回（hot 为空），绝不塞演示话题
  };
  read.identity=identity;return read;
}
