// 给内置的用户情况（docs/用户情况/YYYY-MM.json）补上由时间线计算的事实：时间窗、时间全景节点条、各地区节点数、推测节点，并按规范校验。
// 用法：node scripts/user-insight-facts.mjs 2026-11 [时间线接口，默认 http://127.0.0.1:5280/api/v3/timeline]
// 只读时间线接口；有校验错误时不写文件。
import { readFileSync, writeFileSync } from 'node:fs';
import { checkInsight, strategyWindow, timelineFacts } from '../server/user-strategy.mjs';

const [month, url = 'http://127.0.0.1:5280/api/v3/timeline'] = process.argv.slice(2);
if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '')) { console.error('用法：node scripts/user-insight-facts.mjs YYYY-MM [时间线接口]'); process.exit(1); }
const file = new URL(`../docs/用户情况/${month}.json`, import.meta.url);
const doc = JSON.parse(readFileSync(file, 'utf8'));
const timeline = await (await fetch(url)).json();
if (!Array.isArray(timeline.agenda)) { console.error('时间线读取失败', timeline.error || ''); process.exit(1); }
const window = strategyWindow(month), facts = timelineFacts(timeline, window);
const { value, issues } = checkInsight(doc);
for (const w of issues.warnings) console.log('提示', w);
if (issues.errors.length) { for (const e of issues.errors) console.error('错误', e); process.exit(1); }
const out = { month, window, timelineSyncedAt: timeline.syncedAt, preparedAt: doc.preparedAt,
  summary: value.summary, overview: { ...value.overview, lanes: facts.lanes, counts: facts.counts }, regions: value.regions, opportunities: value.opportunities,
  appendix: { guesses: facts.guesses, pending: value.pending } };
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
console.log(`${month}：${Object.values(facts.counts).reduce((a, b) => a + b, 0)} 个节点，${facts.guesses.length} 条推测，${issues.warnings.length} 条提示，已写入`);
