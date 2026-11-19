import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

// 只替换 HTTP 监听边界；加载真实入口、路由和隔离数据库，以 request 事件触发真实异步回调。
// 不开端口，不发送网络请求；未处理的 rejection 会使子进程以 1 退出。
for (const url of ['/api/images/%FF', '/api/images/%', 'http://[invalid']) {
  test(`畸形 URL ${url} 返回 400，进程存活并继续处理后续请求`, t => {
    assert.ok(process.env.WORKDESK_DATA_DIR);
    const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'server-entry-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const source = `
      import { registerHooks } from 'node:module';
      import { EventEmitter } from 'node:events';
      import assert from 'node:assert/strict';
      globalThis.server = new EventEmitter();
      registerHooks({ load(url, context, next) {
        if (url === 'node:http') return { format: 'module', shortCircuit: true, source:
          'export const createServer = handler => { globalThis.server.on("request", handler); return { listen() {} }; };' };
        return next(url, context);
      } });
      await import('./server/index.mjs');
      const request = (url, origin) => new Promise(resolve => {
        let status;
        server.emit('request', { url, method: 'GET', headers: { host: '127.0.0.1:5280', ...(origin && { origin }) }, resume() {} },
          { writeHead(code) { status = code; }, end(body) { resolve({ status, body: JSON.parse(body) }); } });
      });
      assert.equal((await request(${JSON.stringify(url)})).status, 400);
      assert.equal((await request('/api/no-such-route')).status, 404);
      assert.equal((await request('/api/no-such-route', 'https://outside.invalid')).status, 403);
      assert.equal((await request('/api/images/not-present')).status, 404);
      console.log('400; follow-up 404; process alive');
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', source], {
      encoding: 'utf8', timeout: 10_000, env: { ...process.env, WORKDESK_DATA_DIR: dir },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /400; follow-up 404; process alive/);
  });
}
