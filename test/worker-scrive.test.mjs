/* Il server scrive l'ordine del giorno per tutta la troupe.
 *
 * Con OMBRA_SCRIVE = "si" la mail con l'ordine del giorno non la analizza
 * piu' il primo telefono: la legge il Worker, scrive l'ordine del giorno
 * dove i telefoni lo cercano e manda a ognuno la sua notifica.
 *
 * E' il pezzo in cui un errore lo vede tutta la troupe, quindi qui si
 * controlla soprattutto quando le cose vanno male:
 *   - se il server non riesce, per qualunque motivo, la mail torna al
 *     telefono e parte la notifica di sempre — una volta sola;
 *   - finche' il server lavora i telefoni non analizzano e nessuno riceve
 *     una notifica senza niente dietro;
 *   - spento, non cambia niente.
 */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(52)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

const BASE = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave', ANTHROPIC_API_KEY: 'sk-finta',
               VAPID_PRIVATA: 'woQ2JLSHiHdgAJQzBzmqSTt8O7FTeTXjePDUGT8rlNQ' };
const ACCESO = { ...BASE, OMBRA_SCRIVE: 'si' };

/* Un ordine del giorno di un giorno che deve ancora venire, letto bene. */
const LETTO = {
  numero: '25', data: '2099-01-10', convocazione: '12.30', prontiAGirare: '13.30', pausa: 'Continuato',
  catering: '12.45', cestini: '130', fineRiprese: '19.00', fineLavorazione: '19.30',
  ambiente: 'CHIESA PAESE', pagine: '6 6/8', meteo: 'Nuvoloso', ospedale: 'OSPEDALE SAN GIUSEPPE MOSCATI - VIA PER MARTINA FRANCA',
  dawn: '06:36', alba: '07.03', tramonto: '17.59', dusk: '18.25',
  luoghi: [{ nome: 'CB/ MEZZI TECNICI', url: 'https://maps.app.goo.gl/abc?g_st=iw', indirizzo: '' },
           { nome: 'LOCATION', url: '', indirizzo: 'SEMINARIO ARCIVESCOVILE' },
           { nome: 'SET', url: 'non è un link', indirizzo: 'Viale Colli Aminei, 3, 80131 Napoli NA' },
           { nome: 'PARCHEGGIO', url: '', indirizzo: '' }],
  contatti: [{ ruolo: 'Direttore di prod.', nome: 'Attilio Montagna', tel: '333 9973678' }],
  scene: [{ n: '58END', ie: 'I', m: 'G', ambiente: 'CHIESA PAESE', sinossi: 'Il tesoro.', ids: '1, 2', pag: '6 6/8' },
          { n: '', nota: 'TRASFERIMENTO' }],
  cast: [{ id: '1', ruolo: 'PRINCIPE COLONNA', interprete: 'ROCCO PAPALEO', scene: '58END', pickup: '11.00', set: '13.15' },
         { id: '8', ruolo: 'INVITATI', interprete: '', scene: '58END', pickup: '--', set: '14.00' }],
  troupe: [{ reparto: 'SUONO', ruolo: 'Microfonista', nome: 'S. Panetta', partenza: '', set: '12.30' },
           { reparto: 'FOTOGRAFIA', ruolo: 'Data Manager', nome: 'V. Leone', partenza: '13.30', set: '' },
           { reparto: 'COSTUMI', ruolo: 'Costumista', nome: 'R. Aprea', partenza: '', set: 'O.C.' }],
  fabbisogni: [{ reparto: 'Suono', voci: [{ scene: '58END', cosa: 'Playback' }, { scene: '', cosa: '' }] }],
  domani: { etichetta: 'MARTEDI 17', scene: [{ n: '2', ie: 'E', m: 'N' }], fabbisogni: [] },
  tratte: [
    { autista: 'Luca Cammarosano Van', tel: '339 8408475', partenza: '12.00', arrivo: '12.30', luogo: 'TURSPORT HOTEL RESIDENCE',
      destinazione: 'SET', passeggeri: ['F.Lombardi', 'D.De Angelis', 'S.Panetta'] },
    { autista: 'Luca Cammarosano', tel: '3398408475', partenza: '13.00', luogo: 'TURSPORT HOTEL RESIDENCE', passeggeri: ['V.Leone'] },
    { autista: 'Antonio Varriale', partenza: '12.30', luogo: 'SET', passeggeri: [] }]
};

const { datiPerApp, leggibile, pagineNumero, dataEstesa, notificaOdg, convocazioneDi } = await import(RADICE + '/worker/scrive.js');

