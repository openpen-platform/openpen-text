import { describe, it, expect } from 'vitest'
import type { Point, StrokeStyle } from '@openpen/module-api'
import {
  decideKey,
  shouldCommit,
  splitLines,
  lineBaselines,
  canvasFont,
  buildTextStroke,
  FONT_STACKS,
  LINE_HEIGHT_RATIO,
  type KeyState,
  type TextSettings,
} from '../src/text-logic'

function key(overrides: Partial<KeyState>): KeyState {
  return { key: 'a', shiftKey: false, composing: false, isComposing: false, ...overrides }
}

describe('decideKey — IME-safe keydown guard', () => {
  it("plain Enter (no Shift, not composing) → 'commit'", () => {
    expect(decideKey(key({ key: 'Enter' }))).toBe('commit')
  })

  it("Shift+Enter → 'newline'", () => {
    expect(decideKey(key({ key: 'Enter', shiftKey: true }))).toBe('newline')
  })

  it("Escape → 'cancel'", () => {
    expect(decideKey(key({ key: 'Escape' }))).toBe('cancel')
  })

  it("non-Enter/Escape key → 'ignore'", () => {
    expect(decideKey(key({ key: 'a' }))).toBe('ignore')
    expect(decideKey(key({ key: 'ArrowDown' }))).toBe('ignore')
  })

  // CJK composition: the tool-tracked flag must suppress commit/cancel so the
  // IME owns Enter/Escape (candidate confirmation must not commit a stroke).
  it("Enter while tool-tracked composing=true → 'ignore' (not commit)", () => {
    expect(decideKey(key({ key: 'Enter', composing: true }))).toBe('ignore')
  })

  // event.isComposing reflects mid-composition in most engines; either signal
  // alone must be enough to suppress.
  it("Enter while event.isComposing=true → 'ignore' (not commit)", () => {
    expect(decideKey(key({ key: 'Enter', isComposing: true }))).toBe('ignore')
  })

  it("Escape while composing → 'ignore' (IME owns Escape to dismiss candidates)", () => {
    expect(decideKey(key({ key: 'Escape', composing: true }))).toBe('ignore')
    expect(decideKey(key({ key: 'Escape', isComposing: true }))).toBe('ignore')
  })

  it("Shift+Enter while composing → 'ignore' (composition wins over newline)", () => {
    expect(decideKey(key({ key: 'Enter', shiftKey: true, composing: true }))).toBe('ignore')
  })

  // Safari quirk: compositionend fires AFTER the confirming keydown, so at the
  // moment of that keydown the tool flag `composing` is still true. The guard
  // depends on `composing` being read at keydown time; this asserts the pure
  // decision honours that flag (the setTimeout reset in text-tool keeps it true
  // through the keydown tick).
  it('Safari quirk — confirming Enter keydown still sees composing=true → ignore', () => {
    // At the confirming keydown, the tool flag has NOT yet been reset.
    expect(decideKey(key({ key: 'Enter', composing: true, isComposing: false }))).toBe('ignore')
  })
})

describe('shouldCommit — blank discard', () => {
  it('empty string → false', () => {
    expect(shouldCommit('')).toBe(false)
  })

  it('whitespace-only → false', () => {
    expect(shouldCommit('   ')).toBe(false)
    expect(shouldCommit('\n\t  \n')).toBe(false)
  })

  it('content → true', () => {
    expect(shouldCommit('hi')).toBe(true)
    expect(shouldCommit('  padded  ')).toBe(true)
  })
})

describe('splitLines', () => {
  it('empty string → [] (never paints an empty line)', () => {
    expect(splitLines('')).toEqual([])
  })

  it('single line → one entry', () => {
    expect(splitLines('hello')).toEqual(['hello'])
  })

  it('multi-line splits on \\n', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c'])
  })

  it('keeps trailing empty line (intentional Shift+Enter)', () => {
    expect(splitLines('a\n')).toEqual(['a', ''])
  })

  it('normalizes CRLF and lone CR so no trailing \\r survives', () => {
    expect(splitLines('a\r\nb')).toEqual(['a', 'b'])
    expect(splitLines('a\rb')).toEqual(['a', 'b'])
    expect(splitLines('a\r\n')).toEqual(['a', ''])
  })
})

