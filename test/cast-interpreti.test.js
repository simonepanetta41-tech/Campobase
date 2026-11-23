/* La lista cast si riempie da sola, un ordine del giorno alla volta.
 *
 * La lista ufficiale porta i personaggi, non gli attori: quelli arrivano
 * con le convocazioni. L'app mostrava l'interprete solo per chi era
 * convocato QUEL giorno: il giorno dopo il nome spariva, e con lui la
 * scheda dell'attore. Ora si cerca anche negli ordini del giorno passati.
 *   - oggi vince su ieri, e il foglio piu' recente sui piu' vecchi;
 *   - le figurazioni che il foglio rinumera da 1 non rubano l'ID a un attore;
 *   - di ogni foglio passato si tiene il minimo: ID, interprete, ruolo.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(56)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const prendi = nome => { const i = src.indexOf('function ' + nome + '('); let j = src.indexOf('{', i), n = 0;
  for (;; j++) { if (src[j] === '{') n++; if (src[j] === '}') { n--; if (!n) break; } } return src.slice(i, j + 1); };
const ctx = {}; vm.createContext(ctx);
vm.runInContext('var odgCorrente = null, odgPassati = [];\n' + prendi('interpretePerId') + '\n' + prendi('odgCastVisto') +
  '\nthis.per = interpretePerId; this.visto = odgCastVisto; this.metti = (o, p) => { odgCorrente = o; odgPassati = p; };', ctx);

console.log('\n── cosa si tiene di un foglio passato ──');
// L'ordine del giorno 31: sei attori, poi le figurazioni rinumerate da 1.
const odg31 = [{ id: '1', ruolo: 'PRINCIPE COLONNA', interprete: 'ROCCO PAPALEO', pickup: '14.15', set: '16.30', scene: '73' },
  { id: '2', ruolo: 'GIUSEPPE NAVARRA', interprete: "MARCO D'AMORE" }, { id: '12', ruolo: 'DE VITA', interprete: 'DANIELE SANDUZZI' },
  { id: '1', ruolo: 'FORNAIO', interprete: '' }, { id: '25', ruolo: 'CITTADINI', interprete: '' }, { id: '1', ruolo: 'BIMBO', interprete: '' }];
ok('solo chi ha un interprete, con il minimo', ctx.visto(odg31), [{ id: '1', interprete: 'ROCCO PAPALEO', ruolo: 'PRINCIPE COLONNA' },
  { id: '2', interprete: "MARCO D'AMORE", ruolo: 'GIUSEPPE NAVARRA' }, { id: '12', interprete: 'DANIELE SANDUZZI', ruolo: 'DE VITA' }]);
ok('⚠ un ID ripetuto vale per il primo: l\'attore, non la figurazione', ctx.visto([{ id: '1', interprete: 'ROCCO PAPALEO' }, { id: '1', interprete: 'MARIO ROSSI', ruolo: 'FEDELE' }]).map(c => c.interprete), ['ROCCO PAPALEO']);
ok('un foglio senza cast, o rotto, non rompe niente', [ctx.visto(null), ctx.visto('x'), ctx.visto([null, {}, { id: '', interprete: 'X' }])], [[], [], []]);

console.log('\n── chi è l\'interprete di un personaggio ──');
const passati = [{ data: '2026-11-21', cast: [{ id: '4', interprete: 'IVANA LOTITO' }, { id: '7', interprete: 'ATTORE NUOVO' }] },
                 { data: '2026-11-14', cast: [{ id: '7', interprete: 'ATTORE DI PRIMA' }, { id: '9', interprete: 'GIOVANNI ESPOSITO' }] },
                 { data: '2026-11-18', scene: ['12'] }];
ctx.metti({ data: '2026-11-23', cast: [{ id: '1', interprete: 'ROCCO PAPALEO' }, { id: '1', interprete: '', ruolo: 'FORNAIO' }] }, passati);
ok('convocato oggi', ctx.per('1'), 'ROCCO PAPALEO');
ok('⚠ non convocato oggi, ma visto in un foglio passato', [ctx.per('4'), ctx.per(9)], ['IVANA LOTITO', 'GIOVANNI ESPOSITO']);
ok('⚠ se il ruolo ha cambiato interprete vale il foglio più recente', ctx.per('7'), 'ATTORE NUOVO');
ok('mai visto in nessun foglio: niente nome', ctx.per('30'), '');
ctx.metti({ data: '2026-11-23', cast: [{ id: '7', interprete: 'ATTORE DI OGGI' }] }, passati);
ok('oggi vince su tutti i giorni passati', ctx.per('7'), 'ATTORE DI OGGI');
ctx.metti({ data: '2026-11-23', cast: [{ id: '4', interprete: '', ruolo: 'FORNAIO' }] }, passati);
ok('⚠ una riga di oggi senza nome non cancella quello di ieri', ctx.per('4'), 'IVANA LOTITO');
ctx.metti(null, []);
ok('senza nessun ordine del giorno non si rompe', ctx.per('1'), '');
ctx.metti(null, passati);
ok('senza l\'ordine del giorno di oggi bastano i passati', ctx.per('4'), 'IVANA LOTITO');

console.log('\n── i fili ──');
ok('dei fogli passati si chiede anche il cast', /select\('data,scene:dati->scene,cast:dati->cast'\)/.test(src), true);
ok('e si tiene ridotto', /cast: odgCastVisto\(r\.cast\)/.test(src), true);
ok('⚠ la scheda di chi oggi non è convocato ha comunque il nome', /interprete: o\.interprete \|\| interpretePerId\(id\)/.test(src), true);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
