import {blocks,briefSections} from './brief-sync-plan.mjs';
import {BRIEF_HEADS,syncBriefMaterials,normalizeMaterialName} from './brief-template.mjs';

// XML is read as data. No remote markup, resource instruction or URL is executed.
export const decodeBriefEntities=value=>String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(entity,code)=>{
  if(code[0]!=='#')return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[code.toLowerCase()];
  const point=code[1].toLowerCase()==='x'?parseInt(code.slice(2),16):Number(code.slice(1));
  return Number.isSafeInteger(point)&&point>=0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):entity;
});
export function briefCloudText(xml){
  return decodeBriefEntities(String(xml).replace(/<br\b[^>]*>/g,'\n').replace(/<\/(?:p|li|h[1-6]|tr)>/g,'\n').replace(/<\/(?:td|th)>/g,'\t').replace(/<[^>]*>/g,''))
    .replace(/\r/g,'').replace(/[ \t]*\n[ \t]*/g,'\n').trim();
}
const cellText=(xml,node)=>briefCloudText(xml.slice(node.start,node.end).replace(/<\/(?:td|th)>/g,''));
const attrs=(xml,node)=>Object.fromEntries([...xml.slice(node.start,xml.indexOf('>',node.start)+1).matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,decodeBriefEntities(v)]));
const all=nodes=>nodes.flatMap(node=>[node,...all(node.children)]);
const safeUrl=value=>{try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}};
const plainTags=new Set(['title','p','h1','h2','h3','h4','h5','h6','table','thead','tbody','tr','th','td','colgroup','col','ul','ol','li','b','strong','em','i','span','u','del','br','a']);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// The XML reader removes presentation indentation and edge whitespace. Restore
// an existing value only when that normalization is its entire difference.
// Internal spaces and the number of paragraph breaks remain meaningful.
const textMeaning=value=>typeof value==='string'?value.replace(/\r/g,'').replace(/[ \t]*\n[ \t]*/g,'\n').trim():value;
const restoreText=(before,after)=>typeof before==='string'&&typeof after==='string'&&textMeaning(before)===textMeaning(after)?before:after;
const rowMeaning=row=>row.map(textMeaning);
const restoreRow=(before,after)=>before?.length===after.length?after.map((value,i)=>restoreText(before[i],value)):after;
function restoreList(before=[],after=[]){
  if(same(before.map(textMeaning),after.map(textMeaning)))return after.map((value,i)=>restoreText(before[i],value));
  return after.map(value=>{
    const matches=before.filter(old=>textMeaning(old)===textMeaning(value));
    return matches.length===1&&after.filter(v=>textMeaning(v)===textMeaning(value)).length===1?restoreText(matches[0],value):value;
  });
}
function restoreTable(before=[],after=[]){
  const oldRows=before.map(rowMeaning),newRows=after.map(rowMeaning);
  if(same(oldRows,newRows))return after.map((row,i)=>restoreRow(before[i],row));
  const used=new Set();
  return after.map((row,i)=>{
    const meaning=newRows[i];
    let found=oldRows.map((old,index)=>({old,index})).filter(({old,index})=>!used.has(index)&&same(old,meaning));
    if(found.length!==1||newRows.filter(other=>same(other,meaning)).length!==1){
      // A unique row label, or a set of unique agreeing cell anchors, can
      // identify a changed/reordered row. Never reuse its previous array slot.
      const anchors=meaning.flatMap((value,column)=>{
        if(!value||newRows.filter(other=>other[column]===value).length!==1)return [];
        const candidates=oldRows.map((old,index)=>({old,index})).filter(({old,index})=>!used.has(index)&&old.length===meaning.length&&old[column]===value);
        return candidates.length===1?[{...candidates[0],column}]:[];
      });
      const label=anchors.find(anchor=>anchor.column===0);
      found=label?[label]:anchors.length&&anchors.every(anchor=>anchor.index===anchors[0].index)?[anchors[0]]:[];
    }
    if(found.length!==1)return row;
    used.add(found[0].index);return restoreRow(before[found[0].index],row);
  });
}

