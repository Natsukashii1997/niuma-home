import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fixture} from './helpers/brief-sync-fixture.mjs';
import {syncBriefMaterials} from '../server/brief-template.mjs';
import {briefPatch} from '../src/modules/marketing/brief-edit.js';
import {briefSections,exactBriefXml} from '../server/brief-sync-plan.mjs';

const cloudText='飞书人工填写必须保留';
const materials=[{id:'a',name:'海报A'},{id:'b',name:'海报B'}];
const save=(f,edit)=>{
  const before=f.service.read(f.month),draft=structuredClone(before);
  edit(draft);return f.save(briefPatch(before,draft));
};
const setMaterials=(f,next)=>save(f,d=>Object.assign(d,syncBriefMaterials(d,next)));
const xml=f=>f.documents.get('Doc1').content;
const meaningful=f=>exactBriefXml(xml(f));
function setup(t){
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'brief-cloud-preserve-')),f=fixture(dir);
  t.after(()=>{f.db.close();rmSync(dir,{recursive:true,force:true});});
  return f;
}
async function initialized(t){
  const f=setup(t);
  save(f,d=>{Object.assign(d,syncBriefMaterials(d,materials));d.specs=[['规格A',''],['规格B',''],['','']];});
  await f.sync();return f;
}
async function storedCloud(t,section,extra){
  const f=await initialized(t);
  f.cloud(section,s=>s.replace('<td><p></p></td>',`<td><p>${cloudText}</p></td>`));
  if(extra)extra(f);
  // The first unrelated sync advances the remote baseline. A later local
  // change must still distinguish this retained cloud text from local blanks.
  f.save({background:{from:'人工',text:'第一次只修改背景',goals:[]}});
  await f.sync();assert.ok(xml(f).includes(cloudText));
  return f;
}
async function preservedAfterRepeat(f){
  assert.ok(xml(f).includes(cloudText),'已保存过的云端人工内容不得被本地旧空白覆盖');
  const before=meaningful(f),updates=f.state.updates;
  const r=await f.sync();assert.equal(r.mode,'unchanged');
  assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);assert.equal(f.state.creates,1);
}

