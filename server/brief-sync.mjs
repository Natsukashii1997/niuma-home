import {randomUUID} from 'node:crypto';
import {createFeishuClient,createFeishuExporter,exportSourceIdentity,validateExportDocument} from './feishu-export.mjs';
import {fingerprint,getRecord,listRecords,putRecord} from './local-records.mjs';
import {failure} from './v3-common.mjs';
import {exactBriefXml,planBriefSync,replaceBriefSection} from './brief-sync-plan.mjs';

const LINKS='brief-feishu-link',PREVIEWS='feishu-export-preview',RECEIPTS='feishu-export';
const fail=(code,message,status=409,extra={})=>Object.assign(failure(status,message),{code,...extra});
export function createBriefSync(db,{now=Date.now,run,fixedTarget,...options}={}){
  const creator=createFeishuExporter(db,{now,run,fixedTarget,...options});
  const {cli,whoami}=createFeishuClient(run);
  const inMonth=(r,month)=>r.scope?.kind==='brief'&&r.scope.id===String(month);
  function unblocked(month){
    const receipt=listRecords(db,RECEIPTS).find(r=>inMonth(r,month)&&['started','unknown'].includes(r.status));
    if(receipt)throw fail('EXPORT_RESULT_UNKNOWN','上次同步结果还未核对，先只读核对原文档，不会重复创建',409,{receipt});
  }
  function candidate(month){
    const link=getRecord(db,LINKS,month);if(link)return link;
    const receipts=listRecords(db,RECEIPTS).filter(r=>inMonth(r,month)&&r.status==='success');
    if(!receipts.length)return null;
    if(new Set(receipts.map(r=>r.document?.id)).size!==1)throw fail('EXPORT_LINK_AMBIGUOUS','该月份曾生成多篇文档，请指定要继续更新的那篇；不会再创建');
    const receipt=receipts.sort((a,b)=>String(b.verifiedAt||b.startedAt).localeCompare(String(a.verifiedAt||a.startedAt)))[0];
    const prior=getRecord(db,PREVIEWS,receipt.previewId);
    if(!prior?.document?.xml||!receipt.document?.id)throw fail('EXPORT_BASE_MISSING','原文档的同步基线缺失，无法安全更新；不会另建文档');
    return {document:receipt.document,target:receipt.target,actor:prior.actor,sourceIdentity:receipt.sourceIdentity,localDocument:prior.document,currentOperationId:receipt.operationId};
  }
  function linked(month){try{const l=candidate(month);return l?{...l.document,title:l.localDocument.title}:null;}catch(e){return{error:e.message};}}
  async function remote(link){
    if(link.target?.token!==fixedTarget.token||link.target?.spaceId!==fixedTarget.spaceId||link.target?.url!==fixedTarget.url||!/^[a-zA-Z0-9_]+$/.test(link.document.id))throw fail('EXPORT_TARGET_CHANGED','原文档绑定目录不一致，请核对原链接；不会创建替代文档');
    const fetched=await cli(['docs','+fetch','--doc',link.document.id,'--doc-format','xml','--detail','full','--scope','full']);
    const doc=fetched.data.document;
    if(doc?.document_id!==link.document.id||!Number.isSafeInteger(doc.revision_id)||typeof doc.content!=='string'||fetched.data.warnings?.length)throw fail('EXPORT_READBACK_INCOMPLETE','原文档未完整读取，暂时无法同步',502);
    const node=(await cli(['wiki','+node-get','--node-token',link.document.id,'--space-id',fixedTarget.spaceId])).data;
    if(node.obj_token!==link.document.id||node.obj_type!=='docx'||node.node_type!=='origin'||node.space_id!==fixedTarget.spaceId||node.parent_node_token!==fixedTarget.token)throw fail('EXPORT_TARGET_CHANGED','原文档位置或权限已变化，请检查原文档；不会另建');
    return doc;
  }
  const args=(p,edit,revision)=>edit.key==='title'?['drive','+update-title','--token',p.link.document.id,'--type','docx','--title',p.document.title]:['docs','+update','--doc',p.link.document.id,'--command','block_replace',...(edit.start===edit.end?['--block-id',edit.start]:['--start-block-id',edit.start,'--end-block-id',edit.end]),'--doc-format','xml','--content','-','--revision-id',String(revision)];
  async function dry(p,edit,revision){
    const result=await cli([...args(p,edit,revision),'--dry-run'],edit.content),ctx=result.data.context;
    const writes=result.data.api?.filter(a=>!['GET','HEAD'].includes(a.method)),body=writes?.[0]?.body;
    if(edit.key==='title'){
      if(!result.dry_run||ctx?.app_id!=='cli_aacf58ab61b85beb'||ctx.user_open_id!==p.actor||writes?.length!==1||writes[0].method!=='PATCH'||writes[0].url!==`/open-apis/drive/v1/files/${p.link.document.id}`||writes[0].params?.type!=='docx'||body?.new_title!==p.document.title)throw fail('EXPORT_PROTOCOL_CHANGED','飞书改名预演与原文档不一致，未执行',503);
      return;
    }
    if(!result.dry_run||ctx?.app_id!=='cli_aacf58ab61b85beb'||ctx.user_open_id!==p.actor||writes?.length!==1||writes[0].method!=='PUT'||writes[0].url!==`/open-apis/docs_ai/v1/documents/${p.link.document.id}`||body?.command!=='block_replace'||body.content!==edit.content||body.format!=='xml'||body.revision_id!==revision||(edit.start===edit.end?body.block_id!==edit.start:body.start_block_id!==edit.start||body.end_block_id!==edit.end))throw fail('EXPORT_PROTOCOL_CHANGED','飞书更新预演与目标文档或修改范围不一致，未执行',503);
  }
  async function source(p,load){
    const document=await load(p.scope.context);validateExportDocument(document);
    if(exportSourceIdentity(db)!==p.sourceIdentity||fingerprint(document)!==p.fingerprint)throw fail('EXPORT_SOURCE_CHANGED','工作台内容已变化，请重新点击同步');
    if(fingerprint(candidate(p.scope.id))!==p.linkFingerprint)throw fail('EXPORT_SOURCE_CHANGED','这份 Brief 刚刚已同步，请重新点击核对最新状态');
  }
  function finish(p,receipt,doc){
    if(exactBriefXml(doc.content)!==exactBriefXml(p.expected))throw Error('Updated document differs');
    db.exec('BEGIN IMMEDIATE');
    try{
      const done={...receipt,status:'success',verifiedAt:new Date(now()).toISOString(),readbackFingerprint:fingerprint(exactBriefXml(doc.content)),revision:doc.revision_id};
      putRecord(db,LINKS,p.scope.id,{document:p.link.document,target:p.link.target,actor:p.actor,sourceIdentity:p.sourceIdentity,localDocument:p.document,currentOperationId:p.operationId,remoteFingerprint:done.readbackFingerprint},now());
      const saved=putRecord(db,RECEIPTS,p.operationId,done,now());if(fingerprint(saved)!==fingerprint(done))throw Error('Receipt mismatch');
      db.exec('COMMIT');return done;
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  function unknown(receipt){
    const latest=getRecord(db,RECEIPTS,receipt.operationId);if(latest?.status==='success')return latest;
    const next={...receipt,status:'unknown',checkedAt:new Date(now()).toISOString()};putRecord(db,RECEIPTS,next.operationId,next,now());
    throw fail('EXPORT_RESULT_UNKNOWN','更新或回读未能确认，已保留原文档和操作记录。只读核对前不会再次写入或新建',502,{receipt:next});
  }
  const view=p=>({previewId:p.previewId,expiresAt:p.expiresAt,mode:p.edits.length?'update':'unchanged',target:p.link.target,title:p.document.title,document:p.link.document,markdown:p.document.markdown,sections:p.document.sections,changedSections:p.edits.map(e=>e.label)});
  return {
    linked,
    async preview(kind,month,context,body,load){
      if(kind!=='brief'||!body||Object.keys(body).some(k=>!['targetUrl','resolveConflict'].includes(k))||(body.targetUrl!==undefined&&body.targetUrl!==fixedTarget.url))throw fail('EXPORT_TARGET_REQUIRED','Brief 只能同步到默认知识库中的原文档',400);
      unblocked(month);const link=candidate(month);
      if(!link){if(body.resolveConflict)throw fail('EXPORT_PREVIEW_EXPIRED','冲突记录已失效');return creator.preview(kind,month,context,body,load);}
      const actor=await whoami(),config=exportSourceIdentity(db);
      if(actor!==link.actor||config!==link.sourceIdentity)throw fail('EXPORT_IDENTITY_CHANGED','原文档的用户身份或来源配置已变化，不能替换绑定或另建文档');
      const document=await load(context);validateExportDocument(document);
      const doc=await remote(link),remoteFingerprint=fingerprint(exactBriefXml(doc.content));
      let force=[];
      if(body.resolveConflict){
        const review=getRecord(db,PREVIEWS,body.resolveConflict);
        if(review?.mode!=='conflict'||!inMonth(review,month)||Date.parse(review.expiresAt)<=now()||review.actor!==actor||review.fingerprint!==fingerprint(document)||review.remoteFingerprint!==remoteFingerprint||review.linkFingerprint!==fingerprint(link))throw fail('EXPORT_SOURCE_CHANGED','工作台或飞书内容已变化，请重新查看差异');
        force=review.conflicts.map(c=>c.key);
      }
      let plan;try{plan=planBriefSync(link.localDocument.xml,document.xml,doc.content,force);}catch(e){throw fail('EXPORT_STRUCTURE_CHANGED',e.message);}
      const p={scope:{kind,id:String(month),context},previewId:randomUUID(),expiresAt:new Date(now()+600000).toISOString(),mode:'update',link,linkFingerprint:fingerprint(link),document,fingerprint:fingerprint(document),sourceIdentity:config,actor,remoteFingerprint,remoteRevision:doc.revision_id,remoteBefore:doc.content,...plan};
      if(plan.conflicts.length){p.mode='conflict';putRecord(db,PREVIEWS,p.previewId,p,now());throw fail('EXPORT_REMOTE_CONFLICT','工作台和飞书修改了相同章节，请核对差异后选择',409,{conflict:{id:p.previewId,document:link.document,sections:plan.conflicts}});}
      p.operationId=fingerprint(['brief-sync',month,link.document.id,p.fingerprint,remoteFingerprint,link.currentOperationId]);
      for(const edit of plan.edits)await dry(p,edit,doc.revision_id);
      await source(p,load);putRecord(db,PREVIEWS,p.previewId,p,now());return view(p);
    },
    async confirm(kind,month,body,load){
      if(!body||typeof body.previewId!=='string'||body.confirm!==true||Object.keys(body).some(k=>!['previewId','confirm'].includes(k)))throw fail('EXPORT_CONFIRM_REQUIRED','同步参数不完整，请重新点击同步',400);
      const p=getRecord(db,PREVIEWS,body?.previewId);
      if(!p||!inMonth(p,month)||body.confirm!==true||Object.keys(body).some(k=>!['previewId','confirm'].includes(k)))throw fail('EXPORT_PREVIEW_EXPIRED','同步预检失效，请重新点击');
      if(p.mode!=='update'){
        if(p.mode==='conflict')throw fail('EXPORT_REMOTE_CONFLICT','请先选择冲突章节如何处理');
        const link=candidate(month);
        if(link&&(link.currentOperationId!==p.operationId||getRecord(db,RECEIPTS,p.operationId)?.status!=='success'))throw fail('EXPORT_SOURCE_CHANGED','该月份已有原文档，请重新点击同步，不会创建重复文档');
        const receipt=await creator.confirm(kind,month,body,load);
        if(!getRecord(db,LINKS,month))putRecord(db,LINKS,month,candidate(month),now());return receipt;
      }
      const old=getRecord(db,RECEIPTS,p.operationId);
      if(old?.status==='success'){
        if(candidate(month)?.currentOperationId!==old.operationId||fingerprint(await load(p.scope.context))!==p.fingerprint||exactBriefXml((await remote(p.link)).content)!==exactBriefXml(p.expected))throw fail('EXPORT_SOURCE_CHANGED','这是旧的同步记录，请重新同步当前内容');
        return old;
      }
      unblocked(month);if(Date.parse(p.expiresAt)<=now())throw fail('EXPORT_PREVIEW_EXPIRED','预检已过期，请重新同步');
      await source(p,load);if(await whoami()!==p.actor)throw fail('EXPORT_IDENTITY_CHANGED','飞书用户已变化，请重新同步');
      let current=await remote(p.link);
      if(current.revision_id!==p.remoteRevision||fingerprint(exactBriefXml(current.content))!==p.remoteFingerprint)throw fail('EXPORT_REMOTE_CHANGED','飞书文档刚刚有新修改，请重新同步并核对');
      for(const edit of p.edits)await dry(p,edit,current.revision_id);
      await source(p,load);
      let receipt;
      db.exec('BEGIN IMMEDIATE');try{
        unblocked(month);if(fingerprint(candidate(month))!==p.linkFingerprint)throw fail('EXPORT_SOURCE_CHANGED','已有更新，请重新同步');
        receipt=putRecord(db,RECEIPTS,p.operationId,{operationId:p.operationId,previewId:p.previewId,scope:p.scope,status:'started',mode:p.edits.length?'update':'unchanged',document:p.link.document,target:p.link.target,title:p.document.title,sourceIdentity:p.sourceIdentity,fingerprint:p.fingerprint,startedAt:new Date(now()).toISOString()},now());db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      let attempted=false;
      try{
        let expected=current.content;
        for(const original of p.edits){
          const fresh=await remote(p.link);
          if(exactBriefXml(fresh.content)!==exactBriefXml(expected))throw Error('Concurrent remote change');
          const edit=planBriefSync(p.link.localDocument.xml,p.document.xml,fresh.content,p.edits.map(e=>e.key)).edits.find(e=>e.key===original.key);
          if(!edit)continue;
          await dry(p,edit,fresh.revision_id);
          // docs_ai revision_id is not an atomic compare-and-swap. Re-read
          // immediately before the write and preserve the original snapshot.
          const head=await remote(p.link);
          if(head.revision_id!==fresh.revision_id||exactBriefXml(head.content)!==exactBriefXml(fresh.content))throw Error('Concurrent remote change before write');
          expected=replaceBriefSection(fresh.content,edit.key,edit.content);
          attempted=true;
          const result=await cli(args(p,edit,fresh.revision_id),edit.content);
          if((edit.key==='title'?result.data.updated!==true||result.data.file_token!==p.link.document.id:result.data.result!=='success')||result.data.warnings?.length)throw Error('Partial update');
          current=await remote(p.link);if(exactBriefXml(current.content)!==exactBriefXml(expected))throw Error('Step readback differs');
        }
        return finish(p,receipt,current);
      }catch{
        if(!attempted){putRecord(db,RECEIPTS,p.operationId,{...receipt,status:'aborted',checkedAt:new Date(now()).toISOString()},now());throw fail('EXPORT_REMOTE_CHANGED','写入前核对发现变化或读取失败，尚未修改飞书，请重新点击同步');}
        return unknown(receipt);
      }
    },
    status(kind,month,id){return creator.status(kind,month,id);},
    async reconcile(kind,month,id){
      const receipt=getRecord(db,RECEIPTS,id);if(!receipt||!inMonth(receipt,month))throw fail('EXPORT_RECEIPT_NOT_FOUND','没有这条同步记录',404);
      if(!['update','unchanged'].includes(receipt.mode))return creator.reconcile(kind,month,id);
      if(receipt.status==='success')return receipt;
      const p=getRecord(db,PREVIEWS,receipt.previewId);if(!p||await whoami()!==p.actor)throw fail('EXPORT_IDENTITY_CHANGED','无法确认原操作身份，请检查原文档');
      try{return finish(p,receipt,await remote(p.link));}catch{return unknown(receipt);}
    },
  };
}
