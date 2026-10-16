import { PageHeader, Tabs } from "../../ui/components.jsx";
import { href } from "../../router.js";
import PlansView from "./PlansView.jsx";
import PricesView from "./PricesView.jsx";
import MaterialsHub from "./MaterialsHub.jsx";
import BriefView from "./BriefView.jsx";
import CampaignView from "./CampaignView.jsx";

// v3：页签顺序 营销战役 · 月度促销（方案录入 + 促销表合并） · 价格记录 · 物料沉淀 · 设计 brief。
const TABS = [
  { key: "campaign", label: "营销战役" },
  { key: "plans", label: "月度促销" },
  { key: "prices", label: "价格记录" },
  { key: "materials", label: "物料沉淀" },
  { key: "brief", label: "设计 brief" },
].map((t) => ({ ...t, href: href("marketing", t.key) }));

const VIEWS = { campaign: CampaignView, plans: PlansView, promos: PlansView, prices: PricesView, materials: MaterialsHub, brief: BriefView };

// 路由：marketing/<页签>[/…]；marketing/plans/<月份>/<业务线> 选中月度促销的月份和业务线；旧地址 promos 并入月度促销。
export default function MarketingPage({ route }) {
  const [tab = "campaign", ...rest] = route;
  const View = VIEWS[tab] || CampaignView;
  const active = tab === "promos" ? "plans" : VIEWS[tab] ? tab : "campaign";
  return (
    <>
      <PageHeader title="营销" />
      <Tabs items={TABS} active={active} />
      <View route={rest} />
    </>
  );
}
