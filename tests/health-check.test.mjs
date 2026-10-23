import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ymd = (daysAgo, sep = '-') => {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join(sep);
};
const monthLog = daysAgo => `${ymd(daysAgo).slice(0, 7)}.log`;

// 在临时 HOME / base 里跑真实的 health-check.sh；只把外部边界换成桩：
// verify-release.sh、sqlite3、df、osascript。不碰真实服务、数据库，也不弹通知。
function scenario(t, { verifyExit, verifyOut, sqlite, freeKb, backupFail = false, logLines = [], dailyBackups = 0, launchdLines = 0 }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workdesk-health-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (file, text, mode = 0o644) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text, { mode }); };
  put('repo/scripts/health-check.sh', fs.readFileSync(new URL('../scripts/health-check.sh', import.meta.url)));
  put('repo/scripts/verify-release.sh', `printf '%s\\n' "${verifyOut}"\nexit ${verifyExit}\n`);
  // .backup 真的落一个文件（或按需失败）；其余查询返回固定文本
  put('bin/sqlite3', `#!/bin/sh\ncase "$*" in *".backup "*) f=$(printf '%s' "$*" | sed "s/.*\\.backup '\\(.*\\)'.*/\\1/"); ${backupFail ? 'echo "Error: unable to open database file"; exit 1' : 'printf "db" > "$f"'};; *) printf '%s\\n' "${sqlite}";; esac\n`, 0o755);
  put('bin/df', `#!/bin/sh\nprintf 'Filesystem 1024-blocks Used Available Capacity Mounted\\n/dev/x 1 1 ${freeKb} 1%% /\\n'\n`, 0o755);
  put('bin/osascript', `#!/bin/sh\ncat > /dev/null\nprintf '%s\\n' "$@" >> "${path.join(root, 'notify.txt')}"\n`, 0o755);
  put('data/work-desk.db', 'db');
  put('home/Library/LaunchAgents/cn.niuma-home.server.plist', `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>EnvironmentVariables</key><dict><key>WORKDESK_DATA_DIR</key><string>${path.join(root, 'data')}</string></dict></dict></plist>\n`);
  put('base/backups/work-desk-20261001-120000-before-nm-20261001-120000-c118a0b.db', '');
  for (let i = 1; i <= dailyBackups; i++) put(`base/backups/work-desk-${ymd(i, '')}-daily.db`, '');
  for (const [daysAgo, text] of logLines) fs.appendFileSync((fs.mkdirSync(path.join(root, 'base/evidence/health'), { recursive: true }), path.join(root, 'base/evidence/health', monthLog(daysAgo))), `${ymd(daysAgo)} 08:30  ${text}\n`);
  if (launchdLines) put('base/evidence/health/launchd.log', Array.from({ length: launchdLines }, (_, i) => `第 ${i + 1} 行`).join('\n') + '\n');
  const result = spawnSync('/bin/bash', [path.join(root, 'repo/scripts/health-check.sh')], {
    encoding: 'utf8', env: { ...process.env, HOME: path.join(root, 'home'), NIUMA_BASE: path.join(root, 'base'), NIUMA_LABEL: 'cn.niuma-home.server', PATH: `${path.join(root, 'bin')}:${process.env.PATH}` },
  });
  const read = file => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
  const backups = fs.readdirSync(path.join(root, 'base/backups')).sort();
  return { ...result, root, backups, log: read(`base/evidence/health/${monthLog(0)}`), launchd: read('base/evidence/health/launchd.log'), notify: read('notify.txt') };
}

test('巡检全部通过：做今日备份并只留 7 份、裁剪 launchd.log，退出码 0，日志记「通过」，不弹通知', t => {
  const r = scenario(t, { verifyExit: 0, verifyOut: '✓ launchd 指向 nm-x', sqlite: 'ok', freeKb: 10 * 1024 * 1024, logLines: [[1, '通过']], dailyBackups: 9, launchdLines: 600 });
  t.diagnostic(r.stdout + r.stderr);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /✓ 每日备份 work-desk-\d{8}-daily\.db 回读 ok/);
  assert.match(r.stdout, /✓ 昨天（\d{4}-\d{2}-\d{2}）有巡检记录/);
  const daily = r.backups.filter(f => f.endsWith('-daily.db'));
  assert.deepEqual(daily, [ymd(6, ''), ymd(5, ''), ymd(4, ''), ymd(3, ''), ymd(2, ''), ymd(1, ''), ymd(0, '')].sort().map(d => `work-desk-${d}-daily.db`), '最老的 3 份被清掉，发布前备份不动');
  assert.ok(r.backups.includes('work-desk-20261001-120000-before-nm-20261001-120000-c118a0b.db'));
  assert.equal(r.launchd.split('\n').filter(Boolean).length, 300);
  assert.match(r.log, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} {2}通过\n$/m);
  assert.equal(r.notify, '');
});

test('首次运行没有任何记录：不查昨天，照常通过', t => {
  const r = scenario(t, { verifyExit: 0, verifyOut: '✓', sqlite: 'ok', freeKb: 10 * 1024 * 1024 });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /✓ 首次运行，不查昨天的记录/);
});

test('巡检有项不过：昨天缺记录、备份失败都算，退出码 1，日志逐条记下，弹一次通知写第一条', t => {
  const r = scenario(t, { verifyExit: 1, verifyOut: '✗ 错误日志不为空（1 行）', sqlite: '*** in database main ***', freeKb: 1024 * 1024, backupFail: true, logLines: [[3, '通过']] });
  t.diagnostic(r.stdout + r.stderr);
  assert.equal(r.status, 1);
  assert.match(r.log, /未通过 5 项/);
  for (const line of ['错误日志不为空', '数据库完整性检查不过', '磁盘只剩 1 GB', '每日备份失败', '没有巡检记录，launchd 可能没跑']) assert.ok(r.log.includes(line), line);
  assert.deepEqual(r.notify.trim().split('\n').slice(1, 2), ['未通过 5 项：错误日志不为空（1 行）']);
});
