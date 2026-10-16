// 知识库整理：页面暂存的操作 → 后端预览接口要的操作（纯函数，便于测试）。
// 后端只认 mkdir / move / rename；新目录用字母开头的临时标识，移动和新建都要给目标父节点 ID（根目录是空字符串）。
export function toBackendOps(ops) {
  return ops.map((o) => {
    if (o.type === "mkdir") return { type: "mkdir", id: o.id, name: o.name, parentId: o.parentId || "" };
    if (o.type === "move") return { type: "move", id: o.id, parentId: o.parentId || "" };
    return { type: "rename", id: o.id, name: o.name };
  });
}
