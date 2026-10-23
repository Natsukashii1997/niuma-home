import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkStyle } from '../scripts/check-style.mjs';

test('现有代码不违反样式与监听硬规则', () => {
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
