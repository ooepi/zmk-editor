/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the build works under https://<user>.github.io/zmk-editor/.
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts'],
  },
});
