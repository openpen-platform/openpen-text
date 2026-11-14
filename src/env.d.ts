/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent
  export default component
}

/**
 * Host preload bridge. The SDK does not type `window.openPenApi`; this
 * declares only the one call the plugin uses to relay the active tool to the
 * overlay windows (same call the host's own tool buttons make).
 */
interface Window {
  openPenApi?: {
    setActiveTool(config: { tool: string }): void
  }
}
