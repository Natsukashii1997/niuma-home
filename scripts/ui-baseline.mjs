// 网页项目的基线截图：用户验收界面的当轮拍基线，之后每次改界面都和基线逐页比，防止已定的界面被一点点改偏。
// 用 Playwright 自带的 toHaveScreenshot 比较，不另装图像库：每张截图先等页面加载完、字体加载完，再连拍到前后两张一样才算画完
// （全局坑 G-11）；CSS 动画和过渡停在初始状态，光标隐藏；脚本驱动的动画、时钟这类停不住的区域用 mask 遮掉。
// 先装：npm ci（package.json 已列 @playwright/test）；本机没有 Playwright 的 Chromium 时再 npx playwright install chromium。
// 页面清单 docs/design/pages.json：
//   { "evidence": "~/Library/Application Support/<项目>/evidence",
//     "pages": [ { "name": "home", "url": "http://127.0.0.1:3000/", "widths": [1280, 1440], "mask": [".clock"] } ] }
//   evidence 是项目约定的证据目录（AGENTS.md「规则」），不能在 /tmp；name 当截图文件名用，不能重复；widths 不写默认 1280 和 1440；mask 可不写。
//   以下四项可不写（骨架 0.3.0 没有，本项目接入时加；路径相对项目根目录）。另：workers 固定 1，多页共用一份隔离服务时截图更稳；
//   浏览器按「减少动态效果」打开（reducedMotion），尊重这个设置的脚本动画直接停在终态：
//     setup：Playwright 的 globalSetup 模块，起隔离服务、登录；要登录的把 storageState 写到环境变量 UI_BASELINE_STATE 指的文件，返回收尾函数
//     style：截图时注入的样式表（toHaveScreenshot 的 stylePath），用来展开只滚内容区的页面、藏掉停不住的区域
//     clock：浏览器里的固定时间（ISO 字符串），页面里 new Date() 显示的时间就不会每次不同
//     ready：CSS 选择器，等它出现再截（单页应用异步读数据时用）；单页可在 pages 里各写各的 ready
//     baseline：基线图放哪（不写默认 docs/design/baseline，提交进仓库）。截图不能进仓库的（仓库公开、或用户定过截图不入库）
//       写本机持久目录，如 "~/Library/Application Support/<项目>/ui-baseline"；不能在 /tmp。基线就不跟提交留历史，换电脑要重拍
// 用法：node scripts/ui-baseline.mjs shoot     拍基线到基线目录（pages.json 的 baseline）<name>-<宽>.png，再登记进 docs/DECIDED.md
//       node scripts/ui-baseline.mjs compare   逐页和基线比；有一页差异超过 MAX_DIFF_RATIO 或缺基线就以非零退出，
//                                              差异图（-diff / -actual / -expected.png）写到 <evidence>/ui-baseline-<时间>-<随机>/
// 本文件同时是 Playwright 的配置文件（shoot / compare 用 -c 指向自己），每页怎么截写在 ui-baseline.spec.mjs。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 差异像素占整张图的比例超过它就算不一致
const MAX_DIFF_RATIO = 0.001;
// 单个像素颜色差多少才算「不一样」（YIQ 距离，0～1）。Playwright 默认 0.2 太松：面板底色从 #FBFBFC 改成米色 #F3EFE6、
// 主色 #2d5b85 调亮一档都算一样，整页对比照样通过（2026-11-19 接入时实测）。同一台机器连拍是逐像素一致的，收紧到 0.02 不误报
const PIXEL_THRESHOLD = 0.02;
const WIDTHS = [1280, 1440];
const SELF = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(process.env.UI_BASELINE_ROOT ?? path.join(path.dirname(SELF), '..'));

export function readPages(root) {
  const file = path.join(root, 'docs', 'design', 'pages.json');
  if (!fs.existsSync(file)) throw new Error(`没有 ${path.relative(root, file)}，格式见 scripts/ui-baseline.mjs 开头`);
  const { evidence, pages, setup, style, clock, ready, baseline } = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (typeof evidence !== 'string' || !evidence) throw new Error('pages.json 缺 evidence（项目约定的证据目录）');
  const dir = path.resolve(root, evidence.replace(/^~(?=\/|$)/, os.homedir()));
  if (/^\/(private\/)?tmp(\/|$)/.test(dir)) throw new Error(`证据目录不能放 /tmp，会被系统清理（全局坑 G-01）：${dir}`);
  if (baseline !== undefined && (typeof baseline !== 'string' || !baseline)) throw new Error('pages.json 的 baseline 要写成目录路径');
  const base = path.resolve(root, (baseline ?? 'docs/design/baseline').replace(/^~(?=\/|$)/, os.homedir()));
  // 只查显式配置的目录：默认目录在仓库里，仓库本身在临时目录（CI、测试）时不该报
  if (baseline !== undefined && /^\/(private\/)?tmp(\/|$)/.test(base)) throw new Error(`基线目录不能放 /tmp，会被系统清理（全局坑 G-01）：${base}`);
  if (!Array.isArray(pages) || !pages.length) throw new Error('pages.json 的 pages 是空的');
  const names = new Set();
  for (const p of pages) {
    if (!p.name || !p.url) throw new Error(`每页都要有 name 和 url：${JSON.stringify(p)}`);
    if (names.has(p.name)) throw new Error(`name 重复：${p.name}`);
    names.add(p.name);
  }
  const extra = {};
  for (const [k, v] of Object.entries({ setup, style })) {
    if (v === undefined) continue;
    extra[k] = path.resolve(root, v);
    if (!fs.existsSync(extra[k])) throw new Error(`pages.json 的 ${k} 指向的文件不存在：${v}`);
  }
  if (clock !== undefined) {
    if (Number.isNaN(Date.parse(clock))) throw new Error(`pages.json 的 clock 不是合法时间：${clock}`);
    extra.clock = clock;
  }
  if (ready !== undefined) extra.ready = ready;
  return { evidence: dir, baseline: base, ...extra, pages: pages.map(p => ({ ...p, widths: p.widths ?? WIDTHS, mask: p.mask ?? [] })) };
}

