import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// 在临时 HOME / base 里跑真实的 health-check.sh；只把外部边界换成桩：
// verify-release.sh、sqlite3、df、osascript。不碰真实服务、数据库，也不弹通知。
function scenario(t, { verifyExit, verifyOut, sqlite, freeKb, backupDaysAgo }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workdesk-health-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const put = (file, text, mode = 0o644) => { fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); fs.writeFileSync(path.join(root, file), text, { mode }); };
  put('repo/scripts/health-check.sh', fs.readFileSync(new URL('../scripts/health-check.sh', import.meta.url)));
  put('repo/scripts/verify-release.sh', `printf '%s\\n' "${verifyOut}"\nexit ${verifyExit}\n`);
  put('bin/sqlite3', `#!/bin/sh\nprintf '%s\\n' "${sqlite}"\n`, 0o755);
  put('bin/df', `#!/bin/sh\nprintf 'Filesystem 1024-blocks Used Available Capacity Mounted\\n/dev/x 1 1 ${freeKb} 1%% /\\n'\n`, 0o755);
  put('bin/osascript', `#!/bin/sh\ncat > /dev/null\nprintf '%s\\n' "$@" >> "${path.join(root, 'notify.txt')}"\n`, 0o755);
  put('data/work-desk.db', '');
  put('home/Library/LaunchAgents/cn.niuma-home.server.plist', `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>EnvironmentVariables</key><dict><key>WORKDESK_DATA_DIR</key><string>${path.join(root, 'data')}</string></dict></dict></plist>\n`);
  put('base/backups/work-desk-20261001-120000-before-nm-20261001-120000-c118a0b.db', '');
  const when = new Date(Date.now() - backupDaysAgo * 86_400_000);
  fs.utimesSync(path.join(root, 'base/backups/work-desk-20261001-120000-before-nm-20261001-120000-c118a0b.db'), when, when);
  const result = spawnSync('/bin/bash', [path.join(root, 'repo/scripts/health-check.sh')], {
    encoding: 'utf8', env: { ...process.env, HOME: path.join(root, 'home'), NIUMA_BASE: path.join(root, 'base'), NIUMA_LABEL: 'cn.niuma-home.server', PATH: `${path.join(root, 'bin')}:${process.env.PATH}` },
  });
  const read = file => fs.existsSync(path.join(root, file)) ? fs.readFileSync(path.join(root, file), 'utf8') : '';
  const logDir = path.join(root, 'base/evidence/health');
  const log = fs.existsSync(logDir) ? fs.readdirSync(logDir).map(f => fs.readFileSync(path.join(logDir, f), 'utf8')).join('') : '';
  return { ...result, log, notify: read('notify.txt') };
}

test('巡检全部通过：退出码 0，日志记「通过」，不弹通知', t => {
  const r = scenario(t, { verifyExit: 0, verifyOut: '✓ launchd 指向 nm-x', sqlite: 'ok', freeKb: 10 * 1024 * 1024, backupDaysAgo: 1 });
  t.diagnostic(r.stdout + r.stderr);
  assert.equal(r.status, 0);
  assert.match(r.log, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} {2}通过\n$/);
  assert.equal(r.notify, '');
});

test('巡检有项不过：退出码 1，日志逐条记下，弹一次通知写第一条', t => {
  const r = scenario(t, { verifyExit: 1, verifyOut: '✗ 错误日志不为空（1 行）', sqlite: '*** in database main ***', freeKb: 1024 * 1024, backupDaysAgo: 30 });
  t.diagnostic(r.stdout + r.stderr);
  assert.equal(r.status, 1);
  assert.match(r.log, /未通过 4 项/);
  for (const line of ['错误日志不为空', '数据库完整性检查不过', '磁盘只剩 1 GB', '超过 7 天没有数据库备份']) assert.ok(r.log.includes(line), line);
  assert.deepEqual(r.notify.trim().split('\n').slice(1, 2), ['未通过 4 项：错误日志不为空（1 行）']);
});
