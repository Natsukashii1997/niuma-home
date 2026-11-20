// 基线截图（scripts/ui-baseline.mjs）的 globalSetup：照 smoke-pages.mjs 的做法起一份隔离服务，不碰 data/ 和正式 5280。
// - 代码目录：默认仓库根目录（要先 npm run build）；发布前检查由 release-app.sh 设 NIUMA_UI_APP=<新快照目录>，比的就是要上线的那份。
// - 数据：临时数据目录 + 空的数码世界目录；假 lark-cli、假 codex 都直接失败，不连飞书、不起本机 Codex。
// - 时间与网络：服务端以 node --import scripts/ui-baseline-preload.mjs 启动，时间固定在 pages.json 的 clock，对外网络全断。
// - 演示数据：给培养路径写一份固定的路径和进度（同 tests/helpers/mentor-path-sample.mjs 的「按期」：入职 09-01，P1–P6 / T1–T5 已完成），
//   只经页面同样的「预览 → 确认」接口写进临时数据目录。
// 端口要和 docs/design/pages.json 里的地址一致；被占用就直接报错，不去停别的进程。
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = 5296;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const busy = port => new Promise(r => { const s = net.connect(port, '127.0.0.1', () => { s.end(); r(true); }); s.on('error', () => r(false)); });

// 培养路径演示进度：评审节点记分数，其余记完成，日期都在入职之后、固定时间之前
const PATH_START = '2026-09-01', AT = '2026-10-01';
const DONE = ['P2', 'P3', 'P4', 'T1', 'T2', 'T3', 'T4', 'T5'];
const REVIEWS = [['P1', 82], ['P5', 76], ['P6', 74]];

export default async function setup() {
  const app = path.resolve(process.env.NIUMA_UI_APP || ROOT);
  if (!existsSync(path.join(app, 'dist', 'index.html'))) throw new Error(`没有 ${path.join(app, 'dist', 'index.html')}：先 npm run build`);
  const { clock } = JSON.parse(readFileSync(path.join(ROOT, 'docs', 'design', 'pages.json'), 'utf8'));
  if (await busy(PORT)) throw new Error(`端口 ${PORT} 已被占用：先关掉占用它的进程（可能是上一次没收掉的基线服务）`);

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'niuma-ui-baseline-'));
  const data = path.join(tmp, 'data'), bin = path.join(tmp, 'bin'), digiworld = path.join(tmp, 'digiworld');
  for (const d of [data, bin, digiworld]) mkdirSync(d);
  for (const cmd of ['lark-cli', 'codex', 'claude']) { writeFileSync(path.join(bin, cmd), `#!/bin/sh\necho '基线截图环境不调用 ${cmd}' >&2\nexit 1\n`); chmodSync(path.join(bin, cmd), 0o755); }
  const server = spawn(process.execPath, ['--import', path.join(ROOT, 'scripts', 'ui-baseline-preload.mjs'), 'server/index.mjs'], {
    cwd: app, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WORKDESK_DATA_DIR: data, WORKDESK_DIGIWORLD_DIR: digiworld, PORT: String(PORT), PATH: `${bin}:${process.env.PATH}`, UI_BASELINE_NOW: clock },
  });
  const log = [];
  server.stdout.on('data', d => log.push(String(d))); server.stderr.on('data', d => log.push(String(d)));
  const teardown = async () => {
    if (server.exitCode === null) { server.kill(); await new Promise(r => server.once('exit', r)); }
    rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  };
  try {
    const base = `http://127.0.0.1:${PORT}`;
    let up = false;
    for (let i = 0; i < 50 && !up; i++) { await sleep(200); try { up = (await fetch(`${base}/api/v3/status`)).ok; } catch {} }
    if (!up) throw new Error(`隔离服务没有起来：${log.join('').slice(-1500)}`);
    const post = async (p, body) => {
      const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`写演示数据失败：POST ${p} → ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
      return j;
    };
    const { trainees } = await (await fetch(`${base}/api/v3/mentor/path`)).json();
    const name = trainees?.[0]?.name;
    if (!name) throw new Error('带教名单是空的，培养路径没法写演示数据');
    const who = `/api/v3/mentor/path/${encodeURIComponent(name)}`;
    await post(`${who}/generate`, { previewId: (await post(`${who}/generate/preview`, { start: PATH_START })).previewId });
    const record = async (id, body) => post(`${who}/stages/${id}/record`, { previewId: (await post(`${who}/stages/${id}/record/preview`, body)).previewId, confirm: true });
    for (const id of DONE) await record(id, { kind: 'complete', at: AT });
    for (const [id, score] of REVIEWS) await record(id, { kind: 'review', score, result: 'pass', at: AT });
  } catch (e) {
    await teardown();
    throw e;
  }
  return teardown;
}
