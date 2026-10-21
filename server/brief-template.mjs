// Shared template contract: pure data/functions, also imported by the editor.
export const BRIEF_SECTIONS = ['项目背景目标', '物料目标受众', '需求交付时间', '详细文案框架', '交付物清单与规格', '负责人与审批机制', '附件'];
export const BRIEF_HEADS = { audience: ['物料名称', '面向人群', '当前状态与待办'], timeline: ['物料名称', '交付时间', '优先级', '需求对接人', '说明'], blocks: ['涉及板块', '内容', '说明/示例'], specs: ['交付物', '规格建议'], owners: ['角色', '负责人'] };
export const BRIEF_NUMBERS = ['一','二','三','四','五','六','七'];

// Stable IDs bind all three sections. A rename only changes labels, never entered cells.
export function syncBriefMaterials(brief, materials) {
  const old = brief.materials || [];
  const position = new Map(old.map((m,i)=>[m.id,i]));
  const next = structuredClone(brief);
  next.materials = structuredClone(materials);
  next.audience = materials.map(m => {
    const i = position.get(m.id), row = i === undefined ? null : brief.audience[i];
    return [m.name, row?.[1] || '', row?.[2] || ''];
  });
  next.timeline = materials.map(m => {
    const i = position.get(m.id), row = i === undefined ? null : brief.timeline[i];
    return [m.name, ...(row ? row.slice(1) : ['', '', '', ''])];
  });
  next.items = materials.map(m => {
    const item = brief.items.find(it=>it.id === m.id);
    return item ? { ...structuredClone(item), title:m.name } : {id:m.id,kind:'framework',title:m.name,blocks:[],refs:[],reuse:null};
  });
  return next;
}
