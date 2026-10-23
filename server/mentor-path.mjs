import { getSettings } from './db.mjs';
import { mentorConfig } from './mentor.mjs';
import { createLocalChanges, fingerprint, getRecord, listRecords } from './local-records.mjs';
import { beijingText, failure } from './v3-common.mjs';

// 带教 · 培养路径（T14）：每位管培生一份路径定义（v3_documents kind=mentor-path，id=姓名），每关一条营地记录
// （kind=mentor-camp，id=姓名:关卡编号），只存工作台本地。状态、分数、待评分都由记录推出，不另存。
// 营地记录：{ name, node, todoDone: [事项原文], outLinks: { 产出物名: 链接 }, rubric: { 评分项名: { score, note } }, scoredAt?, outAt? }，
// 按名字对应定义；定义里改了措辞的条目视为没有记录。
export const PATH_KIND = 'mentor-path', CAMP_KIND = 'mentor-camp';
const LINE_KEYS = ['biz', 'ai'];
const text = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
const ymd = v => { const d = new Date(`${v}T00:00:00Z`); return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v); };

// 校验并整理路径定义，只保留约定字段；周次必须在赛季内、一关排在上一关之后，评分项权重合计 100。
export function validatePath(def) {
  const bad = msg => { throw failure(400, `培养路径定义有误：${msg}`); };
  if (!def || typeof def !== 'object' || Array.isArray(def)) bad('不是 JSON 对象');
  const s = def.season || {};
  if (!text(s.name, 50) || !ymd(s.start) || !Number.isInteger(s.weeks) || s.weeks < 4 || s.weeks > 52 || !Number.isInteger(s.pass) || s.pass < 1 || s.pass > 100 || ![s.rank, s.next, s.reviewer].every(v => text(v, 50))) bad('season 须有 name、start（YYYY-MM-DD 入职日）、weeks（4–52）、pass（1–100）、rank、next、reviewer');
  if (!Array.isArray(def.lines) || def.lines.length !== 2 || def.lines.some((l, i) => l?.key !== LINE_KEYS[i])) bad('lines 须依次是 biz（业务线）和 ai（AI 线）两条');
  const ids = new Set();
  const lines = def.lines.map(l => {
    if (!text(l.code, 4) || !text(l.name, 20) || !text(l.desc, 100) || !Array.isArray(l.nodes) || !l.nodes.length || l.nodes.length > 12) bad(`${l.key} 线须有 code、name、desc 和 1–12 关`);
    let last = 0;
    return { key: l.key, code: l.code, name: l.name, desc: l.desc, nodes: l.nodes.map(n => {
      const at = `${l.key} 线 ${n?.id ?? '?'}`;
      if (typeof n?.id !== 'string' || !/^[A-Z][0-9]{1,2}$/.test(n.id) || ids.has(n.id)) bad(`${at}：id 须是不重复的「大写字母 + 数字」`);
      ids.add(n.id);
      if (!text(n.stage, 20) || !text(n.title, 40) || !text(n.goal, 300)) bad(`${at}：stage、title、goal 必填`);
      const [a, b] = Array.isArray(n.week) ? n.week : [];
      if (!Number.isInteger(a) || !Number.isInteger(b) || a <= last || a > b || b > s.weeks) bad(`${at}：week 须是 [起, 止]，在第 1–${s.weeks} 周内，且排在上一关之后`);
      last = b;
      const list = (v, max, what) => { if (!Array.isArray(v) || !v.length || v.length > 8 || v.some(x => !text(x, max)) || new Set(v).size !== v.length) bad(`${at}：${what}须是 1–8 条不重复的文字`); return [...v]; };
      const todo = list(n.todo, 100, '要做的事'), output = list(n.output, 60, '产出物');
      const r = n.rubric;
      if (!Array.isArray(r) || !r.length || r.length > 6 || r.some(x => !text(x?.name, 60) || !Number.isInteger(x.weight) || x.weight < 1) || new Set(r.map(x => x.name)).size !== r.length || r.reduce((t, x) => t + x.weight, 0) !== 100) bad(`${at}：评分项须不重名、权重为正整数且合计 100`);
      return { id: n.id, stage: n.stage, title: n.title, week: [a, b], ...(n.boss === true && { boss: true }), goal: n.goal, todo, output, rubric: r.map(x => ({ name: x.name, weight: x.weight })) };
    }) };
  });
  const lineOf = id => lines.find(l => l.nodes.some(n => n.id === id))?.key;
  if (!Array.isArray(def.links ?? [])) bad('links 须是数组');
  const links = (def.links ?? []).map(k => {
    if (!lineOf(k?.from) || !lineOf(k?.to) || lineOf(k.from) === lineOf(k.to) || !text(k.note, 30)) bad(`跨线依赖 ${k?.from}→${k?.to} 须连接两条线上已有的关，并写明 note（前一关的哪份产出被用到）`);
    return { from: k.from, to: k.to, note: k.note };
  });
  const { name, start, weeks, pass, rank, next, reviewer } = s;
  return { season: { name, start, weeks, pass, rank, next, reviewer }, lines, links };
}

