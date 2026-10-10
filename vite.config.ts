import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  // Keep the explicitly selected checkout path on Windows (including managed workspaces).
  resolve: { preserveSymlinks: true },
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
