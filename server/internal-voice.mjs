// 内部原声（#49）：从公司企微会话存档（x.lumiclass.com，只读）拉取大学辅导、国际课程销售与学生的对话。
// 只存两类：客户单聊的全部消息（含销售的话，留上下文）+ 群聊里客户本人的发言；不看申诉部门。
// 拉取方式：每周拉上一周、每月拉上个月（设置 internal_voice_auto 开着才自动拉），以及手动按日期范围拉（预览 → 确认）。
// 接口 token 只放 macOS 钥匙串（niuma-home.lumist / lumist-pat），不进仓库、日志和页面。
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getSettings } from './db.mjs';
import { failure } from './v3-common.mjs';

export const LUMIST_BASE = 'https://x.lumiclass.com';
export const AUTO_KEY = 'internal_voice_auto';
// 大学辅导 = 大学销售企微-*，国际课程 = 国课销售企微-*；销售企微申诉部不拉（常浩 2026-11-10）。
export const LINES = [{ name: '大学辅导', dept: /^大学销售企微-/ }, { name: '国际课程', dept: /^国课销售企微-/ }];
export const lineOf = dept => LINES.find(l => l.dept.test(dept || ''))?.name ?? null;
export const MAX_DAYS = 31;
const CUSTOMER = 1;
const KEYCHAIN = ['-s', 'niuma-home.lumist', '-a', 'lumist-pat'];
const fail = (status, code, message) => Object.assign(failure(status, message), { code });

export function keychainToken() {
  try { return execFileSync('security', ['find-generic-password', ...KEYCHAIN, '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null; }
  catch { return null; }
}

// 北京时间的日期运算（接口的 msg_time 与筛选参数都是北京时间）
const DAY = 86_400_000;
const bjDate = ms => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
const dayMs = date => Date.parse(`${date}T00:00:00Z`);
const addDays = (date, n) => new Date(dayMs(date) + n * DAY).toISOString().slice(0, 10);
const validDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(dayMs(d)).toISOString().slice(0, 10) === d;
// 上一周：周一至周日；上个月：1 日至月底。
export function lastWeek(now) {
  const today = bjDate(now), weekday = (new Date(dayMs(today)).getUTCDay() + 6) % 7; // 周一 = 0
  const monday = addDays(today, -weekday - 7);
  return { from: monday, to: addDays(monday, 6) };
}
export function lastMonth(now) {
  const first = `${bjDate(now).slice(0, 7)}-01`, to = addDays(first, -1);
  return { from: `${to.slice(0, 7)}-01`, to };
}
export function checkRange(from, to, now) {
  if (!validDate(from) || !validDate(to)) throw fail(400, 'RANGE_INVALID', '日期须为 YYYY-MM-DD');
  if (from > to) throw fail(400, 'RANGE_INVALID', '开始日期不能晚于结束日期');
  if (to > bjDate(now)) throw fail(400, 'RANGE_INVALID', '结束日期不能晚于今天');
  const days = (dayMs(to) - dayMs(from)) / DAY + 1;
  if (days > MAX_DAYS) throw fail(400, 'RANGE_TOO_LONG', `一次最多拉 ${MAX_DAYS} 天，请分段拉取`);
  return days;
}

// 消息正文：文字原文；链接取标题、描述、地址；合并转发展平；撤回记被撤回的 msg_id；媒体不存正文（只存长期有效的 file_url）。
export function contentOf(m) {
  const raw = m.raw_content && typeof m.raw_content === 'object' ? m.raw_content : {};
  if (m.msg_type === 'text') return String(m.msg_content ?? raw.content ?? '');
  if (m.msg_type === 'link') return [raw.title, raw.description, raw.link_url].filter(Boolean).join('\n');
  if (m.msg_type === 'revoke') return String(raw.pre_msgid ?? '');
  if (m.msg_type === 'chatrecord') {
    const lines = (Array.isArray(raw.item) ? raw.item : []).map(it => {
      let c = it?.content;
      try { c = JSON.parse(c); } catch {}
      return typeof c === 'string' ? c : (c?.content ?? c?.title ?? '');
    }).filter(Boolean);
    return [`[聊天记录·${raw.title || ''}]`, ...lines].join('\n');
  }
  return '';
}
const roleOf = m => Number(m.from_role?.value ?? m.from_role) || null;
const nameOf = m => (m.from_detail && !Array.isArray(m.from_detail) && (m.from_detail.external_name || m.from_detail.name)) || null;

// 有限并发：一次最多 n 个请求，别压公司服务器。stop() 为真时各路不再取新任务。
async function pool(items, n, fn, stop = () => false) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length && !stop()) await fn(items[i++]); }));
}

