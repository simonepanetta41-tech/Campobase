const RADICE = require('path').join(__dirname, '..');
const fs=require('fs');
const src=fs.readFileSync(RADICE + '/index.html','utf8');

// Estrae dal sorgente vero le funzioni che servono, per nome.
const nomi=['ttToMin','ttOrdinaGiornata','ttDataGiorno','ttInizioNotte','ttMinutiNotte','ttToHM','ttSum','ttCalcDay','ttGetSestoIdx','ttApplyRd','ttCalcTab'];
let codice='';
for(const n of nomi){
  const i=src.indexOf('\nfunction '+n+'(');
  if(i<0) throw new Error('non trovata: '+n);
  const fine=/\n\};?\n/g; fine.lastIndex=i;
  const m=fine.exec(src);
  codice+=src.slice(i+1,m.index+m[0].length)+'\n';
}

const stato={dal:'2026-11-02'};
const TT_DAYS=['LUN','MAR','MER','GIO','VEN','SAB'];
const ttMeta={tipoGiornata:10,raddoppio:0,applicazione:'giornaliero',maggiorazioniNott:true,note:'',viaggioConcesso:60};
const document={getElementById:id=>id==='tt-dal'?{value:stato.dal}:null};

const tt=new Function('document','TT_DAYS','ttMeta',
  codice+'return {'+nomi.join(',')+'};')(document,TT_DAYS,ttMeta);

function orariDa(righe){
  const o={partenza:[],inizio:[],pausa:[],fine:[],rientro:[]};
  for(let i=0;i<6;i++){
    const r=righe[i]||{};
    o.partenza[i]=r.par||'';o.inizio[i]=r.ini||'';o.pausa[i]=r.pau||'';
    o.fine[i]=r.fin||'';o.rientro[i]=r.rie||'';
  }
  return o;
}
const hm=m=>m?tt.ttToHM(m):'—';
// Data locale: toISOString() passa per UTC e sposta la mezzanotte di un giorno.
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
let ko=0;
function atteso(etichetta,avuto,voluto){
  const ok=avuto===voluto;
  if(!ok)ko++;
  console.log(`  ${ok?'ok  ':'KO  '}${etichetta.padEnd(42)} ${String(avuto).padEnd(9)} atteso ${voluto}`);
}

// ── La settimana dell'utente: 2–8 novembre → inverno, fascia 21:00–07:00 ──
console.log('settimana 2/11 → 8/11   fascia 21:00–07:00\n');
const sett=[
  {ini:'17.00',fin:'01.00'},
  {ini:'16.00',fin:'00.00'},
  {ini:'12.30',fin:'20.10'},
  {ini:'08.30',fin:'17.30'},
  {ini:'08.00',fin:'17.00'},
  {ini:'08.30',fin:'16.00'}
];
const {days,tot}=tt.ttCalcTab(orariDa(sett),false);
console.log('      turno          lav     nott55   nott80   gold.o  gold.n  gold.6');
days.forEach((r,i)=>{
  console.log(`${TT_DAYS[i]}   ${(sett[i].ini+'–'+sett[i].fin).padEnd(13)} ${hm(r.oreLav).padEnd(7)} ${hm(r.nottOrd).padEnd(8)} ${hm(r.nottStr).padEnd(8)} ${hm(r.goldenOrd).padEnd(7)} ${hm(r.goldenNott).padEnd(7)} ${hm(r.golden6)}`);
});
console.log(`      TOTALE                        ${hm(tot.nottOrd).padEnd(8)} ${hm(tot.nottStr).padEnd(8)} ${hm(tot.goldenOrd).padEnd(7)} ${hm(tot.goldenNott).padEnd(7)} ${hm(tot.golden6)}`);
console.log('\nverifica:');
atteso('notturne totali settimana', hm((tot.nottOrd||0)+(tot.nottStr||0)), '7h');
atteso('LUN 17–01 notturne (21:00→01:00)', hm((days[0].nottOrd||0)+(days[0].nottStr||0)), '4h');
atteso('MAR 16–00 notturne (21:00→24:00)', hm((days[1].nottOrd||0)+(days[1].nottStr||0)), '3h');
atteso('MER 12.30–20.10 notturne', hm((days[2].nottOrd||0)+(days[2].nottStr||0)), '—');

