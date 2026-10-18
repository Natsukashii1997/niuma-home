import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { openDb, saveSetting } from '../server/db.mjs';
import { routes } from '../server/routes/workspace.mjs';
import { match } from '../server/http.mjs';
import { getRecord, putRecord } from '../server/local-records.mjs';
import { COLLECT_RULES } from '../server/kb-collect-config.mjs';

const SPACE='7620758074885835965', SOURCE='7620758074885835999';
const rules=[{nodeToken:'marketing',title:'营销策划',keywords:['营销','brief']},{nodeToken:'ai',title:'AI实验室',keywords:['AI','Agent']},{nodeToken:'fallback',title:'杂项其他',keywords:[]}];
const node=(id,space=SPACE,extra={})=>({node_token:id,obj_token:`doc${id}`,obj_type:'docx',node_type:'origin',space_id:space,parent_node_token:'',title:id,has_child:false,...extra});
function setup(t){
  assert.ok(process.env.WORKDESK_DATA_DIR,'测试必须使用隔离数据');
  const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'t12-')),db=openDb(dir);
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
  saveSetting(db,'kb_collect_rules',JSON.stringify(rules));
  let clock=1792281600000;
  const state={nodes:rules.map(r=>node(r.nodeToken,SPACE,{title:r.title})),source:node('source',SOURCE,{title:'营销 brief'}),writes:[],calls:[],lost:false,mismatch:null,readFail:false,sourceError:null,hold:null};
  const run=async(command,args,options)=>{
    assert.equal(command,'lark-cli');assert.deepEqual(args.slice(0,2),['--profile','codex']);assert.equal(args[args.indexOf('--as')+1],'user');assert.equal(options.shell,false);
    state.calls.push(args);const arg=k=>args[args.indexOf(k)+1],ok=data=>({stdout:JSON.stringify({ok:true,identity:'user',data})});
    if(args.includes('whoami')){if(state.hold)await state.hold;return{stdout:JSON.stringify({profile:'codex',appId:state.badIdentity?'bad':'cli_aacf58ab61b85beb',identity:'user'})};}
    if(args.includes('+node-get')){
      const id=arg('--node-token');
      if(state.onRead)await state.onRead(id);
      if(id===state.source.node_token||id===state.source.obj_token){if(state.sourceError)throw Object.assign(Error('不可泄露的CLI错误'),{stderr:JSON.stringify({error:{code:state.sourceError,message:'不可泄露'}})});return ok(state.source);}
      if(state.readFail&&id.startsWith('created'))throw Error('读失败');
      return ok(state.nodes.find(n=>n.node_token===id)||{});
    }
    if(args.includes('spaces')&&args.includes('get'))return ok({space:{space_id:arg('--space-id'),name:'我的文档库',space_type:'my_library'}});
    if(args.includes('+node-list')){
      const parent=args.includes('--parent-node-token')?arg('--parent-node-token'):'';
      const nodes=state.nodes.filter(n=>n.space_id===arg('--space-id')&&n.parent_node_token===parent).map(n=>({...n,has_child:state.nodes.some(c=>c.parent_node_token===n.node_token)}));
      if(state.badPage)return ok({nodes:[],has_more:true,page_token:'stuck'});
      const offset=args.includes('--page-token')?Number(arg('--page-token')):0,limit=state.pageSize||50;
      return ok({nodes:nodes.slice(offset,offset+limit),has_more:offset+limit<nodes.length,page_token:String(offset+limit)});
    }
    if(args.includes('+node-create')){
      state.writes.push(args);assert.equal(arg('--node-type'),'shortcut');assert.equal(arg('--origin-node-token'),state.source.node_token);assert.equal(arg('--obj-type'),state.source.obj_type);
      const created=node(`created${state.writes.length}`,SPACE,{obj_token:state.source.obj_token,obj_type:state.source.obj_type,node_type:'shortcut',origin_node_token:state.source.node_token,parent_node_token:arg('--parent-node-token'),title:state.source.title,...state.mismatch});
      state.nodes.push(created);state.onWrite?.();if(state.lost)throw Error('写成功但响应丢失');if(state.badJson)return{stdout:'bad-json'};
      return ok({resolved_space_id:SPACE,...created});
    }
    throw Error('出现未允许的CLI调用');
  };
  const handler=()=>routes(db,undefined,undefined,{kb:{run,now:()=>clock},settings:{run,now:()=>clock}});
  const defaultHandlers=handler();
  async function invoke(method,endpoint,value,headers={},handlers=defaultHandlers){
    const url=new URL(endpoint,'http://127.0.0.1:5281'),found=match(handlers,method,url.pathname);
    if(!found)return{status:404,body:{},headers:{}};
    const req=Readable.from(value===undefined?[]:[Buffer.from(typeof value==='string'?value:JSON.stringify(value))]);req.method=method;req.url=endpoint;req.headers={host:'127.0.0.1:5281',...headers};
    let status,body;const outputHeaders={};const res={setHeader(k,v){outputHeaders[k]=v;},writeHead(s){status=s;},end(s){body=JSON.parse(s);}};
    await found.handler(req,res,{params:found.params,url});return{status,body,headers:outputHeaders};
  }
  const collect=(body={},headers={},handlers)=>invoke('POST','/api/v3/kb/collect',{url:`https://team.feishu.cn/docx/${state.source.obj_token}`,requestId:randomUUID(),...body},headers,handlers);
  return{dir,db,state,run,handler,invoke,collect,advance:ms=>clock+=ms};
}

