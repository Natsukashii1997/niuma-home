import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const RELEASE = /^nm-\d{8}-\d{6}-[a-f0-9]{7,40}$/;
const BACKUP = /^work-desk-\d{8}-\d{6}-before-nm-\d{8}-\d{6}-[a-f0-9]{7,40}\.db$/;
const LOG_LIMIT = 10 * 1024 * 1024;
const inspect = file => { try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const within = (parent, child) => child === parent || child.startsWith(`${parent}${path.sep}`);
const identity = stat => `${stat.dev}:${stat.ino}:${stat.mode}`;
const unchanged = (file, stat) => {
  const fresh = inspect(file);
  if (!fresh || identity(fresh) !== identity(stat) || fresh.size !== stat.size || fresh.mtimeMs !== stat.mtimeMs) throw new Error(`预览后对象已变化，未继续清理：${file}`);
};
function rootDirectory(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error(`${label} 须为明确的绝对目录`);
  const stat = inspect(value);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error(`${label} 不存在、不是目录或是符号链接`);
  const real = fs.realpathSync(value);
  if (real === path.parse(real).root) throw new Error(`${label} 不能为文件系统根目录`);
  return { file: real, stat: fs.lstatSync(real) };
}
function treeHasLink(directory) {
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name), stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || stat.isDirectory() && treeHasLink(file)) return true;
  }
  return false;
}
function digest(file) {
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const hash = createHash('sha256'), buffer = Buffer.alloc(64 * 1024);
    let count;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, count));
    return hash.digest('hex');
  } finally { fs.closeSync(fd); }
}

