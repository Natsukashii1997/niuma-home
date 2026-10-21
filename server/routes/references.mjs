import { fingerprint } from '../local-records.mjs';
import { route, json } from '../http.mjs';
import { createReferenceService } from '../references.mjs';
import { handleV3 } from './user.mjs';
import { failure } from '../v3-common.mjs';
import { collectionImage, DEFAULT_GROUP, digiworldDir, digiworldSource, readCollection } from '../digiworld.mjs';

async function body(req) {
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if(size<=12*1024*1024)chunks.push(chunk); }
  if(size>12*1024*1024)throw failure(413,'参考画布请求过大，请分批添加图片');
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure(400,'请求内容不是有效JSON');}
}
export function routes(db,options={}) {
  const refs=createReferenceService(db,options), designs=createReferenceService(db,{...options, collection:true}), dir=()=>options.digiworldDir||digiworldDir();
  const designSource = () => {
    const { revision, groups, notes } = readCollection(dir()), saved = designs.read().items;
    return { revision, groups, defaultGroup: DEFAULT_GROUP, notes: notes.map(({ images, content, ...n }) => ({ ...n, images: images.length, imported: saved.some(i => i.post?.id === n.id) })) };
  };
  return [
    route('GET','/api/v3/design-refs/state',handleV3(()=>designs.state())),
    route('GET','/api/v3/design-refs/operations/:id',handleV3((req,{params})=>designs.operation(params.id))),
    route('GET','/api/v3/design-refs/saves/:id',handleV3((req,{params})=>designs.receipt(params.id))),
    route('PUT','/api/v3/design-refs',handleV3(async req=>designs.save(await body(req)))),
    route('GET','/api/v3/design-refs/source',handleV3(designSource)),
    route('POST','/api/v3/design-refs/import',handleV3(async req=>{
      const input=await body(req), importHash=fingerprint({ ids:input.ids, baseRevision:input.baseRevision });
      const previous=designs.importReceipt(input.requestId, importHash); if (previous) return previous;
      const state=designs.state();
      if (!Array.isArray(input.ids) || !input.ids.length || input.ids.length > 20 || new Set(input.ids).size !== input.ids.length) throw failure(400, '每次选择1至20篇不同帖子');
      if (input.baseRevision !== state.revision) throw failure(409, '设计参考已变化，请重新读取');
      const source=readCollection(dir()), value=structuredClone(state.value);
      for (const id of input.ids) {
        if (value.items.some(i=>i.post?.id===id)) continue;
        const note=source.notes.find(n=>n.id===id);
        if (!note) throw failure(404,'来源帖子已不存在，请重新读取收藏');
        const gallery=[];
        for (let k=0;k<note.images.length;k++) { const img=collectionImage(id,k,dir()); gallery.push(`data:${img.type};base64,${img.bytes.toString('base64')}`); }
        const group=note.group || '未分组';
        if (group !== '未分组' && !value.zones.some(z=>z.name===group)) value.zones.push({name:group,x:0,y:0,w:300,h:280});
        let url=note.sourceUrl;
        if (url) { const u=new URL(url); u.username=''; u.password=''; for (const k of [...u.searchParams.keys()]) if (/token|signature|auth/i.test(k)) u.searchParams.delete(k); url=u.href; }
        value.items.push({id:`post-${id}`,title:note.title,tags:[group],source:`数码世界笔记 ${id}`,x:0,y:0,w:168,gallery,post:{id,author:note.author,content:note.content,type:note.type,url}});
      }
      return designs.save({requestId:input.requestId,baseRevision:input.baseRevision,value,importHash});
    })),
    route('GET','/api/v3/design-refs/images/:file',async(req,res,{params})=>{
      try {const bytes=designs.image(params.file);res.writeHead(200,{'content-type':'image/jpeg','x-content-type-options':'nosniff','cache-control':'no-store'});res.end(bytes);}
      catch(error){json(res,error.status||500,{error:error.message});}
    }),
    route('GET','/api/v3/refs',handleV3(()=>refs.read())),
    route('GET','/api/v3/refs/state',handleV3(()=>refs.state())),
    route('GET','/api/v3/refs/operations/:id',handleV3((req,{params})=>refs.operation(params.id))),
    route('GET','/api/v3/refs/saves/:id',handleV3((req,{params})=>refs.receipt(params.id))),
    route('PUT','/api/v3/refs',handleV3(async req=>refs.save(await body(req)))),
    route('POST','/api/v3/refs/preview',handleV3(async req=>refs.preview(await body(req)))),
    route('POST','/api/v3/refs',handleV3(async req=>refs.confirm(await body(req)))),
    route('GET','/api/v3/refs/images/:file',async(req,res,{params})=>{
      try {const bytes=refs.image(params.file);res.writeHead(200,{'content-type':'image/jpeg','x-content-type-options':'nosniff','cache-control':'no-store'});res.end(bytes);}
      catch(error){json(res,error.status||500,{error:error.message});}
    }),
    // 数码世界收藏：只读列表和图片；「已导入」按画布里已保存参考项的来源判断。导入本身走上面的画布预览保存。
    route('GET','/api/v3/refs/digiworld',handleV3(()=>{
      const { revision, groups, notes }=readCollection(dir()), saved=refs.read().items;
      return { revision, groups, defaultGroup: DEFAULT_GROUP, notes: notes.map(({ images, content, ...n })=>({ ...n, images: images.length, imported: saved.some(i=>i.source?.startsWith(digiworldSource(n.id))) })) };
    })),
    route('GET','/api/v3/refs/digiworld/:id/images/:n',async(req,res,{params})=>{
      try {const { bytes, type }=collectionImage(params.id,params.n,dir());res.writeHead(200,{'content-type':type,'x-content-type-options':'nosniff','cache-control':'no-store'});res.end(bytes);}
      catch(error){json(res,error.status||500,{error:error.status?error.message:'收藏图片读取失败',...(error.code&&{code:error.code})});}
    }),
  ];
}
