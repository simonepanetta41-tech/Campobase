/* Il lato Worker delle notifiche.
 *
 * Qui non c'e' ne' Supabase ne' Apple: c'e' un finto PostgREST in memoria
 * e un finto server di notifiche che si puo' far rispondere come si vuole.
 * Serve a provare le decisioni, che sono tutte sui bordi: un appuntamento
 * scaduto da troppo non si manda, uno riscritto non si duplica, un
 * telefono che risponde 410 si cancella, e due notifiche nello stesso
 * minuto non si leggono entrambe come l'ultima.
 */
import { readFile } from 'node:fs/promises';

const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ENV = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave',
              VAPID_PRIVATA: 'woQ2JLSHiHdgAJQzBzmqSTt8O7FTeTXjePDUGT8rlNQ' };

// ── Il finto database ───────────────────────────────────────────────────────
let tavoli, bussate, risposteBussata;

function azzera() {
  tavoli = { push_iscrizioni: [], push_appuntamenti: [], film_membri: [] };
  bussate = [];
  risposteBussata = () => 201;
}

let prossimoId = 1;

/* Un pezzettino di PostgREST: i filtri che usa push.js e nient'altro. */
function filtra(righe, params) {
  return righe.filter(r => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const [op, ...resto] = String(v).split('.');
      const val = resto.join('.');
      const mio = r[k];
      if (op === 'eq'  && String(mio) !== val) return false;
      if (op === 'is'  && val === 'null' && mio != null) return false;
      if (op === 'not' && resto[0] === 'is' && resto[1] === 'null' && mio == null) return false;
      if (op === 'lte' && !(mio <= val)) return false;
      if (op === 'gte' && !(mio >= val)) return false;
      if (op === 'lt'  && !(mio <  val)) return false;
    }
    return true;
  });
}

globalThis.fetch = async (url, opz = {}) => {
  const u = new URL(url);
  const risposta = (corpo, status = 200) =>
    new Response(corpo === null ? null : JSON.stringify(corpo), { status });

  // Il server di notifiche di Apple.
  if (u.hostname.endsWith('push.apple.com')) {
    bussate.push({ endpoint: url, auth: opz.headers?.Authorization, ttl: opz.headers?.TTL,
                   codifica: opz.headers?.['Content-Encoding'] || null,
                   byte: opz.body ? opz.body.length : 0 });
    return new Response('', { status: risposteBussata(url) });
  }

  if (!u.pathname.startsWith('/rest/v1/')) throw new Error('richiesta inattesa: ' + url);
  const tavolo = u.pathname.slice('/rest/v1/'.length);
  const righe = tavoli[tavolo];
  if (!righe) throw new Error('tavolo inesistente: ' + tavolo);
  const params = [...u.searchParams];
  const metodo = opz.method || 'GET';

  if (metodo === 'GET') {
    let out = filtra(righe, params);
    const ordine = u.searchParams.get('order');
    if (ordine) {
      const [campo, dir] = ordine.split('.');
      out = [...out].sort((a, b) => (a[campo] > b[campo] ? 1 : a[campo] < b[campo] ? -1 : 0) * (dir === 'desc' ? -1 : 1));
    }
    const lim = +u.searchParams.get('limit');
    return risposta(lim ? out.slice(0, lim) : out);
  }

  if (metodo === 'POST') {
    const corpo = JSON.parse(opz.body);
    const nuove = Array.isArray(corpo) ? corpo : [corpo];
    const chiaveUnica = u.searchParams.get('on_conflict');
    for (const n of nuove) {
      const gia = chiaveUnica && righe.find(r => r[chiaveUnica] === n[chiaveUnica]);
      if (gia) Object.assign(gia, n);
      else righe.push({ id: 'id' + prossimoId++, mandato: null, mostrato: null, ...n });
    }
    return risposta(null, 201);
  }

  if (metodo === 'PATCH') {
    const patch = JSON.parse(opz.body);
    for (const r of filtra(righe, params)) Object.assign(r, patch);
    return risposta(null, 204);
  }

  if (metodo === 'DELETE') {
    for (const r of filtra(righe, params)) righe.splice(righe.indexOf(r), 1);
    return risposta(null, 204);
  }
  throw new Error('metodo ' + metodo);
};

