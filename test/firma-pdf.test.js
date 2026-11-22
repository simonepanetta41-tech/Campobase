/* La firma in fondo al foglio orari esportato.
 *
 * Il foglio va alla produzione: in basso a destra c'e' l'icona, "Made with
 * Campobase" e l'indirizzo, e tutta la riga e' un collegamento.
 *   - sta dentro la pagina, in basso a destra, sotto la tabella;
 *   - l'icona e' disegnata, non scaricata: senza rete si esporta lo stesso;
 *   - dopo, colore e carattere tornano quelli di prima (c'e' un'altra
 *     pagina da scrivere, se le tabelle sono piu' d'una).
 * ttFirmaPdf gira qui con un documento finto che annota cosa gli si chiede.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(54)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };
const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const prendi = nome => { const i = src.indexOf('function ' + nome + '('); let j = src.indexOf('{', i), n = 0;
  for (;; j++) { if (src[j] === '{') n++; if (src[j] === '}') { n--; if (!n) break; } } return src.slice(i, j + 1); };
const riga = src.slice(src.indexOf('const TT_FIRMA'), src.indexOf('\n', src.indexOf('const TT_FIRMA')));
const ctx = {}; vm.createContext(ctx); vm.runInContext(riga + '\n' + prendi('ttFirmaPdf') + '\nthis.ttFirmaPdf = ttFirmaPdf; this.TT_FIRMA = TT_FIRMA;', ctx);

const fatte = [];
const doc = { stato: { font: 'normal', colore: [0, 0, 0], corpo: 8 },
  internal: { pageSize: { getWidth: () => 297, getHeight: () => 210 } },
  setFontSize(n) { this.stato.corpo = n; }, setFont(f, s) { this.stato.font = s; }, setTextColor(...c) { this.stato.colore = c; }, setFillColor() {},
  getTextWidth(t) { return t.length * 1.8 * (this.stato.font === 'bold' ? 1.1 : 1); },
  roundedRect(x, y, w, h) { fatte.push(['fondo', x, y, w, h]); }, lines(l, x, y) { fatte.push(['tratto', x, y]); },
  text(t, x, y) { fatte.push(['testo', t, x, y, this.stato.font]); }, link(x, y, w, h, o) { fatte.push(['link', x, y, w, h, o.url]); },
  addImage() { fatte.push(['immagine']); } };
const r = ctx.ttFirmaPdf(doc);

console.log('\n── la firma del foglio orari ──');
const testi = fatte.filter(f => f[0] === 'testo');
ok('dice con cosa è fatto, e dove trovarlo', testi.map(t => t[1]).join(''), 'Made with Campobase  ·  campobase.dev');
ok('il nome in neretto, il resto no', testi.map(t => t[4]), ['normal', 'bold', 'normal']);
ok('⚠ sta in basso a destra, dentro il margine', [Math.round(r.x + r.larga), r.y > 190 && r.y + r.alta < 205, r.x > 150], [285, true, true]);
ok('⚠ sotto la tabella, che finisce intorno a 141 mm', r.y > 160, true);
const link = fatte.find(f => f[0] === 'link');
ok('tutta la riga è un collegamento all\'app', [link[5], Math.round(link[1]) === Math.round(r.x), Math.round(link[3]) === Math.round(r.larga)], ['https://campobase.dev', true, true]);
ok('⚠ l\'icona è disegnata, non scaricata', [fatte.filter(f => f[0] === 'fondo').length, fatte.filter(f => f[0] === 'tratto').length, fatte.filter(f => f[0] === 'immagine').length], [1, 8, 0]);
ok('i tratti dell\'icona stanno nel suo quadrato', fatte.filter(f => f[0] === 'tratto').every(t => t[1] >= r.x - 0.5 && t[1] <= r.x + r.alta + 0.5 && t[2] >= r.y - 0.5 && t[2] <= r.y + r.alta + 0.5), true);
ok('⚠ dopo, colore e carattere tornano normali', [doc.stato.colore, doc.stato.font], [[0, 0, 0], 'normal']);
ok('ogni pagina del foglio la porta', /ttFirmaPdf\(doc\);\s*\n\}/.test(prendi('ttBuildPdfPage')), true);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
