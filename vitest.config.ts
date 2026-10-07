import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Разметку в проверках пишем как в коде: без этого `.tsx` не разбирается.
  plugins: [react()],
  resolve: {
    alias: {
      // Тот же псевдоним, что у самого приложения: иначе проверки разметки
      // не находят ни одного её собственного модуля.
      '@': fileURLToPath(new URL('./apps/web/src', import.meta.url)),
    },
  },
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/*/src/**/*.test.ts',
      // Разметку проверяем отдельными файлами: среда браузера включается
      // в них построчным указанием, а не для всего набора.
      'apps/*/src/**/*.test.tsx',
    ],
  },
})
