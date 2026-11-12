/* Da chi arriva la posta.
 *
 * La posta si smistava solo per indirizzo di arrivo: la casella dice il
 * film, e basta. Con un film alla volta funziona. Il guaio arriva al
 * film dopo: l'inoltro automatico di Outlook e' una regola che resta
 * dov'e', e se continua a puntare alla casella del film vecchio,
 * l'ordine del giorno del film nuovo si deposita nel film vecchio e la
 * sua troupe — otto persone su Missione San Gennaro — riceve la
 * notifica di un documento che non la riguarda.
 *
 * Qui si controlla la cosa piu' importante, che e' quella che va al
 * contrario: con projects.mittente vuoto non deve cambiare NIENTE.
 * Il campo esiste da troupe.sql e su tutti i film e' nullo; un controllo
 * che si attiva da solo tratterrebbe gli ordini del giorno di stasera.
 *
 * E quando una mail viene trattenuta, qualcuno lo deve sapere: una mail
 * messa da parte in silenzio e' esattamente il difetto che questo
 * controllo dovrebbe prevenire, visto da un'altra parte.
 */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ENV = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave',
              VAPID_PRIVATA: 'woQ2JLSHiHdgAJQzBzmqSTt8O7FTeTXjePDUGT8rlNQ' };

let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(48)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

// ── Il mondo finto ──────────────────────────────────────────────────────────
let tavoli, salvati, rifiutato;

