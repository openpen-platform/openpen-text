import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { clearModuleContext, setModuleContext, type ModuleSetupContext } from '@openpen/module-api'
import TextToolButton from '../src/TextToolButton.vue'
import { MODULE_ID } from '../src/module-id'

describe('panel accessibility (axe: aria-input-field-name, button-name)', () => {
  afterEach(() => clearModuleContext(MODULE_ID))

  it('the size slider thumb and the font select are named', async () => {
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

    expect(popover.findAll('[role="slider"]').map((t) => t.attributes('aria-label'))).toEqual(['settings.fontSize'])
    expect(popover.find('.openpen-select-trigger').attributes('aria-label')).toBe('settings.fontFamilyLabel')
  })
})
