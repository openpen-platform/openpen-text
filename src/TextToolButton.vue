<script setup lang="ts">
/*
 * TextToolButton — text tool button + caret + style popover.
 *
 * Same pattern as the host's shape and eraser buttons: an `AppButtonDropdown`
 * whose main button activates the tool and whose caret opens a popover with
 * the tool's adjustments (font size, font, bold, italic). Popover lifecycle
 * (mutual exclusion with other popovers, outside-click, placement, vertical
 * bars) is handled by the dropdown's inner AppPopover.
 *
 * The popover writes to this plugin's settings; setup() in every window
 * (control bar and overlays) picks the change up through onSettingsChange, so
 * the next text placed in the overlay uses the new style immediately.
 */
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  ACTIVE_TOOL_KEY,
  MODAL_MANAGER_KEY,
  SNAP_EDGE_KEY,
  useModuleContext,
} from '@openpen/module-api'
import {
  AppButtonDropdown,
  AppPopoverPanel,
  AppPopoverRow,
  AppSelect,
  AppSlider,
  AppToggleButton,
  AppTooltip,
} from '@openpen/module-api/uikit'
import { MODULE_ID } from './module-id'
import { activateTextTool } from './activate'
import {
  FONT_FAMILY_KEYS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  clampFontSize,
  normalizeTextSettings,
  type FontFamilyKey,
  type TextSettings,
} from './text-logic'

const POPOVER_ID = 'openpen-text-options'

const ctx = useModuleContext(MODULE_ID)
const label = computed(() => ctx.t('tool'))
const optionsLabel = computed(() => ctx.t('options.label'))
const sizeLabel = computed(() => ctx.t('settings.fontSize'))
const fontLabel = computed(() => ctx.t('settings.fontFamilyLabel'))
const boldLabel = computed(() => ctx.t('options.bold'))
const italicLabel = computed(() => ctx.t('options.italic'))
const fontOptions = computed(() =>
  FONT_FAMILY_KEYS.map((key) => ({ value: key, label: ctx.t(`settings.fontFamily.${key}`) })),
)

const activeTool = inject(ACTIVE_TOOL_KEY)
const snapEdge = inject(SNAP_EDGE_KEY)
const modalManager = inject(MODAL_MANAGER_KEY)
const isActive = computed(() => activeTool?.value === 'text')

// Anchor coordinates go stale when the bar snaps to another edge.
watch(() => snapEdge?.value, () => { modalManager?.close(POPOVER_ID) })

const current = ref<TextSettings>(normalizeTextSettings({}))
let unsub: (() => void) | null = null

onMounted(() => {
  current.value = normalizeTextSettings(ctx.getSettings<Partial<TextSettings>>())
  unsub = ctx.onSettingsChange<Partial<TextSettings>>((next) => {
    current.value = normalizeTextSettings(next)
  })
})
onUnmounted(() => unsub?.())

async function save(patch: Partial<TextSettings>) {
  current.value = { ...current.value, ...patch }
  await ctx.updateSettings<TextSettings>(patch)
}

const setFontSize = (value: number) => save({ fontSize: clampFontSize(Number(value)) })
const setFontFamily = (key: string) => save({ fontFamily: key as FontFamilyKey })

/** Opening the options also selects the tool, like the host's shape caret. */
function activateIfNeeded() {
  if (!isActive.value) activateTextTool()
}
</script>

<template>
  <AppButtonDropdown
    :popover-id="POPOVER_ID"
    popover-placement="auto"
    :active="isActive"
    :main-tooltip="label"
    :main-aria-label="label"
    :caret-aria-label="optionsLabel"
    main-testid="controlbar-text-btn"
    caret-testid="controlbar-text-caret"
    @main-click="activateTextTool"
    @caret-click="activateIfNeeded"
  >
    <template #main-content>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4 7 4 4 20 4 20 7" />
        <line x1="9" y1="20" x2="15" y2="20" />
        <line x1="12" y1="4" x2="12" y2="20" />
      </svg>
    </template>
    <template #popover-content>
      <AppPopoverPanel data-testid="controlbar-text-popover">
        <AppPopoverRow :label="sizeLabel">
          <AppSlider
            :model-value="current.fontSize"
            :min="FONT_SIZE_MIN"
            :max="FONT_SIZE_MAX"
            :step="1"
            :value-label="`${current.fontSize}px`"
            :ariaLabel="sizeLabel"
            data-testid="text-font-size-slider"
            @update:model-value="setFontSize"
          />
        </AppPopoverRow>
        <AppPopoverRow :label="fontLabel">
          <AppSelect
            :model-value="current.fontFamily"
            :options="fontOptions"
            :placeholder="fontLabel"
            :ariaLabel="fontLabel"
            @update:model-value="setFontFamily"
          />
        </AppPopoverRow>
        <AppPopoverRow>
          <AppTooltip :content="boldLabel">
            <AppToggleButton
              :model-value="current.bold"
              :ariaLabel="boldLabel"
              testid="text-bold-btn"
              @update:model-value="(v: boolean) => save({ bold: v })"
            ><strong>B</strong></AppToggleButton>
          </AppTooltip>
          <AppTooltip :content="italicLabel">
            <AppToggleButton
              :model-value="current.italic"
              :ariaLabel="italicLabel"
              testid="text-italic-btn"
              @update:model-value="(v: boolean) => save({ italic: v })"
            ><em>I</em></AppToggleButton>
          </AppTooltip>
        </AppPopoverRow>
      </AppPopoverPanel>
    </template>
  </AppButtonDropdown>
</template>
