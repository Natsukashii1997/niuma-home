import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { AGUMON, MENGGUI, LARK_CALL_LOG, larkRun } from '../server/lark-identity.mjs';

const logged = command => readFileSync(LARK_CALL_LOG, 'utf8').trim().split('\n').map(line => JSON.parse(line)).filter(r => r.command === command);

test('larkRun 按身份补 --profile，每次调用记一行身份、命令与成败，不记参数内容', async () => {
  const calls = [];
  const out = await larkRun(async (cmd, args, options) => { calls.push({ cmd, args, options }); return { stdout: '{}' }; },
    AGUMON, ['probe', '+ok', '--as', 'bot', '--content', '机密正文'], { shell: false });
  assert.deepEqual(out, { stdout: '{}' });
  assert.deepEqual(calls, [{ cmd: 'lark-cli', args: ['--profile', AGUMON.profile, 'probe', '+ok', '--as', 'bot', '--content', '机密正文'], options: { shell: false } }]);
  await assert.rejects(larkRun(async () => { throw new Error('boom'); }, MENGGUI, ['--as', 'user', 'probe', '+fail']), /boom/);
  const [ok] = logged('probe +ok'), [bad] = logged('probe +fail');
  assert.equal(ok.app, '亚古兽'); assert.equal(ok.profile, AGUMON.profile); assert.equal(ok.as, 'bot'); assert.equal(ok.ok, true);
  assert.equal(bad.app, '猛鬼兽'); assert.equal(bad.profile, MENGGUI.profile); assert.equal(bad.as, 'user'); assert.equal(bad.ok, false);
  assert.ok(!readFileSync(LARK_CALL_LOG, 'utf8').includes('机密正文'));
});

test('身份分配：自言自语与推送留猛鬼兽，其余服务端模块用亚古兽；lark-cli 只经 larkRun 调用', () => {
  const dir = new URL('../server/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.mjs') && f !== 'lark-identity.mjs')) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(src, /run\(\s*['"]lark-cli['"]/, `${file} 直接调用了 lark-cli`);
    const uses = (src.match(/\b(AGUMON|MENGGUI)\b/g) || []);
    if (['selftalk.mjs', 'codex-push.mjs'].includes(file)) assert.ok(uses.length && uses.every(u => u === 'MENGGUI'), `${file} 应只用猛鬼兽`);
    else assert.ok(uses.every(u => u === 'AGUMON'), `${file} 应只用亚古兽`);
  }
});
