import data from '../fixtures/v3-demo-revenue.json' with { type: 'json' };

// 用户确认暂用演示口径；固定快照日期不能伪装成今天刷新过的真实业绩。
export const demoRevenue = () => structuredClone(data);
