import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beijingText, failure, saveSnapshot } from './v3-common.mjs';
import { getSettings } from './db.mjs';

const execute = promisify(execFile);
export const TIMELINE_SOURCE = { title: '2026海外大学时间线', token: 'BRzDsSWKGh8sMgtI2AocU42qnlg', url: 'https://vm94j8bzy7.feishu.cn/wiki/ZWx9wzNaCiNMsqkAhCtc7lfgnIm' };
export const REGION_SHEETS = ['美东 美西 加拿大', '英国 爱尔兰', '澳大利亚 新西兰', '香港 澳门 新加坡 马来西亚'];
const countries = { 美西: ['US', '美国'], 美东: ['US', '美国'], 加拿大: ['CA', '加拿大'], 英国: ['UK', '英国'], 爱尔兰: ['IE', '爱尔兰'], 澳洲: ['AU', '澳洲'], 新西兰: ['NZ', '新西兰'], 香港: ['HK', '香港'], 澳门: ['MO', '澳门'], 新加坡: ['SG', '新加坡'], 马来西亚: ['MY', '马来西亚'] };
const empty = value => !value.trim() || /^(?:\/|—|-|暂无|待定|TBC|未公开|未更新)$/i.test(value.trim());
const guessRe = /推测|预估|预计|估计|去年|左右|大概|通常|一般|约|上旬|中旬|下旬|月底|月初/i;
const pad = v => String(v).padStart(2, '0');

// 北美源缩写经原格官网域名核对；UWM 指向 wisc.edu，不能误认成密尔沃基。
// UCB 为官方校历交叉匹配，仍以 guess 标记等待源维护者确认。
const schoolAliases = {
  UW: '华盛顿大学', UCSB: '加州大学圣塔芭芭拉分校', UCLA: '加州大学洛杉矶分校', UCSD: '加州大学圣地亚哥分校',
  UCI: '加州大学欧文分校', UCD: '加州大学戴维斯分校', USC: '南加州大学', UCB: '加州大学伯克利分校',
  NYU: '纽约大学', BU: '波士顿大学', OSU: '俄亥俄州立大学', UR: '罗切斯特大学', EMORY: '埃默里大学',
  UWM: '威斯康星大学麦迪逊分校', Umich: '密歇根大学', UIUC: '伊利诺伊大学厄巴纳-香槟分校', UT: '多伦多大学', UBC: '不列颠哥伦比亚大学',
};
export function schoolName(raw) {
  const name = raw.replace(/^新西兰-/, '').trim();
  if (Object.hasOwn(schoolAliases, name)) return { school: schoolAliases[name], abbr: name };
  const match = name.match(/^(.+?[\u3400-\u9fff])\s*([A-Za-z][A-Za-z ]*)$/);
  if (match) return { school: match[1], abbr: match[2].trim() };
  return { school: name, abbr: '' };
}

