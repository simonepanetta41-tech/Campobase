const CACHE = 'campobase-v126';

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
 * Il testo arriva dentro la notifica, cifrato dal Worker.
 *
 * All'inizio la notifica partiva vuota e questo service worker tornava a
 * chiedere cosa dire: nessuna cifratura da sbagliare. Ma Safari una
 * notifica senza contenuto non la consegna in modo affidabile — ed e'
 * esattamente cosi' che la prima prova su iPhone non e' mai arrivata.
 * Quella strada resta come riserva, per un'iscrizione fatta prima che ci
 * fosse la cifratura.
 *
 * Mostrare qualcosa e' obbligatorio: un push ricevuto e non mostrato, su
 * iOS, dopo poche volte fa togliere il permesso. Quindi se anche la
 * riserva non va — rete assente, Worker giu' — si mostra comunque una
 * riga generica: meglio una riga vaga che perdere le notifiche.
 */
const GENERICA = 'C\'è un aggiornamento';

/* Il titolo e' la prima riga, il resto va sotto.
 *
 * iOS stampa da solo il nome dell'app sopra la notifica. Mettere
 * "Campobase" anche come titolo voleva dire leggere "Campobase from
 * Campobase" e perdere una riga su due di quelle che si vedono a schermo
 * bloccato. Il titolo e' quindi la cosa da sapere — "Stefano e' li' fra 10
 * minuti per il pick up!" — e la seconda riga il dettaglio. */
async function mostra(testo) {
  const righe = String(testo).split('\n');
  await self.registration.showNotification(righe[0], {
    body: righe.slice(1).join('\n'),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Niente raggruppamento: due notifiche nello stesso minuto — la posta
    // e il catering — sono due cose diverse e si devono leggere entrambe.
    tag: 'campobase-' + Date.now(),
    data: { apri: '/' }
  });
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let testo = null;
    // Di solito il testo e' dentro la notifica, cifrato: si legge e basta.
    try { testo = (e.data && e.data.json() || {}).testo || null; } catch (_) {}
    if (testo) { await mostra(testo); return; }
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
    await mostra(testo || GENERICA);
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
