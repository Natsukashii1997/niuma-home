import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { openDb, getSettings, saveSetting } from '../server/db.mjs';
import { routes } from '../server/routes/workspace.mjs';
import { match, json } from '../server/http.mjs';
import { REGION_SHEETS, TIMELINE_SOURCE, timelineIdentity } from '../server/timeline.mjs';

// 多年时间表：首年保持旧身份与来源格；后加年份先预览再确认，地区代码与来源格带年份，裁定不串年。
const makeSheet = (name, rows) => ({ name, cols: ['A', 'B', 'C', 'D'], rows: rows.map((values, i) => ({ row: i + 1, values })) });
const sheets = () => [
  makeSheet(REGION_SHEETS[0], [['美西', 'Fall学期开始', 'Final时间', 'Winter学期选课'], ['UW', '9.30', '12.12-12.18', '11.5-11.20']]),
  makeSheet(REGION_SHEETS[1], [['英国（semester1/2）', 'S2 Final 时间', '出分时间', '补考时间'], ['卡迪夫大学', '5.11-6.12', '7.20', '8.3-8.14']]),
  makeSheet(REGION_SHEETS[2], [['澳洲（semester1/2）', 'Semester 2学期开学', 'Final时间', '出分时间'], ['昆士兰大学UQ', '7.27', '11.7-11.21', '12.2']]),
  makeSheet(REGION_SHEETS[3], [['香港（Term1/2）', 'Term 1学期开学', 'Final时间', '出分时间'], ['香港大学HKU', '8.31', '12.8-12.23（AI推测）', '12.30']]),
];
const SOURCE_2027 = { title: '2027海外大学时间线', token: 'Sheet2027Token', url: 'https://example.feishu.cn/wiki/Node2027' };

