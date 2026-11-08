import { readFileSync } from 'node:fs';
import { fingerprint } from './local-records.mjs';
import { TIMELINE_SOURCE } from './timeline.mjs';

// 官网核查结果是带来源的版本化证据。仅匹配原单元格指纹，不修改飞书快照；源文变化后自动失效。
const evidence = JSON.parse(readFileSync(new URL('./timeline-verification.json', import.meta.url), 'utf8'));
const keyOf = a => fingerprint([a.src, a.a, a.b, a.issue]).slice(0, 24);
const day = s => typeof s === 'string' && /^20\d\d-\d\d-\d\d$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0,10) === s;
export const verificationSourceId = source => fingerprint([source?.title,source?.token]);
export function applyOfficialVerifications(timeline, records = evidence, {source = TIMELINE_SOURCE} = {}) {
  const out = structuredClone(timeline), byKey = new Map(records.map(r => [r.key,r]));
  let checked = 0, confirmed = 0;
  out.anomalies = (out.anomalies || []).map(a => {
    const r = byKey.get(keyOf(a));
    if (!r || r.sourceId !== verificationSourceId(source) || r.school !== a.school || r.country !== (a.c || '') || r.src !== a.src) return a;
    checked++;
    const sources = (r.sources || []).filter(s => typeof s.url === 'string' && /^https:\/\//.test(s.url));
    const segments = r.segments || [];
    const valid = r.status === 'confirmed' && a.cell && sources.length && segments.length && segments.every(p => day(p.from) && day(p.to) && p.from <= p.to && Date.parse(p.to)-Date.parse(p.from)<=366*86400000 && a.cell.cells[p.cell ?? r.cell ?? 0]);
    const verification = {status:r.status === 'confirmed' && !valid ? 'unresolved' : r.status,checkedAt:r.checkedAt,reason:r.reason,scope:r.scope,academicYear:r.academicYear,sources};
    const sourceSet = new Set(a.cell?.cells.map(c=>c.src) || [a.src]);
    out.agenda = out.agenda.map(e => sourceSet.has(e.src) ? {...e,verification} : e);
    if (!valid) return {...a,verification};
    confirmed++;
    const replaced = new Set(a.cell.cells.map(c=>c.src));
    out.agenda = out.agenda.filter(e=>!replaced.has(e.src));
    const row = out.table[a.cell.code]?.[a.cell.row];
    for (const c of a.cell.cells) if (row && c.slot >= 0) { row.cells[c.slot]=null; if(row.cellRanges) delete row.cellRanges[c.slot]; }
    for (const p of segments) {
      const dest = a.cell.cells[p.cell ?? r.cell ?? 0];
      // segment：同一目标格内的片段位置（多段时才有），月度策略按它给片段定身份，不随日期改动漂移。
      const same = segments.filter(q => a.cell.cells[q.cell ?? r.cell ?? 0] === dest);
      out.agenda.push({from:p.from,to:p.to,c:a.cell.c,school:a.school,type:r.eventType || a.cell.type,src:dest.src,
        verified:true,verification,...((p.label || r.label) && {detail:p.label || r.label}),...(same.length > 1 && {segment:same.indexOf(p)})});
    }
    for (const dest of a.cell.cells) if (row && dest.slot >= 0) {
      const parts = segments.filter(p => a.cell.cells[p.cell ?? r.cell ?? 0] === dest);
      if (!parts.length) continue;
      row.cells[dest.slot]=[parts[0].from.slice(5),parts[0].to.slice(5),dest.src,'verified'];
      row.cellRanges ||= {};
      row.cellRanges[dest.slot]=parts.map(p=>({...p,label:p.label || r.label,src:dest.src,flag:'verified',verification}));
    }
    return {...a,verification};
  });
  out.agenda.sort((a,b)=>a.from.localeCompare(b.from)||a.src.localeCompare(b.src));
  out.verifications={checked,confirmed,unresolved:checked-confirmed,stale:records.length-checked};
  return out;
}
