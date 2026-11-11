/*
 * Campobase — Worker.
 *
 * Grazie a run_worker_first in wrangler.jsonc, questo codice gira solo per
 * /api/*. Tutto il resto lo serve direttamente il livello degli asset
 * statici, e i percorsi non trovati ricadono su index.html perche'
 * not_found_handling e' impostato su single-page-application: e' li' che si
 * configura l'SPA su Workers, non in _redirects. Un rewrite verso
 * /index.html in _redirects viene anzi rifiutato come loop infinito.
 */

import { json, readJson, requireUser, consumeQuota, callAnthropic, CORS } from './shared.js';
import { handleWrap } from './wrap.js';
import { riceviPosta } from './posta.js';
import { handleIscrivi, handleAppuntamenti, handleMessaggio, mandaScadute } from './push.js';

const FREE_LIMIT = 3;

/*
 * Spegne il ragionamento per le due rotte che producono JSON strutturato.
 *
 * Su questo PDL Haiku 5.5 aveva consumato 16.000 token su 16.000 in
 * ragionamento, senza scrivere una riga di risposta — e abbassare l'effort
 * a "low" non aveva cambiato nulla, come la documentazione stessa avverte.
 * L'interruttore vero e' il parametro thinking, ma i due modelli vogliono
 * valori diversi:
 *
 *   Haiku 5.5   -> { type: 'disabled' }       ('between_tools' da' 400)
 *   Sonnet 5.5  -> { type: 'between_tools' }  ('disabled' da' 400)
 *
 * In entrambi i casi serve un effort di 'high' o inferiore, altrimenti la
 * richiesta viene rifiutata: da qui il limite imposto sotto.
 */
function spegniRagionamento(model) {
  return String(model).startsWith('claude-sonnet-5-5')
    ? { type: 'between_tools' }
    : { type: 'disabled' };
}

// 'xhigh' e 'max' sono incompatibili con il ragionamento spento: si
// riportano a 'high' invece di far fallire la richiesta.
function effortCompatibile(richiesto) {
  const e = richiesto || 'low';
  return (e === 'xhigh' || e === 'max') ? 'high' : e;
}

// ── /api/analyze ─────────────────────────────────────────────────────────────
async function handleAnalyze(request, env, ctx) {
  const { user, error: authError } = await requireUser(request, env);
  if (authError) return authError;

  const { error: quotaError } = await consumeQuota(env, user.id, FREE_LIMIT);
  if (quotaError) return quotaError;

  const { body, error } = await readJson(request);
  if (error) return error;

  const modello = body.model || 'claude-sonnet-5-5';

  return callAnthropic(env, {
    model: modello,
    max_tokens: body.max_tokens || 16000,
    thinking: spegniRagionamento(modello),
    output_config: { effort: effortCompatibile(body.effort) },
    system: body.system,
    messages: body.messages
  }, ctx);
}

// ── /api/chat ────────────────────────────────────────────────────────────────
// Niente quota: la chat e' leggera e nell'originale non la consumava.
async function handleChat(request, env, ctx) {
  const { error: authError } = await requireUser(request, env);
  if (authError) return authError;

  const { body, error } = await readJson(request);
  if (error) return error;

  return callAnthropic(env, {
    model: body.model || 'claude-sonnet-5-5',
    max_tokens: body.max_tokens || 1024,
    system: body.system,
    messages: body.messages
  }, ctx);
}

// ── /api/pdl ─────────────────────────────────────────────────────────────────
// Modello fisso come nell'originale: il PDL e' estrazione strutturata,
// non serve lasciarlo scegliere al client.
async function handlePdl(request, env, ctx) {
  const { user, error: authError } = await requireUser(request, env);
  if (authError) return authError;

  const { error: quotaError } = await consumeQuota(env, user.id, FREE_LIMIT);
  if (quotaError) return quotaError;

  const { body, error } = await readJson(request);
  if (error) return error;

  return callAnthropic(env, {
    model: 'claude-haiku-5-5',
    max_tokens: body.max_tokens || 16000,
    thinking: spegniRagionamento('claude-haiku-5-5'),
    output_config: { effort: effortCompatibile(body.effort) },
    system: body.system,
    messages: body.messages
  }, ctx);
}

