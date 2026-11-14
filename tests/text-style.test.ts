import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Point, Stroke, StrokeStyle } from '@openpen/module-api'

const commitStroke = vi.fn()
vi.mock('@openpen/module-api/host', () => ({
  commitStroke: (...args: unknown[]) => commitStroke(...args),
}))

import { createTextTool, renderTextStroke } from '../src/text-tool'
import {
  FONT_FAMILY_KEYS,
  FONT_SIZE_DEFAULT,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  FONT_STACKS,
  canvasFont,
  clampFontSize,
  normalizeFontFamily,
  normalizeTextSettings,
} from '../src/text-logic'
import en from '../src/locales/en.json'
import ja from '../src/locales/ja.json'
import zhHans from '../src/locales/zh-Hans.json'
import zhHant from '../src/locales/zh-Hant.json'

const style: StrokeStyle = { color: '#112233', lineWidth: 4, lineCap: 'round', lineJoin: 'round' }
const point: Point = { x: 40, y: 60 }
const ctx0 = {} as CanvasRenderingContext2D

function editor(): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>('[data-openpen-text-editor]')
  if (!el) throw new Error('no active editor in DOM')
  return el
}

function keydown(el: HTMLTextAreaElement, init: KeyboardEventInit): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

function fontRecorder() {
  const fonts: string[] = []
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    set font(v: string) {
      fonts.push(v)
    },
    textBaseline: '',
    textAlign: '',
    fillStyle: '',
  } as unknown as CanvasRenderingContext2D
  return { ctx, fonts }
}

// ── AC #2: chosen font / bold / italic reach the typed text ───────────────────