test('T12一次收藏创建快捷方式且写后核验；同请求跨实例重放固定结果',async t=>{
  const{state,collect}=setup(t),requestId=randomUUID(),result=await collect({requestId});
  assert.equal(result.status,200);assert.equal(result.body.status,'created');assert.equal(result.body.reason,'matched');assert.equal(result.body.parentNodeToken,'marketing');assert.equal(result.body.location,'我的文档库');assert.equal(state.writes.length,1);
  assert.deepEqual(await collect({requestId}),result);assert.equal(state.writes.length,1);
});

test('T12拒绝非法链接、云盘及不可读来源；错误不泄露CLI内容',async t=>{
  const{collect,state}=setup(t);
  for(const url of ['',null,{},'http://team.feishu.cn/docx/a','https://feishu.cn.evil/docx/a','https://u@feishu.cn/docx/a','https://feishu.cn:443/docx/a','https://feishu.cn/drive/a','https:///feishu.cn/wiki/a','https://feishu.cn/wiki/a/b','https://feishu.cn/wiki/%61']){
    const r=await collect({url});assert.equal(r.status,400,JSON.stringify(url));assert.equal(r.body.code,'COLLECT_URL_INVALID');
  }
  state.sourceError=131014;let r=await collect();assert.equal(r.status,422);assert.equal(r.body.code,'COLLECT_SOURCE_UNSUPPORTED');
  state.sourceError=131006;r=await collect();assert.equal(r.status,404);assert.equal(r.body.code,'COLLECT_SOURCE_UNREADABLE');assert.ok(!JSON.stringify(r).includes('不可泄露'));assert.equal(state.writes.length,0);
});

test('T12配对校验在JSON及链接解析前；本站读取配对码，扩展和外部不能读取',async t=>{
  const{invoke,collect,state}=setup(t),endpoint='/api/v3/kb/collect/pairing';
  const r=await invoke('GET',endpoint);assert.equal(r.status,200);assert.match(r.body.code,/^[0-9a-f]{64}$/);assert.deepEqual((await invoke('GET',endpoint)).body,r.body);
  const extension={origin:'chrome-extension://abcdefghijklmnopabcdefghijklmnop'};
  for(const headers of [extension,{...extension,'x-niuma-collect-code':'bad'},{origin:'https://evil.example'},{origin:'null'},{host:'evil.example',origin:'http://evil.example'},{host:'evil.example'}]){
    const x=await invoke('POST','/api/v3/kb/collect','{',headers);assert.equal(x.status,403);assert.equal(x.body.code,'COLLECT_PAIRING_REQUIRED');assert.ok(!Object.keys(x.headers).some(k=>k.toLowerCase().startsWith('access-control')));
  }
  assert.equal((await collect({url:''},{...extension,'x-niuma-collect-code':r.body.code})).body.code,'COLLECT_URL_INVALID');
  assert.equal((await collect({url:''},{origin:'http://127.0.0.1:5281'})).status,400);
  for(const suffix of ['', '/preview','/rotate'])assert.equal((await invoke(suffix?'POST':'GET',endpoint+suffix,{}, {...extension,'x-niuma-collect-code':r.body.code})).status,403);
  for(const suffix of ['', '/preview','/rotate'])assert.equal((await invoke(suffix?'POST':'GET',endpoint+suffix,{}, {host:'evil.example'})).status,403);
  assert.equal(state.writes.length,0);
});