// 营地记录 → 页面要的关卡字段。分数 = 各评分项之和（定义里每一项都有分才算）；≥ 通关线即通关；
// 前一关和绳桥依赖都通关才解锁；待评分 = 进行中、交了产出，且还没评过或产出在最近一次评分之后又更新过。
export function derivePath(def, camps = {}) {
  const scoreOf = n => { const r = camps[n.id]?.rubric || {}, s = n.rubric.map(x => r[x.name]?.score); return s.every(Number.isInteger) ? s.reduce((t, v) => t + v, 0) : null; };
  const scores = Object.fromEntries(def.lines.flatMap(l => l.nodes.map(n => [n.id, scoreOf(n)])));
  const done = id => scores[id] != null && scores[id] >= def.season.pass;
  return { season: def.season, links: def.links, lines: def.lines.map(l => ({ ...l, nodes: l.nodes.map((n, i) => {
    const c = camps[n.id] || {}, score = scores[n.id];
    const open = (i === 0 || done(l.nodes[i - 1].id)) && def.links.every(k => k.to !== n.id || done(k.from));
    const status = done(n.id) ? 'done' : open ? 'doing' : 'locked';
    const outLinks = n.output.map(o => c.outLinks?.[o] || null), outDone = outLinks.filter(Boolean).length;
    const todoChecked = n.todo.map(t => Boolean(c.todoDone?.includes(t)));
    return { ...n, status, ...(score != null && { score }), ...(c.scoredAt && { at: beijingText(c.scoredAt).slice(5, 10) }),
      todoDone: todoChecked.filter(Boolean).length, todoChecked, outDone, outLinks,
      review: status === 'doing' && outDone > 0 && (!c.scoredAt || (c.outAt || '') > c.scoredAt),
      rubric: n.rubric.map(x => { const r = c.rubric?.[x.name]; return { ...x, ...(Number.isInteger(r?.score) && { score: r.score }), ...(r?.note && { note: r.note }) }; }) };
  }) })) };
}

// 营地记录请求 { todoDone: [事项原文], outLinks: { 产出物名: 链接 }, rubric: { 评分项名: { score, note } } } → 要存的记录。
// 每一项都打分才算一次评分，分数全部留空只更新进度；评分项（分数或评语）有改动才更新评分时间，产出物链接有改动才更新产出时间。
// 旧记录留在 history（最近 20 条），改评分可追溯。
export function campValue(n, body, before, at, name) {
  const obj = v => v && typeof v === 'object' && !Array.isArray(v);
  if (!obj(body)) throw failure(400, '营地记录须是对象');
  const { todoDone = [], outLinks = {}, rubric = {} } = body;
  if (!Array.isArray(todoDone) || todoDone.some(t => !n.todo.includes(t)) || new Set(todoDone).size !== todoDone.length) throw failure(400, '要做的事须是这一关里的事项');
  if (!obj(outLinks) || Object.entries(outLinks).some(([k, v]) => !n.output.includes(k) || typeof v !== 'string' || v.length > 500 || (v.trim() && !/^https?:\/\/\S+$/.test(v.trim())))) throw failure(400, '产出物须是这一关里的产出物，链接以 http:// 或 https:// 开头');
  if (!obj(rubric) || Object.entries(rubric).some(([k, v]) => !n.rubric.some(x => x.name === k) || !obj(v))) throw failure(400, '评分项须是这一关里的评分项');
  const items = n.rubric.map(x => {
    const score = rubric[x.name]?.score ?? null, note = rubric[x.name]?.note ?? '';
    if (score !== null && !(Number.isInteger(score) && score >= 0 && score <= x.weight)) throw failure(400, `「${x.name}」的分数须是 0–${x.weight} 的整数`);
    if (typeof note !== 'string' || note.length > 200) throw failure(400, '评语最多 200 字');
    return [x.name, score, note.trim()];
  });
  const filled = items.filter(([, s]) => s !== null).length;
  if (filled && filled < items.length) throw failure(400, '每一项都打分才算一次评分；只更新进度就把分数全部留空');
  const rec = { name, node: n.id, todoDone: n.todo.filter(t => todoDone.includes(t)),
    outLinks: Object.fromEntries(n.output.filter(o => outLinks[o]?.trim()).map(o => [o, outLinks[o].trim()])),
    rubric: Object.fromEntries(items.filter(([, s, note]) => s !== null || note).map(([k, s, note]) => [k, { ...(s !== null && { score: s }), ...(note && { note }) }])) };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const rubricChanged = !same(rec.rubric, before?.rubric ?? {}), outChanged = !same(rec.outLinks, before?.outLinks ?? {});
  if (!rubricChanged && !outChanged && same(rec.todoDone, before?.todoDone ?? [])) throw failure(400, '没有改动');
  const scoredAt = rubricChanged ? (filled ? at : null) : before?.scoredAt, outAt = outChanged ? at : before?.outAt;
  const history = before ? [...(before.history || []), (({ history, ...rest }) => rest)(before)].slice(-20) : [];
  return { ...rec, ...(scoredAt && { scoredAt }), ...(outAt && { outAt }), updatedAt: at, ...(history.length && { history }) };
}