test('云端第四节已经保留一次后，本地改同物料另一格应合并两份内容',async t=>{
  const f=await storedCloud(t,'4');save(f,d=>{d.items[0].blocks[1][1]='本地另一格新文案';});
  await f.sync();assert.ok(xml(f).includes('本地另一格新文案'));await preservedAfterRepeat(f);
});
test('已同步过的云端详细文案在物料改名后继续保留',async t=>{
  const f=await storedCloud(t,'4');setMaterials(f,[{id:'a',name:'海报新版'},materials[1]]);
  await f.sync();assert.ok(xml(f).includes('4.1 海报新版'));await preservedAfterRepeat(f);
});
test('已同步过的云端详细文案在新增物料后继续保留',async t=>{
  const f=await storedCloud(t,'4');setMaterials(f,[...materials,{id:'c',name:'海报C'}]);
  await f.sync();assert.equal((xml(f).match(/<h2\b/g)||[]).length,3);await preservedAfterRepeat(f);
});
test('删除已保留过云端正文的物料必须先保护，明确保留飞书后仍可继续同步',async t=>{
  const f=await storedCloud(t,'4');setMaterials(f,[materials[1]]);const before=meaningful(f),updates=f.state.updates;let conflict;
  await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});
  assert.ok(conflict.sections.some(s=>s.key==='4:a:delete'));assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);
  await f.sync({resolveConflict:conflict.id,resolutions:Object.fromEntries(conflict.sections.map(s=>[s.key,'remote']))});
  await preservedAfterRepeat(f);
});
for(const [section,field,otherColumn,newText] of [['2','audience',2,'本地新待办'],['3','timeline',2,'本地新优先级']]){
  test(`第${section}节云端已同步的人工单元格与本地另一格独立保留`,async t=>{
    const f=await storedCloud(t,section);save(f,d=>{d[field][0][otherColumn]=newText;});
    await f.sync();assert.ok(xml(f).includes(newText));await preservedAfterRepeat(f);
  });
  test(`第${section}节不能静默替换已同步过的同一云端人工单元格`,async t=>{
    const f=await storedCloud(t,section);save(f,d=>{d[field][0][1]='本地同格新版本';});const before=meaningful(f),updates=f.state.updates;
    await assert.rejects(f.preview(),e=>e.code==='EXPORT_REMOTE_CONFLICT');
    assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);assert.ok(xml(f).includes(cloudText));
  });
}
for(const [section,field,newText] of [['5','specs','本地另一项规格'],['6','owners','本地另一位负责人']]){
  test(`第${section}节先保留云端填写后，再改另一格仍应自动合并`,async t=>{
    const f=await storedCloud(t,section);save(f,d=>{d[field][1][1]=newText;});
    await f.sync();assert.ok(xml(f).includes(newText));await preservedAfterRepeat(f);
  });
}
test('第四节的云端文字、链接、图片、额外段落在后续逐格修改中保持原样',async t=>{
  const f=await storedCloud(t,'4',x=>x.cloud('4',s=>s.replace(cloudText,cloudText+'<a href="https://example.com/cell-reference">单元格链接</a><image token="KeepCellPicture"/>').replace('</h2>','</h2><p>云端额外段落<a href="https://example.com/brief-reference">设计师参考链接</a><image token="KeepCloudPicture"/></p>')));
  const beforeSection=briefSections(xml(f))[4].xml,extra=beforeSection.match(/<p[^>]*>云端额外段落[\s\S]*?<\/p>/)?.[0];
  assert.ok(extra);const calls=f.state.calls.length;
  save(f,d=>{d.items[0].blocks[1][1]='本地另一行更新';});await f.sync();
  // The fixture restamps IDs on every fetch; compare resource attributes and
  // full content here, and require the actual write not to touch either asset.
  const afterExtra=xml(f).match(/<p[^>]*>云端额外段落[\s\S]*?<\/p>/)?.[0];
  assert.equal(exactBriefXml(afterExtra),exactBriefXml(extra));
  assert.ok(xml(f).includes('KeepCellPicture'));assert.ok(xml(f).includes('https://example.com/cell-reference'));
  const writes=f.state.calls.slice(calls).filter(c=>c.args.includes('+update')&&!c.args.includes('--dry-run'));
  assert.ok(writes.length>0);assert.ok(writes.every(c=>!c.input?.includes('KeepCloudPicture')&&!c.input?.includes('KeepCellPicture')),'无需重建或重新上传云端资源');
  await preservedAfterRepeat(f);
});
test('选择保留飞书后再次修改同一格，仍须保护该人工内容；无变化重复同步不重复冲突',async t=>{
  const f=await initialized(t);save(f,d=>{d.items[0].blocks[0][1]='最初文本';});await f.sync();
  f.cloud('4',s=>s.replace('最初文本',cloudText));save(f,d=>{d.items[0].blocks[0][1]='本地不同版本';});let conflict;
  await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});
  await f.sync({resolveConflict:conflict.id,resolutions:Object.fromEntries(conflict.sections.map(s=>[s.key,'remote']))});
  await preservedAfterRepeat(f);const before=meaningful(f),updates=f.state.updates;
  save(f,d=>{d.items[0].blocks[0][1]='本地未来又改同格';});
  await assert.rejects(f.preview(),e=>e.code==='EXPORT_REMOTE_CONFLICT');
  assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);
});
test('飞书改变详细文案表格结构后，本地改格不得猜测行列对应或清掉新增结构',async t=>{
  const f=await initialized(t);f.cloud('4',s=>s.replace('<tbody>','<tbody><tr><td colspan="3"><p>云端新增合并行</p></td></tr>'));
  f.save({background:{from:'人工',text:'先同步背景',goals:[]}});await f.sync();
  save(f,d=>{d.items[0].blocks[0][1]='本地格子文案';});const before=meaningful(f),updates=f.state.updates;
  await assert.rejects(f.preview(),e=>['EXPORT_STRUCTURE_CHANGED','EXPORT_REMOTE_CONFLICT'].includes(e.code));
  assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);assert.ok(xml(f).includes('云端新增合并行'));
});
test('缺少逐项选择或包含错误选择的冲突确认不能默认采用工作台',async t=>{
  const f=await initialized(t);f.cloud('4',s=>s.replace('<td><p></p></td>',`<td><p>${cloudText}</p></td>`));
  save(f,d=>{d.items[0].blocks[0][0]='本地同格';});let conflict;
  await assert.rejects(f.preview(),e=>{conflict=e.conflict;return e.code==='EXPORT_REMOTE_CONFLICT';});
  const before=meaningful(f),updates=f.state.updates;
  for(const resolutions of [undefined,{},Object.fromEntries(conflict.sections.map(s=>[s.key,'wrong']))]){
    await assert.rejects(f.preview({resolveConflict:conflict.id,...(resolutions===undefined?{}:{resolutions})}),e=>e.code==='EXPORT_CONFLICT_CHOICE_REQUIRED');
    assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);
  }
});

