// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Set SITE_URL at build time to the production origin (used for canonical URLs,
// OG tags and the sitemap). Falls back to a placeholder for local builds.
const site = process.env.SITE_URL ?? 'https://raid-calculator.example';

const noExternalForCompat = [/^@radix-ui\//, 'react', 'react-dom', 'react/jsx-runtime'];

export default defineConfig({
  site,
  output: 'static',
  // Preact with React compat: same React code, ~55 KB less JS (see README).
  integrations: [preact({ compat: true }), sitemap()],
  vite: {
    plugins: [
      tailwindcss(),
      {
        // Bundle Radix (and React entry points) into SSR/prerender so their `react`
        // imports resolve to preact/compat instead of the real React package.
        name: 'preact-compat-noexternal',
        configEnvironment(name) {
          if (name === 'ssr' || name === 'prerender') {
            return { resolve: { noExternal: noExternalForCompat } };
          }
          return undefined;
        },
      },
    ],
  },
});
