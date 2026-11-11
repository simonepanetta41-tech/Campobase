const RADICE = require('path').join(__dirname, '..');
const fs=require('fs');
const src=fs.readFileSync(RADICE + '/index.html','utf8');
function fn(n){const i=src.indexOf('\nfunction '+n+'(');const f=/\n\};?\n/g;f.lastIndex=i;const m=f.exec(src);return src.slice(i+1,m.index+m[0].length);}
function cn(n){return new RegExp('^(?:const|let) '+n+' = [\\s\\S]*?;$','m').exec(src)[0];}
function arr(n){const i=src.indexOf('\nconst '+n+' = [');return src.slice(i+1,src.indexOf('\n];',i)+3);}
const api=new Function([arr('PDL_FINE_GIORNO'),cn('PDL_MESI'),cn('PDL_VIAGGIO'),cn('PDL_VIAGGIO_DEST'),
  arr('PDL_DATE'),'let _pdlDateG=null;',fn('pdlDateGlobali'),fn('pdlDataIso'),fn('pdlDataPrimaDi'),
  fn('pdlViaggioDaSegmento'),fn('pdlViaggioBreve'),fn('parseTrasferimentiFromText')].join('\n')+
  '\nreturn {parseTrasferimentiFromText,pdlViaggioBreve};')();

let ko=0;
const atteso=(e,a,v)=>{const ok=String(a)===String(v);if(!ok)ko++;console.log(`  ${ok?'ok  ':'KO  '}${e.padEnd(44)} ${String(a).padEnd(30)} atteso ${v}`);};
// Un piano finto: due giornate numerate con le loro date.
const piano=(dentro1,dentro2='')=>[
  'Sc: 10 INT CASA GIORNO',dentro1,'End of Day 1 -- 16 novembre 2026 -- 2 Pag --',
  'Sc: 11 EXT PORTO GIORNO',dentro2,'End of Day 2 -- 17 novembre 2026 -- 1 Pag --'].join('\n');
const gior=t=>JSON.stringify(api.parseTrasferimentiFromText(t).perGiorno);
const data=t=>JSON.stringify(api.parseTrasferimentiFromText(t).perData);

console.log('── vocabolario (spostamento dentro una giornata numerata) ──');
for(const [riga,v] of [
  ['TRASFERIMENTO A NAPOLI','{"1":"TRASFERIMENTO NAPOLI"}'],
  ['VIAGGIO VERSO NAPOLI','{"1":"VIAGGIO NAPOLI"}'],
  ['GIORNO DI VIAGGIO PER NAPOLI','{"1":"VIAGGIO NAPOLI"}'],
  ['PARTENZA PER NAPOLI','{"1":"PARTENZA NAPOLI"}'],
  ['TRASFERTA A NAPOLI','{"1":"TRASFERTA NAPOLI"}'],
  ['SPOSTAMENTO A REGGIA DI CASERTA','{"1":"SPOSTAMENTO REGGIA DI CASERTA"}'],
  ['TRAVEL DAY TO NAPLES','{"1":"TRAVEL DAY NAPLES"}'],
  ['COMPANY MOVE TO NAPLES','{"1":"COMPANY MOVE NAPLES"}'],
  ['RIENTRO A ROMA','{"1":"RIENTRO ROMA"}'],
]) atteso(riga, gior(piano(riga)), v);

console.log('\n── parole nude: etichette di campo, non viaggi ──');
for(const riga of ['TRASFERIMENTO','Trasferimento','VIAGGIO','PARTENZA 06:00','RIENTRO 20:30'])
  atteso(riga, gior(piano(riga)), '{}');

console.log('\n── altre forme di marcatore ──');
for(const [m1,m2] of [['Fine del Giorno #1','Fine del Giorno #2'],['Fine giornata 1','Fine giornata 2'],
                      ['Fine 1° giorno','Fine 2° giorno'],['End Day 1','End Day 2']]){
  const t=`Sc: 1 INT CASA\nVIAGGIO VERSO NAPOLI\n${m1} -- 16 novembre 2026 --\nSc: 2 EXT PORTO\n${m2} -- 17 novembre 2026 --`;
  atteso(m1, gior(t), '{"1":"VIAGGIO NAPOLI"}');
}

console.log('\n── giornata di solo viaggio, con data propria ──');
// La forma di Missione San Gennaro: fra due marcatori, una data che non
// appartiene a nessuna giornata numerata.
const conGiornoProprio='Sc: 1 INT CASA\nEnd of Day 1 -- sabato 14 novembre 2026 -- 2 Pag --\nlunedì 16 novembre 2026 -- TRASFERIMENTO TROUPE A NAPOLI --\nSc: 2 EXT PORTO\nEnd of Day 2 -- martedì 17 novembre 2026 -- 1 Pag --';
atteso('viaggio su una data propria', data(conGiornoProprio), '{"2026-11-16":"TRASFERIMENTO NAPOLI"}');
atteso('non finisce sulla giornata dopo', gior(conGiornoProprio), '{}');
// Se invece la data che precede e' quella di una giornata numerata, lo
// spostamento appartiene a quella giornata.
atteso('data gia di una giornata -> resta li', data(piano('TRASFERIMENTO A NAPOLI')), '{}');

console.log('\n── etichetta corta ──');
atteso('TRASFERIMENTO NAPOLI', api.pdlViaggioBreve('TRASFERIMENTO NAPOLI'), 'NAPOLI');
atteso('COMPANY MOVE NAPLES', api.pdlViaggioBreve('COMPANY MOVE NAPLES'), 'NAPLES');

console.log(ko===0?'\nTutti i controlli passati.':`\n${ko} falliti.`);
process.exit(ko?1:0);
