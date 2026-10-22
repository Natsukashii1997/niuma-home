import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fixture} from './helpers/brief-sync-fixture.mjs';
import {fingerprint,getRecord,putRecord} from '../server/local-records.mjs';
import {syncBriefMaterials} from '../server/brief-template.mjs';
import {briefPatch} from '../src/modules/marketing/brief-edit.js';
import {exactBriefXml} from '../server/brief-sync-plan.mjs';

function setup(t){assert.ok(process.env.WORKDESK_DATA_DIR);const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'brief-sync-')),f=fixture(dir);t.after(()=>{f.db.close();rmSync(dir,{recursive:true,force:true});});return f;}
const bg=text=>({background:{from:'本月策略',text,goals:['提高咨询']}});
test('真实范围拒绝回归：只改背景段落不能从章节标题替换到列表末项',async t=>{
  const f=setup(t);f.save(bg('背景 A'));await f.sync();f.save(bg('背景 B'));await f.sync();
  const write=f.state.calls.find(c=>c.args.includes('+update')&&!c.args.includes('--dry-run'));
  assert.ok(write.args.includes('--block-id'));assert.equal(write.input,'<p>背景 B</p>');
  assert.equal(f.state.creates,1);
});
test('目标列表逐项改动、增删与清空保持列表结构和其余章节',async t=>{
  const f=setup(t);f.save({...bg('原背景'),background:{...bg('原背景').background,goals:['目标一','目标二']}});await f.sync();
  for(const goals of [['新目标一','目标二'],['新目标一','目标二','新增目标'],['前置目标','新目标一','目标二','新增目标'],['新目标一'],[],['恢复目标']]){
    f.save({background:{...f.service.read(f.month).background,goals}});await f.sync();
    const xml=f.documents.get('Doc1').content.replace(/\s+id="[^"]*"/g,'');assert.match(xml,/原背景/);
    for(const goal of goals)assert.ok(xml.includes(`<li>${goal}</li>`));
    const count=f.state.updates;await f.sync();assert.equal(f.state.updates,count);
  }
  f.save({background:{from:'人工',text:'同时更新背景',goals:[]}});await f.sync();
  assert.match(f.documents.get('Doc1').content,/同时更新背景/);
  f.save({background:{from:'人工',text:'再次更新背景',goals:['新目标']}});await f.sync();
  assert.match(f.documents.get('Doc1').content,/再次更新背景/);assert.match(f.documents.get('Doc1').content,/新目标/);
  assert.equal(f.state.creates,1);
});
test('明确范围拒绝必须同时回读版本和全文未变才解除；超时仍保留未知',async t=>{
  const f=setup(t);f.save(bg('A'));await f.sync();f.save(bg('B'));f.state.failBeforeUpdate=true;let r;
  await assert.rejects(f.sync(),e=>{r=e.receipt;return true;});
  const stored=getRecord(f.db,'feishu-export',r.operationId);
  assert.equal(stored.attempt.revision,1);
  const diagnostic={phase:'api',outcome:'rejected',result:'failed',degradeCode:1002,reason:'invalid_block_range'};
  putRecord(f.db,'feishu-export',r.operationId,{...stored,diagnostic});
  f.documents.get('Doc1').revision++;
  await assert.rejects(f.service.exportReconcile(f.month,r.operationId),e=>e.code==='EXPORT_RESULT_UNKNOWN');
  f.documents.get('Doc1').revision--;
  assert.equal((await f.service.exportReconcile(f.month,r.operationId)).status,'aborted');
  await assert.rejects(f.confirm({previewId:stored.previewId}),e=>e.code==='EXPORT_PREVIEW_EXPIRED');assert.equal(f.state.updates,0);
  f.state.failBeforeUpdate=false;await f.sync();assert.equal(f.state.creates,1);assert.equal(f.state.updates,1);
  assert.equal(getRecord(f.db,'feishu-export',r.operationId).status,'aborted');
});
test('专项恢复证据必须绑定原请求，不能以另一条拒绝解除旧unknown',async t=>{
  const f=setup(t);f.save(bg('A'));await f.sync();f.save(bg('B'));f.state.failBeforeUpdate=true;let r;
  await assert.rejects(f.sync(),e=>{r=e.receipt;return true;});
  const stored=getRecord(f.db,'feishu-export',r.operationId),p=getRecord(f.db,'feishu-export-preview',stored.previewId),edit=p.edits[0];
  delete stored.attempt.revision;stored.diagnostic={phase:'process',outcome:'unknown'};stored.recoveryId='operator-proof';putRecord(f.db,'feishu-export',r.operationId,stored);
  const proof={status:'rejected',originalOperationId:r.operationId,documentId:'Doc1',revision:p.remoteRevision,beforeFingerprint:fingerprint(exactBriefXml(stored.attempt.before)),afterFingerprint:fingerprint(exactBriefXml(stored.attempt.before)),requestFingerprint:'another-request',diagnostic:{outcome:'rejected',result:'failed',degradeCode:1002,reason:'invalid_block_range'}};
  putRecord(f.db,'brief-sync-recovery','operator-proof',proof);
  await assert.rejects(f.service.exportReconcile(f.month,r.operationId),e=>e.code==='EXPORT_RESULT_UNKNOWN');assert.equal(f.state.updates,0);
  proof.requestFingerprint=fingerprint({method:'PUT',url:'/open-apis/docs_ai/v1/documents/Doc1',body:{command:'block_replace',format:'xml',content:edit.content,revision_id:p.remoteRevision,block_id:edit.start}});
  putRecord(f.db,'brief-sync-recovery','operator-proof',proof);
  assert.equal((await f.service.exportReconcile(f.month,r.operationId)).status,'aborted');assert.equal(f.state.updates,0);
  assert.deepEqual(getRecord(f.db,'feishu-export',r.operationId).diagnostic,{phase:'process',outcome:'unknown'});
});
test('Brief 首次创建、改稿同文档更新、无变化不写、A→B→A 不复用历史成功',async t=>{
  const f=setup(t);f.save(bg('背景 A'));const first=await f.sync();assert.equal(first.document.id,'Doc1');
  f.save(bg('背景 B'));const second=await f.sync();assert.equal(second.document.id,'Doc1');assert.equal(f.state.updates,1);assert.match(f.documents.get('Doc1').content,/背景 B/);
  const noop=await f.sync();assert.equal(noop.mode,'unchanged');assert.equal(f.state.updates,1);
  f.save(bg('背景 A'));await f.sync();assert.equal(f.state.updates,2);assert.equal(f.state.creates,1);assert.match(f.documents.get('Doc1').content,/背景 A/);
  await f.sync();assert.equal(f.state.updates,2);
  assert.equal(f.service.read(f.month).feishuDocument.id,'Doc1');
});
test('飞书补写文案和资源保留；同章双改阻断并提供精确差异，确认只替换冲突章',async t=>{
  const f=setup(t);f.save(bg('背景 A'));await f.sync();
  f.cloud('4',s=>s+'<p><a href="https://example.com/reference">设计师链接</a><image token="ImageReference" /></p>');
  const before=f.documents.get('Doc1').content;f.save(bg('背景 B'));await f.sync();assert.match(f.documents.get('Doc1').content,/ImageReference/);assert.equal(f.state.updates,1);
  f.cloud('1',s=>s.replace('背景 B','飞书修改'));f.save(bg('背景 C'));
  let conflict;await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});assert.equal(conflict.sections.length,1);assert.match(conflict.sections[0].remote,/飞书修改/);assert.equal(f.state.updates,1);
  await f.sync({resolveConflict:conflict.id,resolutions:{'1':'local'}});assert.match(f.documents.get('Doc1').content,/背景 C/);assert.match(f.documents.get('Doc1').content,/ImageReference/);assert.equal(f.state.creates,1);assert.notEqual(before,f.documents.get('Doc1').content);
});
test('段落内云端链接也算修改；冲突令牌绑定当前内容与云端版本',async t=>{
  const f=setup(t);f.save(bg('背景 A'));await f.sync();f.cloud('1',s=>s.replace('背景 A','<a href="https://example.com">背景 A</a>'));f.save(bg('背景 B'));
  let conflict;await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});f.cloud('1',s=>s.replace('背景 A','再次修改'));
  await assert.rejects(f.preview({resolveConflict:conflict.id}),e=>e.code==='EXPORT_SOURCE_CHANGED');assert.equal(f.state.updates,0);
});
test('飞书在空白尾行插图后，只改其他单元格仍保留图片',async t=>{
  const f=setup(t);await f.sync();f.cloud('6',s=>s.replace(/<td><p><\/p><\/td>(?=<\/tr><\/tbody>)/,'<td><image token="OnlyImage" /></td>'));f.save({owners:[['需求提出','某人'],['内容确认',''],['设计对接','']]});
  await f.sync();assert.match(f.documents.get('Doc1').content,/OnlyImage/);assert.match(f.documents.get('Doc1').content,/某人/);assert.equal(f.state.updates,2);
});
test('预检后云端变化、另页同步和旧确认重放不能覆盖最新文档',async t=>{
  const f=setup(t);f.save(bg('背景 A'));const createPreview=await f.preview();await f.confirm(createPreview);f.save(bg('背景 B'));const old=await f.preview();
  f.cloud('4',s=>s+'<p>补充</p>');await assert.rejects(f.confirm(old),e=>e.code==='EXPORT_REMOTE_CHANGED');assert.equal(f.state.updates,0);
  const a=await f.preview(),b=await f.preview();await f.confirm(a);await f.confirm(b);assert.equal(f.state.updates,1);
  f.save(bg('背景 C'));await f.sync();await assert.rejects(f.confirm(a),e=>e.code==='EXPORT_SOURCE_CHANGED');assert.equal(f.state.updates,2);
  await assert.rejects(f.confirm(createPreview),e=>e.code==='EXPORT_SOURCE_CHANGED');
});
test('更新回包丢失锁定月度写入，只读核对恢复同文档，不重放或另建',async t=>{
  const f=setup(t);f.save(bg('背景 A'));await f.sync();f.save(bg('背景 B'));f.state.failAfterUpdate=true;
  let receipt;await assert.rejects(f.sync(),e=>{receipt=e.receipt;return e.code==='EXPORT_RESULT_UNKNOWN';});assert.equal(receipt.document.id,'Doc1');
  await assert.rejects(f.preview(),e=>e.code==='EXPORT_RESULT_UNKNOWN');f.state.failAfterUpdate=false;
  const recovered=await f.service.exportReconcile(f.month,receipt.operationId);assert.equal(recovered.status,'success');assert.equal(f.state.updates,1);assert.equal(f.state.creates,1);
});
test('紧邻写入发现云端变化则零写中止，可重新同步；无效标题也在写前拒绝',async t=>{
  const f=setup(t);f.save(bg('背景 A'));await f.sync();f.save(bg('背景 B'));const p=await f.preview();let dry=0;
  f.state.onUpdateDry=()=>{if(++dry===2)f.cloud('4',s=>s+'<p>写前新补充</p>');};
  await assert.rejects(f.confirm(p),e=>e.code==='EXPORT_REMOTE_CHANGED');assert.equal(f.state.updates,0);f.state.onUpdateDry=null;
  await f.sync();assert.equal(f.state.updates,1);assert.match(f.documents.get('Doc1').content,/写前新补充/);
  f.save({title:'标题\n换行'});await assert.rejects(f.preview(),e=>e.code==='EXPORT_CONTENT_INVALID');assert.equal(f.state.updates,1);
});
test('多章部分完成只读核对后继续未发送部分，同一操作互斥不重复',async t=>{
  const f=setup(t);f.save(bg('背景 A'));await f.sync();f.save({...bg('背景 B'),owners:[['需求提出','某人'],['内容确认',''],['设计对接','']]});f.state.failAfterUpdate=1;
  let receipt;await assert.rejects(f.sync(),e=>{receipt=e.receipt;return e.code==='EXPORT_RESULT_UNKNOWN';});f.state.failAfterUpdate=false;
  const check=await f.service.exportReconcile(f.month,receipt.operationId);assert.equal(check.status,'resumable');assert.equal(check.completed,1);await assert.rejects(f.preview(),e=>e.code==='EXPORT_RESULT_UNKNOWN');assert.equal(f.state.updates,1);
  const attempts=await Promise.allSettled([f.service.exportResume(f.month,receipt.operationId),f.service.exportResume(f.month,receipt.operationId)]);assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.state.updates,3);assert.equal(f.state.creates,1);assert.equal(f.service.exportStatus(f.month,receipt.operationId).status,'success');
});
test('旧成功收据迁移绑定忽略布局升级和尾空行，不另建文档',async t=>{
  const f=setup(t);f.save(bg('背景 A'));await f.sync();const link=getRecord(f.db,'brief-feishu-link',f.month),r=getRecord(f.db,'feishu-export',link.currentOperationId),p=getRecord(f.db,'feishu-export-preview',r.previewId);
  p.document.xml=p.document.xml.replace(/<colgroup>[\s\S]*?<\/colgroup>/g,'').replace(/<tbody>(?:<tr>(?:<td><\/td>)+<\/tr>)+<\/tbody>/g,'');putRecord(f.db,'feishu-export-preview',p.previewId,p);
  f.db.prepare('DELETE FROM v3_documents WHERE kind=? AND id=?').run('brief-feishu-link',f.month);
  const result=await f.sync();assert.equal(result.mode,'unchanged');assert.equal(f.state.creates,1);assert.equal(f.state.updates,0);
});
test('无权限或文档移动只报错，不创建替代；旧的未执行创建预览不能重复创建',async t=>{
  const f=setup(t);f.save(bg('背景 A'));const a=await f.preview();f.save(bg('背景 B'));await f.sync();
  await assert.rejects(f.confirm(a),e=>e.code==='EXPORT_SOURCE_CHANGED');f.state.noAccess=true;await assert.rejects(f.preview());f.state.noAccess=false;f.state.parent='OtherParent';await assert.rejects(f.preview(),e=>e.code==='EXPORT_TARGET_CHANGED');assert.equal(f.state.creates,1);
});
test('改标题仍定位同一文档，正文保留；已有多份历史收据必须明确原文档',async t=>{
  const f=setup(t);f.save(bg('背景 A'));const first=await f.sync();const before=f.documents.get('Doc1').content;f.save({title:'新的标题'});await f.sync();assert.equal(f.documents.get('Doc1').title,'新的标题');assert.match(f.documents.get('Doc1').content,/背景 A/);assert.equal(f.state.creates,1);
  f.db.prepare('DELETE FROM v3_documents WHERE kind=? AND id=?').run('brief-feishu-link',f.month);
  putRecord(f.db,'feishu-export','OtherReceipt',{...first,operationId:'OtherReceipt',document:{id:'Doc2',url:'https://vm94j8bzy7.feishu.cn/docx/Doc2'}});
  await assert.rejects(f.preview(),e=>e.code==='EXPORT_LINK_AMBIGUOUS');assert.equal(f.state.creates,1);assert.notEqual(exactBriefXml(before),exactBriefXml(f.documents.get('Doc1').content));
});

