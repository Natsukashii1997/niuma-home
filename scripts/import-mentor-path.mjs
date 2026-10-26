// 给带教名单里已有的人按培养方案模板生成培养路径（替换旧版）：npm run import:mentor-path -- <姓名> --start YYYY-MM-DD [--plan v2.4] [--confirm]
// 默认只预览不写入；加 --confirm 才写进工作台本地（WORKDESK_DATA_DIR，默认 data/），写完回读核对。进度记录不动。
// 名单里没有的人在培养路径页上「添加带教对象」，不走这个脚本。
import { dataDir, openDb } from '../server/db.mjs';
import { fingerprint, getRecord } from '../server/local-records.mjs';
import { createMentorPathService, PATH_KIND } from '../server/mentor-path.mjs';

const args = process.argv.slice(2), confirm = args.includes('--confirm');
const opt = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
const start = opt('--start'), plan = opt('--plan');
const name = args.find((a, i) => !a.startsWith('--') && !['--start', '--plan'].includes(args[i - 1]));
if (!name || !start) { console.error('用法：npm run import:mentor-path -- <姓名> --start YYYY-MM-DD [--plan v2.4] [--confirm]'); process.exit(2); }

const db = openDb();
try {
  const service = createMentorPathService(db);
  const pv = service.importPreview(name, { start, ...(plan && { plan }) }), v = pv.view;
  const reviews = v.lines[0].stages.filter(s => s.review).map(s => `D${s.d[1]} ${s.review}（${s.dates[1]}）`);
  const now = v.lines.map(l => { const s = l.stages.find(x => x.status === 'doing'); return `${l.name}${s ? ` ${s.id} ${s.short}${s.late ? `，超出计划 ${s.late} 个工作日` : ''}` : ' 已走完'}`; });
  console.log([
    `目标　　工作台本地（${dataDir}）· ${name}的培养路径`,
    `方案　　${v.plan.name}（${v.plan.id}）`,
    `排期　　${v.start} 入职（D1）→ D${v.days} 结业（${v.end}）；按工作日算，跳过法定节假日、调休上班日照常算`,
    `阶段　　${v.lines.map(l => `${l.name} ${l.stages.length} 段`).join('、')}`,
    `评审　　${reviews.join('、')}`,
    `今天　　D${v.todayD}；${now.join('；')}`,
    v.missingYears.length > 0 && `提醒　　${v.missingYears.join('、')} 年的法定节假日还没录入，这几年按周一到周五算`,
    `现有路径　${!pv.before ? '无，新建' : pv.before.version ? '有，按模板重新生成（入职日和各段日期、安排都换成模板的）' : '旧版按周的路径，换成按工作日的新版'}`,
    pv.orphans.length > 0 && `提醒　　这些段已有进度记录，新路径里没有：${pv.orphans.join('、')}（记录保留，页面不显示）`,
  ].filter(Boolean).join('\n'));
  if (!confirm) console.log('\n只预览，没有写入。核对无误后加 --confirm 再执行一次。');
  else {
    service.importConfirm(name, pv.previewId);
    if (fingerprint(getRecord(db, PATH_KIND, name)) !== fingerprint(pv.value)) throw new Error('写入后回读和预览不一致');
    console.log('\n已写入，回读核对一致。');
  }
} catch (error) {
  console.error(`没有完成：${error.message}`);
  process.exitCode = 1;
} finally { db.close(); }
