/* Gli avvisi di pick-up e catering creati dal server.
 *
 * Li creava il telefono, aprendo l'ordine del giorno: chi la sera non
 * apriva l'app la mattina non riceveva niente. Due colleghi sullo stesso
 * van, a uno la notifica arriva e all'altro no. Qui nascono dalla
 * lettura in ombra, per tutti.
 *
 * I controlli che contano:
 *   - l'ora. Il Worker gira in UTC e il foglio parla l'ora di Roma:
 *     un'ora di scarto d'inverno, due d'estate. Sbagliarla vuol dire
 *     avvisare un'ora dopo che il van e' partito;
 *   - a chi. Un pick-up sbagliato e' peggio di nessun pick-up: un nome
 *     che puo' essere di due membri non avvisa nessuno dei due;
 *   - parte spento, e una prova non crea mai niente.
 */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(50)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

const { romaIstante, avvisiPer, avvisiDalServer, nomeCorrisponde } = await import(RADICE + '/worker/avvisi.js');

console.log('\n── ⚠ l\'ora del foglio è l\'ora di Roma ──');
const z = (d, o, m) => { const q = romaIstante(d, o, m); return q && q.toISOString().slice(0, 16) + 'Z'; };
ok('novembre: un\'ora di scarto',         z('2026-11-14', '12.00', 0), '2026-11-14T11:00Z');
ok('dieci minuti prima',                  z('2026-11-14', '12.00', 10), '2026-11-14T10:50Z');
ok('luglio: due ore',                     z('2026-07-01', '07.00', 0), '2026-07-01T05:00Z');
/* I due giorni in cui cambia l'ora, che e' dove un conto fatto a mano
   sbaglia. Nel 2026: 29 marzo e 25 ottobre. */
ok('la mattina del passaggio all\'ora legale',  z('2026-03-29', '08.00', 0), '2026-03-29T06:00Z');
ok('la mattina del ritorno all\'ora solare',    z('2026-10-25', '08.00', 0), '2026-10-25T07:00Z');
ok('la sera prima è ancora legale',             z('2026-10-24', '22.00', 0), '2026-10-24T20:00Z');
ok('mezzanotte e mezza resta nel suo giorno',   z('2026-11-14', '00.30', 10), '2026-11-13T23:20Z');
ok('un\'ora scritta male non è un istante',     romaIstante('2026-11-14', 'TBC', 10), null);
ok('una data scritta male nemmeno',             romaIstante('14/11', '12.00', 10), null);

/* I giri auto di sabato 14, come li ha letti il Worker nella prova. */
const LETTO = { data: '2026-11-14', catering: '12.45', cestini: '130', tratte: [
  { autista: 'Luca Cammarosano', partenza: '11.55', luogo: 'VILLA DELLA MEDA', passeggeri: ['A.Viscardi', 'D.Cinque'] },
  { autista: 'Luca Cammarosano', partenza: '12.00', luogo: 'TURSPORT HOTEL RESIDENCE', arrivo: '12.30',
    passeggeri: ['F.Lombardi', 'D.De Angelis', 'S.Panetta', 'A.Rizzo', 'A.Liddi'] },
  { autista: 'Luca Cammarosano', partenza: '13.00', luogo: 'TURSPORT HOTEL RESIDENCE', passeggeri: ['V.Leone', 'V.Cassone'] },
  { autista: 'Stefano Nardelli', partenza: '10.50', luogo: 'RENOVA RESIDENCE', passeggeri: ['A. Lombardi', 'M.Iandolo'] },
  { autista: 'Antonio Varriale', partenza: '12.30', luogo: 'SET', passeggeri: [] },
  { autista: 'Antonio Zazzaro', partenza: '', nota: 'TBC', luogo: 'RENOVA RESIDENCE', passeggeri: ['E.Giordano'] },
  { autista: 'Gaetano Zaccaria', partenza: '18.00', luogo: 'SET', passeggeri: ['S.Panetta'] }   // il rientro
] };
const M = (id, nome, cognome) => ({ user_id: id, nome, cognome });
const SERA = Date.parse('2026-11-13T21:00:00Z');       // la sera prima, quando arriva la mail
const per = (membri, adesso = SERA, letto = LETTO) => avvisiPer(letto, membri, adesso);

console.log('\n── a ognuno il suo pick-up ──');
let r = per([M('u1', 'Simone', 'Panetta'), M('u2', 'Daniele', 'De Angelis'), M('u3', 'Valerio', 'Leone')]);
const pk = id => r.righe.find(x => x.user_id === id && x.genere === 'pickup');
ok('Panetta: 12.00, dieci minuti prima', pk('u1').quando, '2026-11-14T10:50:00.000Z');
ok('con le stesse parole dell\'app', pk('u1').testo,
   'Luca è lì fra 10 minuti per il pick up!\nPick up alle 12.00 · Tursport hotel residence');
ok('De Angelis, stesso van', pk('u2').quando, '2026-11-14T10:50:00.000Z');
/* Il data manager parte un'ora dopo: e' la riga sua, non quella degli altri. */
ok('Leone: 13.00', pk('u3').quando, '2026-11-14T11:50:00.000Z');
ok('fra andata e rientro vale l\'andata', r.chi[0].pickup, '12.00');

console.log('\n── il catering è di tutti ──');
ok('tre membri, tre avvisi', r.righe.filter(x => x.genere === 'catering').length, 3);
ok('un quarto d\'ora prima', r.righe.find(x => x.genere === 'catering').quando, '2026-11-14T11:30:00.000Z');
ok('con i cestini', r.righe.find(x => x.genere === 'catering').testo,
   'Catering pronto fra 15 minuti!\nPronto alle 12.45 · 130 cestini');

