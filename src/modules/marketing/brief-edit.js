// 设计 brief 的编辑辅助（纯函数，便于测试）。
// patch 只放真正改过的顶层字段；后端按字段覆盖，改过的字段以后不会被需求或价格自动覆盖，所以不能把没改的字段一起提交。
export const BRIEF_FIELDS = ["title", "background", "audience", "timeline", "items", "specs", "owners", "status"];

export function briefPatch(saved, draft) {
  const patch = {};
  for (const k of BRIEF_FIELDS) if (JSON.stringify(saved[k]) !== JSON.stringify(draft[k])) patch[k] = draft[k];
  return patch;
}

const SECTIONS = ["项目背景与目标", "目标受众", "项目时间线", "详细文案与框架", "交付物清单与规格", "负责人与审批", "附件"];
const table = (cols, rows) => (rows.length ? [`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`)].join("\n") : "（空）");

// 复制全文用的 Markdown（页面当前内容，含未保存的改动）。
export function briefText(b) {
  const items = b.items.length ? b.items.map((it) => `### ${it.title}\n\n${it.kind === "skip" ? it.note : it.blocks ? table(["涉及板块", "内容", "说明"], it.blocks) : (it.cells || []).map((c, i) => `P${i + 1}：${c}`).join("\n")}`).join("\n\n") : "（空）";
  const body = [
    [b.background.text, ...b.background.goals.map((g) => `- ${g}`)].filter(Boolean).join("\n\n") || "（空）",
    table(["物料", "面向人群", "当前状态与待办"], b.audience),
    table(["物料", "交付时间", "优先级", "对接人", "说明"], b.timeline),
    items,
    table(["物料", "比例", "尺寸", "格式"], b.specs),
    table(["角色", "负责人", "状态"], b.owners),
    "（空）",
  ];
  return `# ${b.title}\n\n${SECTIONS.map((t, i) => `## ${i + 1}. ${t}\n\n${body[i]}`).join("\n\n")}\n`;
}
