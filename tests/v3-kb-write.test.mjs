import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { openDb, saveSetting } from '../server/db.mjs';
import { getRecord, putRecord } from '../server/local-records.mjs';
import { KB_SPACE, createKnowledgeTreeService } from '../server/knowledge-tree.mjs';
import { projectRoutes } from '../server/routes/projects.mjs';
import { match } from '../server/http.mjs';

const instant=Date.parse('2026-10-16T14:00:00+08:00');
function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR,'测试必须使用隔离数据');
  const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'kb-write-')),db=openDb(dir);
  t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
  let clock=instant,sequence=0;
  const state={nodes:[{id:'root',name:'目录',parentId:''},{id:'child',name:'文档',parentId:'root'},{id:'peer',name:'同级',parentId:''}],writes:[],reads:0,failAfterWrite:false,failReadback:false,badIdentity:false,hold:null};
  const nodes=()=>state.nodes.map(n=>({node_token:n.id,obj_token:`doc${n.id}`,space_id:KB_SPACE,obj_type:'docx',node_type:'origin',title:n.name,parent_node_token:n.parentId,has_child:state.nodes.some(c=>c.parentId===n.id)}));
  const run=async(command,args,options)=>{
    assert.equal(command,'lark-cli');assert.deepEqual(args.slice(0,2),['--profile','codex']);assert.equal(args[args.indexOf('--as')+1],'user');assert.equal(options.shell,false);
    const arg=key=>args[args.indexOf(key)+1],ok=data=>({stdout:JSON.stringify({ok:true,identity:'user',data})});
    if(args.includes('whoami')){assert.deepEqual(args,['--profile','codex','--as','user','whoami']);if(state.hold)await state.hold;return{stdout:JSON.stringify({profile:'codex',appId:state.badIdentity?'other':'cli_aacf58ab61b85beb',identity:'user'})};}
    if(args.includes('+node-list')){state.reads++;if(state.failReadback&&state.writes.length)throw Error('模拟回读失败');const parent=args.includes('--parent-node-token')?arg('--parent-node-token'):'';return ok({nodes:nodes().filter(n=>n.parent_node_token===parent),has_more:false});}
    if(args.includes('+node-get'))return ok(nodes().find(n=>n.node_token===arg('--node-token'))||{});
    let result;
    if(args.includes('+node-create')){
      assert.equal(arg('--space-id'),KB_SPACE);assert.equal(arg('--obj-type'),'docx');assert.equal(arg('--node-type'),'origin');
      const node={id:`created${++sequence}`,name:arg('--title'),parentId:args.includes('--parent-node-token')?arg('--parent-node-token'):''};state.nodes.push(node);
      result={resolved_space_id:KB_SPACE,node_token:node.id,obj_token:`doc${node.id}`,obj_type:'docx',node_type:'origin',title:node.name};
    }else if(args.includes('+move')){
      assert.equal(arg('--source-space-id'),KB_SPACE);assert.equal(arg('--target-space-id'),KB_SPACE);assert.ok(!args.includes('--obj-token'));assert.ok(!args.includes('--apply'));
      const node=state.nodes.find(n=>n.id===arg('--node-token'));node.parentId=args.includes('--target-parent-token')?arg('--target-parent-token'):'';
      result={mode:'node',source_space_id:KB_SPACE,target_space_id:KB_SPACE,space_id:KB_SPACE,node_token:node.id,parent_node_token:node.parentId};
    }else if(args.includes('+update-title')){
      assert.equal(arg('--type'),'wiki');const node=state.nodes.find(n=>n.id===arg('--token'));node.name=arg('--title');result={updated:true,file_token:node.id,type:'wiki',title:node.name};
    }else throw Error(`未允许的模拟CLI命令: ${args[2]}`);
    state.writes.push(args);
    if(state.onWrite)state.onWrite();
    if(state.failAfterWrite)throw Error('模拟请求已执行但响应丢失');
    return ok(result);
  };
  const readSource=async()=>({nodes:nodes(),metadata:Object.fromEntries(nodes().map(n=>[n.obj_token,{latest_modify_time:'1792108800'}])),contents:Object.fromEntries(nodes().map(n=>[n.node_token,'合成正文'])),errors:{}});
  const service=()=>createKnowledgeTreeService(db,{now:()=>clock,run,readSource});
  return{db,state,service,advance:ms=>clock+=ms};
}
const rename={type:'rename',id:'child',name:'新名称'};
async function invoke(kb,method,endpoint,value) {
  const routes=projectRoutes({kb,projects:{},mentor:{}}),url=new URL(endpoint,'http://127.0.0.1'),found=match(routes,method,url.pathname);assert.ok(found);
  const req=Readable.from(value===undefined?[]:[Buffer.from(JSON.stringify(value))]);req.method=method;req.url=endpoint;
  let status,text;const res={setHeader(){},writeHead(code){status=code;},end(body){text=body;}};
  await found.handler(req,res,{params:found.params,url});return{status,body:JSON.parse(text)};
}

