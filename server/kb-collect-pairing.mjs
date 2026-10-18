import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getRecord, putRecord, fingerprint } from './local-records.mjs';
import { failure } from './v3-common.mjs';

const kind='kb-collect-pairing', id='current';
const denied=()=>Object.assign(failure(403,'请在牛马之家设置页查看配对码，并重新连接收藏扩展'),{code:'COLLECT_PAIRING_REQUIRED'});
const valid=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export function createCollectPairing(db,{now=Date.now}={}){
  const pending=new Map();
  const transaction=work=>{db.exec('BEGIN IMMEDIATE');try{const result=work();db.exec('COMMIT');return result;}catch{db.exec('ROLLBACK');throw failure(409,'配对码操作未完成，请重新读取并预览');}};
  const generate=()=>({code:randomBytes(32).toString('hex'),createdAt:new Date(now()).toISOString()});
  const save=value=>{const saved=putRecord(db,kind,id,value,now());if(fingerprint(saved)!==fingerprint(value))throw Error('配对码回读失败');return saved;};
  const read=()=>transaction(()=>{
    const current=getRecord(db,kind,id);
    if(current&&!valid(current.code))throw Error('配对码存储异常');
    return current||save(generate());
  });
  function guard(req,{extension=false}={}){
    const headers=req.headers||{},origin=headers.origin,host=headers.host;
    // 同源GET通常没有Origin；Host校验不能放到Origin缺省返回之后。
    if(typeof host!=='string'||!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(host))throw denied();
    if(origin===undefined)return;
    if(typeof origin!=='string')throw denied();
    if(/^chrome-extension:\/\/[a-p]{32}$/.test(origin)){
      if(!extension)throw denied();
      const code=headers['x-niuma-collect-code'],current=getRecord(db,kind,id);
      if(!valid(code)||!valid(current?.code)||!timingSafeEqual(Buffer.from(code),Buffer.from(current.code)))throw denied();
      return;
    }
    // Vite代理保留页面Host；不使用后端端口，也不信任转发头或外来Host。
    if(origin!==`http://${host}`)throw denied();
  }
  return{
    guard,read,
    preview(){
      const current=read();for(const[key,p]of pending)if(p.expires<=now())pending.delete(key);
      if(pending.size>=100)throw failure(429,'待确认配对码预览过多');
      const previewId=randomUUID(),expires=now()+600000;
      pending.set(previewId,{before:fingerprint(current),expires});return{previewId,expiresAt:new Date(expires).toISOString()};
    },
    rotate(body){
      const p=pending.get(body?.previewId);
      if(body?.confirm!==true)throw failure(400,'请先预览，再确认重新生成配对码');
      if(!p||p.expires<=now())throw failure(409,'配对码预览已失效，请重新预览');
      const result=transaction(()=>{if(fingerprint(getRecord(db,kind,id))!==p.before)throw Error('配对码已变化');return save(generate());});
      pending.clear();return result;
    },
  };
}
