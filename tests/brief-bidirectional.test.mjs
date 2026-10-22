import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fixture} from './helpers/brief-sync-fixture.mjs';
import {blocks,exactBriefXml} from '../server/brief-sync-plan.mjs';
import {syncBriefMaterials} from '../server/brief-template.mjs';
import {briefPatch} from '../src/modules/marketing/brief-edit.js';
import {getRecord,listRecords,putRecord} from '../server/local-records.mjs';

function setup(t){
  const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'brief-two-way-')),f=fixture(dir);
  t.after(()=>{f.db.close();rmSync(dir,{recursive:true,force:true});});return f;
}
const save=(f,edit)=>{const before=f.service.read(f.month),draft=structuredClone(before);edit(draft);return f.save(briefPatch(before,draft));};
async function init(t){const f=setup(t);save(f,d=>Object.assign(d,syncBriefMaterials(d,[{id:'a',name:'海报A'}])));await f.sync();return f;}
function cloudCell(f,section,row,col,content){f.cloud(section,xml=>{
  const table=blocks(xml).find(n=>n.tag==='table'),cell=table.children.find(n=>n.tag==='tbody').children[row].children[col];
  return xml.slice(0,cell.start)+`<td><p>${content}</p></td>`+xml.slice(cell.end);
});}
const xml=f=>f.documents.get('Doc1').content;

