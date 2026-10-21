import {randomUUID} from 'node:crypto';
import {createFeishuClient,createFeishuExporter,exportSourceIdentity,validateExportDocument} from './feishu-export.mjs';
import {fingerprint,getRecord,listRecords,putRecord} from './local-records.mjs';
import {failure} from './v3-common.mjs';
import {exactBriefXml,planBriefSync,applyBriefEdit,refreshBriefEdit,captureBriefAnchors} from './brief-sync-plan.mjs';

const LINKS='brief-feishu-link',PREVIEWS='feishu-export-preview',RECEIPTS='feishu-export';
const fail=(code,message,status=409,extra={})=>Object.assign(failure(status,message),{code,...extra});
export function createBriefSync(db,{now=Date.now,run,fixedTarget,...options}={}){
  const creator=createFeishuExporter(db,{now,run,fixedTarget,...options});
  const {cli,whoami}=createFeishuClient(run),active=new Set();
  const pending=month=>listRecords(db,RECEIPTS).find(r=>inMonth(r,month)&&['started','unknown','resumable'].includes(r.status));
  const inMonth=(r,month)=>r.scope?.kind==='brief'&&r.scope.id===String(month);
  function unblocked(month){
    const receipt=pending(month);
    if(receipt)throw fail('EXPORT_RESULT_UNKNOWN','上次同步结果还未核对，先只读核对原文档，不会重复创建',409,{receipt:publicReceipt(receipt)});
  }
  function candidate(month){
    const link=getRecord(db,LINKS,month);if(link)return link;
    const receipts=listRecords(db,RECEIPTS).filter(r=>inMonth(r,month)&&r.status==='success');
    if(!receipts.length)return null;
    if(new Set(receipts.map(r=>r.document?.id)).size!==1)throw fail('EXPORT_LINK_AMBIGUOUS','该月份曾生成多篇文档，请指定要继续更新的那篇；不会再创建');
    const receipt=receipts.sort((a,b)=>String(b.verifiedAt||b.startedAt).localeCompare(String(a.verifiedAt||a.startedAt)))[0];
    const prior=getRecord(db,PREVIEWS,receipt.previewId);
    if(!prior?.document?.xml||!receipt.document?.id)throw fail('EXPORT_BASE_MISSING','原文档的同步基线缺失，无法安全更新；不会另建文档');
    return {document:receipt.document,target:receipt.target,actor:prior.actor,sourceIdentity:receipt.sourceIdentity,localDocument:prior.document,currentOperationId:receipt.operationId,syncedAt:receipt.verifiedAt};
  }
  function linked(month,document){try{
    const l=candidate(month),unfinished=pending(month);
    if(!l)return unfinished?{pending:publicReceipt(unfinished)}:null;
    return{...l.document,title:l.localDocument.title,syncedAt:l.syncedAt||getRecord(db,RECEIPTS,l.currentOperationId)?.verifiedAt,pending:unfinished?publicReceipt(unfinished):null,
      synced:document?exactBriefXml(document.xml)===exactBriefXml(l.localDocument.xml):undefined};
  }catch(e){return{error:e.message};}}
  const publicReceipt=r=>r?Object.fromEntries(Object.entries(r).filter(([k])=>!['checkpoint','attempt','steps'].includes(k))):r;
  async function remote(link){
    if(link.target?.token!==fixedTarget.token||link.target?.spaceId!==fixedTarget.spaceId||link.target?.url!==fixedTarget.url||!/^[a-zA-Z0-9_]+$/.test(link.document.id))throw fail('EXPORT_TARGET_CHANGED','原文档绑定目录不一致，请核对原链接；不会创建替代文档');
    const fetched=await cli(['docs','+fetch','--doc',link.document.id,'--doc-format','xml','--detail','full','--scope','full']);
    const doc=fetched.data.document;
    if(doc?.document_id!==link.document.id||!Number.isSafeInteger(doc.revision_id)||typeof doc.content!=='string'||fetched.data.warnings?.length)throw fail('EXPORT_READBACK_INCOMPLETE','原文档未完整读取，暂时无法同步',502);
    const node=(await cli(['wiki','+node-get','--node-token',link.document.id,'--space-id',fixedTarget.spaceId])).data;
    if(node.obj_token!==link.document.id||node.obj_type!=='docx'||node.node_type!=='origin'||node.space_id!==fixedTarget.spaceId||node.parent_node_token!==fixedTarget.token)throw fail('EXPORT_TARGET_CHANGED','原文档位置或权限已变化，请检查原文档；不会另建');
    return doc;
  }
  const args=(p,edit,revision)=>edit.key==='title'?['drive','+update-title','--token',p.link.document.id,'--type','docx','--title',p.document.title]:['docs','+update','--doc',p.link.document.id,'--command',edit.command||'block_replace',...(edit.start===edit.end?['--block-id',edit.start]:['--start-block-id',edit.start,'--end-block-id',edit.end]),...(edit.command==='block_delete'?[]:['--doc-format','xml','--content','-']),'--revision-id',String(revision)];
  async function dry(p,edit,revision){
    const result=await cli([...args(p,edit,revision),'--dry-run'],edit.content),ctx=result.data.context;
    const writes=result.data.api?.filter(a=>!['GET','HEAD'].includes(a.method)),body=writes?.[0]?.body;
    if(edit.key==='title'){
      if(!result.dry_run||ctx?.app_id!=='cli_aacf58ab61b85beb'||ctx.user_open_id!==p.actor||writes?.length!==1||writes[0].method!=='PATCH'||writes[0].url!==`/open-apis/drive/v1/files/${p.link.document.id}`||writes[0].params?.type!=='docx'||body?.new_title!==p.document.title)throw fail('EXPORT_PROTOCOL_CHANGED','飞书改名预演与原文档不一致，未执行',503);
      return;
    }
    if(!result.dry_run||ctx?.app_id!=='cli_aacf58ab61b85beb'||ctx.user_open_id!==p.actor||writes?.length!==1||writes[0].method!=='PUT'||writes[0].url!==`/open-apis/docs_ai/v1/documents/${p.link.document.id}`||body?.command!==(edit.command||'block_replace')||(edit.command!=='block_delete'&&body.content!==edit.content)||(edit.command!=='block_delete'&&body.format!=='xml')||body.revision_id!==revision||(edit.start===edit.end?body.block_id!==edit.start:body.start_block_id!==edit.start||body.end_block_id!==edit.end))throw fail('EXPORT_PROTOCOL_CHANGED','飞书更新预演与目标文档或修改范围不一致，未执行',503);
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
      putRecord(db,LINKS,p.scope.id,{document:p.link.document,target:p.link.target,actor:p.actor,sourceIdentity:p.sourceIdentity,localDocument:p.document,currentOperationId:p.operationId,remoteFingerprint:done.readbackFingerprint,syncedAt:done.verifiedAt,remoteDocument:doc.content,remoteMaterials:captureBriefAnchors(doc.content,p.resultMaterials||p.document.materials||[]),remoteRows:p.resultRows},now());
      const saved=putRecord(db,RECEIPTS,p.operationId,done,now());if(fingerprint(saved)!==fingerprint(done))throw Error('Receipt mismatch');
      db.exec('COMMIT');return publicReceipt(done);
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  function unknown(receipt){
    const latest=getRecord(db,RECEIPTS,receipt.operationId);if(latest?.status==='success')return latest;
    const next={...latest,...receipt,status:'unknown',checkedAt:new Date(now()).toISOString()};putRecord(db,RECEIPTS,next.operationId,next,now());
    throw fail('EXPORT_RESULT_UNKNOWN','更新或回读未能确认，已保留原文档和操作记录。只读核对前不会再次写入或新建',502,{receipt:publicReceipt(next)});
  }
  const view=p=>({operationId:p.operationId,previewId:p.previewId,expiresAt:p.expiresAt,mode:p.edits.length?'update':'unchanged',target:p.link.target,title:p.document.title,document:p.link.document,markdown:p.document.markdown,sections:p.document.sections,changedSections:p.edits.map(e=>e.label)});
  return {
    linked,
    async preview(kind,month,context,body,load){
      if(kind!=='brief'||!body||Object.keys(body).some(k=>!['targetUrl','resolveConflict','resolutions'].includes(k))||(body.targetUrl!==undefined&&body.targetUrl!==fixedTarget.url))throw fail('EXPORT_TARGET_REQUIRED','Brief 只能同步到默认知识库中的原文档',400);
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
        if(body.resolutions){
          if(typeof body.resolutions!=='object'||Array.isArray(body.resolutions)||Object.keys(body.resolutions).length!==review.conflicts.length||review.conflicts.some(c=>!['local','remote'].includes(body.resolutions[c.key])))throw fail('EXPORT_CONFLICT_CHOICE_REQUIRED','请为每一项差异选择采用哪份内容',400);
          force=body.resolutions;
        }else force=review.conflicts.map(c=>c.key);
      }
      let plan;try{plan=planBriefSync(link.localDocument.xml,document.xml,doc.content,force,{baseMaterials:link.localDocument.materials,materials:document.materials,remoteBase:link.remoteDocument,remoteMaterials:link.remoteMaterials,remoteRows:link.remoteRows});}catch(e){throw fail('EXPORT_STRUCTURE_CHANGED',e.message);}
      const p={scope:{kind,id:String(month),context},previewId:randomUUID(),expiresAt:new Date(now()+600000).toISOString(),mode:'update',link,linkFingerprint:fingerprint(link),document,fingerprint:fingerprint(document),sourceIdentity:config,actor,remoteFingerprint,remoteRevision:doc.revision_id,remoteBefore:doc.content,...plan};
      if(plan.conflicts.length){p.mode='conflict';putRecord(db,PREVIEWS,p.previewId,p,now());throw fail('EXPORT_REMOTE_CONFLICT','以下内容两边都有修改，请逐项选择采用哪份',409,{conflict:{id:p.previewId,document:link.document,sections:plan.conflicts}});}
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
        receipt=putRecord(db,RECEIPTS,p.operationId,{operationId:p.operationId,previewId:p.previewId,scope:p.scope,status:'started',checkpoint:current.content,completed:0,steps:p.edits.map(e=>({key:e.key,label:e.label,state:'unsent'})),mode:p.edits.length?'update':'unchanged',document:p.link.document,target:p.link.target,title:p.document.title,sourceIdentity:p.sourceIdentity,fingerprint:p.fingerprint,startedAt:new Date(now()).toISOString()},now());db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      return execute(p,receipt,load);
    },
    status(kind,month,id){
      if(id==='pending')return publicReceipt(pending(month))||{status:'none'};
      const receipt=getRecord(db,RECEIPTS,id)||listRecords(db,RECEIPTS).find(r=>r.previewId===id&&inMonth(r,month));
      if(!receipt||!inMonth(receipt,month))throw fail('EXPORT_RECEIPT_NOT_FOUND','没有这条同步记录',404);
      return publicReceipt(receipt);
    },
    async resume(kind,month,id,load){
      const receipt=getRecord(db,RECEIPTS,id);
      if(!receipt||!inMonth(receipt,month))throw fail('EXPORT_RECEIPT_NOT_FOUND','没有这条同步记录',404);
      if(active.has(id))throw fail('EXPORT_SYNC_RUNNING','原同步仍在处理，请稍后核对');
      if(receipt.status!=='resumable'||receipt.attempt)throw fail('EXPORT_RESULT_UNKNOWN','请先只读核对，确认已完成步骤后再继续',409,{receipt:publicReceipt(receipt)});
      const p=getRecord(db,PREVIEWS,receipt.previewId);
      if(!p)throw fail('EXPORT_BASE_MISSING','原同步记录不完整，不能继续');
      return execute(p,receipt,load,true);
    },
    async reconcile(kind,month,id){
      let receipt=id==='pending'?pending(month):getRecord(db,RECEIPTS,id)||listRecords(db,RECEIPTS).find(r=>r.previewId===id&&inMonth(r,month));
      if(!receipt||!inMonth(receipt,month))throw fail('EXPORT_RECEIPT_NOT_FOUND','没有这条同步记录',404);
      if(active.has(receipt.operationId))return{...publicReceipt(receipt),verificationNote:'原同步仍在处理，请稍后核对'};
      if(!['update','unchanged'].includes(receipt.mode))return creator.reconcile(kind,month,receipt.operationId);
      if(receipt.status==='success'||receipt.status==='aborted')return publicReceipt(receipt);
      active.add(receipt.operationId);
      try{
        const p=getRecord(db,PREVIEWS,receipt.previewId);if(!p||await whoami()!==p.actor)throw fail('EXPORT_IDENTITY_CHANGED','无法确认原操作身份，请检查原文档');
        const doc=await remote(p.link),actual=exactBriefXml(doc.content);
        if(actual===exactBriefXml(p.expected))return finish(p,receipt,doc);
        if(receipt.attempt){
          // Matching the BEFORE state does not prove a timed-out request cannot
          // still land. Only an observed AFTER state proves this step completed.
          if(actual!==exactBriefXml(receipt.attempt.after))return unknown(receipt);
          receipt={...receipt,checkpoint:doc.content,completed:receipt.completed+1,attempt:null,steps:receipt.steps.map((step,i)=>i===receipt.completed?{...step,state:'verified'}:step)};
        }
        if(receipt.checkpoint&&receipt.steps&&actual===exactBriefXml(receipt.checkpoint)){
          receipt={...receipt,status:'resumable',checkedAt:new Date(now()).toISOString(),verificationNote:`已核对 ${receipt.completed}/${receipt.steps.length} 项，可继续尚未发送的部分`};
          putRecord(db,RECEIPTS,receipt.operationId,receipt,now());return publicReceipt(receipt);
        }
        return unknown(receipt);
      }catch(e){if(e.receipt)throw e;return unknown(receipt);}finally{active.delete(receipt.operationId);}
    },
  };
  async function execute(p,original,load,resuming=false){
    if(active.has(p.operationId))throw fail('EXPORT_SYNC_RUNNING','原同步仍在处理，请稍后核对');
    active.add(p.operationId);let receipt=original;
    const checkSource=async()=>{
      if(!resuming)return source(p,load);
      // Continue the frozen original snapshot, leaving any newer local draft
      // untouched and pending for its own subsequent sync.
      if(exportSourceIdentity(db)!==p.sourceIdentity||fingerprint(candidate(p.scope.id))!==p.linkFingerprint)throw fail('EXPORT_SOURCE_CHANGED','原绑定或配置已变化，不能继续这次同步');
    };
    try{
      await checkSource();if(await whoami()!==p.actor)throw fail('EXPORT_IDENTITY_CHANGED','飞书用户已变化，尚未继续同步');
      let current=await remote(p.link);
      if(exactBriefXml(current.content)!==exactBriefXml(receipt.checkpoint))throw Error('飞书内容在暂停期间发生变化，请核对原文档');
      receipt={...receipt,status:'started'};putRecord(db,RECEIPTS,p.operationId,receipt,now());
      for(let index=receipt.completed;index<p.edits.length;index++){
        const fresh=await remote(p.link);
        if(exactBriefXml(fresh.content)!==exactBriefXml(receipt.checkpoint))throw Error('飞书出现新的修改，已停止后续写入');
        const edit=refreshBriefEdit(fresh.content,p.edits[index]);
        await dry(p,edit,fresh.revision_id);
        const head=await remote(p.link);
        if(head.revision_id!==fresh.revision_id||exactBriefXml(head.content)!==exactBriefXml(fresh.content))throw Error('写入前飞书发生变化');
        await checkSource();
        const after=applyBriefEdit(fresh.content,edit);
        receipt={...receipt,attempt:{key:edit.key,before:fresh.content,after,sentAt:new Date(now()).toISOString()},steps:receipt.steps.map((step,i)=>i===index?{...step,state:'sent'}:step)};
        putRecord(db,RECEIPTS,p.operationId,receipt,now());
        const result=await cli(args(p,edit,fresh.revision_id),edit.content);
        if((edit.key==='title'?result.data.updated!==true||result.data.file_token!==p.link.document.id:result.data.result!=='success')||result.data.warnings?.length)throw Error('写入结果不完整');
        current=await remote(p.link);if(exactBriefXml(current.content)!==exactBriefXml(after))throw Error('写后核对未通过');
        receipt={...receipt,checkpoint:current.content,completed:index+1,attempt:null,steps:receipt.steps.map((step,i)=>i===index?{...step,state:'verified'}:step)};
        putRecord(db,RECEIPTS,p.operationId,receipt,now());
      }
      return finish(p,receipt,current);
    }catch(e){
      if(!receipt.attempt&&!receipt.completed){putRecord(db,RECEIPTS,p.operationId,{...receipt,status:'aborted'},now());throw fail('EXPORT_REMOTE_CHANGED','写入前发现变化或读取失败，尚未修改飞书，请重新点击同步');}
      return unknown(receipt);
    }finally{active.delete(p.operationId);}
  }
}
