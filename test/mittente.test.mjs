/* Di quale film e' questa mail.
 *
 * La posta si smistava solo per indirizzo di arrivo: la casella diceva
 * il film, e basta. Con un film alla volta funziona. Il guaio arriva al
 * film dopo: l'inoltro automatico di Outlook e' una regola che resta
 * dov'e', e se continua a puntare alla casella del film vecchio,
 * l'ordine del giorno del film nuovo si deposita nel film vecchio e la
 * sua troupe — otto persone su Missione San Gennaro — riceve la
 * notifica di un documento che non la riguarda.
 *
 * Il primo tentativo guardava chi aveva mandato la mail, e sui dati veri
 * non funzionava: Outlook non redirige, REINVIA. Busta e intestazione
 * From: portano l'indirizzo di chi inoltra — identico per tutti i film.
 * Sei mail vere in tabella, sei volte simone.panetta@hotmail.it in
 * entrambi i campi. Un controllo appoggiato li' sarebbe stato inerte.
 *
 * I corpi qui sotto sono quelli veri, copiati dalla tabella posta: due
 * forme diverse, perche' l'inoltro dal computer e quello dal telefono
 * scrivono il blocco in testa in due modi. Una finta inventata da me
 * avrebbe dimostrato soltanto che il codice legge quello che ho scritto
 * io.
 *
 * I due controlli che contano piu' di tutti sono quelli al contrario:
 * con le colonne vuote non deve cambiare niente, e una mail si
 * trattiene solo quando TUTTI E DUE i segnali dicono no. Trattenere per
 * sbaglio vuol dire un ordine del giorno che alle sei del mattino non
 * c'e'.
 */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const ENV = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave',
              VAPID_PRIVATA: 'woQ2JLSHiHdgAJQzBzmqSTt8O7FTeTXjePDUGT8rlNQ' };

const PRODUZIONE = 'missionesangennaroproduzione@gmail.com';

let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(50)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

// ── I corpi veri ────────────────────────────────────────────────────────────

/* Reinvio da Outlook sul computer: riga di separazione e blocco "Da:".
   Nel Cc ci sono altri quattro indirizzi, tutti su gmail come quello
   della produzione: e' il motivo per cui un dominio non basta e
   l'indirizzo va messo intero. */
const CORPO_OUTLOOK = [
  '________________________________',
  'Da: Missione San Gennaro Produzione <' + PRODUZIONE + '>',
  'Inviato: giovedì 12 novembre 2026 14:44:43 (UTC+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna',
  'A: Missione San Gennaro Produzione <' + PRODUZIONE + '>',
  'Cc: Alex Marano <marano.ax@gmail.com>; MC De Gregorio <mcdegregorio.produzione@gmail.com>;'
    + ' Attilio Montagna <Attiliomontagna1@gmail.com>; Alessandro Iannone <alessandroiannone80@gmail.com>',
  'Oggetto: MSG_ACCOMMODATION NAPOLI', ''
].join('\r\n');

/* Inoltro dal telefono: "Inizio messaggio inoltrato:" e nessuna riga di
   separazione. Stesso indirizzo, posto diverso. */
const CORPO_TELEFONO = [
  'Simone', '',
  'Inizio messaggio inoltrato:', '',
  'Da: Missione San Gennaro Produzione <' + PRODUZIONE + '>',
  'Data: 11 novembre 2026 alle ore 17:01:16 CET',
  'A: Missione San Gennaro Produzione <' + PRODUZIONE + '>',
  'Oggetto: MSG - ODG #23 del 12.11.2026 + Giri Auto, Stralci, Mappa', '',
  'Cari tutti,', '', 'Invio in allegato', '- ODG #23 del 12.11.2026', '- Giri Auto', '',
  'Set', 'Relais Histò San Pietro sul Mar Piccolo', '', 'Grazie', 'Aless', ''
].join('\r\n');

