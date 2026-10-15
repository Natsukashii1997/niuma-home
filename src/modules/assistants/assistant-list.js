// 切换助手后，较早请求的迟到快照不能覆盖较新的保存回读。
export function assistantListReader(read, publish) {
  let sequence = 0;
  return async () => {
    const current = ++sequence, rows = await read();
    if (current === sequence) publish(rows);
    return rows;
  };
}
