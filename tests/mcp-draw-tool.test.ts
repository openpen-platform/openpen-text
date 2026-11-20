import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Stroke, StrokeStyle } from '@openpen/module-api'
import { callMcpTool } from '@openpen/module-api/testing'

const PEN_COLOR = '#123456'
const PEN_WIDTH = 7
const commitStroke = vi.fn()

vi.mock('@openpen/module-api/host', () => ({
  commitStroke: (stroke: Stroke) => commitStroke(stroke),
  emit: vi.fn(),
  on: vi.fn(() => () => {}),
  useStrokeStyle: () => ({ color: { value: PEN_COLOR }, lineWidth: { value: PEN_WIDTH } }),
}))

const { default: textModule } = await import('../src/index')

const drawTool = () => {
  const tool = textModule.contributes.mcpTools?.find((t) => t.name === 'draw')
  if (!tool) throw new Error('text module contributes no draw MCP tool')
  return tool
}

/** Screenshot pixels → canvas points on a 2x display with a 50 px menu bar. */
const toCanvas = (p: { x: number; y: number }) => ({ x: p.x / 2, y: (p.y - 50) / 2 })

beforeEach(() => {
  commitStroke.mockClear()
  document.body.innerHTML = ''
})

describe('MCP draw tool — AC #1: places the given text at a screenshot position', () => {
  it('commits the same text stroke a manual click-and-type at the converted point makes', async () => {
    const result = await callMcpTool(drawTool(), { x: 300, y: 450, text: 'Look here\nsecond line' }, { toCanvas })

    expect(result.isError).toBeUndefined()
    expect(commitStroke).toHaveBeenCalledTimes(1)
    const drawn = commitStroke.mock.calls[0][0] as Stroke
    expect(drawn.points).toEqual([{ x: 150, y: 200 }])
    expect(drawn.text).toBe('Look here\nsecond line')
    expect(result.structuredContent).toMatchObject({ id: drawn.id })

    // Manual placement with the host's current pen style at the same canvas point.
    const manualTool = textModule.contributes.tools![0]
    const hostStyle: StrokeStyle = { color: PEN_COLOR, lineWidth: PEN_WIDTH, lineCap: 'round', lineJoin: 'round' }
    manualTool.onPointerDown!({} as CanvasRenderingContext2D, { x: 150, y: 200 }, hostStyle)
    const editor = document.querySelector<HTMLTextAreaElement>('[data-openpen-text-editor]')!
    editor.value = 'Look here\nsecond line'
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(commitStroke).toHaveBeenCalledTimes(2)
    const manual = commitStroke.mock.calls[1][0] as Stroke
    expect({ ...drawn, id: 'x' }).toEqual({ ...manual, id: 'x' })
  })

  it('rejects blank text and commits nothing', async () => {
    const result = await callMcpTool(drawTool(), { x: 300, y: 450, text: '  \n ' }, { toCanvas })

    expect(result.isError).toBe(true)
    expect(result.errorKind).toBe('invalid_params')
    expect(commitStroke).not.toHaveBeenCalled()
  })
})

describe('MCP draw tool — AC #3: listed annotations name the text plugin as the source', () => {
  it('places the text with the text canvas tool id, which the host maps to @openpen/text', async () => {
    await callMcpTool(drawTool(), { x: 0, y: 50, text: 'Hi' }, { toCanvas })

    const drawn = commitStroke.mock.calls[0][0] as Stroke
    // The host lists a stroke's source as the module that contributes the
    // canvas tool whose id equals `stroke.tool`.
    const ownTool = textModule.contributes.tools!.find((t) => t.id === drawn.tool)
    expect(ownTool).toBeDefined()
    expect(textModule.id).toBe('@openpen/text')
  })
})