// ── Casi limite ──
console.log('\n── casi limite ──');
const casi=[
  // etichetta, dal, turno, 55% atteso, 80% atteso
  // Inizio prima delle 07:00: nessuna maggiorazione, la giornata non si
  // prolunga nella notte, comincia all'alba.
  ['inverno 05.30–14.20 (alba)',      '2026-11-02',{ini:'05.30',fin:'14.20'},'—','—'],
  ['estate  05.30–14.20 (alba)',      '2026-07-06',{ini:'05.30',fin:'14.20'},'—','—'],
  ['inverno 02.00–10.00 (notte piena)','2026-11-02',{ini:'02.00',fin:'10.00'},'—','—'],
  ['inverno 06.30–22.30 (16h)',       '2026-11-02',{ini:'06.30',fin:'22.30'},'—','1h 30'],
  ['inverno 23.00–07.00 (scavalca)',  '2026-11-02',{ini:'23.00',fin:'07.00'},'8h','—'],
  ['inverno 20.00–08.00 (12h)',       '2026-11-02',{ini:'20.00',fin:'08.00'},'9h','1h'],
  ['inverno 18.00–23.00',             '2026-11-02',{ini:'18.00',fin:'23.00'},'2h','—'],
  ['estate  18.00–23.00',             '2026-07-06',{ini:'18.00',fin:'23.00'},'1h','—'],
  ['inverno 20.00–04.00 (8h, sogl.10)','2026-11-02',{ini:'20.00',fin:'04.00'},'7h','—'],
  ['inverno 09.00–18.00 (nessuna)',   '2026-11-02',{ini:'09.00',fin:'18.00'},'—','—'],
  ['inverno 18.00–06.00 (12h)',       '2026-11-02',{ini:'18.00',fin:'06.00'},'7h','2h'],
  ['senza data → fascia 21:00',       '',          {ini:'20.00',fin:'04.00'},'7h','—']
];
for(const [etichetta,dal,t,a55,a80] of casi){
  stato.dal=dal;
  const r=tt.ttCalcDay(0,orariDa([t]),false);
  atteso(etichetta+' 55%', hm(r.nottOrd), a55);
  atteso(etichetta+' 80%', hm(r.nottStr), a80);
}

// 18.00–06.00 = 12h, soglia 10h → straordinario dalle 04.00 alle 06.00,
// entrambe in fascia: 2h all'80%, le altre 7h al 55%.
// 20.00–08.00 = 12h → straordinario 06.00–08.00, ma la fascia chiude alle
// 07:00: 1h all'80%, 9h al 55%. L'ora 07.00–08.00 non e' notturna.

// ── Data del giorno ricavata da "Dal" ──
console.log('\n── data del giorno ──');
stato.dal='2026-11-04';                 // mercoledi'
atteso('"Dal" mer 4/11 → MER', iso(tt.ttDataGiorno(2)), '2026-11-04');
atteso('"Dal" mer 4/11 → LUN', iso(tt.ttDataGiorno(0)), '2026-11-02');
stato.dal='2026-11-02';
atteso('"Dal" lun 2/11 → SAB', iso(tt.ttDataGiorno(5)), '2026-11-07');

// ── Notte a cavallo del cambio di fascia ──
console.log('\n── cambio di fascia 31/3 → 1/4 ──');
stato.dal='2027-03-29';
let r=tt.ttCalcDay(2,orariDa([{},{},{ini:'20.00',fin:'04.00'}]),false);
atteso('mer 31/3 20–04 (inverno, 21:00)', hm((r.nottOrd||0)+(r.nottStr||0)), '7h');
stato.dal='2027-04-05';
r=tt.ttCalcDay(3,orariDa([{},{},{},{ini:'20.00',fin:'04.00'}]),false);
atteso('gio 8/4 20–04 (estate, 22:00)', hm((r.nottOrd||0)+(r.nottStr||0)), '6h');

// ── Interruttore off ──
console.log('\n── maggiorazioni notturne disattivate ──');
stato.dal='2026-11-02';
ttMeta.maggiorazioniNott=false;
r=tt.ttCalcDay(0,orariDa([{ini:'18.00',fin:'06.00'}]),false);
atteso('55% non calcolato', hm(r.nottOrd), '—');
atteso('80% non calcolato', hm(r.nottStr), '—');
atteso('golden resta notturna', hm(r.goldenNott), '2h');
ttMeta.maggiorazioniNott=true;

// ── Ore viaggio ──
console.log('\n── ore viaggio (giornata 8h continuate, franchigia 1h) ──');
ttMeta.tipoGiornata=8; ttMeta.viaggioConcesso=60; stato.dal='2026-11-02';
const viaggi=[
  // etichetta, turno, minuti attesi
  ['VEN: 07.50 09.00 16.00 17.00 — rientro dentro le 8h',
   {par:'07.50',ini:'09.00',fin:'16.00',rie:'17.00'}, '10min'],
  ['GIO: 11.20 12.30 19.30 20.30 — rientro al limite',
   {par:'11.20',ini:'12.30',fin:'19.30',rie:'20.30'}, '10min'],
  ['rientro oltre le 8h: 07.50 09.00 16.00 18.00',
   {par:'07.50',ini:'09.00',fin:'16.00',rie:'18.00'}, '1h'],
  ['giornata lunga: 07.50 09.00 19.00 20.00',
   {par:'07.50',ini:'09.00',fin:'19.00',rie:'20.00'}, '1h'],
  ['solo andata corta: 08.40 09.00 16.00 17.00',
   {par:'08.40',ini:'09.00',fin:'16.00',rie:'17.00'}, '—'],
  ['senza partenza: nessun viaggio',
   {ini:'09.00',fin:'16.00',rie:'17.00'}, '—']
];
for(const [etichetta,t,v] of viaggi){
  const r=tt.ttCalcDay(0,orariDa([t]),false);
  atteso(etichetta, hm(r.oreViaggio), v);
}
ttMeta.tipoGiornata=10;

console.log(ko===0?'\nTutti i controlli passati.':`\n${ko} controlli falliti.`);
process.exit(ko?1:0);
