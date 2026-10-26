import { getSettings, saveSetting } from './db.mjs';
import { mentorConfig } from './mentor.mjs';
import { createLocalChanges, fingerprint, getRecord, listRecords } from './local-records.mjs';
import { beijingText, failure } from './v3-common.mjs';
import { reportDocumentUrl } from './reports.mjs';
import { DEFAULT_PLAN, PLANS } from './mentor-plans.mjs';
import { dayIndex, missingYears, workdays } from './workdays.mjs';

// 带教 · 培养路径（2026-10-26 改为按工作日排期，照飞书 V2.4）：每位带教对象一份路径（v3_documents kind=mentor-path，id=姓名），
// 新加的人从培养方案模板（mentor-plans.mjs）整份复制，之后入职日、各段日期和安排文字各改各的；每段一条进度记录
// （kind=mentor-stage，id=姓名:阶段编号）：评审段记分数和结论，其余段由带教确认完成。状态、超期都由记录和工作日历推出，不另存。
// 名单沿用带教来源（设置 mentor_sources），加人时一并写进名单；只存工作台本地，不回写飞书。
export const PATH_KIND = 'mentor-path', STAGE_KIND = 'mentor-stage';
const LINES = [['biz', '业务线'], ['ai', '技术线']];
const RESULTS = ['pass', 'retest', 'fail'];
const MAX_PEOPLE = 20;
const text = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
const ymd = v => { const d = new Date(`${v}T00:00:00Z`); return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v); };
const span = v => Array.isArray(v) && v.length === 2 && v.every(Number.isInteger) && v[0] >= 1 && v[0] <= v[1] && v[1] <= 400;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const strip = ({ history, ...rest }) => rest;

// 校验并整理一份路径，只保留约定字段：两条线依次是业务线、技术线；同一条线上各段按工作日先后排、不重叠（中间可以空几天）；
// 安排的日期落在本段之内；评审段写明合格标准；技术线的同期业务阶段要存在。
export function validatePath(def) {
  const bad = msg => { throw failure(400, `培养路径有误：${msg}`); };
  if (!def || typeof def !== 'object' || Array.isArray(def)) bad('不是对象');
  if (!ymd(def.start)) bad('入职日须是 YYYY-MM-DD');
  if (!Number.isInteger(def.pass) || def.pass < 1 || def.pass > 100) bad('合格分须是 1–100 的整数');
  if (!text(def.reviewer, 20)) bad('须写明带教负责人');
  const plan = def.plan || {};
  if (!text(plan.id, 20) || !text(plan.name, 50) || (plan.source !== undefined && !text(plan.source, 300))) bad('须注明来自哪份培养方案');
  if (!Array.isArray(def.lines) || def.lines.length !== 2 || def.lines.some((l, i) => l?.key !== LINES[i][0])) bad('须依次是业务线（biz）和技术线（ai）两条');
  const ids = new Set(), bizIds = new Set(def.lines[0].stages?.map(s => s?.id));
  const lines = def.lines.map((l, li) => {
    if (!Array.isArray(l.stages) || !l.stages.length || l.stages.length > 15) bad(`${LINES[li][1]}须有 1–15 段`);
    let last = 0;
    return { key: l.key, name: LINES[li][1], stages: l.stages.map(s => {
      const at = `${LINES[li][1]} ${s?.id ?? '?'}`;
      if (typeof s?.id !== 'string' || !/^[A-Z][0-9]{1,2}$/.test(s.id) || ids.has(s.id)) bad(`${at}：编号须是不重复的「大写字母 + 数字」`);
      ids.add(s.id);
      if (!text(s.short, 12) || !text(s.title, 40) || !text(s.goal, 300)) bad(`${at}：简称（12 字内）、名称（40 字内）、目标（300 字内）必填`);
      if (!span(s.d) || s.d[0] <= last) bad(`${at}：工作日须是 [起, 止]，在第 1–400 天内，并排在上一段之后`);
      last = s.d[1];
      if (s.review !== undefined && (!text(s.review, 20) || !text(s.pass, 100))) bad(`${at}：评审节点须写名称和合格标准`);
      if (s.with !== undefined && (li !== 1 || !bizIds.has(s.with))) bad(`${at}：同期业务阶段须是业务线上已有的段`);
      if (!Array.isArray(s.steps) || s.steps.length > 10) bad(`${at}：安排最多 10 条`);
      const steps = s.steps.map(x => {
        if (!text(x?.text, 60)) bad(`${at}：每条安排须有文字（60 字内）`);
        if (x.d !== undefined && (!span(x.d) || x.d[0] < s.d[0] || x.d[1] > s.d[1])) bad(`${at}：「${x.text}」的日期须在本段 D${s.d[0]}–D${s.d[1]} 之内`);
        return { ...(x.d && { d: [...x.d] }), text: x.text.trim() };
      });
      if (!Array.isArray(s.out) || s.out.length > 8 || s.out.some(o => !text(o, 60)) || new Set(s.out).size !== s.out.length) bad(`${at}：产出最多 8 条、不重复，每条 60 字内`);
      return { id: s.id, short: s.short.trim(), title: s.title.trim(), d: [...s.d], ...(s.review && { review: s.review.trim(), pass: s.pass.trim() }), ...(s.with && { with: s.with }),
        goal: s.goal.trim(), steps, out: s.out.map(o => o.trim()) };
    }) };
  });
  return { version: 2, plan: { id: plan.id, name: plan.name, ...(plan.source && { source: plan.source }) }, start: def.start, pass: def.pass, reviewer: def.reviewer.trim(), lines };
}

