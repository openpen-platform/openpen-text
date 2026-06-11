import { describe, it, expect, vi } from 'vitest'
import { z } from '@openpen/module-api'

// The module index imports .vue SFCs (control-bar button + settings panel);
// stub them as plain marker objects so defineModule's runtime validation runs
// without a Vue SFC compiler. The contract test asserts module shape, not the
// components' render output.
vi.mock('../src/TextToolButton.vue', () => ({ default: { name: 'TextToolButton' } }))
vi.mock('../src/TextSettingsPanel.vue', () => ({ default: { name: 'TextSettingsPanel' } }))

import textModule, { MODULE_ID } from '../src/index'

describe('@openpen/text — module contract', () => {
  it('exports MODULE_ID matching the canonical id', () => {
    expect(MODULE_ID).toBe('@openpen/text')
    expect(textModule.id).toBe('@openpen/text')
  })

  it('defineModule did not throw (preflight passed)', () => {
    // Reaching here means the default export was constructed by defineModule
    // without preflight errors (invalid id / empty contributes / bad slot).
    expect(textModule).toBeTypeOf('object')
    expect(textModule.version).toBe('1.0.0')
  })

  it('provides the tool three-piece set: tools + cursors + controlBar', () => {
    const c = textModule.contributes
    expect(c.tools?.length).toBe(1)
    expect(c.cursors?.length).toBe(1)
    expect(c.controlBar?.length).toBe(1)
  })

  it('the contributed tool is wired with handlers + custom renderStroke', () => {
    const tool = textModule.contributes.tools![0]
    expect(tool.id).toBe('text')
    expect(typeof tool.onPointerDown).toBe('function')
    expect(typeof tool.onPointerUp).toBe('function')
    expect(typeof tool.renderStroke).toBe('function')
  })

  it('cursor + control bar entries use the tool id and tools group', () => {
    expect(textModule.contributes.cursors![0].id).toBe('text')
    expect(textModule.contributes.controlBar![0].defaultGroup).toBe('tools')
  })

  it('declares a settings panel', () => {
    expect(textModule.contributes.settingsPanels?.length).toBe(1)
    expect(textModule.contributes.settingsPanels![0].id).toBe('text-settings')
  })

  it('settingsSchema parses defaults: fontSize 24, fontFamily sans', () => {
    expect(textModule.settingsSchema).toBeDefined()
    const parsed = (textModule.settingsSchema as z.ZodType).parse({})
    expect(parsed).toEqual({ fontSize: 24, fontFamily: 'sans' })
  })

  it('settingsSchema enforces fontSize bounds and fontFamily enum', () => {
    const schema = textModule.settingsSchema as z.ZodType
    expect(schema.safeParse({ fontSize: 7 }).success).toBe(false) // min 8
    expect(schema.safeParse({ fontSize: 97 }).success).toBe(false) // max 96
    expect(schema.safeParse({ fontFamily: 'comic' }).success).toBe(false)
    expect(schema.safeParse({ fontSize: 48, fontFamily: 'mono' }).success).toBe(true)
  })

  it('ships en/zh-Hant/zh-Hans/ja locales', () => {
    const locales = textModule.contributes.locales as Record<string, unknown>
    expect(Object.keys(locales).sort()).toEqual(['en', 'ja', 'zh-Hans', 'zh-Hant'])
  })
})
