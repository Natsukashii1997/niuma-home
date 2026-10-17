import { createLocalChanges, getRecord, fingerprint } from './local-records.mjs';
import { acceptedMarketingNeeds, availablePriceMatrices } from './price.mjs';
import { requireMonth, failure, beijingText } from './v3-common.mjs';
import { createFeishuExporter, literalMarkdown, markdownTable } from './feishu-export.mjs';
import { attachmentMarkdownLine, createBriefAttachments } from './brief-attachments.mjs';

const SECTIONS = ['项目背景与目标', '目标受众', '项目时间线', '详细文案与框架', '交付物清单与规格', '负责人与审批', '附件'];
const editable = ['title', 'background', 'audience', 'timeline', 'items', 'specs', 'owners', 'status'];
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

export function generatedBrief(db, month) {
  requireMonth(month);
  const needs = acceptedMarketingNeeds(db, month);
  const monthEnd = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  const items = [];
  for (const matrix of availablePriceMatrices(db)) {
    for (const scheme of matrix.schemes) {
      if (scheme.status !== '生效中' || scheme.from > monthEnd || scheme.to && scheme.to < `${month}-01`) continue;
      if (scheme.needId && !needs.some(n => n.id === scheme.needId)) continue;
      items.push({
        id: `price-${matrix.sku}-${scheme.id}`, kind: 'price', title: `${matrix.name} · ${scheme.name}`,
        priceFrom: `${matrix.line} · ${matrix.name} · ${scheme.name}`,
        blocks: matrix.tiers.map((hours, i) => [`${hours}课时`, `${scheme.prices[i]}元${scheme.gifts[i] ? `，赠${scheme.gifts[i]}课时` : ''}`, `${scheme.from} 至 ${scheme.to || '长期有效'}`]),
        refs: [], reuse: null,
      });
    }
  }
  return {
    month, title: `${month} 设计 brief`, version: 'v0', editedAt: '',
    background: { from: needs.length ? '主线需求' : '', text: needs.map(n => `${n.seg} · ${n.node}：${n.need}`).join('\n'), goals: needs.map(n => n.strategy?.goal).filter(Boolean) },
    audience: needs.map(n => ['', `${n.seg}（${n.node}）`, [n.pain, n.todo].filter(Boolean).join('；')]),
    timeline: [], items, specs: [], owners: [], status: Object.fromEntries(SECTIONS.map((_, i) => [String(i + 1), 'todo'])),
  };
}

function validateBrief(value) {
  if (!str(value.title, 500) || !value.title.trim() || !plain(value.background) || !keys(value.background, ['from', 'text', 'goals']) || !str(value.background.from, 500) || !str(value.background.text) || !Array.isArray(value.background.goals) || value.background.goals.length > 100 || value.background.goals.some(g => !str(g, 2000))) fail('brief 标题、背景或目标格式无效');
  if (!rows(value.audience, 3) || !rows(value.timeline, 5) || !rows(value.specs, 4) || !rows(value.owners, 3)) fail('brief 受众、时间线、规格或负责人表格列数不正确');
  if (!plain(value.status) || Object.keys(value.status).length !== 7 || !Object.entries(value.status).every(([k, v]) => /^[1-7]$/.test(k) && ['todo', 'part', 'done'].includes(v))) fail('brief 须包含七节完成状态');
  if (!Array.isArray(value.items) || value.items.length > 100 || new Set(value.items.map(it => it?.id)).size !== value.items.length) fail('brief 物料编号须唯一');
  for (const it of value.items) {
    if (!plain(it) || !keys(it, ['id', 'kind', 'title', 'priceFrom', 'blocks', 'refs', 'reuse', 'cells', 'note']) || !str(it.id, 150) || !it.id || !str(it.title, 500) || !['price', 'grid9', 'skip'].includes(it.kind)) fail('brief 物料类型、编号或标题无效');
    if (it.kind === 'skip') { if (!str(it.note)) fail('不出物料的说明须为文字'); continue; }
    if (it.priceFrom !== undefined && !str(it.priceFrom, 1000)) fail('价格来源说明须为文字');
    if (it.kind === 'price' && !rows(it.blocks, 3)) fail('价格物料须包含三列内容表格');
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
    tableMarkdown(['物料', '面向人群', '当前状态与待办'], brief.audience),
    tableMarkdown(['物料', '交付时间', '优先级', '对接人', '说明'], brief.timeline),
    brief.items.map(it => `### ${markdownText(it.title)}\n\n${it.kind === 'skip' ? markdownText(it.note) : [it.priceFrom ? `来源：${markdownText(it.priceFrom)}` : '', it.blocks ? tableMarkdown(['涉及板块', '内容', '说明'], it.blocks) : it.cells.map((c, i) => `${i + 1}. ${markdownText(c)}`).join('\n'), ...(it.refs || []).map(r => `参考：${markdownText(r.title)}`), it.reuse ? `沿用：${it.reuse.month} ${markdownText(it.reuse.title)}` : ''].filter(Boolean).join('\n\n')}`).join('\n\n'),
    tableMarkdown(['物料', '比例', '尺寸', '格式'], brief.specs),
    tableMarkdown(['角色', '负责人', '状态'], brief.owners),
    attachments.map(a => `- ${markdownText(attachmentMarkdownLine(a))}`).join('\n'),
  ];
  return `# ${markdownText(brief.title)}\n\n${SECTIONS.map((title, i) => `## ${i + 1}. ${title}\n\n${content[i]}`).join('\n\n')}\n`;
}

