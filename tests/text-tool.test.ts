import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Point, StrokeStyle } from '@openpen/module-api'

// Mock the host commit path so we can assert what the tool commits without a
// live OpenPen host. resolveStrokeColor is used by openEditor for inline CSS;
// keep the real one (it's a pure helper from the SDK).
const commitStroke = vi.fn()
vi.mock('@openpen/module-api/host', () => ({
  commitStroke: (...args: unknown[]) => commitStroke(...args),
}))

import { createTextTool, type TextToolOptions } from '../src/text-tool'

const style: StrokeStyle = { color: '#112233', lineWidth: 4, lineCap: 'round', lineJoin: 'round' }
const point: Point = { x: 40, y: 60 }

function makeHandle(over: Partial<TextToolOptions> = {}) {
  const opts: TextToolOptions = {
    fontSize: () => 24,
    fontFamily: () => 'sans',
    placeholder: () => 'Type…',
    ...over,
  }
  return createTextTool(opts)
}

function makeTool(over: Partial<TextToolOptions> = {}) {
  return makeHandle(over).tool
}

function activeEditor(): HTMLTextAreaElement {
  const el = document.querySelector<HTMLTextAreaElement>('[data-openpen-text-editor]')
  if (!el) throw new Error('no active editor in DOM')
  return el
}

function keydown(el: HTMLTextAreaElement, init: KeyboardEventInit): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

// jsdom's compositionstart/end + isComposing don't drive real IME state, so we
// dispatch the composition events the tool listens on and set isComposing on
// the synthesized keydown to mirror a real engine mid-composition.
function dispatchComposition(el: HTMLTextAreaElement, type: 'compositionstart' | 'compositionend'): void {
  el.dispatchEvent(new CompositionEvent(type, { bubbles: true }))
}

