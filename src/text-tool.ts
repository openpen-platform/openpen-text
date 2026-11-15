/**
 * Text tool — places a short-lived inline editor at the click point, then
 * commits the typed text as a `Stroke` that `renderTextStroke` repaints on
 * every redraw (so it participates in undo/redo and survives history replay).
 *
 * Text editing is async (click → type → Enter), which does not fit a single
 * synchronous pointer gesture, so `onPointerUp` returns null and the editor's
 * own commit handler calls the host `commitStroke` — the atomic
 * addStroke+pushCommand+redraw path that mirrors the synchronous return value.
 */
import { resolveStrokeColor } from '@openpen/module-api'
import type { Point, Stroke, StrokeStyle, Tool } from '@openpen/module-api'
import { commitStroke } from '@openpen/module-api/host'
import {
  buildTextStroke,
  canvasFont,
  decideKey,
  FONT_STACKS,
  LINE_HEIGHT_RATIO,
  lineBaselines,
  nextFontSize,
  normalizeFontFamily,
  shouldCommit,
  splitLines,
  type FontFamilyKey,
  type TextSettings,
} from './text-logic'

/** How long after compositionend an Enter still counts as the one that confirmed the composition. */
const COMPOSITION_END_GRACE_MS = 50

export interface TextToolOptions {
  /** Current font size at placement time. */
  fontSize: () => number
  /** Current font family at placement time. */
  fontFamily: () => FontFamilyKey
  /** Whether new text is bold at placement time (default: no). */
  bold?: () => boolean
  /** Whether new text is italic at placement time (default: no). */
  italic?: () => boolean
  /** i18n placeholder shown in the empty editor. */
  placeholder: () => string
  /**
   * Apply a font size chosen with Ctrl+wheel while typing. The owner updates
   * its live settings synchronously (so `fontSize()` returns the new value
   * right after) and persists them.
   */
  setFontSize?: (size: number) => void
}

export interface TextToolHandle {
  /** The `Tool` contributed to `canvas.tools`. */
  tool: Tool
  /**
   * Abort any in-flight editor without committing: removes the `<textarea>`,
   * detaches its listeners, and clears editor state. Safe to call when no
   * editor is open. The host invokes this when the active tool switches away
   * from `text`, so a half-typed editor can't linger in the DOM and keep
   * intercepting keystrokes.
   */
  cancelEditor: () => void
}

interface ActiveEditor {
  el: HTMLTextAreaElement
  origin: Point
  style: StrokeStyle
  dispose: () => void
}

