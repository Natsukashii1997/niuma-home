import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getSettings, saveSetting } from './db.mjs';
import { failure } from './v3-common.mjs';
import { reportDocumentUrl } from './reports.mjs';
import { TIMELINE_SOURCE } from './timeline.mjs';
import { COLLECT_SPACE, COLLECT_RULES, collectRules, validateCollectRuleNodes } from './kb-collect-config.mjs';
import { AGUMON } from './lark-identity.mjs';

export const V3_DEFAULTS = {
  timeline_source: JSON.stringify(TIMELINE_SOURCE),
  project_base_url: 'https://vm94j8bzy7.feishu.cn/base/MxB8biSR2aJKenszh4CcprRenmf',
  project_table_id: 'tblc3pkZfjaOnOwY', campaign_table_id: 'tblDhQCi5CCZCvUT', price_sku_table_id: 'tblwaujJdrNHoVea',
  kb_space_id: '7620758074885835965',
  kb_collect_space: COLLECT_SPACE, kb_collect_rules: JSON.stringify(COLLECT_RULES),
  mentor_sources: JSON.stringify([
    { name: '林瑶', role: '管培生', year: 2026, url: 'https://vm94j8bzy7.feishu.cn/docx/GcwKdGzljozUeUxesWhctBQXnpe' },
    { name: '胡贵兰', role: '管培生', year: 2026, url: 'https://vm94j8bzy7.feishu.cn/docx/FZfXdpxL9oKs6jxW1T7cVisdnIb' },
  ]),
  lark_profile: AGUMON.profile, lark_app_id: AGUMON.appId, voice_budget: '10',
  codex_push_enabled: '0', // 猛鬼兽推送 Codex 重置：默认关，开关走预览 → 确认 → 回读
  // 用户2026-10-16明确要求先采用演示口径；不是已核验业务成本。
  price_floor_margin: '0.25', price_cost_per_hour: '440',
};
export const V3_SETTING_KEYS = new Set([...Object.keys(V3_DEFAULTS), 'nas_root', 'price_floor_margin', 'price_cost_per_hour']);
const bad = message => { throw failure(400, message); };
const object = value => { try { const parsed = JSON.parse(value); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed; } catch {} bad('配置须为 JSON 对象'); };
export function validateV3Setting(key, raw) {
  if (!V3_SETTING_KEYS.has(key)) bad('不支持此配置项');
  if (typeof raw !== 'string') bad('配置值须为字符串');
  const value = raw.trim();
  if (key === 'lark_profile' || key === 'lark_app_id') {
    if (value !== V3_DEFAULTS[key]) bad('飞书默认身份固定为亚古兽，不能在此切换');
  } else if (key === 'codex_push_enabled') {
    if (value !== '0' && value !== '1') bad('推送开关只能是 0（关）或 1（开）');
  } else if (key === 'timeline_source') {
    const source = object(value);
    reportDocumentUrl(source.url);
    if (source.title !== TIMELINE_SOURCE.title || !/^[a-zA-Z0-9]{10,80}$/.test(source.token || '')) bad('须提供2026海外大学时间线的表格 token、标题及飞书链接');
    return JSON.stringify({ title: source.title, token: source.token, url: source.url });
  } else if (key === 'project_base_url') {
    let u; try { u = new URL(value); } catch { bad('请输入飞书多维表格链接'); }
    if (u.protocol !== 'https:' || !/(^|\.)(feishu\.cn|larksuite\.com)$/.test(u.hostname) || u.username || u.password || u.port || /\s|\\/.test(value) || !/^\/base\/[a-zA-Z0-9]+\/?$/.test(u.pathname)) bad('请输入不含账号或端口的 HTTPS 飞书 base 链接');
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  } else if (key.endsWith('_table_id')) {
    if (!/^tbl[a-zA-Z0-9]+$/.test(value)) bad('数据表 ID 须以 tbl 开头');
  } else if (key === 'kb_collect_rules') {
    return JSON.stringify(collectRules(value));
  } else if (key === 'kb_space_id' || key === 'kb_collect_space') {
    if (!/^\d{10,30}$/.test(value)) bad('知识空间 ID 须为数字');
  } else if (key === 'mentor_sources') {
    let list; try { list = JSON.parse(value); } catch { bad('日志来源须为 JSON 数组'); }
    // 带教名单 1–20 人（培养路径页可以加人）；日志链接可以不填，带教答疑只读有链接的人
    if (!Array.isArray(list) || !list.length || list.length > 20 || new Set(list.map(x => x?.name)).size !== list.length) bad('带教名单须是 1–20 位不重名的人');
    return JSON.stringify(list.map(item => {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || !Number.isInteger(item.year) || item.year < 2020 || item.year > 2100 || item.role !== undefined && typeof item.role !== 'string') bad('每个人须有姓名和年份，飞书日志链接可以不填');
      return { name: item.name.trim(), role: item.role || '管培生', year: item.year, ...(item.url && { url: reportDocumentUrl(item.url) }) };
    }));
  } else if (key === 'nas_root') {
    if (!path.isAbsolute(value) || value === '/' || value.split(path.sep).includes('..') || /[\x00-\x1f]/.test(value)) bad('NAS 目录须为明确的绝对目录，不能为根目录或包含上级路径');
    return path.normalize(value);
  } else {
    if (!/^\d+(?:\.\d+)?$/.test(value)) bad('请输入非负数字');
    const n = Number(value);
    if (!Number.isFinite(n) || key === 'price_floor_margin' && n >= 1 || key === 'price_cost_per_hour' && n > 100000 || key === 'voice_budget' && (n <= 0 || n > 10)) bad('价格毛利须为0到1之间；课时成本须合理；本月模型预算不得超过10元');
    return String(n);
  }
  return value;
}

