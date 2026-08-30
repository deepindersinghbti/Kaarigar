import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],

    /**
     * TEMPORARY - REMOVE BEFORE THE FINAL DEMO BUILD. See the tracking note in
     * README.md ("Temporary: otp-test.html is in the production build").
     *
     * otp-test.html is the Firebase phone-OTP harness. It is built and deployed
     * so the go/no-go can be run FROM THE DEPLOYED ORIGIN, which is the
     * confound section 6.4 wanted removed: localhost is authorised by default,
     * so a localhost-only test never exercises the real origin.
     *
     * WHAT IT COSTS WHILE IT IS THERE. The page is public and unauthenticated,
     * and pressing its button spends SMS quota on our Firebase billing. It is
     * rate-limited by Firebase rather than by us. Acceptable for a few days on
     * an unadvertised URL; not acceptable to leave in the build that ships to a
     * demo, which is why this is scheduled for removal rather than kept.
     *
     * Without this block Vite builds index.html only, and /otp-test.html on the
     * deploy falls through to the SPA - answering 200 with the React shell,
     * which is exactly the misleading-success shape this project keeps closing.
     */
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          'otp-test': path.resolve(__dirname, 'otp-test.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
