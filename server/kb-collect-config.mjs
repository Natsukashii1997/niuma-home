import { runLark } from './projects.mjs';
import { failure } from './v3-common.mjs';

export const COLLECT_SPACE = '7620758074885835965';
export const COLLECT_RULES = [
  { nodeToken:'PDlGw8ajXi2VFDkxNepcnf1Yngc', title:'📢 营销策划', keywords:['促销','营销','活动','方案','brief','海报','物料','价格','战役'] },
  { nodeToken:'RIPwwvx82itSBGkt1NPcmTcznwc', title:'👔 管培带教', keywords:['管培','带教','轮岗','成长','日志'] },
  { nodeToken:'Y41OwtA2tirMmHkI1fycLYz8nEb', title:'📅 用户时间线', keywords:['时间线','申请季','截止','用户旅程'] },
  { nodeToken:'L0n8wH0ZfiYu3IkRJGrc0MaDnGg', title:'🧭 策略思考', keywords:['策略','复盘','分析','规划','思考'] },
  { nodeToken:'ZjYLwq2nViKvR7kKJCJcNE8zn1g', title:'📦 产品文档', keywords:['产品','需求','PRD','功能','版本'] },
  { nodeToken:'S6SuwcdkAiac4MkSlFGcbd1bnwd', title:'🧪 AI实验室', keywords:['AI','模型','Agent','Claude','Codex','提示词'] },
  { nodeToken:'AeH5wo1F5iYvqakV1L4cWjmZngh', title:'🗃️ 杂项其他', keywords:[] },
];
export const validNodeToken = value => typeof value === 'string' && /^[A-Za-z0-9]{1,80}$/.test(value);
export function collectRules(raw) {
  const bad = () => { throw failure(400,'收藏规则须有不同节点、目录名称和关键词数组，并保留一个无关键词的兜底目录'); };
  let rows; try { rows=JSON.parse(raw); } catch { bad(); }
  if(!Array.isArray(rows)||!rows.length||rows.length>201)bad();
  const seen=new Set(); let total=0;
  const rules=rows.map(row=>{
    if(!row||!validNodeToken(row.nodeToken)||seen.has(row.nodeToken)||typeof row.title!=='string'||!row.title.trim()||!Array.isArray(row.keywords))bad();
    seen.add(row.nodeToken);const words=new Set(),keywords=[];
    for(const word of row.keywords){
      if(typeof word!=='string')bad();const clean=word.trim();if(!clean)continue;
      if([...clean].length>20)throw failure(400,'单个关键词不能超过20字');
      const folded=clean.toLocaleLowerCase();if(!words.has(folded)){words.add(folded);keywords.push(clean);}
    }
    total+=keywords.length;return{nodeToken:row.nodeToken,title:row.title.trim(),keywords};
  });
  if(total>200)throw failure(400,'关键词总数不能超过200');
  if(rules.filter(row=>!row.keywords.length).length!==1)bad();
  return rules;
}
export async function validateCollectRuleNodes(rules,spaceId,run){
  for(const rule of rules){
    let node;try{node=await runLark(['wiki','+node-get','--node-token',rule.nodeToken,'--space-id',spaceId],run);}catch{throw failure(400,'收藏目录读取失败，请检查节点及目标空间权限');}
    if(node.node_token!==rule.nodeToken||node.space_id!==spaceId)throw failure(400,'收藏目录必须是目标知识空间里真实存在的节点');
  }
}
