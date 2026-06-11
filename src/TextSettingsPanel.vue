<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useModuleContext } from '@openpen/module-api'
import { AppSegmented, AppSlider } from '@openpen/module-api/uikit'
import { MODULE_ID } from './module-id'
import type { FontFamilyKey } from './text-logic'

interface TextSettings {
  fontSize: number
  fontFamily: FontFamilyKey
}

const ctx = useModuleContext(MODULE_ID)

const fontSize = ref(24)
const fontFamily = ref<FontFamilyKey>('sans')
let unsub: (() => void) | null = null

onMounted(() => {
  const s = ctx.getSettings<TextSettings>()
  fontSize.value = s.fontSize ?? 24
  fontFamily.value = s.fontFamily ?? 'sans'
  unsub = ctx.onSettingsChange<TextSettings>((next) => {
    fontSize.value = next.fontSize
    fontFamily.value = next.fontFamily
  })
})

onUnmounted(() => unsub?.())

const fontSizeLabel = computed(() => ctx.t('settings.fontSize'))
const fontFamilyLabel = computed(() => ctx.t('settings.fontFamilyLabel'))
const fontFamilyOptions = computed(() => [
  { value: 'sans', label: ctx.t('settings.fontFamily.sans') },
  { value: 'serif', label: ctx.t('settings.fontFamily.serif') },
  { value: 'mono', label: ctx.t('settings.fontFamily.mono') },
])

async function setFontSize(value: number) {
  fontSize.value = value
  await ctx.updateSettings<TextSettings>({ fontSize: value })
}

async function setFontFamily(value: string) {
  fontFamily.value = value as FontFamilyKey
  await ctx.updateSettings<TextSettings>({ fontFamily: value as FontFamilyKey })
}
</script>

<template>
  <div class="text-settings">
    <div class="text-row">
      <div class="text-row-label">{{ fontSizeLabel }}</div>
      <div class="text-row-control">
        <AppSlider
          :model-value="fontSize"
          :min="8"
          :max="96"
          :step="1"
          width="120px"
          @update:model-value="setFontSize"
        />
        <span class="text-size-value">{{ fontSize }}px</span>
      </div>
    </div>
    <div class="text-row">
      <div class="text-row-label">{{ fontFamilyLabel }}</div>
      <AppSegmented
        :model-value="fontFamily"
        :options="fontFamilyOptions"
        @update:model-value="setFontFamily"
      />
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
  color: var(--openpen-color-text-secondary);
  min-width: 36px;
  text-align: right;
}
</style>