// 从模板生成一个人的路径
export function pathFromPlan(planId, start, reviewer = '常浩') {
  const plan = PLANS[planId];
  if (!plan) throw failure(400, '没有这份培养方案');
  return validatePath({ start, pass: plan.pass, reviewer, plan: { id: plan.id, name: plan.name, source: plan.source }, lines: structuredClone(plan.lines) });
}

const stagesOf = def => def.lines.flatMap(l => l.stages);
const lastDay = def => Math.max(...def.lines.map(l => l.stages.at(-1).d[1]));

// 路径 + 进度记录 + 今天 → 页面要的样子。完成：评审段结论为「通过」，其余段带教已确认完成。
// 每条线第一段没完成的是「正在做」，其后都是「未开始」；正在做的段过了计划结束日，late 是超出的工作日数。
export function derivePath(def, records = {}, today) {
  const end = lastDay(def), todayD = dayIndex(def.start, today);
  const calendar = workdays(def.start, Math.max(end, todayD));
  const dates = ([a, b]) => [calendar[a - 1], calendar[b - 1]];
  const lines = def.lines.map(l => {
    let open = true;
    return { ...l, stages: l.stages.map(s => {
      const r = records[s.id], done = r?.kind === 'complete' || (r?.kind === 'review' && r.result === 'pass');
      const status = done ? 'done' : open ? 'doing' : 'todo';
      if (!done) open = false;
      return { ...s, dates: dates(s.d), steps: s.steps.map(x => ({ ...x, ...(x.d && { dates: dates(x.d) }) })), status,
        late: status === 'doing' && todayD > s.d[1] ? todayD - s.d[1] : 0, record: r ? strip(r) : null };
    }) };
  });
  return { version: 2, plan: def.plan, start: def.start, pass: def.pass, reviewer: def.reviewer, days: end, end: calendar[end - 1], todayD, calendar,
    missingYears: missingYears(def.start, calendar.at(-1)), lines };
}

// 进度记录请求 → 要存的记录。评审段：{ kind: 'review', score: 0–100, result: pass | retest | fail, note, at }，「通过」须达到合格分；
// 其余段：{ kind: 'complete', note, at }。at 是实际发生的日期（补录可以填过去），不能晚于今天；旧记录进 history（最近 20 条）。
export function stageRecord(s, body, before, { pass, today, now, name }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure(400, '进度记录须是对象');
  const { kind, score, result, note = '', at } = body;
  if (s.review ? kind !== 'review' : kind !== 'complete') throw failure(400, s.review ? `${s.id} 是评审节点，须记分数和结论` : `${s.id} 不是评审节点，由带教确认完成`);
  if (!ymd(at) || at > today) throw failure(400, '日期须是 YYYY-MM-DD，且不晚于今天');
  if (typeof note !== 'string' || note.length > 200) throw failure(400, '备注最多 200 字');
  let rec = { name, stage: s.id, kind, at, ...(note.trim() && { note: note.trim() }) };
  if (kind === 'review') {
    if (!Number.isInteger(score) || score < 0 || score > 100) throw failure(400, '分数须是 0–100 的整数');
    if (!RESULTS.includes(result)) throw failure(400, '结论须是通过、限期复核或不通过');
    if (result === 'pass' && score < pass) throw failure(400, `「通过」须达到 ${pass} 分`);
    rec = { ...rec, score, result };
  }
  if (before && same(rec, { name: before.name, stage: before.stage, kind: before.kind, at: before.at, ...(before.note && { note: before.note }), ...(before.kind === 'review' && { score: before.score, result: before.result }) })) throw failure(400, '没有改动');
  const history = before ? [...(before.history || []), strip(before)].slice(-20) : [];
  return { ...rec, recordedAt: new Date(now).toISOString(), ...(history.length && { history }) };
}