test('T12支持七种链接入口与两类知识空间；写命令保持原文类型',async t=>{
  const{state,collect}=setup(t);
  for(const[type,objType]of Object.entries({wiki:'docx',docx:'docx',sheets:'sheet',base:'bitable',slides:'slides',mindnotes:'mindnote',file:'file'})){
    state.source=node(`source${type}`,SOURCE,{title:'素材',obj_type:objType});
    const r=await collect({url:`https://team.larksuite.com/${type}/${type==='wiki'?state.source.node_token:state.source.obj_token}?from=share#part`});
    assert.equal(r.status,200);assert.equal(r.body.objType,objType);assert.equal(r.body.status,'created');
  }
  assert.equal(state.writes.length,7);
});

test('T12按标题和上级标题归类，匹配不分大小写；多命中首项、无命中兜底、显式目录优先',async t=>{
  const{state,collect}=setup(t);
  for(const[title,body,target,reason]of [['brief agent',{},'marketing','first'],['无匹配',{},'fallback','fallback'],['agent',{},'ai','matched'],['brief',{targetNodeToken:'ai'},'ai','chosen']]){
    state.source=node(`source${state.writes.length}`,SOURCE,{title});const r=await collect(body);
    assert.equal(r.status,200);assert.equal(r.body.parentNodeToken,target);assert.equal(r.body.reason,reason);
  }
  state.nodes.push(node('sourceParent',SOURCE,{title:'AGENT 工作'}));state.source=node('sourceParentTest',SOURCE,{title:'新文档',parent_node_token:'sourceParent'});
  const r=await collect();assert.equal(r.body.reason,'matched');assert.equal(r.body.parentNodeToken,'ai');
});

test('T12全树分页查重：已有快捷方式和原文在空间里均不创建，并返回真实所在位置',async t=>{
  const{state,collect}=setup(t);state.pageSize=1;
  state.nodes.push(node('nested',SPACE,{parent_node_token:'ai',title:'二级目录'}));
  state.nodes.push(node('existing',SPACE,{parent_node_token:'nested',obj_token:state.source.obj_token,node_type:'shortcut',origin_node_token:state.source.node_token}));
  let r=await collect();assert.equal(r.status,200);assert.equal(r.body.duplicateKind,'shortcut');assert.equal(r.body.parentTitle,'二级目录');assert.match(r.body.url,/\/existing$/);assert.equal(state.writes.length,0);
  state.nodes=state.nodes.filter(n=>n.node_token!=='existing');state.source.space_id=SPACE;state.source.parent_node_token='ai';state.nodes.push(state.source);
  r=await collect();assert.equal(r.body.duplicateKind,'inSpace');assert.equal(r.body.parentTitle,'AI实验室');assert.equal(state.writes.length,0);
});

test('T12已存在快捷方式清单没有origin字段时仍按原文对象查重',async t=>{
  const{state,collect}=setup(t);state.nodes.push(node('existing',SPACE,{parent_node_token:'ai',node_type:'shortcut',obj_token:state.source.obj_token}));
  const r=await collect();assert.equal(r.body.status,'duplicate');assert.equal(state.writes.length,0);
});

test('T12显式目录非法、节点消失、目标空间错位、身份错误及分页不完整均零创建',async t=>{
  const{state,collect}=setup(t);
  assert.equal((await collect({targetNodeToken:'outside'})).body.code,'COLLECT_TARGET_INVALID');
  state.nodes.find(n=>n.node_token==='marketing').space_id=SOURCE;assert.equal((await collect()).body.code,'COLLECT_TARGET_INVALID');
  state.nodes.find(n=>n.node_token==='marketing').space_id=SPACE;state.badIdentity=true;assert.equal((await collect()).status,403);
  state.badIdentity=false;state.badPage=true;assert.equal((await collect()).status,502);state.badPage=false;
  state.nodes=state.nodes.filter(n=>n.node_token!=='marketing');assert.equal((await collect()).body.code,'COLLECT_TARGET_INVALID');assert.equal(state.writes.length,0);
});

