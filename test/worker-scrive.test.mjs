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
           { nome: 'PARCHEGGIO', url: '', indirizzo: 'senza link' }],
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
ok('un posto senza link non va nel Dove', d.luoghi.map(l => l.nome), ['CB/ MEZZI TECNICI']);
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
let T, modello, rotto;
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
  if (u.hostname === 'api.anthropic.com') return modello();
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
function mail(nomi, oggetto = 'I: MSG - ODG #25 del 14.11.2026') {
  const pdf = Buffer.from('%PDF-1.4 finto').toString('base64');
  const corpo = ['From: simone <s@hotmail.it>', 'To: abc123@campobase.dev', 'Subject: ' + oggetto, 'Message-ID: <' + (++seq) + '@x>',
    'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${CONFINE}"`, '', `--${CONFINE}`, 'Content-Type: text/plain', '', 'ecco', ''];
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

console.log('\n── cosa non passa dal server ──');
/* Il piano di lavorazione lo sa leggere solo il telefono. */
mondo(); await posta.riceviPosta(mail([ODG, GIRI, 'MSG - PDL rev 7.pdf']), ACCESO, {});
ok('una mail col piano: strada vecchia', [T.posta[0].stato, titoli()[0]], ['nuova', 'Nuovo piano di lavorazione!']);
mondo(); await posta.riceviPosta(mail(['MSG_ACCOMMODATION NAPOLI.pdf'], 'I: MSG_ACCOMMODATION'), ACCESO, {});
ok('una mail senza ordine del giorno: strada vecchia', [T.posta[0].stato, titoli()[0]], ['nuova', 'Nuova posta dalla produzione']);
/* Una prova a mano non scrive mai l'ordine del giorno di nessuno. */
mondo(); T.posta.push({ id: 'pr', project_id: 'f1', stato: 'prova', oggetto: 'prova 025', ricevuta: '2026-01-01T00:00:00Z',
  ombra_stato: null, ombra: null, ombra_il: null, allegati: RIGA0.allegati });
await leggiInOmbra(ACCESO);
ok('una prova non scrive niente', [T.posta[0].ombra_stato, T.odg.length, T.push_appuntamenti.length], ['fatta', 0, 0]);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
