import { emit } from '@openpen/module-api/host'

/**
 * Switch to the text tool. Same two-step pattern as the built-in tool
 * buttons: the event-bus emit updates this window's active-tool state
 * (control-bar highlight, other modules' tool-changed teardown); the IPC
 * relays the tool to the overlay windows.
 */
export function activateTextTool(): void {
  emit('tool-changed', { tool: 'text' })
  window.openPenApi?.setActiveTool({ tool: 'text' })
}