// ── Il modulo, con requireUser e readJson finti ─────────────────────────────
const src = await readFile(RADICE + '/worker/push.js', 'utf8');
let utenteFinto = { id: 'u1' };
let corpoFinto = {};
const fabbrica = new Function('UTENTE', 'CORPO',
  src.replace(/^\s*import .*$/gm,
    `const json = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } });
     /* Come il vero readJson di shared.js: restituisce { body }, non il
        corpo. Prima questo finto dava il corpo diretto, e un errore vero —
        handleAppuntamenti che leggeva b.lista su { body } — passava tutti i
        controlli: il Worker rispondeva 200 con "scritti: 0" e sul telefono
        non arrivava niente. Un finto che non mente come l'originale non
        prova nulla. */
     const readJson = async () => ({ body: CORPO() });
     const requireUser = async () => (UTENTE() ? { user: UTENTE() } : { error: json({ error: 'no' }, 401) });`)
    .replace(/^\s*export /gm, '')
  + '\nreturn {mandaScadute, handleIscrivi, handleAppuntamenti, handleMessaggio, avvisaPosta};');
const push = fabbrica(() => utenteFinto, () => corpoFinto);

let ko = 0;
const ok = (n, g, e) => { const b = JSON.stringify(g) === JSON.stringify(e); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(46)} ${JSON.stringify(g)}`.padEnd(106) + ' atteso ' + JSON.stringify(e)); };

const fra = m => new Date(Date.now() + m * 60000).toISOString();
/* Un'iscrizione con le chiavi del telefono, come quelle vere: senza, il
   Worker manda la notifica vuota, ed e' la strada di riserva. */
const CHIAVI = { p256dh: 'BF4BPyee1TQoLPfRSpi44AI1OaBt0rbxqW-UsWYMoj1v47BJA-E4K-8PTYq3s3S1Ego4UQQPlVAwx9xungMdSOE',
                 auth: 'ApgKVXuggagJ0ieG6dxfBw' };
const iscrivi = (user, endpoint, chiavi = CHIAVI) =>
  tavoli.push_iscrizioni.push({ id: 'i' + endpoint, user_id: user, endpoint, ...chiavi });

console.log('\n── un appuntamento scaduto si manda, e una volta sola ──');
azzera();
iscrivi('u1', 'https://web.push.apple.com/telefono1');
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(-1), genere: 'pickup',
  testo: 'Stefano è lì fra 10 minuti per il pick up!', mandato: null, mostrato: null });
ok('mandato', await push.mandaScadute(ENV), 1);
ok('una bussata sola', bussate.length, 1);
ok('al telefono giusto', bussate[0].endpoint, 'https://web.push.apple.com/telefono1');
ok('firmato', /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/.test(bussate[0].auth || ''), true);
ok('con la scadenza giusta', bussate[0].ttl, '1200');
ok('e col testo cifrato dentro', bussate[0].codifica, 'aes128gcm');
/* 16 di sale + 4 di misura + 1 + 65 di chiave + il testo + 16 di firma. */
ok('un pacchetto di misura sensata', bussate[0].byte > 102 && bussate[0].byte < 400, true);
ok('segnato come mandato', !!tavoli.push_appuntamenti[0].mandato, true);
bussate.length = 0;
ok('al giro dopo non si ripete', await push.mandaScadute(ENV), 0);
ok('niente bussate', bussate.length, 0);

console.log('\n── un\'iscrizione vecchia, senza chiavi, parte vuota ──');
azzera();
iscrivi('u1', 'https://web.push.apple.com/vecchio', {});
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(-1), genere: 'posta', testo: 'x', mandato: null });
await push.mandaScadute(ENV);
ok('nessuna codifica', bussate[0].codifica, null);
ok('e nessun corpo', bussate[0].byte, 0);

console.log('\n── uno non ancora scaduto si lascia stare ──');
azzera();
iscrivi('u1', 'https://web.push.apple.com/t1');
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(5), genere: 'catering', testo: 'x', mandato: null });
ok('non mandato', await push.mandaScadute(ENV), 0);
ok('e resta da mandare', tavoli.push_appuntamenti[0].mandato, null);

console.log('\n── uno scaduto da troppo si archivia invece di consegnarlo ──');
/* "Fra 10 minuti il tuo driver" letto a mezzogiorno e' una bugia. */
azzera();
iscrivi('u1', 'https://web.push.apple.com/t1');
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(-240), genere: 'pickup', testo: 'x', mandato: null });
ok('non mandato', await push.mandaScadute(ENV), 0);
ok('nessuna bussata', bussate.length, 0);
ok('ma archiviato', !!tavoli.push_appuntamenti[0].mandato, true);

console.log('\n── un telefono che non c\'è più si cancella ──');
azzera();
iscrivi('u1', 'https://web.push.apple.com/vivo');
iscrivi('u1', 'https://web.push.apple.com/morto');
risposteBussata = u => u.endsWith('/morto') ? 410 : 201;
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(-1), genere: 'posta', testo: 'x', mandato: null });
await push.mandaScadute(ENV);
ok('provati tutti e due', bussate.length, 2);
ok('resta solo il vivo', tavoli.push_iscrizioni.map(i => i.endpoint), ['https://web.push.apple.com/vivo']);
ok('uno consegnato e uno scartato',
  [tavoli.push_appuntamenti[0].dispositivi, tavoli.push_appuntamenti[0].scartati], [1, 1]);

console.log('\n── resta scritto a quanti telefoni è arrivata ──');
/*
 * "mandato" dice soltanto che il cron ci ha provato, e lo scrive anche
 * quando non c'era nessuno a cui mandarla. Il primo giorno di notifiche
 * sul set a un collega non e' arrivata, e non c'era modo di sapere se il
 * suo telefono non fosse iscritto, se Apple avesse rifiutato l'indirizzo
 * o se l'avesse scartata senza leggerla: tre cause, tre rimedi diversi,
 * nessuna traccia per distinguerle.
 */
azzera();
iscrivi('u1', 'https://web.push.apple.com/t1');
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(-1), genere: 'pickup', testo: 'x', mandato: null });
await push.mandaScadute(ENV);
ok('consegnata a un telefono',
  [tavoli.push_appuntamenti[0].dispositivi, tavoli.push_appuntamenti[0].scartati], [1, 0]);

console.log('\n── e si distingue "nessuno iscritto" da "mai provata" ──');
/* Zero vuol dire che si e' provato e non c'era nessun telefono: quello
   e' un collega da far riattivare. Il vuoto vuol dire che non si e'
   nemmeno provato, ed e' tutta un'altra cosa. */
azzera();
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(-1), genere: 'catering', testo: 'x', mandato: null });
await push.mandaScadute(ENV);
ok('nessun telefono iscritto',
  [tavoli.push_appuntamenti[0].dispositivi, tavoli.push_appuntamenti[0].scartati], [0, 0]);

azzera();
iscrivi('u1', 'https://web.push.apple.com/t1');
// Scaduta da quattro ore: archiviata senza mandarla.
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(-240), genere: 'pickup', testo: 'x', mandato: null });
await push.mandaScadute(ENV);
ok('archiviata senza provarci', tavoli.push_appuntamenti[0].dispositivi, undefined);

console.log('\n── le notifiche di un altro non arrivano a me ──');
azzera();
iscrivi('u1', 'https://web.push.apple.com/mio');
iscrivi('u2', 'https://web.push.apple.com/suo');
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u2', quando: fra(-1), genere: 'pickup', testo: 'x', mandato: null });
await push.mandaScadute(ENV);
ok('solo il suo telefono', bussate.map(b => b.endpoint), ['https://web.push.apple.com/suo']);

console.log('\n── l\'app riscrive gli appuntamenti e non si duplicano ──');
azzera();
/* `giorno` e' la data dell'ordine del giorno, e la chiave si fa su quella.
   Senza, questo controllo dipendeva dall'orologio: passava di pomeriggio e
   falliva verso mezzanotte, quando i 60 e i 90 minuti cadevano a cavallo
   del cambio di data UTC. Stava segnalando un guasto vero — vedi sotto. */
const DOMANI = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
corpoFinto = { lista: [{ quando: fra(60), giorno: DOMANI, genere: 'pickup', testo: 'alle 7.30' }] };
await push.handleAppuntamenti({}, ENV);
await push.handleAppuntamenti({}, ENV);
ok('una riga sola', tavoli.push_appuntamenti.length, 1);
corpoFinto = { lista: [{ quando: fra(90), giorno: DOMANI, genere: 'pickup', testo: 'spostato alle 8.00' }] };
await push.handleAppuntamenti({}, ENV);
ok('e l\'ora si aggiorna', tavoli.push_appuntamenti.length, 1);
ok('col testo nuovo', tavoli.push_appuntamenti[0].testo, 'spostato alle 8.00');
ok('e torna da mandare', tavoli.push_appuntamenti[0].mandato, null);

console.log('\n── ⚠ un pick-up di notte spostato a cavallo della mezzanotte ──');
/* Pick-up alle 02.00 spostato alle 01.15: l'avviso passa da dopo a prima
   della mezzanotte UTC. E' lo stesso pick-up dello stesso giorno di
   lavoro, quindi deve restare un avviso solo, all'ora nuova. Con la
   chiave fatta sulla data UTC diventavano due, e quello vecchio partiva
   all'ora sbagliata. */
azzera();
const mezzanotte = new Date(Date.now() + 2 * 86400000); mezzanotte.setUTCHours(0, 0, 0, 0);
const attorno = m => new Date(mezzanotte.getTime() + m * 60000).toISOString();
const GIORNO = new Date(mezzanotte.getTime() - 86400000).toISOString().slice(0, 10);
corpoFinto = { lista: [{ quando: attorno(30), giorno: GIORNO, genere: 'pickup', testo: 'alle 02.00' }] };
await push.handleAppuntamenti({}, ENV);
corpoFinto = { lista: [{ quando: attorno(-15), giorno: GIORNO, genere: 'pickup', testo: 'alle 01.15' }] };
await push.handleAppuntamenti({}, ENV);
ok('un avviso solo', tavoli.push_appuntamenti.length, 1);
ok('all\'ora nuova', tavoli.push_appuntamenti[0].testo, 'alle 01.15');
/* Un'app non ancora aggiornata non manda il giorno: resta la regola di
   prima, che di giorno da' la stessa chiave. */
azzera();
corpoFinto = { lista: [{ quando: attorno(600), genere: 'pickup', testo: 'senza giorno' }] };
await push.handleAppuntamenti({}, ENV);
corpoFinto = { lista: [{ quando: attorno(630), giorno: attorno(600).slice(0, 10), genere: 'pickup', testo: 'col giorno' }] };
await push.handleAppuntamenti({}, ENV);
ok('app vecchia e app nuova non si doppiano', tavoli.push_appuntamenti.length, 1);

console.log('\n── un\'ora già passata non si registra ──');
azzera();
corpoFinto = { lista: [{ quando: fra(-30), genere: 'pickup', testo: 'x' }] };
const r = await push.handleAppuntamenti({}, ENV);
ok('scritti zero', (await r.json()).scritti, 0);
ok('tabella vuota', tavoli.push_appuntamenti.length, 0);

console.log('\n── il telefono chiede cosa dire ──');
azzera();
iscrivi('u1', 'https://web.push.apple.com/t1');
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(-2), genere: 'pickup',
  testo: 'Stefano è lì fra 10 minuti per il pick up!', mandato: fra(-1), mostrato: null });
corpoFinto = { endpoint: 'https://web.push.apple.com/t1' };
ok('il testo giusto', (await (await push.handleMessaggio({}, ENV)).json()).testo,
   'Stefano è lì fra 10 minuti per il pick up!');
ok('e una seconda volta no', (await (await push.handleMessaggio({}, ENV)).json()).testo, null);

console.log('\n── due notifiche nello stesso minuto si leggono entrambe ──');
/* Senza "mostrato" il telefono leggeva due volte la piu' recente e la
   prima non la vedeva nessuno. */
azzera();
iscrivi('u1', 'https://web.push.apple.com/t1');
tavoli.push_appuntamenti.push(
  { id: 'a1', user_id: 'u1', quando: fra(-3), genere: 'posta',    testo: 'Nuovo ordine del giorno!', mandato: fra(-2), mostrato: null },
  { id: 'a2', user_id: 'u1', quando: fra(-3), genere: 'catering', testo: 'Catering pronto fra 15 minuti!', mandato: fra(-1), mostrato: null });
corpoFinto = { endpoint: 'https://web.push.apple.com/t1' };
const uno = (await (await push.handleMessaggio({}, ENV)).json()).testo;
const due = (await (await push.handleMessaggio({}, ENV)).json()).testo;
ok('la prima, poi la seconda', [uno, due], ['Nuovo ordine del giorno!', 'Catering pronto fra 15 minuti!']);

console.log('\n── un indirizzo che non conosciamo non ottiene niente ──');
corpoFinto = { endpoint: 'https://web.push.apple.com/non-mio' };
const sconosciuto = await push.handleMessaggio({}, ENV);
ok('404', sconosciuto.status, 404);

console.log('\n── la posta avvisa la troupe, non il resto del mondo ──');
azzera();
tavoli.film_membri.push({ user_id: 'u1', project_id: 'f1' }, { user_id: 'u2', project_id: 'f1' },
                        { user_id: 'u3', project_id: 'f2' });
ok('due membri avvisati', await push.avvisaPosta(ENV, 'f1', ['odg'], 'MSG - ODG 23 del 12.11.2026'), 2);
/* Sotto il titolo l'oggetto della mail: lo scrive la produzione e dice di
   che giorno si tratta meglio di qualunque frase nostra. */
ok('col titolo e l\'oggetto sotto', tavoli.push_appuntamenti[0].testo,
   'Nuovo ordine del giorno!\nMSG - ODG 23 del 12.11.2026');
ok('e non quelli dell\'altro film', tavoli.push_appuntamenti.map(a => a.user_id), ['u1', 'u2']);
azzera();
tavoli.film_membri.push({ user_id: 'u1', project_id: 'f1' });
await push.avvisaPosta(ENV, 'f1', ['pdl'], 'Fwd: Re: FWD: MSG - PDL 8');
ok('il piano si annuncia come piano', tavoli.push_appuntamenti[0].testo,
   'Nuovo piano di lavorazione!\nMSG - PDL 8');
azzera();
tavoli.film_membri.push({ user_id: 'u1', project_id: 'f1' });
await push.avvisaPosta(ENV, 'f1', [], '');
ok('e se non si sa, generico', tavoli.push_appuntamenti[0].testo, 'Nuova posta dalla produzione');

console.log('\n── senza il secret non si bussa e non si sbraca ──');
azzera();
iscrivi('u1', 'https://web.push.apple.com/t1');
tavoli.push_appuntamenti.push({ id: 'a1', user_id: 'u1', quando: fra(-1), genere: 'pickup', testo: 'x', mandato: null });
let scoppiato = false;
try { await push.mandaScadute({ ...ENV, VAPID_PRIVATA: undefined }); } catch (_) { scoppiato = true; }
ok('non scoppia', scoppiato, false);
ok('nessuna bussata', bussate.length, 0);
ok("e l'iscrizione non si cancella", tavoli.push_iscrizioni.length, 1);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