/* `atteso` e' quello che sta in projects.mittente: null = come prima. */
function azzera(atteso = null) {
  tavoli = {
    projects: [{ id: 'f1', casella: 'abc123', titolo: 'Missione',
                 mittente: atteso, user_id: 'u1' }],
    film_membri: [{ project_id: 'f1', user_id: 'u1', ruolo: 'capo' },
                  { project_id: 'f1', user_id: 'u2', ruolo: 'membro' },
                  { project_id: 'f1', user_id: 'u3', ruolo: 'membro' }],
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

  if (u.pathname.startsWith('/storage/v1/object/')) {
    salvati.push(u.pathname.replace('/storage/v1/object/', ''));
    return risposta({ Key: 'ok' });
  }

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

// ── Una mail con un ordine del giorno dentro ────────────────────────────────
const CONFINE = 'xxBOUNDARYxx';

/* `da` e' l'intestazione From:, `envelope` e' chi l'ha consegnata. Sono
   due cose diverse, ed e' tutto il punto: quando Outlook inoltra da solo
   consegna lui, e l'envelope dice l'indirizzo di Simone anche se la mail
   l'ha scritta la produzione. Un controllo sul solo envelope non
   distinguerebbe un film dall'altro. */
function mail(da, nomeAllegato = 'MSG - ODG 23.pdf') {
  const pdf = Buffer.from('%PDF-1.4 finto').toString('base64');
  return [
    'From: ' + da,
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

function messaggio(testo, envelope = 'simone@studio.it') {
  const byte = new TextEncoder().encode(testo);
  return {
    to: 'abc123@campobase.dev',
    from: envelope,
    rawSize: byte.length,
    raw: new ReadableStream({ start(c) { c.enqueue(byte); c.close(); } }),
    setReject: (m) => { rifiutato = m; }
  };
}

const posta = await import(RADICE + '/worker/posta.js');
const { mittenteCombacia } = posta;

// ── Il confronto, da solo ───────────────────────────────────────────────────
console.log('\n── chi combacia e chi no ──');
const c = (atteso, ...visti) => mittenteCombacia(atteso, ...visti);

ok('indirizzo intero',        c('odg@prod.it', 'odg@prod.it'), true);
ok('indirizzo intero, altro', c('odg@prod.it', 'ciao@prod.it'), false);
ok('dominio con la chiocciola', c('@prod.it', 'chiunque@prod.it'), true);
ok('dominio nudo',            c('prod.it', 'chiunque@prod.it'), true);
ok('sottodominio',            c('prod.it', 'x@mail.prod.it'), true);
ok('dominio diverso',         c('prod.it', 'x@altraprod.it'), false);
/* "prod.it" non deve prendersi "nonprod.it": il confronto si attacca al
   punto o alla chiocciola, non alla fine della stringa. */
ok('non basta finire uguale', c('prod.it', 'x@nonprod.it'), false);
ok('piu\' voci, virgola',     c('a@uno.it, @due.it', 'tizio@due.it'), true);
ok('piu\' voci, spazio',      c('a@uno.it @due.it', 'a@uno.it'), true);
ok('piu\' voci, nessuna',     c('a@uno.it, @due.it', 'tizio@tre.it'), false);
ok('maiuscole',               c('@Prod.IT', 'X@PROD.IT'), true);
ok('dentro un From: intero',  c('@prod.it', 'Produzione Srl <odg@prod.it>'), true);
ok('basta che combaci uno',   c('@prod.it', 'simone@studio.it', 'odg@prod.it'), true);

console.log('\n── ⚠ sul dubbio si passa, non si trattiene ──');
/* Trattenere per sbaglio l'ordine del giorno vuol dire che la mattina
   alle sei non c'e'. Lasciar passare una mail di troppo vuol dire una
   notifica da ignorare. Non e' lo stesso prezzo, e il codice lo sa. */
ok('niente atteso: passa tutto',    c(null, 'chiunque@dove.it'), true);
ok('atteso vuoto: passa tutto',     c('   ', 'chiunque@dove.it'), true);
ok('nessun indirizzo leggibile',    c('@prod.it', 'Produzione'), true);
ok('mittenti vuoti',                c('@prod.it', '', null), true);

// ── La mail intera ──────────────────────────────────────────────────────────
console.log('\n── ⚠ con projects.mittente vuoto non cambia niente ──');
/* Il campo e' nullo su tutti i film di oggi. Se questo controllo si
   accendesse da solo, stasera l'ordine del giorno non arriverebbe a
   nessuno. */
azzera(null);
await posta.riceviPosta(messaggio(mail('Produzione <odg@prod.it>')), ENV, {});
ok('stato nuova',               tavoli.posta[0].stato, 'nuova');
ok('allegato salvato',          salvati.length, 1);
ok('tutta la troupe avvisata',  tavoli.push_appuntamenti.length, 3);

console.log('\n── il mittente atteso: la mail entra come sempre ──');
azzera('@prod.it');
await posta.riceviPosta(messaggio(mail('Produzione <odg@prod.it>')), ENV, {});
ok('stato nuova',               tavoli.posta[0].stato, 'nuova');
ok('senza nota',                tavoli.posta[0].nota, undefined);
ok('tutta la troupe avvisata',  tavoli.push_appuntamenti.length, 3);

console.log('\n── ⚠ il film dopo, nella casella di questo ──');
/* Il caso vero: comincia il film nuovo, la regola di Outlook e' ancora
   quella di prima, e l'ordine del giorno di un'altra produzione arriva
   qui. Prima di oggi finiva dentro Missione San Gennaro e otto persone
   ricevevano la notifica. */
azzera('@prod.it');
await posta.riceviPosta(messaggio(mail('Altra Produzione <odg@altrofilm.it>')), ENV, {});
ok('messa da parte',            tavoli.posta[0].stato, 'da verificare');
ok('con scritto perche\'',      /altrofilm\.it/.test(tavoli.posta[0].nota || ''), true);
ok('l\'allegato si salva lo stesso', salvati.length, 1);

console.log('\n── e il capo lo viene a sapere ──');
/* Perche' se il controllo sbaglia, il rimedio e' una riga di SQL: ma
   bisogna sapere che c'e' da rimediare. */
ok('un avviso solo',            tavoli.push_appuntamenti.length, 1);
ok('al capo, non alla troupe',  tavoli.push_appuntamenti.map(a => a.user_id), ['u1']);
ok('dice cos\'e\' successo',
   (tavoli.push_appuntamenti[0].testo || '').split('\n')[0], 'Mail messa da parte');
ok('e da chi era arrivata',
   /altrofilm\.it/.test(tavoli.push_appuntamenti[0].testo || ''), true);

console.log('\n── l\'envelope di Outlook non si confonde con la produzione ──');
/* L'inoltro automatico consegna a nome di Simone: se il controllo
   guardasse solo l'envelope, ogni mail inoltrata risulterebbe di Simone
   e nessuna combacerebbe mai con il mittente del film. */
azzera('@prod.it');
await posta.riceviPosta(messaggio(mail('Produzione <odg@prod.it>'), 'simone@studio.it'), ENV, {});
ok('passa guardando il From:',  tavoli.posta[0].stato, 'nuova');
ok('troupe avvisata',           tavoli.push_appuntamenti.length, 3);

console.log('\n── senza riga capo l\'avviso va al proprietario ──');
/* Un film aperto dopo troupe.sql entra in film_membri come 'membro': la
   riga 'capo' non c'e', e senza ripiego l'avviso non andrebbe a
   nessuno. */
azzera('@prod.it');
tavoli.film_membri = tavoli.film_membri.map(m => ({ ...m, ruolo: 'membro' }));
await posta.riceviPosta(messaggio(mail('Altra <odg@altrofilm.it>')), ENV, {});
ok('messa da parte',            tavoli.posta[0].stato, 'da verificare');
ok('avvisato il proprietario',  tavoli.push_appuntamenti.map(a => a.user_id), ['u1']);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
