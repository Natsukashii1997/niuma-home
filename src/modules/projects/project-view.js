// 项目推进的显示口径（纯函数，便于测试）。
// 来源没填完成状态时 statusKnown 为 false：显示「未填写」，不算未完成，也不算完成。
// 只有 gateReady 为 true 的门禁才算「等你审核」；只标了 gate 的只是门禁节点。
// 截止日期用完整的 dueDate（YYYY-MM-DD），跨年也算得对。

export function nodeState(n) {
  if (n.statusKnown === false) return "unknown";
  return n.done ? "done" : "open";
}

const dayMs = 86400000;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

export function projectSummary(p, today) {
  const nodes = p?.nodes || [];
  const daysTo = (n) => (/^\d{4}-\d{2}-\d{2}$/.test(n.dueDate || "") ? Math.round((parse(n.dueDate) - parse(today)) / dayMs) : null);
  const states = nodes.map(nodeState);
  const notDone = nodes.filter((_, i) => states[i] !== "done");
  const soon = notDone.filter((n) => { const d = daysTo(n); return d !== null && d <= 2; });
  return {
    total: nodes.length,
    done: states.filter((s) => s === "done").length,
    unknown: states.filter((s) => s === "unknown").length,
    gates: notDone.filter((n) => n.gateReady === true).length,
    soon: soon.length,
    soonest: [...soon].sort((a, b) => daysTo(a) - daysTo(b))[0],
    undated: notDone.filter((n) => !n.dueDate).length,
    next: nodes.find((_, i) => states[i] === "open") || notDone[0],
    daysTo,
  };
}
