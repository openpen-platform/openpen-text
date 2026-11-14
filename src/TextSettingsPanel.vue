<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useModuleContext } from '@openpen/module-api'
import { AppSelect, AppSlider, AppToggle } from '@openpen/module-api/uikit'
import { MODULE_ID } from './module-id'
import { vSelectName, vSliderName, vSwitchState } from './a11y-workarounds'
import {
  FONT_FAMILY_KEYS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  clampFontSize,
  normalizeTextSettings,
  type FontFamilyKey,
  type TextSettings,
} from './text-logic'

const ctx = useModuleContext(MODULE_ID)

const current = ref<TextSettings>(normalizeTextSettings({}))
let unsub: (() => void) | null = null

onMounted(() => {
  current.value = normalizeTextSettings(ctx.getSettings<Partial<TextSettings>>())
  unsub = ctx.onSettingsChange<Partial<TextSettings>>((next) => {
    current.value = normalizeTextSettings(next)
  })
})

onUnmounted(() => unsub?.())

const fontSizeLabel = computed(() => ctx.t('settings.fontSize'))
const fontFamilyLabel = computed(() => ctx.t('settings.fontFamilyLabel'))
const boldLabel = computed(() => ctx.t('options.bold'))
const italicLabel = computed(() => ctx.t('options.italic'))
const fontFamilyOptions = computed(() =>
  FONT_FAMILY_KEYS.map((key) => ({ value: key, label: ctx.t(`settings.fontFamily.${key}`) })),
)

async function save(patch: Partial<TextSettings>) {
  current.value = { ...current.value, ...patch }
  await ctx.updateSettings<TextSettings>(patch)
}

const setFontSize = (value: number) => save({ fontSize: clampFontSize(Number(value)) })
const setFontFamily = (value: string) => save({ fontFamily: value as FontFamilyKey })
const setBold = (value: boolean) => save({ bold: value })
const setItalic = (value: boolean) => save({ italic: value })
</script>

<template>
  <div class="text-settings">
    <div class="text-row">
      <div class="text-row-label">{{ fontSizeLabel }}</div>
      <div class="text-row-control">
        <div v-slider-name="fontSizeLabel">
          <AppSlider
            :model-value="current.fontSize"
            :min="FONT_SIZE_MIN"
            :max="FONT_SIZE_MAX"
            :step="1"
            width="120px"
            @update:model-value="setFontSize"
          />
        </div>
        <span class="text-size-value">{{ current.fontSize }}px</span>
      </div>
    </div>
    <div class="text-row">
      <div class="text-row-label">{{ fontFamilyLabel }}</div>
      <div v-select-name="fontFamilyLabel">
        <AppSelect
          :model-value="current.fontFamily"
          :options="fontFamilyOptions"
          :placeholder="fontFamilyLabel"
          @update:model-value="setFontFamily"
        />
      </div>
    </div>
    <div class="text-row">
      <div class="text-row-label">{{ boldLabel }}</div>
      <div v-switch-state>
        <AppToggle :model-value="current.bold" :aria-label="boldLabel" @update:model-value="setBold" />
      </div>
    </div>
    <div class="text-row">
      <div class="text-row-label">{{ italicLabel }}</div>
      <div v-switch-state>
        <AppToggle :model-value="current.italic" :aria-label="italicLabel" @update:model-value="setItalic" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.text-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.text-row-label {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--openpen-color-text-primary);
}

.text-row-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.text-size-value {
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--openpen-color-text-dim);
  min-width: 36px;
  text-align: right;
}
</style>
