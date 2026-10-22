import { briefPatch } from './brief-edit.js';

// One serial writer per editor. A journal survives reloads and uncertain responses.
export function createBriefAutosave({ initial, send, read, storage, journalId='default', delay=600, makeId=()=>crypto.randomUUID() }) {
  const key=`workdesk:brief-draft:${initial.month}:${journalId}`;
  let saved=structuredClone(initial), draft=structuredClone(initial), pending=null, error=null, timer, running=null, resolving=false;
  const listeners=new Set();
  const changed=()=>Object.keys(briefPatch(saved,draft)).length>0;
  const conflict=()=>Object.assign(new Error('另一页面已更新这份 Brief，当前草稿已保留。'),{code:'BRIEF_SAVE_CONFLICT'});
  const confirmsAttempt=(actual,attempt)=>{
    const match=/^v(\d+)$/.exec(attempt?.baseVersion),base=match?Number(match[1]):NaN;
    return Number.isSafeInteger(base)&&base<Number.MAX_SAFE_INTEGER&&actual.saveRequestId===attempt.requestId&&actual.version===`v${base+1}`;
  };
  try {
    const journal=JSON.parse(storage?.getItem(key)||'null');
    if(journal?.saved?.month===initial.month && journal?.draft?.month===initial.month) {
      draft=journal.draft;
      if(journal.pending?.requestId && initial.saveRequestId===journal.pending.requestId) {
        if(confirmsAttempt(initial,journal.pending))saved=initial;
        else {saved=journal.saved;pending=journal.pending;error=conflict();}
      }
      else if(journal.saved.version===initial.version) saved=initial;
      else if(Object.keys(briefPatch(initial,draft)).length) {saved=journal.saved;error=conflict();}
      if(!error && journal.pending && initial.version===journal.pending.baseVersion) pending=journal.pending;
    }
  } catch { /* Storage is optional; confirmed server saves still work. */ }
  const state=()=>({draft,saved,error,busy:!!running,resolving,dirty:changed()});
  function journal() {
    try { if(changed()||pending)storage?.setItem(key,JSON.stringify({saved,draft,pending}));else storage?.removeItem(key); }
    catch { /* Keep the live draft; never report a failed server save as saved. */ }
  }
  function emit(){journal();for(const fn of listeners)fn(state());}
  function schedule(){clearTimeout(timer);if(changed()&&!error)timer=setTimeout(()=>flush().catch(()=>{}),delay);}
  async function drain() {
    while(changed()||pending){
      const attempt=pending || {baseVersion:saved.version,requestId:makeId(),patch:briefPatch(saved,draft)};
      pending=attempt;emit();
      let back;
      try { back=await send(attempt); }
      catch(e){
        // A lost response may have committed. Read first; do not replay blindly.
        if(!e.status || e.status>=500){
          try {
            const actual=await read();
            if(actual.saveRequestId===attempt.requestId){
              if(confirmsAttempt(actual,attempt))back=actual;
              else throw Object.assign(conflict(),{preservePending:true});
            }
            else if(actual.version!==saved.version) {pending=null;throw conflict();}
          } catch(recheck){if(recheck.code==='BRIEF_SAVE_CONFLICT')e=recheck;}
        }
        if(!back){ if(!e.preservePending&&(e.status && e.status<500 || e.code==='BRIEF_SAVE_CONFLICT'))pending=null;throw e; }
      }
      if(!back || Object.keys(attempt.patch).some(k=>JSON.stringify(back[k])!==JSON.stringify(attempt.patch[k]))) throw new Error('自动保存未能核对，草稿已保留，请重试保存');
      saved=back;pending=null;emit();
    }
    return saved;
  }
  function flush(){
    clearTimeout(timer);
    if(running)return running;
    if(error?.code==='BRIEF_SAVE_CONFLICT')return Promise.reject(error);
    error=null;
    running=Promise.resolve().then(drain).catch(e=>{error=e;throw e;}).finally(()=>{running=null;if(!changed()||error)clearTimeout(timer);emit();});
    emit();return running;
  }
  return {
    state,
    subscribe(fn){listeners.add(fn);schedule();return()=>listeners.delete(fn);},
    update(fn){if(resolving)return;const next=structuredClone(draft);fn(next);draft=next;if(error?.code!=='BRIEF_SAVE_CONFLICT')error=null;emit();schedule();},
    flush,
    async verify(){
      await flush();
      const latest=await read();
      if(latest.version!==saved.version){error=conflict();emit();throw error;}
      saved=latest;emit();
      return {baseVersion:saved.version};
    },
    async acceptSync(){
      // A completed two-way sync may advance the stored Brief version. Accept
      // that readback only when this editor has no newer work of its own.
      const beforeSaved=saved,beforeDraft=draft;
      const safe=()=>!changed()&&!pending&&!running&&!resolving&&!error&&saved===beforeSaved&&draft===beforeDraft;
      const refuse=()=>{
        const reason=error||Object.assign(conflict(),{status:409});
        if(!reason.status)reason.status=409;
        error=reason;clearTimeout(timer);emit();throw reason;
      };
      if(!safe())refuse();
      const latest=await read();
      if(!safe())refuse();
      if(latest?.month!==initial.month||!/^v\d+$/.test(latest?.version))throw Object.assign(new Error('同步后的工作台内容未能核对，当前内容已保留。'),{code:'BRIEF_SYNC_READBACK_INVALID',status:502});
      saved=structuredClone(latest);draft=structuredClone(latest);pending=null;error=null;
      clearTimeout(timer);emit();return saved;
    },
    async resolve(keepMine){
      if(resolving)return;resolving=true;emit();
      try {
      if(running)await running.catch(()=>{});
      const latest=await read();saved=latest;pending=null;error=null;
      if(!keepMine)draft=structuredClone(latest);
      emit();return await flush();
      }catch(e){error=e;throw e;}finally{resolving=false;clearTimeout(timer);emit();}
    },
  };
}

// Duplicated tabs copy sessionStorage. Hold a browser lock so each live editor
// owns a different recovery journal, while a reload can reclaim its old ID.
export function acquireBriefJournal({locks,session,local,makeId=()=>crypto.randomUUID()}) {
  if(!locks)return Promise.resolve({storage:session,journalId:'tab',release:()=>{}});
  return new Promise((resolve,reject)=>{
    const claim=id=>locks.request(`workdesk:brief-journal:${id}`,{ifAvailable:true},async lock=>{
      if(!lock){claim(makeId());return;}
      let release;const held=new Promise(done=>{release=done;});
      session.setItem('workdesk:brief-tab',id);
      resolve({storage:local,journalId:id,release});await held;
    }).catch(reject);
    claim(session.getItem('workdesk:brief-tab')||makeId());
  });
}
