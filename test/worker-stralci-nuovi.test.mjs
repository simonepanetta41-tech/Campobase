/* Gli stralci corretti, mandati dopo l'ordine del giorno.
 *
 * La produzione manda l'ordine del giorno, e piu' tardi una seconda mail:
 * "In allegato stralci corretti Day #35". Prima la notifica diceva "Nuova
 * posta dalla produzione" con sotto l'oggetto dell'ordine del giorno, e
 * nell'app restava il PDF sbagliato.
 */
const RADICE = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(56)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

const ENV = { SUPABASE_URL: 'https://finto.supabase.co', SUPABASE_SERVICE_KEY: 'chiave', OMBRA_SCRIVE: 'si' };
let T;
const azzera = () => { T = { odg: [], posta: [], film_membri: [{ user_id: 'u1', project_id: 'f1' }], push_appuntamenti: [] }; };
globalThis.fetch = async (url, opz = {}) => {
  const u = new URL(url), tav = u.pathname.split('/').pop(), q = u.searchParams;
  const R = d => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (!T[tav]) return R([]);
  const vale = r => [...q.entries()].every(([k, v]) => !v.startsWith('eq.') || String(r[k]) === v.slice(3));
  if (!opz.method || opz.method === 'GET') {
    let rr = T[tav].filter(vale);
    if ((q.get('order') || '') === 'data.desc') rr = rr.slice().sort((a, b) => String(b.data).localeCompare(String(a.data)));
    return R(rr);
  }
  const corpo = JSON.parse(opz.body);
  if (opz.method === 'PATCH') { T[tav].filter(vale).forEach(r => Object.assign(r, corpo)); return R([]); }
  if (opz.method === 'POST') { T[tav].push(...(Array.isArray(corpo) ? corpo : [corpo])); return R([]); }
  return R([]);
};

const { stralciNuovi, stralciIndiceDopo, numeriOdg } = await import(RADICE + '/worker/scrive.js');
const { primeParole, avvisaPosta } = await import(RADICE + '/worker/push.js');

console.log('\n── le parole della produzione ──');
ok('⚠ la mail di quella sera', primeParole('In allegato \nstralci corretti  Day #35\n\n\nGrazie\nA.'), 'In allegato stralci corretti Day #35');
ok('senza il saluto in testa', primeParole('Buonasera a tutti,\n\nin allegato i giri auto aggiornati.\n\nCordiali saluti\nAnna'), 'in allegato i giri auto aggiornati.');
ok('senza il blocco dell\'inoltro', primeParole('---------- Forwarded message ---------\nDa: Produzione <p@x.it>\nDate: gio 26 nov 2026\nSubject: MSG\nTo: <t@x.it>\n\nStralci corretti scena 12.\n\nGrazie'), 'Stralci corretti scena 12.');
ok('solo saluti e firma: niente', primeParole('Grazie\nA.'), '');
ok('corpo vuoto: niente', primeParole(''), '');
ok('non si porta dietro la mail citata', primeParole('Corretto il pick-up.\n> Il giorno 26 nov ha scritto:\n> vecchia'), 'Corretto il pick-up.');
ok('un corpo lungo si tronca', primeParole('a'.repeat(60) + ' ' + 'b'.repeat(80)).length <= 110, true);

console.log('\n── la notifica dice cosa c\'è dentro ──');
const nota = async (fatti, oggetto, corpo) => { azzera(); await avvisaPosta(ENV, 'f1', fatti, oggetto, corpo); return T.push_appuntamenti[0].testo; };
ok('⚠ soli stralci', await nota(['stralci'], 'MSG - ODG #35 del 27.11.2026 + Giri Auto, Stralci', 'In allegato \nstralci corretti  Day #35\n\nGrazie\nA.'),
   'Stralci\nIn allegato stralci corretti Day #35');
ok('soli giri auto', await nota(['giri'], 'MSG - Giri', 'Giri auto aggiornati per domani.'), 'Giri auto\nGiri auto aggiornati per domani.');
ok('tutti e due', (await nota(['stralci', 'giri'], '', 'Corretti.')).split('\n')[0], 'Stralci e giri auto');
ok('senza corpo, l\'oggetto come prima', await nota(['stralci'], 'Fwd: MSG - Stralci Day 35', ''), 'Stralci\nMSG - Stralci Day 35');
ok('l\'ordine del giorno resta com\'era', await nota(['odg', 'stralci', 'giri'], 'MSG - ODG 23', 'In allegato.'), 'Nuovo ordine del giorno!\nMSG - ODG 23');
ok('il piano resta com\'era', await nota(['pdl'], 'MSG - PDL 8', 'Ecco il piano.'), 'Nuovo piano di lavorazione!\nMSG - PDL 8');
ok('quello che non si riconosce resta generico', await nota([], 'Comunicazione', 'Domani si recupera.'), 'Nuova posta dalla produzione\nDomani si recupera.');

console.log('\n── di quale ordine del giorno parla la mail ──');
ok('dall\'oggetto e dal corpo', numeriOdg('MSG - ODG #35 del 27.11.2026 + Giri Auto, Stralci\nstralci corretti  Day #35'), [35]);
ok('"ODG n. 7", "Giorno 12"', numeriOdg('ODG n. 7 e Giorno 12'), [7, 12]);
ok('una data non è un numero di giorno', numeriOdg('stralci del 27.11.2026'), []);