describe('lineBaselines — multi-line layout math', () => {
  const origin: Point = { x: 100, y: 50 }

  it('first baseline sits one ascent (fontSize) below origin top', () => {
    const [first] = lineBaselines(origin, 24, 1)
    expect(first).toEqual({ x: 100, y: 50 + 24 })
  })

  it('subsequent lines advance by fontSize * LINE_HEIGHT_RATIO', () => {
    const fontSize = 24
    const advance = fontSize * LINE_HEIGHT_RATIO // 30
    const bs = lineBaselines(origin, fontSize, 3)
    expect(bs).toEqual([
      { x: 100, y: 50 + 24 },
      { x: 100, y: 50 + 24 + advance },
      { x: 100, y: 50 + 24 + advance * 2 },
    ])
  })

  it('scales with a different fontSize', () => {
    const fontSize = 40
    const advance = fontSize * LINE_HEIGHT_RATIO // 50
    const bs = lineBaselines({ x: 0, y: 0 }, fontSize, 2)
    expect(bs).toEqual([
      { x: 0, y: 40 },
      { x: 0, y: 40 + advance },
    ])
  })

  it('lineCount 0 → empty array', () => {
    expect(lineBaselines(origin, 24, 0)).toEqual([])
  })

  it('all baselines keep origin x (left-aligned)', () => {
    const bs = lineBaselines({ x: 77, y: 10 }, 16, 4)
    expect(bs.every((b) => b.x === 77)).toBe(true)
  })
})

describe('canvasFont', () => {
  it('builds the CSS font shorthand with the preset stack', () => {
    expect(canvasFont(24, 'sans')).toBe(`24px ${FONT_STACKS.sans}`)
    expect(canvasFont(18, 'serif')).toBe(`18px ${FONT_STACKS.serif}`)
    expect(canvasFont(32, 'mono')).toBe(`32px ${FONT_STACKS.mono}`)
  })
})

describe('buildTextStroke — stroke assembly', () => {
  const origin: Point = { x: 12, y: 34 }
  const settings: TextSettings = { fontSize: 28, fontFamily: 'serif' }
  const style: StrokeStyle = { color: '#ff0000', lineWidth: 3, lineCap: 'round', lineJoin: 'round' }

  it('assembles a text Stroke with all custom fields (deterministic id)', () => {
    const stroke = buildTextStroke(origin, 'hello\nworld', settings, style, () => 'fixed-id')
    expect(stroke).toEqual({
      id: 'fixed-id',
      tool: 'text',
      points: [{ x: 12, y: 34 }],
      style: { color: '#ff0000', lineWidth: 3, lineCap: 'round', lineJoin: 'round' },
      text: 'hello\nworld',
      fontSize: 28,
      fontFamily: 'serif',
    })
  })

  it('injects id from the generator', () => {
    expect(buildTextStroke(origin, 't', settings, style, () => 'abc').id).toBe('abc')
  })

  it('copies origin and style (no shared reference to caller objects)', () => {
    const stroke = buildTextStroke(origin, 't', settings, style, () => 'id')
    expect(stroke.points[0]).not.toBe(origin)
    expect(stroke.style).not.toBe(style)
    expect(stroke.points[0]).toEqual(origin)
  })

  it('fontSize/fontFamily come from settings, not stroke style', () => {
    const stroke = buildTextStroke(origin, 't', { fontSize: 60, fontFamily: 'mono' }, style, () => 'id')
    expect(stroke.fontSize).toBe(60)
    expect(stroke.fontFamily).toBe('mono')
  })
})