console.log('\n── dalla lettura all\'ordine del giorno dell\'app ──');
const RIGA0 = { id: 'p1', project_id: 'f1', allegati: [
  { nome: 'MSG - ODG _25 del 14.11.2026.pdf', tenuto: true, percorso: 'f1/p1/odg.pdf', byte: 1 },
  { nome: '25 MSG - GIRI AUTO di Sabato 14.11.pdf', tenuto: true, percorso: 'f1/p1/giri.pdf', byte: 2 },
  { nome: 'MSG - Stralci DAY _25.pdf', tenuto: true, percorso: 'f1/p1/stralci.pdf', byte: 3 },
  { nome: 'logo.png', tenuto: false }] };
const d = datiPerApp(LETTO, RIGA0, Date.parse('2099-01-09T20:00:00Z'));
ok('segnato come scritto dal server', d.daServer, true);
ok('gli orari col punto', [d.dawn, d.convocazione, d.fineLavorazione], ['06.36', '12.30', '19.30']);
ok('le pagine come numero', d.pagine, 6.75);
ok('i viaggi coi nomi che vuole l\'app', d.tratte[0].nomi, ['F.Lombardi', 'D.De Angelis', 'S.Panetta']);
ok('l\'autista senza il mezzo', d.tratte[0].autista, 'Luca Cammarosano');
ok('il telefono in sole cifre', d.tratte[0].tel, '3398408475');
ok('un van senza passeggeri non è un viaggio', d.tratte.length, 2);
ok('⚠ un posto senza link ma con l\'indirizzo resta', d.luoghi.map(l => [l.nome, l.url ? 'link' : '', l.indirizzo]),
   [['CB/ MEZZI TECNICI','link',''], ['LOCATION','','SEMINARIO ARCIVESCOVILE'], ['SET','','Viale Colli Aminei, 3, 80131 Napoli NA']]);
ok('"--" non è un pick-up', d.cast[1].pickup, '');
ok('gli stacchi restano', d.scene[1].nota, 'TRASFERIMENTO');
ok('una voce vuota dei fabbisogni no', d.fabbisogni[0].voci.length, 1);
ok('gli allegati col loro tipo', d.allegati.map(a => a.tipo), ['odg', 'giri', 'stralci']);
ok('e il PDF dell\'ordine del giorno', d.percorso, 'f1/p1/odg.pdf');
ok('niente testo, niente pick-up: li fa il telefono', [d.testo, d.giriTesto, d.pickup], [undefined, undefined, undefined]);
ok('"6 6/8"', pagineNumero('6 6/8'), 6.75);
ok('"7/8"', pagineNumero('7/8'), 0.875);
ok('"3"', pagineNumero('3'), 3);
ok('una scritta non è un numero', pagineNumero('tante'), null);

console.log('\n── ⚠ gli avvisi della produzione, dal testo della mail ──');
{ const { avvisiDallaMail } = await import(RADICE + '/worker/scrive.js');
  const MAIL = `Cari tutti,
Inviamo in allegato
- ODG #26 del 17.11.2026
- Giri Auto

NB:
Ricordiamo che il Seminario Arcivescovile Ascalesi è una struttura religiosa.
Vi chiediamo pertanto di mantenere un comportamento rispettoso e un tono di voce adeguato durante tutta la
permanenza in location, prestando particolare attenzione agli ambienti e agli spazi comuni.
Grazie
Alessia Ida
Mob. +39 3397564743`;
  const VERO1 = 'Ricordiamo che il Seminario Arcivescovile Ascalesi è una struttura religiosa.';
  const VERO2 = 'Vi chiediamo pertanto di mantenere un comportamento rispettoso e un tono di voce adeguato durante tutta la permanenza in location, prestando particolare attenzione agli ambienti e agli spazi comuni.';
  ok('copiati parola per parola: restano', avvisiDallaMail([VERO1, VERO2], MAIL), [VERO1, VERO2]);
  ok('⚠ uno riassunto o inventato: via', avvisiDallaMail([VERO1, 'La location è una chiesa: fate silenzio e vestitevi in modo adeguato.'], MAIL), [VERO1]);
  ok('gli a capo della mail non contano', avvisiDallaMail(['adeguato durante tutta la permanenza in location'], MAIL).length, 1);
  ok('in una mail inoltrata, coi ">" davanti', avvisiDallaMail([VERO1], MAIL.split('\n').map(r => '> ' + r).join('\n')), [VERO1]);
  ok('un pezzetto ("Grazie") non è un avviso', avvisiDallaMail(['Grazie'], MAIL), []);
  ok('lo stesso due volte, una', avvisiDallaMail([VERO1, VERO1], MAIL), [VERO1]);
  ok('senza testo della mail, nessun avviso', [avvisiDallaMail([VERO1], ''), avvisiDallaMail([VERO1], null), avvisiDallaMail(null, MAIL)], [[], [], []]);
  const conAvvisi = datiPerApp({ ...LETTO, avvisi: [VERO1, 'inventato di sana pianta dal modello'] }, { ...RIGA0, testo: MAIL });
  ok('⚠ nell\'ordine del giorno finiscono solo quelli veri', conAvvisi.avvisi, [VERO1]);
  ok('e senza mail la voce c\'è, vuota', d.avvisi, []);
}

