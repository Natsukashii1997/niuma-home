// 飞书身份唯一出处（常浩 2026-11-02 定）：默认用亚古兽；猛鬼兽只留自言自语（读常浩与猛鬼兽的私聊）和机器人推送。
// open_id 随应用变化：同一个人在两个应用下 open_id 不同，换应用时存下来的 actor 也要迁（见 docs/LESSONS.md L-15）。
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from './db.mjs';

export const AGUMON = Object.freeze({ name: '亚古兽', profile: 'cli_a965c429ef785bd3', appId: 'cli_a965c429ef785bd3', selfUserId: 'ou_6fac84a8164f84c0c591a9b3a98b462c' });
export const MENGGUI = Object.freeze({ name: '猛鬼兽', profile: 'cli_a96f5f9ac63adcd4', appId: 'cli_a96f5f9ac63adcd4', selfUserId: 'ou_5ad2ac4359de95dc41b5e89edd68ae6a' });

export const LARK_CALL_LOG = path.join(dataDir, 'logs', 'lark-calls.jsonl');

// 服务端所有 lark-cli 调用都走这里：按身份补 --profile，并记一行用了哪个应用、什么身份、哪个命令、成败、耗时；不记参数内容。
export async function larkRun(run, identity, args, options) {
  const started = Date.now();
  let ok = false;
  try {
    const out = await run('lark-cli', ['--profile', identity.profile, ...args], options);
    ok = true;
    return out;
  } finally { logLarkCall(identity, args, ok, Date.now() - started); }
}

function logLarkCall(identity, args, ok, ms) {
  const i = args.indexOf('--as');
  const rest = i < 0 ? args : [...args.slice(0, i), ...args.slice(i + 2)];
  const end = rest.findIndex(a => String(a).startsWith('-'));
  const line = { at: new Date().toISOString(), app: identity.name, profile: identity.profile, as: i < 0 ? 'auto' : args[i + 1], command: rest.slice(0, end < 0 ? rest.length : end).join(' '), ok, ms };
  try {
    mkdirSync(path.dirname(LARK_CALL_LOG), { recursive: true });
    appendFileSync(LARK_CALL_LOG, JSON.stringify(line) + '\n');
  } catch { /* 记录失败不影响飞书调用 */ }
}
