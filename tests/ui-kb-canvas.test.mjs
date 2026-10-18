import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOp, applyOps, canvasModel, countDocs, fromReceipt, keepOrder, pose, remapOp, reorder } from "../src/modules/kb/kb-canvas.js";

const tree = () => [
  { id: "A", name: "📢 营销策划", kids: [{ id: "a1", name: "促销方案", file: true }, { id: "sub", name: "子目录", kids: [{ id: "s1", name: "深层", file: true }] }] },
  { id: "B", name: "📅 用户时间线", file: true },
  { id: "x", name: "散文档", file: true },
];

test("画布分组：有子节点、收藏规则里的、排过序的目录是分组，其余根节点是散卡；按保存顺序排", () => {
  const m = canvasModel(tree(), { ruleIds: ["B"], order: ["B"] });
  assert.deepEqual(m.groups.map((g) => g.id), ["B", "A"]);
  assert.deepEqual(m.loose.map((n) => n.id), ["x"]);
  assert.equal(countDocs(tree()[0]), 2);
  assert.deepEqual(reorder(["A", "B", "C"], "C", "A"), ["C", "A", "B"]);
  assert.deepEqual(reorder(["A", "B", "C"], "A", ""), ["B", "C", "A"]);
});

test("本地先应用变更：移动、改名、新建；放进自己子孙或原地移动不生效；不改原树", () => {
  const t = tree();
  const moved = applyOp(t, { type: "move", id: "x", parentId: "A" });
  assert.deepEqual(moved[0].kids.map((n) => n.id), ["a1", "sub", "x"]);
  assert.equal(t.length, 3);
  assert.equal(applyOp(t, { type: "move", id: "A", parentId: "sub" }), t);
  assert.equal(applyOp(t, { type: "move", id: "a1", parentId: "A" }), t);
  const both = applyOps(t, [{ type: "mkdir", id: "g1", name: "新分组", parentId: "" }, { type: "move", id: "x", parentId: "g1" }]);
  assert.deepEqual(both.at(-1), { id: "g1", name: "新分组", kids: [{ id: "x", name: "散文档", file: true }] });
  assert.equal(applyOp(t, { type: "rename", id: "a1", name: "新名" })[0].kids[0].name, "新名");
  assert.deepEqual(remapOp({ type: "move", id: "x", parentId: "g1" }, { g1: "Real1" }), { type: "move", id: "x", parentId: "Real1" });
});

test("回执树转画布形状；纸堆姿态由 id 决定且稳定", () => {
  assert.deepEqual(fromReceipt([{ id: "A", name: "目录", kids: [{ id: "a", name: "文", file: true }] }, { id: "E", name: "空目录", kids: [] }]),
    [{ id: "A", name: "目录", kids: [{ id: "a", name: "文", file: true }] }, { id: "E", name: "空目录", file: true }]);
  assert.deepEqual(pose("abc", 2), pose("abc", 2));
  assert.ok(Math.abs(pose("abc", 0)[0]) <= 3);
});

test("回执按 ID 排序的树，按写入前的位置排回去；新节点排在同级最后", () => {
  const prev = [{ id: "Z", name: "营销", kids: [{ id: "z2", name: "b", file: true }, { id: "z1", name: "a", file: true }] }, { id: "A", name: "杂项", kids: [] }, { id: "x", name: "散", file: true }];
  const receipt = [{ id: "A", name: "杂项", file: true }, { id: "Z", name: "营销", kids: [{ id: "x", name: "散", file: true }, { id: "z1", name: "a", file: true }, { id: "z2", name: "b", file: true }] }];
  const out = keepOrder(receipt, prev);
  assert.deepEqual(out.map((n) => n.id), ["Z", "A"]);
  assert.deepEqual(out[0].kids.map((n) => n.id), ["z2", "z1", "x"]);
  assert.deepEqual(keepOrder([{ id: "new", name: "新", file: true }, ...receipt], prev).map((n) => n.id), ["Z", "A", "new"]);
});
