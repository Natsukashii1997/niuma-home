// 回执和业务内容必须同时存在；DELETE 还核对原图片地址确实已移除。
export async function verifyMaterialWrite(refresh, result, op) {
  const rows = await refresh();
  const imageOperation = /\/images(?:\/|\?)/.test(op.path);
  const id = result.materialId ?? result.id;
  const actual = rows.find(row => row.id === id);
  if (op.method === 'DELETE') {
    if (imageOperation ? !actual || actual.images.some(image => op.path.split('?')[0].endsWith('/' + image.id)) || actual.writeVersion !== result.writeVersion : !!actual) return false;
    for (const url of op.context?.urls || []) if ((await fetch(url)).status !== 404) return false;
    return true;
  }
  if (!actual || actual.writeVersion !== result.writeVersion) return false;
  if (!imageOperation) return ['month', 'line', 'name', 'type', 'skus', 'note'].every(key => JSON.stringify(actual[key]) === JSON.stringify(result[key]));
  if (!actual.images.some(image => image.id === result.id && image.url === result.url)) return false;
  const response = await fetch(result.url);
  if (!response.ok) return false;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== op.body.size) return false;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') === op.body.sha256;
}

// 按操作编号移除已确认项，同名或同内容图片不应误删其他队列项。
export function removeConfirmedUploads(queue, requestIds) {
  const confirmed = new Set(requestIds);
  const next = queue.filter(entry => !entry.requestId || !confirmed.has(entry.requestId));
  return next.length === queue.length ? queue : next;
}
