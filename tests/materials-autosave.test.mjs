import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { openDb } from '../server/db.mjs';
import { createReferenceService, referenceDir } from '../server/references.mjs';
import { routes } from '../server/routes/references.mjs';
import { match } from '../server/http.mjs';
import { putRecord } from '../server/local-records.mjs';
const image=Buffer.from([255,216,255,0]);
const item=(id,extra={})=>({id,x:8,y:8,w:180,title:id,tags:['未分类'],imageDataUrl:'image',...extra});
function setup(t, options={}) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir=fs.mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR,'auto-')), db=openDb(dir);
  t.after(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true});});
  return {db,dir,service:createReferenceService(db,{compress:async()=>image,...options})};
}
const save=(s,id,value)=>s.save({requestId:id,baseRevision:s.state().revision,value});

test('自动粘贴、移动持久化，删除后图片文件和读取权限同时消失',async t=>{
  const {service:s,db}=setup(t);
  const v=await save(s,'add',{zones:[],items:[item('one')]});
  const file=path.join(referenceDir(db),path.basename(v.value.items[0].src));
  assert.ok(fs.existsSync(file));
  const moved={...v.value,items:v.value.items.map(i=>({...i,x:88,y:160}))};
  await save(s,'move',moved);
  assert.equal(createReferenceService(db).read().items[0].x,88);
  await save(s,'delete',{zones:[],items:[]});
  assert.equal(fs.existsSync(file),false); assert.throws(()=>s.image(path.basename(file)),e=>e.status===404);
});

test('重复请求只压缩写入一次，服务重建后回执仍可核对；同ID不同内容拒绝',async t=>{
  let calls=0; const {db,service:s}=setup(t,{compress:async()=>{calls++;return image;}});
  const body={requestId:'same',baseRevision:s.state().revision,value:{zones:[],items:[item('one')]}};
  const [a,b]=await Promise.all([s.save(body),s.save(body)]);
  assert.deepEqual(a,b); assert.equal(calls,1);
  const restored=createReferenceService(db);
  assert.deepEqual(await restored.save(body),a); assert.deepEqual(restored.receipt('same'),a);
  await assert.rejects(s.save({...body,value:{zones:[],items:[]}}),e=>e.status===409);
});

test('压缩期间其他保存成功，旧请求不能覆盖；旧页面版本也被拒绝',async t=>{
  let release, entered; const ready=new Promise(r=>entered=r), wait=new Promise(r=>release=r);
  const {service:s}=setup(t,{compress:async()=>{entered();await wait;return image;}});
  const revision=s.state().revision;
  const slow=s.save({requestId:'slow',baseRevision:revision,value:{zones:[],items:[item('slow')]}});
  await ready; assert.equal(s.operation('slow').status,'pending');
  await save(s,'fast',{zones:[{name:'新组',x:0,y:0,w:100,h:100}],items:[]});
  release(); await assert.rejects(slow,e=>e.status===409);
  assert.equal(s.read().zones[0].name,'新组'); assert.equal(s.read().items.length,0);
  await assert.rejects(s.save({requestId:'stale',baseRevision:revision,value:{zones:[],items:[]}}),e=>e.status===409);
});

test('共享图片只在最后引用删除时清理，失败时已删文件和数据库都恢复',async t=>{
  const {db,service:s}=setup(t);
  await save(s,'two',{zones:[],items:[item('one'),item('two')]});
  const original=s.read(), files=original.items.map(i=>path.join(referenceDir(db),path.basename(i.src)));
  // 两项共享同一图片的旧记录兼容。
  putRecord(db,'refs','canvas',{...original,items:original.items.map(i=>({...i,src:original.items[0].src}))});
  await save(s,'remove-shared',{zones:[],items:s.read().items.slice(1)});
  assert.ok(fs.existsSync(files[0]));
  await save(s,'remove-last',{zones:[],items:[]}); assert.equal(fs.existsSync(files[0]),false);
  // 新两图删除时在第二个unlink失败，前一个必须恢复。
  await save(s,'again',{zones:[],items:[item('three'),item('four')]}); const before=s.read();
  const targets=before.items.map(i=>path.join(referenceDir(db),path.basename(i.src)));
  const unlink=fs.unlinkSync; t.mock.method(fs,'unlinkSync',p=>{if(p===targets[1])throw new Error('injected delete failure');return unlink(p);});
  await assert.rejects(save(s,'failed-delete',{zones:[],items:[]}),/injected/);
  assert.deepEqual(s.read(),before); assert.ok(targets.every(f=>fs.existsSync(f))); assert.equal(s.receipt('failed-delete'),null);
});

