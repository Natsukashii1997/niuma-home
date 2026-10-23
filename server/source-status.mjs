import { getSettings } from './db.mjs';
import { beijingText } from './v3-common.mjs';
import { reportDocumentUrl } from './reports.mjs';
import { timelineIdentity } from './timeline.mjs';

export function reportIdentity(value) {
  try { return reportDocumentUrl(value); } catch { return value || ''; }
}

export function recordSource(db, kind, { identity = '', attemptAt = Date.now(), at, error, extra = {} }) {
  const previous = db.prepare('SELECT * FROM v3_source_status WHERE kind=?').get(kind);
  if (previous && previous.attempt_at > attemptAt) return;
  const success = at || (previous?.identity === identity ? previous.success_at : null);
  const details = { ...(previous?.identity === identity ? JSON.parse(previous.extra) : {}), ...extra };
  db.prepare(`INSERT INTO v3_source_status(kind,identity,attempt_at,success_at,error,extra) VALUES(?,?,?,?,?,?)
    ON CONFLICT(kind) DO UPDATE SET identity=excluded.identity,attempt_at=excluded.attempt_at,success_at=excluded.success_at,error=excluded.error,extra=excluded.extra`)
    .run(kind, identity, attemptAt, success, error || null, JSON.stringify(details));
}

export function sourceStatus(db, { now = Date.now, implemented = ['daily', 'weekly', 'timeline', 'kb', 'nas'], voiceIdentity } = {}) {
  const settings = getSettings(db), enabled = new Set(implemented), sources = {};
  for (const kind of ['daily', 'weekly', 'timeline', 'kb', 'nas', 'voice']) {
    if (!enabled.has(kind)) { sources[kind] = { state: 'off' }; continue; }
    const row = db.prepare('SELECT * FROM v3_source_status WHERE kind=?').get(kind);
    const identity = kind === 'daily' ? reportIdentity(settings.report_doc_url) : kind === 'weekly' ? reportIdentity(settings.weekly_doc_url || settings.report_doc_url) : kind === 'timeline' ? timelineIdentity(settings) : kind === 'kb' ? settings.kb_space_id || '7620758074885835965' : kind === 'voice' ? voiceIdentity : undefined;
    if (!row || identity !== undefined && row.identity !== identity) {
      sources[kind] = { state: 'never' };
      // 接入状态记录前已成功同步的完整快照仍是可核验的成功水位。
      if (kind === 'timeline' && !row && !settings.timeline_source) {
        const saved = db.prepare('SELECT payload,updated_at FROM v3_snapshots WHERE kind=?').get(kind);
        if (saved) {
          const payload = JSON.parse(saved.payload);
          if (!payload.identity || payload.identity === identity) sources[kind] = { state: 'ok', at: beijingText(saved.updated_at) };
        }
      }
      continue;
    }
    sources[kind] = { state: row.error ? 'error' : row.success_at ? 'ok' : 'never', ...(row.success_at ? { at: beijingText(row.success_at) } : {}), ...(row.error ? { error: row.error } : {}), ...JSON.parse(row.extra) };
    if (kind === 'voice' && Number.isFinite(sources[kind].limit)) {
      const limit = Number(settings.voice_budget || 10);
      if (Number.isFinite(limit) && limit > 0 && limit <= 10) sources[kind].limit = Math.min(sources[kind].limit, limit);
    }
  }
  return { checkedAt: beijingText(now()), sources };
}
