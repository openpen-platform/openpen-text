import { activateTool } from '@openpen/module-api'

/** Switch to the text tool through the host's public tool-switch method. */
export function activateTextTool(): void {
  activateTool('text')
}