test('T12同请求并发跨服务合并；另请求不能穿过空间锁或抢先核对',async t=>{
  const{state,collect,invoke,handler}=setup(t),requestId=randomUUID();
  let release,entered;const reached=new Promise(r=>entered=r);state.hold=new Promise(r=>release=r);state.onRead=id=>{if(id===state.source.node_token||id===state.source.obj_token)entered();};
  const first=collect({requestId});await reached;
  const repeated=collect({requestId},{},handler());
  // 给原请求机会持久化空间锁。
  await new Promise(r=>setImmediate(r));
  const other=await collect();assert.equal(other.status,409);assert.equal(other.body.code,'COLLECT_PENDING');
  assert.equal((await invoke('POST',`/api/v3/kb/operations/collect-${requestId}/reconcile`,{})).status,409);
  release();assert.deepEqual(await first,await repeated);assert.equal(state.writes.length,1);
});

test('T12创建响应丢失：原请求回执固定、原文锁定、只读核对后释放锁',async t=>{
  const{state,collect,invoke,handler}=setup(t),requestId=randomUUID();state.lost=true;
  const first=await collect({requestId});assert.equal(first.status,502);assert.equal(first.body.code,'COLLECT_RESULT_UNKNOWN');assert.equal(state.writes.length,1);
  assert.deepEqual(await collect({requestId},{},handler()),first);
  const blocked=await collect({url:'https://team.feishu.cn/wiki/source'});assert.equal(blocked.status,409);assert.equal(blocked.body.code,'COLLECT_PENDING');assert.deepEqual(blocked.body.receipt,first.body.receipt);
  const id=first.body.receipt.operationId;assert.equal((await invoke('GET',`/api/v3/kb/operations/${id}`)).body.state,'unknown');
  assert.equal((await invoke('POST',`/api/v3/kb/operations/${id}/reconcile`,{})).body.state,'verified');
  assert.deepEqual(await collect({requestId}),first);assert.equal((await collect()).body.status,'duplicate');assert.equal(state.writes.length,1);
  assert.equal((await invoke('GET','/api/v3/kb/collect/recent')).body.items.find(x=>x.operationId===id).status,'ok');
});

for(const[field,value]of Object.entries({node_type:'origin',parent_node_token:'ai',origin_node_token:'wrong',space_id:SOURCE,obj_token:'wrong',obj_type:'sheet'}))test(`T12回读${field}不符保持未知且不重发`,async t=>{
  const{state,collect,invoke}=setup(t);state.mismatch={[field]:value};const r=await collect();assert.equal(r.status,502);assert.equal(r.body.code,'COLLECT_RESULT_UNKNOWN');
  const id=r.body.receipt.operationId;assert.equal((await invoke('POST',`/api/v3/kb/operations/${id}/reconcile`,{})).status,502);assert.equal((await collect()).body.code,'COLLECT_PENDING');assert.equal(state.writes.length,1);
});

test('T12回读失败和坏JSON不自动重试，恢复后只读核对',async t=>{
  const{state,collect,invoke}=setup(t);state.readFail=true;const r=await collect();assert.equal(r.status,502);state.readFail=false;
  assert.equal((await invoke('POST',`/api/v3/kb/operations/${r.body.receipt.operationId}/reconcile`,{})).body.state,'verified');
  state.source=node('another',SOURCE,{title:'另一个'});state.badJson=true;const next=await collect();assert.equal(next.status,502);assert.equal(state.writes.length,2);
});

test('T12响应丢失核对不按同名认领：零个或多个新候选均继续未知',async t=>{
  const{state,collect,invoke}=setup(t);state.lost=true;const r=await collect(),id=r.body.receipt.operationId,created=state.nodes.pop();
  assert.equal((await invoke('POST',`/api/v3/kb/operations/${id}/reconcile`,{})).status,502);
  state.nodes.push(created,{...created,node_token:'createdOther'});assert.equal((await invoke('POST',`/api/v3/kb/operations/${id}/reconcile`,{})).status,502);assert.equal(state.writes.length,1);
});

