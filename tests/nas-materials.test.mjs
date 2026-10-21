import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openDb, saveSetting } from '../server/db.mjs';
import { sourceStatus } from '../server/source-status.mjs';
import { activityName, createNasMaterials, monthKey, recognize } from '../server/nas-materials.mjs';

test('活动名去掉版本后缀，同名活动归为一组', () => {
  assert.equal(activityName('a/现金赠礼活动海报1.jpg'), '现金赠礼活动海报');
  assert.equal(activityName('a/国际课程试听活动海报1（模考）.jpg'), '国际课程试听活动海报');
  assert.equal(activityName('a/国际课程试听活动海报1-1.jpg'), '国际课程试听活动海报');
  assert.equal(activityName('a/双11国际课程活动海报-5课时.jpg'), '双11国际课程活动海报');
  assert.equal(activityName('a/学业通关，课时助力-活动海报（48小时赠2课时 课时≥100小时）.jpg'), '学业通关，课时助力-活动海报');
  assert.equal(monthKey('2026-8月'), '2026-08');
  assert.equal(monthKey('2026-10月'), '2026-10');
  assert.equal(monthKey('双11人员头像'), null);
});

test('大学辅导：只认关键词，每类一张，活动按活动名各取第一张', () => {
  const r = recognize('大学辅导', [
    'm/大学海报/1v1试听海报2.jpg', 'm/大学海报/1v1试听海报.jpg', 'm/大学海报/选课指导价格图.jpg',
    'm/新生价格图/常规8月新生同步辅导价格图.jpg', 'm/大学海报/现金赠礼活动海报2.jpg', 'm/大学海报/现金赠礼活动海报1.jpg',
    'm/大学海报/稳分新签活动海报.jpg', 'm/产品物料/双11 B端价格图.jpg',
  ]);
  assert.deepEqual(r.价格图.map((i) => i.path), ['m/新生价格图/常规8月新生同步辅导价格图.jpg']);
  assert.deepEqual(r.选课指导.map((i) => i.path), ['m/大学海报/选课指导价格图.jpg']);
  assert.deepEqual(r.试听海报.map((i) => [i.path, i.others.length]), [['m/大学海报/1v1试听海报.jpg', 1]]);
  assert.deepEqual(r.活动海报.map((i) => [i.name, i.path]), [['稳分新签活动海报', 'm/大学海报/稳分新签活动海报.jpg'], ['现金赠礼活动海报', 'm/大学海报/现金赠礼活动海报1.jpg']]);
});

test('国际课程：价格图兼容新旧课时卡名称，同名多张取路径短的', () => {
  const r = recognize('国际课程', ['m/学科类+加赠课时/国际课程课时卡.jpg', 'm/学科类/国际课程课时卡.jpg', 'm/学科类/同步辅导课时卡.jpg', 'm/竞赛类/国际竞赛课时卡.jpg']);
  assert.deepEqual(r.价格图.map((i) => [i.path, i.others]), [['m/学科类/国际课程课时卡.jpg', ['m/学科类+加赠课时/国际课程课时卡.jpg']]]);
  assert.deepEqual(r.活动海报, []);
  assert.equal(recognize('国际课程', ['m/学科类/国际课程课程课时卡.jpg']).价格图[0].path, 'm/学科类/国际课程课程课时卡.jpg');
});