console.log('\n── ⚠ quando non basta per mostrarlo ──');
ok('letto bene', leggibile(d), null);
ok('senza data', leggibile(datiPerApp({ ...LETTO, data: '14/11' }, RIGA0)), 'manca la data');
ok('senza convocazione', leggibile(datiPerApp({ ...LETTO, convocazione: '' }, RIGA0)), 'manca la convocazione');
ok('senza troupe', leggibile(datiPerApp({ ...LETTO, troupe: [] }, RIGA0)), 'manca la troupe');

console.log('\n── la notifica, una per persona ──');
ok('la data per esteso', dataEstesa('2026-11-14'), 'sabato 14 novembre');
ok('col suo pick-up', notificaOdg(d, { nome: 'Simone', cognome: 'Panetta' }, { ora: '12.00', luogo: 'TURSPORT HOTEL RESIDENCE' }),
   'OdG 25 · sabato 10 gennaio\nPick-up 12.00 · Tursport Hotel Residence\nConvocazione 12.30 · Fine lavorazione 19.30');
/* Fine LAVORAZIONE, non fine riprese: e' quando si chiudono i camion. */
ok('fine lavorazione, non fine riprese', /19\.30/.test(notificaOdg(d, {}, null)) && !/19\.00/.test(notificaOdg(d, {}, null)), true);
ok('chi non ha pick-up ha due righe', notificaOdg(d, { nome: 'Rossella', cognome: 'Aprea' }, null),
   'OdG 25 · sabato 10 gennaio\nConvocazione 12.30 · Fine lavorazione 19.30');
/* Il data manager e' convocato un'ora dopo, e il suo orario il modello
   l'ha messo sotto "partenza": vale lo stesso. */
ok('la convocazione è la sua', convocazioneDi(d, { nome: 'Valerio', cognome: 'Leone' }), '13.30');
ok('"O.C." non è un orario: vale la generale', convocazioneDi(d, { nome: 'Rossella', cognome: 'Aprea' }), '12.30');
ok('chi non è in troupe: la generale', convocazioneDi(d, { nome: 'Mario', cognome: 'Rossi' }), '12.30');

