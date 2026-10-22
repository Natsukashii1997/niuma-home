import {test} from 'node:test';
import assert from 'node:assert/strict';
import {briefXml} from '../server/briefs.mjs';
import {briefSections,replaceBriefSection} from '../server/brief-sync-plan.mjs';
import {projectBriefCloud,briefCloudText,decodeBriefEntities} from '../server/brief-cloud-project.mjs';
import {syncBriefMaterials} from '../server/brief-template.mjs';

const empty=()=>({title:'设计 Brief',month:'2026-10',version:'v2',background:{from:'人工来源',text:'初稿背景',goals:['初稿目的']},materials:[],audience:[],timeline:[],items:[],specs:[],owners:[['需求对接',''],['内容确认',''],['设计对接','']],status:{1:'done',2:'part',3:'todo',4:'todo',5:'todo',6:'todo',7:'todo'}});
const base=()=>syncBriefMaterials(empty(),[{id:'a',name:'海报A'},{id:'b',name:'海报B'}]);
const change=(xml,index,fn)=>replaceBriefSection(xml,String(index),fn(briefSections(xml)[index].xml));
const project=(brief,xml,options={})=>projectBriefCloud({brief,xml,documentUrl:'https://example.com/brief',...options});

function replaceCell(section,row,col,text){
  let table=0;return section.replace(/<tbody>([\s\S]*?)<\/tbody>/g,(whole,body)=>{
    if(table++)return whole;const rows=body.match(/<tr>[\s\S]*?<\/tr>/g);
    const cells=rows[row].match(/<td[^>]*>[\s\S]*?<\/td>/g);cells[col]=`<td><p>${text}</p></td>`;rows[row]=`<tr>${cells.join('')}</tr>`;
    return `<tbody>${rows.join('')}</tbody>`;
  });
}

test('标准往返不产生伪变化，保留状态、来源、引用与空白占位规则',()=>{
  const b=base();b.items[0].refs=[{kind:'poster',title:'参考海报'}];b.items[0].reuse={month:'2026-09',title:'旧物料'};b.items[0].priceFrom='价格档案';
  const result=project(b,briefXml(b));assert.deepEqual(result.brief,b);assert.deepEqual(result.importedFields,[]);assert.deepEqual(result.supplement,[]);
});

test('七节标准字段回填并保留本地元数据',()=>{
  const b=base(),remote=structuredClone(b);remote.title='云端标题';remote.background.text='云端背景\n第二段';remote.background.goals=['目的甲','目的乙'];remote.audience[0][1]='云端受众';remote.timeline[0][1]='2026-11-01';remote.items[0].blocks[0][1]='云端详细文案';remote.specs=[['海报A','竖版']];remote.owners[0][1]='云端负责人';
  const result=project(b,briefXml(remote));assert.deepEqual(result.brief,remote);assert.equal(result.brief.background.from,'人工来源');assert.deepEqual(result.brief.status,b.status);assert.deepEqual(result.supplement,[]);assert.deepEqual(result.importedFields,['title','background','audience','timeline','items','specs','owners']);
});

test('正文实体和段落换行准确，末尾竖线不会消失',()=>{
  assert.equal(decodeBriefEntities('&amp;&lt;&gt;&quot;&apos;&#65;&#x1F600;&nbsp;'),'&<>"\'A😀 ');
  assert.equal(decodeBriefEntities('&#x110000; &#xD800;'),'&#x110000; &#xD800;');
  assert.equal(briefCloudText('<p>甲 &amp; 乙<br/>第二行 |</p><p>&lt;脚本&gt;&#x4E2D;</p>'),'甲 & 乙\n第二行 |\n<脚本>中');
  const b=base();const xml=change(briefXml(b),4,s=>s.replace('<td><p></p></td>','<td><p><b>加粗</b><br/>第二行 |</p><p>新段落</p></td>'));
  assert.equal(project(b,xml).brief.items[0].blocks[0][0],'加粗\n第二行 |\n新段落');
});

