// 导入管培生的培养路径定义（T14）：npm run import:mentor-path -- <姓名> [--file 路径] [--confirm]
// 默认读 docs/培养路径/<姓名>.json，只预览不写入；加 --confirm 才写进工作台本地（WORKDESK_DATA_DIR，默认 data/），写完回读核对。
// 只换路径定义，已有的营地记录（评分、勾选、产出物链接）不动。
import { readFileSync } from 'node:fs';
import { dataDir, openDb } from '../server/db.mjs';
import { fingerprint, getRecord } from '../server/local-records.mjs';
import { createMentorPathService, PATH_KIND } from '../server/mentor-path.mjs';

const args = process.argv.slice(2), confirm = args.includes('--confirm');
const fileAt = args.indexOf('--file'), file = fileAt >= 0 ? args[fileAt + 1] : null;
const name = args.find((a, i) => !a.startsWith('--') && !(fileAt >= 0 && i === fileAt + 1));
if (!name || (fileAt >= 0 && !file)) { console.error('用法：npm run import:mentor-path -- <姓名> [--file 路径] [--confirm]'); process.exit(2); }
const source = file || `docs/培养路径/${name}.json`;

const nodes = def => new Map((def?.lines || []).flatMap(l => l.nodes.map(n => [n.id, JSON.stringify(n)])));
function diff(before, after) {
  if (!before) return '无，新建';
  const a = nodes(before), b = nodes(after);
  const added = [...b.keys()].filter(id => !a.has(id)), removed = [...a.keys()].filter(id => !b.has(id)), changed = [...b.keys()].filter(id => a.has(id) && a.get(id) !== b.get(id));
  const other = JSON.stringify([before.season, before.links, before.lines.map(({ nodes, ...l }) => l)]) !== JSON.stringify([after.season, after.links, after.lines.map(({ nodes, ...l }) => l)]);
  const parts = [added.length && `新增 ${added.join('、')}`, removed.length && `删去 ${removed.join('、')}`, changed.length && `改动 ${changed.join('、')}`, other && '赛季、线或跨线依赖有改动'].filter(Boolean);
  return parts.length ? `有，替换：${parts.join('；')}` : '有，内容相同，没有变化';
}

const db = openDb();
try {
  const service = createMentorPathService(db);
  const pv = service.importPreview(name, JSON.parse(readFileSync(source, 'utf8')), source);
  const { season: s, lines, links } = pv.value;
  console.log([
    `目标　　工作台本地（${dataDir}）· ${name}的培养路径`,
    `来源　　${source}`,
    `赛季　　${s.name} · ${s.start} 入职 · ${s.weeks} 周 · ${s.pass} 分通关 · ${s.rank} → ${s.next} · 评分人 ${s.reviewer}`,
    `关卡　　${lines.map(l => `${l.name} ${l.nodes.length} 关`).join('、')}；跨线依赖 ${links.length} 条`,
    `现有定义　${diff(pv.before, pv.value)}`,
    !pv.inMentorList && `提醒　　${name} 不在带教名单里，页面不会显示；先在设置里加进带教来源`,
    pv.orphans.length > 0 && `提醒　　这些关卡已有营地记录，新定义里没有：${pv.orphans.join('、')}（记录保留，页面不显示）`,
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
