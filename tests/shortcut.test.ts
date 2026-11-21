import { describe, it, expect, vi, beforeEach } from 'vitest'

const activateTool = vi.fn()
vi.mock('@openpen/module-api', async (orig) => ({
  ...(await orig<typeof import('@openpen/module-api')>()),
  activateTool: (...a: unknown[]) => activateTool(...a),
}))
vi.mock('@openpen/module-api/host', () => ({ commitStroke: vi.fn(), on: vi.fn() }))
vi.mock('../src/TextToolButton.vue', () => ({ default: { name: 'TextToolButton' } }))

import textModule from '../src/index'

describe('text shortcut', () => {
  beforeEach(() => {
    activateTool.mockReset()
  })

  it('is Ctrl+Alt+T (Command+Option+T on macOS) in drawing scope, never a bare T', () => {
    const s = textModule.contributes.shortcuts![0]
    expect(s.keys).toBe('CommandOrControl+Alt+T')
    expect(s.scope).toBe('drawing')
    expect(s.keys).not.toBe('T')
  })

  it('has a label in all four languages', () => {
    const label = textModule.contributes.shortcuts![0].label as Record<string, string>
    for (const lang of ['en', 'zh-Hant', 'zh-Hans', 'ja']) {
      expect(label[lang]).toBeTruthy()
    }
  })

  it('the handler switches to the text tool through the public method', () => {
    textModule.contributes.shortcuts![0].handler()
    expect(activateTool).toHaveBeenCalledTimes(1)
    expect(activateTool).toHaveBeenCalledWith('text')
  })
})
