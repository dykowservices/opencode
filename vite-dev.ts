#!/usr/bin/env bun
console.log("wrapper start", process.env.BASE44_PREVIEW_MODE)
// what the sandbox preview needs - same-origin /api and /auth proxy with the server
// password injected, and a cacheDir outside the bind-mounted source tree.
import { defineConfig, mergeConfig, type Plugin } from "vite"

const base = (await import("/workspace/packages/app/vite.config.ts")).default

const previewMode = process.env.BASE44_PREVIEW_MODE === "1"
const apiTarget = process.env.OPENCODE_API_TARGET ?? "http://api:4096"
const credentials = Buffer.from(
  `opencode:${process.env.OPENCODE_SERVER_PASSWORD ?? ""}`,
).toString("base64")

// Preview only: the app derives the backend URL from location.origin, because the
// preview is https and the plain-http URL built in dev mode would be blocked as
// mixed content. The source file is untouched; without the flag the substitution
// is a no-op and dev behaves exactly as upstream.
const sameOriginPlugin: Plugin = {
  name: "base44-same-origin-api",
  transform(code, id) {
    if (!previewMode || !id.includes("src/runtime/platform/web.ts")) return null
    return code.replace(
      'return `http://${host}:${import.meta.env.VITE_OPENCODE_SERVER_PORT ?? "4096"}`',
      "return location.origin",
    )
  },
}

const config = defineConfig(
  mergeConfig(base, {
    cacheDir: "/tmp/vite-cache",
    plugins: [sameOriginPlugin],
    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          headers: { Authorization: `Basic ${credentials}` },
        },
        "/auth": {
          target: apiTarget,
          changeOrigin: true,
          headers: { Authorization: `Basic ${credentials}` },
        },
      },
    },
  }),
)

// When executed directly (docker compose web service), start the dev server on the
// single public port. When imported (tests), only the config is exported.
export default config
if (import.meta.main) {
  const { createServer } = await import("vite")
  const server = await createServer({ ...config, configFile: false, root: "/workspace/packages/app" })
  await server.listen()
  console.log("vite listening", server.config.server.port)
}
