<script setup lang="ts">
import { computed, inject } from 'vue'
import { ACTIVE_TOOL_KEY, useModuleContext } from '@openpen/module-api'
import { emit } from '@openpen/module-api/host'
import { AppButton } from '@openpen/module-api/uikit'
import { MODULE_ID } from './module-id'

const ctx = useModuleContext(MODULE_ID)
const label = computed(() => ctx.t('tool'))

const activeTool = inject(ACTIVE_TOOL_KEY)
const isActive = computed(() => activeTool?.value === 'text')

function activate() {
  // Same two-step pattern as the built-in tool buttons: the event-bus emit
  // updates this window's active-tool state; the IPC relays to the overlay.
  emit('tool-changed', { tool: 'text' })
  window.openPenApi?.setActiveTool({ tool: 'text' })
}
</script>

<template>
  <AppButton
    :active="isActive"
    :tooltip="label"
    :aria-label="label"
    data-testid="controlbar-text-btn"
    @click="activate"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  </AppButton>
</template>
