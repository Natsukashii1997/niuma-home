// 月度用户策略 v2 的事实、提交与确认（docs/策略规则/03-Schema-v2.md 第 4、7 节；04 第 6 节；07）。
// 流程：skill 用只读工具取事实 → strategy_submit 只能创建 submission → 常浩在页面预览、确认 → 不可变 revision。
// 确认接口只给页面用，不进智能体工具；AI 自报的执行方、模型只作声明，服务端另记凭据对应的 agent 与时间。
import { randomUUID } from 'node:crypto';
import { failure, requireMonth } from './v3-common.mjs';
import { createLocalChanges, fingerprint, getRecord } from './local-records.mjs';
import { buildEvidence } from './strategy-evidence.mjs';
import { LIFECYCLE_VERSION, lifecycleWindows, regionCoverage } from './strategy-lifecycle.mjs';
import { BARRIER_RELATIONS, SCHEMA_VERSION, SOURCE_IDS, validateStrategyDoc } from './strategy-validate.mjs';

export const RULE_VERSIONS = { sources: 'sources-v1.1', barrier: 'barrier-v2.1', lifecycle: LIFECYCLE_VERSION, scout: 'scout-v1.1', quality: 'quality-v1', bizcard: 'bizcard-v1' };
export const BIZCARD_KIND = 'strategy-bizcard';
const BIZCARD_FIELDS = ['本月重要变化', '用户观察', '存量用户情况', '产品与资源约束', '负责人特别判断'];
const BIZ_STRENGTH = { 事实记录: 'strong', 业务观察: 'partial', 管理判断: 'weak' };
const short = value => fingerprint(value).slice(0, 16);
const fail = (status, message, extra) => Object.assign(failure(status, message), extra);
const nextMonth = month => { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const parseRevision = row => row ? { ...row, content: JSON.parse(row.content), inputs: JSON.parse(row.inputs), segment_index: JSON.parse(row.segment_index || '{}') } : null;

// 业务背景卡条目 → business 类 Evidence（07 第 2 节）。身份 = 月份 + 字段 + 条目序号；版本 = 原文 + 类型 + 依据。
export function bizcardEvidence(month, card) {
  const out = [];
  for (const field of BIZCARD_FIELDS) (card?.[field] || []).forEach((entry, i) => out.push({
    evidenceId: `EV-${short(['bizcard', month, field, i])}`, evidenceVersion: short([entry.text, entry.type, entry.basis]),
    kind: 'business', sourceId: 'SRC-bizcard', field, text: entry.text, bizType: entry.type, strength: BIZ_STRENGTH[entry.type], basis: entry.basis, ambiguous: false,
    source: { ref: `${month}·${field}#${i + 1}`, raw: entry.text, snapshot: '' },
  }));
  return out;
}
function checkBizcard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) throw failure(400, '背景卡须为对象');
  for (const [field, entries] of Object.entries(card)) {
    if (!BIZCARD_FIELDS.includes(field)) throw failure(400, `背景卡没有「${field}」这个字段`);
    if (!Array.isArray(entries)) throw failure(400, `「${field}」须为条目数组`);
    for (const e of entries) {
      if (!e || typeof e.text !== 'string' || !e.text.trim()) throw failure(400, `「${field}」有空条目`);
      if (!BIZ_STRENGTH[e.type]) throw failure(400, `「${field}」的条目类型须为 事实记录 / 业务观察 / 管理判断`);
      if (e.type === '事实记录' && !String(e.basis || '').trim()) throw failure(400, '事实记录须写明记录出处');
    }
  }
}

