import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readLogin } from '../server/routes/login.mjs';

test('登录预填：读数据目录的 login.json', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'login-'));
  writeFileSync(path.join(dir, 'login.json'), JSON.stringify({ account: 'demo', password: 'pw' }));
  assert.deepEqual(readLogin(dir), { configured: true, account: 'demo', password: 'pw' });
});

test('登录预填：没有文件或格式不对时按未设置处理', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'login-'));
  assert.deepEqual(readLogin(dir), { configured: false, account: '', password: '' });
  writeFileSync(path.join(dir, 'login.json'), '{坏的');
  assert.equal(readLogin(dir).configured, false);
  writeFileSync(path.join(dir, 'login.json'), JSON.stringify({ account: 'demo' }));
  assert.equal(readLogin(dir).configured, false);
});
