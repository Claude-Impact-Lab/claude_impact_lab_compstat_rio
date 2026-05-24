import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // Proxy /api → backend FastAPI (project/backend). Cobre tanto o crawler
    // quanto o ETL CompStat (/api/build/{run,stream,status,result}), que é
    // exposto via SSE. O proxy do Vite preserva text/event-stream e mantém
    // a conexão long-lived sem buffering.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
