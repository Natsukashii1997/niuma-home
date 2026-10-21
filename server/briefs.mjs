import { createLocalChanges, getRecord, putRecord, fingerprint } from './local-records.mjs';
import { createUserStrategyService } from './user-strategy.mjs';
import { BRIEF_SECTIONS as SECTIONS, BRIEF_HEADS, BRIEF_NUMBERS, BRIEF_WIDTHS, briefRows } from './brief-template.mjs';
import { generateBriefSuggestions } from './brief-generate.mjs';
import { BRIEF_DESTINATION } from './brief-destination.mjs';
import { requireMonth, failure, beijingText } from './v3-common.mjs';
import { createFeishuExporter, literalMarkdown, markdownTable } from './feishu-export.mjs';
import { attachmentMarkdownLine, createBriefAttachments } from './brief-attachments.mjs';

const editable = ['title', 'background', 'materials', 'audience', 'timeline', 'items', 'specs', 'owners', 'status'];
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw failure(400, message); };
const str = (value, max = 12000) => typeof value === 'string' && value.length <= max;
const rows = (value, width) => Array.isArray(value) && value.length <= 200 && value.every(row => Array.isArray(row) && row.length === width && row.every(s => str(s)));
const keys = (object, allowed) => Object.keys(object).every(k => allowed.includes(k));

function merge(base, patch) {
  const result = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) fail('内容包含无效字段');
    result[key] = plain(value) && plain(result[key]) ? merge(result[key], value) : structuredClone(value);
  }
  return result;
}

export function generatedBrief(db, month, source = createUserStrategyService(db).get(month)) {
  requireMonth(month);
  return {
    month, title: `${month} 设计 brief`, version: 'v0', editedAt: '',
    strategySource:{month,available:!!source?.summary?.judgement,origin:source?.origin || '',fingerprint:fingerprint(source)},
    background: { from:'', text:'', goals:[] }, materials:[], audience:[],
    timeline: [], items:[], specs: [], owners: [['需求对接',''],['内容确认',''],['设计对接','']], status: Object.fromEntries(SECTIONS.map((_, i) => [String(i + 1), 'todo'])),
  };
}

function validateBrief(value) {
  if (!str(value.title, 500) || !value.title.trim() || !plain(value.background) || !keys(value.background, ['from', 'text', 'goals']) || !str(value.background.from, 500) || !str(value.background.text) || !Array.isArray(value.background.goals) || value.background.goals.length > 100 || value.background.goals.some(g => !str(g, 2000))) fail('brief 标题、背景或目标格式无效');
  if (!rows(value.audience, 3) || !rows(value.timeline, 5) || !(rows(value.specs, 2)||rows(value.specs, 4)) || !(rows(value.owners, 2)||rows(value.owners, 3))) fail('brief 受众、时间线、规格或负责人表格列数不正确');
  if (!Array.isArray(value.materials) || value.materials.length > 100 || value.materials.some(m=>!plain(m)||!keys(m,['id','name'])||!str(m.id,150)||!m.id||!str(m.name,500)) || new Set(value.materials.map(m=>m.id)).size!==value.materials.length) fail('物料名称与编号无效');
  if(value.materials.length && (value.audience.length!==value.materials.length || value.timeline.length!==value.materials.length || !Array.isArray(value.items) || value.items.length!==value.materials.length || value.materials.some((m,i)=>value.audience[i][0]!==m.name || value.timeline[i][0]!==m.name || value.items[i]?.id!==m.id || value.items[i]?.title!==m.name))) fail('物料名称须与受众、交付时间和详细框架一致');
  if (!plain(value.status) || Object.keys(value.status).length !== 7 || !Object.entries(value.status).every(([k, v]) => /^[1-7]$/.test(k) && ['todo', 'part', 'done'].includes(v))) fail('brief 须包含七节完成状态');
  if (!Array.isArray(value.items) || value.items.length > 100 || new Set(value.items.map(it => it?.id)).size !== value.items.length) fail('brief 物料编号须唯一');
  for (const it of value.items) {
    if (!plain(it) || !keys(it, ['id', 'kind', 'title', 'priceFrom', 'blocks', 'refs', 'reuse', 'cells', 'note']) || !str(it.id, 150) || !it.id || !str(it.title, 500) || !['framework','price', 'grid9', 'skip'].includes(it.kind)) fail('brief 物料类型、编号或标题无效');
    if (it.kind === 'skip') { if (!str(it.note)) fail('不出物料的说明须为文字'); continue; }
    if (it.priceFrom !== undefined && !str(it.priceFrom, 1000)) fail('价格来源说明须为文字');
    if (['price','framework'].includes(it.kind) && !rows(it.blocks, 3)) fail('物料须包含三列内容表格');
    if (it.kind === 'grid9' && (!Array.isArray(it.cells) || it.cells.length !== 9 || it.cells.some(c => !str(c, 4000)))) fail('九宫格须包含九项文字');
    if (!Array.isArray(it.refs) || it.refs.length > 30 || it.refs.some(r => !plain(r) || !keys(r, ['kind', 'big', 'title', 'accent']) || !str(r.kind, 100) || !str(r.title, 500) || (r.big !== undefined && !str(r.big, 1000)) || (r.accent !== undefined && typeof r.accent !== 'boolean'))) fail('参考图信息格式无效');
    if (it.reuse !== null && (!plain(it.reuse) || !keys(it.reuse, ['month', 'title', 'big']) || !str(it.reuse.title, 500) || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(it.reuse.month) || (it.reuse.big !== undefined && !str(it.reuse.big, 1000)))) fail('沿用物料信息格式无效');
  }
}

