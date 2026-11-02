import assert from 'node:assert/strict';
import {openDb} from '../../server/db.mjs';
import {createBriefService} from '../../server/briefs.mjs';
import {BRIEF_DESTINATION as WIKI} from '../../server/brief-destination.mjs';
import {briefSections,replaceBriefSection,applyBriefEdit,locateBriefEdit} from '../../server/brief-sync-plan.mjs';

export function fixture(dir){
  const db=openDb(dir),documents=new Map(),state={creates:0,updates:0,calls:[],failAfterUpdate:false,parent:WIKI.token,user:'ou_isolated'};
  const stamp=doc=>{let n=0;return doc.content.replace(/\s+id="[^"]*"/g,'').replace(/<(title|h[1-6]|p|li|table)(?=[\s>])/g,(_,tag)=>`<${tag} id="${tag==='title'?doc.id:`b${state.stableIds?'stable':doc.revision}_${++n}`}"`);};
  const run=async(command,args,options)=>{
    assert.equal(command,'lark-cli');assert.deepEqual(args.slice(0,2),['--profile','cli_a965c429ef785bd3']);assert.deepEqual(args.slice(-2),['--as','user']);
    const arg=k=>args[args.indexOf(k)+1],result=(data,more={})=>({stdout:JSON.stringify({ok:true,identity:'user',...more,data})});
    const dry=api=>result({context:{app_id:'cli_a965c429ef785bd3',user_open_id:state.user},api:[api]},{dry_run:true});
    state.calls.push({args,input:options.input});
    if(args.includes('whoami'))return{stdout:JSON.stringify({profile:'cli_a965c429ef785bd3',appId:'cli_a965c429ef785bd3',identity:'user',available:true,tokenStatus:'ready',onBehalfOf:{openId:state.user}})};
    if(args.includes('+node-get')){const id=arg('--node-token'),doc=documents.get(id);return result(doc?{node_token:'Wiki'+id,obj_token:id,obj_type:'docx',node_type:'origin',title:doc.title,space_id:WIKI.spaceId,parent_node_token:state.parent}:{...WIKI,node_token:WIKI.token,obj_token:'ParentDoc',obj_type:'docx',node_type:'origin',space_id:WIKI.spaceId});}
    if(args.includes('+create')){
      if(args.includes('--dry-run'))return dry({method:'POST',url:'/open-apis/docs_ai/v1/documents',body:{parent_token:WIKI.token,format:'xml',content:options.input}});
      const id=`Doc${++state.creates}`,doc={id,title:options.input.match(/<title>(.*?)<\/title>/s)[1],content:options.input,revision:1};documents.set(id,doc);
      return result({document:{document_id:id,url:`https://vm94j8bzy7.feishu.cn/docx/${id}`,revision_id:1}});
    }
    if(args.includes('+fetch')){const doc=documents.get(arg('--doc'));if(!doc||state.noAccess)throw Error('No access');return result({document:{document_id:doc.id,content:stamp(doc),revision_id:doc.revision}});}
    if(args.includes('+update-title')){
      const id=arg('--token'),title=arg('--title');
      if(args.includes('--dry-run'))return dry({method:'PATCH',url:`/open-apis/drive/v1/files/${id}`,params:{type:'docx'},body:{new_title:title}});
      const doc=documents.get(id),escaped=title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');doc.content=replaceBriefSection(doc.content,'title',`<title>${escaped}</title>`);doc.title=title;doc.revision++;state.updates++;
      return result({updated:true,file_token:id,type:'docx',title});
    }
    if(args.includes('+update')){
      const id=arg('--doc'),doc=documents.get(id),single=args.includes('--block-id'),start=arg(single?'--block-id':'--start-block-id'),end=single?start:arg('--end-block-id');
      const body={command:arg('--command'),...(arg('--command')==='block_delete'?{}:{format:'xml',content:options.input}),revision_id:Number(arg('--revision-id')),...(single?{block_id:start}:{start_block_id:start,end_block_id:end})};
      if(args.includes('--dry-run')){state.onUpdateDry?.();return dry({method:'PUT',url:`/open-apis/docs_ai/v1/documents/${id}`,body});}
      assert.equal(body.revision_id,doc.revision);const remote=stamp(doc);
      const located=locateBriefEdit(remote,{start,end});
      assert.deepEqual(located.startPath.slice(0,-1),located.endPath.slice(0,-1),'docs_ai requires XML siblings, even when native docx block parents match');
      if(state.failBeforeUpdate)throw Error('Unknown response before applying');
      doc.content=applyBriefEdit(remote,{start,end,content:options.input,command:body.command});doc.revision++;doc.title=briefSections(doc.content)[0].label;state.updates++;
      state.afterUpdate?.();
      if(state.failAfterUpdate===true||state.failAfterUpdate===state.updates)throw Error('Lost response after apply');
      return result({result:'success'});
    }
    throw Error('Unexpected mock command '+args.join(' '));
  };
  const service=createBriefService(db,{exports:{run}}),month='2026-10';
  const save=patch=>service.autosave(month,{baseVersion:service.read(month).version,requestId:crypto.randomUUID(),patch});
  const preview=body=>service.exportPreview(month,body||{}),confirm=p=>service.exportConfirm(month,{previewId:p.previewId,confirm:true});
  const sync=async body=>confirm(await preview(body));
  const cloud=(key,transform)=>{const doc=documents.get('Doc1'),section=briefSections(doc.content).find(s=>s.key===key);doc.content=replaceBriefSection(doc.content,key,transform(section.xml));doc.revision++;};
  return{db,state,documents,run,service,month,save,preview,confirm,sync,cloud};
}
