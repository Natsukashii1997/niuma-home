import { useCallback, useEffect, useRef, useState } from "react";

// 读取接口。接口返回 501（尚未实现）且给了 sample 时，改用示例数据并标记 isSample，页面据此显示「示例」。
// 接口实现后示例自动消失，页面无需改动。返回的 reload() 用于报错后「重新读取」。
// 后端给演示口径的数据时（价格、营收：数据里 origin 为 "demo"，并带响应头 x-workdesk-data-origin: demo），照常显示，
// 同时标 isSample，「示例」标识保留，不当成真实业务数据。
const isDemo = (body) => Boolean(body) && (body.origin === "demo" || (Array.isArray(body) && body.some((x) => x?.origin === "demo")));

// 读取共享（2026-10-23 审核第 4 条）：同一路径常被一个页面里的多个组件同时读（首页横条和卡片都读 codex-reset，月度促销页三处读 /api/plans）。
// 进行中的请求共用一个 fetch；完成的结果 3 秒内复用；reload() 强制重读；apiSend 发出的任何写请求都让缓存失效，避免写后读到旧值。
const RECENT_MS = 3000;
const inflight = new Map(), recent = new Map();
export function invalidateReads() { recent.clear(); }
export function readShared(path, force = false) {
  if (!force) {
    const hit = recent.get(path);
    if (hit && Date.now() - hit.at < RECENT_MS) return hit.promise;
    if (inflight.has(path)) return inflight.get(path);
  }
  const promise = fetch(path).then(async (r) => ({ ok: r.ok, status: r.status, demo: r.headers.get("x-workdesk-data-origin") === "demo", body: await r.json().catch(() => null) }));
  inflight.set(path, promise);
  promise.then(() => recent.set(path, { at: Date.now(), promise }), () => {}).finally(() => { if (inflight.get(path) === promise) inflight.delete(path); });
  return promise;
}

export function useApi(path, sample) {
  const [state, setState] = useState({ loading: true });
  const [tick, setTick] = useState(0);
  const force = useRef(false);
  const reload = useCallback(() => { force.current = true; setTick((t) => t + 1); }, []);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    const forced = force.current;
    force.current = false;
    setState({ loading: true });
    readShared(path, forced)
      .then((r) => {
        if (!alive) return;
        const { body } = r;
        const demo = r.demo || isDemo(body);
        if ((r.ok || r.status === 501) && demo && body) setState({ data: body, isSample: true, task: (!Array.isArray(body) && body.task) || "演示数据" });
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
export async function apiSend(method, path, body, options = {}) {
  let r;
  try {
    r = await fetch(path, {
      method,
      headers: { "content-type": "application/json", ...options.headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } finally { if (method !== "GET") invalidateReads(); } // 写过就不复用旧读取结果
  const data = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(data?.error || `请求失败（${r.status}）`), { status: r.status, code: data?.code, receipt: data?.receipt, body: data });
  return data;
}

// 回读用：和 useApi 同一口径；其他失败照常抛错。
export async function apiRead(path) {
  const r = await fetch(path);
  const body = await r.json().catch(() => null);
  if (r.ok || (r.status === 501 && r.headers.get("x-workdesk-data-origin") === "demo" && body)) return body;
  throw Object.assign(new Error(body?.error || `读取失败（${r.status}）`), { status: r.status, code: body?.code });
}

// 先展示完整快照，后台读取结束后回读；失败保留内容，停止轮询并显示原因。
export function useFreshApi(path, { refreshPath = `${path}?refresh=1`, refreshMethod = 'GET' } = {}) {
  const [state, setState] = useState({ loading: true });
  const [request, setRequest] = useState({ tick: 0, force: false });
  const reload = useCallback(() => setRequest(r => ({ tick: r.tick + 1, force: true })), []);
  useEffect(() => {
    let active = true, timer;
    setState(s => ({ ...s, loading: !s.data, busy: true, error: undefined }));
    async function read(force) {
      try {
        const data = force ? await apiSend(refreshMethod, refreshPath) : await apiRead(path);
        if (!active) return;
        setState({ data, busy: !!data.refreshing });
        if (data.refreshing) timer = setTimeout(() => read(false), 1500);
      } catch (error) {
        if (active) setState(s => ({ ...s, loading: false, busy: false, error: error.message }));
      }
    }
    read(request.force);
    return () => { active = false; clearTimeout(timer); };
  }, [path, refreshPath, refreshMethod, request]);
  return { ...state, reload };
}