function date(y, m, d) {
  const value = `${y}-${pad(m)}-${pad(d)}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

// 仅解析有完整月日的单点/范围。URL、备注不是日期证据。
export function parseTimelineDate(raw, header = '', year = 2026) {
  const content = raw.replace(/https?:\/\/[^\s）)]+/g, '').trim();
  if (empty(content)) return { empty: true };
  const qualified = /研究生|本科生|国际生|专业|校区|复习[+＋]/.test(content);
  const flag = guessRe.test(`${content} ${header}`) || qualified ? 'guess' : undefined;
  if (/去年/.test(content)) return { flag: 'guess', issue: '去年参考日期，年份未确认' };
  let s = content.replace(/[（(][^）)]*[）)]/g, '').trim().replace(/[～~–—至]/g, '-').replace(/\s+/g, '');
  const atom = '(?:(20\\d{2})[年./-])?(\\d{1,2})[月./-](\\d{1,2})[日号]?';
  const m = s.match(new RegExp(`^${atom}(?:-${atom})?$`));
  if (!m) return { flag: flag || 'conflict', issue: /-\s*$/.test(s) ? '缺少结束日期' : '日期不完整、多个时段或含限定条件，需人工确认' };
  let [, y1, mo1, d1, y2, mo2, d2] = m;
  if (!mo2) { mo2 = mo1; d2 = d1; y2 = y1; }
  const crosses = Number(mo2) * 100 + Number(d2) < Number(mo1) * 100 + Number(d1);
  if (!y1 && !y2 && crosses) return { flag: 'guess', issue: '跨年范围两端均未写年份' };
  if (!y1) y1 = y2 ? Number(y2) - Number(crosses) : year;
  if (!y2) y2 = Number(y1) + Number(crosses);
  const from = date(y1, mo1, d1), to = date(y2, mo2, d2);
  if (!from || !to || from > to) return { flag: 'conflict', issue: '日期非法或起止年份冲突' };
  return { from, to, ...(flag ? { flag, issue: qualified ? '来源含适用对象或合并环节限定，不能直接作为本科统一日期' : '来源标注为推测或预估，尚未确认' } : {}) };
}

function eventType(header) {
  if (/补考/i.test(header)) return '补考';
  if (/出分|成绩公布/i.test(header)) return '出分';
  if (/final|考试/i.test(header)) return 'Final';
  if (/midterm|期中.*时间/i.test(header)) return '期中';
  if (/essay|论文/i.test(header)) return 'Essay 截止';
  if (/选课/i.test(header)) return '选课';
  if (/开学|学期开始|开始[（(]教学|开始上课|^T\d开始/i.test(header) && !/结束/.test(header)) return '开学';
  if (/reading|复习周/i.test(header)) return 'Reading Week';
  if (/假期|休息|break/i.test(header)) return '期中假';
  return header;
}

export function parseTimeline(sheets, syncedAt, year = 2026) {
  const result = { source: '飞书《2026海外大学时间线》· 地区明细表', syncedAt, stage: '本科', countries: [], terms: {}, nodes: {}, table: {}, agenda: [], anomalies: [] };
  const labels = new Map();
  // 日期类异常另带 cell（国家、表格行与列、事件类型、各单元格解析出的日期），供人工裁定定位；校名类异常没有。
  const anomaly = (school, issue, a, src, b = '', cell) => result.anomalies.push({ school, issue, a, b, src, ...(cell && { cell }) });
  for (const sheet of sheets) {
    let country, headers, slots;
    for (const row of sheet.rows) {
      const rawSchool = row.values[0]?.trim();
      if (!rawSchool) {
        if (row.values.slice(1).some(v => !empty(v))) anomaly('未标学校', '缺少学校名称', row.values.slice(1).filter(v => !empty(v)).join('；'), `${sheet.name}!A${row.row}`);
        continue;
      }
      const region = Object.keys(countries).find(k => rawSchool === k || rawSchool.startsWith(`${k}（`) || rawSchool.startsWith(`${k}(`));
      if (region) {
        country = countries[region]; headers = row.values;
        const [code, name] = country;
        if (!result.table[code]) { result.countries.push([code, name]); result.table[code] = []; result.nodes[code] = []; labels.set(code, new Map()); }
        result.terms[code] = `${year} · 地区表各学期（含源中明确的跨年日期）`;
        const counts = new Map();
        slots = headers.map((header, col) => {
          if (!col || !header.trim()) return -1;
          const h = header.trim().replace(/\s+/g, ' '), n = (counts.get(h) || 0) + 1;
          counts.set(h, n);
          const key = `${h}|${n}`, known = labels.get(code);
          if (!known.has(key)) { known.set(key, result.nodes[code].length); result.nodes[code].push(n === 1 ? h : `${h}（${n}）`); }
          return known.get(key);
        });
        continue;
      }
      if (!country || !headers) throw failure(502, `${sheet.name} 的地区表头无法识别，未更新快照`);
      const { school, abbr } = schoolName(rawSchool), display = [school, abbr].filter(Boolean).join(' '), [code, name] = country;
      if (!/[\u3400-\u9fff]/.test(school)) anomaly(display, '源表只有缩写，中文校名待核对', rawSchool, `${sheet.name}!A${row.row}`);
      if (rawSchool === 'UCB') anomaly(display, '校名据官方校历交叉匹配，源表无全称，待确认', rawSchool, `${sheet.name}!A${row.row}`);
      if (rawSchool === 'UWM') anomaly(display, '源缩写 UWM 的官网指向 UW–Madison，保留源写法', rawSchool, `${sheet.name}!A${row.row}`);
      const record = { school, abbr, cells: [] };
      const semesterStarts = new Map();
      let autumnStart;
      for (let col = 1; col < row.values.length; col++) {
        const raw = row.values[col], src = `${sheet.name}!${sheet.cols[col]}${row.row}`;
        if (empty(raw)) continue;
        if (!headers[col]?.trim()) { anomaly(display, '本地区列标题缺失，不继承其他地区含义', raw, src); continue; }
        const parsed = parseTimelineDate(raw, headers[col], year);
        if (parsed.empty) continue;
        const type = eventType(headers[col]);
        if (parsed.from && type === '开学' && Number(parsed.from.slice(5, 7)) >= 7) autumnStart = parsed.from;
        if (parsed.from && autumnStart && ['Final', '出分', '补考'].includes(type) && parsed.from < autumnStart) {
          parsed.flag = 'conflict'; parsed.issue = '日期早于同一行此前的下半年开学日期，保留原值待确认';
        }
        if (parsed.from && rawSchool === 'UCB' && !parsed.flag) { parsed.flag = 'guess'; parsed.issue = '校名尚待确认'; }
        const at = { code, row: result.table[code].length, c: name, type, header: headers[col].trim() };
        const here = { src, slot: slots[col], ...(parsed.from && { from: parsed.from, to: parsed.to }) };
        if (parsed.issue) anomaly(display, `${headers[col]}：${parsed.issue}`, raw, src, '', { ...at, cells: [here] });
        if (!parsed.from) continue;
        record.cells[slots[col]] = [parsed.from.slice(5), parsed.to.slice(5), src, ...(parsed.flag ? [parsed.flag] : [])];
        // 精确年份来自原格或文档年份；每条议程保持完整起止。源中疑似冲突不参与需求推导。
        const event = { from: parsed.from, to: parsed.to, c: name, school: display, type, src, ...(parsed.flag ? { flag: parsed.flag } : {}) };
        const semester = headers[col].match(/\b(Semester|S|Term|T)\s*(\d)/i);
        if (type === '开学' && semester) {
          const key = `${semester[1][0].toUpperCase()}${semester[2]}|${parsed.from.slice(0, 4)}`;
          const previous = semesterStarts.get(key);
          if (previous && (previous.event.from !== event.from || previous.event.to !== event.to)) {
            previous.event.flag = event.flag = 'conflict';
            record.cells[previous.slot][3] = record.cells[slots[col]][3] = 'conflict';
            anomaly(display, '同一显式学期的开学日期冲突', previous.raw, `${previous.event.src} / ${src}`, raw, { ...at, cells: [{ src: previous.event.src, slot: previous.slot, from: previous.event.from, to: previous.event.to }, here] });
          } else if (!previous) semesterStarts.set(key, { event, slot: slots[col], raw });
        }
        result.agenda.push(event);
      }
      result.table[code].push(record);
    }
  }
  for (const [code, rows] of Object.entries(result.table)) for (const row of rows) row.cells = Array.from({ length: result.nodes[code].length }, (_, i) => row.cells[i] || null);
  // 同源语义完全相同的重复列仅在需求侧去重；此处保留各自单元格以便追溯。
  result.agenda.sort((a, b) => a.from.localeCompare(b.from) || a.src.localeCompare(b.src));
  return result;
}

// CSV 的行号前缀位于记录外（引号前），不能按物理换行拆多行单元格。
export function parseAnnotatedCsv(data) {
  if (typeof data?.annotated_csv !== 'string' || !Array.isArray(data.col_indices) || !Array.isArray(data.row_indices) || data.has_more || data.truncated) throw failure(502, '飞书地区明细返回不完整');
  const text = data.annotated_csv, rows = [];
  let i = 0;
  while (i < text.length) {
    const match = text.slice(i).match(/^\[row=(\d+)\] /);
    if (!match) throw failure(502, '飞书明细缺少真实行号');
    const row = Number(match[1]); i += match[0].length;
    const values = []; let value = '', quoted = false, ended = false;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') {
        if (quoted && text[i] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && c === ',') { values.push(value); value = ''; }
      else if (!quoted && (c === '\n' || c === '\r')) { if (c === '\r' && text[i] === '\n') i++; ended = true; break; }
      else value += c;
    }
    if (quoted) throw failure(502, '飞书明细 CSV 截断');
    values.push(value);
    if (values.length !== data.col_indices.length) throw failure(502, '飞书明细列数不一致');
    rows.push({ row, values });
    if (!ended) break;
  }
  if (rows.length !== data.row_indices.length || rows.some((r, i) => r.row !== data.row_indices[i])) throw failure(502, '飞书明细行号覆盖不完整');
  return rows;
}

const colName = number => { let value = ''; while (number) { number--; value = String.fromCharCode(65 + number % 26) + value; number = Math.floor(number / 26); } return value; };
export async function readTimelineSheets({ run = execute, source = TIMELINE_SOURCE } = {}) {
  async function call(command, args) {
    let result;
    try {
      const { stdout } = await run('lark-cli', ['--profile', 'codex', 'sheets', command, '--as', 'user', '--spreadsheet-token', source.token, '--format', 'json', ...args], { encoding: 'utf8', timeout: 60_000, maxBuffer: 8 * 1024 * 1024, shell: false });
      result = JSON.parse(stdout);
    } catch (error) { throw failure(error.killed ? 504 : 502, '时间线读取失败，请检查 codex 配置的 lark-cli 用户登录、权限和网络'); }
    if (result.ok !== true || result.identity !== 'user' || !result.data || result.truncated || result.data.truncated) throw failure(502, '飞书未返回完整的用户身份数据');
    return result.data;
  }
  const info = await call('+workbook-info', []);
  if (info.title !== source.title || !Array.isArray(info.sheets) || info.warning_message || !Number.isInteger(info.revision)) throw failure(502, '时间线来源或版本不符，未更新快照');
  const sheets = [];
  for (const name of REGION_SHEETS) {
    const found = info.sheets.filter(s => s.sheet_name === name && s.resource_type === 'sheet' && s.is_hidden === false);
    if (found.length !== 1) throw failure(502, `未能唯一定位地区表：${name}`);
    const s = found[0];
    if (!Number.isInteger(s.row_count) || !Number.isInteger(s.column_count) || s.row_count < 1 || s.row_count > 10000 || s.column_count < 1 || s.column_count > 200) throw failure(502, '时间线表格尺寸异常');
    const range = `A1:${colName(s.column_count)}${s.row_count}`;
    const data = await call('+csv-get', ['--sheet-id', s.sheet_id, '--range', range, '--max-chars', '1000000']);
    if (data.actual_range !== range || data.revision !== info.revision || data.row_count !== s.row_count || data.col_count !== s.column_count) throw failure(502, '时间线读取期间发生变更或范围不完整，请重试');
    sheets.push({ name, cols: data.col_indices, rows: parseAnnotatedCsv(data) });
  }
  const after = await call('+workbook-info', []);
  if (after.revision !== info.revision) throw failure(409, '时间线读取期间发生变更，请重新同步');
  return sheets;
}

export function createTimelineReader(db, { readSheets = readTimelineSheets, now = Date.now, ttl = 600_000, onSource = () => {} } = {}) {
  let cached, pending, at = -Infinity, cachedIdentity;
  return async ({ refresh = false } = {}) => {
    const identity = getSettings(db).timeline_source || JSON.stringify(TIMELINE_SOURCE);
    let source; try { source = JSON.parse(identity); } catch { throw failure(400, '时间线来源配置格式错误'); }
    if (cachedIdentity !== identity) { cached = undefined; at = -Infinity; }
    if (pending) return pending;
    if (!refresh && cached && now() - at >= 0 && now() - at < ttl) return cached;
    pending = (async () => {
      const attemptAt = now();
      try {
        const sheets = await readSheets({ source });
        if ((getSettings(db).timeline_source || JSON.stringify(TIMELINE_SOURCE)) !== identity) throw failure(409, '读取期间来源已修改，请重新同步');
        const payload = parseTimeline(sheets, beijingText(now()));
        if (sheets.length !== 4) throw failure(502, '须完整读取四张地区明细表');
        // 快照身份属于本次成功读取，不能借用最近一次（可能失败的）尝试身份。
        saveSnapshot(db, 'timeline', { identity, value: payload }, new Date(now()).toISOString());
        onSource({ identity, attemptAt, at: new Date(now()).toISOString() });
        cached = payload; cachedIdentity = identity; at = now(); return payload;
      } catch (error) { cached = undefined; at = -Infinity; onSource({ identity, attemptAt, error: error.status ? error.message : '时间线读取失败，请检查来源与访问权限' }); throw error; }
    })();
    try { return await pending; } finally { pending = undefined; }
  };
}
