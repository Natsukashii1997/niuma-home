import { test } from "node:test";
import assert from "node:assert/strict";
import { createCalendarReader, calendarDay, readCalendarAgenda } from "../server/calendar.mjs";

const start = Date.parse("2026-10-14T09:00:00+08:00");

test("今日日界固定上海时区，不依赖进程时区", () => {
  assert.deepEqual(calendarDay(Date.parse("2026-10-13T16:01:00Z")), {
    date: "2026-10-14", start: "2026-10-14T00:00:00+08:00", end: "2026-10-15T00:00:00+08:00",
  });
  assert.equal(calendarDay(Date.parse("2026-12-31T16:00:00Z")).date,"2027-01-01");
});

test("缓存5分钟，包括空列表；失败不缓存，后续调用能恢复", async () => {
  let now=start,calls=0,broken=false;
  const read=createCalendarReader({now:()=>now,readAgenda:async()=>{calls++;if(broken)throw new Error("故障");return [];}});
  assert.deepEqual(await read(),[]);now+=299_999;await read();assert.equal(calls,1);
  now++;await read();assert.equal(calls,2);
  now+=300_000;broken=true;await assert.rejects(read(),/故障/);assert.equal(calls,3);
  broken=false;await read();assert.equal(calls,4);
});

test("并发读取合并，跨上海零点不复用昨日缓存或昨日慢请求", async () => {
  let now=Date.parse("2026-10-14T23:59:00+08:00"),calls=[];
  const read=createCalendarReader({now:()=>now,readAgenda:day=>new Promise(resolve=>calls.push({day,resolve}))});
  const old=read(),joined=read();assert.equal(calls.length,1);
  now+=60_000;const fresh=read();assert.equal(calls.length,2);
  calls[1].resolve([{time:"全天",title:"今日",place:""}]);await fresh;
  calls[0].resolve([{time:"全天",title:"昨日",place:""}]);await old;await joined;
  assert.equal((await read())[0].title,"今日");assert.equal(calls.length,2);
  assert.equal(calls[1].day.date,"2026-10-15");
});

test("CLI错误：缺命令、缺日历权限、未登录、超时和异常输出都显示中文原因", async () => {
  const errors=[
    [{code:"ENOENT"},503,/未找到 lark-cli/],
    [{stderr:JSON.stringify({ok:false,error:{type:"authorization",subtype:"missing_scope",message:"missing required scope(s): calendar:calendar.event:read"}})},403,/缺少日历读取权限/],
    [{stderr:JSON.stringify({ok:false,error:{type:"authentication",message:"not logged in"}})},401,/尚未登录或登录已过期/],
    [{killed:true},504,/超时/],
    [{code:"ERR_CHILD_PROCESS_STDIO_MAXBUFFER"},502,/不完整/],
    [{stderr:"network unavailable secret-value"},502,/读取失败/],
  ];
  for(const [error,status,pattern] of errors){
    await assert.rejects(readCalendarAgenda(calendarDay(start),{run:async()=>{throw error;}}), e=>{
      assert.equal(e.status,status);assert.match(e.message,pattern);assert.doesNotMatch(e.message,/secret-value/);return true;
    });
  }
  await assert.rejects(readCalendarAgenda(calendarDay(start),{run:async()=>({stdout:"bad"})}),{status:502});
});

test("官方结构人工样例：开始时间排序、全天、时区换算与地点缺失", async () => {
  const { readFileSync } = await import("node:fs");
  const { agendaRows } = await import("../server/calendar.mjs");
  const fixture=JSON.parse(readFileSync(new URL("../fixtures/calendar-synthetic.json",import.meta.url),"utf8"));
  const expected=[{time:"全天",title:"人工样例：全天事项",place:""},{time:"09:00–09:30",title:"人工样例：上午沟通",place:""},{time:"14:00–15:00",title:"人工样例：下午评审",place:"测试会议室"}];
  assert.deepEqual(agendaRows(fixture,calendarDay(start)),expected);
  assert.deepEqual(await readCalendarAgenda(calendarDay(start),{run:async(command,args,options)=>{
    assert.equal(command,"lark-cli");assert.deepEqual(args,["--profile","cli_a965c429ef785bd3","calendar","+agenda","--as","user","--start","2026-10-14T00:00:00+08:00","--end","2026-10-15T00:00:00+08:00","--format","json"]);
    assert.equal(options.shell,false);return {stdout:JSON.stringify(fixture)};
  }}),expected);
  const error=readFileSync(new URL("../fixtures/calendar-error-recorded.json",import.meta.url),"utf8");
  await assert.rejects(readCalendarAgenda(calendarDay(start),{run:async()=>{throw {stderr:error};}}),{status:403});
});

