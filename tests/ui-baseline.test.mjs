import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readPages, uiBaseline } from '../scripts/ui-baseline.mjs';

// 没装 Playwright 时跳过：不是网页项目的，删掉 scripts/ui-baseline.mjs、scripts/ui-baseline.spec.mjs 和本文件
let skip = false;
try {
  const { chromium } = await import('@playwright/test');
  if (!fs.existsSync(chromium.executablePath())) skip = '没装 Chromium：npx playwright install chromium';
} catch {
  skip = '没装 @playwright/test：npm i -D @playwright/test';
}

const tmp = (prefix, base = os.tmpdir()) => { fs.mkdirSync(base, { recursive: true }); return fs.mkdtempSync(path.join(base, prefix)); };
const write = (root, file, text) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), text);
};
const html = color => `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; font: 16px sans-serif; }
  .card { width: 320px; height: 160px; margin: 40px; background: ${color}; transition: background 2s; }
  .spin { width: 40px; height: 40px; margin: 40px; border: 4px solid #333; border-top-color: transparent; border-radius: 50%; animation: s 0.6s linear infinite; }
  @keyframes s { to { transform: rotate(360deg); } }
</style><h1>首页</h1><div class="card"></div><div class="spin"></div>
<p id="t" style="font: 72px monospace"></p><script>document.getElementById('t').textContent = new Date().toISOString();</script>`;

test('页面清单：缺字段、名字重复、证据目录在 /tmp、可选项写错都报错，widths 默认 1280 和 1440', () => {
  const root = tmp('ui-baseline-pages-');
  const pages = obj => write(root, 'docs/design/pages.json', JSON.stringify(obj));
  try {
    assert.throws(() => readPages(root), /没有 docs\/design\/pages\.json/);
    pages({ pages: [{ name: 'home', url: 'http://127.0.0.1:3000/' }] });
    assert.throws(() => readPages(root), /缺 evidence/);
    pages({ evidence: '/tmp/x', pages: [{ name: 'home', url: 'http://127.0.0.1:3000/' }] });
    assert.throws(() => readPages(root), /不能放 \/tmp/);
    pages({ evidence: '~/e', pages: [{ name: 'home', url: 'a' }, { name: 'home', url: 'b' }] });
    assert.throws(() => readPages(root), /name 重复：home/);
    pages({ evidence: '~/e', pages: [{ name: 'home', url: 'a' }] });
    assert.deepEqual(readPages(root), { evidence: path.join(os.homedir(), 'e'), pages: [{ name: 'home', url: 'a', widths: [1280, 1440], mask: [] }] });
    // 可选项：setup / style 指向的文件要存在（转成绝对路径），clock 要是合法时间
    pages({ evidence: '~/e', setup: 'no-such.mjs', pages: [{ name: 'home', url: 'a' }] });
    assert.throws(() => readPages(root), /setup 指向的文件不存在/);
    pages({ evidence: '~/e', clock: '明天', pages: [{ name: 'home', url: 'a' }] });
    assert.throws(() => readPages(root), /clock 不是合法时间/);
    write(root, 'docs/design/shot.css', '');
    pages({ evidence: '~/e', style: 'docs/design/shot.css', clock: '2026-12-02T10:00:00+08:00', ready: 'h1', pages: [{ name: 'home', url: 'a' }] });
    const r = readPages(root);
    assert.equal(r.style, path.join(root, 'docs/design/shot.css'));
    assert.equal(r.clock, '2026-12-02T10:00:00+08:00');
    assert.equal(r.ready, 'h1');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('基线截图：拍基线 → 原样对比通过 → 改一处样式后对比失败并写出差异图', { skip, timeout: 180_000 }, () => {
  // 夹具放在项目的 node_modules/.cache 下：证据目录不许在 /tmp，而有的系统 os.tmpdir() 就是 /tmp
  const root = tmp('ui-baseline-', path.join(import.meta.dirname, '..', 'node_modules', '.cache'));
  try {
    write(root, 'site/index.html', html('#4a90d9'));
    // 页面上显示 new Date()：固定了 clock，两次截图才会一样
    write(root, 'docs/design/pages.json', JSON.stringify({ evidence: 'evidence', clock: '2026-12-02T10:00:00+08:00', ready: '#t', pages: [{ name: 'home', url: pathToFileURL(path.join(root, 'site/index.html')).href }] }));
    const shoot = uiBaseline(root, 'shoot', 'pipe');
    assert.equal(shoot.status, 0, shoot.output);
    for (const w of [1280, 1440]) assert.ok(fs.existsSync(path.join(root, `docs/design/baseline/home-${w}.png`)), `缺基线 home-${w}.png`);

    // 转圈动画一直在动，原样对比仍要通过：动画停住了才不会误报
    const same = uiBaseline(root, 'compare', 'pipe');
    assert.equal(same.status, 0, same.output);

    write(root, 'site/index.html', html('#d94a4a'));
    const changed = uiBaseline(root, 'compare', 'pipe');
    assert.notEqual(changed.status, 0, changed.output);
    assert.ok(changed.out.startsWith(path.join(root, 'evidence', 'ui-baseline-')), changed.out);
    assert.notEqual(changed.out, same.out, '每次对比单开输出目录');
    const diffs = fs.readdirSync(changed.out, { recursive: true }).filter(f => String(f).endsWith('-diff.png'));
    assert.equal(diffs.length, 2, `差异图应有 2 张：${diffs.join('、')}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
