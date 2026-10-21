import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTimeline, REGION_SHEETS, TIMELINE_SOURCE} from '../server/timeline.mjs';
import {anomalyKey,applyRulings} from '../server/timeline-rulings.mjs';
import {applyOfficialVerifications,verificationSourceId} from '../server/timeline-verification.mjs';
import {monthTimelineData} from '../src/modules/user/timeline-view.js';
const source = () => parseTimeline([{name:REGION_SHEETS[1],cols:['A','B'],rows:[{row:1,values:['英国','Final']},{row:2,values:['测试大学','11.18（去年）']}]}],'now');
const evidence = a => ({school:a.school,country:a.c||'',src:a.src,sourceId:verificationSourceId(TIMELINE_SOURCE),key:anomalyKey(a),status:'confirmed',checkedAt:'2026-10-21',reason:'2026/27官网考试安排',sources:[{url:'https://university.ac.uk/calendar',title:'Academic calendar 2026/27'}],segments:[{from:'2026-12-07',to:'2026-12-18',label:'普通本科课程'}]});

test('官网日期保留原文，按指纹覆盖历史日期；人工裁定仍有优先权',()=>{
  const raw=source(),review=evidence(raw.anomalies[0]);
  const t=applyOfficialVerifications(raw,[review]);
  assert.equal(raw.agenda.length,0);assert.equal(t.agenda[0].from,'2026-12-07');assert.equal(t.agenda[0].detail,'普通本科课程');
  assert.equal(t.agenda[0].verified,true);assert.equal(t.anomalies[0].a,'11.18（去年）');assert.equal(t.table.UK[0].cellRanges[0][0].flag,'verified');
  assert.equal(monthTimelineData(t,'2026-11','英国').list.length,0);
  assert.equal(monthTimelineData(t,'2026-12','英国').list.length,1);
  const user=applyRulings(t,[{key:review.key,decision:'manual',cell:0,from:'2026-12-08',to:'2026-12-08'}]);
  assert.equal(user.agenda.length,1);assert.equal(user.agenda[0].from,'2026-12-08');assert.equal(user.agenda[0].verified,undefined);
  raw.anomalies[0].a='原表已更新';const changed=applyOfficialVerifications(raw,[review]);
  assert.equal(changed.verifications.stale,1);assert.equal(changed.agenda.length,0);
});

test('无官网来源或非法日期不升级；未确认原文混入普通展示清单但不写入排期数据',()=>{
  const raw=source(),r=evidence(raw.anomalies[0]);
  for(const patch of [{sources:[]},{segments:[{from:'2026-02-30',to:'2026-03-01'}]},{status:'unresolved'}]) {
    const t=applyOfficialVerifications(raw,[{...r,...patch}]);assert.equal(t.agenda.length,0);assert.equal(t.verifications.confirmed,0);
    const m=monthTimelineData(t,'2026-11','英国');assert.equal(m.list.length,1);assert.equal(m.list[0].pending,true);assert.equal(m.list[0].from,null);assert.equal(m.list[0].raw,'11.18（去年）');
  }
});

test('官网多时段保持间隙、跨年和不同人群，不合并为全校连续窗口',()=>{
  const raw=source(),r=evidence(raw.anomalies[0]);
  r.segments=[{from:'2026-12-07',to:'2026-12-18',label:'毕业班'},{from:'2027-01-04',to:'2027-01-08',label:'其他本科'}];
  const t=applyOfficialVerifications(raw,[r]);assert.equal(t.agenda.length,2);assert.equal(t.agenda[1].detail,'其他本科');
  assert.equal(t.table.UK[0].cellRanges[0].length,2);assert.equal(monthTimelineData(t,'2027-01','英国').list.length,1);
});


test('不同来源格的官网分段各自回填，错误证据不会给既有推测事件标确认',()=>{
  const raw=source(), a=raw.anomalies[0];
  a.cell.cells.push({...a.cell.cells[0],src:'英国 爱尔兰!C2',slot:1});raw.table.UK[0].cells.push(null);
  const r=evidence(a);r.segments=[{from:'2026-05-04',to:'2026-05-04',label:'上学年T3',cell:0},{from:'2026-08-31',to:'2026-08-31',label:'新学年T1',cell:1}];
  const t=applyOfficialVerifications(raw,[r]);assert.equal(t.agenda[1].src,'英国 爱尔兰!C2');assert.equal(t.table.UK[0].cellRanges[1][0].label,'新学年T1');
  raw.agenda=[{from:'2026-11-18',to:'2026-11-18',src:a.cell.cells[0].src,c:'英国',school:a.school,type:'Final',flag:'guess'}];
  const bad=applyOfficialVerifications(raw,[{...r,sources:[]}]);assert.equal(bad.agenda[0].verification.status,'unresolved');assert.equal(bad.anomalies[0].verification.status,'unresolved');
  assert.equal(monthTimelineData(bad,'2026-11','英国').count('英国').pending,1);
});

test('官网证据绑定学校、国家和原始表格，改名或换表后失效',()=>{
 const raw=source(), r=evidence(raw.anomalies[0]);
 for(const field of ['school','c']){const changed=structuredClone(raw);changed.anomalies[0][field]='别的对象';assert.equal(applyOfficialVerifications(changed,[r]).verifications.confirmed,0);}
 assert.equal(applyOfficialVerifications(raw,[r],{source:{...TIMELINE_SOURCE,token:'other'}}).verifications.confirmed,0);
});
