const CACHE = 'campobase-v191';
// Quanto si aspetta la rete prima di aprire la pagina salvata (millisecondi).
const ATTESA_RETE = 3000;
// Le cache che restano da una versione all'altra: il biglietto della
// notifica toccata e i dati letti dal server (index.html, sbFetch).
const RESTANO = ['campobase-apri', 'campobase-dati'];

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

/* Safari non apre una pagina salvata che e' arrivata passando per un
   reindirizzamento ("Response served by service worker has redirections"),
   e /index.html il server lo reindirizza a /: la copia messa da parte
   all'installazione era proprio cosi', e senza rete l'app non partiva.
   Una risposta cosi' si riconfeziona: stesso contenuto, senza la traccia
   del giro che ha fatto. */
function pulita(r) {
  if (!r || !r.redirected) return r;
  return new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers });
}

// ── INSTALL ──────────────────────────────────────────────────────────────────
// Scarica tutto STATIC una risorsa per volta invece di addAll: con addAll un
// singolo 404 fa fallire l'installazione intera e l'app resta senza offline.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(
        STATIC.map(url =>
          fetch(new Request(url, { cache: 'reload' }))
            .then(r => { if (!r.ok && r.type !== 'opaque') throw new Error('risposta ' + r.status); return cache.put(url, pulita(r)); })
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
      Promise.all(keys.filter(k => k !== CACHE && !RESTANO.includes(k)).map(k => caches.delete(k)))
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
    /* La rete ha tre secondi. Sotto terra il campo non manca del tutto:
       va e viene, e una richiesta che non fallisce e non arriva teneva lo
       schermo bianco per un minuto. Passati tre secondi si apre la copia
       salvata; la risposta, se poi arriva, aggiorna la copia per la volta
       dopo. Senza copia salvata si continua ad aspettare la rete. */
    const rete = fetch(e.request).then(r => {
      if (r && r.ok) { const copy = pulita(r.clone()); caches.open(CACHE).then(cache => cache.put(chiave, copy)); }
      return r;
    });
    const riserva = () => caches.match(chiave).then(c => c || caches.match('/index.html')).then(pulita);
    e.respondWith(new Promise((ris, no) => {
      let fatto = false;
      const dai = r => { if (!fatto && r) { fatto = true; ris(r); } };
      const t = setTimeout(() => riserva().then(dai).catch(() => {}), ATTESA_RETE);
      rete.then(r => { clearTimeout(t); dai(r); },
                err => { clearTimeout(t); riserva().then(c => { if (c) dai(c); else if (!fatto) { fatto = true; no(err); } }).catch(() => no(err)); });
    }));
    if (e.waitUntil) e.waitUntil(rete.catch(() => {}));
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
async function mostra(testo, dove) {
  const righe = String(testo).split('\n');
  /* Dove porta, toccandola: il film da cui viene e la sezione. */
  const film = dove && dove.film || '', vai = dove && dove.vai || '';
  const apri = film ? '/?apri=' + encodeURIComponent(film) + (vai ? '&vai=' + encodeURIComponent(vai) : '') : '/';
  await self.registration.showNotification(righe[0], {
    body: righe.slice(1).join('\n'),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Niente raggruppamento: due notifiche nello stesso minuto — la posta
    // e il catering — sono due cose diverse e si devono leggere entrambe.
    tag: 'campobase-' + Date.now(),
    data: { apri, film, vai }
  });
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let testo = null, numero = null;
    // Di solito il testo e' dentro la notifica, cifrato: si legge e basta.
    // Con lui c'e' il numero dell'appuntamento, da rimandare come conferma.
    let dove = null;
    try { const d = e.data && e.data.json() || {}; testo = d.testo || null; numero = d.id || null;
          if (d.film) dove = { film: d.film, vai: d.vai || '' }; } catch (_) {}
    /* Il server va avvisato comunque, anche quando il testo c'e' gia':
       e' quella chiamata a segnare che questo telefono la notifica l'ha
       mostrata (push_iscrizioni.vista, push_appuntamenti.mostrato). Da
       quando il testo viaggia dentro la notifica non la faceva piu'
       nessuno, e "mostrato" restava vuoto per tutti: non c'era modo di
       distinguere chi l'aveva vista da chi no. Prima si mostra, poi si
       avvisa: se la rete manca, la notifica c'e' lo stesso. */
    const chiedi = async () => {
      const sub = await self.registration.pushManager.getSubscription();
      if (!sub) return null;
      const r = await fetch('/api/push/messaggio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(numero ? { endpoint: sub.endpoint, id: numero } : { endpoint: sub.endpoint })
      });
      return r.ok ? ((await r.json()).testo || null) : null;
    };
    if (testo) {
      await mostra(testo, dove);
      try { await chiedi(); } catch (_) {}
      return;
    }
    try { testo = await chiedi(); }
    catch (err) { console.warn('[SW] testo della notifica non recuperato:', err); }
    await mostra(testo || GENERICA);
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const d = e.notification.data || {};
    /* Tre strade per dire all'app dove andare, perche' nessuna da sola
       funziona dappertutto: un biglietto lasciato in memoria, che l'app
       legge appena torna davanti (su iPhone e' l'unica sicura); un
       messaggio alla finestra gia' aperta; l'indirizzo, se va aperta. */
    if (d.film) {
      try {
        const c = await caches.open('campobase-apri');
        await c.put('/apri', new Response(JSON.stringify({ film: d.film, vai: d.vai || '', quando: Date.now() })));
      } catch (_) {}
    }
    const aperte = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of aperte) if ('focus' in c) {
      if (d.film) { try { c.postMessage({ campobase: 'apri', film: d.film, vai: d.vai || '' }); } catch (_) {} }
      return c.focus();
    }
    return self.clients.openWindow(d.apri || '/');
  })());
});
