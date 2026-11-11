/*
 * Le notifiche.
 *
 * Una notifica che arriva sul telefono puo' portarsi dietro il testo, ma
 * allora va cifrata per ogni destinatario: scambio di chiavi, derivazione,
 * AES. Sbagliare un passaggio vuol dire notifiche che non arrivano senza
 * che nessuno sappia perche'. Qui la notifica che viaggia e' vuota: serve
 * solo a svegliare l'app, che poi chiede qui cosa deve dire. Niente
 * cifratura da mantenere, e il testo si cambia senza toccare il telefono.
 *
 * Firmare pero' bisogna comunque: Apple e Google accettano una notifica
 * solo se chi la manda prova di essere lo stesso che ha dato la chiave
 * pubblica al telefono. Quella firma e' VAPID, ed e' un JWT ES256 — che
 * Web Crypto sa fare da solo.
 */

import { json, readJson, requireUser } from './shared.js';

const SUB = 'mailto:push@campobase.dev';

/* La chiave pubblica VAPID.
 *
 * E' pubblica per definizione: l'app la consegna al telefono in chiaro, e
 * chi la legge non ci puo' fare niente. Sta scritta qui, e non fra le
 * variabili del Worker, per due ragioni. La prima e' che la stessa chiave
 * serve all'app e al Worker, e se le due parti ne usassero due diverse le
 * notifiche verrebbero rifiutate senza spiegazioni. La seconda e' che
 * dichiarare un blocco "vars" in wrangler.jsonc cancella le variabili
 * scritte a mano nel pannello, SUPABASE_URL compresa.
 *
 * La privata e' il secret VAPID_PRIVATA, e quella non si scrive da nessuna
 * parte. */
export const VAPID_PUBBLICA =
  'BJD6Xo8PM0CECDMO509OCdtC8kdCFjNtO16gfVknSY0akgJjIM_oB5_UboWvJ91cPYaTV9-8pQpIwIPmYjfEed8';

/* I minuti entro cui una notifica ha ancora senso.
 * Il telefono spento o senza campo alle sette e venti non la riceve: se si
 * riaccende a mezzogiorno, "il tuo driver e' li' fra 10 minuti" e' una
 * bugia. Oltre questa soglia l'appuntamento si archivia senza mandarlo. */
const SCADENZA = 20;

// ── Base64 come lo vuole il web push ────────────────────────────────────────

function b64u(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function daB64u(s) {
  const t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - t.length % 4) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── La firma ────────────────────────────────────────────────────────────────

/* La chiave privata arriva come le 32 cifre del numero segreto, e Web
   Crypto la vuole come JWK — che pretende anche il punto pubblico. Quello
   ce l'abbiamo: e' la chiave pubblica che l'app passa al telefono, 65 byte
   con un 4 davanti e dentro le due coordinate. */
async function chiavePerFirmare(privata, pubblica) {
  const p = daB64u(pubblica);
  if (p.length !== 65 || p[0] !== 4) throw new Error('chiave pubblica VAPID malformata');
  return crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', ext: true,
    d: String(privata).trim(),
    x: b64u(p.slice(1, 33)),
    y: b64u(p.slice(33, 65))
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function autorizzazione(endpoint, env) {
  const privata = env.VAPID_PRIVATA, pubblica = VAPID_PUBBLICA;
  if (!privata) throw new Error('manca il secret VAPID_PRIVATA');

  const u = new URL(endpoint);
  const testa = b64u(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64u(new TextEncoder().encode(JSON.stringify({
    aud: u.origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: SUB
  })));
  const chiave = await chiavePerFirmare(privata, pubblica);
  /* ECDSA in Web Crypto esce come r||s, 64 byte: e' esattamente la firma
     che vuole ES256. Con una firma DER qui non funzionerebbe niente. */
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' },
    chiave, new TextEncoder().encode(testa + '.' + corpo));
  return `vapid t=${testa}.${corpo}.${b64u(firma)}, k=${pubblica}`;
}

// ── Il contenuto cifrato ────────────────────────────────────────────────────

/*
 * Il testo dentro la notifica, cifrato come vuole la specifica (RFC 8291).
 *
 * All'inizio la notifica partiva vuota, e il telefono tornava a chiedere
 * cosa dire: meno codice e niente cifratura da sbagliare. Ma Safari una
 * notifica senza contenuto non la consegna in modo affidabile, e una
 * notifica che non arriva e' peggio di un po' di codice in piu'. Quindi si
 * cifra.
 *
 * Come funziona: il telefono, quando si iscrive, consegna due cose — la
 * sua chiave pubblica (p256dh) e un segreto condiviso (auth). Si fabbrica
 * una coppia di chiavi usa-e-getta, si fa un accordo di Diffie-Hellman con
 * la sua pubblica, e dal risultato si ricavano la chiave di cifratura e il
 * numero da usare una volta sola. La pubblica usa-e-getta viaggia in
 * chiaro dentro il pacchetto: senza quella il telefono non puo' rifare il
 * conto, e con quella sola non ci puo' fare nessun altro.
 *
 * Le due derivazioni sono HKDF, e Web Crypto le fa tutte e due: la prima
 * usa auth come sale, la seconda un sale casuale che viaggia anch'esso nel
 * pacchetto.
 */

const RECORD = 4096;

function unisci(...pezzi) {
  const n = pezzi.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(n);
  let i = 0;
  for (const p of pezzi) { out.set(p, i); i += p.length; }
  return out;
}

const parola = s => new TextEncoder().encode(s);

async function hkdf(ikm, sale, info, byte) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: sale, info }, k, byte * 8));
}