test('飞书独改详细文案回填工作台；重复同步不写云端、不递增本地版本',async t=>{
  const f=await init(t);cloudCell(f,'4',0,1,'飞书文案<br/>第二行');const before=f.state.updates;
  const result=await f.sync();assert.equal(result.localSync.status,'applied');
  const local=f.service.read(f.month);assert.equal(local.items[0].blocks[0][1],'飞书文案\n第二行');assert.equal(local.feishuDocument.synced,true);assert.equal(local.saveRequestId,undefined);
  assert.equal(f.state.updates,before);const r=await f.sync();assert.equal(r.localSync.status,'unchanged');assert.equal(f.service.read(f.month).version,local.version);assert.equal(f.state.updates,before);assert.equal(f.state.creates,1);
});
test('两边修改不同格双向合并，拉回后可以继续编辑同一格更新原文档',async t=>{
  const f=await init(t);cloudCell(f,'4',0,1,'飞书第一格');save(f,d=>{d.items[0].blocks[1][1]='工作台第二格';});
  await f.sync();let b=f.service.read(f.month);assert.equal(b.items[0].blocks[0][1],'飞书第一格');assert.equal(b.items[0].blocks[1][1],'工作台第二格');assert.match(xml(f),/工作台第二格/);
  save(f,d=>{d.items[0].blocks[0][1]='回填后编辑的新稿';});await f.sync();assert.match(xml(f),/回填后编辑的新稿/);assert.equal(f.state.creates,1);
});
test('同格冲突零写零回填；选飞书只影响冲突格，其他本地新稿仍合并',async t=>{
  const f=await init(t);cloudCell(f,'4',0,1,'飞书同格');save(f,d=>{d.items[0].blocks[0][1]='工作台同格';d.items[0].blocks[1][1]='工作台独改';});
  const before=f.service.read(f.month),remote=exactBriefXml(xml(f)),updates=f.state.updates;let conflict;
  await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});
  assert.equal(conflict.sections.length,1);assert.equal(f.service.read(f.month).version,before.version);assert.equal(f.state.updates,updates);assert.equal(exactBriefXml(xml(f)),remote);
  await f.sync({resolveConflict:conflict.id,resolutions:Object.fromEntries(conflict.sections.map(s=>[s.key,'remote']))});
  const local=f.service.read(f.month);assert.equal(local.items[0].blocks[0][1],'飞书同格');assert.equal(local.items[0].blocks[1][1],'工作台独改');assert.match(xml(f),/工作台独改/);
  assert.ok(listRecords(f.db,'brief-sync-backup').some(b=>b.local.items[0].blocks[0][1]==='工作台同格'));
});
test('飞书链接图片和额外段落被保留并可在工作台查看，纯文本回填不触发重写',async t=>{
  const f=await init(t);cloudCell(f,'4',0,1,'人工文案<a href="https://example.com/ref">参考</a><image token="ImageKeep"/>');f.cloud('4',s=>s+'<p>表外人工补充</p>');
  const before=exactBriefXml(xml(f));await f.sync();const local=f.service.read(f.month);
  assert.match(local.items[0].blocks[0][1],/人工文案/);assert.ok(local.feishuSupplement.some(s=>s.text.includes('表外人工补充')));assert.ok(local.feishuSupplement.some(s=>s.links.some(l=>l.url==='https://example.com/ref')));assert.ok(local.feishuSupplement.some(s=>s.hasResources));
  assert.equal(exactBriefXml(xml(f)),before);await f.sync();assert.equal(exactBriefXml(xml(f)),before);
  save(f,d=>{d.background.text='本地后续背景';});await f.sync();assert.ok(f.service.read(f.month).feishuSupplement.some(s=>s.hasResources));assert.match(xml(f),/ImageKeep/);
});
test('云端已更新但另一页面刚保存时不覆盖本地，下一次同步合并两边',async t=>{
  const f=await init(t);cloudCell(f,'4',0,1,'飞书等待拉回');save(f,d=>{d.background.text='这次要同步的背景';});
  f.state.afterUpdate=()=>{f.state.afterUpdate=null;save(f,d=>{d.items[0].blocks[1][1]='另一页面的新草稿';});};
  const result=await f.sync();assert.equal(result.localSync.status,'pending');assert.equal(f.service.read(f.month).items[0].blocks[1][1],'另一页面的新草稿');assert.equal(f.service.read(f.month).feishuDocument.synced,false);
  await f.sync();const local=f.service.read(f.month);assert.equal(local.items[0].blocks[0][1],'飞书等待拉回');assert.equal(local.items[0].blocks[1][1],'另一页面的新草稿');assert.match(xml(f),/另一页面的新草稿/);
});
test('同步响应丢失后核对完成回填，重复核对不会再次导入或新建',async t=>{
  const f=await init(t);cloudCell(f,'4',0,1,'飞书已填写');save(f,d=>{d.background.text='本地新背景';});f.state.failAfterUpdate=true;let receipt;
  await assert.rejects(f.sync(),e=>{receipt=e.receipt;return e.code==='EXPORT_RESULT_UNKNOWN';});assert.equal(f.service.read(f.month).items[0].blocks[0][1],'');
  f.state.failAfterUpdate=false;const r=await f.service.exportReconcile(f.month,receipt.operationId);assert.equal(r.status,'success');assert.equal(f.service.read(f.month).items[0].blocks[0][1],'飞书已填写');
  const version=f.service.read(f.month).version;await f.service.exportReconcile(f.month,receipt.operationId);assert.equal(f.service.read(f.month).version,version);assert.equal(f.state.creates,1);
});
test('旧绑定已有云端手填但本地空白时首次双向同步安全迁移',async t=>{
  const f=await init(t);cloudCell(f,'4',0,1,'历史云端手填');const link=getRecord(f.db,'brief-feishu-link',f.month);link.remoteDocument=xml(f);delete link.localDocument.briefState;delete link.localDocument.briefVersion;putRecord(f.db,'brief-feishu-link',f.month,link);
  const updates=f.state.updates;await f.sync();assert.equal(f.service.read(f.month).items[0].blocks[0][1],'历史云端手填');assert.equal(f.state.updates,updates);assert.equal(f.state.creates,1);
});
test('已回填的成功确认可幂等重放，但之后的新草稿不能被旧确认覆盖',async t=>{
  const f=await init(t);cloudCell(f,'4',0,1,'云端稿');const p=await f.preview();await f.confirm(p);const version=f.service.read(f.month).version;await f.confirm(p);assert.equal(f.service.read(f.month).version,version);
  save(f,d=>{d.items[0].blocks[1][1]='新的本地稿';});await assert.rejects(f.confirm(p),e=>e.code==='EXPORT_SOURCE_CHANGED');assert.equal(f.service.read(f.month).items[0].blocks[1][1],'新的本地稿');
});
test('选择云端物料名后遇到另一页面保存，远端锚点仍能完成并保留待合并草稿',async t=>{
  const f=setup(t);f.state.stableIds=true;save(f,d=>Object.assign(d,syncBriefMaterials(d,[{id:'a',name:'海报A'}])));await f.sync();await f.sync();f.cloud('4',s=>s.replace('海报A','云端海报'));
  save(f,d=>{Object.assign(d,syncBriefMaterials(d,[{id:'a',name:'本地海报'}]));d.background.text='要同步的新背景';});
  let conflict;await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});
  const p=await f.preview({resolveConflict:conflict.id,resolutions:Object.fromEntries(conflict.sections.map(c=>[c.key,'remote']))});
  const last=f.state.updates+p.changedSections.length;
  f.state.afterUpdate=()=>{if(f.state.updates!==last)return;f.state.afterUpdate=null;save(f,d=>{d.items[0].blocks[1][1]='并发保存的文案';});};
  const result=await f.confirm(p);
  assert.equal(result.status,'success');assert.equal(result.localSync.status,'pending');
  assert.equal(f.service.read(f.month).items[0].blocks[1][1],'并发保存的文案');
  assert.equal(getRecord(f.db,'brief-feishu-link',f.month).remoteMaterials[0].name,'云端海报');
  assert.equal(f.state.creates,1);
});
test('云端写入后本地回填事务失败可核对恢复，不留下半份数据或重复写入',async t=>{
  const f=await init(t);cloudCell(f,'4',0,1,'等待事务恢复的飞书文案');save(f,d=>{d.background.text='本次本地背景';});
  const before=f.service.read(f.month),link=getRecord(f.db,'brief-feishu-link',f.month);
  f.db.exec("CREATE TRIGGER fail_brief_import BEFORE UPDATE ON v3_documents WHEN NEW.kind='brief' BEGIN SELECT RAISE(ABORT,'test local transaction failure'); END;");
  let receipt;await assert.rejects(f.sync(),e=>{receipt=e.receipt;return e.code==='EXPORT_RESULT_UNKNOWN';});
  assert.equal(f.service.read(f.month).version,before.version);assert.deepEqual(getRecord(f.db,'brief-feishu-link',f.month),link);
  f.db.exec('DROP TRIGGER fail_brief_import');const writes=f.state.updates;
  const result=await f.service.exportReconcile(f.month,receipt.operationId);assert.equal(result.status,'success');
  assert.equal(f.service.read(f.month).items[0].blocks[0][1],'等待事务恢复的飞书文案');assert.equal(f.state.updates,writes);assert.equal(f.state.creates,1);
});