export function createBriefService(db, { now = Date.now, exports: exportOptions = {} } = {}) {
  const changes = createLocalChanges(db, { now });
  const exporter = createFeishuExporter(db, { now, ...exportOptions });
  const previewViews = new Map();
  const attachments = createBriefAttachments(db, { now });
  function read(month) {
    const base = generatedBrief(db, month), stored = getRecord(db, 'brief', month);
    if (!stored) return base;
    return { ...merge(base, stored.overrides), version: `v${stored.revision}`, editedAt: stored.editedAt };
  }
  const exportContent = month => () => {
    const brief = read(month);
    validateBrief(brief);
    return { title: brief.title, sections: SECTIONS, markdown: briefMarkdown(brief, attachments.list(month).items) };
  };
  return {
    read,
    attachments,
    preview(month, body) {
      requireMonth(month);
      if (!plain(body) || !keys(body, ['patch']) || !plain(body.patch) || !keys(body.patch, editable) || !Object.keys(body.patch).length) fail('请提交要修改的 brief 字段 patch');
      if (body.patch.background !== undefined && (!plain(body.patch.background) || !keys(body.patch.background, ['from', 'text', 'goals']))) fail('背景只接受来源、文字与目标字段');
      const stored = getRecord(db, 'brief', month), base = generatedBrief(db, month);
      const sourceFingerprint = fingerprint(base);
      const value = { overrides: merge(stored?.overrides || {}, body.patch), revision: (stored?.revision || 0) + 1, editedAt: beijingText(now()), sourceFingerprint };
      const validate = candidate => {
        if (fingerprint(generatedBrief(db, month)) !== sourceFingerprint) throw failure(409, '需求或价格来源已变化，请重新读取 brief 后预览');
        validateBrief(merge(base, candidate.overrides));
      };
      const preview = changes.preview('brief', month, value, { validate });
      for (const [id, entry] of previewViews) if (entry.expires <= now()) previewViews.delete(id);
      const view = { ...merge(base, value.overrides), version: `v${value.revision}`, editedAt: value.editedAt };
      previewViews.set(preview.previewId, { view, expires: Date.parse(preview.expiresAt) });
      return { previewId: preview.previewId, expiresAt: preview.expiresAt, before: read(month), value: view };
    },
    confirm(month, body) { requireMonth(month); changes.confirm('brief', month, body); return structuredClone(previewViews.get(body.previewId).view); },
    exportPreview(month, body = {}) { requireMonth(month); return exporter.preview('brief', month, { month }, body, exportContent(month)); },
    exportConfirm(month, body) { requireMonth(month); return exporter.confirm('brief', month, body, exportContent(month)); },
    exportStatus(month, operationId) { requireMonth(month); return exporter.status('brief', month, operationId); },
    exportReconcile(month, operationId) { requireMonth(month); return exporter.reconcile('brief', month, operationId); },
  };
}
