import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Fixed port: anonymous sign-in and saved projects are tied to this address
  server: { port: 5173, strictPort: true },
})
