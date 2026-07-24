import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The workspace UI. Built to ui/dist and served statically by the preview
// server at /app — same origin as the API/WS, so no proxy or CORS needed.
export default defineConfig({
  plugins: [react()],
  base: '/app/',
  build: { outDir: 'dist', emptyOutDir: true },
});
