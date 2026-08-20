import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import Terminal from 'vite-plugin-terminal';

// This app is the Blade rewrite of `public/onboarding.html`. It talks to the
// same Express server (src/http/app.ts, port 4000) for every API call
// (`/v1/merchant_onboarding/*`) and for uploaded logo previews (`/uploads/*`).
// In dev, Vite runs on its own port (5173) so those requests are proxied
// through to :4000 instead of hardcoding absolute URLs in the app code.
//
// Production output is not consumed from `dist/` directly — see
// `scripts/publish.mjs`, which copies the build into `../public/` so the
// same Express server can keep serving it at `/onboarding.html`.
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // Dev-only: injects a virtual-module script tag that Rollup can't
    // resolve during `vite build`, so it's excluded from production builds.
    ...(command === 'serve'
      ? [
          Terminal({
            output: ['terminal', 'console'],
            console: 'terminal',
          }),
        ]
      : []),
  ],
  build: {
    // Kept out of `public/`'s existing top-level names so the publish
    // script can drop these in without clobbering anything already in
    // `public/` (uploads/, logos/, brand-kit-preview/, etc).
    assetsDir: 'onboarding-assets',
  },
  server: {
    proxy: {
      '/v1': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
}));