async function setup(t, { resolve } = {}) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须隔离');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'tl-years-'));
  const db = openDb(dir), reads = [];
  let broken = false;
  const readSheets = async ({ source }) => { reads.push(source.title); const all = sheets(); return broken && source.token === SOURCE_2027.token ? all.slice(1) : all; };
  const all = routes(db, undefined, undefined, { timeline: { readSheets, now: () => Date.parse('2026-10-23T14:00:00+08:00') }, timelineYears: { resolve: resolve || (async url => ({ ...SOURCE_2027, url })) } });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), found = match(all, req.method, url.pathname);
    if (!found) return json(res, 404, { error: '接口不存在' });
    try { await found.handler(req, res, { params: found.params, url }); } catch { json(res, 500, { error: '异常' }); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (method, endpoint, body) => { const r = await fetch(base + endpoint, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
  return { db, request, reads, breakNext: () => { broken = true; } };
}
const snapshotIdentity = db => JSON.parse(db.prepare("SELECT payload FROM v3_snapshots WHERE kind='timeline'").get().payload).identity;

test('只有首年时来源身份与来源格同旧版，years 只列 2026', async t => {
  const { db, request } = await setup(t);
  const tl = (await request('POST', '/api/v3/timeline/sync')).body;
  assert.equal(snapshotIdentity(db), JSON.stringify(TIMELINE_SOURCE));
  assert.equal(timelineIdentity(getSettings(db)), JSON.stringify(TIMELINE_SOURCE));
  assert.deepEqual(tl.years.map(y => y.year), [2026]);
  assert.ok(tl.agenda.every(e => !e.src.includes('·')));
  assert.ok(tl.agenda.some(e => e.from === '2026-12-12'));
});

test('预览新年份只读不写；确认后写设置、同步回读，两年并存且代码与来源格带年份', async t => {
  const { db, request, reads } = await setup(t);
  await request('POST', '/api/v3/timeline/sync');
  const pv = await request('POST', '/api/v3/timeline/years/preview', { url: SOURCE_2027.url });
  assert.equal(pv.status, 200);
  assert.deepEqual([pv.body.summary.year, pv.body.summary.title, pv.body.summary.regionSheets], [2027, SOURCE_2027.title, 4]);
  assert.ok(pv.body.summary.events > 0 && pv.body.summary.from.startsWith('2027-'));
  assert.equal(getSettings(db).timeline_years, undefined, '预览不写设置');
  assert.equal((await request('POST', '/api/v3/timeline/years/confirm', { previewId: pv.body.previewId })).status, 400, '没有明确确认');
  const done = await request('POST', '/api/v3/timeline/years/confirm', { previewId: pv.body.previewId, confirm: true });
  assert.equal(done.status, 200);
  assert.deepEqual(done.body.years.map(y => y.year), [2026, 2027]);
  assert.deepEqual(JSON.parse(getSettings(db).timeline_years).map(s => [s.year, s.token]), [[2027, SOURCE_2027.token]]);
  assert.equal(snapshotIdentity(db), timelineIdentity(getSettings(db)));
  assert.ok(reads.includes(SOURCE_2027.title));
  const tl = (await request('GET', '/api/v3/timeline')).body;
  assert.ok(tl.countries.some(([code]) => code === 'US@2027') && tl.countries.some(([code]) => code === 'US'));
  assert.ok(tl.table['UK@2027'] && tl.table.UK);
  assert.ok(tl.agenda.some(e => e.from === '2026-12-12' && !e.src.includes('·')));
  assert.ok(tl.agenda.some(e => e.from === '2027-12-12' && e.src.startsWith('2027·')));
  assert.ok(tl.anomalies.some(a => a.src.startsWith('2027·')) && tl.anomalies.some(a => !a.src.startsWith('2027·')));
  const status = (await request('GET', '/api/v3/status')).body;
  assert.equal(status.sources.timeline.state, 'ok', '来源状态按多年身份核对');
});

test('同一年或同一张表不能重复登记；表名无年份、地区表不全都拒绝；预览后配置变化须重新预览', async t => {
  const { db, request } = await setup(t);
  const first = await request('POST', '/api/v3/timeline/years/preview', { url: SOURCE_2027.url });
  saveSetting(db, 'timeline_years', JSON.stringify([{ year: 2028, title: '2028海外大学时间线', token: 'other', url: 'https://example.feishu.cn/wiki/x' }]));
  assert.equal((await request('POST', '/api/v3/timeline/years/confirm', { previewId: first.body.previewId, confirm: true })).status, 409);
  saveSetting(db, 'timeline_years', JSON.stringify([{ ...SOURCE_2027, year: 2027 }]));
  assert.equal((await request('POST', '/api/v3/timeline/years/preview', { url: SOURCE_2027.url })).status, 409);
  assert.equal((await request('POST', '/api/v3/timeline/years/preview', { url: SOURCE_2027.url, extra: 1 })).status, 400);
  const { request: r2 } = await setup(t, { resolve: async url => ({ title: '海外大学时间线', token: 't', url }) });
  assert.equal((await r2('POST', '/api/v3/timeline/years/preview', { url: SOURCE_2027.url })).status, 400);
  const s3 = await setup(t);
  s3.breakNext();
  const bad = await s3.request('POST', '/api/v3/timeline/years/preview', { url: SOURCE_2027.url });
  assert.equal(bad.status, 502);
  assert.equal(getSettings(s3.db).timeline_years, undefined);
});

test('首年格子的人工裁定不影响次年同一位置的格子', async t => {
  const { request } = await setup(t);
  await request('POST', '/api/v3/timeline/sync');
  const pv = await request('POST', '/api/v3/timeline/years/preview', { url: SOURCE_2027.url });
  await request('POST', '/api/v3/timeline/years/confirm', { previewId: pv.body.previewId, confirm: true });
  const tl = (await request('GET', '/api/v3/timeline')).body;
  const a = tl.anomalies.find(x => x.cell && !x.src.startsWith('2027·'));
  assert.ok(a, '首年有可裁定的日期格');
  assert.ok(tl.anomalies.some(x => x.src === `2027·${a.src}`), '次年同一位置也有这条');
  const rp = await request('POST', `/api/v3/timeline/anomalies/${a.key}/preview`, { decision: 'exclude' });
  assert.equal(rp.status, 200);
  assert.equal((await request('POST', '/api/v3/timeline/anomalies/confirm', { previewId: rp.body.previewId, confirm: true })).status, 200);
  const after = (await request('GET', '/api/v3/timeline')).body;
  assert.equal(after.anomalies.find(x => x.key === a.key).ruling.decision, 'exclude');
  assert.equal(after.anomalies.find(x => x.src === `2027·${a.src}`).ruling, undefined);
});
