import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createFeishuClient,runFeishuCommand} from '../server/feishu-export.mjs';

const options={shell:false,encoding:'utf8',timeout:3000,maxBuffer:64*1024};
const validation={ok:false,identity:'user',error:{type:'validation',subtype:'invalid_argument',message:'private document text',param:'--block-id'}};
const logId='202610221827021192585D6E0EFB24ABAC';
const rejected={ok:false,identity:'user',error:{type:'api',subtype:'unknown',code:3380002,log_id:logId,message:'private document text',troubleshooter:'https://private.example/secret'}};
const rangeWarning='degrade_code=1002,msg=Invalid block range: start_block_id and end_block_id must be sibling blocks under the same parent. Choose a forward range of direct sibling blocks within one container';
const rangeFailed={ok:false,identity:'user',data:{document:{revision_id:3,url:'https://private.example/secret'},result:'failed',warnings:[rangeWarning]}};
const failed=(payload,extra={})=>async()=>{throw Object.assign(new Error('secret command arguments'),{code:1,stdout:'',stderr:JSON.stringify(payload),...extra});};
async function diagnostic(run){
  let failure;try{await createFeishuClient(run).cli(['docs','+update','--content','-'],'<p>private body</p>');}catch(e){failure=e;}
  assert.equal(failure?.code,'EXPORT_CLI_FAILED');
  assert.doesNotMatch(JSON.stringify(failure),/private|secret|https:|stdout|stderr|troubleshooter/);
  return failure.diagnostic;
}

test('CLI真实子进程收到完整中文多行stdin，内容不进入参数',async()=>{
  const input='<h1>离线验证</h1><p>第一行\n第二行 &amp; 内容</p>';
  const result=await runFeishuCommand(process.execPath,['--input-type=module','-e',"let s='';process.stdin.setEncoding('utf8');for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify({s,args:process.argv.slice(1)}));"],{...options,input});
  const back=JSON.parse(result.stdout);assert.equal(back.s,input);assert.deepEqual(back.args,[]);
});

test('真实非零子进程stderr保留供分类，公开错误只留脱敏诊断',async()=>{
  const run=(_command,_args,opts)=>runFeishuCommand(process.execPath,['-e',`process.stdin.resume();process.stdin.on('end',()=>{process.stderr.write(${JSON.stringify(JSON.stringify(validation))});process.exitCode=2;});`],opts);
  assert.deepEqual(await diagnostic(run),{phase:'cli_validation',outcome:'not_sent',exitCode:2,errorType:'validation',errorSubtype:'invalid_argument'});
});

test('底层进程失败保留stdout和stderr，不把输入拼接到命令',async()=>{
  await assert.rejects(runFeishuCommand(process.execPath,['-e',"process.stdout.write('output');process.stderr.write('error-json');process.exitCode=7;"],{...options,input:'not-an-argument'}),e=>{
    assert.equal(e.code,7);assert.equal(e.stdout,'output');assert.equal(e.stderr,'error-json');assert.ok(!e.cmd.includes('not-an-argument'));return true;
  });
});

test('明确文档不存在的API错误记录拒绝码与安全requestId',async()=>{
  assert.deepEqual(await diagnostic(failed(rejected)),{phase:'api',outcome:'rejected',exitCode:1,errorType:'api',errorSubtype:'unknown',apiCode:3380002,requestId:logId});
});

test('普通HTTP4xx、API失败与部分成功不推断整体无写入',async()=>{
  for(const http_status of [400,403,409,429,500]){
    const d=await diagnostic(failed({ok:false,error:{type:'api',subtype:'unknown',code:999999,http_status}}));
    assert.equal(d.outcome,'unknown');assert.equal(d.httpStatus,http_status);
  }
  const d=await diagnostic(failed({ok:false,error:{type:'api',code:3380002}},{stdout:JSON.stringify({ok:true,data:{result:'partial_success'}})}));
  assert.equal(d.outcome,'unknown');
});

