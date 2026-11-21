import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

// 数据目录迁移（#83）。脚本读 launchd 配置用 /usr/libexec/PlistBuddy、复制用 ditto、量文件用 BSD stat，只在 macOS 上能跑；CI 是 Linux，跳过。
const macOnly = { skip: process.platform !== 'darwin' && '依赖 macOS 的 PlistBuddy、ditto 和 BSD stat' };
const LABEL = 'cn.niuma-home.move-test';
const SNAPSHOT = 'nm-20261101-120000-c118a0b';
const releaseScript = fs.readFileSync(new URL('../scripts/release-app.sh', import.meta.url), 'utf8');

// 在临时 HOME / base 里跑真实的 move-data-dir.sh，库是真的 SQLite 文件，复制和核对都真做；临时目录名带空格和中文，和正式路径（Application Support、个人）一样。
// 只把外部边界换成桩：launchctl、lsof、release-app.sh（桩只把服务配置里的数据目录改成收到的那个）。不碰真实服务和正式数据。
function scenario(t, { plist = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'workdesk-move 数据-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const at = (...parts) => path.join(root, ...parts);
  const put = (file, text, mode = 0o644) => { fs.mkdirSync(path.dirname(at(file)), { recursive: true }); fs.writeFileSync(at(file), text, { mode }); };
  const from = at('work/data'), to = at('base/data'), events = at('events.txt'), plistFile = at('home/Library/LaunchAgents', `${LABEL}.plist`);
  put('repo/scripts/move-data-dir.sh', fs.readFileSync(new URL('../scripts/move-data-dir.sh', import.meta.url)));
  put('repo/scripts/release-app.sh', `printf 'switch:%s:%s\\n' "$WORKDESK_DATA_DIR" "$2" >> "$MOVE_EVENTS"
case ",$MOVE_FAIL_ON," in *",$WORKDESK_DATA_DIR,"*) echo "合成失败"; exit 1;; esac
/usr/libexec/PlistBuddy -c "Set :EnvironmentVariables:WORKDESK_DATA_DIR $WORKDESK_DATA_DIR" "$HOME/Library/LaunchAgents/$NIUMA_LABEL.plist"\n`);
  // launchctl print 失败 = 任务已卸下；lsof 查端口时没有监听，查文件时按需报一个占用者
  put('bin/launchctl', `#!/bin/sh\nprintf 'launchctl:%s\\n' "$1" >> "$MOVE_EVENTS"\n[ "$1" != print ]\n`, 0o755);
  put('bin/lsof', `#!/bin/sh\ncase "$*" in *iTCP*) exit 1;; esac\n[ -n "$MOVE_HOLDER" ] && echo "$MOVE_HOLDER" || exit 1\n`, 0o755);
  put(`base/releases/${SNAPSHOT}/server/index.mjs`, '// 合成快照');
  if (plist) put(path.relative(root, plistFile), `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict><key>WorkingDirectory</key><string>${at('base/releases', SNAPSHOT)}</string><key>EnvironmentVariables</key><dict><key>WORKDESK_DATA_DIR</key><string>${from}</string></dict></dict></plist>\n`);
  fs.mkdirSync(from, { recursive: true });
  for (const [file, table, count] of [['work-desk.db', 'plans', 3], ['internal-voice.db', 'chat_messages', 5]]) {
    const db = new DatabaseSync(path.join(from, file));
    db.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, body TEXT)`);
    for (let i = 0; i < count; i++) db.prepare(`INSERT INTO ${table} (body) VALUES (?)`).run(`第 ${i} 行`);
    db.close();
  }
  put('work/data/refs/a.jpg', '图片替身');
  put('work/data/daemon-logs/server.stderr.log', '');
  const files = dir => fs.readdirSync(dir, { recursive: true }).filter(f => fs.statSync(path.join(dir, f)).isFile()).sort().map(f => `${f}:${fs.statSync(path.join(dir, f)).size}`);
  const count = (dir, file, table) => { const db = new DatabaseSync(path.join(dir, file), { readOnly: true }); try { return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n; } finally { db.close(); } };
  const run = (args = [], env = {}) => spawnSync('/bin/bash', [at('repo/scripts/move-data-dir.sh'), ...args], {
    encoding: 'utf8', env: { ...process.env, HOME: at('home'), NIUMA_BASE: at('base'), NIUMA_LABEL: LABEL, PORT: '5299', MOVE_EVENTS: events, MOVE_FAIL_ON: '', MOVE_HOLDER: '', NIUMA_NEW_DATA_DIR: '', PATH: `${at('bin')}:${process.env.PATH}`, ...env },
  });
  const readEvents = () => fs.existsSync(events) ? fs.readFileSync(events, 'utf8').trim().split('\n') : [];
  const dataDirInPlist = () => spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Print :EnvironmentVariables:WORKDESK_DATA_DIR', plistFile], { encoding: 'utf8' }).stdout.trim();
  const renamed = () => fs.readdirSync(at('work')).filter(name => /^data\.migrated-\d{8}$/.test(name));
  return { root, at, put, from, to, files, count, run, readEvents, dataDirInPlist, renamed, before: files(from) };
}

test('迁移脚本默认只预览：打印从哪到哪、文件数与各表行数，不停服务、不建目录、不改原目录', macOnly, t => {
  const s = scenario(t), r = s.run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`从：${s.from}\\n到：${s.to}\\n现状：4 个文件 \\d+ 字节`));
  assert.match(r.stdout, /internal-voice\.db chat_messages：5 行/);
  assert.match(r.stdout, /work-desk\.db plans：3 行/);
  assert.match(r.stdout, /只预览，没有改动/);
  assert.deepEqual(s.readEvents(), [], '预览不调 launchctl，也不切换服务');
  assert.ok(!fs.existsSync(s.to));
  assert.deepEqual(s.files(s.from), s.before);
});

test('迁移脚本在动手之前就拒绝：没有服务配置、目标不为空、已在目标位置、目标在原目录里面、错误日志不为空', macOnly, t => {
  const none = scenario(t, { plist: false }).run(['--confirm']);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /迁移中止：找不到服务配置/);

  const cases = [
    [s => s.put('base/data/别人的文件.txt', '不能覆盖'), {}, /目标目录已存在且不为空，不覆盖/],
    [() => {}, s => ({ NIUMA_NEW_DATA_DIR: s.from }), /数据目录已经在目标位置/],
    [() => {}, s => ({ NIUMA_NEW_DATA_DIR: path.join(s.from, 'inner') }), /目标目录不能放在现在的数据目录里面/],
    [s => s.put('work/data/daemon-logs/server.stderr.log', '有一条没看过的报错\n'), {}, /错误日志不为空/],
  ];
  for (const [prepare, env, message] of cases) {
    const s = scenario(t); prepare(s);
    const before = s.files(s.from), r = s.run(['--confirm'], typeof env === 'function' ? env(s) : env);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stderr, message);
    assert.deepEqual(s.readEvents(), [], `${message}：拒绝时还没有停服务`);
    assert.deepEqual(s.files(s.from), before);
    assert.deepEqual(s.renamed(), []);
  }
});

test('迁移脚本 --confirm：停服务 → 备份 → 复制并核对 → 切到新目录 → 原目录只改名不删', macOnly, t => {
  const s = scenario(t), r = s.run(['--confirm']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /一致：4 个文件 \d+ 字节，2 张表行数相同/);
  assert.deepEqual(s.files(s.to), s.before, '新目录的文件与大小和迁移前一致');
  assert.equal(s.count(s.to, 'work-desk.db', 'plans'), 3);
  assert.equal(s.count(s.to, 'internal-voice.db', 'chat_messages'), 5);
  assert.ok(!fs.existsSync(s.from), '原目录已改名');
  const [kept] = s.renamed();
  assert.deepEqual(s.files(s.at('work', kept)), s.before, '改名保留的那一份原样还在');
  assert.equal(s.dataDirInPlist(), s.to);
  const events = s.readEvents();
  assert.deepEqual(events.filter(e => e.startsWith('switch:')), [`switch:${s.to}:${SNAPSHOT}`], '用当前快照切到新目录，只切一次');
  assert.ok(events.indexOf('launchctl:bootout') >= 0 && events.indexOf('launchctl:bootout') < events.findIndex(e => e.startsWith('switch:')), '先停服务再切换');
  const [evidence] = fs.readdirSync(s.at('base/evidence'));
  assert.equal(s.count(s.at('base/evidence', evidence), 'work-desk-before-move.db', 'plans'), 3, '证据目录里有迁移前的主库备份');
});

test('迁移脚本：停服务后还有进程开着库就中止，把服务按原配置起回来，原目录不动', macOnly, t => {
  const s = scenario(t), r = s.run(['--confirm'], { MOVE_HOLDER: '4242' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /还有进程开着数据库（pid 4242）/);
  assert.ok(s.readEvents().includes('launchctl:bootstrap'), '服务按原配置起回来');
  assert.ok(!s.readEvents().some(e => e.startsWith('switch:')));
  assert.ok(!fs.existsSync(s.to));
  assert.deepEqual(s.files(s.from), s.before);
  assert.equal(s.dataDirInPlist(), s.from);
});

test('迁移脚本：切到新目录失败就改回原目录并删掉新目录；改回也失败时两边都留着', macOnly, t => {
  const s = scenario(t), r = s.run(['--confirm'], { MOVE_FAIL_ON: s.to });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /服务已改回原目录/);
  assert.deepEqual(s.readEvents().filter(e => e.startsWith('switch:')), [`switch:${s.to}:${SNAPSHOT}`, `switch:${s.from}:${SNAPSHOT}`]);
  assert.ok(!fs.existsSync(s.to), '新目录已删掉');
  assert.deepEqual(s.files(s.from), s.before);
  assert.deepEqual(s.renamed(), []);

  const both = scenario(t), failed = both.run(['--confirm'], { MOVE_FAIL_ON: `${both.to},${both.from}` });
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /改回原目录也失败了/);
  assert.deepEqual(both.files(both.to), both.before, '服务可能正跑在新目录上，新目录不删');
  assert.deepEqual(both.files(both.from), both.before);
  assert.deepEqual(both.renamed(), []);
});

// 发布脚本的数据目录默认值（#83）：真跑脚本里算默认值的那两行
test('发布脚本的数据目录：显式指定的优先，否则沿用当前服务配置，全新安装才用 NiumaHome/data', macOnly, t => {
  const lines = releaseScript.split('\n').filter(line => /^(CURRENT_DATA_DIR|DATA_DIR)=/.test(line));
  assert.equal(lines.length, 2, '发布脚本里算数据目录的应是这两行');
  const s = scenario(t);
  const resolve = (plist, explicit) => spawnSync('/bin/bash', ['-c', `set -euo pipefail\nBASE="$1"; PLIST="$2"\n${lines.join('\n')}\nprintf '%s' "$DATA_DIR"`, 'bash', s.at('base'), plist], { encoding: 'utf8', env: { PATH: process.env.PATH, ...(explicit ? { WORKDESK_DATA_DIR: explicit } : {}) } });
  const installed = s.at('home/Library/LaunchAgents', `${LABEL}.plist`), missing = s.at('home/没有这个配置.plist');
  assert.equal(resolve(installed, '/显式/指定').stdout, '/显式/指定');
  assert.equal(resolve(installed).stdout, s.from, '发布不会悄悄换数据目录');
  const fresh = resolve(missing);
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.equal(fresh.stdout, s.to);
});

test('发布脚本不再把开发工作区的 data/ 当默认数据目录', () => {
  assert.ok(!releaseScript.includes('"$ROOT/data"'));
});
