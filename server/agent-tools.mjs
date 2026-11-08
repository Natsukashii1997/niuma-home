// workdesk MCP 的工具（第一期只读；月度用户策略 v2 加了唯一的写入工具 strategy_submit，只能创建待确认的 submission）。数据与页面同源：直接用现有服务，给模型的是精简视图，不含页面专用字段。
import { failure } from './v3-common.mjs';

const NO_ARGS = { type: 'object', properties: {}, additionalProperties: false };
const latest = dates => dates.filter(Boolean).sort().at(-1) ?? null;
const since = (date, from) => !from || (date && date >= from);

export const AGENT_TOOLS = {
  mentor_trainees: {
    description: '管培生名单与培养进度：每人的培养方案、当前第几天、各阶段状态与评审记录、日志链接、最近一篇日志日期、未回复提问数。',
    inputSchema: NO_ARGS,
    async run(args, { mentor, mentorPath }) {
      const people = await mentor.list();
      const { today, trainees } = mentorPath.get();
      return { today, trainees: trainees.map(t => {
        const p = people.find(x => x.name === t.name);
        const path = t.path;
        return { name: t.name, role: t.role, log: p?.url ?? null, logCount: p?.logs.length ?? 0, latestLog: latest(p?.logs.map(l => l.date) ?? []), unanswered: p?.items.filter(i => !i.reply).length ?? 0,
          path: path && { plan: path.plan.name, start: path.start, end: path.end, day: path.todayD, days: path.days, pass: path.pass, reviewer: path.reviewer,
            lines: path.lines.map(l => ({ name: l.name, stages: l.stages.map(s => ({ id: s.id, title: s.title, from: s.dates[0], to: s.dates.at(-1), status: s.status, ...(s.late && { late: s.late }), ...(s.review && { review: s.review, passRule: s.pass }), record: s.record ?? null })) })) } };
      }) };
    },
  },
  mentor_questions: {
    description: '某位管培生日志里的提问与日志目录（日期、标题、链接），以及每条提问在牛马之家里的回复状态。since 可选，只看该日期（含）之后。',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: '管培生姓名' }, since: { type: 'string', description: 'YYYY-MM-DD，可选' } }, required: ['name'], additionalProperties: false },
    async run({ name, since: from }, { mentor }) {
      if (typeof name !== 'string' || !name.trim()) throw failure(400, '请给出管培生姓名');
      if (from !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(from)) throw failure(400, 'since 须为 YYYY-MM-DD');
      const p = (await mentor.list()).find(x => x.name === name.trim());
      if (!p) throw failure(404, `牛马之家里没有这位管培生：${name}`);
      return { name: p.name, log: p.url,
        logs: p.logs.filter(l => since(l.date, from)).map(l => ({ date: l.date, title: l.t, src: l.src })),
        items: p.items.filter(i => since(i.date, from)).map(i => ({ id: i.id, kind: i.kind, text: i.text, date: i.date, log: i.log, src: i.src, reply: i.reply && { text: i.reply.text, state: i.reply.state, at: i.reply.at } })) };
    },
  },
  project_list: {
    description: '项目推进清单（来自飞书 AI管培工作台）：每个项目的阶段、完成度，以及各节点的负责人、起止与完成日期、是否逾期、是否评审节点、交付物。',
    inputSchema: NO_ARGS,
    async run(args, { projects }) {
      return (await projects.list()).map(p => ({ id: p.id, name: p.name, status: p.status, phase: p.phases?.[p.phase] ?? null, completion: p.completion, tasks: { total: p.taskCount, done: p.taskDone },
        nodes: (p.nodes || []).map(n => ({ title: n.t, phase: n.ph, owner: n.owner, done: n.done, start: n.startDate, due: n.dueDate, doneAt: n.doneDate, overdue: n.overdue, gate: n.gate, milestone: n.milestone, deliverables: n.deliverables })) }));
    },
  },
  strategy_month: {
    description: '某月的用户策略（月度判断、各地区考试与需求节奏、机会点、促销打法）。未准备的月份返回 status=未准备。',
    inputSchema: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM' } }, required: ['month'], additionalProperties: false },
    async run({ month }, { userStrategy }) {
      if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) throw failure(400, 'month 须为 YYYY-MM');
      return userStrategy.get(month);
    },
  },
  strategy_facts: {
    description: '月度用户策略 v2 的事实底稿（docs/策略规则/）：目标月相关的时间线 Evidence（含核验状态、锚点）、需求与行动窗口、六个地区的候选行动窗口覆盖率、业务背景卡及其 Evidence、来源与障碍编码表、当前正式版本，以及提交时要带回的 inputFingerprint 与 baseRevision。',
    inputSchema: { type: 'object', properties: { month: { type: 'string', description: 'YYYY-MM' } }, required: ['month'], additionalProperties: false },
    async run({ month }, { strategy }) { return strategy.factsView(month); },
  },
  strategy_submit: {
    description: '提交一份月度用户策略 v2 文档（schema 2.1）。只创建待确认的 submission，不改正式版本；常浩在牛马之家页面预览确认后才生效。同一 idempotencyKey 同一内容返回同一个 submission，内容不同报 409；校验不通过报 422 并列出原因。',
    inputSchema: { type: 'object', properties: {
      month: { type: 'string', description: 'YYYY-MM' }, document: { type: 'object', description: '月度文档（schema 2.1 第 4 节）' },
      idempotencyKey: { type: 'string' }, baseRevision: { type: ['string', 'null'], description: 'strategy_facts 返回的 baseRevision' },
      inputFingerprint: { type: 'string', description: 'strategy_facts 返回的 inputFingerprint' },
      declared: { type: 'object', description: '自报执行方、模型、skill 版本，只作声明' } },
      required: ['month', 'document', 'idempotencyKey', 'inputFingerprint'], additionalProperties: false },
    async run(args, { strategy }, { agent }) { return strategy.submit(args, { agent }); },
  },
  strategy_submission: {
    description: '查询某个 submission 的状态（pending / confirmed / rejected / stale）。提交结果不明时先查这里，不要重复提交。',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    async run({ id }, { strategy }) { return strategy.submission(id); },
  },
};
