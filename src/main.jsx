import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { installBitmap } from "./ui/bitmap.jsx";
import "./styles.css";
import "./styles-v3.css";
import "./styles-layout.css";

installBitmap();
createRoot(document.getElementById("root")).render(<App />);