// action：shoot 拍基线 / compare 对比。返回 Playwright 的退出码和本次输出目录
export function uiBaseline(root, action, stdio = 'inherit') {
  const { evidence } = readPages(root);
  let cli;
  try { cli = createRequire(SELF).resolve('@playwright/test/cli'); } catch { throw new Error('没装 @playwright/test：npm i -D @playwright/test && npx playwright install chromium'); }
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace(/[-:]/g, '').replace(' ', '-');
  // 每次单开一个新目录：Playwright 开跑前会清空输出目录，不能指向整个证据目录，同一秒跑两次也不能共用
  fs.mkdirSync(evidence, { recursive: true });
  const out = fs.mkdtempSync(path.join(evidence, `ui-baseline-${stamp}-`));
  const update = action === 'shoot' ? 'all' : 'none';
  // 登录状态（会话 Cookie）只放临时目录，跑完就删，不进证据目录
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-baseline-state-'));
  const state = path.join(stateDir, 'state.json');
  fs.writeFileSync(state, JSON.stringify({ cookies: [], origins: [] }));
  try {
    const r = spawnSync(process.execPath, [cli, 'test', '-c', SELF, `--output=${out}`, `--update-snapshots=${update}`], {
      cwd: root, stdio, encoding: 'utf8', env: { ...process.env, UI_BASELINE_ROOT: root, UI_BASELINE_STATE: state },
    });
    return { status: r.status ?? 1, out, output: `${r.stdout ?? ''}${r.stderr ?? ''}` };
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
}

// 配置在 Playwright 进程里加载；pages.json 有错时这里先放过，由 spec 里的 readPages 报出来
const CFG = (() => { try { return readPages(ROOT); } catch { return {}; } })();

export default {
  testDir: path.dirname(SELF),
  testMatch: 'ui-baseline.spec.mjs',
  snapshotPathTemplate: path.join(CFG.baseline ?? path.join(ROOT, 'docs', 'design', 'baseline'), '{arg}{ext}'),
  reporter: 'list',
  retries: 0,
  workers: 1,
  ...(CFG.setup ? { globalSetup: CFG.setup } : {}),
  // --disable-lcd-text：文字一律灰度抗锯齿。默认的 LCD 子像素抗锯齿要看图层合成，同一版本连拍时玻璃卡片多的页偶尔整页西文字边缘不同
  // （carvomoto 采购推进、客户开发 2026-11-19 实测，关掉后连拍四次逐字节一致）
  use: { browserName: 'chromium', reducedMotion: 'reduce', launchOptions: { args: ['--disable-lcd-text'] }, ...(process.env.UI_BASELINE_STATE ? { storageState: process.env.UI_BASELINE_STATE } : {}) },
  expect: { toHaveScreenshot: { maxDiffPixelRatio: MAX_DIFF_RATIO, threshold: PIXEL_THRESHOLD, animations: 'disabled', caret: 'hide', ...(CFG.style ? { stylePath: CFG.style } : {}) } },
};

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  const action = process.argv[2];
  if (!['shoot', 'compare'].includes(action)) {
    console.error('用法：node scripts/ui-baseline.mjs shoot | compare');
    process.exit(2);
  }
  let status, out;
  try { ({ status, out } = uiBaseline(ROOT, action)); } catch (e) { console.error(e.message); process.exit(2); }
  if (action === 'shoot') console.log(status === 0 ? `基线已写到 ${readPages(ROOT).baseline}，记得登记进 docs/DECIDED.md` : `拍基线失败，看上面的报错；输出在 ${out}`);
  else console.log(status === 0 ? '和基线一致' : `和基线不一致或缺基线，差异图在 ${out}`);
  process.exitCode = status;
}
