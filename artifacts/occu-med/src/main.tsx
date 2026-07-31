import { createRoot } from "react-dom/client";
import "./arcgisAtlasRuntime";
import App from "./App";
import "./index.css";
import "./client-polish.css";
import "./admin-theme.css";
import "./brand-overrides.css";
import "./client-map-fixes.css";
import "./arcgis-atlas-runtime.css";

createRoot(document.getElementById("root")!).render(<App />);
