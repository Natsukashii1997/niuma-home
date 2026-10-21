import {canonicalXml} from './feishu-xml.mjs';

// Read-only block locations; XML is data, never a resource upload instruction.
function blocks(source) {
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
export function planBriefSync(base,local,remote,force=[]) {
  const b=briefSections(base),l=briefSections(local),r=briefSections(remote),edits=[],conflicts=[];
  const expected=r.map(s=>s.xml);
  l.forEach((section,i)=>{
    if(briefMeaning(section.xml)===briefMeaning(b[i].xml))return;
    if(briefMeaning(section.xml)===briefMeaning(r[i].xml))return;
    if(!force.includes(section.key)&&briefMeaning(r[i].xml)!==briefMeaning(b[i].xml)){
      conflicts.push({key:section.key,label:section.label,local:plainText(section.xml),remote:plainText(r[i].xml)});return;
    }
    const ids=r[i].nodes.flatMap(n=>n.id?[n.id]:n.children.flatMap(c=>c.id?[c.id]:[]));
    if(!ids.length)throw Error('飞书未返回章节定位，不能安全更新');
    edits.push({key:section.key,label:section.label,start:ids[0],end:ids.at(-1),content:section.xml});expected[i]=section.xml;
  });
  return {edits,conflicts,expected:expected.join('\n')};
}
export function replaceBriefSection(remote,key,content){return briefSections(remote).map(s=>s.key===key?content:s.xml).join('\n');}
function plainText(xml){return xml.replace(/<\/(?:p|h\d|tr|li)>/g,'\n').replace(/<\/(?:td|th)>/g,' | ').replace(/<br\s*\/>/g,'\n').replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').trim();}