describe('panel style → placed text (AC #2)', () => {
  beforeEach(() => {
    commitStroke.mockReset()
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('editor, committed stroke and canvas font all carry the chosen family, bold and italic', () => {
    const tool = createTextTool({
      fontSize: () => 30,
      fontFamily: () => 'kai',
      bold: () => true,
      italic: () => true,
      placeholder: () => '',
    }).tool
    tool.onPointerDown(ctx0, point, style)
    const el = editor()
    expect(el.style.fontStyle).toBe('italic')
    expect(el.style.fontWeight).toBe('bold')
    expect(el.style.fontFamily).toContain('KaiTi')
    el.value = 'hello'
    keydown(el, { key: 'Enter' })

    const stroke = commitStroke.mock.calls[0][0] as Stroke
    expect(stroke.fontFamily).toBe('kai')
    expect(stroke.bold).toBe(true)
    expect(stroke.italic).toBe(true)

    const { ctx, fonts } = fontRecorder()
    renderTextStroke(ctx, stroke)
    expect(fonts[0]).toBe(canvasFont(30, 'kai', true, true))
    expect(fonts[0]).toBe(`italic bold 30px ${FONT_STACKS.kai}`)
  })

  it('without bold / italic the text stays upright and regular; old strokes lacking the fields still render', () => {
    const tool = createTextTool({
      fontSize: () => 24,
      fontFamily: () => 'sans',
      placeholder: () => '',
    }).tool
    tool.onPointerDown(ctx0, point, style)
    expect(editor().style.fontStyle).not.toBe('italic')
    expect(editor().style.fontWeight).not.toBe('bold')
    editor().value = 'plain'
    keydown(editor(), { key: 'Enter' })
    const stroke = commitStroke.mock.calls[0][0] as Stroke
    expect(stroke.bold).toBe(false)
    expect(stroke.italic).toBe(false)

    const legacy = { ...stroke, bold: undefined, italic: undefined, fontFamily: 'mystery' } as unknown as Stroke
    const { ctx, fonts } = fontRecorder()
    renderTextStroke(ctx, legacy)
    expect(fonts[0]).toBe(`24px ${FONT_STACKS.sans}`)
  })
})

// ── AC #3: IME composition survives a style change made in the panel ─────────

describe('IME protection after a panel style change (AC #3)', () => {
  beforeEach(() => {
    commitStroke.mockReset()
    document.body.innerHTML = ''
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('Enter that confirms a candidate does not commit, even with bold + a new family chosen first', () => {
    let family: ReturnType<typeof normalizeFontFamily> = 'sans'
    let bold = false
    const tool = createTextTool({
      fontSize: () => 24,
      fontFamily: () => family,
      bold: () => bold,
      placeholder: () => '',
    }).tool
    // The user changes the style in the panel (settings sync into these
    // accessors), then clicks the canvas and types with an IME.
    family = 'kai'
    bold = true
    tool.onPointerDown(ctx0, point, style)
    const el = editor()
    el.value = 'にほんご'
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    keydown(el, { key: 'Enter' })
    expect(commitStroke).not.toHaveBeenCalled()
    expect(document.querySelector('[data-openpen-text-editor]')).not.toBeNull()

    // Composition ends; the next plain Enter commits with the chosen style.
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    vi.runAllTimers()
    keydown(el, { key: 'Enter' })
    expect(commitStroke).toHaveBeenCalledTimes(1)
    const stroke = commitStroke.mock.calls[0][0] as Stroke
    expect(stroke.fontFamily).toBe('kai')
    expect(stroke.bold).toBe(true)
  })
})

// ── AC #5: every string added by the panel exists in all four languages ──────

type Tree = { [k: string]: string | Tree }
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(tree)) {
    if (typeof v === 'string') out[prefix + k] = v
    else Object.assign(out, flatten(v, `${prefix}${k}.`))
  }
  return out
}

describe('locales (AC #5)', () => {
  const base = flatten(en as Tree)
  // Font names that are the same proper noun in every language.
  const PROPER_NAMES = new Set([
    'settings.fontFamily.arial',
    'settings.fontFamily.verdana',
    'settings.fontFamily.times',
    'settings.fontFamily.courier',
  ])

  it('every English key — panel strings and each font preset — exists, non-empty, in ja / zh-Hans / zh-Hant', () => {
    for (const loc of [ja, zhHans, zhHant]) {
      const flat = flatten(loc as Tree)
      expect(Object.keys(flat).sort()).toEqual(Object.keys(base).sort())
      for (const v of Object.values(flat)) expect(v.trim().length).toBeGreaterThan(0)
    }
    for (const key of FONT_FAMILY_KEYS) expect(base[`settings.fontFamily.${key}`]).toBeTruthy()
    for (const key of ['options.label', 'options.bold', 'options.italic']) expect(base[key]).toBeTruthy()
  })

  it('new strings are actually translated, not copies of the English text', () => {
    const fresh = Object.keys(base).filter(
      (k) => k.startsWith('options.') || (k.startsWith('settings.fontFamily.') && !PROPER_NAMES.has(k)),
    )
    for (const loc of [ja, zhHans, zhHant]) {
      const flat = flatten(loc as Tree)
      for (const k of fresh) expect(flat[k], k).not.toBe(base[k])
    }
  })
})

// ── AC #6: clamping and persistence of the stored values ─────────────────────

describe('settings clamping (AC #6)', () => {
  it('clampFontSize keeps in-range values and clamps out-of-range ones to 8..96', () => {
    expect(clampFontSize(24)).toBe(24)
    expect(clampFontSize(FONT_SIZE_MIN)).toBe(FONT_SIZE_MIN)
    expect(clampFontSize(FONT_SIZE_MAX)).toBe(FONT_SIZE_MAX)
    expect(clampFontSize(3)).toBe(FONT_SIZE_MIN)
    expect(clampFontSize(-50)).toBe(FONT_SIZE_MIN)
    expect(clampFontSize(500)).toBe(FONT_SIZE_MAX)
    expect(clampFontSize(20.6)).toBe(21)
    expect(clampFontSize(Number.NaN)).toBe(FONT_SIZE_DEFAULT)
    expect(clampFontSize('big' as unknown as number)).toBe(FONT_SIZE_DEFAULT)
  })

  it('normalizeTextSettings keeps a saved choice, falls back for unknown or missing values', () => {
    expect(normalizeTextSettings({ fontSize: 60, fontFamily: 'courier', bold: true, italic: true })).toEqual({
      fontSize: 60,
      fontFamily: 'courier',
      bold: true,
      italic: true,
    })
    // Saved by the version before the panel: only size + one of the old presets.
    expect(normalizeTextSettings({ fontSize: 30, fontFamily: 'mono' })).toEqual({
      fontSize: 30,
      fontFamily: 'mono',
      bold: false,
      italic: false,
    })
    expect(
      normalizeTextSettings({ fontSize: 999, fontFamily: 'comic-sans-ultra', bold: 'yes' as unknown as boolean }),
    ).toEqual({ fontSize: FONT_SIZE_MAX, fontFamily: 'sans', bold: false, italic: false })
    expect(normalizeTextSettings({})).toEqual({ fontSize: 24, fontFamily: 'sans', bold: false, italic: false })
    // Every listed preset survives normalization and has a font stack.
    for (const key of FONT_FAMILY_KEYS) {
      expect(normalizeFontFamily(key)).toBe(key)
      expect(FONT_STACKS[key].length).toBeGreaterThan(0)
    }
    expect(FONT_FAMILY_KEYS).toEqual(expect.arrayContaining(['sans', 'serif', 'mono']))
  })
})
