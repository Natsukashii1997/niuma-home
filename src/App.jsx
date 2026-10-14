import { Home, Megaphone, Sparkles, BarChart3, Bot, FileText, Settings } from "lucide-react";
import { useRoute, href } from "./router.js";
import HomePage from "./modules/home/HomePage.jsx";
import MarketingPage from "./modules/marketing/MarketingPage.jsx";
import BrandPage from "./modules/brand/BrandPage.jsx";
import BusinessPage from "./modules/business/BusinessPage.jsx";
import AssistantsPage from "./modules/assistants/AssistantsPage.jsx";
import ReportsPage from "./modules/reports/ReportsPage.jsx";
import SettingsPage from "./modules/settings/SettingsPage.jsx";

// 新增模块：在这里登记一项，并在 src/modules/<key>/ 下建页面。
const MODULES = [
  { key: "home", label: "首页", icon: Home, Page: HomePage },
  { key: "marketing", label: "营销", icon: Megaphone, Page: MarketingPage },
  { key: "brand", label: "品牌", icon: Sparkles, Page: BrandPage },
  { key: "business", label: "业务", icon: BarChart3, Page: BusinessPage },
  { key: "assistants", label: "Agent", icon: Bot, Page: AssistantsPage },
  { key: "reports", label: "日/周报", icon: FileText, Page: ReportsPage },
];

export default function App() {
  const [moduleKey = "home", ...rest] = useRoute();
  const current = MODULES.find((m) => m.key === moduleKey) || MODULES[0];
  const isSettings = moduleKey === "settings";
  const { Page } = current;
  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">工作台</div>
        {MODULES.map(({ key, label, icon: Icon }) => (
          <a key={key} href={href(key)} className={!isSettings && key === current.key ? "active" : ""}>
            <Icon size={16} strokeWidth={1.8} />
            {label}
          </a>
        ))}
        <div className="spacer" />
        <a href={href("settings")} className={isSettings ? "active" : ""} aria-label="设置" title="设置" aria-current={isSettings ? "page" : undefined}>
          <Settings size={16} strokeWidth={1.8} />设置
        </a>
      </nav>
      <main className="main">
        {isSettings ? <SettingsPage /> : <Page route={rest} />}
      </main>
    </div>
  );
}
