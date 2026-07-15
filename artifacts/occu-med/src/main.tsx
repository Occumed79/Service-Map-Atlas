import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./client-polish.css";
import "./admin-theme.css";
import "./brand-overrides.css";

createRoot(document.getElementById("root")!).render(<App />);