/* ── /api/mappa ───────────────────────────────────────────────────────────────
 *
 * Scioglie un link corto di Google Maps e ne restituisce le coordinate.
 *
 * Serve per il meteo. Prima il comune si indovinava dal testo dell'ordine
 * del giorno, e l'ordine del giorno scrive cose come "AMBIENTE: CASA
 * PAESE" — che e' un'intestazione di sceneggiatura, non un posto. Il
 * geocoder ci ha letto Paese, provincia di Treviso, e ha dato il meteo di
 * li' a una troupe che girava in Puglia. Un meteo sbagliato e' peggio di
 * nessun meteo: chi lo legge ci decide se portarsi la cerata.
 *
 * Il link invece la produzione lo mette apposta e punta al posto vero.
 * Scioglierlo dal telefono non si puo': e' un altro dominio e il browser
 * non lascia leggere ne' la risposta ne' dove e' andata a finire. Qui si'.
 *
 * Solo domini di Google Maps: senza questo controllo diventerebbe un
 * ripetitore che chiama qualsiasi indirizzo gli si passi, compresi quelli
 * interni che un Worker puo' raggiungere e il mondo no.
 */
const MAPPE_AMMESSE = /^(?:maps\.app\.goo\.gl|goo\.gl|maps\.google\.[a-z.]{2,7}|www\.google\.[a-z.]{2,7}|maps\.apple(?:\.com)?|maps\.apple)$/i;

// Le coordinate compaiono in piu' forme a seconda di dove si viene
// rimandati: nell'indirizzo finale, oppure dentro la pagina.
/* Un indirizzo puo' arrivare codificato, anche due volte.
 *
 * Quando Google rimanda alla pagina del consenso, l'indirizzo buono
 * finisce dentro un parametro: consent.google.com/m?continue=https%3A%2F%2F
 * www.google.com%2Fmaps%2Fplace%2F...%4040.49%2C17.33. Le coordinate ci
 * sono, ma la chiocciola e' scritta %40 e la virgola %2C, quindi non si
 * trovavano e l'app diceva "coordinate non trovate". */
function sbuccia(testo) {
  const out = [String(testo || '')];
  for (let i = 0; i < 2; i++) {
    let d;
    try { d = decodeURIComponent(out[out.length - 1]); } catch (_) { break; }
    if (d === out[out.length - 1]) break;
    out.push(d);
  }
  return out;
}

function coordinateDa(testo) {
  for (const t of sbuccia(testo)) { const c = coordinateIn(t); if (c) return c; }
  return null;
}