describe('text tool — commit flow via host commitStroke', () => {
  beforeEach(() => {
    commitStroke.mockReset()
    document.body.innerHTML = ''
    if (!('randomUUID' in globalThis.crypto)) {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: () => '00000000-0000-0000-0000-000000000000',
        configurable: true,
      })
    }
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('onPointerUp always returns null (async commit, not gesture commit)', () => {
    const tool = makeTool()
    const ctx = {} as CanvasRenderingContext2D
    tool.onPointerDown(ctx, point, style)
    expect(tool.onPointerUp(ctx, point)).toBeNull()
    // Pointer up must NOT have committed anything by itself.
    expect(commitStroke).not.toHaveBeenCalled()
  })

  it('plain Enter (not composing, no Shift) commits the typed stroke once', () => {
    const tool = makeTool({ fontSize: () => 30, fontFamily: () => 'serif' })
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = 'hello'
    keydown(el, { key: 'Enter', shiftKey: false })

    expect(commitStroke).toHaveBeenCalledTimes(1)
    const stroke = commitStroke.mock.calls[0][0]
    expect(stroke.tool).toBe('text')
    expect(stroke.text).toBe('hello')
    expect(stroke.fontSize).toBe(30)
    expect(stroke.fontFamily).toBe('serif')
    expect(stroke.points).toEqual([{ x: 40, y: 60 }])
    expect(stroke.style.color).toBe('#112233')
    expect(typeof stroke.id).toBe('string')
    // Editor removed from DOM after commit.
    expect(document.querySelector('[data-openpen-text-editor]')).toBeNull()
  })

  it('Enter mid-composition (CJK) does NOT commit — composition flag set', () => {
    const tool = makeTool()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = 'にほんご'
    dispatchComposition(el, 'compositionstart') // composing = true
    keydown(el, { key: 'Enter', shiftKey: false }) // candidate confirmation

    expect(commitStroke).not.toHaveBeenCalled()
    // Editor still open (composition Enter must not tear it down).
    expect(document.querySelector('[data-openpen-text-editor]')).not.toBeNull()
  })

  it('Enter with event.isComposing=true does NOT commit', () => {
    const tool = makeTool()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = '한국어'
    keydown(el, { key: 'Enter', shiftKey: false, isComposing: true } as KeyboardEventInit)

    expect(commitStroke).not.toHaveBeenCalled()
  })

  it('empty / whitespace Enter discards (no commit), editor closes', () => {
    const tool = makeTool()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = '   '
    keydown(el, { key: 'Enter', shiftKey: false })

    expect(commitStroke).not.toHaveBeenCalled()
    expect(document.querySelector('[data-openpen-text-editor]')).toBeNull()
  })

  it('Escape cancels without committing, editor closes', () => {
    const tool = makeTool()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = 'discard me'
    keydown(el, { key: 'Escape' })

    expect(commitStroke).not.toHaveBeenCalled()
    expect(document.querySelector('[data-openpen-text-editor]')).toBeNull()
  })

  it('Shift+Enter does NOT commit (newline falls through to textarea)', () => {
    const tool = makeTool()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = 'line1'
    keydown(el, { key: 'Enter', shiftKey: true })

    expect(commitStroke).not.toHaveBeenCalled()
    expect(document.querySelector('[data-openpen-text-editor]')).not.toBeNull()
  })

  it('blur commits non-empty content (click-away semantics)', () => {
    const tool = makeTool()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = 'on blur'
    el.dispatchEvent(new FocusEvent('blur', { bubbles: false }))

    expect(commitStroke).toHaveBeenCalledTimes(1)
    expect(commitStroke.mock.calls[0][0].text).toBe('on blur')
  })

  it('multi-line value is committed verbatim (renderer splits later)', () => {
    const tool = makeTool()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = 'a\nb\nc'
    keydown(el, { key: 'Enter', shiftKey: false })

    expect(commitStroke.mock.calls[0][0].text).toBe('a\nb\nc')
  })

  it('opening a second editor commits the first (typed text never silently vanishes)', () => {
    const tool = makeTool()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    activeEditor().value = 'first placement'
    tool.onPointerDown({} as CanvasRenderingContext2D, { x: 5, y: 5 }, style)
    expect(document.querySelectorAll('[data-openpen-text-editor]').length).toBe(1)
    expect(commitStroke).toHaveBeenCalledTimes(1)
    expect((commitStroke.mock.calls[0][0] as { text?: string }).text).toBe('first placement')
  })

  it('opening a second editor over an empty first commits nothing', () => {
    const tool = makeTool()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    tool.onPointerDown({} as CanvasRenderingContext2D, { x: 5, y: 5 }, style)
    expect(document.querySelectorAll('[data-openpen-text-editor]').length).toBe(1)
    expect(commitStroke).not.toHaveBeenCalled()
  })
})

describe('text tool — cancelEditor teardown (tool-switch zombie guard)', () => {
  beforeEach(() => {
    commitStroke.mockReset()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('removes the editor from the DOM without committing', () => {
    const { tool, cancelEditor } = makeHandle()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = 'half-typed'

    cancelEditor()

    expect(document.querySelector('[data-openpen-text-editor]')).toBeNull()
    expect(commitStroke).not.toHaveBeenCalled()
  })

  it('detaches keydown so a stray Enter cannot resurrect a commit', () => {
    const { tool, cancelEditor } = makeHandle()
    tool.onPointerDown({} as CanvasRenderingContext2D, point, style)
    const el = activeEditor()
    el.value = 'half-typed'

    cancelEditor()
    // The element is detached; re-dispatching the commit key must be inert
    // because the listener was removed (no host commit, editor stays gone).
    keydown(el, { key: 'Enter', shiftKey: false })

    expect(commitStroke).not.toHaveBeenCalled()
    expect(document.querySelector('[data-openpen-text-editor]')).toBeNull()
  })

  it('is a no-op when no editor is open', () => {
    const { cancelEditor } = makeHandle()
    expect(() => cancelEditor()).not.toThrow()
    expect(commitStroke).not.toHaveBeenCalled()
  })
})