test('正文链接和图片提取可见文案，安全资源保留为补充，不生成图片或链接回写指令',()=>{
  const b=base(),xml=change(briefXml(b),4,s=>replaceCell(s,0,1,'<b>人工文案</b><a href="https://example.com/ref?a=1&amp;b=2">参考</a><a href="javascript:alert(1)">不可执行链接</a><image token="CloudOnly"/>'));
  const r=project(b,xml);assert.equal(r.brief.items[0].blocks[0][1],'人工文案参考不可执行链接');assert.ok(!r.brief.items[0].blocks[0][1].includes('CloudOnly'));
  const extra=r.supplement.find(s=>s.materialId==='a');assert.equal(extra.hasResources,true);assert.deepEqual(extra.links,[{label:'参考',url:'https://example.com/ref?a=1&b=2'}]);assert.ok(!JSON.stringify(extra).includes('javascript:'));
});

test('云端物料标题按稳定ID识别，联动三个标准板块的本地名称',()=>{
  const b=base();let xml=briefXml(b).replace('<h2>4.1 海报A</h2>','<h2 id="keepA">4.1 飞书新版海报</h2>');
  const r=project(b,xml,{materials:[{id:'a',name:'海报A',headingId:'keepA'},b.materials[1]],rows:{2:[{id:'a',name:'海报A'},{id:'b',name:'海报B'}],3:[{id:'a',name:'海报A'},{id:'b',name:'海报B'}]}});
  assert.equal(r.brief.materials[0].name,'飞书新版海报');assert.equal(r.brief.items[0].title,'飞书新版海报');assert.equal(r.brief.audience[0][0],'飞书新版海报');assert.equal(r.brief.timeline[0][0],'飞书新版海报');assert.ok(r.supplement.some(s=>s.label.includes('原名称')));
});

test('额外段落、第四节前缀和云端独有物料在补充中可见，不造本地对应关系',()=>{
  const b=base(),xml=change(briefXml(b),4,s=>s.replace('</h1>','</h1><p>第四节总说明</p>').replace('</h2>','</h2><p>设计师补充要求</p>')+'<h2>4.3 飞书独有物料</h2><p>独有正文<a href="https://example.com/extra">独有链接</a></p>');
  const r=project(b,xml);assert.deepEqual(r.brief,b);assert.equal(r.brief.materials.length,2);assert.ok(r.supplement.some(s=>s.text==='第四节总说明'));assert.ok(r.supplement.some(s=>s.materialId==='a'&&s.text==='设计师补充要求'));assert.ok(r.supplement.some(s=>s.text.includes('独有正文')&&s.links.length===1));
});

for(const [name,transform] of [
  ['合并单元格',s=>s.replace('<td><p></p></td>','<td colspan="2"><p>合并文字</p></td>')],
  ['多张表格',s=>s+s.match(/<table>[\s\S]*?<\/table>/)[0]],
  ['表头改变',s=>s.replace('说明/示例','其他列')],
])test(`${name}不猜测覆盖原三列表格，完整内容保留补充`,()=>{
  const b=base();b.items[0].blocks[0][1]='本地原内容';const original=briefXml(b),groups=briefSections(original)[4].xml;
  const a=groups.slice(groups.indexOf('<h2>'),groups.indexOf('<h2>4.2'));
  const r=project(b,original.replace(a,transform(a)));assert.deepEqual(r.brief.items[0].blocks,b.items[0].blocks);assert.ok(r.supplement.some(s=>s.materialId==='a'&&s.text.includes('本地原内容')));
});

test('受众表未知非空行和表外内容不会丢失或回填到错误物料',()=>{
  const b=base(),xml=change(briefXml(b),2,s=>s.replace('<tbody>','<tbody><tr><td><p>云端独有物料</p></td><td><p>其他受众</p></td><td><p>其他待办</p></td></tr>')+'<p>表外说明</p>');
  const r=project(b,xml);assert.deepEqual(r.brief.audience,b.audience);assert.ok(r.supplement.some(s=>s.section===2&&s.text.includes('其他待办')));assert.ok(r.supplement.some(s=>s.text==='表外说明'));
});

