import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTimeline, parseTimelineDate, REGION_SHEETS, readTimelineSheets} from '../server/timeline.mjs';
import {parseDateSegments,timelineMonthHints} from '../server/timeline-dates.mjs';
import {applyRulings,anomalyKey,createRulingService,withRulings} from '../server/timeline-rulings.mjs';
import {monthTimelineData} from '../src/modules/user/timeline-view.js';
import {openDb} from '../server/db.mjs';
import {mkdtempSync} from 'node:fs';
import path from 'node:path';
const sheet = (name, values) => ({name,cols:['A','B','C'],rows:values.map((values,i)=>({row:i+1,values}))});
const parts = raw => parseDateSegments(raw,'Final',2026,parseTimelineDate);

test('完整多段按独立窗口恢复，保留跨年原年份与间隙',()=>{
  assert.deepEqual(parts('2026.5.11-5.23&2026.6.1-6.6').map(p=>[p.from,p.to]),[['2026-05-11','2026-05-23'],['2026-06-01','2026-06-06']]);
  assert.deepEqual(parts('2025.12.15-12.19\n2026.1.12-1.16').map(p=>p.from),['2025-12-15','2026-01-12']);
  assert.equal(parts('2026.3.21~.4.26')[0].to,'2026-04-26');
  assert.equal(parts('2026.4.28-4.30\n2026.5.2,5.4-5.9,5.11').length,4);
  assert.equal(parts('6.5、6.8-6.11').length,2);
});

test('条件继承不升级为本科确定节点，不吞掉仍未知的分段',()=>{
  const p=parts('T2: 2026.3.9-2026.3.20\nT3：2026.4.27-5.8；2026.5.11-5.15');
  assert.deepEqual(p.map(p=>p.label),['T2','T3','T3']);assert.ok(p.every(p=>p.flag==='guess'));
  assert.equal(parts('11.18（去年）')[0].from,undefined);
  assert.equal(parts('7.1-7.5\n日期未定')[0].from,undefined);
  assert.equal(parts('12.19-1.10')[0].from,undefined);
  assert.equal(parts('2026.4.25-2025.5.9')[0].from,undefined);
  assert.equal(parts('（7.3出补考时间）\n7.7-7.10')[0].from,'2026-07-07');
});

test('月提示不从网址提日期，保留明确年份，历史月不改成今年日期',()=>{
  assert.deepEqual(timelineMonthHints('11.18（去年）'),['*-11']);
  assert.deepEqual(timelineMonthHints('2027年2月（推测）'),['2027-02']);
  assert.deepEqual(timelineMonthHints('未公开 https://example.edu/2026/11/18'),[]);
  assert.deepEqual(timelineMonthHints('2026年12月中旬至2027年1月上旬'),['2026-12','2027-01']);
  assert.ok(timelineMonthHints('11.17-2.8').includes('*-01'));
});

test('英国去年节点可在当月待确认找到，全年与当月不同；月历学校不捏造排期',()=>{
  const t=parseTimeline([
    sheet(REGION_SHEETS[1],[['英国','Withdraw 截止','Final'],['卡迪夫大学','2026.11.23',''],['曼彻斯特大学','11.18（去年）','']]),
    sheet('11月',[['11月时间线'],['说明'],['MON'],['11月18日'],['曼彻斯特大学\nWithdraw截止（去年）'],['PSU开学']]),
  ],'now');
  const m=monthTimelineData(t,'2026-11','英国');assert.deepEqual(m.count('英国'),{dated:1,pending:1,total:2});
  assert.equal(m.pending[0].school,'曼彻斯特大学');assert.equal(m.calendar.length,1);assert.equal(t.calendarEntries.length,2);
  assert.equal(t.calendarEntries.find(e=>e.raw==='PSU开学').schools.length,0);
  assert.equal(t.agenda.length,1);assert.equal(monthTimelineData(t,'2026-12','英国').count('英国').total,2);
});

test('相同来源多个窗口人工裁定按整格替换，排除后不残留旧事件或明细',()=>{
  const t=parseTimeline([sheet(REGION_SHEETS[1],[['英国','Final'],['学校','T2:2026.3.9-3.20\nT3:2026.4.27-5.8；2026.5.11-5.15']])],'now');
  assert.equal(t.agenda.length,3);assert.equal(t.table.UK[0].cellRanges[0].length,3);
  const a=t.anomalies[0], key=anomalyKey(a);
  const excluded=applyRulings(t,[{key,decision:'exclude',cell:0}]);assert.equal(excluded.agenda.length,0);assert.equal(excluded.table.UK[0].cells[0],null);assert.equal(excluded.table.UK[0].cellRanges[0],undefined);
  const adopted=applyRulings(t,[{key,decision:'adopt',cell:0,from:a.cell.cells[0].from,to:a.cell.cells[0].to,segments:a.cell.cells[0].segments}]);assert.equal(adopted.agenda.length,3);assert.ok(adopted.agenda.every(e=>e.ruled));assert.equal(adopted.agenda[2].detail,'T3');
  const manual=applyRulings(t,[{key,decision:'manual',cell:0,from:'2026-05-01',to:'2026-05-03'}]);assert.equal(manual.agenda.length,1);assert.equal(manual.agenda[0].from,'2026-05-01');assert.equal(manual.table.UK[0].cellRanges[0],undefined);
});

test('少一张月历不能伪装完整同步',async()=>{
  const info={title:'2026海外大学时间线',revision:1,sheets:REGION_SHEETS.map((sheet_name,i)=>({sheet_name,sheet_id:`s${i}`,resource_type:'sheet',is_hidden:false,row_count:1,column_count:1}))};
  await assert.rejects(readTimelineSheets({run:async()=>({stdout:JSON.stringify({ok:true,identity:'user',data:info})})}),/月历/);
});


test('条件日期采用经过预览确认回读后仍保留单段/多段适用范围',async t=>{
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const db=openDb(mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'timeline-rulings-')));t.after(()=>db.close());
  const source=parseTimeline([sheet(REGION_SHEETS[1],[['英国','Final'],['单段学校','研究生：2026.11.1-11.3'],['多段学校','T2:2026.3.9-3.20\nT3:2026.4.27-5.8；2026.5.11-5.15']])],'now');
  const service=createRulingService(db,async()=>source);
  for(const a of source.anomalies){const preview=await service.preview(anomalyKey(a),{decision:'adopt'});assert.ok(preview.value.segments.length);await service.confirm({previewId:preview.previewId,confirm:true});}
  const out=withRulings(db,source);assert.equal(out.agenda.length,4);assert.equal(out.agenda.find(e=>e.school==='单段学校').detail,'研究生');assert.equal(out.agenda.find(e=>e.from==='2026-05-11').detail,'T3');assert.ok(out.agenda.every(e=>e.ruled));
});
