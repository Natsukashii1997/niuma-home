import { useEffect, useRef, useState } from "react";
import { useRoute, href } from "./router.js";
import { BrandMark, PixelIcon, dissolve, prefersReducedMotion } from "./ui/bitmap.jsx";
import HomePage from "./modules/home/HomePage.jsx";
import MarketingPage from "./modules/marketing/MarketingPage.jsx";
import UserPage from "./modules/user/UserPage.jsx";
import VoicePage from "./modules/voice/VoicePage.jsx";
import BrandPage from "./modules/brand/BrandPage.jsx";
import BusinessPage from "./modules/business/BusinessPage.jsx";
import ProjectsPage, { MentorPage } from "./modules/projects/ProjectsPage.jsx";
import KnowledgePage from "./modules/kb/KnowledgePage.jsx";
import AssistantsPage from "./modules/assistants/AssistantsPage.jsx";
import ReportsPage from "./modules/reports/ReportsPage.jsx";
import SettingsPage from "./modules/settings/SettingsPage.jsx";
import { SelfTalkDrawer, SelfTalkButton } from "./modules/selftalk/SelfTalk.jsx";
import { CodexStrip } from "./modules/home/CodexStrip.jsx";
import { CommandPalette } from "./modules/command/CommandPalette.jsx";
import { StatusBar } from "./modules/statusbar/StatusBar.jsx";

// 新增模块：在这里登记一项（icon 为 src/ui/icons7.js 中的图标名），并在 src/modules/<key>/ 下建页面。
// 侧栏顺序与名称（用户 2026-10-19）：不再分「工作 / 协作与工具」两组，一列排下。
// 策略 = 用户时间线 + 用户策略；营销 = 月度促销 + 价格档案 + 物料沉淀 + 设计 Brief；项目 = 项目看板 + 项目推进 + 营销战役；带教单列。
const MODULES = [
  { key: "home", label: "首页", icon: "home", Page: HomePage },
  { key: "user", label: "策略", icon: "target", Page: UserPage },
  { key: "marketing", label: "营销", icon: "marketing", Page: MarketingPage },
  { key: "voice", label: "Voice", icon: "voice", Page: VoicePage },
  { key: "projects", label: "项目", icon: "project", Page: ProjectsPage },
  { key: "mentor", label: "带教", icon: "mentor", Page: MentorPage },
  { key: "brand", label: "品牌", icon: "brand", Page: BrandPage },
  { key: "business", label: "业务", icon: "business", Page: BusinessPage },
  { key: "assistants", label: "Agent", icon: "agent", Page: AssistantsPage },
  { key: "reports", label: "日/周报", icon: "reports", Page: ReportsPage },
  { key: "kb", label: "飞书知识库", icon: "kb", Page: KnowledgePage },
];
const SETTINGS = { key: "settings", label: "设置", icon: "settings", Page: SettingsPage };

const moduleOf = (key) => (key === "settings" ? SETTINGS : MODULES.find((m) => m.key === key) || MODULES[0]);

// 同一模块内换子页直接切换；换模块时用像素溶解（③，v3 缩短为 3 帧）。
function useDisplayedRoute(route) {
  const routeKey = route.join("/");
  const [shown, setShown] = useState(route);
  const latest = useRef(route);
  latest.current = route;
  const canvas = useRef(null), area = useRef(null);
  useEffect(() => {
    if (moduleOf(route[0]).key === moduleOf(shown[0]).key || prefersReducedMotion() || !canvas.current || !area.current) {
      // 同模块换页签（route[1] 变了）回到顶部；同一页签里换月份、换条目不动滚动位置（用户 2026-10-23）
      if (moduleOf(route[0]).key !== moduleOf(shown[0]).key || (route[1] || "") !== (shown[1] || "")) scrollTo(0, 0);
      setShown(route);
      return undefined;
    }
    return dissolve(canvas.current, area.current, () => {
      setShown(latest.current);
      scrollTo(0, 0);
    });
  }, [routeKey]); // routeKey 概括了 route 的变化
  return { shown, canvas, area };
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function NavLink({ item, current }) {
  const active = item.key === current.key;
  return (
    <a href={href(item.key)} className={active ? "active" : ""} aria-current={active ? "page" : undefined} title={item.label}>
      <PixelIcon name={item.icon} />
      <span className="nav-label">{item.label}</span>
    </a>
  );
}

export default function App() {
  const route = useRoute();
  const { shown, canvas, area } = useDisplayedRoute(route);
  const current = moduleOf(route[0]);
  const displayed = moduleOf(shown[0]);
  const now = useClock();
  const [drawer, setDrawer] = useState(false);
  const [command, setCommand] = useState(false); // ⌘K 命令面板
  const { Page } = displayed;
  useEffect(() => {
    const key = (e) => {
      if (e.key === "Escape") setDrawer(false);
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); setCommand((v) => !v); }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  return (
    <div className={`app${drawer ? " drawer-open" : ""}`}>
      <header className="chrome">
        <span className="chrome-dots" aria-hidden="true"><i /><i /><i /></span>
        <span className="chrome-path">niuma-home / <b>{current.label}</b>{route.slice(1, 2).map((p) => ` / ${p}`)}</span>
        <SelfTalkButton open={drawer} onToggle={() => setDrawer((v) => !v)} />
        <span className="chrome-time">{now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}</span>
      </header>
      <CodexStrip />
      <div className="layout">
        <nav className="sidebar" aria-label="模块">
          <div className="brand">
            <BrandMark />
            <span className="brand-name"><strong>牛马之家</strong><span className="label">niuma home</span></span>
          </div>
          <div className="nav-group">
            {MODULES.map((item) => <NavLink key={item.key} item={item} current={current} />)}
          </div>
          <div className="spacer" />
          <NavLink item={SETTINGS} current={current} />
          <div className="sidebar-foot label">local · 127.0.0.1</div>
        </nav>
        <main className="main" ref={area}>
          {displayed.key === "settings" ? <SettingsPage /> : <Page route={shown.slice(1)} />}
        </main>
        <SelfTalkDrawer open={drawer} onClose={() => setDrawer(false)} />
      </div>
      <StatusBar page={displayed.key} onCommand={() => setCommand(true)} />
      <CommandPalette open={command} onClose={() => setCommand(false)} />
      <canvas ref={canvas} className="dissolve-canvas" aria-hidden="true" />
    </div>
  );
}
