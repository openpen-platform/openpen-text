/**
 * The host's current pen style (colour and width) as this window's canvas sees it.
 *
 * A manual click takes its style from the canvas's own style mirror, which
 * follows two sources: `stroke-style-changed` on this window's event bus
 * (seeded from settings at boot) and the cross-window style broadcast (the
 * control-bar colour picker lives in another window). `useStrokeStyle()` only
 * follows the first, so in the overlay it misses picker changes. This mirror
 * follows both, so text an agent places gets the colour manual text would get
 * at that moment.
 */
import { on, useStrokeStyle } from '@openpen/module-api/host'
import type { StrokeColor } from '@openpen/module-api'

let latestColor: StrokeColor | null = null
let latestWidth: number | null = null

function accept(style: { color?: unknown; lineWidth?: unknown } | null | undefined): void {
  const color = style?.color
  if (typeof color === 'string' || (typeof color === 'object' && color !== null)) {
    latestColor = color as StrokeColor
  }
  const width = style?.lineWidth
  if (typeof width === 'number' && Number.isFinite(width)) {
    // Same clamp the canvas mirror applies.
    latestWidth = Math.max(1, Math.min(20, Math.round(width)))
  }
}

/** Start following the pen style; returns the unsubscribe function. */
export function trackPenStyle(): () => void {
  latestColor = null
  latestWidth = null
  const offBus = on('stroke-style-changed', (payload) => {
    accept(payload as { color?: unknown; lineWidth?: unknown } | null)
  })
  // Not every window has the preload bridge (unit tests run without one).
  const api = typeof window === 'undefined' ? undefined : window.openPenApi
  const offIpc = api?.onStrokeStyleChanged?.((style) => accept(style))
  return () => {
    offBus()
    offIpc?.()
  }
}

/** The current pen colour: the last one seen, else the host's initial value. */
export function currentPenColor(): StrokeColor {
  return latestColor ?? useStrokeStyle().color.value
}

/** The current pen width: the last one seen, else the host's initial value. */
export function currentPenWidth(): number {
  return latestWidth ?? useStrokeStyle().lineWidth.value
}
