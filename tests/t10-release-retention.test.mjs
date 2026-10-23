import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const command = fileURLToPath(new URL('../scripts/release-retention.mjs', import.meta.url));
const LIMIT = 10 * 1024 * 1024;
const releaseName = n => `nm-202610${String(n).padStart(2, '0')}-120000-c118a0b`;
const backupName = n => `work-desk-202610${String(n).padStart(2, '0')}-120000-before-${releaseName(n)}.db`;
function scenario(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workdesk-t10-retention-'));
  const base = path.join(root, 'base'), dataDir = path.join(root, 'data');
  for (const directory of [path.join(base, 'releases'), path.join(base, 'backups'), path.join(dataDir, 'daemon-logs')]) fs.mkdirSync(directory, { recursive: true });
  const snapshot = n => {
    const directory = path.join(base, 'releases', releaseName(n));
    fs.mkdirSync(path.join(directory, 'server'), { recursive: true });
    fs.mkdirSync(path.join(directory, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(directory, 'server/index.mjs'), '// 合成快照');
    fs.writeFileSync(path.join(directory, 'dist/index.html'), '<p>合成快照</p>');
    return directory;
  };
  const current = snapshot(1);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const run = (...args) => spawnSync(process.execPath, [command, '--base', base, '--data-dir', dataDir, '--current-release', current, ...args], { encoding: 'utf8' });
  return { root, base, dataDir, current, snapshot, run };
}

test('T10 发布保留命令默认仅预览，执行后保留最近五份及旧current、十份备份并保护范围外哨兵', t => {
  const { root, base, dataDir, snapshot, run } = scenario(t);
  for (let n = 2; n <= 8; n++) snapshot(n);
  for (let n = 1; n <= 12; n++) fs.writeFileSync(path.join(base, 'backups', backupName(n)), `合成备份${n}`);
  const sentinel = path.join(root, '范围外哨兵.txt'); fs.writeFileSync(sentinel, '必须保留');
  const data = path.join(dataDir, 'work-desk.db'); fs.writeFileSync(data, '真实数据替身，绝不修改');
  const preview = run();
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(fs.readdirSync(path.join(base, 'releases')).length, 8);
  assert.equal(fs.readdirSync(path.join(base, 'backups')).length, 12);
  assert.match(preview.stdout, new RegExp(releaseName(2)));
  const applied = run('--apply');
  assert.equal(applied.status, 0, applied.stderr);
  assert.deepEqual(fs.readdirSync(path.join(base, 'releases')).sort(), [1, 4, 5, 6, 7, 8].map(releaseName));
  assert.deepEqual(fs.readdirSync(path.join(base, 'backups')).sort(), Array.from({ length: 10 }, (_, i) => backupName(i + 3)));
  assert.equal(fs.readFileSync(sentinel, 'utf8'), '必须保留');
  assert.equal(fs.readFileSync(data, 'utf8'), '真实数据替身，绝不修改');
});

test('T10 日志严格超过10MiB才轮转，校验内容并只保留一份旧日志', t => {
  const { dataDir, run } = scenario(t), logs = path.join(dataDir, 'daemon-logs');
  const large = path.join(logs, 'server.stdout.log'), boundary = path.join(logs, 'server.stderr.log');
  const first = Buffer.alloc(LIMIT + 1, 'A'), second = Buffer.alloc(LIMIT + 2, 'B');
  fs.writeFileSync(large, first, { mode: 0o640 }); fs.writeFileSync(`${large}.1`, '旧轮转');
  fs.writeFileSync(boundary, Buffer.alloc(LIMIT, '边'));
  assert.equal(run('--scope', 'logs').status, 0);
  assert.equal(fs.statSync(large).size, LIMIT + 1);
  assert.equal(fs.readFileSync(`${large}.1`, 'utf8'), '旧轮转');
  const result = run('--scope', 'logs', '--apply');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.statSync(large).size, 0);
  assert.deepEqual(fs.readFileSync(`${large}.1`), first);
  assert.equal(fs.statSync(large).mode & 0o777, 0o640);
  assert.equal(fs.statSync(boundary).size, LIMIT); assert.equal(fs.existsSync(`${boundary}.1`), false);
  assert.equal(run('--scope', 'logs', '--apply').status, 0);
  assert.deepEqual(fs.readFileSync(`${large}.1`), first, '空日志再次运行不覆盖上一份');
  fs.writeFileSync(large, second);
  assert.equal(run('--scope', 'logs', '--apply').status, 0);
  assert.deepEqual(fs.readFileSync(`${large}.1`), second);
  assert.equal(fs.readdirSync(logs).some(name => name.endsWith('.2')), false);
});

