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
  shouldCommit,
  splitLines,
  type FontFamilyKey,
  type TextSettings,
} from './text-logic'

export interface TextToolOptions {
  /** Current font size at placement time. */
  fontSize: () => number
  /** Current font family at placement time. */
  fontFamily: () => FontFamilyKey
  /** i18n placeholder shown in the empty editor. */
  placeholder: () => string
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
    return { fontSize: opts.fontSize(), fontFamily: opts.fontFamily() }
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
      font: `${set.fontSize}px ${FONT_STACKS[set.fontFamily]}`,
      lineHeight: `${set.fontSize * LINE_HEIGHT_RATIO}px`,
      caretColor: resolveStrokeColor(style.color),
      minWidth: '1ch',
    } satisfies Partial<CSSStyleDeclaration>)

    let composing = false

    const onCompositionStart = (): void => {
      composing = true
    }
    const onCompositionEnd = (): void => {
      // Safari fires compositionend AFTER the confirming keydown; defer the
      // flag reset a tick so that keydown still sees composing === true.
      setTimeout(() => {
        composing = false
      }, 0)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      const decision = decideKey({
        key: e.key,
        shiftKey: e.shiftKey,
        composing,
        isComposing: e.isComposing,
      })
      if (decision === 'commit') {
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

    const dispose = (): void => {
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
  const fontFamily = (stroke.fontFamily as FontFamilyKey | undefined) ?? 'sans'

  ctx.save()
  ctx.font = canvasFont(fontSize, fontFamily)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = resolveStrokeColor(stroke.style.color)
  const baselines = lineBaselines(origin, fontSize, lines.length)
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], baselines[i].x, baselines[i].y)
  }
  ctx.restore()
}
