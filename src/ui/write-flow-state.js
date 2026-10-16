// 写操作流程的纯逻辑（便于测试）：预览 → 明确确认 → 提交 → 回读。
// 阶段：idle 无预览 / previewing 生成预览中 / preview 待确认 / confirming 提交中 / saved 已回读核对 /
//       stale 预览失效需重新预览 / error 可改了再试 / unknown 结果不明（锁住，只能重新读取核对，不自动重试）。

export const IDLE = { phase: "idle" };

// 提交失败怎么归类：409 是预览过期或数据被别人改了；结果未知的收据、网络中断、5xx 都按「结果不明」处理，
// 因为请求可能已经写进去了，再点一次可能重复写入。其余 4xx 是输入问题，改了再预览即可。
export function classifyFailure(error) {
  if (error?.code === "EXPORT_RESULT_UNKNOWN" || error?.receipt) return "unknown";
  if (!error?.status) return "unknown";
  if (error.status === 409) return "stale";
  if (error.status >= 500) return "unknown";
  return "error";
}

// 输入变化时让旧预览失效；结果不明或提交中时不能清掉（防止绕过核对再次提交）。
export function canReset(phase) {
  return phase !== "unknown" && phase !== "confirming";
}

// 只有「待确认」时才能提交；提交中、已保存、失效、结果不明都不能再点。
export const canConfirm = (phase) => phase === "preview";