const markdownText = literalMarkdown;
const tableMarkdown = markdownTable;

// 附件节只写文件名清单，文件本身不上传飞书。
export function briefMarkdown(brief, attachments = []) {
  const content = [
    [markdownText(brief.background.text), ...brief.background.goals.map(g => `- ${markdownText(g)}`)].join('\n\n'),
    tableMarkdown(BRIEF_HEADS.audience, brief.audience),
    tableMarkdown(BRIEF_HEADS.timeline, brief.timeline),
    brief.items.map(it => `### ${markdownText(it.title)}\n\n${it.kind === 'skip' ? markdownText(it.note) : [it.priceFrom ? `来源：${markdownText(it.priceFrom)}` : '', it.blocks ? tableMarkdown(BRIEF_HEADS.blocks, it.blocks) : it.cells.map((c, i) => `${i + 1}. ${markdownText(c)}`).join('\n'), ...(it.refs || []).map(r => `参考：${markdownText(r.title)}`), it.reuse ? `沿用：${it.reuse.month} ${markdownText(it.reuse.title)}` : ''].filter(Boolean).join('\n\n')}`).join('\n\n'),
    tableMarkdown(BRIEF_HEADS.specs, specRows(brief)),
    tableMarkdown(BRIEF_HEADS.owners, ownerRows(brief)),
    attachments.map(a => `- ${markdownText(attachmentMarkdownLine(a))}`).join('\n'),
  ];
  return `# ${markdownText(brief.title)}\n\n${SECTIONS.map((title, i) => `## ${i + 1}. ${title}\n\n${content[i]}`).join('\n\n')}\n`;
}