// 调整安排：只能改入职日和各段的日期、文字，段落不增不删、编号和顺序不变（进度记录按编号对应）。返回要存的路径和改了哪些。
export function editedPath(before, body) {
  if (!body || typeof body !== 'object') throw failure(400, '调整内容须是对象');
  const next = validatePath({ ...before, start: body.start ?? before.start, lines: body.lines ?? before.lines });
  const ids = d => d.lines.map(l => l.stages.map(s => s.id).join(','));
  if (!same(ids(before), ids(next))) throw failure(400, '只能改日期和安排文字，段落不能增删或换顺序');
  const was = Object.fromEntries(stagesOf(before).map(s => [s.id, s]));
  const moved = stagesOf(next).filter(s => !same(s.d, was[s.id].d)).map(s => s.id);
  const words = s => [s.short, s.title, s.goal, s.out, s.steps.map(x => x.text), s.review, s.pass];   // 日期以外的文字
  const edited = stagesOf(next).filter(s => !same(words(s), words(was[s.id]))).map(s => s.id);
  if (next.start === before.start && !moved.length && !edited.length) throw failure(400, '没有改动');
  return { next, moved, edited };
}

export function createMentorPathService(db, { now = Date.now } = {}) {
  const changes = createLocalChanges(db, { now });
  const adds = new Map();   // 加人的预览：previewId → 姓名（确认时名单和路径一起写）
  const today = () => beijingText(now()).slice(0, 10);
  const roster = () => mentorConfig(getSettings(db));
  const recordsOf = name => Object.fromEntries(listRecords(db, STAGE_KIND).filter(r => r.name === name).map(r => [r.stage, r]));
  const pathOf = name => {
    if (!roster().some(s => s.name === name)) throw failure(404, '带教名单里没有这个人');
    const def = getRecord(db, PATH_KIND, name);
    if (!def?.version) throw failure(404, '这个人还没有培养路径');
    return def;
  };
  const view = name => { const def = getRecord(db, PATH_KIND, name); return def?.version ? derivePath(def, recordsOf(name), today()) : null; };
  // 预览后这个人的路径或任何进度记录变了，确认时要重新预览
  const guard = name => { const seen = fingerprint([getRecord(db, PATH_KIND, name), recordsOf(name)]); return () => { if (fingerprint([getRecord(db, PATH_KIND, name), recordsOf(name)]) !== seen) throw failure(409, '培养路径或进度记录已变化，请重新预览'); }; };
  return {
    // 名单沿用带教来源；没有路径（或还是旧版按周的路径）的人 path 为 null。today 按北京时间给，页面不读浏览器时间。
    get() {
      return { today: today(), plans: Object.values(PLANS).map(({ id, name }) => ({ id, name })), trainees: roster().map(({ name, role, url }) => {
        const def = getRecord(db, PATH_KIND, name);
        return { name, role, hasLog: Boolean(url), path: view(name), ...(def && !def.version && { legacy: true }) };
      }) };
    },

    // 添加带教对象：{ name, role, start, logUrl?, plan } → 预览要写进名单的一条和整份路径；确认时两样一起写（同一个事务），写完回读。
    addPreview(body) {
      const { name, role = '管培生', start, logUrl = '', plan = DEFAULT_PLAN } = body || {};
      if (!text(name, 20)) throw failure(400, '姓名须填写，20 字内');
      if (!text(role, 20)) throw failure(400, '岗位 20 字内');
      if (!ymd(start)) throw failure(400, '入职日须是 YYYY-MM-DD');
      const list = roster();
      if (list.some(s => s.name === name.trim())) throw failure(409, '名单里已经有这个人');
      if (list.length >= MAX_PEOPLE) throw failure(400, `带教名单最多 ${MAX_PEOPLE} 人`);
      const entry = { name: name.trim(), role: role.trim(), year: Number(today().slice(0, 4)), ...(logUrl.trim() && { url: reportDocumentUrl(logUrl.trim()) }) };
      const value = pathFromPlan(plan, start);
      const validate = (v, current) => { if (current) throw failure(409, '这个人已经有培养路径'); if (roster().some(s => s.name === entry.name)) throw failure(409, '名单里已经有这个人'); };
      const pv = changes.preview(PATH_KIND, entry.name, value, { validate });
      adds.set(pv.previewId, entry);
      return { ...pv, entry, view: derivePath(value, {}, today()) };
    },
    addConfirm(body) {
      const entry = adds.get(body?.previewId);
      if (!entry) throw failure(409, '预览已失效，请重新预览');
      return changes.confirm(PATH_KIND, entry.name, body, { beforeCommit: () => {
        const list = roster();
        if (!list.some(s => s.name === entry.name)) {
          const saved = [...list.map(({ name, role, year, url }) => ({ name, role, year, ...(url && { url }) })), entry];
          saveSetting(db, 'mentor_sources', JSON.stringify(saved));
          if (!roster().some(s => s.name === entry.name)) throw failure(500, '名单写入后回读不一致');
        }
      } });
    },

    // 调整安排：整份提交改后的 { start, lines }，预览列出挪了日期、改了文字的段和结业日的变化
    planPreview(name, body) {
      const before = pathOf(name), { next, moved, edited } = editedPath(before, body);
      const value = { ...next, updatedAt: new Date(now()).toISOString(), history: [...(before.history || []), strip(before)].slice(-10) };
      const was = derivePath(before, recordsOf(name), today()), will = derivePath(value, recordsOf(name), today());
      return { ...changes.preview(PATH_KIND, name, value, { validate: guard(name) }), moved, edited, startChanged: next.start !== before.start, endBefore: was.end, endAfter: will.end, view: will };
    },
    planConfirm(name, body) { pathOf(name); return changes.confirm(PATH_KIND, name, body); },

    // 进度记录：评审段记分数和结论，其余段确认完成；{ clear: true } 撤销这一段的记录。返回写入后这个人的路径（回读按它核对）和状态会变的段。
    recordPreview(name, id, body) {
      const def = pathOf(name), s = stagesOf(def).find(x => x.id === id);
      if (!s) throw failure(404, '培养路径里没有这一段');
      const records = recordsOf(name), before = records[id] || null, key = `${name}:${id}`;
      const was = derivePath(def, records, today());
      let pv, after;
      if (body?.clear === true) {
        if (!before) throw failure(400, '这一段还没有记录');
        const { [id]: _, ...rest } = records;
        after = rest;
        pv = changes.preview(STAGE_KIND, key, null, { validate: guard(name), remove: true });
      } else {
        const value = stageRecord(s, body, before, { pass: def.pass, today: today(), now: now(), name });
        after = { ...records, [id]: value };
        pv = changes.preview(STAGE_KIND, key, value, { validate: guard(name) });
      }
      const will = derivePath(def, after, today()), status = v => Object.fromEntries(v.lines.flatMap(l => l.stages.map(x => [x.id, x])));
      const a = status(was), b = status(will);
      return { ...pv, view: will, effects: Object.keys(b).filter(k => a[k].status !== b[k].status).map(k => ({ id: k, title: b[k].title, from: a[k].status, to: b[k].status })) };
    },
    recordConfirm(name, id, body) { pathOf(name); return changes.confirm(STAGE_KIND, `${name}:${id}`, body); },

    // 导入（scripts/import-mentor-path.mjs）：给名单里已有的人按模板生成路径（替换旧版），先预览后确认；进度记录不动。
    importPreview(name, { start, plan = DEFAULT_PLAN }) {
      if (!roster().some(s => s.name === name)) throw failure(404, '带教名单里没有这个人，先在页面上添加');
      const value = pathFromPlan(plan, start), known = new Set(stagesOf(value).map(s => s.id));
      return { ...changes.preview(PATH_KIND, name, value), view: derivePath(value, recordsOf(name), today()), orphans: Object.keys(recordsOf(name)).filter(id => !known.has(id)) };
    },
    importConfirm(name, previewId) { return changes.confirm(PATH_KIND, name, { previewId, confirm: true }); },

    // 页面上「按方案生成路径」：{ start, plan } → 同导入；只给还没有路径（或还是旧版按周的路径）的人用，已有新版路径的改日期和安排走调整安排
    generatePreview(name, body) {
      if (getRecord(db, PATH_KIND, name)?.version) throw failure(409, '这个人已经有培养路径，改日期和安排请用「调整安排」');
      return this.importPreview(name, body || {});
    },
  };
}