export function createInternalVoice(db, { fetchImpl = fetch, token = keychainToken, base = LUMIST_BASE, now = Date.now, concurrency = 3, timeoutMs = 60_000, resetInterrupted = true,
  wait = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  let running = null;
  const previews = new Map();
  const iso = () => new Date(now()).toISOString();
  // 服务重启时还标着 running 的，一定是被打断的（命令行试拉传 resetInterrupted=false，不碰服务那边的记录）
  if (resetInterrupted) db.prepare("UPDATE chat_pull_runs SET state='failed', error='服务重启，本次拉取中断', finished_at=? WHERE state='running'").run(iso());

  async function api(path, auth) {
    for (let attempt = 1; ; attempt++) {
      let status = 0, body = null;
      try {
        const res = await fetchImpl(base + path, { headers: { Authorization: `Bearer ${auth}` }, signal: AbortSignal.timeout(timeoutMs) });
        status = res.status;
        body = await res.json().catch(() => null);
      } catch {}
      if (status === 401) throw fail(502, 'LUMIST_UNAUTHORIZED', '会话存档接口不认这个 token（可能已过期或被吊销），请更新钥匙串里的 token');
      if (status === 403) throw fail(502, 'LUMIST_FORBIDDEN', '这个 token 没有会话存档查看权限');
      if (body?.status === 'success') return body.data;
      if (attempt >= 3 || (status >= 400 && status < 500 && status !== 429)) throw fail(502, 'LUMIST_FAILED', `会话存档接口读取失败（HTTP ${status || '无响应'}）`);
      await wait(attempt * 1000);
    }
  }
  // 翻页拉完；each 返回 false 时提前停。
  async function pages(path, size, auth, each) {
    for (let page = 1; ; page++) {
      const d = await api(`${path}${path.includes('?') ? '&' : '?'}page=${page}&${size}`, auth);
      if (each(d.items || []) === false || !d.items?.length || page >= (d.total_page || 1)) return;
    }
  }

  async function execute(runId, from, to, auth) {
    const start = `${from} 00:00:00`, end = `${to} 23:59:59`;
    const range = `msg_start_time=${encodeURIComponent(start)}&msg_end_time=${encodeURIComponent(end)}`;
    const stats = { staff: 0, singles: 0, groups: 0, conversationsDone: 0, conversationsFailed: 0, messages: 0, customerMessages: 0, voice: 0 };
    let aborted = null; // 第一个让整次失败的错误；记下后各路不再取新任务
    // 只改还在 running 的记录：结束状态只写一次，中途的进度不会把它改回 running
    const save = (state, error) => db.prepare("UPDATE chat_pull_runs SET state=?, stats=?, error=?, finished_at=? WHERE id=? AND state='running'")
      .run(state, JSON.stringify(stats), error ?? null, state === 'running' ? null : iso(), runId);
    const insert = db.prepare(`INSERT OR IGNORE INTO chat_messages (msg_id,conversation_id,kind,msg_time,msg_type,from_id,from_role,from_name,content,file_name,file_url,run_id,fetched_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const upsert = db.prepare(`INSERT INTO chat_conversations (id,kind,staff_userid,staff_name,staff_dept,customer_id,customer_name,customer_remark,name,last_msg_time,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_msg_time=NULLIF(MAX(COALESCE(last_msg_time,''),COALESCE(excluded.last_msg_time,'')),''),
      customer_name=COALESCE(excluded.customer_name,customer_name), customer_remark=COALESCE(excluded.customer_remark,customer_remark), name=COALESCE(excluded.name,name), updated_at=excluded.updated_at`);
    const guard = fn => async item => { try { await fn(item); } catch (error) { aborted ??= error; } };
    try {
      // 1. 员工：只要两条业务线、有会话的
      const staff = [];
      // 这个接口的分页参数是 limit，size 不生效（L-19）
      await pages('/api/staff/list', 'limit=100', auth, items => { staff.push(...items.filter(s => lineOf(s.department_name) && s.has_conversation)); });
      stats.staff = staff.length;
      // 2. 每人在范围内有消息的会话。列表按最近消息倒序：早于开始日期就停；
      //    翻页期间有会话来了新消息会跳回第 1 页，所以翻完再看第 1 页，直到没有没见过的会话（最多 5 次）。
      const singles = new Map(), groups = new Map();
      await pool(staff, concurrency, guard(async s => {
        for (const kind of ['customer', 'room']) {
          const path = `/api/chats/by/staff/${kind}/conversation/list?staff_userid=${encodeURIComponent(s.userid)}`;
          let fresh = 0;
          const take = items => {
            let older = false;
            for (const it of items) {
              if ((it.last_msg_time || '') < start) { older = true; continue; }
              const map = kind === 'customer' ? singles : groups, key = kind === 'customer' ? it.id : it.chat_id;
              if (!map.has(key)) { map.set(key, { it, s }); fresh++; }
            }
            return !older;
          };
          await pages(path, 'size=100', auth, take);
          for (let round = 0; round < 5; round++) {
            fresh = 0;
            take((await api(`${path}&page=1&size=100`, auth)).items || []);
            if (!fresh) break;
          }
        }
      }), () => aborted);
      if (aborted) throw aborted;
      stats.singles = singles.size; stats.groups = groups.size;
      save('running');
      // 3. 每个会话按日期范围拉消息；群聊只留客户本人的发言；范围内没有消息的会话不记
      const jobs = [...[...singles.values()].map(x => ({ ...x, kind: 'single' })), ...[...groups.entries()].map(([id, x]) => ({ ...x, id, kind: 'group' }))];
      await pool(jobs, concurrency, guard(async job => {
        const { it, s, kind } = job, id = kind === 'single' ? it.id : job.id, rows = [];
        const path = kind === 'single' ? `/api/chats/by/conversation/message/list?conversation_id=${encodeURIComponent(id)}&${range}`
          : `/api/chats/by/group/message/list?group_chat_id=${encodeURIComponent(id)}&${range}`;
        try {
          await pages(path, 'size=500', auth, items => { rows.push(...items.filter(m => kind === 'single' || roleOf(m) === CUSTOMER)); });
        } catch (error) {
          if (error.code === 'LUMIST_UNAUTHORIZED' || error.code === 'LUMIST_FORBIDDEN') throw error;
          stats.conversationsFailed++;
          return;
        }
        if (aborted) return;
        if (rows.length) {
          const at = iso();
          db.exec('BEGIN IMMEDIATE');
          try {
            upsert.run(id, kind, s.userid, s.name, s.department_name, kind === 'single' ? it.external_userid ?? null : null, kind === 'single' ? it.external_name ?? null : null,
              kind === 'single' ? it.staff_remark ?? null : null, kind === 'group' ? it.name ?? null : null, it.last_msg_time ?? null, at);
            for (const m of rows) {
              if (!m.msg_id || !m.msg_time) continue;
              const added = insert.run(m.msg_id, id, kind, String(m.msg_time).replace('T', ' ').slice(0, 19), m.msg_type || '', m.from ?? null, roleOf(m), nameOf(m),
                contentOf(m), m.file_name ?? null, m.file_url ?? null, runId, at).changes;
              if (!added) continue;
              stats.messages++;
              if (roleOf(m) === CUSTOMER) stats.customerMessages++;
              if (m.msg_type === 'voice') stats.voice++;
            }
            db.exec('COMMIT');
          } catch (error) { db.exec('ROLLBACK'); throw error; }
        }
        stats.conversationsDone++;
        if (stats.conversationsDone % 50 === 0) save('running');
      }), () => aborted);
      if (aborted) throw aborted;
      save(stats.conversationsFailed ? 'partial' : 'done', stats.conversationsFailed ? `${stats.conversationsFailed} 个会话重试 3 次仍读取失败，再拉一次可补齐` : null);
    } catch (error) {
      if (!error.status) console.error('内部原声拉取失败', error);
      save('failed', error.status ? error.message : '拉取失败，详情见服务日志');
    }
  }

  function start({ from, to, trigger }) {
    checkRange(from, to, now());
    if (running) throw fail(409, 'PULL_RUNNING', '已有一次拉取在进行，等它结束再拉');
    const auth = token();
    if (!auth) throw fail(503, 'LUMIST_TOKEN_MISSING', '钥匙串里没有会话存档 token（niuma-home.lumist / lumist-pat）');
    const runId = Number(db.prepare("INSERT INTO chat_pull_runs (trigger,range_from,range_to,state,started_at) VALUES (?,?,?,'running',?)").run(trigger, from, to, iso()).lastInsertRowid);
    // 连记失败都写不进库（库被锁、磁盘满）时也只打日志，不让未处理的 rejection 拖垮服务
    running = execute(runId, from, to, auth).catch(error => console.error('内部原声拉取收尾失败', error)).finally(() => { running = null; });
    return { runId, done: running };
  }

  const runRow = r => r && { id: r.id, trigger: r.trigger, from: r.range_from, to: r.range_to, state: r.state, stats: JSON.parse(r.stats), error: r.error, startedAt: r.started_at, finishedAt: r.finished_at };
  // 自动拉取只把 done（和正在跑的）算拉过；partial、failed 下个小时再拉，重复消息靠 msg_id 去重
  const covered = (trigger, { from, to }) => !!db.prepare("SELECT 1 FROM chat_pull_runs WHERE trigger=? AND range_from=? AND range_to=? AND state IN ('done','running')").get(trigger, from, to);

  return {
    // 手动拉取第一步：只核对范围并说明会拉什么，不连接口、不写数据；返回 previewId，10 分钟内确认有效。
    preview({ from, to } = {}) {
      const days = checkRange(from, to, now());
      const existing = db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE msg_time BETWEEN ? AND ?").get(`${from} 00:00:00`, `${to} 23:59:59`).n;
      const previewId = randomUUID();
      for (const [id, p] of previews) if (now() - p.at > 600_000) previews.delete(id);
      previews.set(previewId, { from, to, at: now() });
      return { previewId, from, to, days, lines: LINES.map(l => l.name), scope: '客户单聊的全部消息 + 群聊里客户本人的发言', existing, tokenConfigured: !!token(), running: !!running };
    },
    confirm({ previewId } = {}) {
      const p = previews.get(previewId);
      if (!p || now() - p.at > 600_000) throw fail(409, 'PREVIEW_EXPIRED', '预览已失效，请重新预览');
      previews.delete(previewId);
      return { runId: start({ from: p.from, to: p.to, trigger: 'manual' }).runId };
    },
    start,
    // 自动拉取：开关开着、上一周（或上个月）还没拉过就拉；一次只拉一个，先周后月。服务每小时调一次。
    tick() {
      if (running || getSettings(db)[AUTO_KEY] !== '1') return null;
      for (const [trigger, range] of [['weekly', lastWeek(now())], ['monthly', lastMonth(now())]]) {
        if (covered(trigger, range)) continue;
        try { return start({ ...range, trigger }); }
        catch (error) { console.error('内部原声自动拉取没有开始：', error.message); return null; }
      }
      return null;
    },
    status() {
      const count = db.prepare("SELECT COUNT(*) messages, SUM(from_role=1) customerMessages, COUNT(DISTINCT conversation_id) conversations, MIN(msg_time) earliest, MAX(msg_time) latest FROM chat_messages").get();
      return {
        auto: getSettings(db)[AUTO_KEY] === '1', tokenConfigured: !!token(), lines: LINES.map(l => l.name), maxDays: MAX_DAYS,
        schedule: [['weekly', '每周拉上一周', lastWeek(now())], ['monthly', '每月拉上个月', lastMonth(now())]].map(([trigger, label, range]) => ({ trigger, label, ...range, pulled: covered(trigger, range) })),
        stored: { messages: count.messages, customerMessages: count.customerMessages ?? 0, conversations: count.conversations, earliest: count.earliest, latest: count.latest },
        runs: db.prepare('SELECT * FROM chat_pull_runs ORDER BY id DESC LIMIT 10').all().map(runRow),
      };
    },
  };
}

// 服务里只有一个实例（路由和每小时的自动检查共用，保证同一时间只有一次拉取）。
const instances = new WeakMap();
export function internalVoiceFor(db, options) {
  if (!instances.has(db)) instances.set(db, createInternalVoice(db, options));
  return instances.get(db);
}
