import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: false,
    watch: {
      ignored: ['**/*.zip', '**/.zip']
    }
  },
  build: {
    target: 'esnext'
  }
});
