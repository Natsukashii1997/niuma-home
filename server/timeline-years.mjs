import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import { beijingText, failure } from './v3-common.mjs';
import { getSettings, saveSetting } from './db.mjs';
import { REGION_SHEETS, parseTimeline, readTimelineSheets, timelineSources } from './timeline.mjs';
import { LARK_PROFILE } from './lark-identity.mjs';

const execute = promisify(execFile);
const LINK = /^https:\/\/[\w.-]+\.(?:feishu\.cn|larksuite\.com)\/(wiki|sheets)\/([A-Za-z0-9]+)/;

// 飞书链接 → 表格来源。/wiki/ 链接查知识库节点，必须是电子表格；/sheets/ 链接直接取 token，表名读工作簿信息。只读。
export async function resolveTimelineLink(url, { run = execute } = {}) {
  const match = typeof url === 'string' && url.trim().match(LINK);
  if (!match) throw failure(400, '请粘贴飞书时间线表的链接（/wiki/ 或 /sheets/ 开头）');
  const cli = async args => {
    let out;
    try { out = JSON.parse((await run('lark-cli', ['--profile', LARK_PROFILE, ...args, '--as', 'user', '--format', 'json'], { encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024 })).stdout); }
    catch (error) { throw failure(error.killed ? 504 : 502, '读取飞书链接失败，请检查猛鬼兽配置的 lark-cli 用户登录、权限和网络'); }
    if (out.ok !== true || out.identity !== 'user' || !out.data) throw failure(502, '飞书未返回完整的用户身份数据');
    return out.data;
  };
  if (match[1] === 'wiki') {
    const node = await cli(['wiki', '+node-get', '--node-token', url.trim()]);
    if (node.obj_type !== 'sheet' || !node.obj_token || !node.title) throw failure(400, '这个链接不是电子表格，请粘贴时间线表格本身的链接');
    return { title: node.title, token: node.obj_token, url: url.trim() };
  }
  const info = await cli(['sheets', '+workbook-info', '--spreadsheet-token', match[2]]);
  if (!info.title) throw failure(502, '飞书没有返回表格名称');
  return { title: info.title, token: match[2], url: url.trim() };
}

// 登记新年份的时间表（用户 2026-10-23）：先只读预览（解析链接、按 4 张地区明细 + 12 张月历校验结构、试解析），
// 确认后才写设置 timeline_years，再立即同步全部年份并回读。只写这一个设置项，不改飞书。
export function createTimelineYearService(db, { resolve = resolveTimelineLink, readSheets = readTimelineSheets, refresh, now = Date.now, ttl = 10 * 60_000 } = {}) {
  const previews = new Map();
  return {
    async preview(body) {
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'url')) throw failure(400, '只接受时间表链接');
      const source = await resolve(body.url);
      const year = Number(source.title.match(/20\d{2}/)?.[0]);
      if (!year) throw failure(400, `表名「${source.title}」里没有年份，无法判断是哪一年的时间表`);
      const before = getSettings(db).timeline_years || '', current = timelineSources(getSettings(db));
      if (current.some(s => s.year === year)) throw failure(409, `${year} 年已经登记过时间表`);
      if (current.some(s => s.token === source.token)) throw failure(409, '这张表已经登记过');
      const sheets = await readSheets({ source });
      if (REGION_SHEETS.some(name => sheets.filter(s => s.name === name).length !== 1)) throw failure(502, `须有 4 张地区明细表：${REGION_SHEETS.join('、')}`);
      const value = parseTimeline(sheets, beijingText(now()), year, { tag: String(year), title: source.title });
      const days = value.agenda.flatMap(e => [e.from, e.to || e.from]).sort();
      for (const [id, p] of previews) if (p.expires <= now()) previews.delete(id);
      const previewId = randomUUID(), expires = now() + ttl;
      previews.set(previewId, { source: { year, ...source }, before, expires });
      return { previewId, expiresAt: new Date(expires).toISOString(), summary: { year, title: source.title, url: source.url, ...value.coverage, events: value.agenda.length, anomalies: value.anomalies.length, from: days[0] || '', to: days.at(-1) || '' } };
    },
    async confirm(body) {
      if (body?.confirm !== true || typeof body.previewId !== 'string') throw failure(400, '请先预览，再明确确认');
      const p = previews.get(body.previewId);
      if (!p || p.expires <= now()) throw failure(409, '预览已失效，请重新预览');
      if ((getSettings(db).timeline_years || '') !== p.before) throw failure(409, '年份配置已变化，请重新预览');
      previews.delete(body.previewId);
      const list = [...(p.before ? JSON.parse(p.before) : []), p.source].sort((a, b) => a.year - b.year);
      saveSetting(db, 'timeline_years', JSON.stringify(list));
      if (!JSON.parse(getSettings(db).timeline_years).some(s => s.token === p.source.token)) throw failure(500, '年份配置写入后回读不一致');
      // 写入已确认；同步失败不回滚登记，页面提示稍后点「同步」。
      try { const synced = await refresh(); return { saved: p.source, years: synced.years, syncedAt: synced.syncedAt }; }
      catch (error) { return { saved: p.source, years: null, syncError: error.status ? error.message : '同步失败，请稍后在用户时间页点「同步」' }; }
    },
  };
}