const materialSave=(f,fn)=>{const before=f.service.read(f.month),draft=structuredClone(before);fn(draft);return f.save(briefPatch(before,draft));};
const setMaterials=(f,materials)=>materialSave(f,d=>Object.assign(d,syncBriefMaterials(d,materials)));
test('飞书补完物料A，工作台新增B；A正文、图片与表格人工内容保留',async t=>{
 const f=setup(t);setMaterials(f,[{id:'a',name:'考前海报'}]);await f.sync();
 f.cloud('4',s=>s.replace('</h2>','</h2><p>设计师补写 A<image token="KeepA"/></p>'));
 f.cloud('3',s=>s.replace('<td><p></p></td>','<td><p>周五交付</p></td>'));
 setMaterials(f,[{id:'a',name:'考前海报'},{id:'b',name:'选课海报'}]);await f.sync();const xml=f.documents.get('Doc1').content;
 assert.match(xml,/设计师补写 A/);assert.match(xml,/KeepA/);assert.match(xml,/周五交付/);assert.equal((xml.match(/<h2/g)||[]).length,2);assert.equal(f.state.creates,1);
 const count=f.state.updates;await f.sync();assert.equal(f.state.updates,count);
});
test('只改物料名只写标题和名称单元格，飞书正文及交付字段不动',async t=>{
 const f=setup(t);setMaterials(f,[{id:'a',name:'考前海报'}]);await f.sync();f.cloud('4',s=>s.replace('</h2>','</h2><p>云端文案<image token="KeepPicture"/></p>'));f.cloud('3',s=>s.replace('<td><p></p></td>','<td><p>明天</p></td>'));
 setMaterials(f,[{id:'a',name:'考前海报新版'}]);await f.sync();const xml=f.documents.get('Doc1').content;
 assert.match(xml,/云端文案/);assert.match(xml,/KeepPicture/);assert.match(xml,/明天/);assert.match(xml,/4.1 考前海报新版/);assert.equal(f.state.updates,3);
});
test('每份物料冲突独立选取，保留飞书决定不会下次反复提示',async t=>{
 const f=setup(t);setMaterials(f,[{id:'a',name:'海报A'},{id:'b',name:'海报B'}]);materialSave(f,d=>{d.items[0].blocks[0][1]='旧A';d.items[1].blocks[0][1]='旧B';});await f.sync();
 f.cloud('4',s=>s.replace('旧A','云端A'));materialSave(f,d=>{d.items[0].blocks[0][1]='本地A';d.items[1].blocks[0][1]='本地B';});let conflict;
 await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});assert.equal(conflict.sections.length,1);assert.equal(conflict.sections[0].key,'4:a:body:1:1');
 await f.sync({resolveConflict:conflict.id,resolutions:{'4:a:body:1:1':'remote'}});assert.match(f.documents.get('Doc1').content,/云端A/);assert.match(f.documents.get('Doc1').content,/本地B/);
 const count=f.state.updates;await f.sync();assert.equal(f.state.updates,count);
 assert.equal(f.service.read(f.month).items[0].blocks[0][1],'云端A');
 f.cloud('4',s=>s.replace('云端A','云端A又更新'));materialSave(f,d=>{d.items[0].blocks[0][1]='新一版A';});await assert.rejects(f.preview(),e=>e.code==='EXPORT_REMOTE_CONFLICT');assert.match(f.documents.get('Doc1').content,/云端A又更新/);
});
test('删除有云端补写的物料只提示该物料，可保留为云端独有内容',async t=>{
 const f=setup(t);setMaterials(f,[{id:'a',name:'海报A'},{id:'b',name:'海报B'}]);await f.sync();f.cloud('4',s=>s.replace('</h2>','</h2><p>云端A文案</p>'));
 setMaterials(f,[{id:'b',name:'海报B'}]);let conflict;await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});assert.deepEqual(conflict.sections.map(c=>c.key),['4:a:delete']);
 await f.sync({resolveConflict:conflict.id,resolutions:{'4:a:delete':'remote'}});assert.match(f.documents.get('Doc1').content,/云端A文案/);await f.sync();assert.equal(f.state.creates,1);
});
test('已发送超时但读到写前内容仍保持未知，不重发；刷新可找回原操作',async t=>{
 const f=setup(t);f.save(bg('A'));await f.sync();f.save(bg('B'));f.state.failBeforeUpdate=true;let receipt;
 await assert.rejects(f.sync(),e=>{receipt=e.receipt;return e.code==='EXPORT_RESULT_UNKNOWN';});assert.equal(f.state.updates,0);
 assert.equal(f.service.read(f.month).feishuDocument.pending.operationId,receipt.operationId);assert.equal(f.service.exportStatus(f.month,'pending').operationId,receipt.operationId);
 await assert.rejects(f.service.exportReconcile(f.month,receipt.previewId),e=>e.code==='EXPORT_RESULT_UNKNOWN');await assert.rejects(f.service.exportResume(f.month,receipt.operationId));assert.equal(f.state.updates,0);
});
test('云端已有同名新增物料或表格资源不能安全重建时零写阻断',async t=>{
 const f=setup(t);setMaterials(f,[{id:'a',name:'海报A'}]);await f.sync();f.cloud('4',s=>s+'<h2>4.2 海报B</h2><p>云端已有B</p>');setMaterials(f,[{id:'a',name:'海报A'},{id:'b',name:'海报B'}]);await assert.rejects(f.preview(),e=>e.code==='EXPORT_STRUCTURE_CHANGED');assert.equal(f.state.updates,0);
});

