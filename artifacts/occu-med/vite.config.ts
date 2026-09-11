import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const port = Number(process.env.PORT || 5173);
const basePath = process.env.BASE_PATH || "/";
const isProduction = process.env.NODE_ENV === "production";
const isReplitDevelopment = !isProduction && process.env.REPL_ID !== undefined;
const mapTilerApiKeys = [
  process.env.MAP_TILER_API_KEY || "",
  process.env.MAP_TILER_API_KEY_2 || "",
  process.env.MAP_TILER_API_KEY_3 || "",
  process.env.MAP_TILER_API_KEY_4 || "",
  process.env.MAP_TILER_API_KEY_5 || "",
  process.env.MAP_TILER_API_KEY_6 || "",
];

export default defineConfig({
  base: basePath,
  define: {
    // Render stores the MapTiler pool as server-side environment variables.
    // Expose only their dedicated client aliases; ArcGIS remains isolated.
    "import.meta.env.VITE_MAP_TILER_API_KEY": JSON.stringify(mapTilerApiKeys[0]),
    "import.meta.env.VITE_MAP_TILER_API_KEY_2": JSON.stringify(mapTilerApiKeys[1]),
    "import.meta.env.VITE_MAP_TILER_API_KEY_3": JSON.stringify(mapTilerApiKeys[2]),
    "import.meta.env.VITE_MAP_TILER_API_KEY_4": JSON.stringify(mapTilerApiKeys[3]),
    "import.meta.env.VITE_MAP_TILER_API_KEY_5": JSON.stringify(mapTilerApiKeys[4]),
    "import.meta.env.VITE_MAP_TILER_API_KEY_6": JSON.stringify(mapTilerApiKeys[5]),
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(!isProduction ? [runtimeErrorOverlay()] : []),
    ...(isReplitDevelopment
      ? [
          await import("@replit/vite-plugin-cartographer").then((module) =>
            module.cartographer({ root: path.resolve(import.meta.dirname, "..") }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((module) => module.devBanner()),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "wouter"],
          query: ["@tanstack/react-query"],
          motion: ["framer-motion"],
        },
      },
    },
  },
  server: {
    port,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
