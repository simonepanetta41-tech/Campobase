/* Chi arriva dove, e quando: le righe che la produzione scrive nella mail
 * sotto ogni posto ("Gruppo ore 14.00", "MDP alle ore 15.30").
 *
 *   - stanno sotto il posto, chiuse, e si aprono con l'ora in colonna;
 *   - una riga senza un'ora riconoscibile si mostra intera, com'e';
 *   - la riga del proprio reparto si accende e la sua ora si legge senza
 *     aprire: per suono e fotografia il mezzo di riferimento e' "MDP";
 *   - il server tiene solo le righe che stanno, parola per parola, nella
 *     mail (worker/scrive.js).
 * I casi sono quelli della mail dell'ordine del giorno 31 di Missione San
 * Gennaro.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(56)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };
const RADICE = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(RADICE, 'index.html'), 'utf8');
const prendi = nome => { const i = src.indexOf('function ' + nome + '('); let j = src.indexOf('{', i), n = 0;
  for (;; j++) { if (src[j] === '{') n++; if (src[j] === '}') { n--; if (!n) break; } } return src.slice(i, j + 1); };
const blocco = (da, a) => src.slice(src.indexOf(da), src.indexOf(a, src.indexOf(da)) + a.length);
const ctx = { REP: 'Suono' }; vm.createContext(ctx);
vm.runInContext([blocco('const FAB_NOMI = {', '};'), blocco('const ODG_ARRIVI_MEZZO', ';'), prendi('odgArrivo'), prendi('odgArrivoMio'), prendi('odgArriviHtml'),
  "const senzaAccenti = s => s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');",
  "const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;'); const profilo = () => ({ reparto: REP });",
  'this.odgArrivo = odgArrivo; this.odgArrivoMio = odgArrivoMio; this.odgArriviHtml = odgArriviHtml;'].join('\n'), ctx);

(async () => {
  console.log('\n── una riga: chi, e a che ora ──');
  const r = t => { const a = ctx.odgArrivo(t); return [a.chi, a.ora]; };
  ok('"Gruppo ore 14.00"', r('Gruppo ore 14.00'), ['Gruppo', '14.00']);
  ok('"MDP alle ore 15.30"', r('MDP alle ore 15.30'), ['MDP', '15.30']);
  ok('"120q Elettricisti ore 14.15"', r('120q Elettricisti ore 14.15'), ['120q Elettricisti', '14.15']);
  ok('"2 Porter alle ore 14.30"', r('2 Porter alle ore 14.30'), ['2 Porter', '14.30']);
  ok('con i due punti, o un\'ora sola cifra', [r('Pasino Elettricisti - ore 9:05'), r('Gruppo h 7.30')], [['Pasino Elettricisti', '09.05'], ['Gruppo', '07.30']]);
  ok('⚠ senza un\'ora riconoscibile resta intera', [r('Porter in mattinata'), r('MDP ore 25.99'), r('ore 14.00')], [['Porter in mattinata', ''], ['MDP ore 25.99', ''], ['ore 14.00', '']]);

  console.log('\n── la riga del proprio reparto ──');
  const mio = (chi, rep) => ctx.odgArrivoMio(chi, rep);
  ok('⚠ per il suono e la fotografia il mezzo è la MDP', [mio('MDP', 'Suono'), mio('MDP', 'Fotografia'), mio('MDP', 'Costumi')], [true, true, false]);
  ok('elettricisti e macchinisti si riconoscono dal nome', [mio('120q Elettricisti', 'Elettricisti'), mio('Pasino Macchinisti', 'Macchinisti'), mio('Pasino Macchinisti', 'Elettricisti')], [true, true, false]);
  ok('⚠ una sigla vale solo da sola, non dentro un\'altra parola', [mio('Camdpix', 'Suono'), mio('2 MDP', 'Suono')], [false, true]);
  ok('senza reparto, o con uno che non c\'entra, niente', [mio('MDP', ''), mio('Gruppo', 'Suono'), mio('Porter', 'Suono')], [false, false, false]);

  console.log('\n── sotto il posto ──');
  const mezzi = { nome: 'Mezzi tecnici', arrivi: ['Gruppo ore 14.00', 'Pasino Macchinisti ore 14.00', 'Porter alle ore 13.00', 'Porter alle ore 15.00', 'MDP alle ore 15.30'] };
  let h = ctx.odgArriviHtml(mezzi);
  ok('chiuso, con il conto', [/<details class="odg-arrivi">/.test(h), / open/.test(h.split('>')[0]), /5 arrivi/.test(h)], [true, false, true]);
  ok('⚠ la mia ora si legge senza aprire', (h.match(/<summary>[\s\S]*?<\/summary>/)[0].match(/<span class="mio">([\s\S]*?)<\/span>/) || [])[1].replace(/<[^>]+>/g, ''), 'MDP 15.30');
  ok('dentro, una riga per arrivo con l\'ora a parte', (h.match(/<div class="(mio)?"><span>/g) || []).length, 5);
  ok('e la mia è l\'unica accesa', (h.match(/<div class="mio">/g) || []).length, 1);
  ctx.REP = 'Costumi'; h = ctx.odgArriviHtml(mezzi);
  ok('a chi non c\'entra non si accende niente', [/class="mio"/.test(h), /5 arrivi/.test(h)], [false, true]);
  ok('un arrivo solo si dice al singolare', /1 arrivo</.test(ctx.odgArriviHtml({ arrivi: ['Pasino Elettricisti ore 14.00'] })), true);
  ok('un posto senza arrivi non ha niente sotto', [ctx.odgArriviHtml({ nome: 'Set' }), ctx.odgArriviHtml({ arrivi: [] }), ctx.odgArriviHtml({ arrivi: ['', '  '] })], ['', '', '']);
  ok('⚠ quello che scrive la mail non diventa codice', /<img/.test(ctx.odgArriviHtml({ arrivi: ['<img src=x onerror=1> ore 14.00'] })), false);
  ok('ogni posto del Dove passa di qui', /\$\{odgArriviHtml\(l\)\}/.test(src), true);

  console.log('\n── ⚠ il server: solo quello che sta nella mail ──');
  const { arriviDallaMail, datiPerApp } = await import(path.join(RADICE, 'worker', 'scrive.js'));
  const MAIL = `Cari tutti,\n\nSET \nPiazza Cardinale Sisto Riario Sforza\n- Pasino Elettricisti ore 14.00\n\nMEZZI TECNICI\nVia Duomo 193/219\n- Gruppo ore 14.00\n- MDP alle ore 15.30\n\nPREPARAZIONE ATTORI / MEZZI TECNICI \nVia Marina Altezza Piazza Mercato\n- 120q Elettricisti ore 14.15\n- 2 Porter alle ore 14.30\n`;
  ok('le righe della mail, senza il trattino', arriviDallaMail(['- Gruppo ore 14.00', 'MDP alle ore 15.30'], MAIL), ['Gruppo ore 14.00', 'MDP alle ore 15.30']);
  ok('⚠ un\'ora cambiata dal modello non passa', arriviDallaMail(['Gruppo ore 14.30', 'MDP alle ore 15.30'], MAIL), ['MDP alle ore 15.30']);
  ok('⚠ una riga inventata non passa', arriviDallaMail(['Suono ore 15.30'], MAIL), []);
  ok('senza la mail non si tiene niente', [arriviDallaMail(['Gruppo ore 14.00'], ''), arriviDallaMail('Gruppo ore 14.00', MAIL), arriviDallaMail(null, MAIL)], [[], [], []]);
  const d = datiPerApp({ numero: '31', data: '2026-11-23', luoghi: [
    { nome: 'MEZZI TECNICI', indirizzo: 'Via Duomo 193/219', arrivi: ['Gruppo ore 14.00', 'Suono ore 9.00'] },
    { nome: 'PREPARAZIONE FIGURAZIONI', indirizzo: 'Largo Donnaregina 22' }] }, { id: 'm1', testo: MAIL });
  ok('nel foglio che va all\'app: gli arrivi veri, posto per posto', d.luoghi.map(l => [l.nome, l.arrivi || null]), [['MEZZI TECNICI', ['Gruppo ore 14.00']], ['PREPARAZIONE FIGURAZIONI', null]]);

  console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
  process.exit(ko ? 1 : 0);
})();
