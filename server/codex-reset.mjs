import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beijingText, failure } from './v3-common.mjs';

const endpoint = 'https://aihot.news/api/v1/codex-resets/recent';
const stages = { announce: '预告', confirm: '确认', amend: '修正', withdraw: '撤回' };
const isTime = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function codexResetView(source, { seen = new Set(), now = Date.now() } = {}) {
  if (!Array.isArray(source?.events) || !Array.isArray(source?.activities) || source.checkedAt !== null && !isTime(source.checkedAt)) throw failure(502, 'Codex 重置来源结构不完整');
  const signals = source.activities.filter(p => p.kind === 'event_update' && stages[p.action]);
  if (signals.some(p => !p.id || !isTime(p.publishedAt) || typeof p.originalText !== 'string' || p.text !== null && typeof p.text !== 'string')) throw failure(502, 'Codex 重置帖子格式异常');
  signals.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  const latest = signals[0];
  // 已确认事件仍可能保留旧 schedule，不能把旧预告当作下一次。estimate 不作为承诺时间。
  const upcoming = source.events.filter(e => e.status === 'announced' && !e.presentation?.timeInferred && e.schedule && isTime(e.schedule.from) && isTime(e.schedule.through) && Date.parse(e.schedule.through) > now && signals.find(p => p.eventIds?.includes(e.id))?.action !== 'withdraw')
    .sort((a, b) => Date.parse(a.schedule.from) - Date.parse(b.schedule.from))[0];
  let author = '';
  try { const u = new URL(latest?.url); if (['x.com', 'twitter.com'].includes(u.hostname) && /^\/[^/]+\/status\/\d+$/.test(u.pathname)) author = u.pathname.split('/')[1]; } catch { /* 无作者时不猜 */ }
  return {
    stage: latest ? stages[latest.action] : '暂无信号',
    next: upcoming?.schedule.through ?? null,
    label: upcoming?.schedule.label || '下次重置时间未公布',
    quote: latest?.originalText || '', quoteZh: latest?.text || '', author,
    posted: latest ? beijingText(latest.publishedAt) : '', checked: source.checkedAt ? beijingText(source.checkedAt) : '尚无完整核验时间',
    // 本批只读，没有自动标已读；明确已读动作接入前，新信号保留。
    isNew: signals.some(p => !seen.has(p.id)), nextCheck: null, pushed: false,
    history: signals.slice(1).map(p => ({ stage: stages[p.action], time: beijingText(p.publishedAt), text: p.originalText })),
  };
}

async function userAgent() {
  const base = 'aihot-skill/2.0.0 (+https://aihot.news/aihot-skill/)';
  const actor = await readFile(path.join(os.homedir(), '.agents/skills/aihot/.aihot-actor-id'), 'utf8').then(s => s.trim()).catch(() => '');
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actor) ? `${base} aihot-actor/${actor}` : base;
}

export function createCodexResetReader({ fetcher = fetch, now = Date.now, seen = new Set(), ttl = 600_000 } = {}) {
  let source, etag, at = -Infinity, pending, lastError, retryAt = -Infinity;
  return async () => {
    if (pending) return pending;
    if (lastError && now() < retryAt) throw lastError;
    if (source && now() - at >= 0 && now() - at < ttl) return codexResetView(source, { seen, now: now() });
    pending = (async () => {
      try {
        const response = await fetcher(endpoint, { headers: { 'User-Agent': await userAgent(), ...(etag ? { 'If-None-Match': etag } : {}) }, signal: AbortSignal.timeout(20_000) });
        if (response.status === 304 && source) { at = now(); lastError = undefined; return codexResetView(source, { seen, now: now() }); }
        if ([429, 503].includes(response.status)) {
          const value = response.headers.get('retry-after');
          const delay = /^\d+$/.test(value || '') ? Number(value) * 1000 : Date.parse(value) - now();
          retryAt = now() + (Number.isFinite(delay) ? Math.max(60_000, delay) : 60_000);
        }
        if (!response.ok) throw failure(502, `Codex 重置数据源不可用（${response.status}）`);
        const body = await response.json();
        const view = codexResetView(body, { seen, now: now() });
        source = body; etag = response.headers.get('etag'); at = now(); lastError = undefined;
        return view;
      } catch (error) {
        // 留下成功水位以便304，但失败不得继续作为新鲜数据返回。
        at = -Infinity;
        retryAt = Math.max(retryAt, now() + 60_000);
        lastError = failure(error.status || 502, `${error.status ? error.message : 'Codex 重置数据源不可用'}${source?.checkedAt ? `；最后成功核验 ${beijingText(source.checkedAt)}` : ''}`);
        throw lastError;
      }
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}