const reorderSpecRows=section=>section.replace(/<tbody>([\s\S]*?)<\/tbody>/,(_,body)=>{
  const rows=body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g);assert.equal(rows.length,3);
  return `<tbody>${[rows[1],rows[0],rows[2]].join('')}</tbody>`;
});
const reorderSpecColumns=section=>section.replace(/<tr\b[^>]*>[\s\S]*?<\/tr>/g,row=>{
  const cells=row.match(/<(?:th|td)\b[^>]*>[\s\S]*?<\/(?:th|td)>/g);assert.equal(cells.length,2);
  return `<tr>${cells[1]}${cells[0]}</tr>`;
});
for(const [name,transform] of [
  ['同形行重排',reorderSpecRows],
  ['同形列重排',reorderSpecColumns],
  ['非空首列标签变更',section=>section.replace('规格A','云端另一个规格名称')],
]){
  test(`第五节${name}已同步保留后，本地改格不能沿用旧坐标错写`,async t=>{
    const f=await storedCloud(t,'5',x=>x.cloud('5',transform));
    const before=meaningful(f),updates=f.state.updates;
    save(f,d=>{d.specs[0][1]='仅属于规格A的新内容';});
    await assert.rejects(f.preview(),e=>e.code==='EXPORT_STRUCTURE_CHANGED');
    assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);
    assert.ok(xml(f).includes(cloudText));assert.ok(!xml(f).includes('仅属于规格A的新内容'));
  });
}
test('第四节首列为空但文案A/B跨行交换后，不能把A的说明写到B行',async t=>{
  const f=await initialized(t);
  save(f,d=>{d.items[0].blocks[0][1]='文案A';d.items[0].blocks[1][1]='文案B';});await f.sync();
  f.cloud('4',reorderSpecRows);
  f.save({background:{from:'人工',text:'先保留文案行交换',goals:[]}});await f.sync();
  const before=meaningful(f),updates=f.state.updates;
  save(f,d=>{d.items[0].blocks[0][2]='只属于文案A的说明';});
  await assert.rejects(f.preview(),e=>e.code==='EXPORT_STRUCTURE_CHANGED');
  assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);
  assert.ok(xml(f).includes('文案A'));assert.ok(xml(f).includes('文案B'));assert.ok(!xml(f).includes('只属于文案A的说明'));
});
test('本地全空而飞书填入A/B并同步后再换行，须用云端基线阻止旧坐标写入',async t=>{
  const f=await initialized(t);
  f.cloud('4',section=>section.replace(/<tbody>([\s\S]*?)<\/tbody>/,(_,body)=>{
    const rows=body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g);assert.equal(rows.length,3);
    for(const [index,text] of ['纯云端文案A','纯云端文案B'].entries()){
      const cells=rows[index].match(/<td\b[^>]*>[\s\S]*?<\/td>/g);assert.equal(cells.length,3);
      cells[1]=`<td><p>${text}</p></td>`;rows[index]=`<tr>${cells.join('')}</tr>`;
    }
    return `<tbody>${rows.join('')}</tbody>`;
  }));
  f.save({background:{from:'人工',text:'保存纯云端文案基线',goals:[]}});await f.sync();
  assert.deepEqual(f.service.read(f.month).items[0].blocks,[['','',''],['','',''],['','','']]);
  f.cloud('4',reorderSpecRows);
  const before=meaningful(f),updates=f.state.updates;
  save(f,d=>{d.items[0].blocks[0][2]='原第一行文案A的说明';});
  await assert.rejects(f.preview(),e=>e.code==='EXPORT_STRUCTURE_CHANGED');
  assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);
  assert.ok(xml(f).includes('纯云端文案A'));assert.ok(xml(f).includes('纯云端文案B'));assert.ok(!xml(f).includes('原第一行文案A的说明'));
});
for(const [kind,resources] of [
  ['纯图片',['<image token="CloudResourceA"/>','<image token="CloudResourceB"/>']],
  ['无可见文字链接',['<a href="https://example.com/resource-a"></a>','<a href="https://example.com/resource-b"></a>']],
]){
  test(`云端仅有${kind}的两行交换后，资源不能当作空白忽略`,async t=>{
    const f=await initialized(t);
    f.cloud('4',section=>section.replace(/<tbody>([\s\S]*?)<\/tbody>/,(_,body)=>{
      const rows=body.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g);assert.equal(rows.length,3);
      for(const [index,resource] of resources.entries()){
        const cells=rows[index].match(/<td\b[^>]*>[\s\S]*?<\/td>/g);assert.equal(cells.length,3);
        cells[1]=`<td><p>${resource}</p></td>`;rows[index]=`<tr>${cells.join('')}</tr>`;
      }
      return `<tbody>${rows.join('')}</tbody>`;
    }));
    f.save({background:{from:'人工',text:'先保存纯资源云端基线',goals:[]}});await f.sync();
    f.cloud('4',reorderSpecRows);
    const before=meaningful(f),updates=f.state.updates;
    save(f,d=>{d.items[0].blocks[0][2]='原第一行资源的说明';});
    await assert.rejects(f.preview(),e=>e.code==='EXPORT_STRUCTURE_CHANGED');
    assert.equal(f.state.updates,updates);assert.equal(meaningful(f),before);
    for(const resource of resources)assert.ok(xml(f).includes(resource));
    assert.ok(!xml(f).includes('原第一行资源的说明'));
  });
}