test('T12写前落库失败零写入；写后回执落库失败保留锁并能只读恢复',async t=>{
  const{db,state,collect,invoke}=setup(t);
  db.exec("CREATE TRIGGER t12_fail_intent BEFORE UPDATE ON v3_documents WHEN NEW.kind='kb-operation' AND json_extract(NEW.payload,'$.state')='writing' BEGIN SELECT RAISE(ABORT,'模拟失败'); END;");
  assert.equal((await collect()).status,502);assert.equal(state.writes.length,0);db.exec('DROP TRIGGER t12_fail_intent');
  db.exec("CREATE TRIGGER t12_fail_receipt BEFORE UPDATE ON v3_documents WHEN NEW.kind='kb-operation' AND json_extract(NEW.payload,'$.inFlight.nodeId') IS NOT NULL BEGIN SELECT RAISE(ABORT,'模拟失败'); END;");
  const r=await collect();assert.equal(r.status,502);assert.equal(state.writes.length,1);assert.ok(getRecord(db,'kb-write-lock',SPACE));db.exec('DROP TRIGGER t12_fail_receipt');
  assert.equal((await invoke('POST',`/api/v3/kb/operations/${r.body.receipt.operationId}/reconcile`,{})).body.state,'verified');
});

test('T12进程中断的持久writing状态不重放，恢复按节点身份核对',async t=>{
  const{db,state,collect,invoke,handler}=setup(t),requestId=randomUUID();state.lost=true;const r=await collect({requestId}),id=r.body.receipt.operationId;
  const p=getRecord(db,'kb-operation',id);p.state='writing';p.ownerPid=99999999;delete p.http;putRecord(db,'kb-operation',id,p);
  assert.equal((await collect({requestId},{},handler())).body.code,'COLLECT_RESULT_UNKNOWN');
  assert.equal((await invoke('POST',`/api/v3/kb/operations/${id}/reconcile`,{})).body.state,'verified');assert.equal(state.writes.length,1);
});

test('T12最近记录最多50条且零外部读取，包含失败、重复和未知',async t=>{
  const{state,collect,invoke}=setup(t);await collect();for(let i=0;i<52;i++)await collect();
  state.sourceError=131006;await collect();state.sourceError=null;state.source=node('fresh',SOURCE);state.lost=true;await collect();
  const calls=state.calls.length,result=await invoke('GET','/api/v3/kb/collect/recent');assert.equal(result.body.items.length,50);assert.equal(state.calls.length,calls);
  assert.deepEqual(new Set(result.body.items.map(x=>x.status)),new Set(['unknown','failed','duplicate']));
});

test('T12配对码轮换预览确认回读、旧码跨实例失效、过期及重放拒绝',async t=>{
  const{invoke,collect,handler,advance}=setup(t),base='/api/v3/kb/collect/pairing';
  const old=(await invoke('GET',base)).body;const p=(await invoke('POST',`${base}/preview`,{})).body;
  assert.ok(!JSON.stringify(p).includes(old.code));assert.equal((await invoke('POST',`${base}/rotate`,{previewId:p.previewId})).status,400);
  const changed=await invoke('POST',`${base}/rotate`,{previewId:p.previewId,confirm:true});assert.equal(changed.status,200);assert.notEqual(changed.body.code,old.code);
  assert.deepEqual((await invoke('GET',base,undefined,{},handler())).body,changed.body);
  const ext={origin:'chrome-extension://abcdefghijklmnopabcdefghijklmnop'};
  assert.equal((await collect({url:''},{...ext,'x-niuma-collect-code':old.code},handler())).status,403);
  assert.equal((await collect({url:''},{...ext,'x-niuma-collect-code':changed.body.code})).status,400);
  assert.equal((await invoke('POST',`${base}/rotate`,{previewId:p.previewId,confirm:true})).status,409);
  const expired=(await invoke('POST',`${base}/preview`,{})).body;advance(600001);assert.equal((await invoke('POST',`${base}/rotate`,{previewId:expired.previewId,confirm:true})).status,409);
});

