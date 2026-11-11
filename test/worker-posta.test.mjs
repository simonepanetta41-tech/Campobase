/* La mail che arriva, dall'inizio alla fine.
 *
 * Esisteva un controllo per il lettore MIME e uno per le notifiche, e
 * tutti e due passavano. Quello che non c'era era il controllo che li
 * mette in fila: una mail che entra e una troupe che viene avvisata.
 *
 * In quel buco e' rimasto per giorni un errore grosso come una casa.
 * posta.js chiamava avvisaPosta senza averla mai importata: a ogni mail
 * la chiamata sollevava un ReferenceError, e il try/catch di li' intorno
 * — scritto apposta perche' una notifica mancata non faccia rimbalzare
 * una mail arrivata — se lo mangiava in silenzio. La mail arrivava, gli
 * allegati finivano nel secchio, la riga diceva "nuova", e l'annuncio
 * non e' mai partito nemmeno una volta. Dal database sembrava tutto a
 * posto: e' stata l'assenza totale di righe in push_appuntamenti a
 * tradirlo.
 *
 * Questo controllo guarda l'unica cosa che conta davvero: dopo una mail
 * con un ordine del giorno dentro, la troupe ha un avviso a testa.
 */
import { readFile } from 'node:fs/promises';

const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ENV = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave',
              VAPID_PRIVATA: 'woQ2JLSHiHdgAJQzBzmqSTt8O7FTeTXjePDUGT8rlNQ' };

let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

// ── Il mondo finto ──────────────────────────────────────────────────────────
let tavoli, salvati, rifiutato;

function azzera() {
  tavoli = {
    projects: [{ id: 'f1', casella: 'abc123', titolo: 'Missione', mittente: null }],
    film_membri: [{ project_id: 'f1', user_id: 'u1' },
                  { project_id: 'f1', user_id: 'u2' },
                  { project_id: 'f1', user_id: 'u3' }],
    posta: [],
    push_appuntamenti: [],
    push_iscrizioni: []
  };
  salvati = [];
  rifiutato = null;
}

function filtra(righe, params) {
  return righe.filter(r => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
      const [op, ...resto] = String(v).split('.');
      if (op === 'eq' && String(r[k]) !== resto.join('.')) return false;
    }
    return true;
  });
}

globalThis.fetch = async (url, opz = {}) => {
  const u = new URL(url);
  const risposta = (corpo, status = 200) =>
    new Response(corpo === null ? null : JSON.stringify(corpo), { status });

  // Il secchio degli allegati.
  if (u.pathname.startsWith('/storage/v1/object/')) {
    salvati.push(u.pathname.replace('/storage/v1/object/', ''));
    return risposta({ Key: 'ok' });
  }

  // Un pezzetto di PostgREST.
  const tavola = u.pathname.replace('/rest/v1/', '').split('?')[0];
  if (!(tavola in tavoli)) return risposta({ message: 'tavola ignota: ' + tavola }, 404);
  const params = [...u.searchParams.entries()];

  if ((opz.method || 'GET') === 'GET') return risposta(filtra(tavoli[tavola], params));
  if (opz.method === 'POST') {
    const corpo = JSON.parse(opz.body);
    for (const n of Array.isArray(corpo) ? corpo : [corpo]) tavoli[tavola].push({ ...n });
    return risposta(null, 201);
  }
  return risposta(null, 204);
};

// ── Una mail vera, con un ordine del giorno attaccato ───────────────────────
const CONFINE = 'xxBOUNDARYxx';
function mail(nomeAllegato) {
  const pdf = Buffer.from('%PDF-1.4 finto').toString('base64');
  return [
    'From: Produzione <produzione@esempio.it>',
    'To: abc123@campobase.dev',
    'Subject: MSG - ODG 23 del 12.11.2026',
    'Message-ID: <uno@esempio.it>',
    'Date: Wed, 11 Nov 2026 17:05:00 +0100',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${CONFINE}"`,
    '',
    `--${CONFINE}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'In allegato l\'ordine del giorno di domani.',
    '',
    `--${CONFINE}`,
    `Content-Type: application/pdf; name="${nomeAllegato}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${nomeAllegato}"`,
    '',
    pdf,
    '',
    `--${CONFINE}--`, ''
  ].join('\r\n');
}

function messaggio(testo) {
  const byte = new TextEncoder().encode(testo);
  return {
    to: 'abc123@campobase.dev',
    from: 'produzione@esempio.it',
    rawSize: byte.length,
    raw: new ReadableStream({ start(c) { c.enqueue(byte); c.close(); } }),
    setReject: (m) => { rifiutato = m; }
  };
}

// ── La prova ────────────────────────────────────────────────────────────────
const posta = await import(RADICE + '/worker/posta.js');

console.log('\n── una mail con l\'OdG: allegato salvato E troupe avvisata ──');
azzera();
await posta.riceviPosta(messaggio(mail('MSG - ODG 23.pdf')), ENV, {});

ok('non rifiutata',        rifiutato, null);
ok('una riga di posta',    tavoli.posta.length, 1);
ok('stato nuova',          tavoli.posta[0].stato, 'nuova');
ok('con l\'oggetto',       tavoli.posta[0].oggetto, 'MSG - ODG 23 del 12.11.2026');
ok('allegato nel secchio', salvati.length, 1);

/* Questo e' il controllo che mancava. Tre membri, tre avvisi: se la
   chiamata ad avvisaPosta si rompe — per un import dimenticato o per
   qualunque altro motivo — qui ci sono zero righe, e si vede subito. */
ok('un avviso per ogni membro', tavoli.push_appuntamenti.length, 3);
ok('a tutti e tre',
   tavoli.push_appuntamenti.map(a => a.user_id).sort(), ['u1', 'u2', 'u3']);
ok('di genere posta',
   [...new Set(tavoli.push_appuntamenti.map(a => a.genere))], ['posta']);
ok('col titolo giusto e l\'oggetto sotto',
   tavoli.push_appuntamenti[0].testo,
   'Nuovo ordine del giorno!\nMSG - ODG 23 del 12.11.2026');

console.log('\n── un piano di lavorazione si annuncia come piano ──');
azzera();
await posta.riceviPosta(messaggio(mail('MSG - PDL 8.pdf')), ENV, {});
ok('tre avvisi',  tavoli.push_appuntamenti.length, 3);
ok('col titolo del piano',
   (tavoli.push_appuntamenti[0].testo || '').split('\n')[0], 'Nuovo piano di lavorazione!');

console.log('\n── un allegato che non dice niente resta sul generico ──');
azzera();
await posta.riceviPosta(messaggio(mail('documento.pdf')), ENV, {});
ok('tre avvisi',  tavoli.push_appuntamenti.length, 3);
ok('generico',
   (tavoli.push_appuntamenti[0].testo || '').split('\n')[0], 'Nuova posta dalla produzione');

console.log('\n── una mail senza allegati non sveglia nessuno ──');
/* Gli auguri della produzione non sono un ordine del giorno. */
azzera();
const soloTesto = [
  'From: Produzione <produzione@esempio.it>', 'To: abc123@campobase.dev',
  'Subject: Buone feste', 'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8', '', 'Auguri a tutti.', ''
].join('\r\n');
await posta.riceviPosta(messaggio(soloTesto), ENV, {});
ok('la riga si scrive lo stesso', tavoli.posta.length, 1);
ok('ma nessun avviso',            tavoli.push_appuntamenti.length, 0);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
