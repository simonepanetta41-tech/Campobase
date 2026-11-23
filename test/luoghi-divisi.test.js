/* Due posti scritti insieme diventano due righe del Dove.
 *
 * Ordine del giorno 31 di Missione San Gennaro: il campo base degli attori
 * e i mezzi tecnici da 120 quintali stanno allo stesso indirizzo, e nel
 * Dove comparivano come un posto solo, "Preparazione attori / mezzi
 * tecnici 120q". Simone li vuole su due righe, ognuna con la sua mappa.
 *   - si divide solo dove la barra separa due nomi;
 *   - un'etichetta che l'app conosce per intero resta un posto solo;
 *   - "c/o" e i numeri civici non sono una separazione.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(56)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const prendi = nome => { const i = src.indexOf('function ' + nome + '('); let j = src.indexOf('{', i), n = 0;
  for (;; j++) { if (src[j] === '{') n++; if (src[j] === '}') { n--; if (!n) break; } } return src.slice(i, j + 1); };
const posti = src.slice(src.indexOf('const ODG_POSTI = ['), src.indexOf('];', src.indexOf('const ODG_POSTI = [')) + 2);
const ctx = {}; vm.createContext(ctx);
vm.runInContext([posti, prendi('odgEtichetta'), prendi('odgNomePosto'), prendi('odgCap'), prendi('odgLuoghiDivisi'),
  'this.dividi = l => odgLuoghiDivisi(l).map(x => ({ ...x, nome: odgNomePosto(x.nome) || odgCap(x.nome) }));'].join('\n'), ctx);

console.log('\n── l\'ordine del giorno 31 ──');
const odg31 = [
  { url: 'https://maps.app.goo.gl/a', nome: 'SET', indirizzo: 'Piazza Cardinale Sisto Riario Sforza' },
  { url: 'https://maps.app.goo.gl/b', nome: 'MEZZI TECNICI', indirizzo: 'Via Duomo 193/219' },
  { url: 'https://maps.app.goo.gl/c', nome: 'PREPARAZIONE ATTORI / MEZZI TECNICI 120q', indirizzo: 'Via Marina Altezza Piazza Mercato' },
  { url: 'https://maps.app.goo.gl/d', nome: 'PREPARAZIONE FIGURAZIONI', indirizzo: 'Largo Donnaregina 22' }];
let r = ctx.dividi(odg31);
ok('⚠ cinque righe, non quattro', r.map(l => l.nome), ['Set', 'Mezzi tecnici', 'Preparazione attori', 'Mezzi tecnici 120q', 'Preparazione figurazioni']);
ok('le due nuove hanno lo stesso indirizzo e la stessa mappa', r.slice(2, 4).map(l => [l.indirizzo, l.url]), [['Via Marina Altezza Piazza Mercato', 'https://maps.app.goo.gl/c'], ['Via Marina Altezza Piazza Mercato', 'https://maps.app.goo.gl/c']]);
ok('rifatto sui nomi già sistemati dà lo stesso', ctx.dividi(ctx.dividi(odg31)).map(l => l.nome), r.map(l => l.nome));

console.log('\n── quello che non si divide ──');
ok('⚠ un\'etichetta che l\'app conosce resta un posto solo', ctx.dividi([{ nome: 'CB/ MEZZI TECNICI', indirizzo: 'x' }, { nome: 'CB / MEZZI TECNICI', indirizzo: 'x' }]).map(l => l.nome), ['Mezzi tecnici', 'Mezzi tecnici']);
ok('"c/o" non separa due posti', ctx.dividi([{ nome: 'Trucco c/o Hotel Turchini', indirizzo: 'x' }]).length, 1);
ok('un numero dopo la barra nemmeno', ctx.dividi([{ nome: 'Parcheggio 1/2', indirizzo: 'x' }]).length, 1);
ok('l\'indirizzo con la barra non c\'entra', ctx.dividi([{ nome: 'MEZZI TECNICI', indirizzo: 'Via Duomo 193/219' }]).map(l => l.indirizzo), ['Via Duomo 193/219']);
ok('niente posti, niente guai', [ctx.dividi([]), ctx.dividi(undefined), ctx.dividi([{ indirizzo: 'x' }]).length], [[], [], 1]);
ok('all\'arrivo di un foglio dal server si passa di qui', /d\.luoghi = odgLuoghiDivisi\(d\.luoghi\);/.test(src), true);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
