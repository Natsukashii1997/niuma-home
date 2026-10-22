import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { saveSnapshot } from '../server/v3-common.mjs';
import { getRecord, putRecord } from '../server/local-records.mjs';
import { parseTimeline, REGION_SHEETS, TIMELINE_SOURCE } from '../server/timeline.mjs';
import { anomalyKey, RULING_KIND } from '../server/timeline-rulings.mjs';
import { createUserStrategyService, readInsight, USER_STRATEGY_KIND } from '../server/user-strategy.mjs';
import { authoredStrategyRecord } from '../src/modules/user/strategy-record.js';

const now = Date.parse('2026-10-22T10:00:00+08:00');
const identity = JSON.stringify(TIMELINE_SOURCE);
const event = (from, extras = {}) => ({ c:'英国', school:'合成大学', type:'Final', from, to:from, src:'英国!B2', ...extras });
const timeline = (agenda, syncedAt = '2026-10-22 10:00') => ({ agenda, syncedAt, anomalies:[], table:{} });
function fixture(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'strategy-facts-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir,{recursive:true,force:true}); });
  const svc = createUserStrategyService(db, { now: () => now });
  const sync = value => saveSnapshot(db,'timeline',{identity,value},new Date(now).toISOString());
  const confirm = preview => svc.confirm('2026-11',{previewId:preview.previewId,confirm:true});
  return {db,svc,sync,confirm};
}

test('时间线同步后客观日期、节点数和推测清单随之更新，人工正文与已生成策略保持原样', t => {
  const {db,svc,sync,confirm} = fixture(t);
  confirm(svc.previewGenerate({month:'2026-11'}));
  confirm(svc.previewEdit('2026-11',{path:'summary.judgement',lines:['我确认的判断，不允许自动覆盖']}));
  const stored = getRecord(db,USER_STRATEGY_KIND,'2026-11');
  sync(timeline([event('2026-11-18'),event('2026-12-14',{flag:'guess',src:'英国!B3'}),event('2026-12-15',{src:'英国!B4'})]));
  const read = svc.get('2026-11');
  assert.equal(read.overview.counts.uk,2,'本月和下月前14天，不能误算整个下月');
  assert.deepEqual(read.overview.lanes[0][2].map(bar=>bar.slice(0,2)),[['2026-11-18','2026-11-18'],['2026-12-14','2026-12-14']]);
  assert.deepEqual(read.appendix.guesses,['英国 · 合成大学 · Final 12-14']);
  assert.equal(read.timelineEvidence.status,'changed');
  assert.equal(read.timelineSyncedAt,'2026-10-22 10:00');
  assert.deepEqual(authoredStrategyRecord(read),authoredStrategyRecord(stored));
  assert.deepEqual(getRecord(db,USER_STRATEGY_KIND,'2026-11'),stored,'读取不改原记录和原依据');
  const preview = svc.previewEdit('2026-11',{path:'summary.judgement',lines:['继续人工修改']});
  const saved = confirm(preview);
  assert.deepEqual(authoredStrategyRecord(svc.get('2026-11')),authoredStrategyRecord(saved));
  assert.equal(svc.get('2026-11').timelineEvidence.status,'changed','改一段正文不能静默消除来源变化提示');
});

test('人工裁定生效于策略客观依据；去年月日不被自动纳入确定排期', t => {
  const {db,svc,sync} = fixture(t);
  const raw = parseTimeline([{name:REGION_SHEETS[1],cols:['A','B'],rows:[{row:1,values:['英国','Final']},{row:2,values:['测试大学','11.18（去年）']}]}],'2026-10-22 10:00');
  sync(raw);
  assert.equal(svc.get('2026-11').overview.counts.uk,0);
  const a = raw.anomalies.find(a=>a.cell), key = anomalyKey(a);
  putRecord(db,RULING_KIND,key,{key,decision:'manual',cell:0,from:'2026-11-20',to:'2026-11-21'},now);
  const read = svc.get('2026-11');
  assert.equal(read.overview.counts.uk,1);
  assert.deepEqual(read.overview.lanes[0][2][0].slice(0,2),['2026-11-20','2026-11-21']);
  assert.deepEqual(read.appendix.guesses,[]);
  assert.equal(raw.agenda.length,0,'保留原快照');
});

test('不存在完整快照或已切换来源时保留原数据并提示，不借用旧来源', t => {
  const {db,svc,sync} = fixture(t);
  assert.equal(svc.get('2026-11').timelineEvidence.status,'unavailable');
  sync(timeline([event('2026-11-18')]));
  saveSetting(db,'timeline_source',JSON.stringify({...TIMELINE_SOURCE,token:'another-source'}));
  const read = svc.get('2026-11');
  assert.equal(read.timelineEvidence.status,'unavailable');
  assert.deepEqual(read.overview.counts,readInsight('2026-11').overview.counts);
});

test('同样内容重同步不改变语义指纹；预览后日期变动须重新核对，但人工正文不丢失', t => {
  const {db,svc,sync,confirm} = fixture(t);
  const events = [event('2026-11-18')];
  sync(timeline(events));
  const first = svc.get('2026-11').timelineEvidence.fingerprint;
  const preview = svc.previewEdit('2026-11',{path:'summary.judgement',lines:['人工判断']});
  sync(timeline(events,'2026-10-22 11:00'));
  assert.equal(svc.get('2026-11').timelineEvidence.fingerprint,first);
  confirm(preview);
  const stale = svc.previewGenerate({month:'2026-11'});
  sync(timeline([event('2026-11-19')],'2026-10-22 12:00'));
  assert.throws(()=>confirm(stale),e=>e.status===409 && /时间线依据/.test(e.message));
  assert.equal(getRecord(db,USER_STRATEGY_KIND,'2026-11').summary.judgement,'人工判断');
});
