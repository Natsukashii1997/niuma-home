import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { getSettings } from './db.mjs';
import { codexResetView, endpoint, isTime, monthDay, stages, userAgent } from './codex-reset.mjs';
import { SELF_APP_ID, SELF_USER_ID } from './selftalk.mjs';
import { beijingText } from './v3-common.mjs';

// 机械邪龙兽推送 Codex 重置（用户 2026-10-18 确定）：每 4 小时检查一次；同一次重置（同一事件）只推一次；
// 开启推送时已有的事件不推；一次检查发现多条新事件只推最新一条。
// 发送失败：飞书明确拒绝的记原因，下次检查再试，最多 3 次；超时、输出无法确认的记为「结果不明」，不自动重试。
export const PUSH_INTERVAL = 4 * 3600_000;
export const PUSH_KEY = 'codex_push_enabled';
const MAX_ATTEMPTS = 3;
const execute = promisify(execFile);

const readState = db => {
  const row = db.prepare("SELECT payload FROM v3_documents WHERE kind='codex-push' AND id='state'").get();
  return row ? JSON.parse(row.payload) : {};
};
const writeState = (db, state, now) => db.prepare(`INSERT INTO v3_documents(kind,id,payload,updated_at) VALUES('codex-push','state',?,?)
  ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`).run(JSON.stringify(state), new Date(now).toISOString());
const saveRow = (db, id, row, now) => db.prepare(`INSERT INTO codex_push(event_id,status,stage,summary,attempts,error,message_id,updated_at) VALUES(?,?,?,?,?,?,?,?)
  ON CONFLICT(event_id) DO UPDATE SET status=excluded.status,stage=excluded.stage,summary=excluded.summary,attempts=excluded.attempts,error=excluded.error,message_id=excluded.message_id,updated_at=excluded.updated_at`)
  .run(id, row.status, row.stage || '', row.summary || '', row.attempts || 0, row.error || null, row.messageId || null, new Date(now).toISOString());

