import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { openDb, saveSetting } from "../server/db.mjs";
import { routes } from "../server/routes/workspace.mjs";
import { match, json } from "../server/http.mjs";
import { createReportReader, readReportDocument, reportDocumentUrl } from "../server/reports.mjs";
const link = "https://example.feishu.cn/docx/test";
const content = "## 周报 2026-10-14\n周正文\n## 日报 2026-10-13\n日正文";
const response = extra => ({ stdout: JSON.stringify({ ok: true, identity: "user", data: { document: { content } }, ...extra }) });

test("飞书读取固定 profile、用户身份、Markdown；参数独立传递且去掉选区锚点", async () => {
  const result = await readReportDocument(link + "?from=test#part", { run: async (command, args, options) => {
    assert.equal(command, "lark-cli");
    assert.deepEqual(args, ["--profile", "cli_a96f5f9ac63adcd4", "docs", "+fetch", "--as", "user", "--doc", link, "--doc-format", "markdown"]);
    assert.equal(options.shell, false);assert.ok(options.maxBuffer > 1_000_000);assert.equal(options.timeout, 60_000);
    return response();
  } });
  assert.equal(result, content);
  for (const value of ["", "http://example.feishu.cn/docx/test", "https://feishu.cn.evil/docx/test", "https://user@feishu.cn/docx/test", "https://feishu.cn/base/test", "https:///feishu.cn/docx/test", "https://feishu.cn:444/docx/test", link + "\\bad"]) {
    assert.throws(() => reportDocumentUrl(value), { status: 400 });
  }
});

test("登录、权限、CLI 缺失、超时及损坏输出均给出明确中文且不泄露原始错误", async () => {
  const cases = [
    [{ code: "ENOENT" }, 503, /未找到 lark-cli/],
    [{ stderr: "token expired SECRET" }, 401, /登录已过期/],
    [{ stderr: "Forbidden: permission denied SECRET" }, 403, /缺少文档访问权限/],
    [{ killed: true }, 504, /超时/],
    [{ code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" }, 502, /不完整/],
    [{ stderr: "network SECRET" }, 502, /读取失败/],
  ];
  for (const [error, status, message] of cases) {
    await assert.rejects(readReportDocument(link, { run: async () => { throw error; } }), e => {
      assert.equal(e.status, status);assert.match(e.message, message);assert.doesNotMatch(e.message, /SECRET/);return true;
    });
  }
  for (const output of ["bad", JSON.stringify({ ok:true, identity:"bot", data:{document:{content}} }), JSON.stringify({ok:true,identity:"user",data:{}})]) {
    await assert.rejects(readReportDocument(link, { run: async () => ({ stdout: output }) }), { status: 502 });
  }
  await assert.rejects(readReportDocument(link, { run: async () => response({ ok:false,error:{code:403,message:"permission denied"} }) }), {status:403});
  await assert.rejects(readReportDocument(link, { run: async () => response({ truncated:true }) }), {status:502});
});

test("内存缓存、连续强制刷新、配置切换及失败后重试", async () => {
  let source = link, calls = 0, broken = false;
  const reader = createReportReader(() => source, { readDocument: async url => {
    calls++;if (broken) throw Object.assign(new Error("无权限"),{status:403});return content + url;
  } });
  const first = await reader();assert.equal(calls,1);assert.deepEqual(await reader(),first);assert.equal(calls,1);
  await reader({refresh:true});await reader({refresh:true});assert.equal(calls,3);
  source = link + "2";await reader();assert.equal(calls,4);
  broken = true;await assert.rejects(reader({refresh:true}),{status:403});await assert.rejects(reader(),{status:403});assert.equal(calls,6);
  broken = false;await reader();assert.equal(calls,7);
  source="";await assert.rejects(reader(),{status:400});assert.equal(calls,7);
  source=link;await reader();assert.equal(calls,8);
});

test("普通请求合并；较旧并发刷新和旧链接不能覆盖新缓存", async () => {
  const pending = [];let source=link;
  const reader=createReportReader(()=>source,{readDocument:()=>new Promise(resolve=>pending.push(resolve))});
  const old=reader(), joined=reader();assert.equal(pending.length,1);
  const fresh=reader({refresh:true});assert.equal(pending.length,2);
  pending[1]("## 2026-10-14\n新");await fresh;
  pending[0]("## 2026-10-13\n旧");await old;await joined;
  assert.equal((await reader())[0].body,"新");
  const previous=reader({refresh:true});source=link+"2";const switched=reader();
  pending[3]("## 2026-10-15\n新链接");await switched;
  pending[2]("## 2026-10-14\n旧链接");await previous;
  assert.equal((await reader())[0].body,"新链接");
});

test("空文档为空列表；有正文但没有有效日期标题时明确提示", async () => {
  const reader=value=>createReportReader(()=>link,{readDocument:async()=>value});
  assert.deepEqual(await reader("")(),[]);
  await assert.rejects(reader("文档说明，无日期标题")(),{status:502});
});

test("隔离 HTTP：缺配置、列表形状与倒序、详情、404、刷新、错误不返回旧数据", async t => {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir=mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,"reports-"));const db=openDb(dir);
  let calls=0,denied=false;
  const handlers=routes(db,{readDocument:async()=>{calls++;if(denied)throw Object.assign(new Error("文档无权限"),{status:403});return content;}});
  const server=createServer(async(req,res)=>{
    const url=new URL(req.url,"http://localhost"), found=match(handlers,req.method,url.pathname);
    if(!found)return json(res,404,{error:"接口不存在"});
    await found.handler(req,res,{params:found.params,url});
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();rmSync(dir,{recursive:true,force:true});});
  const get=endpoint=>fetch(`http://127.0.0.1:${server.address().port}${endpoint}`);
  assert.equal((await get("/api/reports")).status,400);assert.equal(calls,0);
  saveSetting(db,"report_doc_url",link);
  const list=await(await get("/api/reports")).json();
  assert.deepEqual(list.map(r=>[r.kind,r.date]),[["周报","2026-10-14"],["日报","2026-10-13"]]);
  assert.deepEqual(Object.keys(list[0]).sort(),["body","date","id","kind","title"]);
  assert.deepEqual(await(await get(`/api/reports/${list[0].id}`)).json(),list[0]);assert.equal(calls,1);
  assert.equal((await get("/api/reports/missing")).status,404);
  await get("/api/reports?refresh=1");await get("/api/reports?refresh=1");assert.equal(calls,3);
  denied=true;assert.equal((await get("/api/reports?refresh=1")).status,403);
  const failed=await get("/api/reports");assert.equal(failed.status,403);assert.deepEqual(await failed.json(),{error:"文档无权限"});
});