console.log('\n── ⚠ un pick-up sbagliato è peggio di nessun pick-up ──');
/* "A. Lombardi" sul foglio, e nel film ci sono Alessandro e Anna. */
r = per([M('u1', 'Alessandro', 'Lombardi'), M('u2', 'Anna', 'Lombardi'), M('u3', 'Flavio', 'Lombardi')]);
ok('nessun pick-up ai due che si confondono',
   r.righe.filter(x => x.genere === 'pickup').map(x => x.user_id), ['u3']);
ok('e si dice perché', r.chi.slice(0, 2).map(c => c.nota),
   ['nome che combacia con due membri', 'nome che combacia con due membri']);
ok('Flavio ha la F: è suo', r.chi[2].pickup, '12.00');
ok('ma il catering arriva a tutti e tre', r.righe.filter(x => x.genere === 'catering').length, 3);

console.log('\n── chi resta senza pick-up, e perché ──');
r = per([M('u1', 'Mario', 'Rossi'), M('u2', 'Elio', 'Giordano'), M('u3', 'Chi', '')]);
ok('chi non è nei giri auto', [r.chi[0].pickup, r.chi[0].nota], [null, 'non è nei giri auto']);
/* Un viaggio senza orario ("TBC") non puo' dare un avviso. */
ok('chi ha un viaggio senza orario', [r.chi[1].pickup, r.chi[1].nota], [null, 'non è nei giri auto']);
ok('chi non ha scritto il cognome', r.chi[2].nota, 'profilo senza cognome');
ok('nessun pick-up, tre catering', r.righe.map(x => x.genere), ['catering', 'catering', 'catering']);

console.log('\n── un\'ora già passata non si avvisa ──');
/* La mail riletta a mezzogiorno e dieci del giorno stesso: il pick-up
   delle 12.00 e' andato, il catering delle 12.45 no. */
r = per([M('u1', 'Simone', 'Panetta')], Date.parse('2026-11-14T11:10:00Z'));
ok('pick-up no, catering sì', r.righe.map(x => x.genere), ['catering']);
ok('e resta scritto', r.chi[0].nota, 'pick-up già passato');
r = per([M('u1', 'Simone', 'Panetta')], SERA, { ...LETTO, data: '' });
ok('senza data non si avvisa nessuno', [r.righe.length, r.motivo], [0, 'la lettura non ha una data']);

console.log('\n── i nomi, come nell\'app ──');
ok('iniziale puntata', nomeCorrisponde('S.Panetta', { nome: 'Simone', cognome: 'Panetta' }), true);
ok('cognome con particella', nomeCorrisponde('D.De Angelis', { nome: 'Daniele', cognome: 'De Angelis' }), true);
ok('apostrofo tipografico', nomeCorrisponde('M.D’Amore', { nome: 'Marco', cognome: "D'Amore" }), true);
ok('altra iniziale, altra persona', nomeCorrisponde('F.Lombardi', { nome: 'Alessandro', cognome: 'Lombardi' }), false);
ok('nome per esteso', nomeCorrisponde('Francesca Tortora', { nome: 'Francesca', cognome: 'Tortora' }), true);

// ── Dentro il Worker ────────────────────────────────────────────────────────
const ENV = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave' };
let scritti;
globalThis.fetch = async (url, opz = {}) => {
  const u = new URL(url); const tav = u.pathname.replace('/rest/v1/', '');
  const j = (x, s = 200) => new Response(JSON.stringify(x), { status: s });
  if (tav === 'film_membri') return j([{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u9' }]);
  if (tav === 'profiles') return j([{ id: 'u1', nome: 'Simone', cognome: 'Panetta' },
                                    { id: 'u2', nome: 'Daniele', cognome: 'De Angelis' }]);   // u9 non ha profilo
  if (tav === 'push_appuntamenti' && opz.method === 'POST') { scritti = { via: u.search, righe: JSON.parse(opz.body) }; return j(null, 201); }
  return j([], 404);
};

console.log('\n── ⚠ spento: calcola e non crea ──');
scritti = null;
let a = await avvisiDalServer(ENV, 'f1', LETTO, { scrivi: false, adesso: SERA });
ok('niente scritto', scritti, null);
ok('ma dice cosa farebbe', [a.acceso, a.creati, a.calcolati], [false, 0, 5]);
ok('membro per membro', a.chi.map(c => [c.nome, c.pickup, c.nota]),
   [['Simone Panetta', '12.00', null], ['Daniele De Angelis', '12.00', null], [null, null, 'profilo senza cognome']]);

console.log('\n── acceso: crea, con la stessa chiave del telefono ──');
a = await avvisiDalServer(ENV, 'f1', LETTO, { scrivi: true, adesso: SERA });
ok('cinque avvisi: due pick-up e tre catering', a.creati, 5);
ok('sulla chiave si riscrive, non si raddoppia', scritti.via, '?on_conflict=chiave');
ok('utente:genere:giorno', scritti.righe.map(x => x.chiave).sort().slice(0, 2), ['u1:catering:2026-11-14', 'u1:pickup:2026-11-14']);
ok('e l\'avviso riparte se l\'ora cambia', scritti.righe.every(x => x.mandato === null), true);
ok('con il film', scritti.righe.every(x => x.project_id === 'f1'), true);

console.log('\n── un guasto non esce da qui ──');
globalThis.fetch = async () => new Response('no', { status: 500 });
a = await avvisiDalServer(ENV, 'f1', LETTO, { scrivi: true, adesso: SERA });
ok('diventa una riga di riepilogo', [a.creati, /film_membri -> 500/.test(a.errore)], [0, true]);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
