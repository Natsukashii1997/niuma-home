import {canonicalXml} from './feishu-xml.mjs';
import {normalizeMaterialName} from './brief-template.mjs';

// Read-only block locations; XML is data, never a resource upload instruction.
export function blocks(source) {
  const root={tag:'root',children:[]},stack=[root];
  for(const match of source.matchAll(/<[^>]*>|[^<]+/g)){
    const token=match[0];if(!token.startsWith('<'))continue;
    if(token.startsWith('</')){const node=stack.pop();if(!node||token!==`</${node.tag}>`)throw Error('XML结构不完整');node.end=match.index+token.length;continue;}
    const m=token.match(/^<([a-z0-9-]+)((?:\s+[\w-]+="[^"]*")*)\s*(\/?)>$/);
    if(!m)throw Error('XML结构不支持安全更新');
    const node={tag:m[1],id:m[2].match(/\sid="([^"]+)"/)?.[1],start:match.index,end:match.index+token.length,children:[]};
    stack.at(-1).children.push(node);if(!m[3])stack.push(node);
  }
  if(stack.length!==1)throw Error('XML结构不完整');return root.children;
}
export function briefSections(xml) {
  const sections=[];
  for(const node of blocks(xml)){
    if(node.tag==='title'||node.tag==='h1')sections.push({key:node.tag==='title'?'title':String(sections.length),nodes:[]});
    if(!sections.length)throw Error('缺少文档标题');sections.at(-1).nodes.push(node);
  }
  if(sections.length!==8||sections[0].key!=='title')throw Error('飞书 Brief 章节结构已变化，请先恢复七节结构');
  return sections.map(s=>({...s,xml:xml.slice(s.nodes[0].start,s.nodes.at(-1).end),label:xml.slice(s.nodes[0].start,s.nodes[0].end).replace(/<[^>]*>/g,'')}));
}
const identity=(xml,widths)=>canonicalXml(xml,{widths,allowResources:true});
export const exactBriefXml=xml=>identity(xml,true);
// Legacy exports lacked widths and empty body rows. Ignore these only when
// deciding whether the human text changed; full readback still checks them.
export function briefMeaning(xml){
  const tree=JSON.parse(identity(xml,false));
  function walk(nodes){return nodes.map(n=>{
    if(n[0]==='table'){
      return ['table',n[1].flatMap(child=>{
        if(child[0]!=='tbody')return[child];
        const rows=[...child[1]];
        while(rows.length&&rows.at(-1)[0]==='tr'&&rows.at(-1)[1].every(cell=>['td','th'].includes(cell[0])&&!cell[3]&&!cell[4]))rows.pop();
        return rows.length?[['tbody',rows]]:[];
      })];
    }
    return n;
  });}
  return JSON.stringify(walk(tree));
}

const xmlText=xml=>xml.replace(/<\/(?:p|h\d|tr|li)>/g,'\n').replace(/<\/(?:td|th)>/g,' | ').replace(/<br\s*\/>/g,'\n').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();
const nameOf=xml=>xmlText(xml.replace(/<\/(?:td|th)>/g,'')).replace(/^4\.\d+\s*/, '').replace(/\s+/g,' ').trim();
const slice=(xml,nodes)=>nodes.length?xml.slice(nodes[0].start,nodes.at(-1).end):'';
const ids=nodes=>nodes.flatMap(n=>n.id?[n.id]:ids(n.children));
const clean=xml=>xml.replace(/\s+id="[^"]*"/g,'');
const groups=xml=>{
  const section=briefSections(xml)[4], list=[];
  for(const node of section.nodes.slice(1)){
    if(node.tag==='h2')list.push({nodes:[],name:nameOf(xml.slice(node.start,node.end)),headingId:node.id});
    if(list.length)list.at(-1).nodes.push(node);
  }
  return list.map(g=>({...g,xml:slice(xml,g.nodes),heading:slice(xml,g.nodes.slice(0,1)),body:slice(xml,g.nodes.slice(1))}));
};
function uniqueNames(materials){if(new Set(materials.map(m=>m.name)).size!==materials.length)throw Error('物料名称重复，请给每份物料一个不同的名称后同步');}
function materialsFor(base,local,options){
  const current=(options.materials||groups(local).map((g,i)=>({id:`legacy-${i}`,name:g.name}))).map(m=>({...m,name:normalizeMaterialName(m.name)}));
  uniqueNames(current);
  let previous=options.baseMaterials;
  if(!previous){previous=groups(base).map(g=>{
    const found=current.filter(m=>m.name===g.name);
    if(found.length!==1)throw Error(`旧文档的「${g.name}」还没有物料对应记录，请先恢复该名称并同步一次，再改名或删除`);
    return{id:found[0].id,name:g.name};
  });}
  previous=previous.map(m=>({...m,name:normalizeMaterialName(m.name)}));uniqueNames(previous);return{previous,current};
}
function bindGroups(xml,materials,anchors){
  const list=groups(xml),used=new Set(),out=new Map();
  for(const m of materials){
    const anchor=anchors?.find(a=>a.id===m.id), name=anchor?.name??m.name;
    let candidates=list.filter(g=>!used.has(g)&&anchor?.headingId&&g.headingId===anchor.headingId);
    if(!candidates.length)candidates=list.filter(g=>!used.has(g)&&g.name===name);
    if(candidates.length!==1)throw Error(`无法唯一定位飞书中的「${name}」，请检查该物料是否被改名或删除；本次未写入`);
    used.add(candidates[0]);out.set(m.id,candidates[0]);
  }
  return {out,extras:list.filter(g=>!used.has(g))};
}
function operation(xml,key,label,nodes,content,command='block_replace'){
  const locations=ids(nodes);if(!locations.length)throw Error(`「${label}」缺少飞书定位，暂不能安全更新`);
  return{key,label,start:command==='block_insert_after'?locations.at(-1):locations[0],end:locations.at(-1),content,command,from:nodes[0].start,to:nodes.at(-1).end};
}
function located(xml){
  const walk=(nodes,path=[],parents=[])=>nodes.flatMap((n,i)=>[{...n,path:[...path,i],parents},...walk(n.children,[...path,i],[...parents,n])]);
  return walk(blocks(xml));
}
export function locateBriefEdit(xml,edit){
  const all=located(xml),first=all.find(n=>n.id===edit.start),last=all.find(n=>n.id===edit.end);
  if(!first||!last)throw Error('更新定位已失效');
  return{...edit,startPath:first.path,endPath:last.path,startMeaning:exactBriefXml(xml.slice(first.start,first.end)),endMeaning:exactBriefXml(xml.slice(last.start,last.end))};
}
export function refreshBriefEdit(xml,edit){
  const all=located(xml),find=path=>all.find(n=>JSON.stringify(n.path)===JSON.stringify(path)),first=find(edit.startPath),last=find(edit.endPath);
  if(!first?.id||!last?.id||exactBriefXml(xml.slice(first.start,first.end))!==edit.startMeaning||exactBriefXml(xml.slice(last.start,last.end))!==edit.endMeaning)throw Error('待同步内容的定位发生变化，未继续写入');
  return{...edit,start:first.id,end:last.id};
}
export function applyBriefEdit(xml,edit){
  const all=located(xml),start=all.find(n=>n.id===edit.start),end=all.find(n=>n.id===edit.end);
  if(!start||!end)throw Error('更新定位已失效');
  if(edit.command==='block_insert_after'){
    let at=end.end;for(const parent of end.parents)if(['ul','ol'].includes(parent.tag)&&parent.children.at(-1).end===end.end)at=parent.end;
    return xml.slice(0,at)+edit.content+xml.slice(at);
  }
  let from=start.start,to=end.end;
  // Feishu list items are document blocks; ul/ol are XML presentation wrappers.
  for(const parent of start.parents)if(['ul','ol'].includes(parent.tag)&&parent.children[0].start===start.start&&end.end>=parent.children.at(-1).end)from=parent.start;
  for(const parent of end.parents)if(['ul','ol'].includes(parent.tag)&&parent.children.at(-1).end===end.end&&start.start<=parent.children[0].start)to=parent.end;
  return xml.slice(0,from)+(edit.command==='block_delete'?'':edit.content)+xml.slice(to);
}
// Two independent baselines remember explicit decisions to keep cloud content.
// Only generated fragments are written. Cloud-only blocks stay at their IDs.
export function planBriefSync(base,local,remote,force=[],options={}) {
  const b=briefSections(base),l=briefSections(local),r=briefSections(remote),rb=briefSections(options.remoteBase||base),edits=[],conflicts=[];
  const resolutions=Array.isArray(force)?Object.fromEntries(force.map(k=>[k,'local'])):force;
  const choose=(key,label,before,next,cloud,cloudBefore=before)=>{
    if(briefMeaning(next)===briefMeaning(before)||briefMeaning(next)===briefMeaning(cloud))return cloud;
    if(resolutions[key]==='remote')return cloud;
    if(resolutions[key]!=='local'&&briefMeaning(cloud)!==briefMeaning(cloudBefore)){
      conflicts.push({key,label,local:xmlText(next),remote:xmlText(cloud)});return cloud;
    }
    return next;
  };
  const {previous,current}=materialsFor(base,local,options);
  const bg=bindGroups(base,previous).out,lg=bindGroups(local,current).out;
  const remoteAnchors=options.remoteMaterials||previous;
  const rg=bindGroups(remote,previous,remoteAnchors),rbg=bindGroups(options.remoteBase||base,previous,remoteAnchors).out;
  for(const m of current)if(!previous.some(p=>p.id===m.id)&&rg.extras.some(g=>g.name===m.name))throw Error(`飞书已有同名物料「${m.name}」，请先核对名称，未重复插入`);
  const resultMaterials=[];
  for(const m of previous){
    const old=bg.get(m.id),next=lg.get(m.id),cloud=rg.out.get(m.id),cloudBefore=rbg.get(m.id);
    if(!next){
      const chosen=choose(`4:${m.id}:delete`,`${m.name} · 删除物料`,old.xml,'',cloud.xml,cloudBefore.xml);
      if(!chosen)edits.push(operation(remote,`4:${m.id}:delete`,`${m.name} · 删除物料`,cloud.nodes,'','block_delete'));
      // Kept deleted materials become remote-only and are never reintroduced as local IDs.
      continue;
    }
    const heading=choose(`4:${m.id}:heading`,`${m.name} · 名称`,old.heading,next.heading,cloud.heading,cloudBefore.heading);
    const body=choose(`4:${m.id}:body`,`${m.name} · 文案框架`,old.body,next.body,cloud.body,cloudBefore.body);
    if(heading!==cloud.heading)edits.push(operation(remote,`4:${m.id}:heading`,`${m.name} · 名称`,cloud.nodes.slice(0,1),heading));
    if(body!==cloud.body){
      if(cloud.nodes.length>1)edits.push(operation(remote,`4:${m.id}:body`,`${m.name} · 文案框架`,cloud.nodes.slice(1),body,body?'block_replace':'block_delete'));
      else edits.push(operation(remote,`4:${m.id}:body`,`${m.name} · 文案框架`,cloud.nodes.slice(0,1),body,'block_insert_after'));
    }
    resultMaterials.push({id:m.id,name:nameOf(heading),headingId:heading===cloud.heading?cloud.headingId:undefined});
  }
  // Group adjacent new materials in a single insert. The predecessor is always
  // an existing cloud block, so the preflight does not invent future block IDs.
  let pending=[],anchor=r[4].nodes[0];
  const flush=()=>{if(pending.length){edits.push(operation(remote,`4:add:${pending.map(m=>m.id).join(',')}`,'新增物料', [anchor],pending.map(m=>lg.get(m.id).xml).join(''),'block_insert_after'));pending=[];}};
  for(const m of current){
    const cloud=rg.out.get(m.id);
    if(cloud){flush();anchor=cloud.nodes.at(-1);}else{pending.push(m);resultMaterials.push({id:m.id,name:m.name});}
  }flush();
  // Existing rows use paragraph IDs, so a name edit never rewrites other cells.
  // Row additions/deletions rebuild only plain-text tables; cloud resources are
  // deliberately refused rather than uploaded again or silently discarded.
  const resultRows={};
  for(const i of [2,3]){
    const tables=s=>s.nodes.find(n=>n.tag==='table'),bt=tables(b[i]),lt=tables(l[i]),rt=tables(r[i]),rbt=tables(rb[i]);
    const rows=t=>t?.children.find(n=>n.tag==='tbody')?.children.filter(n=>n.tag==='tr')||[];
    const br=rows(bt),lr=rows(lt),rr=rows(rt),rbr=rows(rbt);
    if(!bt||!lt||!rt||!rbt)throw Error('受众或交付时间的表格结构已变化，请保留原表格后再同步');
    const cellName=(xml,row)=>row?nameOf(slice(xml,row.children.slice(0,1))):'';
    const bindings=new Map(),baseBindings=new Map(),used=new Set();
    for(const [index,m] of previous.entries()){
      const saved=options.remoteRows?.[i]?.find(a=>a.id===m.id),name=saved?.name??m.name;
      const oldRows=rbr.filter(row=>cellName(options.remoteBase||base,row)===name);
      if(oldRows.length!==1)throw Error(`无法定位第 ${i} 节「${name}」的同步基线`);
      const firstIds=ids(oldRows[0].children[0].children);
      let found=rr.filter(row=>!used.has(row)&&ids(row.children[0].children).some(id=>firstIds.includes(id)));
      if(found.length!==1)found=rr.filter(row=>!used.has(row)&&cellName(remote,row)===name);
      if(found.length!==1)throw Error(`无法唯一定位第 ${i} 节「${name}」，请恢复名称或对应行后重试`);
      bindings.set(m.id,found[0]);baseBindings.set(m.id,oldRows[0]);used.add(found[0]);
    }
    for(const m of current)if(!previous.some(p=>p.id===m.id)&&rr.some(row=>!used.has(row)&&cellName(remote,row)===m.name))throw Error(`第 ${i} 节已有同名新增行「${m.name}」，请先核对，未重复插入`);
    const merged=[],rowMeta=[];
    for(const [index,m] of current.entries()){
      const pi=previous.findIndex(p=>p.id===m.id),old=br[pi],next=lr[index],cloud=bindings.get(m.id),cloudBase=baseBindings.get(m.id);
      if(!next)throw Error('物料与表格行数不一致');
      if(!cloud){merged.push(slice(local,[next]));rowMeta.push({id:m.id,name:m.name});continue;}
      const cells=next.children.map((cell,j)=>{
        const key=`${i}:${m.id}:${j}`,label=`${m.name} · ${i===2?['物料名称','面向人群','状态与待办'][j]:['物料名称','交付时间','优先级','需求对接人','说明'][j]}`;
        const before=slice(base,[old.children[j]]),after=slice(local,[cell]),cloudValue=slice(remote,[cloud.children[j]]),cloudBefore=slice(options.remoteBase||base,[cloudBase.children[j]]);
        return{key,label,xml:choose(key,label,before,after,cloudValue,cloudBefore),cloud:cloud.children[j],original:cloudValue};
      });
      merged.push(`<tr>${cells.map(c=>c.xml).join('')}</tr>`);rowMeta.push({id:m.id,name:nameOf(cells[0].xml)});
      // Save potential cell edits only if no row structure change is needed.
      if(previous.length===current.length&&previous.every((p,j)=>p.id===current[j].id))for(const c of cells)if(c.xml!==c.original){
        const inside=blocks(c.xml)[0].children,content=slice(c.xml,inside);
        edits.push(operation(remote,c.key,c.label,c.cloud.children,content));
      }
    }
    const structural=previous.length!==current.length||previous.some((p,j)=>p.id!==current[j].id);
    if(structural){
      for(const [index,m] of previous.entries())if(!current.some(c=>c.id===m.id)){
        const cloud=bindings.get(m.id),chosen=choose(`${i}:${m.id}:delete`,`${m.name} · 第 ${i} 节行`,slice(base,[br[index]]),'',slice(remote,[cloud]),slice(options.remoteBase||base,[baseBindings.get(m.id)]));
        if(chosen)merged.push(chosen);
      }
      // Keep additional cloud rows; ignore only entirely empty padding rows.
      for(const row of rr)if(!used.has(row)&&briefMeaning(slice(remote,[row]))!==briefMeaning('<tr>'+row.children.map(()=>'<td><p></p></td>').join('')+'</tr>'))merged.push(slice(remote,[row]));
      while(merged.length<3)merged.push('<tr>'+lr[0]?.children.map(()=>'<td><p></p></td>').join('')+'</tr>');
      const cloudTable=slice(remote,[rt]);let content=cloudTable.replace(/<tbody>[\s\S]*?<\/tbody>/,`<tbody>${merged.join('')}</tbody>`);content=clean(content);
      try{canonicalXml(content);}catch{throw Error(`第 ${i} 节含飞书链接或资源，新增/删除物料时暂不能安全重排该表。原内容已保留，请先在飞书整理该表后重试`);}
      if(exactBriefXml(content)!==exactBriefXml(slice(remote,[rt])))edits.push(operation(remote,`${i}:rows`,`${i===2?'物料目标受众':'需求交付时间'} · 物料行`,[rt],content));
    }
    resultRows[i]=rowMeta;
  }
  for(const i of [0,1,5,6,7]){
    const value=choose(l[i].key,l[i].label,b[i].xml,l[i].xml,r[i].xml,rb[i].xml);
    if(value!==r[i].xml)edits.push(operation(remote,l[i].key,l[i].label,r[i].nodes,value));
  }
  // Work from the bottom upwards; insertion after an old heading precedes its
  // replacement, so anchors remain present until they are no longer needed.
  for(let i=0;i<edits.length;i++)edits[i]=locateBriefEdit(remote,edits[i]);
  edits.sort((a,b)=>b.to-a.to || (a.command==='block_insert_after'?-1:1));
  let expected=remote;for(const edit of edits)expected=applyBriefEdit(expected,edit);
  return{edits,conflicts,expected,resultMaterials,resultRows};
}
export function captureBriefAnchors(xml,materials){
  const {out}=bindGroups(xml,materials,materials);
  return materials.map(m=>({id:m.id,name:out.get(m.id).name,headingId:out.get(m.id).headingId}));
}
export function replaceBriefSection(remote,key,content){return briefSections(remote).map(s=>s.key===key?content:s.xml).join('\n');}