test('数据库提交前失败时不留下新增图片；删除缺失图允许，符号链接拒绝',async t=>{
  const {db,service:s}=setup(t);
  db.exec("CREATE TRIGGER reject_receipt BEFORE INSERT ON v3_documents WHEN NEW.kind='refs-save' BEGIN SELECT RAISE(ABORT,'reject-save'); END");
  await assert.rejects(save(s,'rejected',{zones:[],items:[item('one')]}),/reject-save/);
  assert.deepEqual(s.read().items,[]); assert.deepEqual(fs.readdirSync(referenceDir(db)),[]);
  db.exec('DROP TRIGGER reject_receipt');
  await save(s,'ok',{zones:[],items:[item('one')]});
  let file=path.join(referenceDir(db),path.basename(s.read().items[0].src));fs.unlinkSync(file);
  await save(s,'missing',{zones:[],items:[]});
  await save(s,'ok2',{zones:[],items:[item('two')]});file=path.join(referenceDir(db),path.basename(s.read().items[0].src));fs.unlinkSync(file);fs.symlinkSync('/etc/hosts',file);
  await assert.rejects(save(s,'symbol',{zones:[],items:[]}));assert.equal(s.read().items.length,1);
});

async function invoke(all, method, endpoint, body) {
  const url=new URL(endpoint,'http://localhost'),found=match(all,method,url.pathname);assert.ok(found,endpoint);
  let status,out;const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  await found.handler(req,{setHeader(){},writeHead(s){status=s;},end(v){out=v;}},{params:found.params,url});
  return {status,body:JSON.parse(out)};
}
test('设计参考按一帖多图独立导入；分组移动持久化，不触碰旧画布或源收藏',async t=>{
  const {db,dir,service:s}=setup(t); await save(s,'old',{zones:[],items:[item('past')]});
  const old=s.read(); const root=path.join(dir,'source'), version='a'.repeat(32), media=path.join(root,'collection','versions',version,'media','note1'); fs.mkdirSync(media,{recursive:true});
  fs.writeFileSync(path.join(media,'1.jpg'),image);fs.writeFileSync(path.join(media,'2.jpg'),image);
  const source={schema:1,revision:1,desk:{groups:[{id:'design',name:'设计参考'}],noteGroupMap:{note1:'design'}},notes:[{id:'note1',title:'海报设计',author:{name:'设计师'},content:'图片与排版说明',type:'normal',sourceUrl:'https://www.xiaohongshu.com/explore/note1?xsec_token=private',imageUrls:[1,2].map(n=>`/collection-media/${version}/media/note1/${n}.jpg`)}]};
  const sourceFile=path.join(root,'collection','state.json'),raw=JSON.stringify({state:source,sha256:createHash('sha256').update(JSON.stringify(source)).digest('hex')});fs.writeFileSync(sourceFile,raw);
  const all=routes(db,{digiworldDir:root,compress:async()=>image});
  const state=(await invoke(all,'GET','/api/v3/design-refs/state')).body;
  const importBody={requestId:'import',baseRevision:state.revision,ids:['note1']};
  const r=await invoke(all,'POST','/api/v3/design-refs/import',importBody);
  const replay=await invoke(all,'POST','/api/v3/design-refs/import',importBody);
  assert.deepEqual(replay,r);
  assert.equal((await invoke(all,'POST','/api/v3/design-refs/import',{...importBody,ids:['other']})).status,409);
  assert.equal(r.status,200);assert.equal(r.body.value.items.length,1);
  const post=r.body.value.items[0];assert.equal(post.gallery.length,2);assert.equal(post.post.content,'图片与排版说明');assert.equal(post.post.author,'设计师');assert.ok(!post.post.url.includes('private'));
  assert.equal((await invoke(all,'GET','/api/v3/design-refs/saves/import')).body.requestId,'import');
  const moved={...r.body.value,zones:[...r.body.value.zones,{name:'排版',x:0,y:0,w:300,h:280}],items:[{...post,tags:['排版']}]};
  assert.equal((await invoke(all,'PUT','/api/v3/design-refs',{requestId:'group',baseRevision:r.body.revision,value:moved})).status,200);
  const back=(await invoke(all,'GET','/api/v3/design-refs/state')).body;assert.equal(back.value.items[0].tags[0],'排版');
  assert.deepEqual(s.read(),old);assert.equal(fs.readFileSync(sourceFile,'utf8'),raw);
  await invoke(all,'PUT','/api/v3/design-refs',{requestId:'remove',baseRevision:back.revision,value:{zones:back.value.zones,items:[]}});
  assert.deepEqual(fs.readdirSync(path.join(dir,'design-refs')),[]);assert.ok(fs.existsSync(path.join(media,'1.jpg')));
});

test('连续超过100次直接保存不耗尽旧预览额度', async t=>{
  const {service:s}=setup(t);
  for(let n=0;n<110;n++) await save(s,`move-${n}`,{zones:[{name:'位置',x:n,y:0,w:100,h:100}],items:[]});
  assert.equal(s.read().zones[0].x,109);
});
