import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { openDb, saveSetting } from '../server/db.mjs';
import { voiceView, createVoiceReader } from '../server/voice.mjs';
import { sourceStatus } from '../server/source-status.mjs';
import { match } from '../server/http.mjs';
import { routes } from '../server/routes/workspace.mjs';

const now=Date.parse('2026-10-16T14:00:00+08:00');
const sample=()=>({schemaVersion:1,engine:{commit:'c8704e5313e6b051560365226b3919d7e0ada5ea',modelCallsEnabled:false,paidCollectorsEnabled:false,schedulesEnabled:false},checkedAt:new Date(now).toISOString(),checks:{paidRequests:0,modelRequests:0,sourceReads:{attempted:3,successful:3,complete:true,errors:[]}},budget:{used:0,limit:10},data:{updatedAt:'2026-10-16 14:00',nextAt:null,stats:{topics:0,newTopics:0,surge:0,participants:0,filtered:0,sourceCount:0,sources:''},hot:[],cloud:[],daily:''}});
// 仅为验证契约的合成证据；不是实际采集或真实来源验收。
function qualifiedSample() {
  const value=sample(),participants=['author-a','author-b','author-c','author-d','author-e'];
  value.data.hot=[{id:'topic',title:'合成讨论标题',summary:'合成原始摘要',tags:['澳洲'],kind:'Final',need:'',participantIds:participants,part:5,heat:20,trend:'up',spark:[1,2,3,4,6,8,20],sparkDates:['2026-10-10','2026-10-11','2026-10-12','2026-10-13','2026-10-14','2026-10-15','2026-10-16'],sources:[['合成讨论原文','合成来源']],evidence:participants.map((participantId,i)=>({participantId,url:`https://student-community.invalid/posts/${i}`,publishedAt:'2026-10-16T10:00:00+08:00',sourceType:'student-discussion'}))}];
  value.data.stats={...value.data.stats,topics:1,participants:5,sourceCount:5,sources:'合成来源'};
  return value;
}
function database(t){assert.ok(process.env.WORKDESK_DATA_DIR);const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'voice-')),db=openDb(dir);t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});return{db,dir};}
async function invoke(all, endpoint) {
  const url=new URL(endpoint,'http://127.0.0.1'),found=match(all,'GET',url.pathname);assert.ok(found);
  let status,text;const req=Readable.from([]),res={setHeader(){},writeHead(code){status=code;},end(value){text=value;}};
  req.method='GET';req.url=endpoint;await found.handler(req,res,{params:found.params,url});return{status,body:JSON.parse(text)};
}
test('Voice关闭模型/付费采集/调度且费用确有证据才允许免费试运行读取',()=>{
  assert.equal(voiceView(sample(),now).empty,true);
  for(const key of ['modelCallsEnabled','paidCollectorsEnabled','schedulesEnabled']){const value=sample();value.engine[key]=true;assert.throws(()=>voiceView(value,now),e=>e.code==='VOICE_TRIAL_UNVERIFIED');}
  const unknown=sample();unknown.checks.modelRequests=null;assert.throws(()=>voiceView(unknown,now),e=>e.code==='VOICE_BUDGET_UNVERIFIED');
  const paid=sample();paid.budget.used=1;assert.throws(()=>voiceView(paid,now));
  assert.throws(()=>voiceView(sample(),now+49*3600000),e=>e.code==='VOICE_SNAPSHOT_STALE');
});
test('Voice全部或部分来源失败、读取完整性未知时均不能当业务成功或空榜',()=>{
  const cases=[undefined,{attempted:0,successful:0,complete:true,errors:[]},{attempted:3,successful:0,complete:false,errors:[]},{attempted:3,successful:2,complete:false,errors:[]},{attempted:3,successful:3,complete:false,errors:[]},{attempted:3,successful:3,complete:true,errors:[{source:'合成来源',url:'https://student-community.invalid/private',reason:'敏感原始错误标记'}]},{attempted:3,successful:3,complete:true},{attempted:0.5,successful:0.5,complete:true,errors:[]}];
  for(const fixture of [sample,qualifiedSample])for(const sourceReads of cases){const value=fixture();value.checks.sourceReads=sourceReads;assert.throws(()=>voiceView(value,now),e=>e.status===503&&e.code==='VOICE_SOURCE_UNAVAILABLE'&&!e.message.includes('敏感原始错误标记'));}
});
test('Voice采集失败通过路由返回概括错误，状态记error且不推进成功水位',async t=>{
  const{db,dir}=database(t),file=path.join(dir,'source-failure.json');let clock=now;
  const broken=sample();broken.checks.sourceReads={attempted:3,successful:0,complete:false,errors:[{source:'合成来源',url:'https://student-community.invalid/private',reason:'敏感原始错误标记'}]};
  writeFileSync(file,JSON.stringify(broken));const all=routes(db,undefined,undefined,{voice:{snapshotPath:file,now:()=>clock}});
  const failed=await invoke(all,'/api/v3/voice');assert.equal(failed.status,503);assert.equal(failed.body.code,'VOICE_SOURCE_UNAVAILABLE');assert.ok(!JSON.stringify(failed.body).includes('敏感原始错误标记'));
  const state=()=>sourceStatus(db,{implemented:['voice'],voiceIdentity:file}).sources.voice;
  assert.equal(state().state,'error');assert.equal(state().at,undefined);assert.ok(!state().error.includes('敏感原始错误标记'));
  writeFileSync(file,JSON.stringify(sample()));const empty=await invoke(all,'/api/v3/voice');assert.equal(empty.status,200);assert.deepEqual([empty.body.empty,empty.body.hot.length],[true,0]);assert.equal(state().state,'ok');
  clock+=60000;broken.checkedAt=new Date(clock).toISOString();broken.data.updatedAt='2026-10-16 14:01';broken.checks.sourceReads.successful=2;writeFileSync(file,JSON.stringify(broken));
  assert.equal((await invoke(all,'/api/v3/voice')).body.code,'VOICE_SOURCE_UNAVAILABLE');assert.equal(state().state,'error');assert.equal(state().at,'2026-10-16 14:00');
});
test('Voice空榜明确未达标，不返回假示例；成功读取状态与费用独立持久化，失败保留水位',async t=>{
  const{db,dir}=database(t),file=path.join(dir,'voice.json');writeFileSync(file,JSON.stringify(sample()));
  const read=createVoiceReader(db,{snapshotPath:file,now:()=>now});
  const empty=await read();assert.deepEqual([empty.empty,empty.hot,empty.cloud],[true,[],[]]);assert.match(empty.note,/没有达到5个独立来源/);
  const state=()=>sourceStatus(db,{implemented:['voice'],voiceIdentity:file}).sources.voice;
  assert.deepEqual(state(),{state:'ok',at:'2026-10-16 14:00',used:0,limit:10});
  writeFileSync(file,'broken');await assert.rejects(read(),e=>e.code==='VOICE_EXPORT_UNAVAILABLE');assert.equal(state().state,'error');assert.equal(state().at,'2026-10-16 14:00');assert.equal(state().used,0);
  assert.equal(sourceStatus(db,{implemented:['voice'],voiceIdentity:file+'different'}).sources.voice.state,'never');
});
test('Voice合成证据必须绑定五个独立作者、学生讨论HTTPS原文与48小时内发布时间',()=>{
  const output=voiceView(qualifiedSample(),now).value.hot[0];
  assert.equal(output.participantIds,undefined);assert.equal(output.evidence,undefined);assert.equal(output.sparkDates.length,7);
  const cases=[
    hot=>{delete hot.evidence;},hot=>{hot.evidence=[];},
    hot=>{hot.participantIds[4]=hot.participantIds[0];},
    hot=>{hot.evidence.pop();},hot=>{hot.evidence[4].participantId='other-author';},
    hot=>{hot.evidence[0].sourceType='news';},hot=>{hot.evidence[0].url='http://student-community.invalid/posts/0';},
    hot=>{hot.evidence[0].url='https://student-community.invalid/';},
    hot=>{hot.evidence[4].url=hot.evidence[0].url;},
    hot=>{hot.evidence[0].publishedAt='2026-10-14T13:59:59+08:00';},
    hot=>{hot.evidence[0].publishedAt='2026-10-16T14:00:01+08:00';},
    hot=>{hot.evidence[0].publishedAt='2026-10-16T10:00:00';}
  ];
  for(const change of cases){const value=qualifiedSample();change(value.data.hot[0]);assert.throws(()=>voiceView(value,now),e=>e.status===503&&e.code==='VOICE_INDEPENDENCE_PENDING');}
});
test('Voice七天值必须对应更新日前七个连续真实日期；数据更新时间不能空缺或陈旧',()=>{
  for(const change of [hot=>{delete hot.sparkDates;},hot=>{hot.spark=[null,null,1];},hot=>{hot.sparkDates[1]='2026-10-10';},hot=>{hot.sparkDates[0]='2026-02-30';},hot=>{hot.sparkDates[6]='2026-10-17';}]){
    const value=qualifiedSample();change(value.data.hot[0]);assert.throws(()=>voiceView(value,now),e=>e.code==='VOICE_HISTORY_PENDING');
  }
  for(const updatedAt of [undefined,0,'','2026-02-30 14:00','2026-10-14 13:59','2026-10-16 14:01']){
    const value=sample();value.data.updatedAt=updatedAt;assert.throws(()=>voiceView(value,now),e=>e.code==='VOICE_SNAPSHOT_STALE');
  }
  for(const change of [hot=>{hot.title='';},hot=>{hot.sources=[];}]){const value=qualifiedSample();change(value.data.hot[0]);assert.throws(()=>voiceView(value,now),e=>e.code==='VOICE_EXPORT_INCOMPLETE');}
});
test('Voice本机预算低于导出上限时返回和状态均采用较低值，未知预算仍拒绝',async t=>{
  const{db,dir}=database(t),file=path.join(dir,'export.json');writeFileSync(file,JSON.stringify(qualifiedSample()));saveSetting(db,'voice_budget','5');
  const read=createVoiceReader(db,{snapshotPath:file,now:()=>now});assert.deepEqual((await read()).budget,{used:0,limit:5});
  assert.equal(sourceStatus(db,{implemented:['voice'],voiceIdentity:file}).sources.voice.limit,5);
  const lower=qualifiedSample();lower.budget.limit=3;writeFileSync(file,JSON.stringify(lower));assert.equal((await read()).budget.limit,3);
  saveSetting(db,'voice_budget','unknown');await assert.rejects(read(),e=>e.code==='VOICE_BUDGET_UNVERIFIED');
});
test('GET /api/v3/voice 未配置明确返回503/code，成功仅暴露公开数据形状',async t=>{
  const{db,dir}=database(t),all=routes(db,undefined,undefined,{voice:{snapshotPath:'',now:()=>now}});
  const missing=await invoke(all,'/api/v3/voice');assert.equal(missing.status,503);assert.equal(missing.body.code,'VOICE_NOT_CONFIGURED');
  const file=path.join(dir,'export.json');writeFileSync(file,JSON.stringify(qualifiedSample()));saveSetting(db,'voice_budget','5');
  const response=await invoke(routes(db,undefined,undefined,{voice:{snapshotPath:file,now:()=>now}}),'/api/v3/voice');
  assert.equal(response.status,200);assert.equal(response.body.budget.limit,5);assert.equal(response.body.hot[0].participantIds,undefined);assert.equal(response.body.hot[0].evidence,undefined);assert.equal(response.body.hot[0].sparkDates.length,7);
});
test('Voice无配置不访问文件，不跟随符号链接读取；状态接口不读取已删导出文件',async t=>{
  const{db,dir}=database(t);await assert.rejects(createVoiceReader(db,{snapshotPath:''})(),e=>e.code==='VOICE_NOT_CONFIGURED');
  const target=path.join(dir,'export.json'),link=path.join(dir,'symlink.json');writeFileSync(target,JSON.stringify(sample()));symlinkSync(target,link);
  await assert.rejects(createVoiceReader(db,{snapshotPath:link,now:()=>now})(),e=>e.code==='VOICE_EXPORT_UNAVAILABLE');
  rmSync(target);assert.equal(sourceStatus(db,{implemented:['voice'],voiceIdentity:link}).sources.voice.state,'error');
});
