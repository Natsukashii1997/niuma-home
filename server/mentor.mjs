import { getSettings } from './db.mjs';
import { createLocalChanges, fingerprint, listRecords, getRecord } from './local-records.mjs';
import { createTextDraftGenerator } from './ai-draft.mjs';
import { beijingText, failure } from './v3-common.mjs';
import { reportDocumentUrl } from './reports.mjs';
import { createConfiguredReader, runLark, validDate } from './projects.mjs';

export const MENTOR_SOURCES = [
  { name: '林瑶', role: '管培生', url: 'https://vm94j8bzy7.feishu.cn/docx/GcwKdGzljozUeUxesWhctBQXnpe', year: 2026 },
  { name: '胡贵兰', role: '管培生', url: 'https://vm94j8bzy7.feishu.cn/docx/FZfXdpxL9oKs6jxW1T7cVisdnIb', year: 2026 },
];
const decode = text => text.replace(/&(?:amp|lt|gt|quot|apos);/g, m => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" })[m]);
const clean = text => decode(text.replace(/<[^>]*>/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').trim());

export function mentorConfig(settings) {
  let sources;
  try { sources = settings.mentor_sources ? JSON.parse(settings.mentor_sources) : structuredClone(MENTOR_SOURCES); } catch { throw failure(400, '带教来源配置不是有效 JSON'); }
  if (!Array.isArray(sources) || !sources.length || sources.length > 10 || new Set(sources.map(s => s?.name)).size !== sources.length) throw failure(400, '带教来源须为不重名的人员列表');
  return sources.map(source => {
    if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 50 || !Number.isInteger(source.year) || source.year < 2020 || source.year > 2099) throw failure(400, '带教来源须提供姓名及最新一篇日志所在年份');
    return { name: source.name.trim(), role: typeof source.role === 'string' ? source.role : '管培生', url: reportDocumentUrl(source.url), year: source.year };
  });
}

export function datedHeadings(outline, year) {
  let currentYear = year, previousMonth;
  return [...outline.matchAll(/<h1\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/h1>/g)].map(([, id, raw]) => {
    const title = clean(raw), m = title.match(/^(?:(20\d{2})[.\-/年])?(\d{1,2})[.\-/月](\d{1,2})(?:日)?(?:\s|$)/);
    if (!m) return { id, title, date: null };
    const month = Number(m[2]);
    if (m[1]) currentYear = Number(m[1]);
    else if (previousMonth !== undefined && month > previousMonth) {
      if (previousMonth > 2 || month < 11) throw failure(502, '日志目录月份不是倒序，无法可靠补全年份');
      currentYear--;
    }
    previousMonth = month;
    const date = `${currentYear}-${String(month).padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return { id, title, date: validDate(date) ? date : null };
  });
}

export function mentorView(source, headings, markdown, now = Date.now()) {
  const today = beijingText(now).slice(0, 10), lower = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400_000).toISOString().slice(0, 10);
  const sections = new Map();
  let title;
  for (const line of markdown.split('\n')) {
    if (/^#\s/.test(line)) { title = clean(line.replace(/^#\s+/, '')); if (sections.has(title)) throw failure(502, '日志日期标题重复，无法可靠分节'); sections.set(title, []); }
    else if (title) sections.get(title).push(line);
  }
  const selected = headings.filter(h => h.date && h.date >= lower && h.date <= today);
  const blocks = [], asks = [], seen = new Set(), evidence = [];
  const logs = selected.map(h => {
    if (seen.has(h.date)) throw failure(502, '同一天日志存在多份标题，请核实来源');
    seen.add(h.date);
    if (!sections.has(h.title)) throw failure(502, '近30天日志未完整读取');
    const lines = sections.get(h.title).map(clean).filter(v => v && !/^#/.test(v));
    evidence.push({ date: h.date, src: `${source.url}#${h.id}`, title: h.title, text: sections.get(h.title).join('\n') });
    const block = lines.filter(v => /卡点|阻塞|卡住/.test(v) && !/无卡点|没有卡点|无阻塞/.test(v)).slice(0, 3);
    const questions = lines.filter(v => /[？?]/.test(v) && !/^https?:/.test(v)).slice(0, 3);
    blocks.push(...block.map(v => `${v.slice(0, 180)}（${h.date.slice(5)}）`));
    asks.push(...questions.map(v => v.slice(0, 180)));
    return { d: h.date.slice(5), date: h.date, t: h.title.replace(/^(?:20\d{2}[.\-/年])?\d{1,2}[.\-/月]\d{1,2}(?:日)?\s*/, ''), flag: block.length ? '卡点' : questions.length ? '提问' : '', src: `${source.url}#${h.id}` };
  }).sort((a, b) => b.date.localeCompare(a.date));
  return { name: source.name, role: source.role, logs, blocks: [...new Set(blocks)].slice(0, 10), asks: [...new Set(asks)].slice(0, 6), feedback: `草稿：最近30天读取到${logs.length}篇日志。${blocks.length ? '建议先逐项确认日志中明确记录的卡点、影响及下一步负责人。' : '日志中未提取到明确标注的卡点，可先确认本周最需要支持的一件事。'}以上由日志规则整理，需人工核对后使用。`, qa: null, history: [], qaNote: '尚未建立Q&A关联索引', draft: true, evidence };
}

export async function readMentorLogs(source, { run, now = Date.now } = {}) {
  const args = ['docs', '+fetch', '--doc', source.url];
  const outline = await runLark([...args, '--scope', 'outline', '--max-depth', '1', '--detail', 'with-ids', '--doc-format', 'xml'], run);
  if (typeof outline.document?.content !== 'string' || !Number.isInteger(outline.document.revision_id)) throw failure(502, '日志目录或版本缺失');
  const headings = datedHeadings(outline.document.content, source.year);
  if (!headings.length) throw failure(502, '日志没有可识别的日期目录');
  const today = beijingText(now()).slice(0, 10), lower = new Date(Date.parse(`${today}T00:00:00Z`) - 29 * 86400_000).toISOString().slice(0, 10);
  const selected = headings.map((h, i) => h.date && h.date >= lower && h.date <= today ? i : -1).filter(i => i >= 0);
  if (!selected.length) return mentorView(source, headings, '', now());
  const first = Math.min(...selected), last = Math.max(...selected);
  const fragment = await runLark([...args, '--revision-id', String(outline.document.revision_id), '--scope', 'range', '--start-block-id', headings[first].id, '--end-block-id', headings[last + 1]?.id || '-1', '--doc-format', 'markdown'], run);
  if (typeof fragment.document?.content !== 'string' || fragment.document.revision_id !== outline.document.revision_id) throw failure(502, '读取日志时版本发生变化');
  if (/<excerpt\b/i.test(fragment.document.content)) throw failure(502, '日志包含未完整读取的切片，请补齐正文后再生成草稿');
  const value = mentorView(source, headings, fragment.document.content, now());
  // CLI tips也可能只是正常回放提示，不按非空或猜测关键词判定读取失败。
  if (typeof fragment.document.tips === 'string' && fragment.document.tips.trim()) value.evidence = value.evidence.map(log => ({ ...log, sourceNote: fragment.document.tips }));
  return value;
}

export function createMentorService(db, { now = Date.now, readLogs = source => readMentorLogs(source, { now }), generate = createTextDraftGenerator(db, { now }), ...options } = {}) {
  const config = () => mentorConfig(getSettings(db));
  const read = createConfiguredReader(db, 'mentor', config, sources => Promise.all(sources.map(readLogs)), { now, ...options });
  const changes = createLocalChanges(db, { now });
  const draftPreviews = new Map();
  const sourceFor = name => { const source = config().find(s => s.name === name); if (!source) throw failure(404, '带教对象不存在'); return source; };
  const key = (name, week) => `${fingerprint(sourceFor(name))}:${week}`;
  const latestPerson = name => {
    const row = db.prepare('SELECT payload FROM v3_snapshots WHERE kind=?').get('mentor');
    const snapshot = row ? JSON.parse(row.payload) : null;
    return snapshot?.identity === fingerprint(config()) ? snapshot.value?.find(p => p.name === name) : null;
  };
  const evidenceFor = (name, person = latestPerson(name)) => ({ source: sourceFor(name), logs: person?.evidence || [] });
  return {
    async list(options) {
      const records = listRecords(db, 'mentor-record');
      return (await read(options)).map(({ evidence, ...person }) => {
        const saved = getRecord(db, 'mentor-draft', fingerprint(sourceFor(person.name)));
        const valid = saved?.sourceFingerprint === fingerprint(evidenceFor(person.name, { evidence }));
        return { ...person, ...(valid ? { feedback: `AI草稿（待人工核对）\n${saved.text}`, feedbackOrigin: 'ai-draft', generatedAt: saved.generatedAt } : { feedbackOrigin: 'rules' }), history: records.filter(r => r.name === person.name && r.sourceIdentity === fingerprint(sourceFor(person.name))).map(r => r.week).sort().reverse() };
      });
    },
    async previewDraft(name, body = {}) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) throw failure(400, '带教草稿仅使用已配置的近30天日志，不接受替换来源');
      const sourceIdentity = fingerprint(sourceFor(name));
      const people = await read({ refresh: true });
      if (sourceIdentity !== fingerprint(sourceFor(name))) throw failure(409, '带教来源已变化，请重新读取');
      const evidence = evidenceFor(name, people.find(p => p.name === name)), sourceFingerprint = fingerprint(evidence);
      if (!evidence.logs.length || evidence.logs.some(log => typeof log.text !== 'string' || !log.text.trim() || /<excerpt\b/i.test(log.text) || !log.src || !log.date)) throw failure(409, '近30天完整日志正文尚不可用，不能生成带教草稿');
      const draft = await generate({ title: `带教草稿 · ${name}`, task: '根据最近30天完整日志生成一份带教草稿：有依据的进展、明确卡点、需确认的问题、下一次带教可直接问的3至5个问题及建议。每项事实注明日志日期和来源，不把规则提取或建议当成已确认成果。不回写日志、不发消息。', evidence });
      const validate = () => { if (sourceIdentity !== fingerprint(sourceFor(name)) || sourceFingerprint !== fingerprint(evidenceFor(name))) throw failure(409, '带教日志或来源已变化，请重新生成草稿'); };
      if (draft.sourceFingerprint !== sourceFingerprint || typeof draft.text !== 'string' || !draft.text.trim() || draft.text.length > 20000) throw failure(502, 'AI草稿与来源核验不一致，未保存');
      const value = { ...draft, name, sourceIdentity, draft: true };
      const preview = changes.preview('mentor-draft', sourceIdentity, value, { validate });
      for (const [id, entry] of draftPreviews) if (entry.expires <= now()) draftPreviews.delete(id);
      draftPreviews.set(preview.previewId, { name, sourceIdentity, expires: Date.parse(preview.expiresAt) });
      return preview;
    },
    async confirmDraft(name, body) {
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '请先生成并预览，再明确确认保存草稿');
      const preview = draftPreviews.get(body.previewId);
      if (!preview || preview.name !== name || preview.expires <= now()) throw failure(409, '草稿预览已过期或目标不匹配');
      if (preview.receipt) return structuredClone(preview.receipt);
      await read({ refresh: true });
      const receipt = changes.confirm('mentor-draft', preview.sourceIdentity, body);
      preview.receipt = structuredClone(receipt);
      return receipt;
    },
    preview(name, body) {
      if (!body || !/^20\d{2}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(body.week) || typeof body.note !== 'string' || !body.note.trim() || body.note.length > 10000) throw failure(400, '请提供 YYYY-Www 周次及带教结论（不超过10000字）');
      const sourceIdentity = fingerprint(sourceFor(name));
      return changes.preview('mentor-record', key(name, body.week), { name, week: body.week, note: body.note.trim(), sourceIdentity, savedAt: new Date(now()).toISOString() }, { validate: () => { if (sourceIdentity !== fingerprint(sourceFor(name))) throw failure(409, '带教来源已变化'); } });
    },
    confirm(name, body) { return changes.confirm('mentor-record', key(name, body?.week), body); },
  };
}
