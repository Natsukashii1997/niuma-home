import { useEffect, useState } from "react";

// 读取接口。接口返回 501（尚未实现）且给了 sample 时，改用示例数据并标记 isSample，页面据此显示「示例」。
// 接口实现后示例自动消失，页面无需改动。
export function useApi(path, sample) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState({ loading: true });
    fetch(path)
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!alive) return;
        if (r.status === 501 && sample !== undefined) setState({ data: sample, isSample: true, task: body?.task });
        else if (!r.ok) setState({ error: body?.error || `读取失败（${r.status}）` });
        else setState({ data: body });
      })
      .catch((e) => alive && setState({ error: e.message }));
    return () => {
      alive = false;
    };
  }, [path]); // sample 应为模块级常量，不随渲染变化
  return state;
}

export async function apiSend(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.error || `请求失败（${r.status}）`);
  return data;
}
