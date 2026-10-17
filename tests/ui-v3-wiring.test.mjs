import { test } from "node:test";
import assert from "node:assert/strict";
import { canConfirm, canReset, classifyFailure } from "../src/ui/write-flow-state.js";
import { nodeState, projectSummary } from "../src/modules/projects/project-view.js";
import { briefPatch, briefText } from "../src/modules/marketing/brief-edit.js";
import { toBackendOps } from "../src/modules/kb/kb-ops.js";

// 写操作流程：失败怎么归类决定了页面能不能再点「确认」。
test("提交失败归类：409 要重新预览；网络中断、5xx、带收据的未知结果都锁住；其余 4xx 可改了再试", () => {
  assert.equal(classifyFailure({ status: 409 }), "stale");
  assert.equal(classifyFailure(new TypeError("Failed to fetch")), "unknown");
  assert.equal(classifyFailure({ status: 502 }), "unknown");
  assert.equal(classifyFailure({ status: 409, code: "EXPORT_RESULT_UNKNOWN" }), "unknown");
  assert.equal(classifyFailure({ status: 400, receipt: { status: "unknown" } }), "unknown");
  assert.equal(classifyFailure({ status: 400 }), "error");
});

test("只有待确认时能提交；提交中和结果不明时不能用改输入的方式清掉", () => {
  assert.ok(canConfirm("preview"));
  for (const p of ["idle", "previewing", "confirming", "saved", "stale", "error", "unknown"]) assert.ok(!canConfirm(p), p);
  assert.ok(!canReset("unknown"));
  assert.ok(!canReset("confirming"));
  assert.ok(canReset("preview") && canReset("saved") && canReset("stale"));
});

const node = (over) => ({ id: "n", t: "节点", done: false, statusKnown: false, dueDate: "", gate: false, gateReady: false, ...over });

test("项目节点：来源没填状态显示未填写，不算未完成；只有 gateReady 才算待审", () => {
  assert.equal(nodeState(node()), "unknown");
  assert.equal(nodeState(node({ statusKnown: true })), "open");
  assert.equal(nodeState(node({ statusKnown: true, done: true })), "done");
  const s = projectSummary({ nodes: [node({ gate: true }), node({ gate: true, gateReady: true }), node({ statusKnown: true, done: true })] }, "2026-10-16");
  assert.deepEqual([s.total, s.done, s.unknown, s.gates], [3, 1, 2, 1]);
});

test("项目节点：截止日期按完整年份算，跨年不出错；空项目不报错", () => {
  const s = projectSummary({ nodes: [node({ statusKnown: true, dueDate: "2027-01-01" }), node({ statusKnown: true, dueDate: "2026-12-31" })] }, "2026-12-30");
  assert.equal(s.daysTo({ dueDate: "2027-01-01" }), 2);
  assert.equal(s.soon, 2);
  assert.equal(s.soonest.dueDate, "2026-12-31");
  const empty = projectSummary({ nodes: [] }, "2026-10-16");
  assert.deepEqual([empty.total, empty.done, empty.next], [0, 0, undefined]);
  assert.equal(projectSummary(undefined, "2026-10-16").total, 0);
});

const brief = () => ({ month: "2026-11", title: "2026-11 设计 brief", version: "v0", editedAt: "", background: { from: "", text: "", goals: [] }, audience: [], timeline: [], items: [], specs: [], owners: [], status: { 1: "todo", 2: "todo", 3: "todo", 4: "todo", 5: "todo", 6: "todo", 7: "todo" } });

test("brief：patch 只放改过的顶层字段，不带没改的字段和版本信息", () => {
  const saved = brief(), draft = structuredClone(saved);
  assert.deepEqual(briefPatch(saved, draft), {});
  draft.background.text = "背景";
  draft.status[1] = "part";
  draft.version = "v9";
  assert.deepEqual(Object.keys(briefPatch(saved, draft)).sort(), ["background", "status"]);
});

test("brief：复制全文是七节 Markdown，表格里的竖线和换行被转义", () => {
  const b = brief();
  b.audience = [["九宫格", "澳洲 | 本科", "第一行\n第二行"]];
  const text = briefText(b);
  assert.match(text, /^# 2026-11 设计 brief/);
  assert.equal((text.match(/^## \d\./gm) || []).length, 7);
  assert.ok(text.includes("澳洲 \\| 本科"));
  assert.ok(text.includes("第一行 第二行"));
});

test("知识库：页面暂存的操作转成后端只认的 mkdir / move / rename，带目标父节点，去掉显示用字段", () => {
  const ops = toBackendOps([
    { type: "mkdir", id: "t1", name: "99 待清理", to: "根目录", parentId: "" },
    { type: "move", id: "doc1", name: "旧文档", from: "根目录", to: "99 待清理", parentId: "t1" },
    { type: "rename", id: "doc2", name: "新标题", from: "旧标题" },
  ]);
  assert.deepEqual(ops, [
    { type: "mkdir", id: "t1", name: "99 待清理", parentId: "" },
    { type: "move", id: "doc1", parentId: "t1" },
    { type: "rename", id: "doc2", name: "新标题" },
  ]);
});
