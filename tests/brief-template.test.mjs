import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {openDb} from '../server/db.mjs';
import {getRecord,putRecord} from '../server/local-records.mjs';
import {createBriefService,briefXml} from '../server/briefs.mjs';
import {syncBriefMaterials} from '../server/brief-template.mjs';
import {generateBriefSuggestions} from '../server/brief-generate.mjs';
import {briefPatch,briefText} from '../src/modules/marketing/brief-edit.js';
import {canonicalXml} from '../server/feishu-xml.mjs';
const month='2026-10';
function fixture(t){
 assert.ok(process.env.WORKDESK_DATA_DIR);
 const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'brief-template-')),db=openDb(dir);
 t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 const source={month,origin:'已修改',summary:{judgement:'本月澳洲进入期末考试，香港进入期中。'},strategy:{goal:'优先支持考试准备与课程匹配'},regions:[{name:'澳洲',tier:'主战场',task:[['确认考试范围并排定复习顺序','你写的']]}]};
 const service=createBriefService(db,{strategy:{get:()=>source}});
 return{db,source,service,base:service.read(month)};
}
test('物料稳定编号联动新增改名重排删除，人工字段不丢失',t=>{
 const {base}=fixture(t);let draft=syncBriefMaterials(base,[{id:'a',name:'考前冲刺'},{id:'b',name:'用户案例'}]);
 draft.timeline[0][1]='2026-10-25';draft.items[0].blocks=[['标题','人工文案','说明']];draft.audience[0][1]='人工人群';
 draft=syncBriefMaterials(draft,[{id:'b',name:'用户案例长图'},{id:'a',name:'考前冲刺套图'}]);
 assert.deepEqual(draft.timeline[1],['考前冲刺套图','2026-10-25','','','']);assert.equal(draft.items[1].blocks[0][1],'人工文案');assert.equal(draft.audience[1][1],'人工人群');
 draft=syncBriefMaterials(draft,[]);for(const k of ['materials','audience','timeline','items'])assert.deepEqual(draft[k],[]);
});
test('内部生成使用同月策略与名称，仅补空白且不写记录，不填日期负责人框架',t=>{
 const {service,base,db}=fixture(t);const draft=syncBriefMaterials(base,[{id:'a',name:'考前冲刺套图'},{id:'b',name:'用户案例'}]);
 draft.audience[1][1]='我指定的人群';draft.timeline[0][1]='2026-10-25';
 const r=service.generate(month,{patch:briefPatch(base,draft)});
 assert.match(r.value.background.text,/澳洲进入期末考试/);assert.ok(r.value.background.goals.length>=3);assert.match(r.value.audience[0][2],/确认考试范围/);assert.equal(r.value.audience[1][1],'我指定的人群');
 for(const k of ['timeline','items','specs','owners'])assert.deepEqual(r.value[k],draft[k]);
 assert.equal(getRecord(db,'brief',month),null);const again=service.generate(month,{patch:briefPatch(base,r.value)});assert.deepEqual(again.value,r.value);
 const pv=service.preview(month,{patch:briefPatch(base,r.value)});service.confirm(month,{previewId:pv.previewId,confirm:true});assert.deepEqual(service.read(month).materials,draft.materials);
});
test('缺少或不同月策略拒绝生成，不能接受错位物料或坏表格',t=>{
 const {service,base,source}=fixture(t);source.month='2026-11';assert.throws(()=>service.generate(month,{patch:{}}),e=>e.status===409);
 const draft=syncBriefMaterials(base,[{id:'a',name:'案例'}]);draft.timeline[0][0]='不一致';assert.throws(()=>service.preview(month,{patch:briefPatch(base,draft)}),e=>e.status===400);
 draft.items=null;assert.throws(()=>service.preview(month,{patch:briefPatch(base,draft)}),e=>e.status===400);
});
test('空框架导出保留七节及每份物料三列表头，文本不能变成资源上传指令',t=>{
 const {base}=fixture(t);const draft=syncBriefMaterials(base,[{id:'a',name:'案例 <img path="@/secret"/> & 说明'},{id:'b',name:'导师介绍'}]);
 const xml=briefXml(draft);assert.equal((xml.match(/<h1>/g)||[]).length,7);assert.equal((xml.match(/<h2>/g)||[]).length,2);assert.equal((xml.match(/说明\/示例/g)||[]).length,2);assert.ok(!xml.includes('<img'));assert.match(xml,/&lt;img/);assert.doesNotThrow(()=>canonicalXml(xml));
 assert.match(briefText(draft),/涉及板块 \| 内容 \| 说明\/示例/);assert.match(xml,/<h1>六、负责人与审批机制<\/h1><table><colgroup>[\s\S]*?<\/colgroup><tbody>/);
});
test('XML核对捕获空格子丢失、列合并和章节降级，忽略飞书ID和默认样式',()=>{
 const source='<title>标题</title><h1>一、项目</h1><table><thead><tr><th><p>名称</p></th><th><p>说明</p></th></tr></thead><tbody><tr><td><p>A <b>B</b></p></td><td><p></p></td></tr></tbody></table>';
 assert.equal(canonicalXml(source),canonicalXml(source.replace('<h1>','<h1 id="id123" align="left">')));
 assert.notEqual(canonicalXml(source),canonicalXml(source.replace('<td><p></p></td>','')));
 assert.notEqual(canonicalXml(source),canonicalXml(source.replace('<h1>一、项目</h1>','<p>一、项目</p>')));
 assert.notEqual(canonicalXml(source),canonicalXml(source.replace('<td>','<td colspan="2">')));
 assert.notEqual(canonicalXml(source),canonicalXml(source.replace('A <b>B','A<b>B')));
 assert.throws(()=>canonicalXml('<table><tr></table>'));assert.throws(()=>canonicalXml('<img path="@/secret"/>'));assert.throws(()=>canonicalXml('<!DOCTYPE a>'));
});
test('物料名称尾部回车不生成标题后空行，正文的有效换行保留',t=>{
 const {base}=fixture(t);
 for(const tail of ['\n','\r\n',' \n\n\t ']){
   const draft=syncBriefMaterials(base,[{id:'a',name:'考前冲刺海报'+tail}]);
   draft.background.text='第一段\n第二段';draft.items[0].blocks=[['主文案','第一行\n第二行','说明']];
   const xml=briefXml(draft);
   assert.match(xml,/<h2>4\.1 考前冲刺海报<\/h2><table>/);
   assert.match(xml,/<p>第一段<br\/>第二段<\/p>/);assert.match(xml,/<p>第一行<br\/>第二行<\/p>/);
   assert.equal(draft.materials[0].name,'考前冲刺海报');
 }
});
test('未清洗的物料名带回车时，背景句拼接物料名不夹换行',t=>{
 const {base,source}=fixture(t);
 const raw={...base,materials:[{id:'a',name:'考前冲刺海报\n'},{id:'b',name:'选课海报\r\n'}]};
 const r=generateBriefSuggestions(raw,source);
 assert.match(r.value.background.text,/围绕考前冲刺海报、选课海报，把需求理解/);assert.ok(!r.value.background.text.includes('\n'));
});
test('旧版Brief人工内容在物料主表迁移、增加条目并保存后保留',t=>{
 const {service,db}=fixture(t);putRecord(db,'brief',month,{revision:1,editedAt:'旧版',overrides:{audience:[['旧物料','老用户','人工待办']],timeline:[['旧物料','下周','P0','负责人','说明']],items:[{id:'old',title:'旧物料',kind:'price',blocks:[['标题','人工内容','']],refs:[],reuse:null}]}});
 const read=service.read(month);assert.equal(read.materials[0].name,'旧物料');const draft=syncBriefMaterials(read,[...read.materials,{id:'new',name:'新物料'}]);
 const pv=service.preview(month,{patch:briefPatch(read,draft)});service.confirm(month,{previewId:pv.previewId,confirm:true});const back=service.read(month);assert.equal(back.items[0].blocks[0][1],'人工内容');assert.equal(back.audience[0][1],'老用户');assert.equal(back.timeline[0][3],'负责人');
});
test('旧表名称与顺序不同则按名称迁移，未配对项独立保留',t=>{
 const {db,service}=fixture(t);putRecord(db,'brief',month,{revision:1,overrides:{audience:[['私信用户','受众','待办']],timeline:[['朋友圈九宫格','明天','P0','某人','备注']],items:[{id:'old',title:'课时卡价格图',kind:'price',blocks:[],refs:[],reuse:null}]}});
 const read=service.read(month);assert.deepEqual(read.materials.map(x=>x.name),['私信用户','朋友圈九宫格','课时卡价格图']);assert.equal(read.audience[0][1],'受众');assert.equal(read.timeline[1][1],'明天');assert.equal(read.items[2].kind,'price');
 const p=service.preview(month,{patch:{title:'新标题'}});service.confirm(month,{previewId:p.previewId,confirm:true});assert.deepEqual(service.read(month).materials,read.materials);
});

