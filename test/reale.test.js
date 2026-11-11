const RADICE = require('path').join(__dirname, '..');
const fs=require('fs');
/* I documenti veri non stanno nel repository.
 *
 * Questo controllo gira su un ordine del giorno vero, e dentro un ordine
 * del giorno vero c'e' la lista della troupe: nomi e numeri di telefono di
 * persone che lavorano. Nei file dei controlli i pochi nomi che servivano
 * sono stati sostituiti con nomi inventati della stessa forma; un
 * documento intero no, perche' basta sbagliarne uno.
 * I documenti vanno in test/dati/, che git non guarda. Senza, questo file
 * dice cosa manca e si ferma: un controllo che non puo' girare lo deve
 * dire, non passare di straforo. */
function dati(nome) {
  const p = require('path').join(__dirname, 'dati', nome);
  if (!require('fs').existsSync(p)) {
    console.log('ok — saltato: manca ' + p);
    process.exit(0);
  }
  return require('fs').readFileSync(p, 'utf8');
}

const src=fs.readFileSync(RADICE + '/index.html','utf8');
const testo=dati('msg.txt');

function fn(n){const i=src.indexOf('\nfunction '+n+'(');const f=/\n\};?\n/g;f.lastIndex=i;const m=f.exec(src);return src.slice(i+1,m.index+m[0].length);}
function cn(n){return new RegExp('^(?:const|let) '+n+' = [\\s\\S]*?;$','m').exec(src)[0];}
function arr(n){const i=src.indexOf('\nconst '+n+' = [');return src.slice(i+1,src.indexOf('\n];',i)+3);}

const codice=[arr('PDL_FINE_GIORNO'),cn('PDL_MESI').replace('const PDL_MESI','const PDL_MESI'),
  cn('PDL_VIAGGIO'),cn('PDL_VIAGGIO_DEST'),
  'const PDL_DATE = '+/const PDL_DATE = \[[\s\S]*?\n\];/.exec(src)[0].slice('const PDL_DATE = '.length),
  'let _pdlDateG = null;',
  fn('pdlDateGlobali'),fn('pdlDataIso'),fn('pdlDataPrimaDi'),
  fn('pdlViaggioDaSegmento'),fn('pdlViaggioBreve'),fn('parseTrasferimentiFromText')].join('\n');

const api=new Function(codice+'\nreturn {parseTrasferimentiFromText,pdlViaggioBreve,pdlDataIso};')();

const r=api.parseTrasferimentiFromText(testo);
console.log('spostamenti dentro giornate numerate:', r.perGiorno);
console.log('giornate di SOLO viaggio:            ', r.perData);
console.log('etichetta corta per telefono:        ',
  Object.values(r.perData).map(api.pdlViaggioBreve));

let ko=0;
function atteso(e,a,v){const ok=String(a)===String(v);if(!ok)ko++;console.log(`  ${ok?'ok  ':'KO  '}${e.padEnd(44)} ${String(a).padEnd(32)} atteso ${v}`);}
console.log('\nverifica sul PdL di Missione San Gennaro:');
atteso('il 16/11 e una giornata di viaggio', JSON.stringify(r.perData), '{"2026-11-16":"TRASFERIMENTO NAPOLI"}');
atteso('nessun falso positivo nelle giornate', JSON.stringify(r.perGiorno), '{}');
atteso('etichetta corta', api.pdlViaggioBreve(r.perData['2026-11-16']), 'NAPOLI');
console.log(ko===0?'\nTutti i controlli passati.':`\n${ko} falliti.`);
process.exit(ko?1:0);