// 可推送的重置事件：预告或已确认、未被撤回、有对应帖子。at = 事件最近一次动静的时间，用来挑「最新一条」。
export function pushCandidates(source) {
  codexResetView(source); // 结构校验与首页同一套，不合格直接抛错
  const signals = source.activities.filter(p => p.kind === 'event_update' && stages[p.action]);
  const desc = (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  return source.events.filter(e => typeof e?.id === 'string' && e.id && ['announced', 'confirmed'].includes(e.status)).map(e => {
    const own = signals.filter(p => p.eventIds?.includes(e.id)).sort(desc);
    const post = own[0] || (e.posts || []).filter(p => isTime(p.publishedAt) && typeof p.originalText === 'string').sort(desc)[0];
    const at = Math.max(0, ...[e.createdAt, e.confirmedAt, post?.publishedAt].filter(isTime).map(Date.parse));
    // 已确认的事件可能只收录了预告帖：那时帖子原话只是预告，不能当作确认结论。
    const postIsConfirm = own[0] ? own[0].action === 'confirm' : post?.stage === '确认';
    return { id: e.id, confirmed: e.status === 'confirmed', postIsConfirm, withdrawn: own[0]?.action === 'withdraw', post, at, confirmedAt: e.confirmedAt, schedule: e.schedule, inferred: !!e.presentation?.timeInferred };
  }).filter(e => !e.withdrawn && e.post && e.at > 0).sort((a, b) => b.at - a.at);
}

const esc = text => String(text).replace(/[<>*~_[\]#`\\]/g, c => `&#${c.charCodeAt(0)};`);
const authorOf = url => { try { const u = new URL(url); if (['x.com', 'twitter.com'].includes(u.hostname) && /^\/[^/]+\/status\/\d+$/.test(u.pathname)) return u.pathname.split('/')[1]; } catch { /* 无作者不猜 */ } return ''; };
const postUrl = url => { try { const u = new URL(url); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; } };

const headline = c => c.confirmed && !c.postIsConfirm ? 'Codex 额度已重置' : c.post.text || c.post.originalText;
export function cardSummary(c) {
  return `${c.confirmed ? '已确认' : '预告'}：${headline(c)}`;
}

// 飞书卡片 2.0：标题说是什么，色块里一句中文结论是唯一焦点，下面两列是状态和时间，按钮看原帖。
export function resetCard(c) {
  const stage = c.confirmed ? '已确认' : '预告', tone = c.confirmed ? 'green' : 'orange';
  const text = headline(c), said = c.post.text || c.post.originalText;
  const quote = c.post.text && c.post.originalText && c.post.originalText !== c.post.text ? c.post.originalText : '';
  const notes = [...(text !== said ? [`预告原话：${said}`] : []), ...(quote ? [quote] : [])];
  const when = c.confirmed ? (isTime(c.confirmedAt) ? monthDay(c.confirmedAt) : '已确认，时间未公布') : (c.schedule?.label && !c.inferred ? c.schedule.label : '具体时间未公布');
  const author = authorOf(c.post.url), url = postUrl(c.post.url);
  const field = (label, value) => ({ tag: 'column', width: 'weighted', weight: 1, elements: [{ tag: 'markdown', content: `<font color='grey'>${label}</font>\n**${esc(value)}**` }] });
  return {
    schema: '2.0',
    config: { width_mode: 'default', summary: { content: `Codex 额度重置${cardSummary(c)}`.slice(0, 60) } },
    header: {
      title: { tag: 'plain_text', content: 'Codex 额度重置' },
      subtitle: { tag: 'plain_text', content: `${author ? `@${author}` : 'Tibo'} · 发布于 ${monthDay(c.post.publishedAt)}` },
      template: tone,
      text_tag_list: [{ tag: 'text_tag', text: { tag: 'plain_text', content: stage }, color: tone }],
    },
    body: {
      direction: 'vertical', padding: '12px 12px 16px 12px', vertical_spacing: '12px',
      elements: [
        { tag: 'column_set', background_style: `${tone}-50`, columns: [{ tag: 'column', width: 'weighted', weight: 1, padding: '12px', vertical_spacing: '4px', elements: [
          { tag: 'markdown', content: `**${esc(text)}**` },
          ...notes.map(note => ({ tag: 'markdown', content: `<font color='grey'>${esc(note)}</font>`, text_size: 'notation' })),
        ] }] },
        { tag: 'column_set', flex_mode: 'none', columns: [field('状态', c.confirmed ? '额度已重置' : '即将重置'), field(c.confirmed ? '确认时间' : '预计时间', when)] },
        ...(url ? [{ tag: 'button', text: { tag: 'plain_text', content: '查看原帖' }, type: 'primary_filled', width: 'fill', behaviors: [{ type: 'open_url', default_url: url }] }] : []),
        { tag: 'markdown', content: "<font color='grey'>来源 aihot.news · 牛马之家每 4 小时检查一次，同一次重置只推一次</font>", text_size: 'notation' },
      ],
    },
  };
}

const parse = text => { try { return JSON.parse(text); } catch { return null; } };
const reason = out => String(out?.error?.message || out?.error?.msg || out?.msg || JSON.stringify(out?.error || out)).slice(0, 300);

// 机器人身份发给本人；只用本机 codex 配置，不在代码里写 token。返回 sent / failed（明确没发出）/ unknown（结果不明）。
export async function sendResetCard(card, eventId, { run = execute } = {}) {
  const key = `codex-reset-${createHash('sha256').update(eventId).digest('hex').slice(0, 32)}`;
  const args = ['--profile', 'codex', 'im', '+messages-send', '--as', 'bot', '--user-id', SELF_USER_ID, '--msg-type', 'interactive', '--content', JSON.stringify(card), '--idempotency-key', key, '--format', 'json'];
  let stdout;
  try {
    ({ stdout } = await run('lark-cli', args, { encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024, shell: false, env: { ...process.env, LARKSUITE_CLI_NO_UPDATE_NOTIFIER: '1', LARKSUITE_CLI_NO_SKILLS_NOTIFIER: '1' } }));
  } catch (error) {
    if (error.code === 'ENOENT') return { status: 'failed', error: '未找到 lark-cli，没有发出' };
    if (error.killed) return { status: 'unknown', error: 'lark-cli 超时，发送结果不明，请到飞书核对' };
    const out = parse(error.stdout) || parse(error.stderr);
    if (out?.ok === false) return { status: 'failed', error: `飞书拒绝：${reason(out)}` };
    return { status: 'unknown', error: 'lark-cli 异常退出，发送结果不明，请到飞书核对' };
  }
  const out = parse(stdout), messageId = out?.data?.message_id;
  if (out?.ok === true && out.identity === 'bot' && /^om_/.test(messageId || '')) return { status: 'sent', messageId };
  if (out?.ok === false) return { status: 'failed', error: `飞书拒绝：${reason(out)}` };
  return { status: 'unknown', error: 'lark-cli 返回内容无法确认是否已发送，请到飞书核对' };
}

async function fetchSource(fetcher) {
  const response = await fetcher(endpoint, { headers: { 'User-Agent': await userAgent() }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Codex 重置数据源不可用（${response.status}）`);
  return response.json();
}

export function createCodexPush(db, { fetcher = fetch, run = execute, now = Date.now } = {}) {
  let running;
  async function check() {
    const instant = now(), state = readState(db);
    let candidates;
    try { candidates = pushCandidates(await fetchSource(fetcher)); }
    catch (error) {
      writeState(db, { ...state, lastCheckAt: instant, lastCheckError: String(error.message || error).slice(0, 300) }, instant);
      return;
    }
    const rows = new Map(db.prepare('SELECT * FROM codex_push').all().map(r => [r.event_id, r]));
    const fresh = candidates.filter(c => !rows.has(c.id));
    // 刚开启后的第一次成功检查：已有的事件全部记为不推，从下一次检查起只推新事件。
    if (state.baseline) {
      for (const c of fresh) saveRow(db, c.id, { status: 'skipped', stage: c.confirmed ? '已确认' : '预告', summary: cardSummary(c), error: '开启推送前已有，不推' }, instant);
      writeState(db, { ...state, baseline: false, lastCheckAt: instant, lastCheckError: null }, instant);
      return;
    }
    const [newest] = candidates;
    for (const c of fresh) if (c !== newest) saveRow(db, c.id, { status: 'skipped', stage: c.confirmed ? '已确认' : '预告', summary: cardSummary(c), error: '同一次检查有更新的重置消息，只推最新一条' }, instant);
    const row = newest && rows.get(newest.id);
    if (newest && (!row || row.status === 'failed' && row.attempts < MAX_ATTEMPTS)) {
      const base = { stage: newest.confirmed ? '已确认' : '预告', summary: cardSummary(newest), attempts: (row?.attempts || 0) + 1 };
      // 先落「发送中」再发：进程中途退出时留下的是结果不明，不会重发。
      saveRow(db, newest.id, { ...base, status: 'unknown', error: '正在发送；如停在这里，说明发送中断，结果不明' }, instant);
      const result = await sendResetCard(resetCard(newest), newest.id, { run });
      saveRow(db, newest.id, { ...base, ...result, error: result.status === 'failed' && base.attempts >= MAX_ATTEMPTS ? `${result.error}（已试 ${MAX_ATTEMPTS} 次，不再重试）` : result.error }, now());
    }
    writeState(db, { ...state, lastCheckAt: instant, lastCheckError: null }, instant);
  }
  // 定时器每 10 分钟调一次：刚开启立即检查，之后距上次检查满 4 小时才检查（失败也等 4 小时）；关掉推送时清掉开启时间。
  async function tick() {
    if (running) return running;
    running = (async () => {
      const enabled = getSettings(db)[PUSH_KEY] === '1', state = readState(db);
      if (!enabled) { if (state.enabledSince) writeState(db, { ...state, enabledSince: null, baseline: false }, now()); return; }
      if (!state.enabledSince) writeState(db, { ...state, enabledSince: now(), baseline: true, lastCheckAt: null }, now());
      else if (state.lastCheckAt && now() - state.lastCheckAt < PUSH_INTERVAL) return;
      await check();
    })();
    try { return await running; } finally { running = undefined; }
  }
  return { tick };
}

export function codexPushStatus(db) {
  const enabled = getSettings(db)[PUSH_KEY] === '1', state = readState(db);
  const last = db.prepare("SELECT * FROM codex_push WHERE status <> 'skipped' ORDER BY updated_at DESC, event_id LIMIT 1").get();
  const time = ms => (Number.isFinite(ms) ? beijingText(new Date(ms).toISOString()) : null);
  return {
    enabled, interval: '每 4 小时', sender: `机械邪龙兽（${SELF_APP_ID}，机器人身份）`, recipient: '常浩本人（飞书私聊）',
    enabledSince: enabled ? time(state.enabledSince) : null,
    lastCheck: state.lastCheckAt ? { at: time(state.lastCheckAt), error: state.lastCheckError || null } : null,
    nextCheck: enabled ? (state.enabledSince && state.lastCheckAt ? time(state.lastCheckAt + PUSH_INTERVAL) : '10 分钟内') : null,
    baseline: enabled && !!state.baseline,
    lastPush: last ? { eventId: last.event_id, status: last.status, stage: last.stage, summary: last.summary, attempts: last.attempts, error: last.error, at: beijingText(last.updated_at) } : null,
  };
}