test('参考列宽与三行正文写进XML，保留多于三行的内容与标题层级',t=>{
 const {base}=fixture(t);const b=syncBriefMaterials(base,[{id:'a',name:'海报'}]);
 const x=briefXml(b),tables=[...x.matchAll(/<table>([\s\S]*?)<\/table>/g)].map(m=>m[1]);
 assert.equal(tables.length,5);
 for(const table of tables)assert.equal((table.match(/<tbody>([\s\S]*?)<\/tbody>/)[1].match(/<tr>/g)||[]).length,3);
 assert.match(tables[0],/<col width="221"\/><col width="300"\/><col width="300"\/>/);
 assert.match(tables[2],/<col width="145"\/><col width="289"\/><col width="377"\/>/);
 b.items[0].blocks=Array.from({length:5},(_,i)=>['标题'+i,'人工内容','']);
 assert.match(briefXml(b),/标题4/);
 assert.notEqual(canonicalXml(x,{widths:true}),canonicalXml(x.replace('width="221"','width="140"'),{widths:true}));
});

test('选课独立匹配非主战场事实，名称无换行，人工内容保留',t=>{
 const {service,base,source}=fixture(t);source.strategy=null;source.regions.push({name:'美国',tier:'主战场',task:[['期中后评估风险科目，选定春季课程','时间线']]},{name:'加拿大',tier:'次战场',task:[['UBC 10/23 选课','推测']]});
 const draft=syncBriefMaterials(base,[{id:'a',name:'选课海报\n'},{id:'b',name:'考前冲刺海报'}]);draft.audience[1][1]='指定人群';
 const r=service.generate(month,{patch:briefPatch(base,draft)});
 assert.equal(r.warnings.length,0);assert.match(r.value.audience[0][1],/规划下一学期/);assert.match(r.value.audience[0][2],/美国.*加拿大/);assert.match(r.value.audience[0][2],/推测，待确认/);assert.match(r.value.audience[0][2],/待办建议/);assert.equal(r.value.audience[1][1],'指定人群');assert.ok(!r.value.background.text.includes('\n'));
 assert.equal(new Set(r.value.background.goals).size,r.value.background.goals.length);
});