console.log('\n── i nuovi stralci prendono il posto dei vecchi ──');
const ADESSO = Date.parse('2026-11-26T18:03:00Z');
const foglio = (numero, data, extra = {}) => ({ project_id: 'f1', data, numero, dati: { daServer: true, numero: String(numero), data,
  caricatoIl: '2026-11-26T17:19:00.000Z', convocazione: '09.00',
  allegati: [{ nome: 'MSG - ODG _' + numero + '.pdf', tipo: 'odg', percorso: 'f1/p1/odg.pdf', file: null },
             { nome: 'MSG - Giri.pdf', tipo: 'giri', percorso: 'f1/p1/giri.pdf', file: null },
             { nome: 'MSG - Stralci DAY _' + numero + '.pdf', tipo: 'stralci', percorso: 'f1/p1/stralci.pdf', file: 'odg/vecchio' }],
  stralciIndice: [{ n: '12', p: 1 }], sceneggiatura: [{ n: '12', blocchi: [] }], stralci: 'testo vecchio', stralciRiletti: true, ...extra } });
const mail = (extra = {}) => ({ id: 'p2', project_id: 'f1', stato: 'nuova', oggetto: 'MSG - ODG #35 del 27.11.2026 + Giri Auto, Stralci',
  testo: 'In allegato \nstralci corretti  Day #35\n\nGrazie\nA.',
  allegati: [{ nome: 'MSG - Stralci DAY _35.pdf', tenuto: true, percorso: 'f1/p2/stralci.pdf', byte: 9 }, { nome: 'firma.png', tenuto: false }], ...extra });

azzera(); T.odg.push(foglio(34, '2026-11-26'), foglio(35, '2026-11-27')); T.posta.push(mail());
let fatto = await stralciNuovi(ENV, T.posta[0], ADESSO, ['In allegato stralci corretti Day #35']);
const D = T.odg[1].dati;
ok('⚠ nel foglio giusto, il 35', [fatto && fatto.numero, fatto && fatto.data], [35, '2026-11-27']);
ok('⚠ gli stralci sono quelli nuovi, e uno solo', D.allegati.filter(a => a.tipo === 'stralci').map(a => [a.percorso, a.file]), [['f1/p2/stralci.pdf', null]]);
ok('ordine del giorno e giri auto non si toccano', D.allegati.filter(a => a.tipo !== 'stralci').map(a => a.percorso), ['f1/p1/odg.pdf', 'f1/p1/giri.pdf']);
ok('⚠ quello ricavato dal PDF vecchio si butta', [D.stralciIndice, D.sceneggiatura, D.stralci, D.stralciRiletti], [undefined, undefined, undefined, undefined]);
ok('⚠ caricatoIl avanza: i telefoni se lo riprendono', D.caricatoIl > '2026-11-26T17:19:00.000Z', true);
ok('il resto del foglio è quello di prima', [D.convocazione, D.daServer], ['09.00', true]);
ok('nel riquadro in cima, con le parole della produzione', D.errata.map(e => [e.tipo, e.righe]), [['aggiornato', ['In allegato stralci corretti Day #35']]]);
ok('l\'altro giorno resta com\'era', T.odg[0].dati.allegati[2].percorso, 'f1/p1/stralci.pdf');
ok('la mail è chiusa, e dice cosa ne è stato', [T.posta[0].stato, T.posta[0].nota], ['fatta', "stralci sostituiti nell'ordine del giorno 35 del 2026-11-27"]);

ok('l\'indice nuovo si aggiunge dopo', [await stralciIndiceDopo(ENV, T.posta[0], fatto, [{ n: '14', p: 1 }]), T.odg[1].dati.stralciIndice], [true, [{ n: '14', p: 1 }]]);
T.odg[1].dati = { ...T.odg[1].dati, caricatoIl: '2026-11-26T19:00:00.000Z', stralciIndice: undefined };
ok('⚠ ma non sopra un foglio riscritto nel frattempo', [await stralciIndiceDopo(ENV, T.posta[0], fatto, [{ n: '99', p: 1 }]), T.odg[1].dati.stralciIndice], [false, undefined]);

console.log('\n── quando non si tocca niente ──');
azzera(); T.odg.push(foglio(34, '2026-11-26')); T.posta.push(mail());
ok('⚠ la mail parla del 35 e il 35 non c\'è', [await stralciNuovi(ENV, T.posta[0], ADESSO), T.odg[0].dati.allegati[2].percorso, T.posta[0].stato], [null, 'f1/p1/stralci.pdf', 'nuova']);
azzera(); T.odg.push(foglio(35, '2026-11-27')); T.posta.push(mail({ oggetto: 'Stralci corretti', testo: 'In allegato.', allegati: [{ nome: 'Stralci.pdf', tenuto: true, percorso: 'f1/p2/s.pdf' }] }));
ok('nessun numero: vale l\'ultimo foglio, se non è passato', [(await stralciNuovi(ENV, T.posta[0], ADESSO) || {}).numero, T.odg[0].dati.errata[0].righe], [35, ['Stralci sostituiti.']]);
azzera(); T.odg.push(foglio(30, '2026-11-20')); T.posta.push(mail({ oggetto: 'Stralci', testo: '', allegati: [{ nome: 'Stralci.pdf', tenuto: true, percorso: 'f1/p2/s.pdf' }] }));
ok('⚠ nessun numero e l\'ultimo foglio è di giorni fa', await stralciNuovi(ENV, T.posta[0], ADESSO), null);
azzera(); T.odg.push(foglio(35, '2026-11-27')); T.posta.push(mail({ allegati: [{ nome: 'MSG - Giri.pdf', tenuto: true, percorso: 'f1/p2/g.pdf' }] }));
ok('una mail senza stralci non è affar suo', await stralciNuovi(ENV, T.posta[0], ADESSO), null);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