export function createTextTool(opts: TextToolOptions): TextToolHandle {
  // Editor that is currently open for typing (null when no editing in flight).
  let editor: ActiveEditor | null = null

  function settings(): TextSettings {
    return {
      fontSize: opts.fontSize(),
      fontFamily: opts.fontFamily(),
      bold: opts.bold?.() ?? false,
      italic: opts.italic?.() ?? false,
    }
  }

  function teardownEditor(): void {
    if (!editor) return
    editor.dispose()
    editor.el.remove()
    editor = null
  }

  /** Finish the open editor: build a stroke (if non-empty) and commit it. */
  function commitEditor(): void {
    if (!editor) return
    const value = editor.el.value
    const { origin, style } = editor
    teardownEditor()
    if (!shouldCommit(value)) return
    const set = settings()
    commitStroke(buildTextStroke(origin, value, set, style, () => crypto.randomUUID()))
  }

  function cancelEditor(): void {
    teardownEditor()
  }

  /** Ctrl+wheel while an editor is open resizes the text being typed. */
  function onWheel(e: WheelEvent): void {
    if (!editor || !e.ctrlKey || !opts.setFontSize) return
    e.preventDefault()
    e.stopPropagation()
    const current = opts.fontSize()
    const next = nextFontSize(current, e.deltaY)
    if (next === current) return
    opts.setFontSize(next)
    const size = opts.fontSize()
    editor.el.style.fontSize = `${size}px`
    editor.el.style.lineHeight = `${size * LINE_HEIGHT_RATIO}px`
    autosize(editor.el)
  }

  function openEditor(origin: Point, style: StrokeStyle): void {
    // Commit (not discard) any in-flight editor first: a click on the canvas
    // does not blur the textarea (canvas is not focusable), so without this
    // the user's typed text would silently vanish on a second placement.
    commitEditor()
    const set = settings()
    const el = document.createElement('textarea')
    el.value = ''
    el.placeholder = opts.placeholder()
    el.spellcheck = false
    el.rows = 1
    el.wrap = 'off'
    el.setAttribute('data-openpen-text-editor', '')
    Object.assign(el.style, {
      position: 'fixed',
      left: `${origin.x}px`,
      top: `${origin.y}px`,
      margin: '0',
      padding: '0',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      resize: 'none',
      overflow: 'hidden',
      whiteSpace: 'pre',
      boxSizing: 'content-box',
      zIndex: '2147483647',
      color: resolveStrokeColor(style.color),
      // Longhands (not the `font` shorthand) so each property is readable and
      // the editor matches `canvasFont` exactly.
      fontStyle: set.italic ? 'italic' : 'normal',
      fontWeight: set.bold ? 'bold' : 'normal',
      fontSize: `${set.fontSize}px`,
      fontFamily: FONT_STACKS[set.fontFamily],
      lineHeight: `${set.fontSize * LINE_HEIGHT_RATIO}px`,
      caretColor: resolveStrokeColor(style.color),
      minWidth: '1ch',
    } satisfies Partial<CSSStyleDeclaration>)

    let composing = false
    let resetTimer: ReturnType<typeof setTimeout> | undefined

    const onCompositionStart = (): void => {
      composing = true
      if (resetTimer !== undefined) {
        clearTimeout(resetTimer)
        resetTimer = undefined
      }
    }
    const onCompositionEnd = (): void => {
      // The Enter that confirms a composition can reach us on either side of
      // compositionend: Safari fires it before, and the Korean IME on Windows
      // fires compositionend and then keydown (isComposing=false) in the same
      // task. A zero-delay reset can run between the two, so keep the flag for
      // a short grace period that only a single physical Enter can fall into.
      if (resetTimer !== undefined) clearTimeout(resetTimer)
      resetTimer = setTimeout(() => {
        composing = false
        resetTimer = undefined
      }, COMPOSITION_END_GRACE_MS)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      const decision = decideKey({
        key: e.key,
        shiftKey: e.shiftKey,
        composing,
        isComposing: e.isComposing,
      })
      if (decision === 'ignore' && composing && !e.isComposing && e.key === 'Enter' && !e.shiftKey) {
        // Confirming Enter that arrived after compositionend: swallow it so the
        // textarea does not turn it into a stray newline. Shift+Enter is a
        // deliberate newline and is left alone.
        e.preventDefault()
      } else if (decision === 'commit') {
        e.preventDefault()
        commitEditor()
      } else if (decision === 'cancel') {
        e.preventDefault()
        cancelEditor()
      }
      // 'newline' and 'ignore' fall through to the textarea's default.
    }
    const onInput = (): void => {
      autosize(el)
    }
    const onBlur = (): void => {
      // Blur (click elsewhere, focus loss) commits, matching ZoomIt/Epic Pen.
      commitEditor()
    }

    el.addEventListener('compositionstart', onCompositionStart)
    el.addEventListener('compositionend', onCompositionEnd)
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('input', onInput)
    el.addEventListener('blur', onBlur)

    document.addEventListener('wheel', onWheel, { capture: true, passive: false })

    const dispose = (): void => {
      if (resetTimer !== undefined) clearTimeout(resetTimer)
      document.removeEventListener('wheel', onWheel, { capture: true })
      el.removeEventListener('compositionstart', onCompositionStart)
      el.removeEventListener('compositionend', onCompositionEnd)
      el.removeEventListener('keydown', onKeyDown)
      el.removeEventListener('input', onInput)
      el.removeEventListener('blur', onBlur)
    }

    document.body.appendChild(el)
    autosize(el)
    editor = { el, origin, style, dispose }
    // Focus on the next frame so the click that opened the editor does not
    // immediately blur-commit it.
    requestAnimationFrame(() => el.focus())
  }

  const tool: Tool = {
    onPointerDown(_ctx, point, style) {
      openEditor({ ...point }, { ...style })
    },

    onPointerMove() {
      // Placement is a single click; nothing to preview between down and up.
    },

    onPointerUp(): Stroke | null {
      // Async commit goes through `commitStroke`; the gesture itself returns
      // nothing.
      return null
    },
  }

  return { tool, cancelEditor }
}

/** Grow the textarea to fit its content on both axes (no scrollbars). */
function autosize(el: HTMLTextAreaElement): void {
  el.style.width = '0'
  el.style.height = '0'
  el.style.width = `${el.scrollWidth}px`
  el.style.height = `${el.scrollHeight}px`
}

/**
 * History-replay renderer. Reads the text/font extras back off the stroke and
 * paints each line at the baselines `lineBaselines` computes, so the painted
 * text lands exactly where the editor showed it.
 */
export function renderTextStroke(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const origin = stroke.points[0]
  if (!origin) return
  const text = (stroke.text as string | undefined) ?? ''
  const lines = splitLines(text)
  if (lines.length === 0) return
  const fontSize = (stroke.fontSize as number | undefined) ?? 24
  // Strokes saved before the style panel have no bold/italic; unknown family
  // keys (hand-edited history) fall back to the default stack.
  const fontFamily = normalizeFontFamily(stroke.fontFamily)
  const bold = stroke.bold === true
  const italic = stroke.italic === true

  ctx.save()
  ctx.font = canvasFont(fontSize, fontFamily, bold, italic)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = resolveStrokeColor(stroke.style.color)
  const baselines = lineBaselines(origin, fontSize, lines.length)
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], baselines[i].x, baselines[i].y)
  }
  ctx.restore()
}