// 默认只打印计划；调用者明确 apply 后，仍需先通过完整路径与对象复核。
export function retainReleaseArtifacts({ base, dataDir, currentRelease, scope = 'all', apply = false }, write = line => console.log(line)) {
  if (!['all', 'artifacts', 'logs'].includes(scope)) throw new Error('scope 只接受 all、artifacts 或 logs');
  const baseRoot = rootDirectory(base, '发布根目录'), dataRoot = rootDirectory(dataDir, '数据根目录');
  const roots = [baseRoot, dataRoot], skipped = [], operations = [];
  function childDirectory(root, name) {
    const file = path.join(root.file, name), stat = inspect(file);
    if (!stat) return null;
    if (!stat.isDirectory() || stat.isSymbolicLink()) { skipped.push(`跳过非普通目录：${file}`); return null; }
    roots.push({ file, stat }); return file;
  }
  const releases = childDirectory(baseRoot, 'releases');
  if (!releases || !path.isAbsolute(currentRelease || '')) throw new Error('当前快照须明确位于 releases 的直接子目录');
  const currentStat = inspect(currentRelease);
  if (!currentStat?.isDirectory() || currentStat.isSymbolicLink()) throw new Error('当前快照不存在、不是目录或是符号链接');
  const current = fs.realpathSync(currentRelease);
  if (path.dirname(current) !== releases || !RELEASE.test(path.basename(current)) || treeHasLink(current)) throw new Error('当前快照位置、命名或符号链接不符合保护规则');
  if (within(releases, dataRoot.file) || within(path.join(baseRoot.file, 'backups'), dataRoot.file)) throw new Error('数据目录不能位于待清理的快照或备份目录内');
  for (const marker of ['server/index.mjs', 'dist/index.html']) if (!inspect(path.join(current, marker))?.isFile()) throw new Error(`当前快照缺少 ${marker}`);
  const protectedCurrent = { file: current, stat: fs.lstatSync(current) };

  function candidates(directory, pattern, directories) {
    if (!directory) return [];
    const result = [];
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name), stat = fs.lstatSync(file);
      if (!pattern.test(name) || stat.isSymbolicLink() || (directories ? !stat.isDirectory() : !stat.isFile())) { skipped.push(`保留未识别或链接对象：${file}`); continue; }
      result.push({ file, name, stat });
    }
    // 名称包含发布/备份生成时间，不受复制或手动修改 mtime 的影响。
    return result.sort((a, b) => b.name.localeCompare(a.name));
  }
  if (scope !== 'logs') {
    for (const item of candidates(releases, RELEASE, true).slice(5)) {
      if (item.file === current) continue;
      if (treeHasLink(item.file)) { skipped.push(`保留包含符号链接的快照：${item.file}`); continue; }
      operations.push({ type: 'release', ...item });
    }
    const backups = childDirectory(baseRoot, 'backups');
    for (const item of candidates(backups, BACKUP, false).slice(10)) operations.push({ type: 'backup', ...item });
  }
  if (scope !== 'artifacts') {
    const logs = childDirectory(dataRoot, 'daemon-logs');
    for (const name of logs ? fs.readdirSync(logs).sort() : []) {
      if (!name.endsWith('.log')) continue;
      const file = path.join(logs, name), stat = fs.lstatSync(file), rotated = `${file}.1`, rotatedStat = inspect(rotated);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || rotatedStat && (!rotatedStat.isFile() || rotatedStat.isSymbolicLink() || rotatedStat.nlink !== 1)) {
        skipped.push(`保留链接或异常日志对象：${file}`); continue;
      }
      if (stat.size > LOG_LIMIT) operations.push({ type: 'log', file, stat, rotated, rotatedStat });
    }
  }

  write(`保留策略预览：当前快照始终保留 ${current}`);
  for (const note of skipped) write(note);
  for (const item of operations) {
    if (item.type === 'log') {
      if (item.rotatedStat) write(`将删除旧轮转日志：${item.rotated}`);
      write(`将轮转日志：${item.file} → ${item.rotated}；内容校验一致后清空原文件`);
    } else write(`将删除${item.type === 'release' ? '快照' : '数据库备份'}：${item.file}`);
  }
  if (!apply) { write(`仅预览：${operations.length} 项，未修改文件`); return { applied: false, operations, skipped }; }

  function recheckRoots() {
    for (const root of roots) {
      const stat = inspect(root.file);
      if (!stat?.isDirectory() || stat.isSymbolicLink() || identity(stat) !== identity(root.stat)) throw new Error(`目录已变化，未继续清理：${root.file}`);
    }
    unchanged(protectedCurrent.file, protectedCurrent.stat);
  }
  function recheckEntry(item) {
    unchanged(item.file, item.stat);
    if (item.type === 'log') {
      if (item.rotatedStat) unchanged(item.rotated, item.rotatedStat);
      else if (inspect(item.rotated)) throw new Error(`预览后轮转目标已出现：${item.rotated}`);
    }
  }
  recheckRoots();
  for (const item of operations) recheckEntry(item);
  for (const item of operations) {
    recheckRoots(); recheckEntry(item);
    if (item.type === 'release') {
      if (item.file === current || treeHasLink(item.file)) throw new Error(`快照保护检查失败：${item.file}`);
      fs.rmSync(item.file, { recursive: true });
    } else if (item.type === 'backup') fs.unlinkSync(item.file);
    else {
      if (item.rotatedStat) fs.unlinkSync(item.rotated);
      fs.copyFileSync(item.file, item.rotated, fs.constants.COPYFILE_EXCL);
      unchanged(item.file, item.stat);
      if (digest(item.file) !== digest(item.rotated)) throw new Error(`轮转回读不一致，原日志未清空：${item.file}`);
      const fd = fs.openSync(item.file, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
      try {
        const currentStat = fs.fstatSync(fd);
        if (identity(currentStat) !== identity(item.stat) || currentStat.size !== item.stat.size || currentStat.mtimeMs !== item.stat.mtimeMs) throw new Error(`日志已变化，未清空：${item.file}`);
        fs.ftruncateSync(fd, 0);
        if (fs.fstatSync(fd).size !== 0) throw new Error(`日志清空后回读不一致：${item.file}`);
      } finally { fs.closeSync(fd); }
    }
    if (item.type !== 'log' && inspect(item.file)) throw new Error(`清理后回读仍存在：${item.file}`);
  }
  write(`保留策略完成：已清理 ${operations.length} 项`);
  return { applied: true, operations, skipped };
}

function argumentsOf(args) {
  const options = {}, keys = { '--base': 'base', '--data-dir': 'dataDir', '--current-release': 'currentRelease', '--scope': 'scope' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') { options.apply = true; continue; }
    if (!keys[args[i]] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`未知或缺少参数：${args[i]}`);
    options[keys[args[i]]] = args[++i];
  }
  return options;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { retainReleaseArtifacts(argumentsOf(process.argv.slice(2))); }
  catch (error) { console.error(`保留策略中止：${error.message}`); process.exitCode = 1; }
}