test('纯图片尾行保留，不因看不见文字当作空白裁掉',()=>{
  const b=base();b.specs=[];const xml=change(briefXml(b),5,s=>replaceCell(s,2,1,'<image token="Keep"/>'));
  const r=project(b,xml);assert.equal(r.brief.specs.length,3);assert.ok(r.supplement.some(s=>s.section===5&&s.hasResources));
});

test('旧四列规格和三列负责人不从拼接文本反推结构',()=>{
  const b=base();b.specs=[['海报A','3:4','800x1200','png']];b.owners=[['设计','小王','待确认']];
  assert.deepEqual(project(b,briefXml(b)).brief,b);
  const xml=change(briefXml(b),5,s=>s.replace('3:4 / 800x1200 / png','飞书新规格'));
  const r=project(b,xml);assert.deepEqual(r.brief.specs,b.specs);assert.ok(r.supplement.some(s=>s.section===5&&s.text.includes('飞书新规格')));
});

test('skip 与九宫格回填兼容，引用与沿用元数据保留',()=>{
  const b=base();b.items[0]={id:'a',kind:'skip',title:'海报A',note:'旧说明'};b.items[1]={id:'b',kind:'grid9',title:'海报B',cells:Array(9).fill(''),refs:[{kind:'poster',title:'参考'}],reuse:null};
  const remote=structuredClone(b);remote.items[0].note='云端说明';remote.items[1].cells[3]='云端第四格';assert.deepEqual(project(b,briefXml(remote)).brief,remote);
});

test('附件及复杂背景内容仅作为补充展示，原目标文字状态不丢失',()=>{
  const b=base();let xml=change(briefXml(b),1,s=>s.replace('</ul>','</ul><p>目的后追加段落</p>'));xml=change(xml,7,s=>s+'<p>云端附件说明</p><file token="Attachment"/>');
  const r=project(b,xml);assert.deepEqual(r.brief,b);assert.ok(r.supplement.some(s=>s.section===1&&s.text==='目的后追加段落'));assert.ok(r.supplement.some(s=>s.section===7&&s.text.includes('云端附件说明')&&s.hasResources));
});

test('重复物料名或缺失七节结构停止投影',()=>{
  const b=base();assert.throws(()=>project(b,briefXml(b),{materials:[{id:'a',name:'同名'},{id:'b',name:'同名'}]}),/映射重复/);assert.throws(()=>project(b,'<title>文档</title><p>内容</p>'),/七节结构/);
});


test('空物料和默认三空行不会制造回填版本变化',()=>{
  const b=empty(),r=project(b,briefXml(b));assert.deepEqual(r.brief,b);assert.deepEqual(r.importedFields,[]);assert.deepEqual(r.supplement,[]);
});

test('未知背景结构不能清空本地已有目标',()=>{
  const b=base(),xml=change(briefXml(b),1,s=>s.replace(/<ul>[\s\S]*?<\/ul>/,'<callout><p>云端目标结构</p></callout>'));
  const r=project(b,xml);assert.deepEqual(r.brief.background.goals,b.background.goals);assert.ok(r.supplement.some(x=>x.section===1&&x.text==='云端目标结构'));
});

test('无云端修改时保留原缩进、边缘空白和内部空行，不制造导入版本',()=>{
  const b=base();b.title=' 设计 Brief ';b.background.text='  保留段首\n\n  第二段\n';b.background.goals=['  第一个目的  ','第二个目的\n\n  补充'];
  b.audience[0]=['海报A','  面向人群\n  第二行  ',' 当前状态 '];b.timeline[0][1]=' 2026-11-01 ';
  b.items[0].blocks=[[' 标题 ','  原本的详细文案\n\n  保留空行  ',' 示例 '],[' 内容 ','  另一个板块  ','']];
  b.specs=[[' 海报A ','  竖版\n  补充说明 ']];b.owners[0][1]='  小王  ';
  const r=project(b,briefXml(b));assert.deepEqual(r.brief,b);assert.deepEqual(r.importedFields,[]);assert.deepEqual(r.supplement,[]);
});