// ── Il mondo finto ──────────────────────────────────────────────────────────
let T, modello, rotto, documenti;
function mondo() {
  T = { projects: [{ id: 'f1', casella: 'abc123', titolo: 'Missione San Gennaro', user_id: 'u1', mittente: null, marcatore: null }],
        film_membri: [{ project_id: 'f1', user_id: 'u1' }, { project_id: 'f1', user_id: 'u2' }, { project_id: 'f1', user_id: 'u3' }],
        profiles: [{ id: 'u1', nome: 'Simone', cognome: 'Panetta' }, { id: 'u2', nome: 'Valerio', cognome: 'Leone' },
                   { id: 'u3', nome: 'Rossella', cognome: 'Aprea' }],
        posta: [], odg: [], push_appuntamenti: [], push_iscrizioni: [] };
  rotto = null;
  modello = () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify(LETTO) }] }), { status: 200 });
}
function passa(r, params) {
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'on_conflict'].includes(k)) continue;
    const [op, ...resto] = v.split('.'); const val = resto.join('.'); const c = r[k];
    if (op === 'is' && val === 'null' && c != null) return false;
    if (op === 'eq' && String(c) !== val) return false;
    if (op === 'neq' && String(c) === val) return false;
    if (op === 'in' && !val.replace(/[()"]/g, '').split(',').includes(String(c))) return false;
    if (op === 'gte' && !(c >= val)) return false;
    if (op === 'lt' && !(c != null && c < val)) return false;
  }
  return true;
}
let seq = 0;
globalThis.fetch = async (url, opz = {}) => {
  const u = new URL(url); const R = (x, s = 200) => new Response(x === null ? null : JSON.stringify(x), { status: s });
  if (u.hostname === 'api.anthropic.com') {
    documenti = JSON.parse(opz.body).messages[0].content.filter(c => c.type === 'text').map(c => c.text.split(' (')[0]);
    return modello();
  }
  if (u.pathname.startsWith('/storage/v1/object/sign/')) return R({ signedURL: '/object/sign/x?token=t' });
  if (u.pathname.startsWith('/storage/v1/object/')) return R({ Key: 'ok' });
  const tav = u.pathname.replace('/rest/v1/', '');
  if (!(tav in T)) return R({ message: 'tavola ignota ' + tav }, 404);
  if (rotto === tav && (opz.method || 'GET') !== 'GET') return R({ message: 'guasto finto' }, 500);
  const params = [...u.searchParams.entries()];
  const met = opz.method || 'GET';
  if (met === 'GET') {
    const t = T[tav].filter(r => passa(r, params));
    if (u.searchParams.get('order') === 'ricevuta.desc') t.sort((a, b) => String(b.ricevuta).localeCompare(String(a.ricevuta)));
    return R(t.slice(0, +(u.searchParams.get('limit') || 1000)));
  }
  if (met === 'PATCH') {
    let corpo; try { corpo = JSON.parse(opz.body); } catch { return R({ message: 'invalid json' }, 400); }
    const t = T[tav].filter(r => passa(r, params)); t.forEach(r => Object.assign(r, corpo)); return R(t);
  }
  if (met === 'POST') {
    const chiave = u.searchParams.get('on_conflict');
    for (const n of [].concat(JSON.parse(opz.body))) {
      const gia = chiave && T[tav].find(r => chiave.split(',').every(k => String(r[k]) === String(n[k])));
      if (gia) Object.assign(gia, n); else T[tav].push({ id: 'n' + (++seq), ...(tav === 'posta' ? { ricevuta: new Date().toISOString(), ombra_stato: null, ombra: null, ombra_il: null } : {}), ...n });
    }
    return R(null, 201);
  }
  return R(null, 204);
};

const CONFINE = 'xxB';
function mail(nomi, oggetto = 'I: MSG - ODG #25 del 14.11.2026', testoMail = 'ecco') {
  const pdf = Buffer.from('%PDF-1.4 finto').toString('base64');
  const corpo = ['From: simone <s@hotmail.it>', 'To: abc123@campobase.dev', 'Subject: ' + oggetto, 'Message-ID: <' + (++seq) + '@x>',
    'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${CONFINE}"`, '', `--${CONFINE}`, 'Content-Type: text/plain; charset=utf-8', '', testoMail, ''];
  for (const n of nomi) corpo.push(`--${CONFINE}`, `Content-Type: application/pdf; name="${n}"`, 'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${n}"`, '', pdf, '');
  corpo.push(`--${CONFINE}--`, '');
  const byte = new TextEncoder().encode(corpo.join('\r\n'));
  return { to: 'abc123@campobase.dev', from: 's@hotmail.it', rawSize: byte.length,
           raw: new ReadableStream({ start(c) { c.enqueue(byte); c.close(); } }), setReject() {} };
}
const ODG = 'MSG - ODG _25 del 14.11.2026.pdf', GIRI = '25 MSG - GIRI AUTO di Sabato 14.11.pdf';
const posta = await import(RADICE + '/worker/posta.js');
const { leggiInOmbra } = await import(RADICE + '/worker/ombra.js');
const { rilasciaInRitardo } = await import(RADICE + '/worker/scrive.js');
const titoli = () => T.push_appuntamenti.filter(a => a.genere === 'posta').map(a => a.testo.split('\n')[0]);

console.log('\n── ⚠ spento: tutto come prima ──');
mondo();
await posta.riceviPosta(mail([ODG, GIRI]), BASE, {});
ok('la mail è "nuova"', T.posta[0].stato, 'nuova');
ok('la notifica parte subito, a tutti', titoli(), ['Nuovo ordine del giorno!', 'Nuovo ordine del giorno!', 'Nuovo ordine del giorno!']);
await leggiInOmbra(BASE);
ok('il server legge ma non scrive l\'ordine del giorno', [T.posta[0].ombra_stato, T.odg.length, T.posta[0].stato], ['fatta', 0, 'nuova']);

console.log('\n── acceso: la mail aspetta il server ──');
mondo();
await posta.riceviPosta(mail([ODG, GIRI]), ACCESO, {});
ok('la mail è "al server": i telefoni non la prendono', T.posta[0].stato, 'al server');
ok('e nessuna notifica, per ora', T.push_appuntamenti.length, 0);

console.log('\n── il server legge e scrive ──');
ok('letta', await leggiInOmbra(ACCESO), 'fatta');
ok('l\'ordine del giorno è dove i telefoni lo cercano', T.odg.map(o => [o.project_id, o.data, o.numero, o.user_id]), [['f1', '2099-01-10', 25, 'u1']]);
ok('scritto dal server, con i viaggi', [T.odg[0].dati.daServer, T.odg[0].dati.tratte.length], [true, 2]);
ok('la mail è chiusa: nessun telefono la analizza', [T.posta[0].stato, T.posta[0].nota], ['fatta', 'letta dal server']);
ok('resta scritto com\'è andata', [T.posta[0].ombra.scritto.scritto, T.posta[0].ombra.scritto.notifiche], [true, 3]);

console.log('\n── a ognuno la sua notifica ──');
const di = id => T.push_appuntamenti.find(a => a.user_id === id && a.genere === 'posta').testo;
ok('Panetta', di('u1'), 'OdG 25 · sabato 10 gennaio\nPick-up 12.00 · Tursport Hotel Residence\nConvocazione 12.30 · Fine lavorazione 19.30');
ok('Leone: un\'ora dopo, pick-up e convocazione', di('u2'),
   'OdG 25 · sabato 10 gennaio\nPick-up 13.00 · Tursport Hotel Residence\nConvocazione 13.30 · Fine lavorazione 19.30');
ok('Aprea non è nei giri auto', di('u3'), 'OdG 25 · sabato 10 gennaio\nConvocazione 12.30 · Fine lavorazione 19.30');
ok('una notifica a testa, non di più', T.push_appuntamenti.filter(a => a.genere === 'posta').length, 3);
ok('più i pick-up di chi ce l\'ha', T.push_appuntamenti.filter(a => a.genere === 'pickup').map(a => a.chiave).sort(), ['u1:pickup:2099-01-10', 'u2:pickup:2099-01-10']);
ok('e il catering di tutti', T.push_appuntamenti.filter(a => a.genere === 'catering').length, 3);

console.log('\n── ⚠ il server non ce la fa: torna al telefono ──');
const cade = async (nome, prepara, atteso) => {
  mondo(); await posta.riceviPosta(mail([ODG, GIRI]), ACCESO, {}); prepara();
  await leggiInOmbra(ACCESO);
  ok(nome + ': la mail torna "nuova"', T.posta[0].stato, 'nuova');
  ok(nome + ': parte la notifica di sempre, una a testa', titoli(), ['Nuovo ordine del giorno!', 'Nuovo ordine del giorno!', 'Nuovo ordine del giorno!']);
  ok(nome + ': ' + atteso[0], atteso[1](), atteso[2]);
};
await cade('il modello non risponde', () => { modello = () => new Response('{"error":"overloaded"}', { status: 529 }); },
  ['nessun ordine del giorno scritto', () => T.odg.length, 0]);
await cade('risposta troncata', () => { modello = () => new Response(JSON.stringify({ stop_reason: 'max_tokens', usage: {},
  content: [{ type: 'text', text: JSON.stringify(LETTO) }] }), { status: 200 }); },
  ['nessun ordine del giorno scritto', () => T.odg.length, 0]);
await cade('risposta che non è JSON', () => { modello = () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: {},
  content: [{ type: 'text', text: '{"numero":"25","troupe":[{"nome":"A' }] }), { status: 200 }); },
  ['nessun ordine del giorno scritto', () => T.odg.length, 0]);
