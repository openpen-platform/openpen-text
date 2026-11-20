/**
 * MCP tool `draw` (listed to agents as `openpen.text__draw`): places one text
 * annotation with its top-left corner at a point given in screenshot pixels.
 *
 * The stroke is built by `buildTextStroke`, the same function the text tool's
 * editor commits through, from the host's current pen style and the user's
 * text settings, so text an agent places looks like text the user would type
 * there at that moment. Each optional parameter overrides one of those
 * settings for this text only. The stroke keeps the `text` tool id, so it is
 * painted by `renderTextStroke` and `openpen__list_annotations` lists this
 * plugin as its source.
 */
import { defineMcpTool, InvalidParamsError, z } from '@openpen/module-api'
import type { StrokeColor, StrokeStyle } from '@openpen/module-api'
import { commitStroke } from '@openpen/module-api/host'
import {
  buildTextStroke,
  FONT_FAMILY_KEYS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  shouldCommit,
  type FontFamilyKey,
  type TextSettings,
} from './text-logic'

export interface TextDrawToolOptions {
  /** The user's text settings at draw time. */
  settings: () => TextSettings
  /** The host's current pen colour at draw time. */
  penColor: () => StrokeColor
  /** The host's current pen width at draw time (carried on the stroke like a manual one). */
  penWidth: () => number
}

const inputSchema = z.object({
  x: z
    .number()
    .min(0)
    .describe('Left edge of the text in screenshot pixels of the display, from the left edge.'),
  y: z
    .number()
    .min(0)
    .describe('Top edge of the first line in screenshot pixels of the display, from the top edge.'),
  text: z
    .string()
    .min(1)
    .describe('The text to show. "\\n" starts a new line; lines are left-aligned and never wrap on their own.'),
  color: z
    .string()
    .optional()
    .describe('CSS colour such as "#ff3b30" or "red". Defaults to the current pen colour.'),
  fontSize: z
    .number()
    .int()
    .min(FONT_SIZE_MIN)
    .max(FONT_SIZE_MAX)
    .optional()
    .describe(
      `Font size, ${FONT_SIZE_MIN} to ${FONT_SIZE_MAX}, the same scale as the Text tool's size slider (not screenshot pixels). Defaults to the user's text size.`,
    ),
  fontFamily: z
    .enum(FONT_FAMILY_KEYS as unknown as [FontFamilyKey, ...FontFamilyKey[]])
    .optional()
    .describe("Font preset. Defaults to the user's font."),
  bold: z.boolean().optional().describe("true for bold. Defaults to the user's choice."),
  italic: z.boolean().optional().describe("true for italic. Defaults to the user's choice."),
})

const DESCRIPTION =
  'Places one text annotation on the screen, with the top-left corner of its first line at the given point. ' +
  'Suits labelling a button, a value or a region, or writing a short note next to something on screen. ' +
  'Text is drawn without a background box or border and does not wrap: long text runs off to the right, so break it into lines with "\\n". It cannot be edited after it is placed. ' +
  'The text stays until the user or another call removes it, and undo removes it like typed text. ' +
  'Coordinates are pixels of the display screenshot, origin at its top-left corner. ' +
  'Colour, size, font, bold and italic default to what the user set for the Text tool and the current pen colour; each optional parameter overrides one of them for this text only. ' +
  'The result is the new annotation id.'

function isCssColor(value: string): boolean {
  // The overlay has CSS; outside a browser (unit tests) the canvas would never see it.
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return value.trim() !== ''
  return CSS.supports('color', value)
}

export function createTextDrawTool(opts: TextDrawToolOptions) {
  return defineMcpTool({
    name: 'draw',
    title: 'mcp.drawTitle',
    description: DESCRIPTION,
    inputSchema,
    annotations: { readOnly: false, destructive: false, idempotent: false, openWorld: false },
    handler(args, ctx) {
      if (!shouldCommit(args.text)) {
        throw new InvalidParamsError(
          'text is blank (only spaces or line breaks), so there is nothing to place.',
          'Resend with text that has at least one visible character.',
        )
      }
      if (args.color !== undefined && !isCssColor(args.color)) {
        throw new InvalidParamsError(
          `color "${args.color}" is not a CSS colour.`,
          'Resend with a colour such as "#ff3b30", "rgb(255,59,48)" or "red", or omit color to use the current pen colour.',
        )
      }
      const origin = ctx.toCanvas({ x: args.x, y: args.y })
      // Same style object the canvas hands the text tool on a manual click.
      const style: StrokeStyle = {
        color: args.color ?? opts.penColor(),
        lineWidth: opts.penWidth(),
        lineCap: 'round',
        lineJoin: 'round',
      }
      const user = opts.settings()
      const settings: TextSettings = {
        fontSize: args.fontSize ?? user.fontSize,
        fontFamily: args.fontFamily ?? user.fontFamily,
        bold: args.bold ?? user.bold,
        italic: args.italic ?? user.italic,
      }
      const stroke = buildTextStroke(origin, args.text, settings, style, () => crypto.randomUUID())
      commitStroke(stroke)
      return { id: stroke.id, displayId: ctx.displayId }
    },
  })
}

/** Usage guide returned by `openpen__get_guide({ plugin: '@openpen/text' })`. */
export const TEXT_MCP_GUIDE = [
  'The text plugin places text with the same look as the Text tool in the control bar.',
  '',
  'One call to draw places one block of text. Take a screenshot first and pick the point for the top-left corner of the first line. To label something without covering it, put the text just beside or below it, and keep each line short; use "\\n" for more lines.',
  '',
  'Leave the style parameters out to match the text the user types by hand; set color, fontSize or bold only when the text must stand out from the background or from other annotations. fontSize uses the Text tool\'s own scale, not screenshot pixels, so check the size on the next screenshot.',
  '',
  'Each text is an annotation like any other: openpen__list_annotations lists it with kind "text" and source "@openpen/text", its bounds being the top-left point, openpen__delete_annotation removes it by the id draw returned, and undo removes the last one.',
].join('\n')