function coordinateIn(testo) {
  const t = String(testo || '');
  const forme = [
    /@(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/,
    /!3d(-?\d{1,3}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})/,
    /[?&](?:q|ll|daddr|saddr|center|destination|coordinate)=(-?\d{1,3}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/,
    /\/(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/
  ];
  for (const re of forme) {
    const m = re.exec(t);
    if (!m) continue;
    const lat = +m[1], lon = +m[2];
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
  }
  return null;
}

/* Il nome del posto, se il link ne ha uno.
 *
 * Quando il link e' stato fatto da un puntino sulla mappa invece che da un
 * luogo con un nome, Google ci mette le coordinate scritte in gradi. Sulla
 * scheda comparivano cosi': 40%C2%B033'34.6"N. Meglio niente: chi chiama
 * restera' con l'etichetta dell'ordine del giorno, che dice "Campo base" e
 * si capisce. */
const SEMBRA_COORDINATE = /^\s*-?\d{1,3}[.\u00b0]/;

function nomeDa(indirizzo) {
  let m = null;
  for (const t of sbuccia(indirizzo)) {
    m = /\/maps\/place\/([^/@?&]+)/.exec(t);
    if (m) break;
  }
  if (!m) return null;
  let n = m[1];
  // Puo' arrivare codificato due volte: si sbuccia finche' cambia.
  for (let i = 0; i < 3; i++) {
    let d;
    try { d = decodeURIComponent(n); } catch (_) { break; }
    if (d === n) break;
    n = d;
  }
  n = n.replace(/\+/g, ' ').trim();
  if (!n || SEMBRA_COORDINATE.test(n)) return null;
  return n;
}

async function handleMappa(request, env) {
  const { error: authError } = await requireUser(request, env);
  if (authError) return authError;

  const { body, error } = await readJson(request);
  if (error) return error;

  let u;
  try { u = new URL(String(body.url || '')); } catch (_) {
    return json({ error: 'Indirizzo non valido' }, 400);
  }
  if (u.protocol !== 'https:' || !MAPPE_AMMESSE.test(u.hostname)) {
    return json({ error: 'Accetto solo link di Google Maps' }, 400);
  }

  /* I rimandi si seguono a mano.
   *
   * Il primo rimando del link corto porta all'indirizzo lungo di Google
   * Maps, che le coordinate ce le ha scritte dentro. Lasciando seguire i
   * rimandi a fetch si arriva in fondo, e in fondo spesso c'e' la pagina
   * del consenso: di quell'indirizzo lungo non resta piu' niente da
   * leggere. Qui si guarda ogni tappa appena la si incontra. */
  const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
  let dove = u.toString(), c = null, nome = null, ultima = null;
  for (let i = 0; i < 6 && dove; i++) {
    /* Si guarda l'indirizzo PRIMA di chiederlo. Al secondo giro "dove" e'
       gia' l'indirizzo lungo di Google, con le coordinate dentro: andarle
       a leggere dopo la richiesta voleva dire che, se quella richiesta
       fallisce, si buttavano via coordinate che erano in mano. */
    c = c || coordinateDa(dove);
    nome = nome || nomeDa(dove);
    if (c) break;
    let r;
    try { r = await fetch(dove, { redirect: 'manual', headers: { 'user-agent': UA } }); }
    catch (e) { return json({ error: 'Google non risponde: ' + e.message }, 502); }
    const prossima = r.headers.get('location');
    if (!prossima) { ultima = r; break; }
    try { dove = new URL(prossima, dove).toString(); } catch (_) { break; }
  }

  // Niente nell'indirizzo: si guarda dentro la pagina.
  if (!c && ultima) {
    const html = await ultima.text();
    c = coordinateDa(html);
    if (!nome) nome = nomeDa(html);
  }
  /* L'errore dice dove si e' fermato: senza, dal telefono non c'era modo
     di sapere se Google non avesse risposto o se la pagina non avesse le
     coordinate. */
  if (!c) {
    let host = dove;
    try { host = new URL(dove).hostname; } catch (_) {}
    /* Il nome si restituisce anche senza coordinate: nel Dove serve
       comunque, e sapere che Google il posto lo conosceva ma le coordinate
       non le ha date e' un'informazione diversa da "non ho trovato
       niente". */
    return json({ error: 'coordinate non trovate su ' + host, nome: nome || null }, 404);
  }

  return json({ lat: c.lat, lon: c.lon, nome: nome || null });
}

const ROUTES = {
  '/api/analyze': handleAnalyze,
  '/api/chat':    handleChat,
  '/api/pdl':     handlePdl,
  '/api/wrap':    handleWrap,
  '/api/mappa':   handleMappa,
  '/api/push/iscrivi':       handleIscrivi,
  '/api/push/appuntamenti':  handleAppuntamenti,
  '/api/push/messaggio':     handleMessaggio
};

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const route = ROUTES[pathname];

    if (!route) return json({ error: 'Endpoint inesistente' }, 404);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Metodo non consentito' }, 405);
    }

    try {
      return await route(request, env, ctx);
    } catch (e) {
      console.error(pathname, e);
      return json({ error: 'Errore interno: ' + e.message }, 500);
    }
  },

  /*
   * La posta in arrivo. Stesso Worker delle richieste HTTP: uno script puo'
   * esportare sia fetch sia email, e tenerli insieme vuol dire una chiave
   * sola da configurare e un deploy solo da ricordare.
   *
   * Ci arriva da Cloudflare Email Routing, regola catch-all -> Send to a
   * Worker. Il catch-all serve perche' le regole per indirizzo sono al
   * massimo 200 per dominio, e un film per produzione le finirebbe.
   */
  /*
   * Il minuto. Guarda se c'e' qualche notifica da mandare.
   *
   * Ogni minuto e non ogni cinque perche' "fra 10 minuti" con cinque
   * minuti di scarto diventa "fra 10 o fra 15", e per un pick-up alle
   * sette e mezza la differenza si sente. Un passaggio a vuoto costa una
   * lettura su un indice, quindi quasi niente.
   */
  async scheduled(event, env, ctx) {
    try { await mandaScadute(env); }
    catch (e) { console.error('cron', e); }
  },

  async email(message, env, ctx) {
    try {
      await riceviPosta(message, env, ctx);
    } catch (e) {
      console.error('email', e);
      // Un rimbalzo e' meglio di un'accettazione silenziosa: chi ha
      // inoltrato il pacchetto viene a saperlo.
      try { message.setReject('Errore interno'); } catch (_) {}
    }
  }
};
