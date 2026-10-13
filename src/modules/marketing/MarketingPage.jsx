import { PageHeader, Tabs } from "../../ui/components.jsx";
import { href } from "../../router.js";
import PlansView from "./PlansView.jsx";
import PlanEditor from "./PlanEditor.jsx";
import PromosView from "./PromosView.jsx";
import MaterialsView from "./MaterialsView.jsx";

const TABS = [
  { key: "plans", label: "方案" },
  { key: "promos", label: "促销表" },
  { key: "materials", label: "物料" },
].map((t) => ({ ...t, href: href("marketing", t.key) }));

// 路由：marketing/plans | marketing/plans/<月份>/<业务线> | marketing/promos | marketing/materials
export default function MarketingPage({ route }) {
  const [tab = "plans", month, line] = route;
  if (tab === "plans" && month && line) return <PlanEditor month={month} line={line} />;
  return (
    <>
      <PageHeader title="营销策略" subtitle="月度促销方案、促销表与物料留存" />
      <Tabs items={TABS} active={tab} />
      {tab === "promos" ? <PromosView /> : tab === "materials" ? <MaterialsView /> : <PlansView />}
    </>
  );
}
