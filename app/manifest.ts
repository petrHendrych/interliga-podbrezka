import type { MetadataRoute } from 'next';

// A single, non-localized manifest: the app name is a proper noun and Android freezes these
// values into the WebAPK at install time, so per-locale variants would only be visible to
// whoever installed first. `start_url` carries no locale on purpose -- the proxy resolves it
// from the `next-locale` cookie, so the installed app follows the user's chosen language.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Interliga Podbrezová',
    short_name: 'Interliga',
    description: 'Systém pre účtovanie pokút pre A tím.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    lang: 'sk',
    dir: 'ltr',
    background_color: '#020618',
    theme_color: '#020618',
    prefer_related_applications: false,
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-maskable-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
