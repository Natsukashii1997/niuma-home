import { BRIEF_SECTIONS as SECTIONS, BRIEF_HEADS } from "../../../server/brief-template.mjs";
// 设计 brief 的编辑辅助（纯函数，便于测试）。
// patch 只放真正改过的顶层字段；后端按字段覆盖，改过的字段以后不会被需求或价格自动覆盖，所以不能把没改的字段一起提交。
export const BRIEF_FIELDS = ["title", "background", "materials", "audience", "timeline", "items", "specs", "owners", "status"];

export function briefPatch(saved, draft) {
  const patch = {};
  for (const k of BRIEF_FIELDS) if (JSON.stringify(saved[k]) !== JSON.stringify(draft[k])) patch[k] = draft[k];
  return patch;
}

const table = (cols, rows) => ([`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`)].join("\n"));

// 复制全文用的 Markdown（页面当前内容，含未保存的改动）。
export function briefText(b, attachments = []) {
  const items = b.items.length ? b.items.map((it) => `### ${it.title}\n\n${it.kind === "skip" ? it.note : it.blocks ? table(BRIEF_HEADS.blocks, it.blocks) : (it.cells || []).map((c, i) => `P${i + 1}：${c}`).join("\n")}`).join("\n\n") : "（空）";
  const body = [
    [b.background.text, ...b.background.goals.map((g) => `- ${g}`)].filter(Boolean).join("\n\n") || "（空）",
    table(BRIEF_HEADS.audience, b.audience),
    table(BRIEF_HEADS.timeline, b.timeline),
    items,
    table(BRIEF_HEADS.specs, b.specs.map(r=>r.length===4?[r[0],r.slice(1).join(" / ")]:r)),
    table(BRIEF_HEADS.owners, b.owners.map(r=>r.length===3?[r[0],r.slice(1).join(" / ")]:r)),
    attachments.length ? attachments.map(a=>`- ${a.name}`).join("\n") : "（空）",
  ];
  return `# ${b.title}\n\n${SECTIONS.map((t, i) => `## ${i + 1}. ${t}\n\n${body[i]}`).join("\n\n")}\n`;
}