test('失败后本地有新稿，继续原冻结快照并将新稿留作待同步',async t=>{
 const f=setup(t);f.save(bg('A'));await f.sync();f.save({...bg('B'),owners:[['需求提出','某人'],['内容确认',''],['设计对接','']]});f.state.failAfterUpdate=1;let receipt;
 await assert.rejects(f.sync(),e=>{receipt=e.receipt;return e.code==='EXPORT_RESULT_UNKNOWN';});f.state.failAfterUpdate=false;await f.service.exportReconcile(f.month,receipt.operationId);
 f.save(bg('新草稿C'));await f.service.exportResume(f.month,receipt.operationId);assert.match(f.documents.get('Doc1').content,/>B</);assert.equal(f.service.read(f.month).background.text,'新草稿C');assert.equal(f.service.read(f.month).feishuDocument.synced,false);
 await f.sync();assert.match(f.documents.get('Doc1').content,/新草稿C/);
});
test('列表结尾物料后新增物料保持顶层结构，复读可继续',async t=>{
 const f=setup(t);setMaterials(f,[{id:'a',name:'海报A'}]);materialSave(f,d=>{delete d.items[0].blocks;d.items[0].kind='grid9';d.items[0].cells=['一','二','','','','','','',''];});await f.sync();
 setMaterials(f,[{id:'a',name:'海报A'},{id:'b',name:'海报B'}]);await f.sync();assert.match(f.documents.get('Doc1').content,/<\/ol><h2[^>]*>4.2 海报B/);await f.sync();assert.equal(f.state.creates,1);
});

