// 飞书表 ID 不随版本排序变化；被删除的版本回到最新一版。
export function brandVersionIndex(versions, selectedTable) {
  const index = versions.findIndex(version => version.table === selectedTable);
  return index < 0 ? 0 : index;
}
