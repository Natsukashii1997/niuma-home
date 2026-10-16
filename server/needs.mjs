import { createHash, randomUUID } from 'node:crypto';
import { failure, requireMonth } from './v3-common.mjs';
import { listRecords } from './local-records.mjs';

// 本批规则来自 V3 派单指定的 SAMPLE_NEEDS.map；ok=false 保留待确认含义。
export const EVENT_NEED_MAP = [
  { type: '选课', lead: 7, need: '选课规划、课程难度评估', pain: '怕选错课拖 GPA；抢课窗口短', todo: '整理学位要求、列备选课表', ok: true },
  { type: '开学', lead: 14, need: '新学期适应、先修课补基础', pain: '进度快、听不懂第一周的课', todo: '领取课程大纲、标出难点周', ok: true },
  { type: 'Final', lead: 14, need: '期末冲刺、薄弱科目集中补', pain: '复习材料多、时间碎', todo: '列考试日程、排冲刺计划', ok: true },
  { type: '出分', lead: 0, need: '成绩解读、补考或申诉判断', pain: '挂科焦虑，不清楚申诉流程', todo: '核对成绩单、确认申诉截止日', ok: true },
  { type: 'Essay 截止', lead: 10, need: '论文结构与引用规范', pain: '英式论文写法不熟', todo: '拿到题目、预约结构审读', ok: false },
  { type: '考试周', lead: 14, need: '考前串讲与真题训练', pain: '几门连考、时间不够', todo: '确认考试时间表、预约串讲', ok: false },
];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const offset = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const draftStrategy = need => ({ goal: `围绕${need.node}，帮助${need.seg}学生完成${need.todo}。`, actions: { 营销: [], 产品: [], 运营: [] } });

export function deriveNeeds(timeline, month) {
  requireMonth(month);
  const first = `${month}-01`, [year, mon] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
  const groups = new Map();
  for (const event of timeline.agenda) {
    if (event.flag) continue;
    const rule = EVENT_NEED_MAP.find(r => r.type === event.type);
    if (!rule || offset(event.from, -rule.lead) > last || event.to < first) continue;
    const key = `${event.c}|${timeline.stage}|${rule.type}`;
    if (!groups.has(key)) groups.set(key, { rule, events: [] });
    groups.get(key).events.push(event);
  }
  return [...groups.entries()].map(([key, { rule, events }]) => {
    events.sort((a, b) => a.src.localeCompare(b.src) || a.from.localeCompare(b.from));
    const schools = new Set(events.map(e => e.school)).size;
    const from = events.map(e => e.from).sort()[0], to = events.map(e => e.to).sort().at(-1);
    const id = hash([month, key]).slice(0, 20);
    return { fingerprint: hash([rule, events]), need: {
      id, seg: `${events[0].c} · ${timeline.stage}`, node: rule.type, when: `${from} → ${to}`, schools,
      need: rule.need, pain: rule.pain, todo: rule.todo,
      source: `时间线 · ${schools} 校 · ${events.map(e => e.src).join(' / ')}${rule.ok ? '' : ' · 事件映射待确认'}`,
      status: '草稿', links: '',
    } };
  }).sort((a, b) => a.need.when.localeCompare(b.need.when) || a.need.id.localeCompare(b.need.id));
}

function stored(db, id) { return db.prepare('SELECT * FROM v3_needs WHERE id=?').get(id); }
function recordVersion(row) { return row ? hash([row.source_fingerprint, row.payload, row.updated_at]) : null; }
function strategyValue(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.goal !== 'string' || value.goal.length > 2000 || !value.actions || typeof value.actions !== 'object') throw failure(400, '策略须包含 goal 和营销、产品、运营 actions');
  if (Object.keys(value).some(k => !['goal', 'actions'].includes(k)) || Object.keys(value.actions).some(k => !['营销', '产品', '运营'].includes(k))) throw failure(400, '策略包含不支持的字段');
  const result = { goal: value.goal.trim(), actions: {} };
  if (!result.goal) throw failure(400, '请填写一句策略目标');
  for (const area of ['营销', '产品', '运营']) {
    const list = value.actions[area];
    if (!Array.isArray(list) || list.length > 50 || list.some(a => !Array.isArray(a) || a.length !== 2 || a.some(s => typeof s !== 'string' || !s.trim() || s.length > 2000))) throw failure(400, '每项行动须为非空的 [做什么, 为什么]');
    result.actions[area] = list.map(a => a.map(s => s.trim()));
  }
  if (Object.values(result.actions).some(a => a.length) && !result.goal) throw failure(400, '填写行动时须同时填写策略目标');
  return result;
}

