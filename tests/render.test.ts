import { describe, it, expect, vi } from 'vitest'
import type { Stroke } from '@openpen/module-api'
import { renderTextStroke } from '../src/text-tool'
import { FONT_STACKS, LINE_HEIGHT_RATIO } from '../src/text-logic'

interface FillTextCall {
  text: string
  x: number
  y: number
}

function mockCtx() {
  const fillTextCalls: FillTextCall[] = []
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => {
      fillTextCalls.push({ text, x, y })
    }),
    font: '',
    textBaseline: '' as CanvasTextBaseline,
    textAlign: '' as CanvasTextAlign,
    fillStyle: '' as string | CanvasGradient | CanvasPattern,
  }
  return { ctx: ctx as unknown as CanvasRenderingContext2D, fillTextCalls, raw: ctx }
}

function textStroke(over: Partial<Stroke> = {}): Stroke {
  return {
    id: 's1',
    tool: 'text',
    points: [{ x: 10, y: 20 }],
    style: { color: '#ff0000', lineWidth: 2, lineCap: 'round', lineJoin: 'round' },
    text: 'hello',
    fontSize: 24,
    fontFamily: 'sans',
    ...over,
  }
}

describe('renderTextStroke', () => {
  it('draws one fillText per line', () => {
    const { ctx, fillTextCalls } = mockCtx()
    renderTextStroke(ctx, textStroke({ text: 'a\nb\nc' }))
    expect(fillTextCalls.map((c) => c.text)).toEqual(['a', 'b', 'c'])
  })

  it('positions each line at the computed baselines (left-aligned, advancing)', () => {
    const { ctx, fillTextCalls } = mockCtx()
    const fontSize = 24
    const advance = fontSize * LINE_HEIGHT_RATIO // 30
    renderTextStroke(ctx, textStroke({ text: 'x\ny', points: [{ x: 10, y: 20 }], fontSize }))
    expect(fillTextCalls).toEqual([
      { text: 'x', x: 10, y: 20 + fontSize },
      { text: 'y', x: 10, y: 20 + fontSize + advance },
    ])
  })

  it('sets font from stroke settings, alphabetic baseline, left align', () => {
    const { ctx, raw } = mockCtx()
    renderTextStroke(ctx, textStroke({ fontSize: 18, fontFamily: 'mono' }))
    expect(raw.font).toBe(`18px ${FONT_STACKS.mono}`)
    expect(raw.textBaseline).toBe('alphabetic')
    expect(raw.textAlign).toBe('left')
  })

  it('uses stroke.style.color for fill', () => {
    const { ctx, raw } = mockCtx()
    renderTextStroke(ctx, textStroke({ style: { color: '#00ff88', lineWidth: 1, lineCap: 'round', lineJoin: 'round' } }))
    expect(raw.fillStyle).toBe('#00ff88')
  })

  it('save/restore wrap the draw so global ctx state is not leaked', () => {
    const { ctx, raw } = mockCtx()
    renderTextStroke(ctx, textStroke())
    expect(raw.save).toHaveBeenCalledTimes(1)
    expect(raw.restore).toHaveBeenCalledTimes(1)
  })

  it('empty text draws nothing', () => {
    const { ctx, fillTextCalls, raw } = mockCtx()
    renderTextStroke(ctx, textStroke({ text: '' }))
    expect(fillTextCalls.length).toBe(0)
    expect(raw.fillText).not.toHaveBeenCalled()
  })

  it('missing origin point draws nothing', () => {
    const { ctx, raw } = mockCtx()
    renderTextStroke(ctx, textStroke({ points: [] }))
    expect(raw.fillText).not.toHaveBeenCalled()
  })

  it('falls back to defaults when font extras are absent', () => {
    const { ctx, raw, fillTextCalls } = mockCtx()
    const stroke = { id: 's', tool: 'text', points: [{ x: 0, y: 0 }], style: textStroke().style, text: 'hi' } as Stroke
    renderTextStroke(ctx, stroke)
    expect(raw.font).toBe(`24px ${FONT_STACKS.sans}`)
    expect(fillTextCalls).toEqual([{ text: 'hi', x: 0, y: 24 }])
  })
})
