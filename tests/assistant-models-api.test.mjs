import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { openDb } from "../server/db.mjs";
import { routes } from "../server/routes/assistants.mjs";
import { match, json } from "../server/http.mjs";
import { fakeAppServer } from "./helpers/fake-app-server.mjs";

async function setup(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,"models-api-"));
  const db = openDb(dir), fake = fakeAppServer(t), handlers = routes(db,fake.client);
  const server = createServer(async (req,res) => {
    const url = new URL(req.url,"http://localhost"), found = match(handlers,req.method,url.pathname);
    if (!found) return json(res,404,{error:"不存在"});
    try { await found.handler(req,res,{params:found.params,url}); } catch (e) { json(res,500,{error:e.message}); }
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(async()=>{ fake.controls.complete?.(); await new Promise(resolve=>server.close(resolve)); db.close(); rmSync(dir,{recursive:true,force:true}); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (method,url,body)=>fetch(base+url,{method,headers:{"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  return {...fake,request,base};
}

test("模型 API 与设置校验、只改强度、清空恢复、名称编辑保留设置；runtime 来自协议", async (t)=>{
  const {request,requests} = await setup(t);
  const models = await (await request("GET","/api/codex/models")).json();
  assert.equal(models[0].model,"a"); assert.equal(models[0].id,"id-a");
  assert.equal(await (await request("GET","/api/assistants/1/runtime")).json(),null);
  assert.ok(!requests.some(r=>r.method==="thread/start"));
  const patch=body=>request("PATCH","/api/assistants/1",body);
  for (const body of [{model:"missing",effort:"medium"},{model:"a",effort:"ultra"},{model:null,effort:"high"},{effort:"high"},{model:3},{effort:[]},{model:""}]) {
    assert.equal((await patch(body)).status,400,JSON.stringify(body));
  }
  const saved = await (await patch({model:"b",effort:"high"})).json();
  assert.equal(saved.model,"b"); assert.equal(saved.effort,"high");
  assert.equal((await (await patch({effort:"medium"})).json()).effort,"medium");
  assert.equal((await (await patch({name:"改名"})).json()).model,"b");
  assert.equal((await patch({model:null})).status,400);
  const stream = await (await request("POST","/api/assistants/1/messages",{text:"测试"})).text();
  assert.match(stream,/event: done/);
  assert.deepEqual(await (await request("GET","/api/assistants/1/runtime")).json(),{model:"b",effort:"medium"});
  const reset=await(await patch({model:null,effort:null})).json();
  assert.equal(reset.model,null); assert.equal(reset.effort,null);
  await (await request("POST","/api/assistants/1/messages",{text:"恢复后"})).text();
  assert.deepEqual(await (await request("GET","/api/assistants/1/runtime")).json(),{model:"a",effort:"medium"});
  assert.equal((await request("GET","/api/assistants/999/runtime")).status,404);
});

test("回复中与等待模型校验期间的 PATCH 均返回 409，不更改已保存值",async(t)=>{
  const {request,controls} = await setup(t);
  let release;
  controls.handle=(r,finish)=>{if(r.method==="model/list"){release=()=>finish({data:[{id:"a",model:"a",displayName:"a",description:"",hidden:false,isDefault:true,defaultReasoningEffort:"medium",supportedReasoningEfforts:[{reasoningEffort:"medium",description:""}]}],nextCursor:null});return false;}};
  const editing=request("PATCH","/api/assistants/1",{model:"a",effort:"medium"});
  while(!release) await new Promise(resolve=>setImmediate(resolve));
  controls.holdTurn=true;
  const response=await request("POST","/api/assistants/1/messages",{text:"保持回复"});
  release(); assert.equal((await editing).status,409);
  while(!controls.complete) await new Promise(resolve=>setImmediate(resolve));
  assert.equal((await request("PATCH","/api/assistants/1",{model:null,effort:null})).status,409);
  assert.equal((await request("GET","/api/assistants/1/runtime")).status,409);
  controls.complete(); await response.text();
  assert.equal((await(await request("GET","/api/assistants")).json())[0].model,null);
});

test("延迟 PATCH 请求体重新读取其他编辑后的字段，发送也读取最新选择",async(t)=>{
  const {request,base,requests} = await setup(t);
  let delayed;
  const finished=new Promise((resolve,reject)=>{
    delayed=httpRequest(base+"/api/assistants/1",{method:"PATCH",headers:{"content-type":"application/json"}},res=>{let text="";res.on("data",chunk=>text+=chunk);res.on("end",()=>resolve({status:res.statusCode,value:JSON.parse(text)}));});
    delayed.on("error",reject); delayed.flushHeaders(); delayed.write('{"name":');
  });
  await request("PATCH","/api/assistants/1",{model:"b",effort:"high"});
  delayed.end('"稍后改名"}');
  const edited=await finished; assert.equal(edited.status,200); assert.equal(edited.value.model,"b");assert.equal(edited.value.effort,"high");
  await(await request("POST","/api/assistants/1/messages",{text:"使用新设置"})).text();
  assert.equal(requests.find(r=>r.method==="turn/start").params.model,"b");
});

test("列表失败返回明确错误；保存模型下架后发送失败且无 turn/start",async(t)=>{
  const {request,controls,client,requests} = await setup(t);
  await request("PATCH","/api/assistants/1",{model:"b",effort:"high"});
  client.close();
  controls.handle=(r,finish,fail)=>{if(r.method==="model/list"){fail("账号不可用");return false;}};
  const failed=await request("GET","/api/codex/models");assert.equal(failed.status,500);assert.match((await failed.json()).error,/账号不可用/);
  controls.handle=(r,finish)=>{if(r.method==="model/list"){finish({data:[],nextCursor:null});return false;}};
  const text=await(await request("POST","/api/assistants/1/messages",{text:"不可用模型"})).text();
  assert.match(text,/当前不可用/);assert.doesNotMatch(text,/event: done/);
  assert.ok(!requests.some(r=>r.method==="turn/start"));
  assert.equal((await(await request("GET","/api/assistants")).json())[0].model,"b");
});
