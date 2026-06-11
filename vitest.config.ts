import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    environmentMatchGlobs: [
      ['tests/text-tool.test.ts', 'jsdom'],
      ['tests/render.test.ts', 'jsdom'],
    ],
  },
})
