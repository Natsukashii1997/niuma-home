import { useCallback, useEffect, useState } from "react";

// 读取接口。接口返回 501（尚未实现）且给了 sample 时，改用示例数据并标记 isSample，页面据此显示「示例」。
// 接口实现后示例自动消失，页面无需改动。返回的 reload() 用于报错后「重新读取」。
// 后端给演示数据时（价格、营收：501 + 响应头 x-workdesk-data-origin: demo）用后端返回的演示数据，同样标 isSample，
// 「示例」标识保留，不当成真实业务数据；这样保存到本地的方案也能读回来核对。
export function useApi(path, sample) {
  const [state, setState] = useState({ loading: true });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState({ loading: true });
    fetch(path)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!alive) return;
        if (r.status === 501 && r.headers.get("x-workdesk-data-origin") === "demo" && body) setState({ data: body, isSample: true, task: body.task || "演示数据" });
        else if (r.status === 501 && sample !== undefined) setState({ data: sample, isSample: true, task: body?.task });
        else if (!r.ok) setState({ error: body?.error || `读取失败（${r.status}）`, status: r.status, code: body?.code });
        else setState({ data: body });
      })
      .catch((e) => alive && setState({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [path, tick]); // sample 应为模块级常量，不随渲染变化
  return { ...state, reload };
}

// 写请求。失败时抛出的错误带 status、code、receipt（后端的收据），由写操作流程判断是「预览失效」还是「结果不明」。
// 网络中断（fetch 本身失败）没有 status：请求可能已经到达后端，一律按结果不明处理。
export async function apiSend(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(data?.error || `请求失败（${r.status}）`), { status: r.status, code: data?.code, receipt: data?.receipt, body: data });
  return data;
}

// 回读用：和 useApi 同一口径，演示来源（501 + demo 头）也算读到了数据；其他失败照常抛错。
export async function apiRead(path) {
  const r = await fetch(path);
  const body = await r.json().catch(() => null);
  if (r.ok || (r.status === 501 && r.headers.get("x-workdesk-data-origin") === "demo" && body)) return body;
  throw Object.assign(new Error(body?.error || `读取失败（${r.status}）`), { status: r.status, code: body?.code });
}
