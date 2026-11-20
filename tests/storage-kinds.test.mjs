import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { DOCUMENT_KINDS, SNAPSHOT_KINDS, isDocumentKind, isSnapshotKind } from '../server/storage-kinds.mjs';

// 读源码找出所有「写死的 kind」：直接写在调用里的字符串，以及同一文件里 const X = '…' 再传进去的。
// 拼出来的 kind（模板字符串、函数参数）这里看不到，靠 storage-kinds.mjs 里的 PATTERNS 说明。
const files = ['server', 'server/routes'].flatMap(dir => readdirSync(new URL(`../${dir}/`, import.meta.url)).filter(f => f.endsWith('.mjs')).map(f => `${dir}/${f}`));
const DOCUMENT_CALL = /\b(?:getRecord|putRecord|listRecords)\(\s*db\s*,\s*('[^']+'|[A-Za-z_]\w*)|\bchanges\.(?:preview|confirm)\(\s*('[^']+'|[A-Za-z_]\w*)|FROM v3_documents WHERE kind='([^']+)'|INTO v3_documents\(kind,id,payload,updated_at\) VALUES\('([^']+)'/g;
const SNAPSHOT_CALL = /\b(?:saveSnapshot|createConfiguredReader)\(\s*db\s*,\s*('[^']+'|[A-Za-z_]\w*)|v3_snapshots WHERE kind='([^']+)'|v3_snapshots WHERE kind=\?'\)\.get\(('[^']+'|[A-Za-z_]\w*)\)/g;

// 登记表里的 kind 至少要在某个服务文件里以带引号的字符串出现（有的是经三元表达式、变量再传进去的，上面的调用正则扫不到）。
const sources = files.filter(f => f !== 'server/storage-kinds.mjs').map(f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
const quoted = kind => sources.some(source => source.includes(`'${kind}'`) || source.includes(`"${kind}"`));

function used(pattern) {
  const found = [];
  for (const file of files) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    const constants = new Map([...source.matchAll(/\b([A-Za-z_]\w*)\s*=\s*'([^']+)'/g)].map(m => [m[1], m[2]]));
    for (const match of source.matchAll(pattern)) {
      const token = match.slice(1).find(Boolean);
      const kind = token.startsWith("'") ? token.slice(1, -1) : constants.get(token);
      if (kind) found.push({ file, kind });
    }
  }
  return found;
}

test('v3_documents：源码里写死的 kind 都在 storage-kinds.mjs 登记过，登记表里没有多余的', () => {
  const found = used(DOCUMENT_CALL);
  assert.ok(found.length > 80, `扫到的调用太少（${found.length}），多半是正则失效了`);
  assert.deepEqual(found.filter(x => !isDocumentKind(x.kind)).map(x => `${x.file}: ${x.kind}`), [], '没登记的 kind');
  assert.deepEqual(Object.keys(DOCUMENT_KINDS).filter(kind => !quoted(kind)), [], '登记了但源码里已经不用的 kind');
});

test('v3_snapshots：源码里写死的 kind 都登记过，登记表里没有多余的', () => {
  const found = used(SNAPSHOT_CALL);
  assert.ok(found.length > 10, `扫到的调用太少（${found.length}）`);
  assert.deepEqual(found.filter(x => !isSnapshotKind(x.kind)).map(x => `${x.file}: ${x.kind}`), [], '没登记的 kind');
  assert.deepEqual(Object.keys(SNAPSHOT_KINDS).filter(kind => !quoted(kind)), [], '登记了但源码里已经不用的 kind');
});