test('T10 current已在最近五份时只留五份，按命名时间排序而不按mtime', t => {
  const { base, snapshot, run } = scenario(t);
  for (let n = 2; n <= 8; n++) snapshot(n);
  fs.utimesSync(path.join(base, 'releases', releaseName(2)), new Date('2099-01-01'), new Date('2099-01-01'));
  const result = run('--current-release', path.join(base, 'releases', releaseName(8)), '--scope', 'artifacts', '--apply');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readdirSync(path.join(base, 'releases')).sort(), [4, 5, 6, 7, 8].map(releaseName));
});

test('T10 当前快照缺失、越界、符号链接或位于数据目录内时拒绝，所有旧文件仍在', t => {
  const { root, base, snapshot, run } = scenario(t);
  for (let n = 2; n <= 8; n++) snapshot(n);
  const outside = path.join(root, releaseName(9)); fs.mkdirSync(outside);
  const linked = path.join(base, 'releases', releaseName(10)); fs.symlinkSync(outside, linked);
  const attempts = [
    ['--current-release', path.join(base, 'releases', releaseName(15))],
    ['--current-release', outside], ['--current-release', linked],
    ['--data-dir', path.join(base, 'releases', releaseName(8))],
  ];
  for (const args of attempts) {
    const result = run(...args, '--apply');
    assert.equal(result.status, 1); assert.match(result.stderr, /保留策略中止/);
    assert.equal(fs.readdirSync(path.join(base, 'releases')).length, 9);
  }
});

test('T10 未识别名称、链接快照及快照内符号链接均保留，范围外哨兵不受影响', t => {
  const { root, base, snapshot, run } = scenario(t);
  for (let n = 2; n <= 8; n++) snapshot(n);
  const sentinel = path.join(root, '外部文件'); fs.writeFileSync(sentinel, '不能删除');
  fs.symlinkSync(sentinel, path.join(base, 'releases', releaseName(2), '外部链接'));
  fs.symlinkSync(root, path.join(base, 'releases', releaseName(9)));
  fs.mkdirSync(path.join(base, 'releases', '手工保留'));
  fs.writeFileSync(path.join(base, 'backups', '用户手工备份.db'), '保留');
  const result = run('--apply'); assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(base, 'releases', releaseName(2), '外部链接')), true);
  assert.equal(fs.lstatSync(path.join(base, 'releases', releaseName(9))).isSymbolicLink(), true);
  assert.equal(fs.existsSync(path.join(base, 'releases', '手工保留')), true);
  assert.equal(fs.readFileSync(path.join(base, 'backups', '用户手工备份.db'), 'utf8'), '保留');
  assert.equal(fs.readFileSync(sentinel, 'utf8'), '不能删除');
  assert.equal(fs.existsSync(path.join(base, 'releases', releaseName(3))), false);
});

test('T10 日志源或轮转目标为符号链接、硬链接时跳过，不截断范围外文件', t => {
  const { root, dataDir, run } = scenario(t), logs = path.join(dataDir, 'daemon-logs');
  const outside = path.join(root, '外部日志'); fs.writeFileSync(outside, Buffer.alloc(LIMIT + 1, 'X'));
  fs.symlinkSync(outside, path.join(logs, 'linked.log'));
  fs.linkSync(outside, path.join(logs, 'hardlinked.log'));
  const normal = path.join(logs, 'normal.log'); fs.writeFileSync(normal, Buffer.alloc(LIMIT + 1, 'N'));
  fs.symlinkSync(outside, `${normal}.1`);
  const result = run('--scope', 'logs', '--apply'); assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.statSync(outside).size, LIMIT + 1); assert.equal(fs.statSync(normal).size, LIMIT + 1);
  assert.equal(fs.readFileSync(outside)[0], 88);
  assert.equal(fs.lstatSync(`${normal}.1`).isSymbolicLink(), true);
});