export function createSettingsChanges(db, { now = Date.now, validate = validateV3Setting, run } = {}) {
  const pending = new Map();
  return {
    read: () => ({ values: { ...V3_DEFAULTS, ...getSettings(db) }, saved: getSettings(db), readonly: ['lark_profile', 'lark_app_id', 'timeline_years'], demoDefaults: ['price_floor_margin', 'price_cost_per_hour'] }),
    preview(key, body) {
      const value = validate(key, body?.value), before = getSettings(db)[key] ?? null;
      const space = getSettings(db).kb_collect_space || COLLECT_SPACE;
      const prepare = () => {
      if(key === 'kb_collect_rules' && (getSettings(db).kb_collect_space || COLLECT_SPACE) !== space) throw failure(409, '收藏空间已变化，请重新预览规则');
      for (const [id, p] of pending) if (p.expires <= now()) pending.delete(id);
      if (pending.size >= 100) throw failure(429, '待确认配置过多，请稍后重试');
      const previewId = randomUUID(), expires = now() + 600000;
      pending.set(previewId, { key, value, before, expires, ...(key === 'kb_collect_rules' ? { space } : {}) });
      return { previewId, expiresAt: new Date(expires).toISOString(), key, before, value };
      };
      // 只对收藏规则做异步节点核验，保留旧设置服务的同步合同。
      return key === 'kb_collect_rules' ? validateCollectRuleNodes(JSON.parse(value), space, run).then(prepare) : prepare();
    },
    confirm(key, body) {
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '请先预览配置，再确认保存');
      const p = pending.get(body.previewId);
      if (!p || p.key !== key || p.expires <= now()) throw failure(409, '配置预览已失效，请重新读取');
      if (p.receipt) return p.receipt;
      db.exec('BEGIN IMMEDIATE');
      try {
        if ((getSettings(db)[key] ?? null) !== p.before) throw failure(409, '配置已被修改，请重新预览');
        if(p.space && (getSettings(db).kb_collect_space || COLLECT_SPACE) !== p.space) throw failure(409, '收藏空间已变化，请重新预览规则');
        validate(key, p.value);
        const receipt = saveSetting(db, key, p.value);
        const saved = getSettings(db);
        const cleared = key === 'weekly_doc_url' && p.value === '';
        if (cleared ? Object.hasOwn(saved, key) : saved[key] !== p.value) throw failure(500, '配置回读不一致');
        db.exec('COMMIT'); p.receipt = receipt; return receipt;
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
  };
}
