import { readFileSync } from 'node:fs';
import path from 'node:path';
import { dataDir } from '../db.mjs';
import { json, route } from '../http.mjs';

// 登录页预填：账号密码放在数据目录的 login.json（不进仓库），页面打开时读出来填好。
// 服务只监听本机，这一步是进门仪式，不是安全防护；没有 login.json 时不拦，直接放行。
export function readLogin(dir = dataDir) {
  try {
    const { account, password } = JSON.parse(readFileSync(path.join(dir, 'login.json'), 'utf8'));
    if (typeof account === 'string' && typeof password === 'string') return { configured: true, account, password };
  } catch { /* 没有文件或格式不对，按未设置处理 */ }
  return { configured: false, account: '', password: '' };
}

export function routes(db, { dir } = {}) {
  return [
    route('GET', '/api/login', (req, res) => {
      res.setHeader('cache-control', 'no-store');
      json(res, 200, readLogin(dir));
    }),
  ];
}