test('真实无error信封的范围失败记录固定原因，不暴露原warning或文档URL',async()=>{
  const d=await diagnostic(failed(null,{stdout:JSON.stringify(rangeFailed),stderr:''}));
  assert.deepEqual(d,{phase:'api',outcome:'rejected',exitCode:1,errorType:'document_result',result:'failed',degradeCode:1002,reason:'invalid_block_range'});
});

test('同范围warning的部分成功、截断、未知附加warning或超时不记确定拒绝',async()=>{
  for(const [payload,extra] of [
    [{...rangeFailed,ok:true,data:{...rangeFailed.data,result:'partial_success'}},{}],
    [{...rangeFailed,truncated:true},{}],
    [{...rangeFailed,data:{...rangeFailed.data,warnings:[rangeWarning,'secret further warning']}},{}],
    [rangeFailed,{killed:true,signal:'SIGTERM'}],
    [{...rangeFailed,data:{...rangeFailed.data,warnings:['degrade_code=1002,msg=secret different issue']}},{}],
  ]){
    const d=await diagnostic(failed(null,{stdout:JSON.stringify(payload),stderr:'',...extra}));
    assert.equal(d.outcome,'unknown');assert.equal(d.reason,undefined);
  }
});

test('validation缺少明确本地参数、错误退出码或进程被终止均保持unknown',async()=>{
  for(const [payload,extra] of [[{...validation,error:{...validation.error,param:undefined}},{code:2}],[validation,{code:1}],[validation,{code:2,killed:true}],[validation,{code:2,signal:'SIGTERM'}]]){
    assert.equal((await diagnostic(failed(payload,extra))).outcome,'unknown');
  }
});

test('网络/超时与非JSON输出不附带原文也不认定未发送',async()=>{
  for(const run of [async()=>{throw Object.assign(new Error('private network response'),{code:'ETIMEDOUT',stderr:'secret token'});},async()=>({stdout:'private document text'})]){
    assert.equal((await diagnostic(run)).outcome,'unknown');
  }
});

test('stdout与stderr矛盾错误、字符串拼接的JSON均不构造确定结论',async()=>{
  assert.equal((await diagnostic(failed(validation,{code:2,stdout:JSON.stringify(rejected)}))).outcome,'unknown');
  assert.equal((await diagnostic(failed(validation,{code:2,stderr:JSON.stringify(validation)+'\n'+JSON.stringify(rejected)}))).outcome,'unknown');
});

test('unsafe诊断字段和任意URL均不会进入公开错误',async()=>{
  const d=await diagnostic(failed({ok:false,error:{type:'https://private',subtype:'secret body',code:'Bearer secret',http_status:999,log_id:'token_secret_123'}}));
  assert.deepEqual(d,{phase:'process',outcome:'unknown',exitCode:1});
  const tokenLike=await diagnostic(failed({ok:false,error:{type:'abcdefghijklmnopqrstuvwxyzabcdef',subtype:'abcdefghijklmnopqrstuvwxyzabcdef'}}));
  assert.deepEqual(tokenLike,{phase:'process',outcome:'unknown',exitCode:1});
});

test('非零之外的API错误仍记录元数据，成功信封保持用户身份完整性门禁',async()=>{
  const d=await diagnostic(async()=>({stdout:JSON.stringify(rejected)}));assert.equal(d.apiCode,3380002);assert.equal(d.phase,'api');
  for(const result of [null,{ok:true,identity:'bot',data:{}},{ok:true,identity:'user',data:{},truncated:true},{ok:true,identity:'user',data:{truncated:true}}]){
    assert.deepEqual(await diagnostic(async()=>({stdout:JSON.stringify(result)})),{phase:'protocol',outcome:'unknown'});
  }
  const client=createFeishuClient(async()=>({stdout:JSON.stringify({ok:true,identity:'user',data:{result:'success'}})}));
  assert.equal((await client.cli(['docs','+fetch'])).data.result,'success');
});
