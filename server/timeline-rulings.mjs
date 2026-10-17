import { failure } from './v3-common.mjs';
import { createLocalChanges, fingerprint, getRecord, listRecords } from './local-records.mjs';

// 时间线异常的人工裁定：只存工作台，不改飞书原表。
// 裁定按「来源单元格 + 原文 + 问题」的指纹对应异常；飞书原格一改，指纹变了，旧裁定自动不再生效，这条重新回到待确认。
// 采用 / 手填日期的格子以无标记事件参与主线需求推导（ruled: true）；「不采用」的格子仍不参与。
export const RULING_KIND = 'timeline-ruling';
export const anomalyKey = a => fingerprint([a.src, a.a, a.b, a.issue]).slice(0, 24);
const DECISIONS = ['adopt', 'manual', 'exclude', 'clear'];
const isDay = v => typeof v === 'string' && /^20\d{2}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export function applyRulings(timeline, rulings) {
  const byKey = new Map(rulings.map(r => [r.key, r]));
  const out = structuredClone(timeline);
  let applied = 0;
  out.anomalies = (out.anomalies || []).map(a => {
    const key = anomalyKey(a), r = byKey.get(key), item = { ...a, key };
    if (!r || !a.cell) return item;
    applied++;
    item.ruling = { decision: r.decision, cell: r.cell, from: r.from, to: r.to, note: r.note, at: r.at };
    if (r.decision === 'exclude') return item;
    const target = a.cell.cells[r.cell];
    const event = { from: r.from, to: r.to, c: a.cell.c, school: a.school, type: a.cell.type, src: target.src, ruled: true };
    const i = out.agenda.findIndex(e => e.src === target.src);
    if (i >= 0) out.agenda[i] = event; else out.agenda.push(event);
    const row = out.table[a.cell.code]?.[a.cell.row];
    if (row && target.slot >= 0) row.cells[target.slot] = [r.from.slice(5), r.to.slice(5), target.src, 'ruled'];
    return item;
  });
  out.agenda.sort((a, b) => a.from.localeCompare(b.from) || a.src.localeCompare(b.src));
  out.rulings = { applied, stale: rulings.length - applied };
  return out;
}
export const withRulings = (db, timeline) => applyRulings(timeline, listRecords(db, RULING_KIND));

export function createRulingService(db, readTimeline, { now = Date.now } = {}) {
  const changes = createLocalChanges(db, { now });
  const previews = new Map();
  const find = async key => (await readTimeline()).anomalies.find(a => anomalyKey(a) === key);
  return {
    async preview(key, body) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['decision', 'cell', 'from', 'to', 'note'].includes(k))) throw failure(400, '裁定内容无效');
      const a = await find(key);
      if (!a) throw failure(404, '这条异常不在当前快照里（飞书原表可能已改），请重新同步');
      if (!a.cell) throw failure(400, '这条异常没有可裁定的日期格（校名类异常或旧快照）；校名请改飞书原表，旧快照请先同步');
      if (!DECISIONS.includes(body.decision)) throw failure(400, '请选择采用、手填日期、不采用或撤销裁定');
      const current = getRecord(db, RULING_KIND, key);
      const value = { key, src: a.src, school: a.school, issue: a.issue, decision: body.decision, cell: 0, from: '', to: '', note: '', at: new Date(now()).toISOString() };
      if (body.decision === 'clear') {
        if (!current) throw failure(400, '这条异常还没有裁定');
      } else {
        const cell = body.cell ?? 0;
        if (!Number.isInteger(cell) || !a.cell.cells[cell]) throw failure(400, '请选择要裁定的单元格');
        value.cell = cell;
        if (body.decision === 'adopt') {
          const c = a.cell.cells[cell];
          if (!c.from) throw failure(400, '这一格没有能解析的日期，请手填');
          value.from = c.from; value.to = c.to;
        }
        if (body.decision === 'manual') {
          if (!isDay(body.from) || !isDay(body.to) || body.to < body.from || Date.parse(body.to) - Date.parse(body.from) > 366 * 86400000) throw failure(400, '请填写有效的起止日期（YYYY-MM-DD），结束不早于开始，跨度不超过一年');
          value.from = body.from; value.to = body.to;
        }
        if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 500)) throw failure(400, '备注须为 500 字以内');
        value.note = (body.note || '').trim();
      }
      const preview = changes.preview(RULING_KIND, key, value, { remove: body.decision === 'clear' });
      for (const [id, p] of previews) if (p.expires <= now()) previews.delete(id);
      previews.set(preview.previewId, { key, expires: Date.parse(preview.expiresAt) });
      return { ...preview, anomaly: a };
    },
    async confirm(body) {
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '请先预览，再明确确认');
      const p = previews.get(body.previewId);
      if (!p) throw failure(409, '预览已失效，请重新预览');
      // 预览之后飞书原表变了（重新同步过）：这条异常已不是原来那条，不保存。
      if (!await find(p.key)) throw failure(409, '时间线已重新同步，这条异常已变化，请重新预览');
      return changes.confirm(RULING_KIND, p.key, body);
    },
  };
}
