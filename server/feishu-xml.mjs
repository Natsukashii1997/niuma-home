// Compare document meaning and layout boundaries, ignoring Feishu IDs and default styles.
// Only the text/table/list subset produced by Brief is accepted; resource directives fail closed.
export function canonicalXml(source) {
  if(typeof source!=='string' || /<!|<\?/.test(source)) throw new Error('Unsupported XML declaration');
  const root={tag:'root',children:[]},stack=[root];
  const decode=s=>s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,v)=>v[0]==='#'?String.fromCodePoint(v[1].toLowerCase()==='x'?parseInt(v.slice(2),16):Number(v.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[v]);
  const tokens=source.match(/<[^>]*>|[^<]+/g)||[];
  if(tokens.join('')!==source)throw new Error('Malformed XML');
  const allowed=new Set(['title','p','h1','h2','h3','h4','h5','h6','table','thead','tbody','tr','th','td','colgroup','col','ul','ol','li','b','strong','em','span','u','del','br']);
  for(const token of tokens){
    if(!token.startsWith('<')){if(token.trim() || !token.includes('\n'))stack.at(-1).children.push(decode(token));continue;}
    const close=token.match(/^<\/([a-z0-9-]+)\s*>$/);
    if(close){if(stack.length===1||stack.pop().tag!==close[1])throw new Error('Unbalanced XML');continue;}
    const open=token.match(/^<([a-z0-9-]+)((?:\s+[\w-]+="[^"]*")*)\s*(\/?)>$/);
    if(!open||!allowed.has(open[1]))throw new Error('Unsupported XML element');
    const attrs=Object.fromEntries([...open[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],decode(m[2])]));
    const node={tag:open[1],attrs,children:[]};stack.at(-1).children.push(node);
    if(!open[3])stack.push(node);
  }
  if(stack.length!==1)throw new Error('Unclosed XML');
  const clean=s=>s.replace(/[^\S\n]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{2,}/g,'\n').trim();
  const raw=n=>typeof n==='string'?n:n.tag==='br'?'\n':n.children.map(raw).join('')+(['p','li'].includes(n.tag)?'\n':'');
  const children=n=>n.children.flatMap(walk);
  function walk(n){
    if(typeof n==='string')return clean(n)?[['text',clean(n)]]:[];
    if(['colgroup','col'].includes(n.tag))return [];
    if(n.tag==='root')return children(n);
    if(['thead','tbody'].includes(n.tag)){const content=children(n);return n.tag==='tbody'&&!content.length?[]:[[n.tag,content]];}
    if(n.tag==='table')return [['table',children(n)]];
    if(n.tag==='tr')return [['tr',children(n)]];
    if(['th','td'].includes(n.tag))return [[n.tag,Number(n.attrs.rowspan||1),Number(n.attrs.colspan||1),clean(raw(n))]];
    if(['ul','ol'].includes(n.tag))return [[n.tag,children(n)]];
    const value=clean(raw(n));
    if(n.tag==='p'&&!value)return [];
    return [[n.tag,value]];
  }
  return JSON.stringify(walk(root));
}