test('KB预览只持久化计划且禁止删除、跨空间、循环及伪造目标',async t=>{
  const{state,service}=setup(t),kb=service();
  const p=await kb.preview({ops:[rename]});assert.equal(p.writeEnabled,false);assert.equal(p.spaceId,KB_SPACE);assert.equal(state.writes.length,0);assert.equal(kb.status(p.previewId).state,'preview');
  for(const op of [{type:'delete',id:'child'},{...rename,targetSpaceId:'other'},{type:'move',id:'root',parentId:'child'},{type:'move',id:'missing',parentId:''},{type:'mkdir',id:'__proto__',name:'不允许',parentId:''}])await assert.rejects(kb.preview({ops:[op]}),{status:400});
  await assert.rejects(kb.confirm({previewId:p.previewId}),{status:400});assert.equal(state.writes.length,0);
});

test('KB确认依序创建空docx目录、同空间移动、重命名并逐项回读，回执跨实例固定',async t=>{
  const{state,service,advance}=setup(t),kb=service();
  const p=await kb.preview({ops:[{type:'mkdir',id:'newFolder',name:'归档',parentId:''},{type:'move',id:'child',parentId:'newFolder'},rename]});
  const result=await kb.confirm({previewId:p.previewId,confirm:true,ops:[{type:'delete',id:'root'}]});
  assert.equal(result.state,'verified');assert.equal(result.completed.length,3);assert.equal(result.created.newFolder,'created1');assert.deepEqual(state.nodes.find(n=>n.id==='child'),{id:'child',name:'新名称',parentId:'created1'});assert.ok(state.reads>=4);
  assert.ok(!state.writes[0].includes('--parent-node-token'));assert.ok(state.writes[1].includes('created1'));
  state.nodes.find(n=>n.id==='child').name='之后的真实变更';advance(700000);
  assert.deepEqual(await service().confirm({previewId:p.previewId,confirm:true}),result);assert.equal(state.writes.length,3);
  assert.equal((await kb.list()).tree.find(n=>n.id==='created1').kids[0].name,'之后的真实变更');
});

test('KB配置、目录版本、过期或身份变化在首次写入前拒绝',async t=>{
  const{db,state,service,advance}=setup(t),kb=service();
  let p=await kb.preview({ops:[rename]});state.nodes.find(n=>n.id==='peer').name='外部改名';await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}),{status:409});assert.equal(state.writes.length,0);
  p=await kb.preview({ops:[rename]});saveSetting(db,'kb_space_id','999');await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}),{status:409});saveSetting(db,'kb_space_id',KB_SPACE);
  advance(600001);await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}),{status:409});
  p=await kb.preview({ops:[rename]});state.badIdentity=true;await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}),{status:403});assert.equal(state.writes.length,0);
});

test('KB并发确认按空间串行，未确认操作与进行中恢复均不能插入写入',async t=>{
  const{state,service}=setup(t),a=service(),b=service(),p=await a.preview({ops:[rename]}),q=await b.preview({ops:[{type:'rename',id:'peer',name:'另一个'}]});
  let release;state.hold=new Promise(resolve=>release=resolve);const first=a.confirm({previewId:p.previewId,confirm:true});
  await assert.rejects(b.confirm({previewId:q.previewId,confirm:true}),{status:409});await assert.rejects(b.reconcile(p.previewId),{status:409});
  release();await first;assert.equal(state.writes.length,1);
});