await cade('foglio letto senza convocazione', () => { modello = () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: {},
  content: [{ type: 'text', text: JSON.stringify({ ...LETTO, convocazione: '' }) }] }), { status: 200 }); },
  ['e si sa perché', () => /manca la convocazione/.test(T.posta[0].nota), true]);
await cade('la scrittura dell\'ordine del giorno fallisce', () => { rotto = 'odg'; },
  ['nessuna notifica con gli orari', () => T.push_appuntamenti.some(a => /Pick-up/.test(a.testo)), false]);

console.log('\n── ⚠ il server non parte proprio ──');
/* Nessuna lettura, per qualunque motivo: dopo quattro minuti la mail si
   rilascia da sola al primo passaggio del cron. */
mondo(); await posta.riceviPosta(mail([ODG, GIRI]), ACCESO, {});
ok('dopo due minuti aspetta ancora', await rilasciaInRitardo(ACCESO, Date.now() + 2 * 60000), 0);
ok('dopo cinque si rilascia', await rilasciaInRitardo(ACCESO, Date.now() + 5 * 60000), 1);
ok('torna al telefono, con la notifica', [T.posta[0].stato, titoli().length], ['nuova', 3]);
ok('e al passaggio dopo non si ripete', [await rilasciaInRitardo(ACCESO, Date.now() + 6 * 60000), titoli().length], [0, 3]);

console.log('\n── la stessa mail inoltrata due volte ──');
mondo();
await posta.riceviPosta(mail([ODG, GIRI]), ACCESO, {});
await leggiInOmbra(ACCESO);
await posta.riceviPosta(mail([ODG, GIRI], 'Fwd: MSG - ODG #25'), ACCESO, {});
T.posta[1].ricevuta = new Date(Date.now() + 1000).toISOString();
ok('la seconda si chiude senza rileggere', [await leggiInOmbra(ACCESO), T.posta[1].stato], ['saltata: doppione', 'fatta']);
ok('e senza altre notifiche', T.push_appuntamenti.filter(a => a.genere === 'posta').length, 3);

console.log('\n── ⚠ i giri auto, comunque si chiamino ──');
/* Visto davvero: "IS_TL_16.04.2026.pdf" e' una transport list. Dal nome
   non si riconosceva, il server leggeva solo l'ordine del giorno e
   l'ordine del giorno arrivava a tutti senza pick-up. */
