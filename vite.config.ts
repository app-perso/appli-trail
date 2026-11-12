import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// L'appli est publiée sur https://app-perso.github.io/appli-trail/
// d'où le « base » : tous les fichiers sont servis sous /appli-trail/.
export default defineConfig({
  base: '/appli-trail/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['fonts/*.woff2', 'icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Appli Trail',
        short_name: 'Trail',
        description: "Suivi d'entraînement trail — saison 2027",
        lang: 'fr',
        start_url: '/appli-trail/',
        scope: '/appli-trail/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F7F4FA',
        theme_color: '#F7F4FA',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // Le moteur de lecture (lourd) n'est pas pré-chargé : il est mis en cache à la première utilisation
        globIgnores: ['tesseract/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/tesseract/'),
            handler: 'CacheFirst',
            options: { cacheName: 'tesseract', expiration: { maxEntries: 20 } },
          },
        ],
        navigateFallback: '/appli-trail/index.html',
      },
    }),
  ],
});
