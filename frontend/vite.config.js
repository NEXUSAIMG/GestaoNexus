import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Em dev, o frontend chama /api/... e o Vite redireciona para o backend
    // que está rodando em localhost:3001. Em produção o backend serve os
    // arquivos do build e responde /api diretamente.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