const lettiTutto = async (nomi) => { mondo(); documenti = null; await posta.riceviPosta(mail(nomi), ACCESO, {}); await leggiInOmbra(ACCESO); return documenti; };
const letti = async (nomi) => (await lettiTutto(nomi)).filter(x => !/^TESTO DELLA MAIL/.test(x));
ok('⚠ al modello va anche il testo della mail, in fondo', (await lettiTutto([ODG, GIRI])).map(x => x.split(':')[0]), ['ORDINE DEL GIORNO', 'GIRI AUTO', 'TESTO DELLA MAIL']);
ok('"GIRI AUTO" nel nome', await letti([ODG, GIRI]), ['ORDINE DEL GIORNO', 'GIRI AUTO']);
ok('⚠ "TL" nel nome: è la transport list', await letti([ODG, 'IS_TL_16.04.2026.pdf']), ['ORDINE DEL GIORNO', 'GIRI AUTO']);
ok('⚠ un nome qualunque: al modello, col dubbio', await letti([ODG, 'Movimenti 16.04.pdf']), ['ORDINE DEL GIORNO', 'ALTRO ALLEGATO']);
ok('stralci, DOOD e alloggi no: non sono giri', await letti([ODG, 'Stralci Gio 16 Apr.pdf', 'MSG_DOOD.pdf', 'MSG_ACCOMMODATION NAPOLI.pdf']), ['ORDINE DEL GIORNO']);
ok('se i giri ci sono, l\'allegato strano non si legge', await letti([ODG, GIRI, 'Movimenti 16.04.pdf']), ['ORDINE DEL GIORNO', 'GIRI AUTO']);
ok('la transport list resta fra gli allegati come "giri"', (() => { const { allegati } = datiPerApp(LETTO, { id: 'p', project_id: 'f', allegati: [
  { nome: 'IS ODG_35 16.04.2026.pdf', tenuto: true, percorso: 'a' }, { nome: 'IS_TL_16.04.2026.pdf', tenuto: true, percorso: 'b' }] }); return allegati.map(a => a.tipo); })(), ['odg', 'giri']);

console.log('\n── cosa non passa dal server ──');
/* Il piano di lavorazione lo sa leggere solo il telefono. */
mondo(); await posta.riceviPosta(mail([ODG, GIRI, 'MSG - PDL rev 7.pdf']), ACCESO, {});
ok('una mail col piano: strada vecchia', [T.posta[0].stato, titoli()[0]], ['nuova', 'Nuovo piano di lavorazione!']);
mondo(); await posta.riceviPosta(mail(['MSG_ACCOMMODATION NAPOLI.pdf'], 'I: MSG_ACCOMMODATION'), ACCESO, {});
ok('una mail senza ordine del giorno: strada vecchia', [T.posta[0].stato, titoli()[0]], ['nuova', 'Nuova posta dalla produzione']);
// ── L'errata corrige ────────────────────────────────────────────────────────
const { tipoErrata, righeErrata, cambiPer, notificaErrata, siglaDa } = await import(RADICE + '/worker/scrive.js');

console.log('\n── ⚠ cosa cambia, dalle mail vere ──');
{ const N1 = `Cari tutti,\nInvio in allegato\n- ODG #7 del 24.10.2026\n- Giri Auto\nSet\nCava di Faggiano\nhttps://maps.app.goo.gl/vwV\nPer le colazioni\nTursport Hotel Residence\n6:30 Cornetto + caffè o cappuccino al banco\nGrazie\nAlessia Ida`;
  const E1 = `Buonasera,\n\ninviamo in allegato l’ODG #7 – ERRATA CORRIGE:\nANNULLIAMO LA CONVOCAZIONE DELL’ID 9 MONACO PER LA GIORNATA DI DOMANI.\nSet\nCava di Faggiano\nhttps://maps.app.goo.gl/vwV\nPer le colazioni\nTursport Hotel Residence\n6:30 Cornetto + caffè o cappuccino al banco\nGrazie\nAlessia Ida`;
  const E2 = `Cari tutti,\ninviamo in allegato l’ODG #4 – ERRATA CORRIGE aggiornato nei seguenti orari:\n- Precall posticipata alle ore 12:00\n- Convocazione posticipata alle ore 12:30\nSET MASSERIA LAMIE - Strada Vicinale Citrezze-Monteiasi\nIndicazioni per raggiungere il set:`;
  const N2 = `Cari tutti,\nInvio in allegato\n- ODG #4 del 21.10.2026\nSET MASSERIA LAMIE - Strada Vicinale Citrezze-Monteiasi\nIndicazioni per raggiungere il set:`;
  const E3 = `Buonasera,\nIn allegato errata corrige dell'ODG #DAY 22, con inseriti indirizzi location e mezzi tecnici.\nA domani,\n--\nVittoria Bertoldi`;
  const ANN = 'ANNULLIAMO LA CONVOCAZIONE DELL’ID 9 MONACO PER LA GIORNATA DI DOMANI.';
  ok('il modello le copia: restano', righeErrata(['- Precall posticipata alle ore 12:00', 'Convocazione posticipata alle ore 12:30'], E2, [N2]),
     ['Precall posticipata alle ore 12:00', 'Convocazione posticipata alle ore 12:30']);
  ok('⚠ una frase inventata dal modello: via', righeErrata(['La convocazione è alle 12:30 per tutti i reparti', 'Convocazione posticipata alle ore 12:30'], E2, [N2]),
     ['Convocazione posticipata alle ore 12:30']);
  ok('⚠ quello che la mail ripete ogni sera non è una correzione', righeErrata(['6:30 Cornetto + caffè o cappuccino al banco', ANN], E1, [N1]), [ANN]);
  ok('senza il modello, dal testo: la riga sotto l\'annuncio', righeErrata([], E1, [N1]), [ANN]);
  ok('senza il modello: l\'elenco, e l\'annuncio che lo introduce', righeErrata(null, E2, [N2]),
     ['inviamo in allegato l’ODG #4 – ERRATA CORRIGE aggiornato nei seguenti orari:', 'Precall posticipata alle ore 12:00', 'Convocazione posticipata alle ore 12:30']);
  ok('una frase sola che dice tutto', righeErrata([], E3, []), ["In allegato errata corrige dell'ODG #DAY 22, con inseriti indirizzi location e mezzi tecnici."]);
  ok('una mail normale non ha righe di errata', righeErrata([], N1, []), []);
}

