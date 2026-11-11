// Il verificatore messo alla prova con valori inventati.
//
// Serve a questo: un modello, quando non trova una cosa, ogni tanto ne
// scrive una verosimile. Qui si controlla che il documento abbia l'ultima
// parola — e anche che non sia troppo severo, perche' un verificatore che
// butta i valori buoni e' peggio di nessun verificatore.
const fs = require('fs'), path = require('path');
const { unisci, confermato, rigaConfermata } = require('./verifica.js');

let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(52)} ${JSON.stringify(got)}`.padEnd(92) + ` atteso ${JSON.stringify(exp)}`); };

/* Gli estratti dei documenti veri stanno in test/dati/testi/, che git non
   guarda: sono liste troupe intere di dieci produzioni. */
const T = path.join(__dirname, 'dati', 'testi');
if (!fs.existsSync(T)) { console.log('ok — saltato: manca ' + T); process.exit(0); }
const msg  = fs.readFileSync(path.join(T, 'MSG_-_ODG_20_del_09.11.2026.txt'), 'utf8');
const bas2 = fs.readFileSync(path.join(T, 'BAS2_ODG30_110726.txt'), 'utf8');
const ads  = fs.readFileSync(path.join(T, 'ODG65_ADS_22.01.26.txt'), 'utf8');

console.log('\n── quello che nel documento c\'è davvero passa ──');
ok('un orario scritto 07.30',            confermato('convocazione', '07.30', msg), true);
ok('lo stesso con i due punti',          confermato('convocazione', '7:30', msg), true);
ok('un orario con le cifre staccate',    confermato('convocazione', '14.30', bas2), true);
ok('un orario spezzato come lo stampa ADS', confermato('fineLavorazione', '16.00', ads), true);
ok('un ospedale scritto per esteso',     confermato('ospedale', 'SAN GIUSEPPE MOSCATI', msg), true);
ok('un regista',                         confermato('regia', 'Luca Morante', bas2), true);
ok('le pagine come frazione di ottavi',  confermato('pagine', 3.125, msg), true);
ok('e col trattino, come le scrive BAS2',confermato('pagine', 1.75, bas2), true);
ok('una location lunga',                 confermato('location', 'Santuario S. Maria a Mare, via G. Ventura 1, C.bate', bas2), true);

console.log('\n── quello che non c\'è viene scartato ──');
ok('un orario che nel foglio non c\'è',   confermato('convocazione', '03.17', msg), false);
// 06.45 nel documento c'è: e' l'ora di trucco di un attore. La prova di
// presenza lo conferma, ed e' giusto cosi': dice che c'e', non che sia
// la convocazione. A quello serve la citazione, qui sotto.
ok('un orario che c\'è ma e\' di un altro campo', confermato('convocazione', '06.45', msg), true);
ok('mezz\'ora di differenza',             confermato('fineRiprese', '15.30', bas2), false);
ok('un ospedale inventato',              confermato('ospedale', 'Ospedale Civile di Taranto', msg), false);
ok('un regista che non è quello',        confermato('regia', 'Paolo Serravalle', bas2), false);
ok('pagine inventate',                   confermato('pagine', 4.5, msg), false);
ok('una via che non compare',            confermato('location', 'Via Garibaldi 12, Napoli', msg), false);
ok('il vuoto non si conferma',           confermato('ospedale', null, msg), false);

console.log('\n── un modello che inventa: il documento lo ferma ──');
const inventato = {
  convocazione: '03.17',                      // non c'è
  ospedale: 'Ospedale Civile di Taranto',     // non c'è
  regia: 'LUDOVICO DI MARTINO',               // c'è
  meteo: 'Soleggiato'                         // c'è
};
const { dati, diario } = unisci({}, inventato, msg);
ok('tiene solo quello che il foglio conferma', Object.keys(dati).sort(), ['meteo','regia']);
ok('e dice cosa ha buttato', diario.filter(d=>d.esito==='scartato').map(d=>d.campo).sort(),
   ['convocazione','ospedale']);

console.log('\n── la citazione: non basta che ci sia, deve venire da li\' ──');
const riga = 'AMBIENTE: CAMPI STERMINATI / FATTORIA / METEO: Soleggiato CONVOCAZIONE: 07.30';
ok('riga vera, valore dentro',    rigaConfermata('07.30', riga, msg), true);
ok('riga vera, valore non suo',   rigaConfermata('06.45', riga, msg), false);
ok('riga inventata di sana pianta', rigaConfermata('07.30', 'CONVOCAZIONE GENERALE ORE 07.30 PRESSO IL CAMPO', msg), false);
ok('senza citazione non si pronuncia', rigaConfermata('07.30', null, msg), null);

// E nell'unione: le 06.45 prese dalla riga di un attore non passano piu'.
const conCitazione = { convocazione: '06.45',
  _righe: { convocazione: 'AMBIENTE: CAMPI STERMINATI / FATTORIA / METEO: Soleggiato CONVOCAZIONE: 07.30' } };
ok('un orario vero preso dalla riga sbagliata si ferma',
   unisci({}, conCitazione, msg).dati.convocazione, undefined);

console.log('\n── lo script sporco, il modello pulito ──');
const sporco = { pausa: 'Continuato nuvolosità in graduale aumento' };
const pulito = { pausa: 'Continuato' };
ok('vince il pulito, se il foglio lo conferma',
   unisci(sporco, pulito, ads).dati.pausa, 'Continuato');
ok('ma sugli orari comanda lo script',
   unisci({convocazione:'07.30'}, {convocazione:'07.45'}, msg).dati.convocazione, '07.30');

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
