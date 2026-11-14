/**
 * Pure, side-effect-free helpers for the text tool — no canvas, no DOM, no
 * Vue. Kept isolated so the IME commit/cancel decision, multi-line layout, and
 * coordinate math can be unit-tested without a browser. The `.vue` editor and
 * the tool factory call into these; the live DOM/canvas wiring stays thin.
 */
import type { Point, Stroke, StrokeStyle } from '@openpen/module-api'

/**
 * Supported font-family presets, in the order the panel lists them. `sans`,
 * `serif` and `mono` are the generic presets saved by earlier versions and
 * must stay valid; the rest are common system fonts, each with a per-platform
 * fallback chain so a font missing on one OS degrades to a similar one.
 */
export const FONT_FAMILY_KEYS = [
  'sans',
  'serif',
  'mono',
  'arial',
  'verdana',
  'times',
  'courier',
  'kai',
  'handwriting',
] as const

export type FontFamilyKey = (typeof FONT_FAMILY_KEYS)[number]

export const FONT_SIZE_MIN = 8
export const FONT_SIZE_MAX = 96
export const FONT_SIZE_DEFAULT = 24
export const FONT_FAMILY_DEFAULT: FontFamilyKey = 'sans'
/** Pixels one wheel notch changes the font size. */
export const FONT_SIZE_STEP = 2

/** Resolved settings the text tool reads at placement time. */
export interface TextSettings {
  fontSize: number
  fontFamily: FontFamilyKey
  bold: boolean
  italic: boolean
}

/** CSS font stacks for each preset. Shared by the DOM editor and `fillText`. */
export const FONT_STACKS: Record<FontFamilyKey, string> = {
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: '"SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
  arial: 'Arial, Helvetica, "Liberation Sans", sans-serif',
  verdana: 'Verdana, Geneva, "DejaVu Sans", sans-serif',
  times: '"Times New Roman", Times, "Liberation Serif", serif',
  courier: '"Courier New", Courier, "Liberation Mono", monospace',
  kai: '"Kaiti TC", "Kaiti SC", "BiauKai", KaiTi, "DFKai-SB", "Noto Serif CJK TC", serif',
  handwriting: '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", cursive',
}

/** Round to an integer and clamp into 8..96; non-numeric input falls back to the default. */
export function clampFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return FONT_SIZE_DEFAULT
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)))
}

/**
 * Font size after one wheel event: scrolling up (negative deltaY) grows the
 * text, scrolling down shrinks it, always clamped to the allowed range. A zero
 * delta leaves the size unchanged.
 */
export function nextFontSize(current: number, deltaY: number): number {
  const base = clampFontSize(current)
  if (deltaY === 0) return base
  return clampFontSize(base + (deltaY < 0 ? FONT_SIZE_STEP : -FONT_SIZE_STEP))
}

/** A saved family key if it is a known preset, otherwise the default. */
export function normalizeFontFamily(value: unknown): FontFamilyKey {
  return (FONT_FAMILY_KEYS as readonly unknown[]).includes(value)
    ? (value as FontFamilyKey)
    : FONT_FAMILY_DEFAULT
}

/**
 * Turn whatever was saved (possibly from an older version, possibly out of
 * range) into settings the tool can use. The settings schema is deliberately
 * loose so a bad saved value is repaired here instead of failing validation
 * and discarding the whole object.
 */
export function normalizeTextSettings(raw: Partial<Record<keyof TextSettings, unknown>>): TextSettings {
  return {
    fontSize: clampFontSize(raw.fontSize),
    fontFamily: normalizeFontFamily(raw.fontFamily),
    bold: raw.bold === true,
    italic: raw.italic === true,
  }
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

/**
 * Build the CSS `font` shorthand for a text stroke. Used for both the canvas
 * and the DOM editor so what is typed and what is painted use one string.
 */
export function canvasFont(fontSize: number, family: FontFamilyKey, bold = false, italic = false): string {
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${FONT_STACKS[family]}`
}

/**
 * Extra-state payload a text stroke carries beyond the base `Stroke` fields, so
 * `renderStroke` can repaint it on history replay without re-reading settings.
 */
export interface TextStrokeExtra {
  text: string
  fontSize: number
  fontFamily: FontFamilyKey
  bold: boolean
  italic: boolean
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
    bold: settings.bold,
    italic: settings.italic,
  }
}
