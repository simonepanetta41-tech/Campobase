/*
 * Lancia tutta la batteria e dice solo cosa non va.
 *
 * I file dicono "passato" in due modi diversi, perche' sono nati in
 * momenti diversi: alcuni stampano "Tutti i controlli passati", quelli di
 * layout "ok — <cosa>". Si accettano entrambi invece di uniformarli: una
 * riscrittura a tappeto di quaranta file per una stringa e' il genere di
 * pulizia che rompe qualcosa e non guadagna niente.
 *
 * Le prove girano piu' d'una alla volta (PROVE_INSIEME, di norma 4: passano
 * quasi tutto il tempo ad aspettare la pagina, non a calcolare): sono processi separati, ognuno col suo
 * browser, e non si toccano. Un file che fallisce in mezzo agli altri si
 * rilancia da solo, a macchina libera, com'era prima: se passa era il
 * carico e lo si dice, se fallisce ancora e' rotto davvero. Nessun file
 * viene saltato e il criterio di "passato" e' lo stesso.
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const arg = process.argv.slice(2);
const soli = arg.filter(a => !a.startsWith('--'));
const file = fs.readdirSync(__dirname)
  .filter(f => /\.test\.(js|mjs)$/.test(f))
  .filter(f => !soli.length || soli.some(s => f.includes(s)))
  .sort();
const INSIEME = Math.max(1, Math.min(+process.env.PROVE_INSIEME || 4, 8, file.length || 1));

const gira = f => new Promise(fatto => {
  execFile(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60 * 1000 },
    (err, stdout, stderr) => {
      const uscita = err ? String(stdout || '') + String(stderr || '') : String(stdout || '');
      fatto({ f, uscita, passato: !err && (/Tutti i controlli passati/.test(uscita) || /\nok — /.test(uscita)) });
    });
});

(async () => {
  const esiti = new Array(file.length);
  let prossimo = 0;
  await Promise.all(Array.from({ length: INSIEME }, async () => {
    while (prossimo < file.length) { const i = prossimo++; esiti[i] = await gira(file[i]); }
  }));

  // Il secondo giro, uno alla volta: distingue il carico dal guasto.
  const ripassati = [];
  if (INSIEME > 1) for (let i = 0; i < esiti.length; i++) {
    if (esiti[i].passato) continue;
    const r = await gira(esiti[i].f);
    if (r.passato) { ripassati.push(r.f); esiti[i] = { ...r, secondo: true }; }
    else esiti[i] = r;
  }

  for (const e of esiti) console.log((e.passato ? (e.secondo ? '  ok*  ' : '  ok   ') : '  ROTTO') + ' ' + e.f);
  if (ripassati.length) console.log(`\n* passati solo da soli, al secondo giro (instabili sotto carico): ${ripassati.join(', ')}`);

  const rotti = esiti.filter(e => !e.passato);
  if (!rotti.length) { console.log(`\n${file.length} file, tutti passati.`); process.exit(0); }

  for (const { f, uscita: u } of rotti) {
    console.log('\n' + '─'.repeat(70) + '\n' + f + '\n');
    // Solo le righe che dicono cosa e' andato storto: il resto e' rumore.
    const righe = u.split('\n').filter(r => /^\s*KO |CONTROLLI FALLITI|Error|error:|at /.test(r));
    console.log((righe.length ? righe.slice(0, 14) : u.split('\n').slice(-14)).join('\n'));
  }
  console.log(`\n${rotti.length} file su ${file.length} da guardare.`);
  process.exit(1);
})();
