import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fixture} from './helpers/brief-sync-fixture.mjs';
import {getRecord,putRecord} from '../server/local-records.mjs';
import {exactBriefXml} from '../server/brief-sync-plan.mjs';

function setup(t){assert.ok(process.env.WORKDESK_DATA_DIR);const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'brief-sync-')),f=fixture(dir);t.after(()=>{f.db.close();rmSync(dir,{recursive:true,force:true});});return f;}
const bg=text=>({background:{from:'本月策略',text,goals:['提高咨询']}});
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
  await f.sync({resolveConflict:conflict.id});assert.match(f.documents.get('Doc1').content,/背景 C/);assert.match(f.documents.get('Doc1').content,/ImageReference/);assert.equal(f.state.creates,1);assert.notEqual(before,f.documents.get('Doc1').content);
});
test('段落内云端链接也算修改；冲突令牌绑定当前内容与云端版本',async t=>{
  const f=setup(t);f.save(bg('背景 A'));await f.sync();f.cloud('1',s=>s.replace('背景 A','<a href="https://example.com">背景 A</a>'));f.save(bg('背景 B'));
  let conflict;await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});f.cloud('1',s=>s.replace('背景 A','再次修改'));
  await assert.rejects(f.preview({resolveConflict:conflict.id}),e=>e.code==='EXPORT_SOURCE_CHANGED');assert.equal(f.state.updates,0);
});
test('飞书在空白尾行插图后，同章改动必须提示冲突，不能当作空行抹除',async t=>{
  const f=setup(t);await f.sync();f.cloud('6',s=>s.replace(/<td><p><\/p><\/td>(?=<\/tr><\/tbody>)/,'<td><image token="OnlyImage" /></td>'));f.save({owners:[['需求提出','某人'],['内容确认',''],['设计对接','']]});
  await assert.rejects(f.preview(),e=>e.code==='EXPORT_REMOTE_CONFLICT');assert.match(f.documents.get('Doc1').content,/OnlyImage/);assert.equal(f.state.updates,0);
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
test('多章更新只完成一章时保留未知状态，核对不重放剩余章节',async t=>{
  const f=setup(t);f.save(bg('背景 A'));await f.sync();f.save({...bg('背景 B'),owners:[['需求提出','某人'],['内容确认',''],['设计对接','']]});f.state.failAfterUpdate=1;
  let receipt;await assert.rejects(f.sync(),e=>{receipt=e.receipt;return e.code==='EXPORT_RESULT_UNKNOWN';});f.state.failAfterUpdate=false;
  await assert.rejects(f.service.exportReconcile(f.month,receipt.operationId),e=>e.code==='EXPORT_RESULT_UNKNOWN');await assert.rejects(f.preview(),e=>e.code==='EXPORT_RESULT_UNKNOWN');assert.equal(f.state.updates,1);assert.equal(f.state.creates,1);
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
