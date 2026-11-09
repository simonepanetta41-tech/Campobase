const CACHE = 'campobase-v55';

// Dipendenze che devono esserci offline.
// pdf.js serve a leggere le sceneggiature, jsPDF a esportare: senza queste
// l'app si apre ma le due funzioni principali non vanno.
const STATIC = [
  '/',
  '/index.html',
  '/manifest.json',
  '/installa.html',
  '/qr.js',
  'https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
];

// ── INSTALL ──────────────────────────────────────────────────────────────────
// Scarica tutto STATIC una risorsa per volta invece di addAll: con addAll un
// singolo 404 fa fallire l'installazione intera e l'app resta senza offline.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(
        STATIC.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch(err => console.warn('[SW] precache saltato:', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  // Solo GET: le POST verso Supabase o /api/ devono passare intatte.
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Mai in cache: devono sempre passare dalla rete.
  if (url.pathname.startsWith('/api/') ||
      url.hostname.includes('supabase') ||
      url.hostname.includes('anthropic') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }

  // HTML: network-first, cache solo come riserva.
  // Cosi' una build nuova arriva sempre quando c'e' rete e non si resta
  // bloccati su una versione vecchia.
  //
  // Ogni pagina si salva sotto il proprio indirizzo. Prima finivano tutte
  // sotto /index.html: bastava aprire /installa.html una volta perche' la
  // copia offline dell'app diventasse la pagina di installazione, e senza
  // rete si apriva quella al posto del lavoro.
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    const chiave = url.pathname === '/' ? '/index.html' : url.pathname;
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(cache => cache.put(chiave, copy));
          return r;
        })
        .catch(() => caches.match(chiave).then(c => c || caches.match('/index.html')))
    );
    return;
  }

  // Tutto il resto: cache-first.
  // Le risposte opache (status 0) dai CDN si accettano: i <script src> senza
  // attributo crossorigin arrivano in no-cors e con il controllo r.ok non
  // finirebbero mai in cache, lasciando pdf.js e jsPDF fuori dall'offline.
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(r => {
        if (r.ok || r.type === 'opaque') {
          const copy = r.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, copy));
        }
        return r;
      });
    })
  );
});
