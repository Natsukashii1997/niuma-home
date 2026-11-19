// 只给基线截图的隔离服务用（scripts/ui-baseline-setup.mjs 以 node --import 载入），正式服务和 npm test 都不加载：
// ① 服务端时间固定在 UI_BASELINE_NOW，培养路径的「今天」、状态栏的剩余天数每次都一样；
// ② 对外网络一律断开（如 Codex 重置条要连 aihot.news），截图不随外部内容变，也不从隔离服务往外发请求。
const fixed = Date.parse(process.env.UI_BASELINE_NOW ?? '');
if (Number.isNaN(fixed)) throw new Error('UI_BASELINE_NOW 没有设成合法时间');
const RealDate = Date;
globalThis.Date = class FixedDate extends RealDate {
  constructor(...args) { super(...(args.length ? args : [fixed])); }
  static now() { return fixed; }
};

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') return Promise.reject(new Error(`基线截图的隔离服务不连外网：${url.hostname}`));
  return realFetch(input, init);
};
