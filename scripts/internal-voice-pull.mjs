// 内部原声：命令行按日期范围拉一次（#49）。数据目录取 WORKDESK_DATA_DIR，不带时是当前目录下的开发库 data/；操作正式数据要显式指定（docs/OPERATIONS.md「数据目录」）。
//   node scripts/internal-voice-pull.mjs <开始 YYYY-MM-DD> <结束 YYYY-MM-DD>
// 服务正在跑时，用页面或 /api/v3/internal-voice/pull/* 拉，别对同一个数据目录再开命令行拉（两边会同时写库）。
// 用于隔离数据目录试拉、核对；token 读钥匙串，不打印。
import { openDb } from '../server/db.mjs';
import { createInternalVoice } from '../server/internal-voice.mjs';

const [from, to] = process.argv.slice(2);
if (!from || !to) { console.error('用法：node scripts/internal-voice-pull.mjs <开始 YYYY-MM-DD> <结束 YYYY-MM-DD>'); process.exit(1); }
const db = openDb();
const voice = createInternalVoice(db, { resetInterrupted: false });
const started = Date.now();
try {
  const { runId, done } = voice.start({ from, to, trigger: 'manual' });
  const timer = setInterval(() => {
    const run = voice.status().runs.find(r => r.id === runId);
    console.log(`… ${Math.round((Date.now() - started) / 1000)}s ${JSON.stringify(run.stats)}`);
  }, 30_000);
  await done;
  clearInterval(timer);
  const run = voice.status().runs.find(r => r.id === runId);
  console.log(`${run.state}（${Math.round((Date.now() - started) / 1000)}s）${run.error ? `：${run.error}` : ''}`);
  console.log(JSON.stringify(run.stats));
  process.exit(run.state === 'failed' ? 1 : 0);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
