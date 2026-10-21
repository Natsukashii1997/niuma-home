import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { installBitmap } from "./ui/bitmap.jsx";
import { installAutoHideScrollbars } from "./ui/auto-hide-scrollbars.js";
import "./styles.css";
import "./styles-v3.css";
import "./styles-layout.css";
import "./styles-scrollbars.css";

installBitmap();
installAutoHideScrollbars();
createRoot(document.getElementById("root")).render(<App />);
