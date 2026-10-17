import { randomUUID } from 'node:crypto';
import { beijingText, failure, requireMonth } from './v3-common.mjs';
import { createLocalChanges, getRecord, listRecords } from './local-records.mjs';

// 不从时间线推导的主线需求：自言自语转来的（selftalk-need）、手写的和 Voice 话题转来的（manual-need）。
// 都先以「草稿」进入需求列表，采纳流程与推导出的需求相同；只存工作台，不回写飞书。
export const MANUAL_NEED_KIND = 'manual-need';
export const manualNeedRecords = db => [...listRecords(db, 'selftalk-need'), ...listRecords(db, MANUAL_NEED_KIND)];

const FIELDS = [['seg', '学生分群', 50], ['node', '节点', 50], ['when', '时间', 60], ['need', '需求', 500], ['pain', '痛点', 500], ['todo', '学生的待办', 500]];
function field(body, key, label, max) {
  const value = body[key] ?? '';
  if (typeof value !== 'string' || value.trim().length > max) throw failure(400, `${label}须为 ${max} 字以内的文字`);
  return value.trim();
}
const adopted = (db, needId) => Boolean(db.prepare('SELECT 1 FROM v3_needs WHERE id=?').get(needId));

export function createManualNeeds(db, { voice, now = Date.now } = {}) {
  const changes = createLocalChanges(db, { now });
  const previews = new Map();
  const remember = (preview, id) => {
    for (const [key, p] of previews) if (p.expires <= now()) previews.delete(key);
    previews.set(preview.previewId, { id, expires: Date.parse(preview.expiresAt) });
    return preview;
  };
  const sameTopic = (month, voiceId) => listRecords(db, MANUAL_NEED_KIND).find(r => r.month === month && r.voice?.id === voiceId);
  return {
    list: () => ({ records: listRecords(db, MANUAL_NEED_KIND) }),
    async preview(body) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !['month', 'voiceId', ...FIELDS.map(f => f[0])].includes(k))) throw failure(400, '需求预览内容无效');
      const month = requireMonth(body.month);
      const values = Object.fromEntries(FIELDS.map(([key, label, max]) => [key, field(body, key, label, max)]));
      if (!values.need) throw failure(400, '请填写需求');
      let topic = null, updatedAt = '';
      if (body.voiceId !== undefined) {
        if (typeof body.voiceId !== 'string' || !body.voiceId) throw failure(400, '话题编号无效');
        if (!voice) throw failure(503, '留学之声未接入');
        const data = await voice();
        topic = data.hot.find(t => t.id === body.voiceId);
        if (!topic) throw failure(404, '话题不在当前留学之声榜单里，请重新读取 Voice');
        updatedAt = data.updatedAt;
        const dup = sameTopic(month, topic.id);
        if (dup) throw failure(400, `这个话题已转为 ${month} 的主线需求草稿「${dup.need.need}」`);
      }
      const id = randomUUID(), at = new Date(now()).toISOString();
      const source = topic ? `留学之声 · ${topic.title} · ${updatedAt} 榜单` : `手写 · ${beijingText(now())}`;
      const value = {
        id, month, origin: topic ? 'voice' : 'manual', ...(topic && { voice: { id: topic.id, title: topic.title, updatedAt } }), createdAt: at,
        need: { id: `manual-${id}`, seg: values.seg || '待确认', node: values.node || (topic ? 'Voice 话题' : '手写'), when: values.when || `${month} 全月`, schools: 0, need: values.need, pain: values.pain, todo: values.todo, source, status: '草稿', links: '' },
      };
      const validate = (candidate, current) => {
        if (current) throw failure(409, '需求编号冲突，请重新预览');
        const dup = topic && sameTopic(month, topic.id);
        if (dup) throw failure(409, `这个话题已转为 ${month} 的主线需求草稿「${dup.need.need}」`);
      };
      return remember(changes.preview(MANUAL_NEED_KIND, id, value, { validate }), id);
    },
    // 只能删除还没采纳的草稿：采纳过的需求可能已被价格方案关联，删掉记录会让采纳记录变成「待复核」。
    removePreview(id) {
      const current = getRecord(db, MANUAL_NEED_KIND, id);
      if (!current) throw failure(404, '这条需求草稿不存在，请重新读取');
      const validate = (value, record) => {
        if (!record) throw failure(409, '这条需求草稿已被删除，请重新读取');
        if (adopted(db, record.need.id)) throw failure(409, '这条需求已采纳，不能删除');
      };
      return remember(changes.preview(MANUAL_NEED_KIND, id, current, { validate, remove: true }), id);
    },
    confirm(body) {
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '请先预览，再明确确认');
      const p = previews.get(body.previewId);
      if (!p) throw failure(409, '预览已失效，请重新预览');
      return changes.confirm(MANUAL_NEED_KIND, p.id, body);
    },
  };
}