test('Brief 的策略来源忽略仅同步时间变化，日期证据变化提示但保留人工正文',t=>{
 const {service,source}=fixture(t);
 source.timelineSyncedAt='2026-10-21T01:00:00Z';
 source.timelineEvidence={status:'current',fingerprint:'dates-a',syncedAt:source.timelineSyncedAt,basedOnSyncedAt:'2026-10-20',message:'来源一致'};
 const before=service.read(month),pv=service.preview(month,{patch:{background:{text:'我填写的背景'}}});
 source.timelineSyncedAt='2026-10-22T01:00:00Z';source.timelineEvidence.syncedAt=source.timelineSyncedAt;
 source.timelineEvidence.basedOnSyncedAt='2026-10-21';source.updatedAt='2026-10-22';source.preparedAt='2026-10-22';
 assert.equal(service.read(month).strategySource.fingerprint,before.strategySource.fingerprint);
 service.confirm(month,{previewId:pv.previewId,confirm:true});
 source.timelineEvidence={...source.timelineEvidence,status:'changed',fingerprint:'dates-b',message:'用户时间已更新，策略正文仍保留原稿'};
 const changed=service.read(month);
 assert.notEqual(changed.strategySource.fingerprint,before.strategySource.fingerprint);assert.equal(changed.strategySource.timelineEvidence.status,'changed');
 assert.equal(changed.background.text,'我填写的背景');
});
