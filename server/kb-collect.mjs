import { getSettings } from './db.mjs';
import { getRecord, putRecord, listRecords, fingerprint } from './local-records.mjs';
import { runLark } from './projects.mjs';
import { failure } from './v3-common.mjs';
import { COLLECT_SPACE, COLLECT_RULES, collectRules, validNodeToken } from './kb-collect-config.mjs';
import { createCollectPairing } from './kb-collect-pairing.mjs';

const kind='kb-operation', lockKind='kb-write-lock';
const running=new Map();
const error=(status,code,message,operationId)=>Object.assign(failure(status,message),{code,...(operationId?{receipt:{operationId,status:'unknown'}}:{})});
const unknown=id=>error(502,'COLLECT_RESULT_UNKNOWN','收藏结果尚未核实，请只读核对，不能重新发送',id);
const pending=id=>error(409,'COLLECT_PENDING','已有收藏或知识库操作尚未核实，请先核对操作记录',id);
const unreadable=()=>error(404,'COLLECT_SOURCE_UNREADABLE','原文档读不到，请检查链接及当前用户权限');
const targetInvalid=()=>error(400,'COLLECT_TARGET_INVALID','收藏目录不在规则表中、已不存在或不属于目标知识空间');
const types={wiki:null,docx:'docx',sheets:'sheet',base:'bitable',slides:'slides',mindnotes:'mindnote',file:'file'};
export function parseCollectUrl(raw){
  const bad=()=>{throw error(400,'COLLECT_URL_INVALID','请输入有效的 HTTPS 飞书文档链接');};
  if(typeof raw!=='string')bad();const value=raw.trim();
  // 先检查原始authority，URL会将显式:443规范化为空端口。
  if(!/^https:\/\/[^/:@\s\\]+\//i.test(value)||/[\s\\]/.test(value))bad();
  let url;try{url=new URL(value);}catch{bad();}
  const parts=url.pathname.match(/^\/(wiki|docx|sheets|base|slides|mindnotes|file)\/([A-Za-z0-9]{1,80})\/?$/);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!/(^|\.)(feishu\.cn|larksuite\.com)$/.test(url.hostname)||!parts)bad();
  return{origin:url.origin,type:parts[1],token:parts[2]};
}
const nodeValid=n=>n&&validNodeToken(n.node_token)&&validNodeToken(n.obj_token)&&/^\d+$/.test(n.space_id||'')&&typeof n.title==='string'&&['doc','docx','sheet','bitable','slides','mindnote','file'].includes(n.obj_type)&&['origin','shortcut'].includes(n.node_type);
const sourceKey=n=>fingerprint([n.obj_type,n.obj_token]);
const throwSnapshot=snapshot=>{throw Object.assign(failure(snapshot.status,snapshot.body.error),snapshot.body.code?{code:snapshot.body.code}:{},snapshot.body.receipt?{receipt:structuredClone(snapshot.body.receipt)}:{});};
const replay=p=>{if(p.http){if(p.http.status!==200)throwSnapshot(p.http);return structuredClone(p.http.body);}throw p.inFlight?unknown(p.id):pending(p.id);};