test('实质云端改文案和内部空行仍导入，相邻未改字段保留原空白',()=>{
  const b=base();b.background.text='  第一段\n第二段 ';b.items[0].blocks=[[' 标题 ',' 原详细文案 ',' 原示例 ']];
  const remote=structuredClone(b);remote.background.text='第一段\n\n第二段';remote.items[0].blocks[0][1]='新详细文案';
  const r=project(b,briefXml(remote));assert.equal(r.brief.background.text,'第一段\n\n第二段');assert.deepEqual(r.brief.items[0].blocks,[[' 标题 ','新详细文案',' 原示例 ']]);assert.deepEqual(r.importedFields,['background','items']);
});

test('物料重排按稳定ID保留空白，不能按之前的数组位置恢复',()=>{
  const b=base();b.audience[0][1]=' A受众 ';b.audience[1][1]='  B受众  ';b.timeline[0][1]=' A时间 ';b.timeline[1][1]='  B时间  ';
  b.items[0].blocks=[[' A标题 ',' A文案 ','']];b.items[1].blocks=[[' B标题 ',' B文案 ','']];
  const remote=syncBriefMaterials(b,[...b.materials].reverse()),r=project(b,briefXml(remote),{materials:remote.materials});
  assert.deepEqual(r.brief,remote);assert.equal(r.brief.audience[0][1],'  B受众  ');assert.equal(r.brief.items[0].blocks[0][1],' B文案 ');
});

test('表格行重排与局部修改使用行内容和唯一标签匹配，保留正确行的原空白',()=>{
  const b=base();b.items[0].blocks=[[' A标题 ',' A文案 ',' A示例 '],['  B标题  ','  B文案  ','  B示例  ']];b.specs=[[' 规格A ',' 值A '],['  规格B  ','  值B  ']];
  const remote=structuredClone(b);remote.items[0].blocks.reverse();remote.items[0].blocks[0][1]='B云端新文案';remote.specs.reverse();
  const r=project(b,briefXml(remote));assert.deepEqual(r.brief.items[0].blocks,[['  B标题  ','B云端新文案','  B示例  '],[' A标题 ',' A文案 ',' A示例 ']]);assert.deepEqual(r.brief.specs,remote.specs);
});

test('无标签行只用唯一一致的单元格识别，无法识别的重复行不套用旧位置空白',()=>{
  const b=base();b.items[0].blocks=[['',' 甲文案 ',' 甲示例 '],['',' 乙文案 ',' 乙示例 ']];
  const remote=structuredClone(b);remote.items[0].blocks=[['','乙新文案','乙示例'],['','甲文案','甲示例']];
  const r=project(b,briefXml(remote));assert.deepEqual(r.brief.items[0].blocks,[['','乙新文案',' 乙示例 '],['',' 甲文案 ',' 甲示例 ']]);
  b.items[0].blocks=[['',' 重复文案 ',' 重复示例 '],['','  重复文案  ','  重复示例  ']];
  remote.items[0].blocks=[['','重复文案','新示例'],['','新文案','重复示例']];
  const ambiguous=project(b,briefXml(remote));assert.deepEqual(ambiguous.brief.items[0].blocks,remote.items[0].blocks);
});

test('普通说明和九宫格无变化也保留原空白，目标重排保留对应文字',()=>{
  const b=base();b.background.goals=[' 目的甲 ','  目的乙  '];b.items[0]={id:'a',kind:'skip',title:'海报A',note:'  原说明\n\n  第二段 '};b.items[1]={id:'b',kind:'grid9',title:'海报B',cells:Array.from({length:9},(_,i)=>`  第${i+1}格  `),refs:[],reuse:null};
  assert.deepEqual(project(b,briefXml(b)).brief,b);
  const remote=structuredClone(b);remote.background.goals.reverse();remote.items[1].cells[3]='云端更新第四格';
  const r=project(b,briefXml(remote));assert.deepEqual(r.brief,remote);
});