/* E il film dopo: altra produzione, altro prefisso nell'oggetto. */
const CORPO_ALTRO_FILM = [
  '________________________________',
  'Da: La Promessa Produzione <produzione.lapromessa@gmail.com>',
  'Inviato: lunedì 8 dicembre 2026 18:12:00',
  'A: La Promessa Produzione <produzione.lapromessa@gmail.com>',
  'Oggetto: LP - ODG #1 del 09.12.2026', ''
].join('\r\n');

// ── Il mondo finto ──────────────────────────────────────────────────────────
let tavoli, salvati, rifiutato;

function azzera(mittente = null, marcatore = null) {
  tavoli = {
    projects: [{ id: 'f1', casella: 'abc123', titolo: 'Missione San Gennaro',
                 mittente, marcatore, user_id: 'u1' }],
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

// ── La mail, come la consegna l'inoltro ─────────────────────────────────────
const CONFINE = 'xxBOUNDARYxx';

/* Chi consegna e' sempre Simone: e' il reinvio di Outlook, ed e' il dato
   vero. From: uguale alla busta, come nelle sei mail in tabella. */
function mail(oggetto, corpo, nomeAllegato = 'MSG - ODG 23.pdf') {
  const pdf = Buffer.from('%PDF-1.4 finto').toString('base64');
  return [
    'From: simone panetta <simone.panetta@hotmail.it>',
    'To: abc123@campobase.dev',
    'Subject: ' + oggetto,
    'Message-ID: <uno@hotmail.it>',
    'Date: Wed, 11 Nov 2026 17:05:00 +0100',
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${CONFINE}"`,
    '',
    `--${CONFINE}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    corpo,
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
    from: 'simone.panetta@hotmail.it',
    rawSize: byte.length,
    raw: new ReadableStream({ start(c) { c.enqueue(byte); c.close(); } }),
    setReject: (m) => { rifiutato = m; }
  };
}

const posta = await import(RADICE + '/worker/posta.js');
const { postaDelFilm } = posta;

// ── Il giudizio, da solo ────────────────────────────────────────────────────
const g = (film, mail) => postaDelFilm(film, mail).suo;

console.log('\n── ⚠ colonne vuote: non si controlla niente ──');
/* Oggi sono vuote su tutti i film. Un controllo che si accendesse da
   solo tratterrebbe l'ordine del giorno di stasera. */
ok('nessuna delle due',
   g({}, { envelope: 'x@y.it', testo: CORPO_ALTRO_FILM, oggetto: 'LP - ODG #1' }), true);
ok('vuote per modo di dire',
   g({ mittente: '  ', marcatore: '' }, { testo: CORPO_ALTRO_FILM, oggetto: 'LP' }), true);

console.log('\n── l\'indirizzo della produzione, dentro il corpo ──');
const MSG = { mittente: PRODUZIONE, marcatore: 'MSG' };
ok('reinvio da Outlook',
   g(MSG, { envelope: 'simone.panetta@hotmail.it', da: 'simone panetta <simone.panetta@hotmail.it>',
            testo: CORPO_OUTLOOK, oggetto: 'I: MSG_ACCOMMODATION NAPOLI' }), true);
ok('inoltro dal telefono',
   g(MSG, { envelope: 'simone.panetta@hotmail.it', testo: CORPO_TELEFONO,
            oggetto: 'Fwd: MSG - ODG #23 del 12.11.2026 + Giri Auto, Stralci, Mappa' }), true);

console.log('\n── ⚠ il film dopo, nella casella di questo ──');
/* Il caso vero: comincia il film nuovo, la regola di Outlook e' ancora
   quella di prima. Prima di oggi questa finiva dentro Missione San
   Gennaro e otto persone ricevevano la notifica. */
ok('messa da parte',
   g(MSG, { envelope: 'simone.panetta@hotmail.it', testo: CORPO_ALTRO_FILM,
            oggetto: 'I: LP - ODG #1 del 09.12.2026' }), false);
ok('e si sa perche\'',
   /lapromessa/.test(postaDelFilm(MSG, { testo: CORPO_ALTRO_FILM, oggetto: 'LP' }).perche), true);

console.log('\n── ⚠ basta un segnale: si trattiene solo se sbagliano tutti e due ──');
/* Due segnali indipendenti che sbagliano insieme sono molto piu' rari di
   uno, e il prezzo di un errore e' asimmetrico: una notifica di troppo
   si ignora, un ordine del giorno che non arriva no. */
ok('oggetto senza MSG ma indirizzo giusto',
   g(MSG, { testo: CORPO_TELEFONO, oggetto: 'Documenti di domani' }), true);
ok('indirizzo sconosciuto ma MSG nell\'oggetto',
   g(MSG, { testo: CORPO_ALTRO_FILM, oggetto: 'MSG - ODG #24' }), true);
ok('nessuno dei due',
   g(MSG, { testo: CORPO_ALTRO_FILM, oggetto: 'LP - ODG #1' }), false);

console.log('\n── ⚠ sul dubbio passa ──');
/* Un corpo senza nemmeno un indirizzo non e' la mail di un altro film:
   e' una mail che non abbiamo saputo leggere. */
ok('corpo senza indirizzi, solo mittente atteso',
   g({ mittente: PRODUZIONE }, { testo: 'Ciao, ecco i documenti.', oggetto: 'Documenti' }), true);
ok('oggetto vuoto, solo marcatore',
   g({ marcatore: 'MSG' }, { testo: CORPO_ALTRO_FILM, oggetto: '' }), true);
ok('corpo vuoto e oggetto vuoto',
   g(MSG, { testo: '', oggetto: '' }), true);
/* Ma con il marcatore attivo e un oggetto leggibile si trattiene, anche
   se il corpo non dice niente: qualcosa da riconoscere c'era. */
ok('oggetto leggibile che non porta il marcatore',
   g({ marcatore: 'MSG' }, { testo: 'niente indirizzi qui', oggetto: 'Buone feste' }), false);

console.log('\n── come si scrivono le colonne ──');
ok('due indirizzi, virgola',
   g({ mittente: 'a@uno.it, ' + PRODUZIONE }, { testo: CORPO_TELEFONO, oggetto: '' }), true);
ok('dominio con la chiocciola',
   g({ mittente: '@produzione.it' }, { testo: 'Da: X <odg@produzione.it>', oggetto: '' }), true);
/* "gmail.com" prenderebbe qualunque film: l'indirizzo intero no. */
ok('indirizzo intero non prende i vicini di casa',
   g({ mittente: PRODUZIONE }, { testo: 'Da: Altri <marano.ax@gmail.com>', oggetto: '' }), false);
ok('marcatore con spazi dentro',
   g({ marcatore: 'MSG - ODG' }, { testo: '', oggetto: 'I: MSG - ODG #23 del 12.11' }), true);
ok('e non si spezza sullo spazio',
   g({ marcatore: 'MSG - ODG' }, { testo: '', oggetto: 'LP - ODG #1' }), false);
ok('due marcatori',
   g({ marcatore: 'MSG, Missione' }, { testo: '', oggetto: 'Missione San Gennaro: nota' }), true);
ok('i prefissi di inoltro non contano',
   g({ marcatore: 'MSG' }, { testo: '', oggetto: 'I: Fwd: I: MSG - ODG #23' }), true);
ok('maiuscole e minuscole',
   g({ marcatore: 'msg' }, { testo: '', oggetto: 'MSG - ODG #23' }), true);

// ── La mail intera, dall'arrivo alla notifica ──────────────────────────────
console.log('\n── ⚠ con le colonne vuote la troupe viene avvisata come sempre ──');
azzera(null, null);
await posta.riceviPosta(messaggio(mail('I: MSG - ODG #23', CORPO_TELEFONO)), ENV, {});
ok('stato nuova',               tavoli.posta[0].stato, 'nuova');
ok('allegato salvato',          salvati.length, 1);
ok('tutta la troupe avvisata',  tavoli.push_appuntamenti.length, 3);

console.log('\n── colonne piene, mail di questo film: tutto come prima ──');
azzera(PRODUZIONE, 'MSG');
await posta.riceviPosta(messaggio(mail('I: MSG - ODG #23 del 12.11.2026', CORPO_TELEFONO)), ENV, {});
ok('stato nuova',               tavoli.posta[0].stato, 'nuova');
ok('senza nota',                tavoli.posta[0].nota, undefined);
ok('tutta la troupe avvisata',  tavoli.push_appuntamenti.length, 3);
ok('col titolo dell\'ordine del giorno',
   (tavoli.push_appuntamenti[0].testo || '').split('\n')[0], 'Nuovo ordine del giorno!');

console.log('\n── l\'ordine del giorno del film dopo si ferma qui ──');
azzera(PRODUZIONE, 'MSG');
await posta.riceviPosta(messaggio(mail('I: LP - ODG #1 del 09.12.2026', CORPO_ALTRO_FILM,
                                       'LP - ODG 1.pdf')), ENV, {});
ok('messa da parte',            tavoli.posta[0].stato, 'da verificare');
ok('non rifiutata al mittente', rifiutato, null);
ok('l\'allegato si salva lo stesso', salvati.length, 1);

console.log('\n── e il capo lo viene a sapere ──');
/* Se il controllo sbaglia, rimediare e' una riga di SQL: ma bisogna
   sapere che c'e' da rimediare. Sotto il titolo c'e' l'oggetto, non il
   mittente — il mittente dopo un reinvio e' sempre lo stesso e non dice
   niente; l'oggetto si riconosce a occhio. */
ok('un avviso solo',            tavoli.push_appuntamenti.length, 1);
ok('al capo, non alla troupe',  tavoli.push_appuntamenti.map(a => a.user_id), ['u1']);
ok('col titolo giusto',
   (tavoli.push_appuntamenti[0].testo || '').split('\n')[0], 'Mail messa da parte');
ok('e l\'oggetto sotto, senza i prefissi',
   (tavoli.push_appuntamenti[0].testo || '').split('\n')[1], 'LP - ODG #1 del 09.12.2026');

console.log('\n── senza riga capo l\'avviso va al proprietario ──');
/* Un film aperto dopo troupe.sql entra in film_membri come 'membro': la
   riga 'capo' non c'e', e senza ripiego l'avviso non andrebbe a
   nessuno. */
azzera(PRODUZIONE, 'MSG');
tavoli.film_membri = tavoli.film_membri.map(m => ({ ...m, ruolo: 'membro' }));
await posta.riceviPosta(messaggio(mail('I: LP - ODG #1', CORPO_ALTRO_FILM)), ENV, {});
ok('messa da parte',            tavoli.posta[0].stato, 'da verificare');
ok('avvisato il proprietario',  tavoli.push_appuntamenti.map(a => a.user_id), ['u1']);

console.log('\n── una mail illeggibile non si trattiene ──');
/* Se l'apertura del messaggio fallisce lo stato e' 'errore' e il
   controllo non gira: non si e' capito niente, e non capire non e' un
   motivo per trattenere. */
azzera(PRODUZIONE, 'MSG');
const rotta = messaggio('non e\' una mail');
rotta.raw = new ReadableStream({ start(c) { c.error(new Error('stream rotto')); } });
await posta.riceviPosta(rotta, ENV, {});
ok('stato errore',              tavoli.posta[0].stato, 'errore');
ok('non messa da parte',        tavoli.posta[0].stato === 'da verificare', false);
ok('e nessuno svegliato',       tavoli.push_appuntamenti.length, 0);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
