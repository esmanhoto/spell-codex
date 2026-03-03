import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

function env(name: string): string | undefined {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return g.process?.env?.[name]
}

const apiProxyTarget = env("API_PROXY_TARGET") ?? "http://localhost:3001"
const wsProxyTarget = env("WS_PROXY_TARGET") ?? "ws://localhost:3001"

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy API calls in dev so we avoid CORS issues
      "/api": {
        target:    apiProxyTarget,
        rewrite:   path => path.replace(/^\/api/, ""),
        changeOrigin: true,
      },
      // Proxy WS upgrades in dev (`ws://localhost:5173/ws` -> API `:3001/ws`)
      "/ws": {
        target: wsProxyTarget,
        ws: true,
      },
    },
  },
})
