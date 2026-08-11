import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          output: fileURLToPath(new URL('src/renderer/output.html', import.meta.url)),
          control: fileURLToPath(new URL('src/renderer/control.html', import.meta.url))
        }
      }
    }
  }
})