test('T12配对码并行预览冲突和持久化失败不会使旧码提前失效',async t=>{
  const{db,invoke,handler}=setup(t),base='/api/v3/kb/collect/pairing',other=handler();
  const old=(await invoke('GET',base)).body,p=(await invoke('POST',`${base}/preview`,{})).body,q=(await invoke('POST',`${base}/preview`,{}, {},other)).body;
  db.exec("CREATE TRIGGER t12_pairing_fail BEFORE UPDATE ON v3_documents WHEN NEW.kind='kb-collect-pairing' BEGIN SELECT RAISE(ABORT,'不可泄露的秘密'); END;");
  const fail=await invoke('POST',`${base}/rotate`,{previewId:p.previewId,confirm:true});assert.equal(fail.status,409);assert.ok(!JSON.stringify(fail).includes('不可泄露'));assert.deepEqual((await invoke('GET',base)).body,old);db.exec('DROP TRIGGER t12_pairing_fail');
  assert.equal((await invoke('POST',`${base}/rotate`,{previewId:p.previewId,confirm:true})).status,200);
  assert.equal((await invoke('POST',`${base}/rotate`,{previewId:q.previewId,confirm:true},{},other)).status,409);
});

test('T12两个设置默认值可见；规则只读核验后才可预览确认并规范化关键词',async t=>{
  const{db,state,invoke}=setup(t);db.prepare('DELETE FROM settings WHERE key=?').run('kb_collect_rules');
  let r=await invoke('GET','/api/v3/settings');assert.equal(r.body.values.kb_collect_space,SPACE);assert.deepEqual(JSON.parse(r.body.values.kb_collect_rules),COLLECT_RULES);
  const desired=[{...rules[0],keywords:[' brief ','brief','BRIEF',' ','营销']},rules[2]];
  r=await invoke('POST','/api/settings/kb_collect_rules/preview',{value:JSON.stringify(desired)});assert.equal(r.status,200);assert.deepEqual(JSON.parse(r.body.value)[0].keywords,['brief','营销']);assert.equal(state.writes.length,0);
  assert.equal((await invoke('PUT','/api/settings/kb_collect_rules',{previewId:r.body.previewId,confirm:true})).status,200);
  assert.equal((await invoke('GET','/api/v3/settings')).body.values.kb_collect_rules,r.body.value);
});

test('T12规则形状、单词20字、总数200、节点不存在或空间不符校验',async t=>{
  const{state,invoke}=setup(t),preview=value=>invoke('POST','/api/settings/kb_collect_rules/preview',{value:JSON.stringify(value)});
  for(const value of [null,{},[],[{...rules[0],keywords:[1]},rules[2]],[{...rules[0],keywords:['字'.repeat(21)]},rules[2]],[{...rules[0],keywords:Array.from({length:201},(_,i)=>`词${i}`)},rules[2]],[{...rules[0],nodeToken:'missing'},rules[2]],[rules[2],rules[2]]])assert.equal((await preview(value)).status,400);
  assert.equal((await preview([{...rules[0],keywords:['字'.repeat(20)]},rules[2]])).status,200);
  assert.equal((await preview([{...rules[0],keywords:Array.from({length:200},(_,i)=>`词${i}`)},rules[2]])).status,200);
  state.nodes.find(n=>n.node_token==='marketing').space_id=SOURCE;assert.equal((await preview(rules)).status,400);
});

test('T12规则预览与确认期间空间变化拒绝，空间键仍可独立迁移',async t=>{
  const{db,state,invoke}=setup(t);let p=await invoke('POST','/api/settings/kb_collect_rules/preview',{value:JSON.stringify(rules)});assert.equal(p.status,200);
  saveSetting(db,'kb_collect_space',SOURCE);assert.equal((await invoke('PUT','/api/settings/kb_collect_rules',{previewId:p.body.previewId,confirm:true})).status,409);
  saveSetting(db,'kb_collect_space',SPACE);state.onRead=()=>saveSetting(db,'kb_collect_space',SOURCE);
  p=await invoke('POST','/api/settings/kb_collect_rules/preview',{value:JSON.stringify(rules)});assert.equal(p.status,409);state.onRead=null;
  p=await invoke('POST','/api/settings/kb_collect_space/preview',{value:SPACE});assert.equal(p.status,200);assert.equal((await invoke('PUT','/api/settings/kb_collect_space',{previewId:p.body.previewId,confirm:true})).status,200);
});

