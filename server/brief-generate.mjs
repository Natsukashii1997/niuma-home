import { failure } from './v3-common.mjs';

const text = s => String(s || '').replace(/\s+/g,' ').trim();
const short = (s,n=160) => { const v=text(s); return v.length > n ? `${v.slice(0,n).replace(/[，；、]$/,'')}…` : v; };
const definitions = [
  {match:/案例|口碑|成果|评价/,audience:'对效果、适配度和服务专业性仍有顾虑的新用户及潜在续费用户',task:'需要看到与自己学校、课程或学业问题相近的真实案例，理解辅导过程与结果，再决定是否进一步咨询。',goal:'补足信任依据：用可核对的用户案例连接当月学业问题与服务过程，帮助用户判断是否适合自己。'},
  {match:/导师|师资|老师/,audience:'关心导师背景、学校课程匹配与授课方式的用户',task:'需要先了解可匹配的导师资源、擅长课程与授课特点，再进入具体导师资料或匹配咨询。',goal:'降低匹配顾虑：围绕学校、课程和学业任务解释导师适配依据，让用户知道下一步如何获得匹配建议。'},
  {match:/折扣|价格|优惠|购课|权益/,audience:'已产生学习需求、正在比较价格与服务范围或等待决策的用户',task:'需要看懂适用产品、优惠条件、截止时间和参与入口；价格与权益以本期确认的活动规则为准。',goal:'支持行动决策：明确适用对象、服务边界与参与路径，帮助有需求的用户做选择，具体优惠不在本节预设。'},
  {match:/考前|冲刺|期中|期末|补考|final|midterm/i,audience:'近期有考试、补考或复习任务的学生，按当月学校节点分层触达',task:'时间与任务相互挤压，需要判断薄弱点、复习顺序和剩余准备时间，再选择合适的辅导组合。',goal:'优先承接紧迫任务：围绕当月考试与复习场景解释问题判断、准备路径和服务适用范围，便于业务方承接咨询。'},
  {match:/论文|作业|ddl|essay/i,audience:'正在处理论文、课程作业或临近提交节点的学生',task:'需要明确题目要求、当前卡点与剩余进度，获得学习方法和过程辅导；不以代写或成绩承诺替代任务说明。',goal:'支持任务推进：把论文与作业中的具体困难转成清晰的辅导场景，帮助用户判断当前需要补足哪一步。'},
  {match:/产品|课程|亮点|介绍/,audience:'已有具体学校、课程或学习问题，正在比较产品与服务的用户',task:'需要快速确认适用课程、解决的问题、服务内容和使用边界，判断产品与自己的当前任务是否匹配。',goal:'解释产品选择：围绕用户当前任务说明产品适用场景和服务差异，帮助业务方给出具体、有依据的建议。'},
  {match:/活动|营销|朋友圈|九宫格|预热/,audience:'尚未形成完整活动认知的学生、家长及潜在咨询用户',task:'需要先理解活动与自身学业任务的关系，再看懂主要服务、核心信息与咨询入口。',goal:'统一活动认知：用一致的主题和信息顺序串起需求唤起、产品理解与行动入口，便于不同渠道复用。'},
];

export function generateBriefSuggestions(brief, source, { overwrite=false }={}) {
  if (!source?.summary?.judgement || source.month !== brief.month) throw failure(409, '这个月份还没有可用的用户策略，请先完善同月用户策略');
  const next=structuredClone(brief), warnings=[];
  const materials=(brief.materials || []).filter(m=>m.name.trim());
  const intents=materials.map(m=>definitions.find(d=>d.match.test(m.name)));
  const goals=[...new Set(intents.filter(Boolean).map(d=>d.goal))].slice(0,4);
  const defaults=['聚焦当月任务：以用户策略中的学业节点和主要困难为线索，明确本批物料需要解释的问题。','建立判断依据：把适用人群、当前问题与服务价值对应起来，便于业务方承接具体咨询。','明确下一步：让每份物料指向可执行的了解、咨询或准备动作，具体时间和负责人由需求方补充。'];
  for(const goal of defaults) if(goals.length<3)goals.push(goal);
  const sourceGoal=text(source.strategy?.goal);
  const background=`${short(source.summary.judgement,150)}${sourceGoal ? ` 本月策略重点是${short(sourceGoal,50).replace(/[。！]$/,'')}。` : ''}本批物料以用户当前的学业任务与决策障碍为切入口，${materials.length ? `围绕${materials.slice(0,4).map(m=>m.name).join('、')}${materials.length>4?'等物料':''}，` : ''}把需求理解、服务选择与下一步行动连接起来，供业务沟通和内容传播使用。`;
  const generatedBackground=overwrite || !text(next.background.text) || !next.background.goals.some(text);
  if(overwrite || !text(next.background.text)) next.background.text=background;
  if(overwrite || !next.background.goals.some(text)) next.background.goals=goals;
  if(generatedBackground) next.background.from=`${brief.month} 用户策略（${source.origin || '本机'}）· 内部生成建议`;
  next.audience=next.audience.map((row,i)=>{
    const name=next.materials[i]?.name || row[0]; if(!name.trim())return row;
    const def=definitions.find(d=>d.match.test(name));
    const namedRegions=(source.regions || []).filter(r=>name.includes(r.name));
    const regions=namedRegions.length?namedRegions:(source.regions || []).filter(r=>r.tier==='主战场');
    const relevant=regions.filter(r=>[...(r.node||[]),...(r.task||[]),...(r.pain||[])].some(v=>def?.match.test(v[0])));
    const candidates=relevant.length?relevant:regions;
    const score=r=>(r.task||[]).filter(v=>def?.match.test(v[0])).length*3+(r.pain||[]).filter(v=>def?.match.test(v[0])).length;
    const chosen=[...candidates].sort((a,b)=>score(b)-score(a)).slice(0,2);
    const context=chosen.map(r=>`${r.name}：${short(([...(r.task||[]),...(r.pain||[]),...(r.node||[])].find(v=>def?.match.test(v[0])) || r.task?.[0] || r.pain?.[0] || r.node?.[0] || [])[0],65)}`).filter(v=>!v.endsWith('：')).join('；');
    if(!def)warnings.push(`「${name}」的具体传播场景还不明确，已按当月用户任务给出基础建议，请补充确认。`);
    const audience=(def?.audience || '当月用户策略覆盖、与该物料主题相关的学生；具体触达范围待确认')+(namedRegions.length?`（${namedRegions.map(r=>r.name).join('、')}）`:'');
    const state=`${context ? `当月关注：${context}。` : ''}${def?.task || '需进一步确认这份物料对应的学业任务、用户顾虑与下一步行动，避免只按名称推断具体诉求。'}`;
    return [name,overwrite || !text(row[1])?audience:row[1],overwrite || !text(row[2])?state:row[2]];
  });
  return {value:next,warnings,source:{month:source.month,origin:source.origin || '本机',preparedAt:source.preparedAt || '',updatedAt:source.updatedAt || '',model:'工作台内部规则'}};
}
