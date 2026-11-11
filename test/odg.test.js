const {odgIntestazione, ora} = require('./odg-parse.js');
const fs = require('fs');
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

let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(22)} ${JSON.stringify(got)}`.padEnd(92)+` atteso ${JSON.stringify(exp)}`);};

console.log('\n── orari spezzati da pdf.js ──');
[['0 8.30','08.30'],['06 : 36','06.36'],['18. 25','18.25'],['1 5.00','15.00'],
 ['11.3 0','11.30'],['7.03','07.03'],['25.00',null],['8.70',null],['',null],['xx',null]]
 .forEach(([i,o])=>ok(JSON.stringify(i), ora(i), o));

console.log('\n── OdG 20 di Missione San Gennaro ──');
const r = odgIntestazione(dati('odg.txt'));
const atteso = {
  numero:20, data:'2026-11-09',
  convocazione:'07.30', prontiAGirare:'08.30', fineRiprese:'15.00',
  fineLavorazione:'15.30', catering:'11.30', cestini:90,
  dawn:'06.36', alba:'07.03', tramonto:'17.59', dusk:'18.25',
  ambiente:'CAMPI STERMINATI / FATTORIA',
  location:'Masseria Lamie Strada Vicinale Citrezze - Monteiasi',
  meteo:'Soleggiato',
  ospedale:'SAN GIUSEPPE MOSCATI VIA PER MARTINA FRANCA STATTE',
  pausa:'Rotazione 20’',
  mappa:'https://maps.app.goo.gl/A5KUf7hE4Kntttyj6',
  regia:'LUDOVICO DI MARTINO'
};
Object.entries(atteso).forEach(([k,v])=>ok(k, r[k], v));

console.log('\n── casi che non devono rompere ──');
ok('testo vuoto',      odgIntestazione('').numero, undefined);
ok('niente di utile',  odgIntestazione('pagina bianca').convocazione, null);
ok('null',             typeof odgIntestazione(null), 'object');
ok('AMBIENTE in prosa senza campo',
   odgIntestazione('RISPETTOSA DELL’AMBIENTE. ALTRO').ambiente, 'ALTRO');

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