test("真实脱敏录制：四条日程逐字段转换，保留同时间事件", async () => {
  const { readFileSync } = await import("node:fs");
  const { agendaRows } = await import("../server/calendar.mjs");
  const stdout = readFileSync(new URL("../fixtures/calendar-real-redacted.json", import.meta.url), "utf8");
  const fixture = JSON.parse(stdout);
  const expected = [
    { time: "09:45–10:30", title: "脱敏日程 1", place: "" },
    { time: "11:00–12:30", title: "脱敏日程 2", place: "" },
    { time: "15:00–16:00", title: "脱敏日程 3", place: "" },
    { time: "15:00–16:00", title: "脱敏日程 4", place: "" },
  ];
  const day = calendarDay(Date.parse("2026-10-14T12:00:00+08:00"));
  assert.equal(fixture.ok, true);
  assert.equal(fixture.identity, "user");
  assert.equal(fixture.data.length, 4);
  assert.deepEqual(agendaRows(fixture, day), expected);
  assert.deepEqual(await readCalendarAgenda(day, { run: async () => ({ stdout }) }), expected);
});

test("跨日与日界：全天包含最后日期，同名同时间不去重，过滤其他日期", async () => {
  const { agendaRows }=await import("../server/calendar.mjs");
  const timed=(a,b)=>({summary:"重复标题",start_time:{datetime:a},end_time:{datetime:b}});
  const day=(a,b)=>({summary:"跨日全天",start_time:{date:a},end_time:{date:b}});
  const events=[
    timed("2026-10-13T23:00:00+08:00","2026-10-14T01:00:00+08:00"),
    timed("2026-10-13T23:00:00+08:00","2026-10-14T00:00:00+08:00"),
    timed("2026-10-15T00:00:00+08:00","2026-10-15T01:00:00+08:00"),
    timed("2026-10-14T09:00:00+08:00","2026-10-14T10:00:00+08:00"),
    timed("2026-10-14T09:00:00+08:00","2026-10-14T10:00:00+08:00"),
    day("2026-10-13","2026-10-14"),day("2026-10-13","2026-10-13"),
  ];
  const rows=agendaRows({ok:true,identity:"user",data:events},calendarDay(start));
  assert.deepEqual(rows.map(r=>r.time),["全天","2026-10-13 23:00–01:00","09:00–10:00","09:00–10:00"]);
});

test("无事件为正常空列表；截断、结构缺失、错误身份或无效时间不冒充空日程", async () => {
  const { agendaRows }=await import("../server/calendar.mjs");
  const empty={ok:true,identity:"user",data:[]};
  assert.deepEqual(agendaRows(empty,calendarDay(start)),[]);
  for(const bad of [null,{...empty,identity:"bot"},{...empty,data:{}},{...empty,truncated:true},{...empty,meta:{count:2}},{...empty,data:[{}]},{...empty,data:[{start_time:{date:"2026-02-30"},end_time:{date:"2026-03-01"}}]},{...empty,data:[{start_time:{date:"2026-10-14"},end_time:{date:"2026-10-13"}}]}])assert.throws(()=>agendaRows(bad,calendarDay(start)),{status:502});
});

test("隔离HTTP返回约定三字段，缓存与CLI不可用错误不影响首页其他接口", async t => {
  const { createServer }=await import("node:http");
  const { mkdtempSync,rmSync }=await import("node:fs");
  const { default:path }=await import("node:path");
  const { openDb }=await import("../server/db.mjs");
  const { pageRoutes: routes }=await import("../server/app-routes.mjs");
  const { match,json }=await import("../server/http.mjs");
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,"calendar-")),db=openDb(dir);
  let now=start,calls=0,broken=false;
  const handlers=routes(db,undefined,{now:()=>now,readAgenda:async()=>{calls++;if(broken)throw Object.assign(new Error("未找到 lark-cli"),{status:503});return [{time:"全天",title:"测试",place:""}];}});
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,"http://localhost"),found=match(handlers,req.method,url.pathname);
    if(!found)return json(res,404,{error:"接口不存在"});
    await found.handler(req,res,{params:found.params,url});
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});
  const get=endpoint=>fetch(`http://127.0.0.1:${server.address().port}${endpoint}`);
  const response=await get("/api/calendar/today");assert.equal(response.status,200);
  assert.deepEqual(await response.json(),[{time:"全天",title:"测试",place:""}]);
  await get("/api/calendar/today");assert.equal(calls,1);
  now+=300_000;broken=true;const unavailable=await get("/api/calendar/today");assert.equal(unavailable.status,503);assert.deepEqual(await unavailable.json(),{error:"未找到 lark-cli"});
  assert.equal((await get("/api/settings")).status,200);
  broken=false;assert.equal((await get("/api/calendar/today")).status,200);assert.equal(calls,3);
});
