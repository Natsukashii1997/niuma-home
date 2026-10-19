import KbCanvas from "./KbCanvas.jsx";
import { PageHeader } from "../../ui/components.jsx";

// 知识库：只有画布（用户 2026-10-19 删掉目录树页签）。
// 路由：kb = 画布；kb/<文档 id>（⌘K 打开某篇文档）也进画布，搜索框预填这篇的标题；旧地址 kb/tree、kb/collect 都回到画布。
export default function KnowledgePage({ route = [] }) {
  const focus = route[0] && !["tree", "collect"].includes(route[0]) ? route[0] : "";
  return <><PageHeader title="飞书知识库" subtitle="「常浩的知识库」：分组就是飞书一级目录，在这里拖动就是在飞书里整理" />
    <KbCanvas key={focus} focus={focus} /></>;
}
