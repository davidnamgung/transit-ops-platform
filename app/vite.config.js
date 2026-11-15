import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' lets the built site work from any folder (GitHub Pages, Cloudflare Pages, ...).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { target: 'es2022' },
});