// 与目录整理共用kb-operation、空间写锁、身份检查和活动写入集合。
export function createKnowledgeCollectService(db,{now=Date.now,run,readDirectory,assertWriterIdentity,activeWrites,ownerAlive}={}){
  const pairing=createCollectPairing(db,{now});
  const database=db.prepare('PRAGMA database_list').all().find(row=>row.name==='main')?.file;
  const scope=database||db;
  const save=p=>putRecord(db,kind,p.id,p,now());
  const load=id=>getRecord(db,kind,id);
  const stamp=()=>new Date(now()).toISOString();
  const configuration=()=>{const s=getSettings(db);return{spaceId:s.kb_collect_space||COLLECT_SPACE,rules:collectRules(s.kb_collect_rules||JSON.stringify(COLLECT_RULES))};};
  const nodeGet=token=>runLark(['wiki','+node-get','--node-token',token],run);
  const publicStatus=p=>({operationId:p.id,spaceId:p.spaceId,state:p.state,requiresReconciliation:['writing','unknown'].includes(p.state),...(p.state==='verified'?{url:p.result.url,verifiedAt:p.verifiedAt}:{})});
  const transaction=work=>{db.exec('BEGIN IMMEDIATE');try{const value=work();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
  const unlock=p=>{if(getRecord(db,lockKind,p.spaceId)?.operationId===p.id)db.prepare('DELETE FROM v3_documents WHERE kind=? AND id=?').run(lockKind,p.spaceId);};
  const finish=(p,result)=>{
    p.state='verified';p.result=result;p.verifiedAt=stamp();p.recentStatus=result.status==='created'?'ok':'duplicate';
    if(!p.http)p.http={status:200,body:result};
    transaction(()=>{save(p);unlock(p);});return structuredClone(result);
  };
  const recordUnknown=p=>{
    p.state='unknown';p.recentStatus='unknown';p.http={status:502,body:{error:unknown(p.id).message,code:'COLLECT_RESULT_UNKNOWN',receipt:{operationId:p.id,status:'unknown'}}};
    // 若本地落库也失败，之前的writing意图和空间锁仍持久存在，重启不会重放。
    try{save(p);}catch{}throw unknown(p.id);
  };
  function blockPending(p){
    const other=listRecords(db,kind).find(x=>x.type==='collect'&&x.id!==p.id&&x.sourceKey===p.sourceKey&&x.inFlight&&x.state!=='verified');
    if(other)throw pending(other.id);
    const lock=getRecord(db,lockKind,p.spaceId);if(lock&&lock.operationId!==p.id)throw pending(lock.operationId);
  }
  async function readSource(link){
    let source;
    try{source=await nodeGet(link.token);}catch(e){if(e.larkCode===131014)throw error(422,'COLLECT_SOURCE_UNSUPPORTED','云盘文档暂不支持快捷收藏，不会移动原文');throw unreadable();}
    if(!nodeValid(source)||(link.type==='wiki'?source.node_token!==link.token:source.obj_token!==link.token||source.obj_type!==types[link.type]))throw unreadable();
    const seen=new Set();
    while(source.node_type==='shortcut'){
      if(!validNodeToken(source.origin_node_token)||seen.has(source.origin_node_token)||seen.size>=10)throw unreadable();
      seen.add(source.origin_node_token);const previous=source;
      try{source=await nodeGet(source.origin_node_token);}catch{throw unreadable();}
      if(!nodeValid(source)||source.node_token!==previous.origin_node_token||sourceKey(source)!==sourceKey(previous))throw unreadable();
    }
    return source;
  }
  async function sourceContext(source){
    let parentTitle='',location;
    try{
      if(source.parent_node_token){const parent=await nodeGet(source.parent_node_token);if(parent.node_token!==source.parent_node_token||parent.space_id!==source.space_id||typeof parent.title!=='string')throw Error();parentTitle=parent.title;}
      const {space}=await runLark(['wiki','spaces','get','--space-id',source.space_id,'--lang','zh'],run);
      if(space?.space_id!==source.space_id||typeof space.name!=='string'||!space.name.trim())throw Error();
      location=space.space_type==='my_library'?'我的文档库':space.name;
    }catch{throw unreadable();}
    return{parentTitle,location};
  }
  async function target(p){
    if(!p.parentNodeToken)return{title:'根目录'};// 归类不明确：放在知识库根目录（书柜顶上的「待上架」）
    let n;try{n=await nodeGet(p.parentNodeToken);}catch{throw targetInvalid();}
    if(!nodeValid(n)||n.node_token!==p.parentNodeToken||n.space_id!==p.spaceId)throw targetInvalid();return n;
  }
  const sameConfiguration=p=>{if(fingerprint(configuration())!==p.configVersion)throw targetInvalid();};
  function response(p,n,status,duplicateKind,parentTitle){
    return{status,operationId:p.id,title:p.source.title,objType:p.source.obj_type,location:p.location,parentNodeToken:n.parent_node_token||'',parentTitle,url:`${p.origin}/wiki/${n.node_token}`,...(duplicateKind?{duplicateKind}:{}),reason:p.reason,matched:p.matched,at:p.at};
  }
  async function duplicate(p,nodes){
    // 原文本身已在目标空间，不需要快捷方式。
    const original=p.source.space_id===p.spaceId?p.source:nodes.find(n=>n.node_type==='origin'&&sourceKey(n)===p.sourceKey);
    let found=original,duplicateKind='inSpace';
    if(!found){
      for(const n of nodes.filter(n=>n.node_type==='shortcut')){
        if(n.origin_node_token===p.source.node_token||sourceKey(n)===p.sourceKey){found=n;break;}
        // 目录清单未给出原文标识时，读取节点核对，不以标题判断。
        if(!n.origin_node_token){const detail=await nodeGet(n.node_token);if(!nodeValid(detail)||detail.node_token!==n.node_token||detail.space_id!==p.spaceId)throw failure(502,'快捷方式查重数据不完整');if(detail.origin_node_token===p.source.node_token||sourceKey(detail)===p.sourceKey){found=detail;break;}}
      }
      duplicateKind='shortcut';
    }
    if(!found)return null;
    const parent=found.parent_node_token?nodes.find(n=>n.node_token===found.parent_node_token):null;
    if(found.parent_node_token&&!parent)throw failure(502,'已有收藏的目录信息不完整');
    return response(p,found,'duplicate',duplicateKind,parent?.title||'根目录');
  }
  const verified=(p,n)=>nodeValid(n)&&n.node_type==='shortcut'&&n.space_id===p.spaceId&&(n.parent_node_token||'')===p.parentNodeToken&&n.origin_node_token===p.source.node_token&&sourceKey(n)===p.sourceKey;
  async function execute(p,body,link){
    activeWrites.add(p.id);let attempted=false;
    try{
      p.source=await readSource(link);p.sourceKey=sourceKey(p.source);save(p);
      const cfg=configuration();p.spaceId=cfg.spaceId;p.configVersion=fingerprint(cfg);
      transaction(()=>{blockPending(p);putRecord(db,lockKind,p.spaceId,{operationId:p.id},now());save(p);});
      const context=await sourceContext(p.source);p.location=context.location;
      const haystack=`${p.source.title} ${context.parentTitle}`.toLocaleLowerCase();
      p.matched=cfg.rules.map(r=>({...r,keywords:r.keywords.filter(k=>haystack.includes(k.toLocaleLowerCase()))})).filter(r=>r.keywords.length);
      // 用户 2026-10-18：只命中一个目录才进组；没命中或命中多个都算不明确，放在根目录，由用户在画布上拖进分组。
      const explicit=body.targetNodeToken!==undefined;
      const chosen=explicit?cfg.rules.find(r=>r.nodeToken===body.targetNodeToken):p.matched.length===1?p.matched[0]:null;
      if(explicit&&!chosen)throw targetInvalid();
      p.reason=explicit?'chosen':chosen?'matched':'unclear';p.parentNodeToken=chosen?chosen.nodeToken:'';
      // 身份、目录与查重均在写前完成；任何读失败都不会调用创建。
      await assertWriterIdentity(run);p.parentTitle=(await target(p)).title;
      const nodes=await readDirectory({spaceId:p.spaceId},{run});sameConfiguration(p);
      const existing=await duplicate(p,nodes);if(existing)return finish(p,existing);
      if(p.source.obj_type==='doc')throw error(422,'COLLECT_SOURCE_UNSUPPORTED','当前飞书命令暂不支持旧版文档的快捷方式，不会移动或修改原文');
      p.baseline=nodes.map(n=>n.node_token);
      p.parentTitle=(await target(p)).title;await assertWriterIdentity(run);sameConfiguration(p);
      p.state='writing';p.inFlight={originNodeToken:p.source.node_token,parentNodeToken:p.parentNodeToken};save(p);
      attempted=true;
      const created=await runLark(['wiki','+node-create','--space-id',p.spaceId,...(p.parentNodeToken?['--parent-node-token',p.parentNodeToken]:[]),'--node-type','shortcut','--origin-node-token',p.source.node_token,'--obj-type',p.source.obj_type],run);
      if(!validNodeToken(created.node_token)||p.baseline.includes(created.node_token)||created.resolved_space_id!==p.spaceId||created.node_type!=='shortcut'||created.obj_type!==p.source.obj_type||created.obj_token!==p.source.obj_token)throw unknown(p.id);
      p.inFlight.nodeId=created.node_token;save(p);
      const observed=await nodeGet(created.node_token);if(observed.node_token!==created.node_token||!verified(p,observed))throw unknown(p.id);
      return finish(p,response(p,observed,'created',undefined,p.parentTitle));
    }catch(e){
      if(attempted&&!e.rejected)return recordUnknown(p);// 授权在执行前被拒：确定没建，不锁
      p.inFlight=null;
      p.state='aborted';p.recentStatus='failed';p.http={status:e.status||502,body:{error:e.status?e.message:'收藏执行前核验失败，请稍后重新操作',...(e.code?{code:e.code}:{}),...(e.receipt?{receipt:e.receipt}:{})}};
      transaction(()=>{save(p);unlock(p);});return replay(p);
    }finally{activeWrites.delete(p.id);}
  }
  return{
    pairing,
    status:publicStatus,
    async collect(body){
      const link=parseCollectUrl(body?.url);
      if(typeof body?.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.requestId))throw failure(400,'收藏请求编号须为 UUID');
      const id=`collect-${body.requestId.toLowerCase()}`,key=`${scope}:${id}`;
      if(running.has(key))return running.get(key);
      const previous=load(id);if(previous)return replay(previous);
      const p={id,type:'collect',requestId:body.requestId.toLowerCase(),spaceId:configuration().spaceId,state:'checking',ownerPid:process.pid,origin:link.origin,at:stamp(),title:'待解析文档'};
      const claimed=transaction(()=>{const old=load(id);if(old)return old;save(p);return null;});if(claimed)return replay(claimed);
      const work=execute(p,body,link);running.set(key,work);
      try{return await work;}finally{running.delete(key);}
    },
    recent(){
      const rows=db.prepare('SELECT payload FROM v3_documents WHERE kind=? AND json_extract(payload,\'$.type\')=\'collect\' AND json_extract(payload,\'$.spaceId\')=? ORDER BY updated_at DESC,rowid DESC LIMIT 50').all(kind,configuration().spaceId);
      return{items:rows.map(row=>{const p=JSON.parse(row.payload);return{operationId:p.id,title:p.source?.title||p.title,parentTitle:p.result?.parentTitle||p.parentTitle||'',...(p.result?.url?{url:p.result.url}:{}),status:p.recentStatus||(p.inFlight?'unknown':'failed'),at:p.at};})};
    },
    async reconcile(id){
      const p=load(id);if(p.state==='verified')return publicStatus(p);
      if(activeWrites.has(p.id)||(p.state!=='unknown'&&p.state!=='aborted'&&ownerAlive(p)))throw pending(id);
      if(!p.inFlight){
        p.state='aborted';p.recentStatus='failed';
        if(!p.http)p.http={status:409,body:{error:'上次收藏在提交前中断，未创建；请用新的请求编号重新收藏'}};
        transaction(()=>{save(p);unlock(p);});return publicStatus(p);
      }
      if(!p.http)p.http={status:502,body:{error:unknown(id).message,code:'COLLECT_RESULT_UNKNOWN',receipt:{operationId:id,status:'unknown'}}};
      activeWrites.add(p.id);
      try{
        let observed;
        if(p.inFlight.nodeId){observed=await nodeGet(p.inFlight.nodeId);if(observed.node_token!==p.inFlight.nodeId)throw unknown(id);}
        else{
          const nodes=await readDirectory({spaceId:p.spaceId},{run}),candidates=[];
          for(const n of nodes.filter(n=>!p.baseline.includes(n.node_token)&&(n.parent_node_token||'')===p.parentNodeToken&&n.node_type==='shortcut')){const detail=await nodeGet(n.node_token);if(detail.node_token===n.node_token&&verified(p,detail))candidates.push(detail);}
          if(candidates.length!==1)throw unknown(id);observed=candidates[0];
        }
        if(!verified(p,observed))throw unknown(id);
        finish(p,response(p,observed,'created',undefined,p.parentTitle));return publicStatus(p);
      }catch{p.state='unknown';try{save(p);}catch{}throw unknown(id);}finally{activeWrites.delete(p.id);}
    },
  };
}
