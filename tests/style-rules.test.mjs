import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkStyle } from '../scripts/check-style.mjs';

test('现有代码不违反样式与监听硬规则（含 docs/LESSONS.md 升级行）', () => {
  assert.deepEqual(checkStyle('.').map(v => `${v.file}:${v.line} ${v.text}`), []);
});

test('每条规则都能抓到违规样本，合规写法不误报', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'style-rules-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const put = (file, text) => { mkdirSync(path.dirname(path.join(root, file)), { recursive: true }); writeFileSync(path.join(root, file), text); };
  put('src/a.css', [
    '.ok { color: var(--text); }',
    '@media (prefers-reduced-motion: reduce) { .ok { color: var(--muted); } }',
    '.bad { transition: opacity .2s; }',
    '@keyframes spin { to { opacity: 1; } }',
  ].join('\n'));
  put('src/b.jsx', [
    "import React from 'react';",
    "import { Home } from 'lucide-react';",
    "const style = { animationDuration: '1s' };",
    "const Button = import('@mui/material/Button');",
  ].join('\n'));
  put('src/c.jsx', [
    'const saved = data.savedAt.slice(5, 16);',
    'const shown = String(value).slice(0, 16).replace("T", " ");',
    'const day = c.archivedAt.slice(0, 10);',
    'const clock = at.slice(11, 16);',
    'const today = updatedAt.slice(8, 10);',
    'const synced = syncedAt.slice(0, 10); // 北京时间',
    'const archived = beijingTime(c.archivedAt).slice(0, 10);',
  ].join('\n'));
  put('server/index.mjs', [
    'http.createServer(handler).listen(port, "127.0.0.1", () => {});',
    'other.listen(port, () => {});',
  ].join('\n'));
  put('package.json', JSON.stringify({
    scripts: { dev: 'vite --host 127.0.0.1', preview: 'vite preview', build: 'vite build' },
    dependencies: { react: '19.2.0', 'styled-components': '6.1.0', dayjs: '1.11.0' },
  }, null, 2));
  assert.deepEqual(checkStyle(root).map(v => `${v.file}:${v.line} ${v.kind}`).sort(), [
    'package.json:10 deps',
    'package.json:4 listen',
    'package.json:9 deps',
    'server/index.mjs:2 listen',
    'src/a.css:3 motion',
    'src/a.css:4 motion',
    'src/b.jsx:2 library',
    'src/b.jsx:3 motion',
    'src/b.jsx:4 library',
    'src/c.jsx:1 time',
    'src/c.jsx:2 time',
    'src/c.jsx:3 time',
  ]);
});

test('lessons 规则：每条 L-xx 要有以层级词开头的「升级」行，格式样例和占位标题不算', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'style-lessons-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'docs'), { recursive: true });
  // 坏样本取自本仓库补齐前的真实条目：L-01 升级行不带层级词、L-12 没有升级行
  writeFileSync(path.join(root, 'docs', 'LESSONS.md'), [
    '# 开发实录与坑',
    '## 怎么升级',
    '- 升级：这一节不是条目，不查。',
    '```markdown',
    '## L-01 <一句话现象>（<YYYY-MM-DD>）',
    '- 升级：未升级。',
    '```',
    '## L-01 改界面时把原有强调色改没了（2026-10-18）',
    '- 升级：已写进 AGENTS.md「分工」。',
    '## L-12 `set -u` 脚本里可选开关裸引用，变量不设就整段退出（2026-10-24）',
    '- 根因：只跑了 bash -n。',
    '- 提升：已提升为全局 G-08（2026-10-24）。',
    '## L-14 摆位候选全被拒时静默回退（2026-10-27）',
    '- 升级：〔机检〕关闭（2026-11-19，积压清单组 15）：核实坑已被代码消除。',
    '## L-30 扩展权限写成 `<all_urls>` 被商店拒（2026-11-19）',
    '- 现象：标题反引号里的尖括号是真实内容，不是占位，照样要查。',
    '## L-31 <占位标题>（<YYYY-MM-DD>）',
    '- 现象：没填的占位条目不查。',
  ].join('\n'));
  assert.deepEqual(checkStyle(root).map(v => `${v.file}:${v.line} ${v.kind} ${v.text}`), [
    'docs/LESSONS.md:9 lessons L-01 的「升级」没以层级词开头：- 升级：已写进 AGENTS.md「分工」。',
    'docs/LESSONS.md:10 lessons L-12 缺「- 升级：」一行',
    'docs/LESSONS.md:15 lessons L-30 缺「- 升级：」一行',
  ]);
});
