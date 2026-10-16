import { route, json } from '../http.mjs';
import { createReferenceService } from '../references.mjs';
import { handleV3 } from './user.mjs';
import { failure } from '../v3-common.mjs';

async function body(req) {
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if(size<=12*1024*1024)chunks.push(chunk); }
  if(size>12*1024*1024)throw failure(413,'参考画布请求过大，请分批添加图片');
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw failure(400,'请求内容不是有效JSON');}
}
export function routes(db,options={}) {
  const refs=createReferenceService(db,options);
  return [
    route('GET','/api/v3/refs',handleV3(()=>refs.read())),
    route('POST','/api/v3/refs/preview',handleV3(async req=>refs.preview(await body(req)))),
    route('POST','/api/v3/refs',handleV3(async req=>refs.confirm(await body(req)))),
    route('GET','/api/v3/refs/images/:file',async(req,res,{params})=>{
      try {const bytes=refs.image(params.file);res.writeHead(200,{'content-type':'image/jpeg','x-content-type-options':'nosniff','cache-control':'no-store'});res.end(bytes);}
      catch(error){json(res,error.status||500,{error:error.message});}
    }),
  ];
}
