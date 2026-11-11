const CACHE = 'campobase-v76';

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

// ── NOTIFICHE ────────────────────────────────────────────────────────────────
/*
 * La notifica che arriva e' vuota: nessun testo dentro.
 *
 * Il testo in una notifica va cifrato per ogni destinatario — scambio di
 * chiavi, derivazione, AES — e sbagliare un passaggio vuol dire notifiche
 * che non arrivano senza che nessuno sappia perche'. Qui la notifica serve
 * solo a svegliare questo service worker, che poi chiede al Worker cosa
 * deve dire. Il testo si cambia senza toccare il telefono.
 *
 * Mostrare qualcosa e' obbligatorio: un push ricevuto e non mostrato, su
 * iOS, dopo poche volte fa togliere il permesso. Quindi se la richiesta
 * non va — rete assente, Worker giu' — si mostra comunque una riga
 * generica, e meglio una riga vaga che perdere le notifiche.
 */
const GENERICA = 'Campobase: c\'è un aggiornamento';

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let testo = null;
    try {
      const sub = await self.registration.pushManager.getSubscription();
      if (sub) {
        const r = await fetch('/api/push/messaggio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint })
        });
        if (r.ok) testo = (await r.json()).testo || null;
      }
    } catch (err) {
      console.warn('[SW] testo della notifica non recuperato:', err);
    }
    await self.registration.showNotification('Campobase', {
      body: testo || GENERICA,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      // Niente raggruppamento: due notifiche nello stesso minuto — la posta
      // e il catering — sono due cose diverse e si devono leggere entrambe.
      tag: 'campobase-' + Date.now(),
      data: { apri: '/' }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const aperte = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of aperte) if ('focus' in c) return c.focus();
    return self.clients.openWindow('/');
  })());
});
