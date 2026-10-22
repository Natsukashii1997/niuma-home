import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// 子进程的内存与时间有上限，防止索引不推进的回归拖死测试进程。
function parse(text) {
  const source = `import {parseMarkdown} from ${JSON.stringify(new URL('../src/ui/markdown.js', import.meta.url).href)}; console.log(JSON.stringify(parseMarkdown(${JSON.stringify(text)})));`;
  const result = spawnSync(process.execPath, ['--max-old-space-size=64', '--input-type=module', '-e', source], { encoding: 'utf8', timeout: 2000, maxBuffer: 1_000_000 });
  assert.equal(result.status, 0, `Markdown 解析须在有限时间和内存内结束：${result.error?.message || result.signal || result.stderr.slice(-200)}`);
  return JSON.parse(result.stdout);
}

test('飞书转义的短横线与星号列表正常推进索引并保留全部条目', () => {
  assert.deepEqual(parse('\\- 合成事项甲\n\\* 合成事项乙'), [{ type: 'list', ordered: false, items: ['合成事项甲', '合成事项乙'] }]);
});

test('转义与普通列表混排，后续段落、表格、标题均可继续解析', () => {
  const blocks = parse('\\# 合成周报\n\n- 普通事项\n\\- 转义事项\n* 星号事项\n1. 编号事项\n\n正文\n事项|状态|说明\n---|---|---\n合成|完成|说明\n\\## 下一节\n结束');
  assert.deepEqual(blocks.map(b => b.type), ['heading', 'list', 'para', 'table', 'heading', 'para']);
  assert.equal(blocks[1].items.length, 4); assert.equal(blocks[3].rows.length, 1); assert.equal(blocks.at(-1).text, '结束');
});

test('只有符号的空标题和空列表不会阻止解析前进', () => {
  const blocks = parse('# \n- \n\\* \n\n最后一段');
  assert.ok(blocks.some(b => b.text?.includes('最后一段')));
  assert.ok(blocks.every(b => b.type !== 'list' || b.items.length));
});

test('匿名周报形状：第68行的转义列表及后续至136行全部可读', () => {
  const lines = Array.from({ length: 136 }, (_, i) => `合成说明 ${i + 1}`);
  lines[0] = '# 匿名周报'; lines[65] = ''; lines[66] = '## 后续计划'; lines[67] = '\\- 合成计划事项'; lines[68] = '- 第二项'; lines[69] = ''; lines[135] = '匿名结束标记';
  const blocks = parse(lines.join('\n'));
  assert.ok(blocks.some(b => b.type === 'list' && b.items.includes('合成计划事项')));
  assert.match(blocks.at(-1).text, /匿名结束标记$/);
});