const specRows = b => b.specs.map(r=>r.length===4?[r[0],r.slice(1).filter(Boolean).join(' / ')]:r);
const ownerRows = b => b.owners.map(r=>r.length===3?[r[0],r.slice(1).filter(Boolean).join(' / ')]:r);
const xml = value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r/g,'').replace(/\n/g,'<br/>');
const para = value => `<p>${xml(value)}</p>`;
const xmlTable = (heads, rows, widths) => `<table><colgroup>${widths.map(w=>`<col width="${w}"/>`).join('')}</colgroup>${heads.length?`<thead><tr>${heads.map(h=>`<th background-color="light-gray">${para(h)}</th>`).join('')}</tr></thead>`:''}<tbody>${briefRows(rows,widths.length).map(r=>`<tr>${r.map(c=>`<td>${para(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

export function briefXml(brief, attachments=[]) {
  const content = [
    para(brief.background.text)+(brief.background.goals.length?`<ul>${brief.background.goals.map(g=>`<li>${xml(g)}</li>`).join('')}</ul>`:''),
    xmlTable(BRIEF_HEADS.audience,brief.audience,BRIEF_WIDTHS.audience),
    xmlTable(BRIEF_HEADS.timeline,brief.timeline,BRIEF_WIDTHS.timeline),
    brief.items.map((it,i)=>`<h2>4.${i+1} ${xml(it.title.trimEnd())}</h2>`+(it.kind==='skip'?para(it.note):[
      it.priceFrom?para(`来源：${it.priceFrom}`):'',
      it.blocks?xmlTable(BRIEF_HEADS.blocks,it.blocks,BRIEF_WIDTHS.blocks):`<ol>${(it.cells||[]).map(c=>`<li>${xml(c)}</li>`).join('')}</ol>`,
      ...(it.refs||[]).map(r=>para(`参考：${r.title}`)),it.reuse?para(`沿用：${it.reuse.month} ${it.reuse.title}`):''
    ].join(''))).join(''),
    xmlTable(BRIEF_HEADS.specs,specRows(brief),BRIEF_WIDTHS.specs),
    xmlTable([],ownerRows(brief),BRIEF_WIDTHS.owners),
    attachments.map(a=>para(attachmentMarkdownLine(a))).join('') || para(''),
  ];
  return `<title>${xml(brief.title)}</title>\n${SECTIONS.map((name,i)=>`<h1>${BRIEF_NUMBERS[i]}、${name}</h1>${content[i]}`).join('\n')}`;
}

export function createBriefService(db, { now = Date.now, exports: exportOptions = {}, strategy = createUserStrategyService(db) } = {}) {
  const changes = createLocalChanges(db, { now });
  const exporter = createFeishuExporter(db, { now, ...exportOptions, fixedTarget: BRIEF_DESTINATION });
  const previewViews = new Map();
  const attachments = createBriefAttachments(db, { now });
  function read(month) {
    const base = generatedBrief(db, month, strategy.get(month)), stored = getRecord(db, 'brief', month);
    if (!stored) return base;
    let value={ ...merge(base, stored.overrides), version: `v${stored.revision}`, editedAt: stored.editedAt, saveRequestId:stored.lastSave?.id };
    // Older saved Briefs predate the material-name master list. Hydrate stable rows in memory.
    if(stored.overrides.materials===undefined){
      const slots=[];
      for(const key of ['audience','timeline','items']) for(const row of value[key]) {
        const name=key==='items'?row.title:row[0];
        let slot=slots.find(x=>x.name===name && !x[key]);
        if(!slot){slot={name};slots.push(slot);} slot[key]=structuredClone(row);
      }
      const used=new Set(value.items.map(it=>it.id));let serial=0;
      value.materials=slots.map(x=>{let id=x.items?.id;while(!id){const candidate=`legacy-${serial++}`;if(!used.has(candidate)){id=candidate;used.add(id);}}return{id,name:x.name};});
      value.audience=slots.map(x=>x.audience || [x.name,'','']);
      value.timeline=slots.map(x=>x.timeline || [x.name,'','','','']);
      value.items=slots.map((x,i)=>x.items || {id:value.materials[i].id,kind:'framework',title:x.name,blocks:[],refs:[],reuse:null});
    }
    return value;
  }
  const exportContent = month => () => {
    const brief = read(month);
    validateBrief(brief);
    if(!brief.materials.length && [brief.audience,brief.timeline,brief.items].some(rows=>rows.length)) fail('物料名称与正文未对应，请先补全物料名称再创建');
    // 空白占位行不算物料；未命名但已填内容的行仍须补名，避免丢失正文。
    const keep = brief.materials.map((m,i)=>{
      if(m.name.trim())return i;
      const item=brief.items[i];
      if(brief.audience[i].slice(1).some(v=>v.trim()) || brief.timeline[i].slice(1).some(v=>v.trim()) || item.kind!=='framework' || item.blocks.some(r=>r.some(v=>v.trim())) || item.refs.length || item.reuse || item.priceFrom?.trim()) fail('有一份物料已填写内容但未命名，请补充物料名称');
      return -1;
    }).filter(i=>i>=0);
    for(const key of ['materials','audience','timeline','items']) brief[key]=keep.map(i=>brief[key][i]);
    return { title: brief.title, sections: SECTIONS, markdown: briefMarkdown(brief, attachments.list(month).items), format:'xml', xml:briefXml(brief,attachments.list(month).items) };
  };
  return {
    read,
    attachments,
    autosave(month, body) {
      requireMonth(month);
      if(!plain(body)||!keys(body,['baseVersion','requestId','patch'])||!/^v\d+$/.test(body.baseVersion)||!str(body.requestId,150)||!body.requestId||!plain(body.patch)||!keys(body.patch,editable)) fail('自动保存内容无效');
      const signature=fingerprint(body);
      db.exec('BEGIN IMMEDIATE');
      try {
        const stored=getRecord(db,'brief',month), current=read(month);
        if(stored?.lastSave?.id===body.requestId){
          if(stored.lastSave.signature!==signature) fail('保存请求编号不可复用');
          db.exec('COMMIT');return current;
        }
        if(current.version!==body.baseVersion) throw Object.assign(failure(409,'另一页面已更新这份 Brief。当前草稿已保留，请选择保留哪一份。'),{code:'BRIEF_SAVE_CONFLICT'});
        const next=merge(current,body.patch);validateBrief(next);
        if(editable.every(k=>JSON.stringify(next[k])===JSON.stringify(current[k]))){db.exec('COMMIT');return current;}
        const record={overrides:Object.fromEntries(editable.map(k=>[k,next[k]])),revision:(stored?.revision||0)+1,editedAt:beijingText(now()),lastSave:{id:body.requestId,signature}};
        const back=putRecord(db,'brief',month,record,now());
        if(fingerprint(back)!==fingerprint(record)) throw failure(500,'自动保存回读不一致');
        const value=read(month);db.exec('COMMIT');return value;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    generate(month, body={}) {
      requireMonth(month);
      if(!plain(body)||!keys(body,['patch','overwrite']) || (body.overwrite!==undefined && typeof body.overwrite!=='boolean') || !plain(body.patch)||!keys(body.patch,editable))fail('请提供当前Brief草稿');
      const draft=merge(read(month),body.patch); validateBrief(draft);
      return generateBriefSuggestions(draft,strategy.get(month),{overwrite:body.overwrite===true});
    },
    preview(month, body) {
      requireMonth(month);
      if (!plain(body) || !keys(body, ['patch']) || !plain(body.patch) || !keys(body.patch, editable) || !Object.keys(body.patch).length) fail('请提交要修改的 brief 字段 patch');
      if (body.patch.background !== undefined && (!plain(body.patch.background) || !keys(body.patch.background, ['from', 'text', 'goals']))) fail('背景只接受来源、文字与目标字段');
      const stored = getRecord(db, 'brief', month), base = generatedBrief(db, month,strategy.get(month));
      const sourceFingerprint = fingerprint(base);
      const value = { overrides: merge(stored && stored.overrides.materials===undefined ? Object.fromEntries(editable.map(k=>[k,read(month)[k]])) : stored?.overrides || {}, body.patch), revision: (stored?.revision || 0) + 1, editedAt: beijingText(now()), sourceFingerprint };
      const validate = candidate => {
        if (fingerprint(generatedBrief(db, month,strategy.get(month))) !== sourceFingerprint) throw failure(409, '同月用户策略已变化，请重新读取 brief 后预览');
        validateBrief(merge(base, candidate.overrides));
      };
      const preview = changes.preview('brief', month, value, { validate });
      for (const [id, entry] of previewViews) if (entry.expires <= now()) previewViews.delete(id);
      const view = { ...merge(base, value.overrides), version: `v${value.revision}`, editedAt: value.editedAt };
      previewViews.set(preview.previewId, { view, expires: Date.parse(preview.expiresAt) });
      return { previewId: preview.previewId, expiresAt: preview.expiresAt, before: read(month), value: view };
    },
    confirm(month, body) { requireMonth(month); changes.confirm('brief', month, body); return structuredClone(previewViews.get(body.previewId).view); },
    exportPreview(month, body = {}) {
      requireMonth(month);
      const {baseVersion,...target}=body;
      if(baseVersion!==undefined && baseVersion!==read(month).version) throw Object.assign(failure(409,'Brief 已被另一页面更新，请核对后再创建文档'),{code:'BRIEF_SAVE_CONFLICT'});
      return exporter.preview('brief', month, { month }, target, exportContent(month));
    },
    exportConfirm(month, body) { requireMonth(month); return exporter.confirm('brief', month, body, exportContent(month)); },
    exportStatus(month, operationId) { requireMonth(month); return exporter.status('brief', month, operationId); },
    exportReconcile(month, operationId) { requireMonth(month); return exporter.reconcile('brief', month, operationId); },
  };
}
