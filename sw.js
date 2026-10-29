const CACHE = 'cijian-browser-v12-word-families';
const SHELL = [
  '/',
  '/index.html',
  '/app.mjs',
  '/navigation.mjs',
  '/aux-pronunciation.mjs',
  '/english-definitions.mjs',
  '/wordbooks/english-definitions.json?v=20261028-1',
  '/engine.mjs',
  '/pasture-economy.mjs',
  '/style.css',
  '/practice-layout.css',
  '/practice-layout.mjs',
  '/herd.mjs',
  '/herd-view.mjs',
  '/pasture.css',
  '/pronunciation-view.mjs',
  '/pronunciation-data.mjs',
  '/family-selection.mjs',
  '/family-data.mjs',
  '/wordbooks/families.json?v=20261029-1',
  '/verb-forms.mjs',
  '/runtime-config.mjs',
  '/web-services.mjs',
  '/browser-storage.mjs',
  '/bin-parser.mjs',
  '/wordbooks.mjs',
  '/wordbooks.css',
  '/icon.svg',
  '/manifest.webmanifest',
  '/wordbooks/catalog.json',
  '/wordbooks/ielts-core.json?v=ab22ad3',
];
self.addEventListener('install', (e) =>
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (
    e.request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  const book =
    url.pathname.startsWith('/wordbooks/') &&
    url.pathname.endsWith('.json') &&
    !url.pathname.endsWith('catalog.json');
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      if (book) {
        const old = await c.match(e.request);
        if (old) return old;
      }
      try {
        const r = await fetch(e.request, { cache: 'no-cache' });
        if (r.ok) await c.put(e.request, r.clone());
        return r;
      } catch {
        const old =
          (await c.match(e.request)) ||
          (url.pathname === '/' || url.pathname.endsWith('.html')
            ? await c.match('/index.html')
            : null);
        if (old) return old;
        throw Error('离线资源尚未缓存');
      }
    })(),
  );
});