console.log('\n── quando è un\'errata ──');
ok('lo dice l\'oggetto', tipoErrata({ id: 'p9', oggetto: 'I: MSG - ERRATA CORRIGE ODG #7' }, null), 'errata');
ok('lo dice il testo', tipoErrata({ id: 'p9', oggetto: 'ODG 7', testo: 'inviamo in allegato l’ODG #7 – ERRATA CORRIGE:' }, null), 'errata');
ok('lo dice il nome del file', tipoErrata({ id: 'p9', oggetto: 'ODG 7', allegati: [{ nome: 'ODG_7_ERRATA_CORRIGE.pdf' }] }, null), 'errata');
ok('⚠ un secondo foglio per lo stesso giorno, da un\'altra mail', tipoErrata({ id: 'p9', oggetto: 'ODG 7' }, { mail: 'p1' }), 'aggiornato');
ok('⚠ la stessa mail riletta non è un\'errata', tipoErrata({ id: 'p1', oggetto: 'ODG 7' }, { mail: 'p1' }), null);
ok('il primo foglio di un giorno', tipoErrata({ id: 'p1', oggetto: 'ODG 7' }, null), null);

console.log('\n── la sigla del film ──');
ok('dall\'oggetto inoltrato', siglaDa({ oggetto: 'I: MSG - ODG #25 del 14.11.2026' }), 'MSG');
ok('dal nome del file', siglaDa({ oggetto: 'ordine del giorno', allegati: [{ nome: 'IS_ODG_12_del_03.03.pdf' }] }), 'IS');
ok('dal piano', siglaDa({ oggetto: '', allegati: [{ nome: 'SPRZ_PDL7_03.11.pdf' }] }), 'SPRZ');
ok('con l\'errata davanti', siglaDa({ oggetto: 'Fwd: R: MSG - ERRATA CORRIGE ODG #7' }), 'MSG');
ok('⚠ senza sigla, niente a caso', [siglaDa({ oggetto: 'ODG #DAY 22 + STRALCI' }), siglaDa({ oggetto: 'I: Errata corrige ODG 4' }), siglaDa({ oggetto: 'Nuovo ODG 12' })], [null, null, null]);

console.log('\n── ⚠ un\'errata dall\'inizio alla fine ──');
mondo();
await posta.riceviPosta(mail([ODG, GIRI], 'I: MSG - ODG #25 del 14.11.2026', 'Cari tutti,\r\nInvio in allegato ODG e giri.\r\nSet\r\nChiesa del paese\r\nGrazie'), ACCESO, {});
await leggiInOmbra(ACCESO);
ok('il primo foglio non è un\'errata', [T.odg[0].dati.errata, T.posta[0].ombra.scritto.errata], [undefined, null]);
ok('la sigla trovata nell\'oggetto è scritta sul film', T.projects[0].sigla, 'MSG');
T.posta[0].ricevuta = new Date(Date.now() - 3600000).toISOString();
T.push_appuntamenti.length = 0;
// La produzione corregge: mezz'ora dopo per tutti, e Leone esce dai giri.
const CORRETTO = { ...LETTO, convocazione: '13.00', fineLavorazione: '20.00',
  errata: ['Convocazione posticipata alle ore 13:00', 'una frase che nella mail non c\'è'],
  avvisi: ['Convocazione posticipata alle ore 13:00', 'Si raccomanda la massima puntualità.'],
  troupe: [{ reparto: 'SUONO', ruolo: 'Microfonista', nome: 'S. Panetta', partenza: '', set: '13.00' },
           { reparto: 'FOTOGRAFIA', ruolo: 'Data Manager', nome: 'V. Leone', partenza: '13.30', set: '' },
           { reparto: 'COSTUMI', ruolo: 'Costumista', nome: 'R. Aprea', partenza: '', set: 'O.C.' }],
  tratte: [{ autista: 'Luca Cammarosano Van', partenza: '12.30', luogo: 'TURSPORT HOTEL RESIDENCE', destinazione: 'SET', passeggeri: ['F.Lombardi', 'S.Panetta'] }] };