test('KB响应丢失保留未知锁，重启服务不能重发；只读核对后仅完成已执行部分',async t=>{
  const{db,state,service}=setup(t),kb=service(),p=await kb.preview({ops:[rename,{type:'rename',id:'peer',name:'尚未执行'}]});
  state.failAfterWrite=true;await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}),{status:409,code:'KB_RESULT_UNKNOWN',receipt:{operationId:p.previewId,status:'unknown'}});assert.equal(kb.status(p.previewId).state,'unknown');
  assert.equal(getRecord(db,'kb-write-lock',KB_SPACE).operationId,p.previewId);
  const restarted=service();await assert.rejects(restarted.confirm({previewId:p.previewId,confirm:true}),{status:409});await assert.rejects(restarted.preview({ops:[rename]}),{status:409,code:'KB_RESULT_UNKNOWN',receipt:{operationId:p.previewId,status:'unknown'}});assert.equal(state.writes.length,1);
  const recovered=await restarted.reconcile(p.previewId);assert.equal(recovered.state,'partial');assert.equal(recovered.completed.length,1);assert.equal(recovered.remaining.length,1);assert.equal(state.writes.length,1);assert.equal(getRecord(db,'kb-write-lock',KB_SPACE),null);
  state.failAfterWrite=false;const next=await restarted.preview({ops:recovered.remaining.map(({before,...op})=>op)});await restarted.confirm({previewId:next.previewId,confirm:true});assert.equal(state.writes.length,2);
});

test('KB创建响应丢失不凭同名认领或重建，用户指定已核对节点后只读恢复',async t=>{
  const{state,service}=setup(t),kb=service(),p=await kb.preview({ops:[{type:'mkdir',id:'newFolder',name:'归档',parentId:''}]});
  state.failAfterWrite=true;await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}),{status:409});await assert.rejects(service().reconcile(p.previewId),{status:409});assert.equal(state.writes.length,1);
  await assert.rejects(kb.reconcile(p.previewId,{confirmObserved:true,nodeId:'peer'}),{status:409});
  const recovered=await kb.reconcile(p.previewId,{confirmObserved:true,nodeId:'created1'});assert.equal(recovered.state,'verified');assert.equal(recovered.created.newFolder,'created1');assert.equal(state.writes.length,1);
});

test('KB写后回读失败保持锁与未知结果，恢复只读核对且不覆盖后续外部变化',async t=>{
  const{state,service}=setup(t),kb=service(),p=await kb.preview({ops:[rename]});state.failReadback=true;
  await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}),{status:409});assert.equal(kb.status(p.previewId).state,'unknown');
  state.failReadback=false;state.nodes.find(n=>n.id==='peer').name='并行变动';await assert.rejects(kb.reconcile(p.previewId),{status:409});assert.equal(state.writes.length,1);
  state.nodes.find(n=>n.id==='peer').name='同级';assert.equal((await kb.reconcile(p.previewId)).state,'verified');assert.equal(state.writes.length,1);
});

test('KB写中配置变化不继续后续步骤，切回原空间只读恢复',async t=>{
  const{db,state,service}=setup(t),kb=service(),p=await kb.preview({ops:[rename,{type:'rename',id:'peer',name:'尚未执行'}]});state.onWrite=()=>saveSetting(db,'kb_space_id','999');
  await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}),{status:409});assert.equal(state.writes.length,1);await assert.rejects(kb.reconcile(p.previewId),{status:409});
  saveSetting(db,'kb_space_id',KB_SPACE);assert.equal((await kb.reconcile(p.previewId)).state,'partial');assert.equal(state.writes.length,1);
});

test('KB第二步身份变更停止余下写入，已核实部分形成固定回执',async t=>{
  const{state,service}=setup(t),kb=service(),p=await kb.preview({ops:[rename,{type:'rename',id:'peer',name:'尚未执行'}]});state.onWrite=()=>{state.badIdentity=true;};
  await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}),{status:403});assert.equal(state.writes.length,1);assert.equal(kb.status(p.previewId).state,'partial');assert.equal(kb.status(p.previewId).remaining.length,1);
});

test('KB写前日志落库失败零外部写入；写后回执落库失败仍保留持久锁并可只读恢复',async t=>{
  const{db,state,service}=setup(t),kb=service();let p=await kb.preview({ops:[rename]});
  db.exec("CREATE TRIGGER fail_kb_intent BEFORE UPDATE ON v3_documents WHEN NEW.kind='kb-operation' AND json_extract(NEW.payload,'$.state')='writing' BEGIN SELECT RAISE(ABORT,'模拟意图日志失败'); END;");
  await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}));assert.equal(state.writes.length,0);assert.equal(kb.status(p.previewId).state,'aborted');db.exec('DROP TRIGGER fail_kb_intent');
  p=await kb.preview({ops:[rename]});db.exec("CREATE TRIGGER fail_kb_result BEFORE UPDATE ON v3_documents WHEN NEW.kind='kb-operation' AND json_extract(NEW.payload,'$.inFlight.result.nodeId') IS NOT NULL BEGIN SELECT RAISE(ABORT,'模拟回执日志失败'); END;");
  await assert.rejects(kb.confirm({previewId:p.previewId,confirm:true}));assert.equal(state.writes.length,1);assert.equal(getRecord(db,'kb-write-lock',KB_SPACE).operationId,p.previewId);db.exec('DROP TRIGGER fail_kb_result');
  await assert.rejects(service().confirm({previewId:p.previewId,confirm:true}),{status:409});assert.equal((await service().reconcile(p.previewId)).state,'verified');assert.equal(state.writes.length,1);
});