export function createMentorPathService(db, { now = Date.now } = {}) {
  const changes = createLocalChanges(db, { now });
  const campsOf = name => Object.fromEntries(listRecords(db, CAMP_KIND).filter(c => c.name === name).map(c => [c.node, c]));
  const target = (name, id) => {
    const def = getRecord(db, PATH_KIND, name);
    if (!def || !mentorConfig(getSettings(db)).some(s => s.name === name)) throw failure(404, '这个人还没有培养路径');
    const n = def.lines.flatMap(l => l.nodes).find(x => x.id === id);
    if (!n) throw failure(404, '培养路径里没有这一关');
    return { def, n, key: `${name}:${id}` };
  };
  const nodesOf = p => Object.fromEntries(p.lines.flatMap(l => l.nodes.map(x => [x.id, x])));
  return {
    // 管培生名单沿用带教来源；没导入路径的人 path 为 null。today 按北京时间给，页面不读浏览器时间。
    get() {
      return { today: beijingText(now()).slice(0, 10), trainees: mentorConfig(getSettings(db)).map(({ name, role }) => {
        const def = getRecord(db, PATH_KIND, name);
        return { name, role, path: def ? derivePath(def, campsOf(name)) : null };
      }) };
    },
    // 导入 / 替换某人的路径定义（scripts/import-mentor-path.mjs）：先预览，确认后写入并回读；营地记录不动。
    importPreview(name, def, source) {
      if (!text(name, 50)) throw failure(400, '姓名无效');
      const value = { ...validatePath(def), source };
      const known = new Set(value.lines.flatMap(l => l.nodes.map(n => n.id)));
      return { ...changes.preview(PATH_KIND, name, value), inMentorList: mentorConfig(getSettings(db)).some(s => s.name === name), orphans: Object.keys(campsOf(name)).filter(id => !known.has(id)) };
    },
    importConfirm(name, previewId) { return changes.confirm(PATH_KIND, name, { previewId, confirm: true }); },
    // 营地记录预览：返回要存的记录、这一关写入后的样子（回读按它核对），以及哪些关的状态会跟着变。
    // 确认时路径定义或这个人的任何营地记录变了，都要重新预览。
    recordPreview(name, id, body) {
      const { def, n, key } = target(name, id), camps = campsOf(name), before = camps[id] || null;
      const value = campValue(n, body, before, new Date(now()).toISOString(), name);
      const was = nodesOf(derivePath(def, camps)), will = nodesOf(derivePath(def, { ...camps, [id]: value }));
      if (was[id].status === 'locked') throw failure(409, '这一关还没解锁，不能评分');
      const seen = fingerprint([def, camps]);
      const validate = () => { if (fingerprint([getRecord(db, PATH_KIND, name), campsOf(name)]) !== seen) throw failure(409, '培养路径或营地记录已变化，请重新预览'); };
      return { ...changes.preview(CAMP_KIND, key, value, { validate }), scored: (value.scoredAt ?? null) !== (before?.scoredAt ?? null), node: will[id],
        effects: Object.keys(will).filter(k => was[k].status !== will[k].status).map(k => ({ id: k, title: will[k].title, from: was[k].status, to: will[k].status })) };
    },
    recordConfirm(name, id, body) { return changes.confirm(CAMP_KIND, target(name, id).key, body); },
  };
}
