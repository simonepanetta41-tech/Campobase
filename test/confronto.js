/*
 * Il confronto: script, modello, e i due messi insieme.
 *
 * Usa l'estrazione dello script presa dall'app vera (corpus.js), quella
 * del modello da modello.json, e il verificatore. Dice quanto copre
 * ciascuno, dove discordano, e che cosa il documento non conferma.
 *
 *   node confronto.js            il quadro
 *   node confronto.js --dettagli riga per riga
 */
const fs = require('fs'), path = require('path');
const { unisci } = require('./verifica.js');

const CAMPI = ['numero','data','convocazione','prontiAGirare','pausa','catering',
               'cestini','fineRiprese','fineLavorazione','pagine','ambiente',
               'location','meteo','alba','tramonto','ospedale','regia'];

const script  = JSON.parse(fs.readFileSync(path.join(__dirname, 'script.json'), 'utf8'));
const modello = JSON.parse(fs.readFileSync(path.join(__dirname, 'modello.json'), 'utf8'));
const T = path.join(__dirname, 'testi');

const vuoto = v => v === null || v === undefined || v === '' || v === 0
                   || (Array.isArray(v) && !v.length);

let nS = 0, nM = 0, nU = 0, nDoc = 0;
const discordi = [], scartati = [], soloModello = [];

for (const doc of Object.keys(modello)) {
  if (doc.startsWith('_')) continue;
  const testo = fs.readFileSync(path.join(T, doc + '.txt'), 'utf8');
  const s = script[doc] || {};
  const m = modello[doc];
  const { dati, diario } = unisci(s, m, testo);
  nDoc++;

  for (const c of CAMPI) {
    if (!vuoto(s[c])) nS++;
    if (!vuoto(m[c])) nM++;
    if (!vuoto(dati[c])) nU++;
  }
  for (const d of diario) {
    if (!CAMPI.includes(d.campo)) continue;
    if (d.esito === 'discordi')     discordi.push({ doc, ...d });
    if (d.esito === 'scartato')     scartati.push({ doc, ...d });
    if (d.esito === 'solo modello') soloModello.push({ doc, ...d });
  }
}

const tot = nDoc * CAMPI.length;
console.log(`\n${nDoc} documenti × ${CAMPI.length} campi = ${tot} caselle\n`);
console.log(`  solo script                 ${String(nS).padStart(3)}   ${(nS/tot*100).toFixed(0)}%`);
console.log(`  solo modello                ${String(nM).padStart(3)}   ${(nM/tot*100).toFixed(0)}%`);
console.log(`  i due insieme, verificati   ${String(nU).padStart(3)}   ${(nU/tot*100).toFixed(0)}%`);

console.log(`\n── quello che il modello aggiunge (${soloModello.length}) ──`);
for (const d of soloModello) console.log(`  ${d.doc.slice(0,26).padEnd(28)}${d.campo.padEnd(17)}${String(d.tenuto).slice(0,38)}`);

console.log(`\n── dove discordano (${discordi.length}) ──`);
for (const d of discordi) console.log(`  ${d.doc.slice(0,26).padEnd(28)}${d.campo.padEnd(17)}script ${String(d.script).slice(0,26)}   |   modello ${String(d.modello).slice(0,26)}`);

console.log(`\n── scartati: il documento non li conferma (${scartati.length}) ──`);
for (const d of scartati) console.log(`  ${d.doc.slice(0,26).padEnd(28)}${d.campo.padEnd(17)}${String(d.modello).slice(0,44)}`);
console.log();