test('T10 backups和daemon-logs目录为符号链接时整目录跳过', t => {
  const { root, base, dataDir, run } = scenario(t);
  const outside = path.join(root, 'outside'); fs.mkdirSync(outside);
  const sentinel = path.join(outside, 'sentinel.log'); fs.writeFileSync(sentinel, Buffer.alloc(LIMIT + 1, 'S'));
  fs.rmdirSync(path.join(base, 'backups')); fs.symlinkSync(outside, path.join(base, 'backups'));
  fs.rmdirSync(path.join(dataDir, 'daemon-logs')); fs.symlinkSync(outside, path.join(dataDir, 'daemon-logs'));
  const result = run('--apply'); assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.statSync(sentinel).size, LIMIT + 1); assert.equal(fs.readdirSync(outside).length, 1);
});

test('T10 所有清理路径在修改前完整打印，预览后对象变化则整批拒绝', async t => {
  const { retainReleaseArtifacts } = await import('../scripts/release-retention.mjs');
  const { base, dataDir, current, snapshot } = scenario(t);
  for (let n = 2; n <= 8; n++) snapshot(n);
  const second = path.join(base, 'releases', releaseName(2)), third = path.join(base, 'releases', releaseName(3));
  const printed = [];
  assert.throws(() => retainReleaseArtifacts({ base, dataDir, currentRelease: current, apply: true }, line => {
    printed.push(line);
    assert.equal(fs.existsSync(second), true); assert.equal(fs.existsSync(third), true);
    if (line.includes('将删除快照') && line.includes(releaseName(2))) fs.writeFileSync(path.join(third, '预览后新增'), '变化');
  }), /预览后对象已变化/);
  assert.equal(printed.filter(line => line.includes('将删除快照')).length, 2);
  assert.equal(fs.existsSync(second), true); assert.equal(fs.existsSync(third), true);
});

test('T10 日志复制失败不会清空原日志，明确失败而不是假报完成', async t => {
  const { retainReleaseArtifacts } = await import('../scripts/release-retention.mjs');
  const { base, dataDir, current } = scenario(t), log = path.join(dataDir, 'daemon-logs', 'error.log');
  fs.writeFileSync(log, Buffer.alloc(LIMIT + 1, 'E'));
  const original = fs.copyFileSync;
  const mocked = t.mock.method(fs, 'copyFileSync', (source, ...args) => {
    if (fs.realpathSync(source) === fs.realpathSync(log)) throw Object.assign(new Error('合成磁盘错误'), { code: 'EIO' });
    return original(source, ...args);
  });
  try {
    assert.throws(() => retainReleaseArtifacts({ base, dataDir, currentRelease: current, scope: 'logs', apply: true }, () => {}), /合成磁盘错误/);
    assert.equal(fs.statSync(log).size, LIMIT + 1); assert.equal(fs.readFileSync(log)[0], 69);
  } finally { mocked.mock.restore(); }
});

