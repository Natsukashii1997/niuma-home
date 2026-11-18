import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readPages } from '../scripts/ui-baseline.mjs';

// 发布前界面基线对比（2026-11-19 复盘提案 P3）：新快照建好之后、备份数据库和切换服务之前跑；不一致就删掉这份快照并中止。
// 这里只核对控制流的位置，不真跑发布；对比本身见 tests/ui-baseline.test.mjs。
test('发布脚本：新快照建好后先做界面基线对比，再备份数据库、切换服务；--use 回滚不比', () => {
  const s = fs.readFileSync(new URL('../scripts/release-app.sh', import.meta.url), 'utf8');
  const compare = s.indexOf('NIUMA_UI_APP="$REL" "$NODE" "$ROOT/scripts/ui-baseline.mjs" compare');
  assert.ok(compare > 0, '发布脚本里要有基线对比');
  assert.ok(compare > s.indexOf('[ -f "$REL/dist/index.html" ] || fail'), '对比要在快照构建完成之后');
  assert.ok(compare < s.indexOf('if [ -f "$DATA_DIR/work-desk.db" ]'), '对比要在备份数据库之前');
  assert.ok(compare < s.indexOf('launchctl bootout'), '对比要在切换服务之前');
  assert.ok(compare > s.indexOf('if [ "${1:-}" = "--use" ]') && compare < s.indexOf('\nfi\n', s.indexOf('if [ "${1:-}" = "--use" ]')), '对比只在生成新快照的分支里，回滚不比');
  assert.match(s.slice(compare, s.indexOf('\n', compare)), /\|\| \{ rm -rf "\$REL"; fail /, '不一致要删掉这份快照并中止');
});

test('基线页面清单：隔离服务的地址、证据目录和截图选项', () => {
  const { evidence, pages, setup, clock } = readPages(fileURLToPath(new URL('..', import.meta.url)));
  assert.match(evidence, /NiumaHome\/evidence\/ui-baseline$/);
  assert.ok(setup.endsWith('scripts/ui-baseline-setup.mjs'));
  assert.ok(clock, '要固定时间，培养路径的「今天」才不会每天变');
  for (const p of pages) assert.match(p.url, /^http:\/\/127\.0\.0\.1:5296\/#\//, `${p.name} 要指向隔离服务的端口 5296，不能是正式 5280`);
});