test('新增物料保留云端表头与列宽，第二三节含资源或同名独有行时零写保护',async t=>{
 for(const type of ['header','image','duplicate']){
  const f=setup(t);setMaterials(f,[{id:'a',name:'海报A'}]);await f.sync();
  f.cloud('2',s=>type==='header'?s.replace('width="221"','width="250"').replace('面向人群','设计师维护的受众'):type==='image'?s.replace('<td><p></p></td>','<td><p><image token="KeepTableImage"/></p></td>'):s.replace('<tbody>','<tbody><tr><td><p>海报B</p></td><td><p>云端独有</p></td><td><p></p></td></tr>'));
  setMaterials(f,[{id:'a',name:'海报A'},{id:'b',name:'海报B'}]);
  if(type==='header'){await f.sync();assert.match(f.documents.get('Doc1').content,/width="250"/);assert.match(f.documents.get('Doc1').content,/设计师维护的受众/);}
  else {await assert.rejects(f.preview(),e=>e.code==='EXPORT_STRUCTURE_CHANGED');assert.equal(f.state.updates,0);assert.match(f.documents.get('Doc1').content,type==='image'?/KeepTableImage/:/云端独有/);}
 }
});
test('回读与继续互斥，慢回读不能覆盖已发送记录；旧收据无步骤证据不重放',async t=>{
 const f=setup(t);f.save(bg('A'));await f.sync();f.save({...bg('B'),owners:[['需求提出','某人'],['内容确认',''],['设计对接','']]});f.state.failAfterUpdate=1;let receipt;
 await assert.rejects(f.sync(),e=>{receipt=e.receipt;return e.code==='EXPORT_RESULT_UNKNOWN';});f.state.failAfterUpdate=false;
 const pendingRead=f.service.exportReconcile(f.month,receipt.operationId);await assert.rejects(f.service.exportResume(f.month,receipt.operationId),e=>e.code==='EXPORT_SYNC_RUNNING');const check=await pendingRead;assert.equal(check.status,'resumable');
 const stored=getRecord(f.db,'feishu-export',receipt.operationId);delete stored.checkpoint;delete stored.steps;delete stored.attempt;stored.status='unknown';putRecord(f.db,'feishu-export',receipt.operationId,stored);
 await assert.rejects(f.service.exportReconcile(f.month,receipt.operationId),e=>e.code==='EXPORT_RESULT_UNKNOWN');assert.equal(f.state.updates,1);
});
