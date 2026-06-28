import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3043, proxy: { '/api': 'http://localhost:3042' } },
  build: { outDir: '../backend/public', emptyOutDir: true }
})
