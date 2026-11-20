import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    environmentMatchGlobs: [
      ['tests/text-tool.test.ts', 'jsdom'],
      ['tests/render.test.ts', 'jsdom'],
      ['tests/text-style.test.ts', 'jsdom'],
      ['tests/panel-a11y.test.ts', 'jsdom'],
      ['tests/mcp-draw-tool.test.ts', 'jsdom'],
    ],
  },
})
