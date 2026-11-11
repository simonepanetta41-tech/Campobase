/*
 * Lancia tutta la batteria e dice solo cosa non va.
 *
 * I file dicono "passato" in due modi diversi, perche' sono nati in
 * momenti diversi: alcuni stampano "Tutti i controlli passati", quelli di
 * layout "ok — <cosa>". Si accettano entrambi invece di uniformarli: una
 * riscrittura a tappeto di quaranta file per una stringa e' il genere di
 * pulizia che rompe qualcosa e non guadagna niente.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const soli = process.argv.slice(2);
const file = fs.readdirSync(__dirname)
  .filter(f => /\.test\.(js|mjs)$/.test(f))
  .filter(f => !soli.length || soli.some(s => f.includes(s)))
  .sort();

let rotti = [];
for (const f of file) {
  let uscita = '', esito = 0;
  try { uscita = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { esito = 1; uscita = String(e.stdout || '') + String(e.stderr || ''); }
  const passato = !esito && (/Tutti i controlli passati/.test(uscita) || /\nok — /.test(uscita));
  console.log((passato ? '  ok   ' : '  ROTTO') + ' ' + f);
  if (!passato) rotti.push([f, uscita]);
}

if (!rotti.length) { console.log(`\n${file.length} file, tutti passati.`); process.exit(0); }

for (const [f, u] of rotti) {
  console.log('\n' + '─'.repeat(70) + '\n' + f + '\n');
  // Solo le righe che dicono cosa e' andato storto: il resto e' rumore.
  const righe = u.split('\n').filter(r => /^\s*KO |CONTROLLI FALLITI|Error|error:|at /.test(r));
  console.log((righe.length ? righe.slice(0, 14) : u.split('\n').slice(-14)).join('\n'));
}
console.log(`\n${rotti.length} file su ${file.length} da guardare.`);
process.exit(1);
