// 月度用户策略 v2 的事实、提交与确认（docs/策略规则/03-Schema-v2.md 第 4、7 节；04 第 6 节；07）。
// 流程：skill 用只读工具取事实 → strategy_submit 只能创建 submission → 常浩在页面预览、确认 → 不可变 revision。
// 确认接口只给页面用，不进智能体工具；AI 自报的执行方、模型只作声明，服务端另记凭据对应的 agent 与时间。
import { randomUUID } from 'node:crypto';
import { REVISION_NO_DELETE_TRIGGER } from './db.mjs';
import { failure, requireMonth } from './v3-common.mjs';
import { createLocalChanges, fingerprint, getRecord } from './local-records.mjs';
import { buildEvidence, KNOWN_COUNTRIES } from './strategy-evidence.mjs';
import { LIFECYCLE_VERSION, lifecycleWindows, regionCoverage } from './strategy-lifecycle.mjs';
import { BARRIER_RELATIONS, SCHEMA_VERSION, SOURCE_IDS, validateStrategyDoc } from './strategy-validate.mjs';

export const RULE_VERSIONS = { sources: 'sources-v1.1', barrier: 'barrier-v2.1', lifecycle: LIFECYCLE_VERSION, scout: 'scout-v1.1', quality: 'quality-v1', baseline: 'baseline-v1' };
export const BIZCARD_KIND = 'strategy-bizcard';
const BIZCARD_FIELDS = ['本月重要变化', '用户观察', '存量用户情况', '产品与资源约束', '负责人特别判断'];
const BIZ_STRENGTH = { 事实记录: 'strong', 业务观察: 'partial', 管理判断: 'weak' };
const BIZ_RELATIONS = ['新签', '续费', '通用'];
const short = value => fingerprint(value).slice(0, 16);
const fail = (status, message, extra) => Object.assign(failure(status, message), extra);
const nextMonth = month => { const [y, m] = month.split('-').map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`; };
const parseRevision = row => row ? { ...row, content: JSON.parse(row.content), inputs: JSON.parse(row.inputs), segment_index: JSON.parse(row.segment_index || '{}') } : null;

// 业务背景卡条目 → business 类 Evidence（07 第 2 节）。身份 = 月份 + 字段 + 条目 id（保存时分配，删改别的条目不影响）；版本 = 原文 + 类型 + 依据 + 适用范围。
// 适用范围（countries、relation）只在填了时算进版本：没填的老条目版本不变，已引用它们的提交和版本不会因为这次加字段而「依据已变化」。
export function bizcardEvidence(month, card) {
  const out = [];
  for (const field of BIZCARD_FIELDS) for (const entry of card?.[field] || []) {
    const scope = { ...(entry.countries?.length && { countries: entry.countries }), ...(entry.relation && { relation: entry.relation }) };
    out.push({
      evidenceId: `EV-${short(['bizcard', month, field, entry.id])}`, evidenceVersion: short([entry.text, entry.type, entry.basis, ...(Object.keys(scope).length ? [scope] : [])]),
      kind: 'business', sourceId: 'SRC-bizcard', field, text: entry.text, bizType: entry.type, strength: BIZ_STRENGTH[entry.type], basis: entry.basis, ...scope, ambiguous: false,
      source: { ref: `${month}·${field}·${entry.id}`, raw: entry.text, snapshot: '' },
    });
  }
  return out;
}
// 条目的适用国家：可选；只收时间线认识的国家代码（和时间线 Evidence 的 country 同一套，英国写 uk）。
// 去重并排序：同一组国家点选顺序不同，不算依据变化；空数组按没填处理。
function bizCountries(field, list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list)) throw failure(400, `「${field}」的适用国家须为国家代码数组`);
  const out = [...new Set(list.map(c => String(c ?? '').trim().toLowerCase()).filter(Boolean))].sort();
  for (const c of out) {
    if (c === 'gb') throw failure(400, `「${field}」的适用国家里英国写 uk，不写 gb`);
    if (!KNOWN_COUNTRIES.has(c)) throw failure(400, `「${field}」的适用国家 ${c} 不是时间线认识的国家代码（${[...KNOWN_COUNTRIES].join(' / ')}）`);
  }
  return out;
}
// 校验背景卡并给新条目分配 id；已有 id 原样保留。
function normalizeBizcard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) throw failure(400, '背景卡须为对象');
  const out = {};
  for (const [field, entries] of Object.entries(card)) {
    if (!BIZCARD_FIELDS.includes(field)) throw failure(400, `背景卡没有「${field}」这个字段`);
    if (!Array.isArray(entries)) throw failure(400, `「${field}」须为条目数组`);
    out[field] = entries.map(e => {
      if (!e || typeof e.text !== 'string' || !e.text.trim()) throw failure(400, `「${field}」有空条目`);
      if (!BIZ_STRENGTH[e.type]) throw failure(400, `「${field}」的条目类型须为 事实记录 / 业务观察 / 管理判断`);
      if (e.type === '事实记录' && !String(e.basis || '').trim()) throw failure(400, '事实记录须写明记录出处');
      if (e.id !== undefined && !/^B-[0-9a-f]{8}$/.test(e.id)) throw failure(400, '条目 id 格式不对');
      const countries = bizCountries(field, e.countries);
      if (e.relation !== undefined && e.relation !== null && e.relation !== '' && !BIZ_RELATIONS.includes(e.relation)) throw failure(400, `「${field}」的适用人群须为 新签 / 续费 / 通用，或不填`);
      return { id: e.id || `B-${randomUUID().slice(0, 8)}`, text: e.text.trim(), type: e.type, ...(e.basis && { basis: String(e.basis).trim() }),
        ...(countries.length && { countries }), ...(e.relation && { relation: e.relation }) };
    });
  }
  return out;
}
// 文档里引用到的全部 Evidence ID。
const referenced = doc => {
  const ids = new Set();
  const walk = v => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) k === 'evidenceRefs' && Array.isArray(x) ? x.forEach(id => ids.add(id)) : walk(x); };
  walk(doc);
  return ids;
};
const issuesText = errors => errors.slice(0, 8).map(e => `${e.rule} ${e.at}：${e.message}`).join('；');

export function createStrategyService(db, { readTimeline, now = Date.now } = {}) {
  const stamp = () => new Date(now()).toISOString();
  const bizcards = createLocalChanges(db, { now });
  const current = month => parseRevision(db.prepare('SELECT * FROM strategy_revisions WHERE month=? ORDER BY created_at DESC, rowid DESC LIMIT 1').get(month));
  const submissionRow = id => db.prepare('SELECT * FROM strategy_submissions WHERE id=?').get(id);
  const mustSubmission = id => { const row = submissionRow(id); if (!row) throw failure(404, '没有这个 submission'); return row; };
  // 03 第 7 节：基础版本、输入指纹、schema 任一与当前不一致即过期。
  const isStale = (row, f) => row.base_revision !== f.baseRevision || row.input_fingerprint !== f.inputFingerprint || row.schema_version !== SCHEMA_VERSION;

  // 当前事实：时间线 Evidence（上一版 revision 的片段索引用于判定 ambiguous）+ 背景卡 Evidence + 窗口 + 覆盖率。
  async function facts(month) {
    requireMonth(month);
    const timeline = await readTimeline();
    if (!timeline?.cellIndex) throw fail(409, '时间线快照缺少原格信息，请先在时间线页同步一次', { code: 'TIMELINE_RESYNC' });
    // 快照指纹只看内容（事件、异常与裁定核验、学校名单），不含同步时间：工作台每 10 分钟重读飞书，内容没变就不能让待确认提交过期。
    const snapshot = short([timeline.agenda, timeline.anomalies?.map(a => [a.src, a.a, a.ruling, a.verification]), Object.entries(timeline.table || {}).map(([code, rows]) => [code, rows.map(r => [r.school, r.abbr])])]);
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

  // 校验：结构与不变量（03）+ 覆盖率与服务端重算一致 + 07 第 3 节降级。
  function check(doc, f) {
    const result = validateStrategyDoc(doc, { evidence: f.evidence });
    const add = (rule, at, message) => result.errors.push({ rule, at, message });
    for (const r of doc.regions || []) {
      const c = f.coverage[r.key];
      if (c && r.activity && (r.activity.value !== c.value || r.activity.status !== c.status || (r.activity.ratio ?? null) !== c.ratio)) add('05 §6', `regions.${r.key}`, `覆盖率须与服务端重算一致（${c.value}，${c.ratio ?? '无'}）`);
    }
    const card = f.bizcard || {};
    if (!(card['存量用户情况'] || []).length) {
      for (const c of doc.claims || []) if (['barrier', 'readiness'].includes(c.claimType) && c.targetRelation === '续费') {
        if (c.status !== 'unknown') add('07 §3', c.id, '背景卡没有存量用户情况时，续费的障碍和购买准备度须为 unknown');
        else if (c.route?.source !== 'SRC-bizcard' || c.route?.status !== 'available') add('07 §3', c.id, '续费判断缺存量用户情况时，route 须为 { status: available, source: SRC-bizcard }');
      }
      for (const s of doc.scenarios || []) if (s.targetRelation === '续费' && s.observedRelation?.value !== 'unknown') add('07 §3', s.id, '背景卡没有存量用户情况时，续费情境的实际关系须为 unknown');
    }
    if (!(card['用户观察'] || []).length)
      for (const c of doc.claims || []) if (c.claimType === 'pain' && c.painKind === 'observed') add('07 §3', c.id, '背景卡没有用户观察时，痛点只能是 typical');
    return result;
  }
  // I-09：常浩手写的内容（origin=manual）只认正式版本里已有的；skill 不能新建或冒充手写内容。
  function forgedManual(doc, base) {
    const mine = new Map((base?.content.claims || []).filter(c => c.origin === 'manual').map(c => [c.id, c]));
    return (doc.claims || []).filter(c => c.origin === 'manual' && !mine.has(c.id)).map(c => ({ rule: 'I-09', at: c.id, message: 'skill 不能新建 origin=manual 的内容' }));
  }
  // submission 对手写内容的改动单列，确认时逐条决定。
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
  const summary = row => ({ id: row.id, month: row.month, state: row.state, agent: row.agent, declared: JSON.parse(row.declared || 'null'), baseRevision: row.base_revision, submittedAt: row.submitted_at, decidedAt: row.decided_at, decidedFrom: row.decided_from, rejectReason: row.reject_reason ?? null });
  // 写入 revision：事务内复核、编号、回读，不一致就回滚。content.inputs 一律用服务端记录的输入。
  function writeRevision(month, doc, { inputs, segmentIndex, submissionId = null, from, by = '常浩', guard = () => {} }) {
    db.exec('BEGIN IMMEDIATE');
    try {
      guard();
      const id = `REV-${month}-${db.prepare('SELECT COUNT(*) n FROM strategy_revisions WHERE month=?').get(month).n + 1}`;
      const content = { ...doc, inputs };
      db.prepare('INSERT INTO strategy_revisions (id,month,schema_version,content,content_hash,inputs,segment_index,submission_id,confirmed_by,confirmed_from,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
        .run(id, month, SCHEMA_VERSION, JSON.stringify(content), fingerprint(content), JSON.stringify(inputs), JSON.stringify(segmentIndex || {}), submissionId, by, from, stamp());
      if (submissionId) db.prepare("UPDATE strategy_submissions SET state='confirmed', decided_at=?, decided_from=? WHERE id=? AND state='pending'").run(stamp(), 'page', submissionId);
      db.prepare("UPDATE strategy_submissions SET state='stale', decided_at=? WHERE month=? AND state='pending'").run(stamp(), month);
      const saved = current(month);
      if (saved?.id !== id || saved.content_hash !== fingerprint(content)) throw failure(500, '写入后回读不一致，已回滚');
      db.exec('COMMIT');
      return { id, createdAt: saved.created_at };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  return {
    facts, factsView,

    // strategy_submit：只能创建 submission。agent 来自凭据，declared 只是 AI 自报。
    async submit({ month, document, idempotencyKey, baseRevision = null, inputFingerprint, declared = null } = {}, { agent } = {}) {
      requireMonth(month);
      if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 200) throw failure(400, '须给出 idempotencyKey');
      if (!document || typeof document !== 'object' || document.month !== month) throw failure(400, 'document 须为该月的月度文档');
      const contentHash = fingerprint(document);
      const f = await facts(month);
      const repeat = existing => {
        if (existing.content_hash !== contentHash || existing.month !== month) throw fail(409, '同一 idempotencyKey 已提交过不同内容；新内容未保存，请换一个 idempotencyKey', { code: 'IDEMPOTENCY_CONFLICT' });
        return { ...summary(existing), warnings: JSON.parse(existing.warnings), stale: isStale(existing, f), repeated: true };
      };
      const existing = db.prepare('SELECT * FROM strategy_submissions WHERE idempotency_key=?').get(idempotencyKey);
      if (existing) return repeat(existing);
      const { errors, warnings } = check(document, f);
      errors.push(...forgedManual(document, current(month)));
      if (errors.length) throw fail(422, `校验未通过，未保存：${issuesText(errors)}`, { code: 'STRATEGY_INVALID' });
      const id = `SUB-${month}-${randomUUID().slice(0, 8)}`;
      try {
        db.prepare('INSERT INTO strategy_submissions (id,month,agent,declared,base_revision,input_fingerprint,schema_version,idempotency_key,content,content_hash,warnings,submitted_at,state) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .run(id, month, agent || 'unknown', JSON.stringify(declared), baseRevision, String(inputFingerprint ?? ''), String(document.schemaVersion ?? ''), idempotencyKey, JSON.stringify(document), contentHash, JSON.stringify(warnings), stamp(), 'pending');
      } catch (error) {
        const raced = db.prepare('SELECT * FROM strategy_submissions WHERE idempotency_key=?').get(idempotencyKey);
        if (raced) return repeat(raced);
        throw error;
      }
      const saved = submissionRow(id);
      if (saved?.content_hash !== contentHash) throw failure(500, '保存后回读不一致');
      return { ...summary(saved), warnings, stale: isStale(saved, f) };
    },
    submission(id) { return summary(mustSubmission(id)); },
    // 提交结果不明、没拿到 id 时按 idempotencyKey 查（#41）：只查当前凭据对应 agent 自己的提交，不跨 agent 暴露。
    submissionByKey(idempotencyKey, { agent } = {}) {
      if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || idempotencyKey.length > 200) throw failure(400, 'idempotencyKey 须为非空字符串');
      const row = db.prepare('SELECT * FROM strategy_submissions WHERE idempotency_key=? AND agent=?').get(idempotencyKey, agent || 'unknown');
      if (!row) throw fail(404, '没有这次提交：当前凭据没有用这个 idempotencyKey 提交过', { code: 'SUBMISSION_NOT_FOUND' });
      return summary(row);
    },

    // 页面：当月正式版本与待确认提交。
    get(month) {
      requireMonth(month);
      const rev = current(month);
      return { month, revision: rev && { id: rev.id, content: rev.content, createdAt: rev.created_at, confirmedFrom: rev.confirmed_from, submissionId: rev.submission_id },
        submissions: db.prepare("SELECT * FROM strategy_submissions WHERE month=? AND state='pending' ORDER BY submitted_at").all(month).map(summary),
        bizcard: getRecord(db, BIZCARD_KIND, month) };
    },
    revisions(month) {
      requireMonth(month);
      return db.prepare('SELECT id,month,submission_id,confirmed_by,confirmed_from,created_at,inputs FROM strategy_revisions WHERE month=? ORDER BY created_at DESC, rowid DESC').all(month)
        .map(({ inputs, ...row }) => ({ ...row, snapshot: JSON.parse(inputs || '{}').timelineSnapshot ?? null }));
    },
    // 页面：某个版本的完整内容（看差异、回退前查看）。
    revision(id) {
      const rev = parseRevision(db.prepare('SELECT * FROM strategy_revisions WHERE id=?').get(String(id ?? '')));
      if (!rev) throw failure(404, '没有这个版本');
      return { id: rev.id, month: rev.month, content: rev.content, createdAt: rev.created_at, confirmedBy: rev.confirmed_by, confirmedFrom: rev.confirmed_from, submissionId: rev.submission_id };
    },
    // 页面：当月全部提交（含已确认、已拒绝、已过期），新的在前。
    submissions(month) {
      requireMonth(month);
      return db.prepare('SELECT * FROM strategy_submissions WHERE month=? ORDER BY submitted_at DESC, rowid DESC').all(month).map(summary);
    },
    // 页面：正式版本与待确认提交引用到的 Evidence 及其窗口，用来显示关联事件、研判依据和「依据已变化」。
    async evidence(month) {
      const f = await facts(month);
      const rev = current(month), used = rev ? referenced(rev.content) : new Set();
      for (const row of db.prepare("SELECT content FROM strategy_submissions WHERE month=? AND state='pending'").all(month)) for (const id of referenced(JSON.parse(row.content))) used.add(id);
      const windows = new Map(f.windows.map(w => [w.evidenceId, w]));
      const evidence = f.evidence.filter(e => used.has(e.evidenceId));
      return { month, snapshot: f.snapshot, evidence, windows: evidence.map(e => windows.get(e.evidenceId)).filter(Boolean) };
    },
    async preview(id) {
      const row = mustSubmission(id);
      const doc = JSON.parse(row.content), base = current(row.month), f = await facts(row.month);
      const { errors, warnings, changed } = check(doc, f);
      return { submission: summary(row), document: doc, stale: isStale(row, f), errors, warnings, changed, manualChanges: manualChanges(doc, base),
        diff: { scenarios: diff(base?.content.scenarios, doc.scenarios), claims: diff(base?.content.claims, doc.claims) } };
    },

    // 页面确认：版本绑定不一致转 stale；手写内容只有逐条接受的才被替换；依据已变化的手写内容须常浩明确保留（keepStale）。
    async confirm(id, body = {}) {
      const row = mustSubmission(id);
      if (body.confirm !== true) throw failure(400, '请先预览，再明确确认');
      if (row.state !== 'pending') throw failure(409, `submission 已是 ${row.state}，不能确认`);
      const f = await facts(row.month);
      if (isStale(row, f)) {
        db.prepare("UPDATE strategy_submissions SET state='stale', decided_at=? WHERE id=? AND state='pending'").run(stamp(), id);
        throw fail(409, '基础版本、输入或 schema 已变化，submission 已过期，请让 skill 重新生成后预览', { code: 'SUBMISSION_STALE' });
      }
      const doc = JSON.parse(row.content), base = current(row.month);
      const accept = new Set(Array.isArray(body.acceptManual) ? body.acceptManual : []), keepStale = new Set(Array.isArray(body.keepStale) ? body.keepStale : []);
      const versions = new Map(f.evidence.map(e => [e.evidenceId, e.evidenceVersion]));
      const kept = [];
      for (const m of manualChanges(doc, base)) {
        if (accept.has(m.id)) continue;
        const i = doc.claims.findIndex(c => c.id === m.id);
        if (i >= 0) doc.claims[i] = m.before; else doc.claims.push(m.before);
        kept.push(m.id);
      }
      // I-06「由常浩确认保留」：只对手写内容开放，保留时把依据版本更新为当前版本，正文不动。
      for (const c of doc.claims) if (c.origin === 'manual' && keepStale.has(c.id) && c.refVersions)
        c.refVersions = Object.fromEntries(Object.keys(c.refVersions).map(k => [k, versions.get(k) ?? c.refVersions[k]]));
      const { errors } = check(doc, f);
      if (errors.length) throw fail(422, `确认前复核未通过：${issuesText(errors)}`, { code: 'STRATEGY_INVALID' });
      const used = referenced(doc);
      const inputs = { timelineSnapshot: f.snapshot, inputFingerprint: f.inputFingerprint, bizcard: f.bizcard ? short(f.bizcard) : null, rules: RULE_VERSIONS,
        evidenceVersions: Object.fromEntries(f.evidence.filter(e => used.has(e.evidenceId)).map(e => [e.evidenceId, e.evidenceVersion])) };
      const revision = writeRevision(row.month, doc, { inputs, segmentIndex: f.segmentIndex, submissionId: id, from: 'page',
        guard: () => { if (submissionRow(id).state !== 'pending') throw failure(409, 'submission 已被处理，请刷新'); } });
      return { revision, keptManual: kept };
    },
    reject(id, body = {}) {
      mustSubmission(id);
      if (body.confirm !== true) throw failure(400, '请明确确认拒绝');
      const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
      if (reason.length > 200) throw failure(400, '拒绝原因不超过 200 字');
      if (!db.prepare("UPDATE strategy_submissions SET state='rejected', decided_at=?, decided_from='page', reject_reason=? WHERE id=? AND state='pending'").run(stamp(), reason || null, id).changes) throw failure(409, 'submission 已不是待确认状态');
      return summary(submissionRow(id));
    },
    // 回退：把某个旧版本的内容写成新的 revision（历史不改写）；同月待确认提交转 stale。
    rollback(month, body = {}) {
      requireMonth(month);
      if (body.confirm !== true) throw failure(400, '请先查看要回退到的版本，再明确确认');
      const old = parseRevision(db.prepare('SELECT * FROM strategy_revisions WHERE id=? AND month=?').get(String(body.revisionId ?? ''), month));
      if (!old) throw failure(404, '没有这个版本');
      if (current(month).id === old.id) throw failure(409, '已经是当前版本');
      const { inputs, ...content } = old.content;
      return { revision: writeRevision(month, content, { inputs: old.inputs, segmentIndex: old.segment_index, from: `rollback:${old.id}` }) };
    },

    // 旧数据迁移（04 第 6、7 节）：只供 scripts/migrate-strategy-v2.mjs 调用，不进 HTTP 路由、不进智能体工具。
    // 只在该月还没有任何 revision 时写入；同一内容重复执行视为已完成，不重复写。
    async writeMigration(month, doc) {
      requireMonth(month);
      if (doc?.month !== month || doc.migrated !== true) throw failure(400, '只接受该月的迁移文档（migrated: true）');
      const f = await facts(month);
      const validation = validateStrategyDoc(doc, { evidence: f.evidence, migrated: true });
      for (const r of doc.regions || []) {
        const c = f.coverage[r.key];
        if (c && (r.activity?.value !== c.value || r.activity?.status !== c.status || (r.activity?.ratio ?? null) !== c.ratio)) validation.errors.push({ rule: '05 §6', at: `regions.${r.key}`, message: '覆盖率须与服务端重算一致' });
      }
      if (validation.errors.length) throw fail(422, `迁移文档校验未通过，未写入：${issuesText(validation.errors)}`, { code: 'STRATEGY_INVALID', validation });
      const rows = db.prepare('SELECT id, confirmed_from, content FROM strategy_revisions WHERE month=? ORDER BY created_at, rowid').all(month);
      if (rows.length) {
        const same = rows.length === 1 && rows[0].confirmed_from === 'migration' && (({ inputs, ...c }) => fingerprint(c))(JSON.parse(rows[0].content)) === fingerprint(doc);
        if (same) return { revision: { id: rows[0].id }, skipped: true, validation };
        throw fail(409, `${month} 已有 revision（${rows.map(r => `${r.id}/${r.confirmed_from}`).join('、')}），迁移不覆盖`, { code: 'MIGRATION_EXISTS' });
      }
      const inputs = { timelineSnapshot: f.snapshot, inputFingerprint: f.inputFingerprint, bizcard: f.bizcard ? short(f.bizcard) : null, rules: RULE_VERSIONS, evidenceVersions: {}, migration: doc.producedBy?.migration ?? null };
      // 确认人记脚本：常浩的同意记在切换日志（apply-log.json）里，不在库里冒用他的名字。
      return { revision: writeRevision(month, doc, { inputs, segmentIndex: f.segmentIndex, from: 'migration', by: 'migration-script' }), skipped: false, validation };
    },
    // 迁移回退：只删 confirmed_from='migration' 的 revision。该月迁移之后已有任何别的 revision 时整体拒绝（改用数据库备份恢复）。
    // revision 平时不可删（I-10）；这里是迁移切换的唯一例外，在同一事务里临时摘掉删除触发器、删完立即恢复。
    // dryRun：只列出将删除的版本和将转为 stale 的待确认提交，不改任何数据（先预览、后确认）。
    rollbackMigration(months, { dryRun = false } = {}) {
      if (!Array.isArray(months) || !months.length) throw failure(400, '须给出要回退的月份');
      months.forEach(requireMonth);
      db.exec('BEGIN IMMEDIATE');
      try {
        const marks = months.map(() => '?').join(',');
        const others = db.prepare(`SELECT id, confirmed_from FROM strategy_revisions WHERE month IN (${marks}) AND confirmed_from IS NOT 'migration'`).all(...months);
        if (others.length) throw fail(409, `迁移之后已有其他版本（${others.map(r => `${r.id}/${r.confirmed_from}`).join('、')}），不能只删迁移版本，请用数据库备份恢复`, { code: 'MIGRATION_SUPERSEDED' });
        const ids = db.prepare(`SELECT id FROM strategy_revisions WHERE month IN (${marks}) AND confirmed_from='migration'`).all(...months).map(r => r.id);
        const stale = db.prepare(`SELECT id FROM strategy_submissions WHERE month IN (${marks}) AND state='pending'`).all(...months).map(r => r.id);
        if (dryRun) { db.exec('ROLLBACK'); return { removed: ids, staled: stale, dryRun: true }; }
        db.exec('DROP TRIGGER strategy_revisions_no_delete');
        db.prepare(`DELETE FROM strategy_revisions WHERE month IN (${marks}) AND confirmed_from='migration'`).run(...months);
        db.exec(REVISION_NO_DELETE_TRIGGER);
        db.prepare(`UPDATE strategy_submissions SET state='stale', decided_at=? WHERE month IN (${marks}) AND state='pending'`).run(stamp(), ...months);
        if (db.prepare(`SELECT COUNT(*) n FROM strategy_revisions WHERE month IN (${marks})`).get(...months).n) throw failure(500, '删除后回读仍有 revision，已回滚');
        db.exec('COMMIT');
        return { removed: ids, staled: stale, dryRun: false };
      } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
    },

    // 业务背景卡：先预览、后确认（07）。新条目在预览时分配 id。
    previewBizcard(month, card) { requireMonth(month); return bizcards.preview(BIZCARD_KIND, month, normalizeBizcard(card)); },
    confirmBizcard(month, body) { requireMonth(month); return bizcards.confirm(BIZCARD_KIND, month, body); },
  };
}