test('KB进程中断前已持久化的写入状态不会自动重放，离线恢复按效果核对',async t=>{
  const{db,state,service}=setup(t),kb=service(),p=await kb.preview({ops:[rename]});
  const saved=getRecord(db,'kb-operation',p.previewId);saved.state='writing';saved.ownerPid=99999999;saved.inFlight={originalId:'child',operation:{...rename,before:'文档'}};putRecord(db,'kb-operation',p.previewId,saved);putRecord(db,'kb-write-lock',KB_SPACE,{operationId:p.previewId});
  state.nodes.find(n=>n.id==='child').name='新名称';await assert.rejects(service().confirm({previewId:p.previewId,confirm:true}),{status:409});
  assert.equal((await service().reconcile(p.previewId)).state,'verified');assert.equal(state.writes.length,0);
});

test('KB确认、操作查询和只读核对路由保持同一预览目标及门禁',async t=>{
  const{state,service}=setup(t),kb=service();
  assert.equal((await invoke(kb,'POST','/api/v3/kb/confirm',{})).status,400);
  const preview=await invoke(kb,'POST','/api/v3/kb/preview',{ops:[{type:'move',id:'child',parentId:''}]});assert.equal(preview.status,200);assert.equal(state.writes.length,0);
  const id=preview.body.previewId,confirmed=await invoke(kb,'POST','/api/v3/kb/confirm',{previewId:id,confirm:true});assert.equal(confirmed.status,200);assert.equal(confirmed.body.state,'verified');assert.ok(!state.writes[0].includes('--target-parent-token'));
  assert.deepEqual((await invoke(kb,'GET',`/api/v3/kb/operations/${id}`)).body,confirmed.body);
  assert.deepEqual((await invoke(kb,'POST',`/api/v3/kb/operations/${id}/reconcile`,{})).body,confirmed.body);assert.equal(state.writes.length,1);
});

test('画布拖完即写：只读目录生成计划，单项写入并回读；多项、非法操作和结果不明锁都拒绝',async t=>{
  const{state,service}=setup(t),kb=service();
  const r=await invoke(kb,'POST','/api/v3/kb/quick',{ops:[{type:'move',id:'child',parentId:''}]});
  assert.equal(r.status,200);assert.equal(r.body.state,'verified');assert.equal(state.writes.length,1);
  assert.equal(state.nodes.find(n=>n.id==='child').parentId,'');
  assert.equal((await invoke(kb,'POST','/api/v3/kb/quick',{ops:[rename,rename]})).status,400);
  assert.equal((await invoke(kb,'POST','/api/v3/kb/quick',{ops:[{type:'delete',id:'child'}]})).status,400);
  const made=await invoke(kb,'POST','/api/v3/kb/quick',{ops:[{type:'mkdir',id:'g1',name:'新分组',parentId:''}]});
  assert.equal(made.body.state,'verified');assert.ok(made.body.created.g1);assert.equal(state.writes.length,2);
  state.failAfterWrite=true;
  assert.equal((await invoke(kb,'POST','/api/v3/kb/quick',{ops:[rename]})).status,409);
  state.failAfterWrite=false;
  const locked=await invoke(kb,'POST','/api/v3/kb/quick',{ops:[{type:'move',id:'child',parentId:'root'}]});
  assert.equal(locked.status,409);assert.equal(locked.body.code,'KB_RESULT_UNKNOWN');assert.equal(state.writes.length,3);
});

test('画布分组顺序只存本机，校验节点ID列表',async t=>{
  const{state,service}=setup(t),kb=service();
  assert.deepEqual((await invoke(kb,'GET','/api/v3/kb/layout')).body,{order:[]});
  assert.equal((await invoke(kb,'PUT','/api/v3/kb/layout',{order:['root','peer']})).status,200);
  assert.deepEqual((await invoke(kb,'GET','/api/v3/kb/layout')).body,{order:['root','peer']});
  for(const order of [['root','root'],['a/b'],'root'])assert.equal((await invoke(kb,'PUT','/api/v3/kb/layout',{order})).status,400);
  assert.equal(state.writes.length,0);
});
