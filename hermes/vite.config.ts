import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// the Hermes dashboard runs on the library's source, like the playground
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  preview: { port: 5174 },
  // the Android app's WebView can be older than a desktop browser
  build: { target: ['es2020', 'chrome80'] },
  resolve: {
    alias: { 'robot-heads': fileURLToPath(new URL('../src/index.ts', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
})