function restoreExistingWhitespace(before,after){
  after.title=restoreText(before.title,after.title);
  after.background.text=restoreText(before.background.text,after.background.text);
  after.background.goals=restoreList(before.background.goals,after.background.goals);
  const positions=new Map(before.materials.map((material,index)=>[material.id,index]));
  for(const field of ['audience','timeline'])after[field]=after[field].map((row,index)=>restoreRow(before[field][positions.get(after.materials[index].id)],row));
  for(const item of after.items){
    const previous=before.items.find(old=>old.id===item.id&&old.kind===item.kind);if(!previous)continue;
    if(item.blocks)item.blocks=restoreTable(previous.blocks,item.blocks);
    if(item.cells)item.cells=restoreList(previous.cells,item.cells);
    if(item.note!==undefined)item.note=restoreText(previous.note,item.note);
  }
  for(const field of ['specs','owners'])after[field]=restoreTable(before[field],after[field]);
}

/** Project the already-merged cloud document into the existing editable schema.
 * Unrepresentable fragments are returned as read-only supplements. The sync
 * transaction retains the full XML separately; these strings are never exports.
 */
export function projectBriefCloud({brief,xml,materials=brief.materials,rows={},documentUrl}){
  const sections=briefSections(xml),supplement=[];
  const source=nodes=>nodes.map(n=>xml.slice(n.start,n.end)).join('');
  const details=nodes=>{
    const every=all(nodes),links=[];
    for(const n of every.filter(n=>n.tag==='a')){
      const url=safeUrl(attrs(xml,n).href);if(url&&!links.some(x=>x.url===url))links.push({label:cellText(xml,n)||url,url});
    }
    return {text:briefCloudText(source(nodes)),links,hasResources:every.some(n=>!plainTags.has(n.tag))};
  };
  const add=(section,label,nodes,materialId,onlyResources=false)=>{
    if(!nodes.length)return;const d=details(nodes);
    if(onlyResources&&!d.links.length&&!d.hasResources)return;
    if(!d.text&&!d.links.length&&!d.hasResources)return;
    supplement.push({section,...(materialId?{materialId}:{}),label,...d});
  };
  const tableData=(node,width,heads)=>{
    if(!node||node.tag!=='table')return null;
    if(node.children.some(n=>!['colgroup','thead','tbody'].includes(n.tag)))return null;
    const bodies=node.children.filter(n=>n.tag==='tbody'),headers=node.children.filter(n=>n.tag==='thead');
    if(bodies.length!==1||headers.length>1)return null;
    if(all([node]).some(n=>n!==node&&n.tag==='table'))return null;
    const rowNodes=bodies[0].children;
    if(rowNodes.length>200||rowNodes.some(n=>n.tag!=='tr'||n.children.length!==width||n.children.some(c=>!['td','th'].includes(c.tag)||['rowspan','colspan'].some(k=>attrs(xml,c)[k]&&attrs(xml,c)[k]!=='1'))))return null;
    if(heads){
      if(headers.length!==1||headers[0].children.length!==1||headers[0].children[0].tag!=='tr')return null;
      const cells=headers[0].children[0].children;
      if(cells.some(c=>!['td','th'].includes(c.tag)||['rowspan','colspan'].some(k=>attrs(xml,c)[k]&&attrs(xml,c)[k]!=='1')))return null;
      const actual=cells.map(c=>cellText(xml,c));
      if(!same(actual,heads))return null;
    }else if(headers.length)return null;
    return {nodes:rowNodes,values:rowNodes.map(n=>n.children.map(c=>cellText(xml,c)))};
  };
  const body=i=>sections[i].nodes.slice(1);
  const trimPadding=(data,minimum)=>{
    const values=data.values.map(r=>[...r]);
    while(values.length>minimum&&values.at(-1).every(v=>!v)&&!details([data.nodes[values.length-1]]).hasResources&&!details([data.nodes[values.length-1]]).links.length)values.pop();
    return values;
  };
  const requested=materials.map(m=>({id:m.id,name:normalizeMaterialName(m.name)}));
  if(new Set(requested.map(m=>m.id)).size!==requested.length||new Set(requested.map(m=>m.name)).size!==requested.length)throw Error('飞书物料映射重复，未回填工作台');
  let next=syncBriefMaterials(brief,requested);
  next.title=cellText(xml,sections[0].nodes[0]);
  add(1,'文档标题补充',sections[0].nodes.slice(1));
  add(1,'标题中的链接或资源',sections[0].nodes.slice(0,1),undefined,true);

  const background=body(1),firstList=background.findIndex(n=>['ul','ol'].includes(n.tag));
  const beforeList=firstList<0?background:background.slice(0,firstList),paragraphs=beforeList.filter(n=>n.tag==='p');
  if(paragraphs.length){next.background.text=paragraphs.map(n=>cellText(xml,n)).filter(Boolean).join('\n');for(const n of paragraphs)add(1,'背景中的链接或资源',[n],undefined,true);}
  else if(!background.length)next.background.text='';
  for(const n of beforeList.filter(n=>n.tag!=='p'))add(1,'背景补充内容',[n]);
  if(firstList>=0){
    const list=background[firstList];
    if(list.children.length<=100&&list.children.every(n=>n.tag==='li'&&!all(n.children).some(c=>['ul','ol','table'].includes(c.tag)))){
      next.background.goals=list.children.map(n=>cellText(xml,n));add(1,'目标中的链接或资源',[list],undefined,true);
    }else add(1,'目标列表（保留飞书结构）',[list]);
    add(1,'背景与目标补充',background.slice(firstList+1));
  }else if(background.every(n=>n.tag==='p'))next.background.goals=[];

  // Headings use stable IDs first. Names are a conservative fallback for new
  // blocks whose server-generated IDs do not exist until the write completes.
  const groups=[],prefix=[];
  for(const node of body(4)){
    if(node.tag==='h2')groups.push({nodes:[],name:normalizeMaterialName(cellText(xml,node).replace(/^4\.\d+\s*/,'')),headingId:node.id});
    if(groups.length)groups.at(-1).nodes.push(node);else prefix.push(node);
  }
  add(4,'详细文案补充',prefix);
  const usedGroups=new Set(),mapped=new Map();
  for(const m of requested){
    const anchor=materials.find(a=>a.id===m.id);
    let found=groups.filter(g=>!usedGroups.has(g)&&anchor?.headingId&&g.headingId===anchor.headingId);
    if(found.length!==1)found=groups.filter(g=>!usedGroups.has(g)&&g.name===m.name);
    if(found.length!==1)continue;
    usedGroups.add(found[0]);mapped.set(m.id,found[0]);
  }
  const names=requested.map(m=>mapped.get(m.id)?.name||m.name);
  if(names.every(Boolean)&&new Set(names).size===names.length)next=syncBriefMaterials(next,requested.map((m,i)=>({...m,name:names[i]})));
  for(const group of groups.filter(g=>!usedGroups.has(g)))add(4,`${group.name||'未匹配物料'} · 飞书独有内容`,group.nodes);
  for(const item of next.items){
    const group=mapped.get(item.id);if(!group)continue;
    const nodes=group.nodes.slice(1),tables=nodes.filter(n=>n.tag==='table'),lists=nodes.filter(n=>n.tag==='ol');
    const consumed=new Set();
    if(['framework','price'].includes(item.kind)&&tables.length===1){
      const data=tableData(tables[0],3,BRIEF_HEADS.blocks);
      if(data){item.blocks=trimPadding(data,item.blocks.length);consumed.add(tables[0]);add(4,`${item.title} · 表格链接或资源`,[tables[0]],item.id,true);}
    }else if(item.kind==='skip'&&nodes.length===1&&nodes[0].tag==='p'){
      item.note=cellText(xml,nodes[0]);consumed.add(nodes[0]);add(4,`${item.title} · 说明链接或资源`,[nodes[0]],item.id,true);
    }else if(item.kind==='grid9'&&lists.length===1&&lists[0].children.length===9&&lists[0].children.every(n=>n.tag==='li'&&!all(n.children).some(c=>['ul','ol','table'].includes(c.tag)))){
      item.cells=lists[0].children.map(n=>cellText(xml,n));consumed.add(lists[0]);add(4,`${item.title} · 九宫格链接或资源`,[lists[0]],item.id,true);
    }
    // Known reference metadata is not reconstructed from human prose. Omit
    // only unchanged generated labels; changed or extra content stays visible.
    const known=[item.priceFrom?`来源：${item.priceFrom}`:null,...(item.refs||[]).map(r=>`参考：${r.title}`),item.reuse?`沿用：${item.reuse.month} ${item.reuse.title}`:null].filter(Boolean);
    for(const node of nodes)if(!consumed.has(node)&&node.tag==='p'){
      const at=known.indexOf(cellText(xml,node));if(at>=0){known.splice(at,1);consumed.add(node);add(4,`${item.title} · 参考链接或资源`,[node],item.id,true);}
    }
    add(4,`${item.title} · 飞书补充`,nodes.filter(n=>!consumed.has(n)),item.id);
    add(4,`${item.title} · 标题链接或资源`,group.nodes.slice(0,1),item.id,true);
  }

  for(const [section,field,width,heads] of [[2,'audience',3,BRIEF_HEADS.audience],[3,'timeline',5,BRIEF_HEADS.timeline]]){
    const nodes=body(section),tables=nodes.filter(n=>n.tag==='table');
    const data=tables.length===1?tableData(tables[0],width,heads):null;
    if(!data){add(section,`${section===2?'受众':'交付时间'}表格（保留飞书结构）`,nodes);continue;}
    const used=new Set();
    for(const [index,m] of next.materials.entries()){
      const anchor=rows[section]?.find(a=>a.id===m.id),name=normalizeMaterialName(anchor?.name??m.name);
      const candidates=data.values.map((row,i)=>({row,i})).filter(({row,i})=>!used.has(i)&&normalizeMaterialName(row[0])===name);
      if(candidates.length!==1)continue;
      const {row,i}=candidates[0];used.add(i);next[field][index]=[m.name,...row.slice(1)];
      if(normalizeMaterialName(row[0])!==m.name)add(section,`${m.name} · 飞书中的原名称`,[data.nodes[i]],m.id);
      else add(section,`${m.name} · 表格链接或资源`,[data.nodes[i]],m.id,true);
    }
    for(const [i,node] of data.nodes.entries())if(!used.has(i))add(section,'飞书未匹配行',[node]);
    add(section,'飞书表外补充',nodes.filter(n=>n!==tables[0]));
  }
  for(const [section,field,heads] of [[5,'specs',BRIEF_HEADS.specs],[6,'owners',null]]){
    const nodes=body(section),tables=nodes.filter(n=>n.tag==='table'),data=tables.length===1?tableData(tables[0],2,heads):null;
    if(!data){add(section,'飞书表格（保留原结构）',nodes);continue;}
    if(next[field].some(row=>row.length!==2)){
      const collapsed=next[field].map(r=>[r[0],r.slice(1).filter(Boolean).join(' / ')]),remote=trimPadding(data,collapsed.length);
      if(!same(remote,collapsed))add(section,'飞书更新（原多列字段保留）',[tables[0]]);
      else add(section,'飞书表格链接或资源',[tables[0]],undefined,true);
    }else{
      next[field]=trimPadding(data,next[field].length);add(section,'飞书表格链接或资源',[tables[0]],undefined,true);
    }
    add(section,'飞书表外补充',nodes.filter(n=>n!==tables[0]));
  }
  add(7,'飞书附件与补充',body(7));
  restoreExistingWhitespace(brief,next);
  const fields=['title','background','materials','audience','timeline','items','specs','owners','status'];
  return {brief:next,supplement,importedFields:fields.filter(key=>!same(brief[key],next[key]))};
}
