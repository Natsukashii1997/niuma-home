import { PageHeader, Tabs } from "../../ui/components.jsx";
import { href } from "../../router.js";
import PlansView from "./PlansView.jsx";
import PricesView from "./PricesView.jsx";
import MaterialsHub from "./MaterialsHub.jsx";
import BriefView from "./BriefView.jsx";
import CampaignView from "./CampaignView.jsx";

// 页签顺序（用户 2026-10-18）：月度促销 · 价格记录 · 物料沉淀 · 营销战役 · 设计 brief；默认进月度促销。
const TABS = [
  { key: "plans", label: "月度促销", desc: "按月份、业务线录入促销方案，下方是全部月份的方案汇总" },
  { key: "prices", label: "价格记录", desc: "各 SKU 的价格方案：按课时档对比总价、单价和毛利，标出低于毛利底线的格子" },
  { key: "materials", label: "物料沉淀", desc: "按月份沉淀的产品物料、营销物料和设计参考：每月交付了什么、沿用了哪一版" },
  { key: "campaign", label: "营销战役", desc: "本月战役的节点、物料决定与复盘" },
  { key: "brief", label: "设计 Brief", desc: "交付月物料的设计需求：逐节填写，九宫格可直接改，右侧文案助手可以起草" },
].map((t) => ({ ...t, href: href("marketing", t.key) }));

const VIEWS = { campaign: CampaignView, plans: PlansView, promos: PlansView, prices: PricesView, materials: MaterialsHub, brief: BriefView };

// 路由：marketing/<页签>[/…]；marketing/plans/<月份>/<业务线> 选中月度促销的月份和业务线；旧地址 promos 并入月度促销。
// marketing/sku/<业务线>/<SKU>（旧的 SKU 档案地址）：打开月度促销，并在右侧侧栏打开该 SKU 的档案。
export default function MarketingPage({ route }) {
  const [tab = "plans", ...rest] = route;
  const dossier = tab === "sku" ? { line: rest[0] || "", sku: rest[1] || "" } : null;
  const View = dossier ? PlansView : VIEWS[tab] || PlansView;
  const active = dossier || tab === "promos" ? "plans" : VIEWS[tab] ? tab : "plans";
  return (
    <>
      <PageHeader title="营销" />
      <Tabs items={TABS} active={active} />
      <View route={dossier ? [] : rest} dossier={dossier} />
    </>
  );
}
