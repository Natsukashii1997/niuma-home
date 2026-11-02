import { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import LoginPage, { hasEntered } from "./modules/login/LoginPage.jsx";
import { installBitmap } from "./ui/bitmap.jsx";
import { installAutoHideScrollbars } from "./ui/auto-hide-scrollbars.js";
import "./styles.css";
import "./styles/index.css";
import "./styles-layout.css";
import "./styles-scrollbars.css";

installBitmap();
installAutoHideScrollbars();
// 每个新标签页先过一次登录页，同一标签页里刷新不再出现
function Root() {
  const [entered, setEntered] = useState(hasEntered);
  return entered ? <App /> : <LoginPage onEnter={() => setEntered(true)} />;
}

createRoot(document.getElementById("root")).render(<Root />);