// 执行原脚本的真实停服→维护→启动→回读控制流；只替换外部命令边界。
// 不执行前面的构建、应用复制或 plist 写入，也不会调用真实 launchctl。
function releaseControlFlow(t, failedPhase, badReadback = false, locale, badVerify = false) {
  const context = scenario(t), events = path.join(context.root, 'shell-events.txt');
  // 完整回读脚本也是外部边界：只记下收到的任务名与快照名，按需合成失败
  fs.mkdirSync(path.join(context.root, 'scripts'));
  fs.writeFileSync(path.join(context.root, 'scripts/verify-release.sh'), 'printf \'verify:%s:%s\\n\' "$NIUMA_LABEL" "$1" >> "$T10_EVENTS"\n[ "$T10_BAD_VERIFY" != 1 ]\n');
  const releaseScript = fs.readFileSync(new URL('../scripts/release-app.sh', import.meta.url), 'utf8');
  const start = releaseScript.indexOf('launchctl bootout "gui/$(id -u)/$LABEL"');
  assert.ok(start >= 0, '真实发布脚本须包含服务切换控制流');
  const setup = `set -euo pipefail
ROOT="$T10_STAGE_ROOT"
BASE="$ROOT/base"
DATA_DIR="$ROOT/data"
REL="$BASE/releases/${releaseName(1)}"
NAME="${releaseName(1)}"
LABEL=cn.niuma-home.synthetic-test
PORT=5299
URL=http://127.0.0.1:5299
PLIST="$ROOT/test.plist"
NODE=t10_retention
fail() { printf '发布中止：%s\\n' "$*" >&2; exit 1; }
id() { printf '1000\\n'; }
launchctl() { printf 'launchctl:%s\\n' "$1" >> "$T10_EVENTS"; }
lsof() { return 1; }
curl() {
  if [[ " $* " == *" -o /dev/null "* ]]; then
    printf 'curl:ready\\n' >> "$T10_EVENTS"
  else
    printf 'curl:readback\\n' >> "$T10_EVENTS"
    if [ "$T10_BAD_READBACK" = 1 ]; then printf '与目标不同'; else cat "$REL/dist/index.html"; fi
  fi
}
t10_retention() {
  local phase=''
  while [ "$#" -gt 0 ]; do
    if [ "$1" = --scope ]; then phase="$2"; shift 2; else shift; fi
  done
  printf 'maintenance:%s\\n' "$phase" >> "$T10_EVENTS"
  if [ "$phase" = "$T10_FAIL_PHASE" ]; then
    printf 'T10 合成维护失败：%s EACCES\\n' "$phase" >&2
    return 7
  fi
}
`;
  const result = spawnSync('/bin/bash', ['-c', setup + releaseScript.slice(start)], {
    encoding: 'utf8', env: { ...process.env, ...(locale ? { LANG: locale, LC_ALL: locale } : {}), T10_STAGE_ROOT: context.root, T10_EVENTS: events, T10_FAIL_PHASE: failedPhase, T10_BAD_READBACK: badReadback ? '1' : '0', T10_BAD_VERIFY: badVerify ? '1' : '0' },
  });
  return { ...result, events: fs.existsSync(events) ? fs.readFileSync(events, 'utf8').trim().split('\n') : [] };
}
const VERIFY = `verify:cn.niuma-home.synthetic-test:${releaseName(1)}`;

for (const phase of ['logs', 'artifacts']) {
  test(`T10 发布控制流 ${phase} 维护失败仍启动并回读服务，最后明确报告维护未完成`, t => {
    const result = releaseControlFlow(t, phase);
    t.diagnostic(JSON.stringify({ phase, status: result.status, events: result.events, stderr: result.stderr }));
    assert.deepEqual(result.events, ['launchctl:bootout', 'maintenance:logs', 'launchctl:bootstrap', 'curl:ready', 'curl:readback', VERIFY, 'maintenance:artifacts']);
    assert.equal(result.status, 1, '服务切换成功但维护失败须非零退出');
    assert.match(result.stderr, new RegExp(`T10 合成维护失败：${phase} EACCES`));
    assert.match(result.stderr, /退出码 7/);
    assert.match(result.stderr, /服务已切换但保留策略未完成/);
  });
}

test('发布控制流完整回读不过则停下，不清理旧快照', t => {
  const result = releaseControlFlow(t, '', false, undefined, true);
  t.diagnostic(JSON.stringify({ status: result.status, events: result.events, stderr: result.stderr }));
  assert.deepEqual(result.events, ['launchctl:bootout', 'maintenance:logs', 'launchctl:bootstrap', 'curl:ready', 'curl:readback', VERIFY]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /完整回读未通过.*未清理旧快照/);
});

for (const phase of ['', 'logs']) {
  test(`T11 UTF-8发布尾段${phase ? '维护失败' : '成功'}输出完整中文且无变量展开错误`, t => {
    const result = releaseControlFlow(t, phase, false, 'en_US.UTF-8');
    t.diagnostic(JSON.stringify({ locale: 'en_US.UTF-8', phase, status: result.status, stdout: result.stdout, stderr: result.stderr }));
    assert.deepEqual(result.events, ['launchctl:bootout', 'maintenance:logs', 'launchctl:bootstrap', 'curl:ready', 'curl:readback', VERIFY, 'maintenance:artifacts']);
    assert.equal(result.status, phase ? 1 : 0);
    assert.doesNotMatch(result.stdout + result.stderr, /unbound variable/);
    if (phase) assert.ok(result.stderr.includes(`服务已切换但保留策略未完成：${releaseName(1)}；http://127.0.0.1:5299（launchd cn.niuma-home.synthetic-test）。`));
    else assert.ok(result.stdout.includes(`已切换到 ${releaseName(1)}：http://127.0.0.1:5299（launchd cn.niuma-home.synthetic-test）`));
  });
}
