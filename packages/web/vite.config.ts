import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls in dev so we avoid CORS issues
      "/api": {
        target:    "http://localhost:3001",
        rewrite:   path => path.replace(/^\/api/, ""),
        changeOrigin: true,
      },
      // Proxy WS upgrades in dev (`ws://localhost:5173/ws` -> API `:3001/ws`)
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
})
