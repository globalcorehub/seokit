// LocalAI Service Worker - 100% Offline & Air-Gapped Cache
const CACHE_NAME = 'localai-offline-v8';
const STATIC_ASSETS = [
  "/",
  "/manifest.json",
  "/og-image.svg",
  "/whisper-speech-to-text",
  "/ai-background-remover",
  "/in-browser-ocr-scanner",
  "/private-pdf-summarizer",
  "/offline-code-regex-explainer",
  "/local-document-vector-search",
  "/zh",
  "/zh/",
  "/zh/whisper-speech-to-text",
  "/zh/ai-background-remover",
  "/zh/in-browser-ocr-scanner",
  "/zh/private-pdf-summarizer",
  "/zh/offline-code-regex-explainer",
  "/zh/local-document-vector-search",
  "/ja",
  "/ja/",
  "/ja/whisper-speech-to-text",
  "/ja/ai-background-remover",
  "/ja/in-browser-ocr-scanner",
  "/ja/private-pdf-summarizer",
  "/ja/offline-code-regex-explainer",
  "/ja/local-document-vector-search",
  "/de",
  "/de/",
  "/de/whisper-speech-to-text",
  "/de/ai-background-remover",
  "/de/in-browser-ocr-scanner",
  "/de/private-pdf-summarizer",
  "/de/offline-code-regex-explainer",
  "/de/local-document-vector-search",
  "/es",
  "/es/",
  "/es/whisper-speech-to-text",
  "/es/ai-background-remover",
  "/es/in-browser-ocr-scanner",
  "/es/private-pdf-summarizer",
  "/es/offline-code-regex-explainer",
  "/es/local-document-vector-search",
  "/fr",
  "/fr/",
  "/fr/whisper-speech-to-text",
  "/fr/ai-background-remover",
  "/fr/in-browser-ocr-scanner",
  "/fr/private-pdf-summarizer",
  "/fr/offline-code-regex-explainer",
  "/fr/local-document-vector-search",
  "/pt",
  "/pt/",
  "/pt/whisper-speech-to-text",
  "/pt/ai-background-remover",
  "/pt/in-browser-ocr-scanner",
  "/pt/private-pdf-summarizer",
  "/pt/offline-code-regex-explainer",
  "/pt/local-document-vector-search",
  "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js",
  "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/ort-wasm-simd.wasm"
];

// 1. Install & Pre-cache critical routes with resilient allSettled and per-asset timeout covering body streaming
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.allSettled(
        STATIC_ASSETS.map(async url => {
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          const timer = controller ? setTimeout(() => {
            try { controller.abort(); } catch(e) {}
          }, 8000) : null;
          try {
            const fetchOpts = { cache: 'no-cache' };
            if (controller) fetchOpts.signal = controller.signal;
            const res = await fetch(url, fetchOpts);
            if (res && (res.status === 200 || res.type === 'opaque')) {
              await cache.put(url, res);
            }
          } catch(err) {
            console.warn('SW pre-cache skip for ' + url, err);
          } finally {
            if (timer) clearTimeout(timer);
          }
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate & Purge outdated caches (preserve transformers-cache and model caches)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k.startsWith('localai-offline-') && k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// 3. Hybrid Strategy:
// - Navigation/HTML: Network First (with immediate cache fallback)
// - Assets/Scripts: Cache First (with network fallback)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const isHtml = event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html');

  if (isHtml) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        let cached = await cache.match(event.request);
        if (cached) return cached;
        const url = new URL(event.request.url);
        let p = url.pathname;
        if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
        cached = await cache.match(p);
        if (cached) return cached;
        if (!p.endsWith('/')) {
          cached = await cache.match(p + '/');
          if (cached) return cached;
        }
        return (await cache.match('/')) || Response.error();
      })
    );
    return;
  }

  // Precise query normalization strictly for allowed runtime modules with retry param
  let lookupTarget = event.request;
  try {
    const reqUrl = new URL(event.request.url);
    if (
      reqUrl.origin === 'https://cdn.jsdelivr.net' &&
      reqUrl.pathname === '/npm/@xenova/transformers@2.17.2/dist/transformers.min.js' &&
      reqUrl.searchParams.has('retry')
    ) {
      const cleanUrl = new URL(event.request.url);
      cleanUrl.searchParams.delete('retry');
      lookupTarget = cleanUrl.toString();
    }
  } catch(e) {}

  event.respondWith(
    caches.match(lookupTarget).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