export async function cifra(testo, p256dh, auth) {
  const ua = daB64u(p256dh);          // la pubblica del telefono, 65 byte
  const segreto = daB64u(auth);       // il segreto condiviso, 16 byte
  if (ua.length !== 65 || ua[0] !== 4) throw new Error('p256dh malformata');
  if (segreto.length !== 16) throw new Error('auth malformato');

  // La coppia usa-e-getta, una per notifica.
  const mia = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const miaPub = new Uint8Array(await crypto.subtle.exportKey('raw', mia.publicKey));

  const suaChiave = await crypto.subtle.importKey('raw', ua,
    { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const condiviso = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: suaChiave }, mia.privateKey, 256));

  /* Il materiale di partenza. L'ordine delle due chiavi qui dentro non e'
     arbitrario: prima quella del telefono, poi la nostra. Invertirle da' una
     chiave diversa, il telefono non riesce a decifrare e la notifica
     scompare senza un errore da nessuna parte. */
  const info = unisci(parola('WebPush: info'), new Uint8Array([0]), ua, miaPub);
  const ikm = await hkdf(condiviso, segreto, info, 32);

  const sale = crypto.getRandomValues(new Uint8Array(16));
  const chiave = await hkdf(ikm, sale, unisci(parola('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const numero = await hkdf(ikm, sale, unisci(parola('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  const aes = await crypto.subtle.importKey('raw', chiave, 'AES-GCM', false, ['encrypt']);
  // Il 2 in coda dice "questo e' l'ultimo pezzo": con un pezzo solo e' sempre.
  const dentro = unisci(parola(testo), new Uint8Array([2]));
  const cifrato = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: numero, tagLength: 128 }, aes, dentro));

  const misura = new Uint8Array(4);
  new DataView(misura.buffer).setUint32(0, RECORD);
  return unisci(sale, misura, new Uint8Array([miaPub.length]), miaPub, cifrato);
}

// ── Il database ─────────────────────────────────────────────────────────────