test('T12旧版doc先查重，不支持新建时前置拒绝且不留未知锁',async t=>{
  const{db,state,collect}=setup(t);state.source.obj_type='doc';
  let r=await collect({url:'https://team.feishu.cn/wiki/source'});assert.equal(r.status,422);assert.equal(r.body.code,'COLLECT_SOURCE_UNSUPPORTED');assert.equal(state.writes.length,0);assert.equal(getRecord(db,'kb-write-lock',SPACE),null);
  state.source.space_id=SPACE;state.nodes.push(state.source);r=await collect({url:'https://team.feishu.cn/wiki/source'});assert.equal(r.body.duplicateKind,'inSpace');assert.equal(state.writes.length,0);
});

test('T12与旧知识库整理共用空间锁，双方都不能越过未核实写入',async t=>{
  const{db,state,collect,invoke}=setup(t);
  putRecord(db,'kb-write-lock',SPACE,{operationId:'oldOperation'});let r=await collect();assert.equal(r.body.code,'COLLECT_PENDING');assert.equal(r.body.receipt.operationId,'oldOperation');assert.equal(state.writes.length,0);
  db.prepare('DELETE FROM v3_documents WHERE kind=? AND id=?').run('kb-write-lock',SPACE);
  state.lost=true;r=await collect();const unknownId=r.body.receipt.operationId;
  putRecord(db,'kb-operation','oldPreview',{id:'oldPreview',spaceId:SPACE,state:'preview',expiresAt:'2099-01-01T00:00:00Z'});
  const old=await invoke('POST','/api/v3/kb/confirm',{previewId:'oldPreview',confirm:true});assert.equal(old.status,409);assert.equal(old.body.receipt.operationId,unknownId);assert.equal(state.writes.length,1);
});

test('T12快捷方式与原文链接共用未知锁，不能换链接形式重发',async t=>{
  const{state,collect}=setup(t);state.nodes.push(node('sourceAlias',SOURCE,{node_type:'shortcut',origin_node_token:'source',obj_token:state.source.obj_token}));
  state.lost=true;const original=await collect();const alias=await collect({url:'https://team.feishu.cn/wiki/sourceAlias'});
  assert.equal(alias.body.code,'COLLECT_PENDING');assert.deepEqual(alias.body.receipt,original.body.receipt);assert.equal(state.writes.length,1);
});

test('T12重新打开同一数据库仍固定重放，配对码也保持一致',async t=>{
  const{dir,state,run,collect,invoke}=setup(t),requestId=randomUUID(),first=await collect({requestId});
  const pairing=(await invoke('GET','/api/v3/kb/collect/pairing')).body;
  const reopened=openDb(dir);
  try{
    const handlers=routes(reopened,undefined,undefined,{kb:{run},settings:{run}});
    assert.deepEqual(await collect({requestId},{},handlers),first);
    assert.deepEqual((await invoke('GET','/api/v3/kb/collect/pairing',undefined,{},handlers)).body,pairing);assert.equal(state.writes.length,1);
  }finally{reopened.close();}
});

test('T12提交前进程中断可只读结束并释放锁，原请求不会永远显示待核对',async t=>{
  const{db,state,collect,invoke}=setup(t),requestId=randomUUID(),id=`collect-${requestId}`;
  putRecord(db,'kb-operation',id,{id,type:'collect',requestId,state:'checking',ownerPid:99999999,spaceId:SPACE,at:new Date().toISOString()});putRecord(db,'kb-write-lock',SPACE,{operationId:id});
  assert.equal((await invoke('POST',`/api/v3/kb/operations/${id}/reconcile`,{})).body.state,'aborted');
  const repeated=await collect({requestId});assert.equal(repeated.status,409);assert.equal(repeated.body.code,undefined);assert.equal(repeated.body.receipt,undefined);assert.equal(state.writes.length,0);assert.equal(getRecord(db,'kb-write-lock',SPACE),null);
  assert.equal((await collect()).body.status,'created');assert.equal(state.writes.length,1);
});

test('T12另一进程已结束请求留下unknown时，不因原服务进程仍存活而禁止核对',async t=>{
  const{db,state,collect,invoke}=setup(t);state.lost=true;const r=await collect(),id=r.body.receipt.operationId,p=getRecord(db,'kb-operation',id);
  p.ownerPid=1;putRecord(db,'kb-operation',id,p);
  assert.equal((await invoke('POST',`/api/v3/kb/operations/${id}/reconcile`,{})).body.state,'verified');assert.equal(state.writes.length,1);
});
