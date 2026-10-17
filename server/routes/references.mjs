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
  const refs=createReferenceService(db,options), dir=()=>options.digiworldDir||digiworldDir();
  return [
    route('GET','/api/v3/refs',handleV3(()=>refs.read())),
    route('POST','/api/v3/refs/preview',handleV3(async req=>refs.preview(await body(req)))),
    route('POST','/api/v3/refs',handleV3(async req=>refs.confirm(await body(req)))),
    route('GET','/api/v3/refs/images/:file',async(req,res,{params})=>{
      try {const bytes=refs.image(params.file);res.writeHead(200,{'content-type':'image/jpeg','x-content-type-options':'nosniff','cache-control':'no-store'});res.end(bytes);}
      catch(error){json(res,error.status||500,{error:error.message});}
    }),
    // 数码世界收藏：只读列表和图片；「已导入」按画布里已保存参考项的来源判断。导入本身走上面的画布预览保存。
    route('GET','/api/v3/refs/digiworld',handleV3(()=>{
      const { revision, groups, notes }=readCollection(dir()), saved=refs.read().items;
      return { revision, groups, defaultGroup: DEFAULT_GROUP, notes: notes.map(({ images, ...n })=>({ ...n, images: images.length, imported: saved.some(i=>i.source?.startsWith(digiworldSource(n.id))) })) };
    })),
    route('GET','/api/v3/refs/digiworld/:id/images/:n',async(req,res,{params})=>{
      try {const { bytes, type }=collectionImage(params.id,params.n,dir());res.writeHead(200,{'content-type':type,'x-content-type-options':'nosniff','cache-control':'no-store'});res.end(bytes);}
      catch(error){json(res,error.status||500,{error:error.status?error.message:'收藏图片读取失败',...(error.code&&{code:error.code})});}
    }),
  ];
}