export function createNeedsService(db, timeline, { now = Date.now } = {}) {
  const previews = new Map();
  function cleanup() { for (const [id, p] of previews) if (p.expires <= now()) previews.delete(id); }
  async function derived(month, refresh = false) {
    requireMonth(month);
    const rows = deriveNeeds(await timeline({ refresh }), month);
    const manual = listRecords(db, 'selftalk-need').filter(item => item.month === month && item.need);
    return [...rows, ...manual.map(item => ({ need: item.need, fingerprint: hash(item) }))];
  }
  return {
    async list(month) {
      const rows = await derived(month), ids = new Set(rows.map(r => r.need.id));
      const needs = rows.map(({ need, fingerprint }) => {
        const old = stored(db, need.id);
        if (!old) return need;
        const saved = JSON.parse(old.payload);
        return old.source_fingerprint === fingerprint ? saved : { ...need, status: '待复核', strategy: saved.strategy, source: `${need.source} · 采纳后来源已变更` };
      });
      // 已采纳记录不会因源删除而无声消失；不再参与交付完成计数。
      for (const old of db.prepare('SELECT * FROM v3_needs WHERE month=?').all(month)) if (!ids.has(old.id)) {
        const saved = JSON.parse(old.payload);
        needs.push({ ...saved, status: '待复核', source: `${saved.source} · 当前时间线已无对应确定事件` });
      }
      return { month, needs, map: EVENT_NEED_MAP };
    },
    async preview(id, body) {
      cleanup();
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw failure(400, '请输入预览内容');
      const found = (await derived(body.month)).find(row => row.need.id === id);
      if (!found) throw failure(404, '需求不存在或来源已变化，请重新推导');
      const old = stored(db, id), saved = old && JSON.parse(old.payload);
      const strategy = body.strategy === undefined ? saved?.strategy || draftStrategy(found.need) : strategyValue(body.strategy);
      const need = { ...found.need, status: '已采纳', strategy };
      if (previews.size >= 100) throw failure(429, '预览过多，请稍后重新预览');
      const previewId = randomUUID(), expires = now() + 600_000;
      previews.set(previewId, { id, month: body.month, need, fingerprint: found.fingerprint, baseline: recordVersion(old), wasAdopted: saved?.status === '已采纳', expires });
      return { previewId, expiresAt: new Date(expires).toISOString(), need };
    },
    async confirm(id, body, strategyOnly = false) {
      cleanup();
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '须先预览，再明确确认');
      const p = previews.get(body.previewId);
      if (!p || p.id !== id) throw failure(409, '预览不存在或已过期，请重新预览');
      if (strategyOnly && !p.wasAdopted) throw failure(409, '只有已采纳需求可以修改策略');
      if (p.committed) return structuredClone(p.result);
      // 对照最近一次时间线快照（缓存过期会自动重读），不再每次确认都整份重读飞书：那样一次确认要等半分钟以上。
      // 来源在快照之后才变化的，同步后列表会把这条已采纳需求标成「待复核」，不会被当成确定事实。
      const fresh = (await derived(p.month)).find(r => r.need.id === id);
      if (p.committed) return structuredClone(p.result);
      if (!fresh || fresh.fingerprint !== p.fingerprint) throw failure(409, '时间线来源已变化，请重新预览后确认');
      if (recordVersion(stored(db, id)) !== p.baseline) throw failure(409, '需求已被其他操作修改，请重新预览');
      if (p.expires <= now()) throw failure(409, '预览已过期，请重新预览');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO v3_needs(id,month,source_fingerprint,payload,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_fingerprint=excluded.source_fingerprint,payload=excluded.payload,updated_at=excluded.updated_at')
          .run(id, p.month, p.fingerprint, JSON.stringify(p.need), new Date(now()).toISOString());
        const readback = JSON.parse(stored(db, id).payload);
        if (hash(readback) !== hash(p.need)) throw failure(500, '需求回读不一致，已回滚');
        db.exec('COMMIT'); p.result = readback; p.committed = true; return structuredClone(readback);
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