modello = () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify(CORRETTO) }] }), { status: 200 });
await posta.riceviPosta(mail(['MSG - ODG _25 ERRATA CORRIGE.pdf', GIRI], 'I: MSG - ERRATA CORRIGE ODG #25',
  'Cari tutti,\r\ninviamo in allegato l’ODG #25 – ERRATA CORRIGE:\r\n- Convocazione posticipata alle ore 13:00\r\nSi raccomanda la massima puntualità.\r\nSet\r\nChiesa del paese\r\nGrazie'), ACCESO, {});
ok('letta anche lei', await leggiInOmbra(ACCESO), 'fatta');
const E = T.odg[0].dati.errata;
ok('un solo ordine del giorno per quel giorno, quello corretto', [T.odg.length, T.odg[0].dati.convocazione], [1, '13.00']);
ok('⚠ segnato come errata, con le parole della produzione', [E.length, E[0].tipo, E[0].righe], [1, 'errata', ['Convocazione posticipata alle ore 13:00']]);
ok('⚠ per Panetta: convocazione, pick-up e fine lavorazione', E[0].perChi.u1, [['Convocazione', '12.30', '13.00'], ['Pick-up', '12.00', '12.30'], ['Fine lavorazione', '19.30', '20.00']]);
ok('per Leone: il pick-up non c\'è più', E[0].perChi.u2, [['Pick-up', '13.00', '—'], ['Fine lavorazione', '19.30', '20.00']]);
ok('per Aprea: solo quello che cambia per tutti', E[0].perChi.u3, [['Convocazione', '12.30', '13.00'], ['Fine lavorazione', '19.30', '20.00']]);
ok('quello che sta nell\'errata non si ripete fra gli avvisi', T.odg[0].dati.avvisi, ['Si raccomanda la massima puntualità.']);
ok('⚠ la notifica lo dice, con cosa cambia e gli orari nuovi', di('u1'),
   'Errata corrige - OdG 25 - sabato 10 gennaio\nConvocazione posticipata alle ore 13:00\nPick-up 12.30 · Tursport Hotel Residence\nConvocazione 13.00 · Fine lavorazione 20.00');
ok('a tutti e tre', T.push_appuntamenti.filter(a => a.genere === 'posta').length, 3);
ok('⚠ l\'avviso del pick-up si sposta sul nuovo orario', T.push_appuntamenti.find(a => a.chiave === 'u1:pickup:2099-01-10').testo.split('\n')[1], 'Pick up alle 12.30 · Tursport hotel residence');

console.log('\n── una seconda errata lo stesso giorno ──');
T.posta[1].ricevuta = new Date(Date.now() - 1800000).toISOString();
modello = () => new Response(JSON.stringify({ stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: JSON.stringify({ ...CORRETTO, errata: [], avvisi: [] }) }] }), { status: 200 });
await posta.riceviPosta(mail(['MSG - ODG _25 ERRATA CORRIGE 2.pdf', GIRI], 'I: MSG - ERRATA CORRIGE ODG #25',
  'Buonasera,\r\nin allegato errata corrige dell’ODG #25, con inserito l’indirizzo del parcheggio.\r\nGrazie'), ACCESO, {});
await leggiInOmbra(ACCESO);
ok('⚠ restano tutte e due, in ordine', T.odg[0].dati.errata.map(e => e.righe[0]),
   ['Convocazione posticipata alle ore 13:00', 'in allegato errata corrige dell’ODG #25, con inserito l’indirizzo del parcheggio.']);
ok('la seconda non ha niente che cambi per Panetta', T.odg[0].dati.errata[1].perChi.u1, undefined);

/* Una prova a mano non scrive mai l'ordine del giorno di nessuno. */
mondo(); T.posta.push({ id: 'pr', project_id: 'f1', stato: 'prova', oggetto: 'prova 025', ricevuta: '2026-01-01T00:00:00Z',
  ombra_stato: null, ombra: null, ombra_il: null, allegati: RIGA0.allegati });
await leggiInOmbra(ACCESO);
ok('una prova non scrive niente', [T.posta[0].ombra_stato, T.odg.length, T.push_appuntamenti.length], ['fatta', 0, 0]);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