function capi(env) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function db(env, percorso, opzioni = {}) {
  const u = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${percorso}`;
  const r = await fetch(u, { ...opzioni, headers: { ...capi(env), ...(opzioni.headers || {}) } });
  if (!r.ok) throw new Error(`${percorso.split('?')[0]} -> ${r.status} ${await r.text().catch(() => '')}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// ── Mandare ─────────────────────────────────────────────────────────────────

/* Manda la notifica a un dispositivo.
 * Torna true se e' partita, false se quell'iscrizione non esiste piu'. */
async function bussa(isc, testo, env) {
  const capo = {
    Authorization: await autorizzazione(isc.endpoint, env),
    TTL: String(SCADENZA * 60),
    Urgency: 'high'
  };
  let corpo;
  if (isc.p256dh && isc.auth) {
    corpo = await cifra(JSON.stringify({ testo }), isc.p256dh, isc.auth);
    capo['Content-Encoding'] = 'aes128gcm';
    capo['Content-Type'] = 'application/octet-stream';
  }
  /* Senza le chiavi del telefono si manda vuota e il service worker va a
     chiedere il testo. E' la strada di riserva per le iscrizioni fatte
     prima che ci fosse la cifratura: su Safari non e' affidabile, quindi
     non e' la strada principale di nessuno. */

  const r = await fetch(isc.endpoint, { method: 'POST', headers: capo, body: corpo });
  /* 404 e 410 vogliono dire che quel telefono non c'e' piu': app
     disinstallata, notifiche revocate, iscrizione scaduta. Insistere non
     serve, e tenersela vuol dire riprovare per sempre. */
  if (r.status === 404 || r.status === 410) return false;
  if (!r.ok) throw new Error(`push -> ${r.status} ${await r.text().catch(() => '')}`);
  return true;
}

/*
 * Restituisce com'e' andata, telefono per telefono.
 *
 * Prima tornava solo il numero di notifiche partite, e quel numero finiva
 * in un log del Worker che dopo qualche ora non c'e' piu'. Il primo giorno
 * vero di notifiche sul set e' bastato a mostrare il problema: a un collega
 * non era arrivata, e non c'era modo di sapere se il telefono non fosse
 * iscritto, se Apple avesse rifiutato l'indirizzo o se lui l'avesse
 * semplicemente scartata senza leggerla. Tre cause diverse, tre rimedi
 * diversi, e nessuna traccia per distinguerle.
 *
 * Gli errori veri — Apple che risponde 500, o troppe richieste — restano
 * solo nel log: non dicono niente sull'iscrizione, e domani lo stesso
 * telefono funziona.
 */
async function mandaAUtente(userId, testo, env) {
  const isc = await db(env,
    `push_iscrizioni?select=id,endpoint,p256dh,auth&user_id=eq.${userId}`);
  let partite = 0, scartati = 0;
  for (const i of isc || []) {
    let viva;
    try { viva = await bussa(i, testo, env); }
    catch (e) { console.error('push', i.id, e.message); continue; }
    if (viva) partite++;
    else {
      scartati++;
      await db(env, `push_iscrizioni?id=eq.${i.id}`, { method: 'DELETE' });
    }
  }
  return { partite, scartati };
}

// ── Il cron ─────────────────────────────────────────────────────────────────

/* Passa ogni minuto. Non gli interessa chi ha scritto l'appuntamento: ne
   scrive l'app, per il pick-up e il catering, e il Worker per la posta. */
export async function mandaScadute(env) {
  const ora = Date.now();
  const adesso = new Date(ora).toISOString();
  const limite = new Date(ora - SCADENZA * 60000).toISOString();

  const dovute = await db(env, 'push_appuntamenti' +
    `?select=id,user_id,testo,quando&mandato=is.null` +
    `&quando=lte.${adesso}&quando=gte.${limite}&order=quando.asc&limit=100`);

  for (const a of dovute || []) {
    const { partite, scartati } = await mandaAUtente(a.user_id, a.testo, env);
    await db(env, `push_appuntamenti?id=eq.${a.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ mandato: adesso, dispositivi: partite, scartati })
    });
    console.log('[push]', a.testo, '->', partite, 'dispositivi,', scartati, 'scartati');
  }

  /* Le scadute davvero: si archiviano senza mandarle, se no il cron le
     ritrova a ogni passaggio per sempre. */
  await db(env, `push_appuntamenti?mandato=is.null&quando=lt.${limite}`, {
    method: 'PATCH', body: JSON.stringify({ mandato: adesso })
  });

  return (dovute || []).length;
}

// ── Le rotte ────────────────────────────────────────────────────────────────

/* Il telefono si iscrive. */
export async function handleIscrivi(request, env) {
  const { user, error } = await requireUser(request, env);
  if (error) return error;
  const { body: b, error: malformato } = await readJson(request);
  if (malformato) return malformato;
  if (!b?.endpoint) return json({ error: 'manca endpoint' }, 400);

  await db(env, 'push_iscrizioni?on_conflict=endpoint', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: user.id,
      endpoint: b.endpoint,
      p256dh: b.p256dh || null,
      auth: b.auth || null
    })
  });
  return json({ ok: true });
}

/* L'app registra i suoi appuntamenti: il pick-up e il catering di oggi.
 * Li manda a ogni apertura dell'ordine del giorno, e la chiave fa in modo
 * che riscriverli aggiorni l'ora invece di aggiungere una notifica. */
export async function handleAppuntamenti(request, env) {
  const { user, error } = await requireUser(request, env);
  if (error) return error;
  const { body: b, error: malformato } = await readJson(request);
  if (malformato) return malformato;
  const lista = Array.isArray(b?.lista) ? b.lista : [];
  if (!lista.length) return json({ ok: true, scritti: 0 });

  const righe = [];
  for (const a of lista.slice(0, 10)) {
    const quando = new Date(a.quando);
    if (!a.genere || !a.testo || isNaN(quando)) continue;
    // Un appuntamento nel passato non si registra: nascerebbe gia' scaduto.
    if (quando.getTime() < Date.now()) continue;
    righe.push({
      user_id: user.id,
      project_id: b.project_id || null,
      quando: quando.toISOString(),
      genere: String(a.genere).slice(0, 20),
      testo: String(a.testo).slice(0, 200),
      chiave: `${user.id}:${a.genere}:${quando.toISOString().slice(0, 10)}`
    });
  }
  if (!righe.length) return json({ ok: true, scritti: 0 });

  await db(env, 'push_appuntamenti?on_conflict=chiave', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    /* Riscrivendo la stessa chiave si azzerano mandato e mostrato: se la
       produzione sposta il pick-up, la notifica di quel giorno va rifatta
       anche se quella vecchia era gia' partita. */
    body: JSON.stringify(righe.map(r => ({ ...r, mandato: null, mostrato: null })))
  });
  return json({ ok: true, scritti: righe.length });
}

/* Il telefono, svegliato dalla notifica vuota, chiede cosa dire.
 *
 * Senza token: l'indirizzo del dispositivo e' il segreto. Lo sanno solo
 * quel telefono, Apple e noi — chi non ce l'ha non ottiene niente, e chi
 * ce l'ha poteva comunque mandare notifiche a quel telefono.
 */
export async function handleMessaggio(request, env) {
  const { body: b, error: malformato } = await readJson(request);
  if (malformato) return malformato;
  if (!b?.endpoint) return json({ error: 'manca endpoint' }, 400);

  const isc = await db(env,
    `push_iscrizioni?select=id,user_id&endpoint=eq.${encodeURIComponent(b.endpoint)}&limit=1`);
  if (!isc?.length) return json({ testo: null }, 404);
  const io = isc[0];

  await db(env, `push_iscrizioni?id=eq.${io.id}`, {
    method: 'PATCH', body: JSON.stringify({ vista: new Date().toISOString() })
  });

  const limite = new Date(Date.now() - SCADENZA * 60000).toISOString();
  const pronti = await db(env, 'push_appuntamenti' +
    `?select=id,testo,genere&user_id=eq.${io.user_id}` +
    `&mandato=not.is.null&mostrato=is.null&mandato=gte.${limite}` +
    `&order=mandato.asc&limit=1`);

  if (!pronti?.length) return json({ testo: null });
  await db(env, `push_appuntamenti?id=eq.${pronti[0].id}`, {
    method: 'PATCH', body: JSON.stringify({ mostrato: new Date().toISOString() })
  });
  return json({ testo: pronti[0].testo, genere: pronti[0].genere });
}

// ── La posta ────────────────────────────────────────────────────────────────

/* Chiamata da posta.js quando un pacchetto e' stato messo da parte.
 * L'appuntamento e' per adesso, cosi' il cron lo manda al primo passaggio:
 * un meccanismo solo per tutte e tre le notifiche. */
export async function avvisaPosta(env, projectId, fatti, oggetto) {
  const titolo = fatti.includes('pdl')
    ? 'Nuovo piano di lavorazione!'
    : fatti.includes('odg')
      ? 'Nuovo ordine del giorno!'
      : 'Nuova posta dalla produzione';

  /* Sotto il titolo, l'oggetto della mail: e' la produzione a scriverlo, e
     dice di che giorno si tratta meglio di qualunque frase nostra —
     "MSG - ODG 22 del 11.11.2026". I prefissi di inoltro no: tre "Fwd:" in
     fila mangiano la riga e non dicono niente. */
  const sotto = String(oggetto || '')
    .replace(/^(\s*(?:fwd?|re|i|inoltro)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ').trim().slice(0, 80);
  const testo = sotto ? titolo + '\n' + sotto : titolo;

  const membri = await db(env,
    `film_membri?select=user_id&project_id=eq.${projectId}`);
  if (!membri?.length) return 0;

  const adesso = new Date();
  const righe = membri.map(m => ({
    user_id: m.user_id,
    project_id: projectId,
    quando: adesso.toISOString(),
    genere: 'posta',
    testo,
    /* Al minuto, non al giorno: di ordini del giorno ne arriva uno al
       giorno, ma di comunicazioni anche cinque, e ognuna va annunciata. */
    chiave: `${m.user_id}:posta:${adesso.toISOString().slice(0, 16)}`
  }));

  await db(env, 'push_appuntamenti?on_conflict=chiave', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(righe)
  });
  return righe.length;
}
