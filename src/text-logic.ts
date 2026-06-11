/**
 * Pure, side-effect-free helpers for the text tool — no canvas, no DOM, no
 * Vue. Kept isolated so the IME commit/cancel decision, multi-line layout, and
 * coordinate math can be unit-tested without a browser. The `.vue` editor and
 * the tool factory call into these; the live DOM/canvas wiring stays thin.
 */
import type { Point, Stroke, StrokeStyle } from '@openpen/module-api'

/** Supported font-family presets; the enum value maps to a CSS font stack. */
export type FontFamilyKey = 'sans' | 'serif' | 'mono'

/** Resolved settings the text tool reads at placement time. */
export interface TextSettings {
  fontSize: number
  fontFamily: FontFamilyKey
}

/** CSS font stacks for each preset. Shared by the DOM editor and `fillText`. */
export const FONT_STACKS: Record<FontFamilyKey, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
}

/** Line-height multiple applied to fontSize for multi-line vertical advance. */
export const LINE_HEIGHT_RATIO = 1.25

/**
 * The keydown decision for the inline editor under an IME-safe guard.
 *
 * `'commit'`  → finish editing, keep the text (Enter without Shift).
 * `'cancel'`  → discard the edit (Escape).
 * `'newline'` → insert a line break, keep editing (Shift+Enter).
 * `'ignore'`  → no special handling; let the keystroke fall through.
 *
 * When `composing` (or the event's own `isComposing`) is true the keystroke is
 * part of CJK/IME composition — Enter/Escape confirm or dismiss the candidate
 * window and MUST NOT be read as commit/cancel.
 */
export type KeyDecision = 'commit' | 'cancel' | 'newline' | 'ignore'

/** Minimal shape of the keydown signals this decision needs. */
export interface KeyState {
  key: string
  shiftKey: boolean
  /** Tool-tracked composition flag (compositionstart/end). */
  composing: boolean
  /** The event's own `isComposing` — true mid-composition in most engines. */
  isComposing: boolean
}

/**
 * IME-safe keydown decision. While composing, always `'ignore'` so the IME
 * owns Enter/Escape (otherwise CJK candidate confirmation commits the stroke).
 */
export function decideKey(state: KeyState): KeyDecision {
  if (state.composing || state.isComposing) return 'ignore'
  if (state.key === 'Enter') return state.shiftKey ? 'newline' : 'commit'
  if (state.key === 'Escape') return 'cancel'
  return 'ignore'
}

/**
 * Whether the editor's current value should produce a committed stroke.
 * Empty or whitespace-only content MUST be discarded (no blank text stroke).
 */
export function shouldCommit(value: string): boolean {
  return value.trim().length > 0
}

/**
 * Split editor text into the lines `renderStroke` draws. Trailing empty lines
 * are kept (the user may have pressed Shift+Enter intentionally); a fully empty
 * string yields `[]` so callers never paint an empty line.
 */
export function splitLines(value: string): string[] {
  if (value.length === 0) return []
  // Normalize CRLF / lone CR (pasted from Windows / legacy sources) so a
  // trailing \r never survives into a line and paints as a tofu glyph.
  return value.replace(/\r\n?/g, '\n').split('\n')
}

/**
 * Per-line baseline anchors for `ctx.fillText`, given the click point and font
 * size. The click point is the top-left of the text box (matching the DOM
 * editor's `left/top`); each baseline sits one ascent below its line top, so
 * the painted text lands where the editor showed it.
 *
 * `textBaseline` is assumed `'alphabetic'` (canvas default). The first line's
 * baseline is `origin.y + fontSize` (≈ ascent); subsequent lines advance by
 * `fontSize * LINE_HEIGHT_RATIO`.
 */
export function lineBaselines(origin: Point, fontSize: number, lineCount: number): Point[] {
  const advance = fontSize * LINE_HEIGHT_RATIO
  const baselines: Point[] = []
  for (let i = 0; i < lineCount; i++) {
    baselines.push({ x: origin.x, y: origin.y + fontSize + i * advance })
  }
  return baselines
}

/** Build the `CanvasRenderingContext2D.font` shorthand for a text stroke. */
export function canvasFont(fontSize: number, family: FontFamilyKey): string {
  return `${fontSize}px ${FONT_STACKS[family]}`
}

/**
 * Extra-state payload a text stroke carries beyond the base `Stroke` fields, so
 * `renderStroke` can repaint it on history replay without re-reading settings.
 */
export interface TextStrokeExtra {
  text: string
  fontSize: number
  fontFamily: FontFamilyKey
}

/**
 * Assemble a finished text `Stroke`. `points` holds a single anchor (the click
 * point); `style` carries the global stroke color so the painted glyphs match
 * the current pen color. The id generator is injected for testability.
 */
export function buildTextStroke(
  origin: Point,
  text: string,
  settings: TextSettings,
  style: StrokeStyle,
  newId: () => string,
): Stroke {
  return {
    id: newId(),
    tool: 'text',
    points: [{ ...origin }],
    style: { ...style },
    text,
    fontSize: settings.fontSize,
    fontFamily: settings.fontFamily,
  }
}
