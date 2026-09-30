/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Content-Security-Policy for the built site: scripts only from the site
 * itself, and network requests only to GitHub (API + artifact storage) and
 * the login helper. Limits what injected code could do with a stored token.
 * Not applied in dev, where Vite needs inline scripts and websockets.
 */
function contentSecurityPolicy(helperUrl: string | undefined): Plugin {
  const helperOrigin = helperUrl ? new URL(helperUrl).origin : '';
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://avatars.githubusercontent.com",
    `connect-src 'self' https://api.github.com https://raw.githubusercontent.com https://*.blob.core.windows.net https://*.actions.githubusercontent.com ${helperOrigin}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: (html) =>
      html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    // Relative base so the build works under https://<user>.github.io/zmk-editor/.
    base: './',
    plugins: [react(), contentSecurityPolicy(env.VITE_AUTH_HELPER_URL)],
    build: {
      rolldownOptions: {
        output: {
          // Libraries and the big catalogues change less often than the app: separate files
          // cache across releases, and no single file is huge.
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
              { name: 'vendor', test: /node_modules[\\/]/ },
              { name: 'catalogs', test: /src[\\/]core[\\/]catalog[\\/][^\\/]+\.data\.ts$/ },
            ],
          },
        },
      },
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}', 'test/**/*.test.ts', 'worker/src/**/*.test.ts'],
    },
  };
});
