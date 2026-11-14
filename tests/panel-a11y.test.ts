import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { clearModuleContext, setModuleContext, type ModuleSetupContext } from '@openpen/module-api'
import TextSettingsPanel from '../src/TextSettingsPanel.vue'
import TextToolButton from '../src/TextToolButton.vue'
import { MODULE_ID } from '../src/module-id'

describe('panel accessibility (axe: aria-input-field-name, aria-allowed-attr, button-name)', () => {
  afterEach(() => clearModuleContext(MODULE_ID))

  it('the size slider thumb, the font select and both switches are named, and no switch carries aria-pressed', async () => {
    const ctx = {
      moduleId: MODULE_ID,
      locale: 'en',
      getSettings: () => ({ fontSize: 24, fontFamily: 'sans', bold: false, italic: false }),
      updateSettings: async () => {},
      onSettingsChange: () => () => {},
      t: (key: string) => key,
    } as unknown as ModuleSetupContext
    setModuleContext(MODULE_ID, ctx)

    // The dropdown shell needs the host to open its popover; render its slots inline.
    const shell = { template: '<div><slot name="main-content" /><slot name="popover-content" /></div>' }
    const popover = mount(TextToolButton, { attachTo: document.body, global: { stubs: { AppButtonDropdown: shell } } })
    await nextTick()
    const panel = mount(TextSettingsPanel, { attachTo: document.body })
    await nextTick()

    expect(popover.findAll('[role="slider"]').map((t) => t.attributes('aria-label'))).toEqual(['settings.fontSize'])
    expect(panel.findAll('[role="slider"]').map((t) => t.attributes('aria-label'))).toEqual(['settings.fontSize'])
    expect(popover.find('.openpen-select-trigger').attributes('aria-label')).toBe('settings.fontFamilyLabel')
    expect(panel.find('.openpen-select-trigger').attributes('aria-label')).toBe('settings.fontFamilyLabel')

    const switches = panel.findAll('[role="switch"]')
    expect(switches.length).toBe(2)
    for (const sw of switches) expect(sw.attributes('aria-pressed')).toBeUndefined()
  })
})
