// 客观时间线与读取说明是即时派生的；保存回读核对所有可保存的正文，不能把后台同步当作正文写入失败。
export function authoredStrategyRecord(value) {
  const record = structuredClone(value);
  for (const key of ['origin', 'timelineEvidence', 'timelineSyncedAt', 'window']) delete record[key];
  if (record.overview) { delete record.overview.lanes; delete record.overview.counts; }
  if (record.appendix) delete record.appendix.guesses;
  return record;
}
