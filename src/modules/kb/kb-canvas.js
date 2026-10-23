// 知识库画布的纯函数（便于测试）：哪些是分组、怎么排、本地先应用一项变更。
// 分组 = 根目录下有子节点的目录，或收藏规则里的一级目录，或画布上排过序 / 新建的目录；其余根节点是散卡。

export const ROOT = "";

// 在树上找节点：{ node, parentId, siblings }。
export function locate(tree, id, parentId = ROOT) {
  for (const n of tree) {
    if (n.id === id) return { node: n, parentId, siblings: tree };
    if (n.kids) { const hit = locate(n.kids, id, n.id); if (hit) return hit; }
  }
  return null;
}

// 只沿当前分组的真实子级前进；改名和正文入口共用同一个当前目录。
export function currentDirectory(group, path = []) {
  let dir = group; const trail = [group];
  for (const id of path) {
    const next = dir.kids?.find(node => node.id === id);
    if (!next) break;
    dir = next; trail.push(next);
  }
  return { dir, trail };
}

export function countDocs(node) {
  if (!node.kids) return 1;
  return node.kids.reduce((sum, k) => sum + countDocs(k), 0);
}

export function canvasModel(tree, { ruleIds = [], order = [] } = {}) {
  const marked = new Set([...ruleIds, ...order]);
  const groups = [], loose = [];
  for (const n of tree) (n.kids || marked.has(n.id) ? groups : loose).push(n);
  const rank = new Map(order.map((id, i) => [id, i]));
  // 排过序的按顺序在前；没排过的保持飞书原顺序跟在后面。
  const sorted = groups.map((g, i) => ({ g, i })).sort((a, b) => (rank.get(a.g.id) ?? 1e6 + a.i) - (rank.get(b.g.id) ?? 1e6 + b.i)).map((x) => x.g);
  return { groups: sorted, loose };
}

// 把分组 id 挪到 beforeId 前面（beforeId 为空就放到最后），返回新的完整顺序。
export function reorder(groupIds, id, beforeId) {
  const rest = groupIds.filter((x) => x !== id);
  const at = beforeId ? rest.indexOf(beforeId) : -1;
  rest.splice(at < 0 ? rest.length : at, 0, id);
  return rest;
}

const clone = (tree) => tree.map((n) => (n.kids ? { ...n, kids: clone(n.kids) } : { ...n }));

// 本地先应用一项变更（画布乐观显示；飞书回读后以飞书为准）。不合法的变更原样返回。
export function applyOp(tree, op) {
  const next = clone(tree);
  if (op.type === "mkdir") {
    const node = { id: op.id, name: op.name, kids: [] };
    if (!op.parentId) next.push(node);
    else { const p = locate(next, op.parentId); if (!p?.node.kids) return tree; p.node.kids.push(node); }
    return next;
  }
  const hit = locate(next, op.id);
  if (!hit) return tree;
  if (op.type === "rename") { hit.node.name = op.name; return next; }
  if (op.type === "move") {
    if (hit.parentId === op.parentId) return tree;
    if (op.parentId && (op.parentId === op.id || locate(hit.node.kids || [], op.parentId))) return tree; // 不能放进自己或子孙
    hit.siblings.splice(hit.siblings.indexOf(hit.node), 1);
    if (!op.parentId) next.push(hit.node);
    else { const p = locate(next, op.parentId); if (!p) return tree; (p.node.kids ||= []).push(hit.node); delete p.node.file; }
    return next;
  }
  return tree;
}

export const applyOps = (tree, ops) => ops.reduce((t, op) => applyOp(t, op), tree);

// 新建目录在飞书建好后换成真实 id。
export function remapOp(op, created) {
  const m = (id) => (id && Object.hasOwn(created, id) ? created[id] : id);
  return { ...op, id: m(op.id), ...("parentId" in op ? { parentId: m(op.parentId) } : {}) };
}

// 回执里的树只有 id / name / kids（叶子带 file）；收成画布用的形状。
export function fromReceipt(tree) {
  return tree.map((n) => (n.kids?.length ? { id: n.id, name: n.name, kids: fromReceipt(n.kids) } : { id: n.id, name: n.name, file: true }));
}

// 回执里的树按节点 ID 排序；按写入前的位置排回去，新节点排在同级最后，画布不跳。
export function keepOrder(next, prev) {
  const at = new Map(); let i = 0;
  const walk = (ns) => ns.forEach((n) => { at.set(n.id, i++); if (n.kids) walk(n.kids); });
  walk(prev);
  const sort = (ns) => ns.map((n, k) => ({ n: n.kids ? { ...n, kids: sort(n.kids) } : n, k }))
    .sort((a, b) => (at.get(a.n.id) ?? 1e9 + a.k) - (at.get(b.n.id) ?? 1e9 + b.k)).map((x) => x.n);
  return sort(next);
}
