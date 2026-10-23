import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { createMentorService, mentorView, datedHeadings } from '../server/mentor.mjs';

// 带教答疑 GET 先回落库快照（2026-10-23 审核第 2 条）：服务重启后第一次 list() 不等飞书；超过 ttl 后台重读；refresh 仍现读。

const instant = Date.parse('2026-10-16T12:00:00+08:00');
const source = { name: '带教测试', role: '管培生', url: 'https://example.feishu.cn/docx/logs', year: 2026 };
const logXml = text => '<h1 id="first">10.16 日志</h1>' + text.split('\n').map((line, i) => `<p id="para${i}abcd">${line}</p>`).join('');
const person = (text = '问题1：这个怎么做？') => mentorView(source, datedHeadings('<h1 id="first">10.16 日志</h1>', 2026), logXml(text), instant);
function database(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR);
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'mentor-snapshot-')), db = openDb(dir);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  return db;
}
const service = (db, state) => createMentorService(db, { now: () => state.clock, readLogs: async () => { state.reads += 1; return state.value; }, generate: async () => { throw new Error('不该生成'); } });

test('第一次读取后落快照；新实例的 list() 直接回快照，不读飞书', async t => {
  const db = database(t); saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  const a = { clock: instant, reads: 0, value: person() };
  const first = await service(db, a).list();
  assert.equal(a.reads, 1); assert.equal(first[0].name, source.name);
  const b = { clock: instant + 1000, reads: 0, value: person('问题1：换了一版？') };
  const again = await service(db, b).list();
  assert.equal(b.reads, 0, '重启后先回快照');
  assert.equal(again[0].items[0].text, first[0].items[0].text);
});

test('超过 ttl 先回旧快照并后台重读；refresh 现读', async t => {
  const db = database(t); saveSetting(db, 'mentor_sources', JSON.stringify([source]));
  const s = { clock: instant, reads: 0, value: person('问题1：旧的') };
  const svc = service(db, s);
  await svc.list(); assert.equal(s.reads, 1);
  s.clock += 300_001; s.value = person('问题1：新的');
  const stale = await svc.list();
  assert.match(stale[0].items[0].text, /旧的/, '先回旧快照');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(s.reads, 2, '后台已重读一次');
  assert.match((await svc.list())[0].items[0].text, /新的/, '后台读完后拿到新内容');
  s.value = person('问题1：更新的');
  assert.match((await svc.list({ refresh: true }))[0].items[0].text, /更新的/);
  assert.equal(s.reads, 3);
});