export function createStrategyService(db, { readTimeline, now = Date.now } = {}) {
  const stamp = () => new Date(now()).toISOString();
  const bizcards = createLocalChanges(db, { now });
  const current = month => parseRevision(db.prepare('SELECT * FROM strategy_revisions WHERE month=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(month));
  const submissionRow = id => db.prepare('SELECT * FROM strategy_submissions WHERE id=?').get(id);

  // 当前事实：时间线 Evidence（上一版 revision 的片段索引用于判定 ambiguous）+ 背景卡 Evidence + 窗口 + 覆盖率。
  async function facts(month) {
    requireMonth(month);
    const timeline = await readTimeline();
    if (!timeline?.cellIndex) throw fail(409, '时间线快照缺少原格信息，请先在时间线页同步一次', { code: 'TIMELINE_RESYNC' });
    const snapshot = short([timeline.syncedAt, timeline.agenda, timeline.anomalies?.map(a => [a.src, a.a, a.ruling, a.verification])]);
    const rev = current(month);
    const built = buildEvidence(timeline, { previous: rev?.segment_index ?? {}, snapshot });
    const card = getRecord(db, BIZCARD_KIND, month);
    const evidence = [...built.evidence, ...bizcardEvidence(month, card)];
    const windows = lifecycleWindows(built.evidence);
    const coverage = regionCoverage(timeline, built.evidence, windows, month);
    const inputFingerprint = short([snapshot, card ? short(card) : null, RULE_VERSIONS]);
    return { month, snapshot, inputFingerprint, baseRevision: rev?.id ?? null, evidence, windows, coverage, anomalies: built.anomalies, segmentIndex: built.segmentIndex, bizcard: card };
  }

  // 给 skill 看的精简视图：只列与目标月相关的事件（窗口与「目标月 + 下月前 14 天」重叠，或月份落在其中）。
  async function factsView(month) {
    const f = await facts(month);
    const from = `${month}-01`, to = `${nextMonth(month)}-14`, months = [month, nextMonth(month)];
    const byId = new Map(f.windows.map(w => [w.evidenceId, w]));
    const near = w => w && [w.need, w.action].some(x => x && x.from <= to && x.to >= from);
    const evidence = f.evidence.filter(e => e.kind !== 'timeline' || near(byId.get(e.evidenceId)) || (e.dates.from && e.dates.from <= to && e.dates.to >= from) || e.dates.months?.some(m => months.includes(m)));
    return { month, schemaVersion: SCHEMA_VERSION, inputFingerprint: f.inputFingerprint, baseRevision: f.baseRevision, rules: { versions: RULE_VERSIONS, sources: SOURCE_IDS, barriers: BARRIER_RELATIONS },
      coverage: f.coverage, evidence, windows: evidence.map(e => byId.get(e.evidenceId)).filter(Boolean),
      anomalies: f.anomalies, bizcard: f.bizcard, revision: f.baseRevision ? current(month).content : null };
  }

  // 校验：结构与不变量（03）+ 覆盖率与服务端重算一致 + 07 第 3 节续费降级。
  function check(doc, f) {
    const result = validateStrategyDoc(doc, { evidence: f.evidence });
    for (const r of doc.regions || []) {
      const c = f.coverage[r.key];
      if (c && r.activity && (r.activity.value !== c.value || r.activity.status !== c.status || (r.activity.ratio ?? null) !== c.ratio)) result.errors.push({ rule: '05 §6', at: `regions.${r.key}`, message: `覆盖率须与服务端重算一致（${c.value}，${c.ratio ?? '无'}）` });
    }
    if (!(f.bizcard?.['存量用户情况'] || []).length) {
      for (const c of doc.claims || []) if (['barrier', 'readiness'].includes(c.claimType) && c.targetRelation === '续费' && c.status !== 'unknown')
        result.errors.push({ rule: '07 §3', at: c.id, message: '背景卡没有存量用户情况时，续费的障碍和购买准备度须为 unknown' });
      for (const s of doc.scenarios || []) if (s.targetRelation === '续费' && s.observedRelation?.value !== 'unknown')
        result.errors.push({ rule: '07 §3', at: s.id, message: '背景卡没有存量用户情况时，续费情境的实际关系须为 unknown' });
    }
    return result;
  }
  // I-09：submission 对常浩手写内容（origin=manual）的改动单列，确认时逐条决定。
  function manualChanges(doc, base) {
    const mine = (base?.content.claims || []).filter(c => c.origin === 'manual');
    return mine.map(c => ({ id: c.id, before: c, after: (doc.claims || []).find(x => x.id === c.id) ?? null }))
      .filter(x => fingerprint(x.before) !== fingerprint(x.after));
  }
  const diff = (a = [], b = []) => {
    const before = new Map(a.map(x => [x.id, x])), after = new Map(b.map(x => [x.id, x]));
    return { added: [...after.keys()].filter(k => !before.has(k)), removed: [...before.keys()].filter(k => !after.has(k)),
      changed: [...after.keys()].filter(k => before.has(k) && fingerprint(before.get(k)) !== fingerprint(after.get(k))) };
  };
  const summary = row => ({ id: row.id, month: row.month, state: row.state, agent: row.agent, declared: JSON.parse(row.declared || 'null'), baseRevision: row.base_revision, submittedAt: row.submitted_at, decidedAt: row.decided_at, decidedFrom: row.decided_from });

  return {
    facts, factsView,

    // strategy_submit：只能创建 submission。agent 来自凭据，declared 只是 AI 自报。
    async submit({ month, document, idempotencyKey, baseRevision = null, inputFingerprint, declared = null } = {}, { agent } = {}) {
      requireMonth(month);
      if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 200) throw failure(400, '须给出 idempotencyKey');
      if (!document || typeof document !== 'object' || document.month !== month) throw failure(400, 'document 须为该月的月度文档');
      const contentHash = fingerprint(document);
      const existing = db.prepare('SELECT * FROM strategy_submissions WHERE idempotency_key=?').get(idempotencyKey);
      if (existing) {
        if (existing.content_hash === contentHash && existing.month === month) return { ...summary(existing), repeated: true };
        throw fail(409, '同一 idempotencyKey 已提交过不同内容；新内容未保存，请换一个 idempotencyKey', { code: 'IDEMPOTENCY_CONFLICT' });
      }
      const f = await facts(month);
      const { errors, warnings } = check(document, f);
      if (errors.length) throw fail(422, `校验未通过，未保存：${errors.slice(0, 8).map(e => `${e.rule} ${e.at}：${e.message}`).join('；')}`, { code: 'STRATEGY_INVALID', errors, warnings });
      const id = `SUB-${month}-${randomUUID().slice(0, 8)}`;
      db.prepare('INSERT INTO strategy_submissions (id,month,agent,declared,base_revision,input_fingerprint,schema_version,idempotency_key,content,content_hash,warnings,submitted_at,state) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, month, agent || 'unknown', JSON.stringify(declared), baseRevision, String(inputFingerprint || ''), String(document.schemaVersion || ''), idempotencyKey, JSON.stringify(document), contentHash, JSON.stringify(warnings), stamp(), 'pending');
      return { ...summary(submissionRow(id)), warnings, stale: baseRevision !== f.baseRevision || inputFingerprint !== f.inputFingerprint };
    },
    submission(id) { const row = submissionRow(id); if (!row) throw failure(404, '没有这个 submission'); return summary(row); },

    // 页面：当月正式版本与待确认提交。
    get(month) {
      requireMonth(month);
      const rev = current(month);
      return { month, revision: rev && { id: rev.id, content: rev.content, createdAt: rev.created_at, confirmedFrom: rev.confirmed_from, submissionId: rev.submission_id, inputs: rev.inputs },
        submissions: db.prepare("SELECT * FROM strategy_submissions WHERE month=? AND state='pending' ORDER BY submitted_at").all(month).map(summary),
        bizcard: getRecord(db, BIZCARD_KIND, month) };
    },
    revisions(month) {
      requireMonth(month);
      return db.prepare('SELECT id,month,submission_id,confirmed_by,confirmed_from,created_at FROM strategy_revisions WHERE month=? ORDER BY created_at DESC, rowid DESC').all(month);
    },
    async preview(id) {
      const row = submissionRow(id);
      if (!row) throw failure(404, '没有这个 submission');
      const doc = JSON.parse(row.content), base = current(row.month), f = await facts(row.month);
      const { errors, warnings, changed } = check(doc, f);
      const stale = row.base_revision !== f.baseRevision || row.input_fingerprint !== f.inputFingerprint || row.schema_version !== SCHEMA_VERSION;
      return { submission: summary(row), document: doc, stale, errors, warnings, changed, manualChanges: manualChanges(doc, base),
        diff: { scenarios: diff(base?.content.scenarios, doc.scenarios), claims: diff(base?.content.claims, doc.claims) } };
    },

    // 页面确认：版本绑定不一致转 stale；手写内容只有常浩逐条接受的才被替换；写入不可变 revision。
    async confirm(id, body = {}, { from = 'page' } = {}) {
      const row = submissionRow(id);
      if (!row) throw failure(404, '没有这个 submission');
      if (body.confirm !== true) throw failure(400, '请先预览，再明确确认');
      if (row.state !== 'pending') throw failure(409, `submission 已是 ${row.state}，不能确认`);
      const f = await facts(row.month);
      if (row.base_revision !== f.baseRevision || row.input_fingerprint !== f.inputFingerprint || row.schema_version !== SCHEMA_VERSION) {
        db.prepare("UPDATE strategy_submissions SET state='stale', decided_at=? WHERE id=?").run(stamp(), id);
        throw fail(409, '基础版本、输入或 schema 已变化，submission 已过期，请让 skill 重新生成后预览', { code: 'SUBMISSION_STALE' });
      }
      const doc = JSON.parse(row.content), base = current(row.month);
      const accept = new Set(Array.isArray(body.acceptManual) ? body.acceptManual : []);
      for (const m of manualChanges(doc, base)) {
        if (accept.has(m.id)) continue;
        const i = doc.claims.findIndex(c => c.id === m.id);
        if (i >= 0) doc.claims[i] = m.before; else doc.claims.push(m.before);
      }
      const { errors } = check(doc, f);
      if (errors.length) throw fail(422, `确认前复核未通过：${errors.slice(0, 8).map(e => `${e.rule} ${e.at}：${e.message}`).join('；')}`, { code: 'STRATEGY_INVALID', errors });
      const revId = `REV-${row.month}-${db.prepare('SELECT COUNT(*) n FROM strategy_revisions WHERE month=?').get(row.month).n + 1}`;
      const inputs = { timelineSnapshot: f.snapshot, inputFingerprint: f.inputFingerprint, bizcard: f.bizcard ? short(f.bizcard) : null, rules: RULE_VERSIONS,
        evidenceVersions: Object.fromEntries(f.evidence.filter(e => JSON.stringify(doc).includes(e.evidenceId)).map(e => [e.evidenceId, e.evidenceVersion])) };
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('INSERT INTO strategy_revisions (id,month,schema_version,content,content_hash,inputs,segment_index,submission_id,confirmed_by,confirmed_from,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
          .run(revId, row.month, SCHEMA_VERSION, JSON.stringify(doc), fingerprint(doc), JSON.stringify(inputs), JSON.stringify(f.segmentIndex), id, '常浩', from, stamp());
        db.prepare("UPDATE strategy_submissions SET state='confirmed', decided_at=?, decided_from=? WHERE id=?").run(stamp(), from, id);
        db.prepare("UPDATE strategy_submissions SET state='stale', decided_at=? WHERE month=? AND state='pending' AND id<>?").run(stamp(), row.month, id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      const saved = current(row.month);
      if (saved.id !== revId || saved.content_hash !== fingerprint(doc)) throw failure(500, '写入后回读不一致');
      return { revision: { id: revId, createdAt: saved.created_at }, keptManual: manualChanges(JSON.parse(row.content), base).map(m => m.id).filter(x => !accept.has(x)) };
    },
    reject(id, { from = 'page' } = {}) {
      const row = submissionRow(id);
      if (!row) throw failure(404, '没有这个 submission');
      if (row.state !== 'pending') throw failure(409, `submission 已是 ${row.state}，不能拒绝`);
      db.prepare("UPDATE strategy_submissions SET state='rejected', decided_at=?, decided_from=? WHERE id=?").run(stamp(), from, id);
      return summary(submissionRow(id));
    },

    // 业务背景卡：先预览、后确认（07）。
    previewBizcard(month, card) { requireMonth(month); checkBizcard(card); return bizcards.preview(BIZCARD_KIND, month, card); },
    confirmBizcard(month, body) { requireMonth(month); return bizcards.confirm(BIZCARD_KIND, month, body); },
  };
}