function fixture(t) {
  assert.ok(process.env.WORKDESK_DATA_DIR, '必须使用隔离目录');
  const dir = mkdtempSync(path.join(process.env.WORKDESK_DATA_DIR, 'nas-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'nas');
  const put = (rel) => { const f = path.join(root, rel); mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, `img:${rel}`); };
  put('2026-9月/2026-9月大学辅导/大学海报/试听海报.jpg');
  put('2026-9月/2026-9月大学辅导/营销物料/双11活动banner-1.png');
  put('2026-9月/2026-9月大学辅导/大学海报/稳分新签活动海报.jpg');
  put('2026-9月/2026-9月申诉服务/申诉活动海报.jpg');
  put('2026-9月/2026-9月国际课程/学科类/国际课程课时卡.jpg');
  put('2026-9月/2026-9月国际课程/学科类/说明.txt');
  put('双11人员头像/a.png');
  const db = openDb(path.join(dir, 'data'));
  t.after(() => db.close());
  saveSetting(db, 'nas_root', root);
  const made = [];
  const nas = createNasMaterials(db, { makeThumb: async (src, out) => { made.push(src); copyFileSync(src, out); }, now: () => Date.parse('2026-10-19T10:00:00+08:00') });
  return { db, nas, root, made, put };
}

test('扫描：不扫营销物料和其他业务线，存快照、只缓存缩略图，原图只按 id 取', async (t) => {
  const { db, nas, root, made } = fixture(t);
  const r = await nas.read();
  assert.deepEqual(r.months, ['2026-09']);
  assert.equal(r.reachable, true);
  assert.equal(r.lastScanAt, '2026-10-19 10:00');
  const uni = r.lines.大学辅导.cells;
  assert.deepEqual(uni['2026-09|活动海报'].map((i) => i.name), ['稳分新签活动海报'], '营销物料里的 banner 不算');
  assert.equal(uni['2026-09|试听海报'].length, 1);
  assert.deepEqual(uni['2026-09|价格图'], []);
  const card = r.lines.国际课程.cells['2026-09|价格图'][0];
  assert.equal(card.path, '2026-9月/2026-9月国际课程/学科类/国际课程课时卡.jpg');
  assert.equal(made.length, 3);
  assert.equal(sourceStatus(db).sources.nas.at, '2026-10-19 10:00', '状态栏能读出扫描时间');
  assert.equal(nas.thumb(card.id).toString(), `img:${card.path}`);
  assert.equal(nas.original(card.id).bytes.toString(), `img:${card.path}`);
  assert.throws(() => nas.original('0'.repeat(20)), (e) => e.status === 404);
  assert.throws(() => nas.thumb('../x'), (e) => e.status === 404);

  // 第二次读走快照，不再生成缩略图；NAS 卸载后仍能看快照，扫描与原图给出明确提示。
  await nas.read();
  assert.equal(made.length, 3);
  rmSync(root, { recursive: true, force: true });
  const off = await nas.read();
  assert.equal(off.reachable, false);
  assert.equal(off.lines.国际课程.cells['2026-09|价格图'][0].id, card.id);
  await assert.rejects(nas.scan(), (e) => e.status === 503 && /未挂载/.test(e.message));
  assert.throws(() => nas.original(card.id), (e) => e.status === 503);
  assert.equal(db.prepare("SELECT error FROM v3_source_status WHERE kind='nas'").get().error.includes('未挂载'), true);
});

test('新增11月和跨年月份同步后自动入列，月份别名合并，旧月与快照回读保留', async (t) => {
  const { db, nas, root, made, put } = fixture(t);
  const before = await nas.read();
  const oldCards = before.lines.大学辅导.cells['2026-09|试听海报'];
  const oldThumbCount = made.length;
  put('2026-11月/2026-11月大学辅导/产品物料/同步辅导价格图.jpg');
  put('2026-11月/2026-11月国际课程/产品物料/国际课程课程课时卡.jpg');
  put('2027-1月/大学辅导/新年活动海报.jpg');
  put('2027-01月/大学辅导/开学活动海报.jpg');
  writeFileSync(path.join(root, '2026-12月'), '这是普通文件，不是月份目录');
  assert.deepEqual((await nas.read()).months, ['2026-09'], '普通读取保留上次快照，直到点击同步');
  const updated = await nas.scan();
  assert.deepEqual(updated.months, ['2026-09','2026-11','2027-01']);
  assert.deepEqual(updated.lines.大学辅导.cells['2026-09|试听海报'], oldCards);
  assert.equal(updated.lines.大学辅导.cells['2026-11|价格图'].length, 1);
  assert.equal(updated.lines.国际课程.cells['2026-11|价格图'][0].file, '国际课程课程课时卡.jpg');
  assert.equal(updated.lines.大学辅导.cells['2027-01|活动海报'].length, 2, '1月和01月目录合并，物料不互相覆盖');
  assert.equal(made.length, oldThumbCount + 4, '历史缩略图复用');
  assert.deepEqual((await createNasMaterials(db).read()).lines, updated.lines, '服务重建后从快照读回新旧月份');
  assert.deepEqual((await nas.scan()).months, updated.months, '重复同步不重复创建月份列');
  assert.equal(made.length, oldThumbCount + 4);
});
