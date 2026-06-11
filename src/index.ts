/**
 * @openpen/text — place-only text annotation tool.
 *
 * Contributes:
 *   - The text `Tool` to `canvas.tools`. A click opens a short-lived inline
 *     editor; on commit the typed text becomes a `Stroke` (custom
 *     `renderTextStroke` repaints it via `fillText` on every redraw, so it
 *     participates in undo/redo).
 *   - A text-caret cursor for `ui.cursors`.
 *   - A tool button in the control bar 'tools' group.
 *   - A settings panel (font size + font family) for `ui.settings.panels`.
 *
 * Font size / family are config (not in-progress stroke state), so they live in
 * a module-scoped holder hydrated from settings in setup(); the tool factory
 * reads them at placement time via accessor closures. The glyph color is taken
 * from the global stroke style at click time (read off the StrokeStyle the host
 * hands the tool), so text matches the current pen color.
 *
 * Clicking places a new text stroke; existing strokes are not re-editable.
 */
import { defineModule, z } from '@openpen/module-api'
export { MODULE_ID } from './module-id'
import { MODULE_ID } from './module-id'
import { createTextTool, renderTextStroke } from './text-tool'
import { useModuleContext } from '@openpen/module-api'
import { on } from '@openpen/module-api/host'
import TextToolButton from './TextToolButton.vue'
import TextSettingsPanel from './TextSettingsPanel.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'
import type { FontFamilyKey } from './text-logic'

const settingsSchema = z.object({
  fontSize: z.number().min(8).max(96).default(24),
  fontFamily: z.enum(['sans', 'serif', 'mono']).default('sans'),
})
type TextSettings = z.infer<typeof settingsSchema>

const liveSettings: TextSettings = { fontSize: 24, fontFamily: 'sans' }

const textTool = createTextTool({
  fontSize: () => liveSettings.fontSize,
  fontFamily: () => liveSettings.fontFamily,
  placeholder: () => {
    try {
      return useModuleContext(MODULE_ID).t('placeholder')
    } catch {
      return ''
    }
  },
})

const TEXT_CURSOR = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
    '<path d="M 12 4 L 12 20" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/>' +
    '<path d="M 8 4 L 16 4 M 8 20 L 16 20" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round"/>' +
    '<path d="M 12 4 L 12 20" stroke="#111111" stroke-width="1.6" stroke-linecap="round"/>' +
    '<path d="M 8 4 L 16 4 M 8 20 L 16 20" stroke="#111111" stroke-width="1.6" stroke-linecap="round"/>' +
    '</svg>',
  hotspot: { x: 12, y: 12 },
  fallback: 'text',
}

export default defineModule({
  id: MODULE_ID,
  version: '1.0.0',
  settingsSchema,

  setup(ctx) {
    const apply = (s: TextSettings) => {
      liveSettings.fontSize = s.fontSize
      liveSettings.fontFamily = s.fontFamily
    }
    apply(ctx.getSettings<TextSettings>())
    const stop = ctx.onSettingsChange<TextSettings>(apply)
    ctx.onDispose(stop)

    // Switching the active tool away from text MUST tear down any in-flight
    // editor; otherwise the orphaned <textarea> keeps focus and intercepts
    // every keystroke even though the user has moved on to another tool.
    const offToolChanged = on('tool-changed', (payload) => {
      const next = (payload as { tool?: string } | undefined)?.tool
      if (next !== 'text') textTool.cancelEditor()
    })
    ctx.onDispose(offToolChanged)
  },

  contributes: {
    tools: [
      {
        id: 'text',
        label: {
          en: 'Text',
          'zh-Hant': '文字',
          'zh-Hans': '文字',
          ja: 'テキスト',
        },
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>',
        ...textTool.tool,
        renderStroke: renderTextStroke,
      },
    ],
    cursors: [
      {
        id: 'text',
        cursor: TEXT_CURSOR,
      },
    ],
    controlBar: [
      {
        id: 'text',
        component: TextToolButton,
        defaultGroup: 'tools',
        groupHint: { separator: 'auto' },
      },
    ],
    settingsPanels: [
      {
        id: 'text-settings',
        label: {
          en: 'Text',
          'zh-Hant': '文字',
          'zh-Hans': '文字',
          ja: 'テキスト',
        },
        component: TextSettingsPanel,
      },
    ],
    locales: {
      en,
      'zh-Hant': zhHant,
      'zh-Hans': zhHans,
      ja,
    },
  },
})
