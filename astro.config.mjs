// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Set SITE_URL at build time to the production origin (used for canonical URLs,
// OG tags and the sitemap). Falls back to a placeholder for local builds.
const site = process.env.SITE_URL ?? 'https://raid-calculator.example';

export default defineConfig({
  site,
  output: 'static',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
