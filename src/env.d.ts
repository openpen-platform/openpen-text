/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

/**
 * Host preload bridge. The SDK does not type `window.openPenApi`; this
 * declares only the calls the plugin uses: relaying the active tool to the
 * overlay windows (same call the host's own tool buttons make), and following
 * the pen style other windows broadcast (same feed the canvas follows).
 */
interface Window {
  openPenApi?: {
    setActiveTool(config: { tool: string }): void
    onStrokeStyleChanged?(cb: (style: { color?: unknown; lineWidth?: number }) => void): () => void
  }
}
