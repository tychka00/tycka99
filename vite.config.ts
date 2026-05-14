import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/tycka99/',
  server: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
});
