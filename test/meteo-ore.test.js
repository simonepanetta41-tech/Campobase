/* Il meteo ora per ora.
 *
 * Le ore erano gia' tutte li': il servizio le manda e l'app ne ricavava
 * tre numeri e una parola. Il riassunto in cima resta quello — e' quello
 * che serve al primo sguardo — ma sotto, per chi vuole guardare, c'e' la
 * giornata com'e' fatta: a che ora arriva la pioggia, a che ora rinforza
 * il vento.
 *
 * Il vento ha una riga sua e si tinge sopra i 20 km/h, perche' su un set
 * e' la cosa che cambia il lavoro: in presa diretta da li' in su si
 * sente. E' l'unico giudizio che questa schermata si permette, quindi
 * dev'essere giusto in tutti e due i versi — acceso quando tira, spento
 * quando non tira.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(48)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

const ORE = [
  {h:7,  g:0, t:9,  p:10, vt:8,  c:2},
  {h:8,  g:0, t:11, p:10, vt:10, c:3},
  {h:9,  g:0, t:13, p:5,  vt:19, c:3},   // appena sotto la soglia
  {h:10, g:0, t:15, p:5,  vt:20, c:2},   // esattamente la soglia: tira
  {h:11, g:0, t:17, p:0,  vt:27, c:2},
  {h:12, g:0, t:18, p:70, vt:14, c:63},
  /* Oltre il wrap previsto, che sull'ordine del giorno era alle 12:
     la sera che si tira oltre, il meteo deve esserci ancora. */
  {h:13, g:0, t:17, p:60, vt:12, c:63},
  {h:22, g:0, t:11, p:30, vt:9,  c:3},
  {h:23, g:0, t:10, p:20, vt:8,  c:3}
];
const PREV = {v:5, comune:'Laterza', cielo:'Nuvoloso', segno:'☁️', min:9, max:18,
              pioggia:70, vento:27, da:7, a:12, ore:ORE, alba:'07:03', tramonto:'17:59'};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},order(){return this},
               single:async()=>({data:null}),maybeSingle:async()=>({data:null})}),
    storage:{from:()=>({upload:async()=>({}),download:async()=>({})})}
  })};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(800);

console.log('\n── la scheda in cima si apre solo se c\'è cosa aprire ──');
const riassunto = (prev) => p.evaluate(a=>{
  odgCorrente = {data:'2026-11-12', previsione:a, scene:[]};
  const h = odgPienoHtml(odgCorrente);
  return {apribile: /odg-prev apribile/.test(h), invito: /più info/.test(h)};
}, prev);
ok('con le ore è apribile',   await riassunto(PREV), {apribile:true, invito:true});
/* Una previsione vecchia, salvata prima che le ore si tenessero: la
   scheda resta quella di sempre e non promette una finestra che non c'e'. */
ok('senza ore no',            await riassunto({...PREV, ore:[]}), {apribile:false, invito:false});

console.log('\n── la finestra ──');
const fin = await p.evaluate(a=>{
  odgCorrente = {data:'2026-11-12', previsione:a, scene:[]};
  // Orologio fisso: se no questi controlli passerebbero solo di mattina
  // presto, e dal pomeriggio in poi diventerebbero rossi da soli.
  meteoApri(new Date('2026-11-12T06:00:00'));
  const el = document.getElementById('odgMeteo');
  const ore = [...el.querySelectorAll('.mt-o')];
  return {
    aperta: el.classList.contains('on'),
    quante: ore.length,
    orari: ore.map(o=>o.querySelector('.mt-h').textContent),
    gradi:  ore.map(o=>o.querySelector('.mt-t').textContent),
    ventose: ore.map(o=>o.classList.contains('ventoso')),
    luce: [...el.querySelectorAll('.mt-luce .v')].map(x=>x.textContent),
    nota: el.querySelector('.mt-nota').textContent.replace(/\s+/g,' ').trim()
  };
}, PREV);
ok('si apre',                 fin.aperta, true);
ok('un\'ora per riga',        fin.quante, 9);
ok('dalle 7 a mezzanotte',    [fin.orari[0], fin.orari[8]], ['07:00','23:00']);
ok('coi gradi',               fin.gradi[0], '9°');
ok('alba e tramonto',         fin.luce, ['07:03','17:59']);

console.log('\n── ⚠ la soglia del vento, nei due versi ──');
/* 19 non tira, 20 tira. Se la soglia scivolasse, la riga gialla
   direbbe una cosa che non e' vera — ed e' l'unico giudizio che questa
   schermata si permette. */
ok('8, 10 e 19 km/h sono spenti', fin.ventose.slice(0,3), [false,false,false]);
ok('20 e 27 sono accesi',         fin.ventose.slice(3,5), [true,true]);
ok('e 14 torna spento',           fin.ventose[5], false);
ok('e la sera è calma',           fin.ventose.slice(6), [false,false,false]);
ok('la nota conta le ore vere',   /supera i 20 km\/h per 2 ore/.test(fin.nota), true);
/* La nota dice una cosa sola: il vento. Gli orari si leggono
   dall'elenco, che e' li' sopra, e ripeterli sotto era rumore. */
ok('la nota parla solo del vento', fin.nota, 'Il vento supera i 20 km/h per 2 ore: in presa diretta si sente.');

const calmo = await p.evaluate(a=>{
  odgCorrente = {data:'2026-11-12', previsione:{...a, ore:a.ore.map(o=>({...o, vt:6}))}, scene:[]};
  meteoApri(new Date('2026-11-12T06:00:00'));
  const el = document.getElementById('odgMeteo');
  return {ventose: [...el.querySelectorAll('.mt-o.ventoso')].length,
          nota: el.querySelector('.mt-nota').textContent.replace(/\s+/g,' ').trim()};
}, PREV);
ok('con poco vento nessuna riga accesa', calmo.ventose, 0);
ok('e la nota non lo nomina',            /vento/.test(calmo.nota), false);

console.log('\n── le ore passate non si mostrano più ──');
/* A meta' pomeriggio le ore della mattina non servono a nessuno: quello
   che si vuole sapere e' se la pioggia arriva prima del wrap. L'ora in
   corso resta — alle 9 e un quarto le 9:00 sono ancora adesso. */
const alle = (ora, data) => p.evaluate(a=>{
  odgCorrente = {data:a.data, previsione:a.prev, scene:[]};
  meteoApri(new Date(a.data + 'T' + String(a.ora).padStart(2,'0') + ':15:00'));
  const el = document.getElementById('odgMeteo');
  return {orari: [...el.querySelectorAll('.mt-h')].map(x=>x.textContent),
          nota: el.querySelector('.mt-nota').textContent.replace(/\s+/g,' ').trim()};
}, {ora, data, prev:PREV});

const OGGI = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
const m = await alle(9, OGGI);
ok('alle 9:15 si parte dalle 9',  m.orari[0], '09:00');
ok('e la mattina è sparita',      m.orari.length, 7);
ok('la nota resta sul vento',     /supera i 20/.test(m.nota), true);
/* Il vento si conta su quello che si vede: dire "per 2 ore" mostrandone
   una sola sarebbe una riga che contraddice la schermata sotto. */
ok('e conta il vento che resta',  /per 2 ore/.test(m.nota), true);

const tardi = await alle(20, OGGI);
ok('alle 20 restano la 22 e la 23',   tardi.orari, ['22:00','23:00']);
ok('e senza vento la nota sparisce',  tardi.nota, '');

/* Su un ordine del giorno che non e' di oggi non e' passato niente.
   L'orologio deve stare su un ALTRO giorno: mettendolo sulla stessa data
   dell'OdG, quella diventa "oggi" e le ore si tolgono lo stesso. */
const domani = await p.evaluate(a=>{
  odgCorrente = {data:'2099-01-01', previsione:a, scene:[]};
  meteoApri(new Date('2026-11-12T20:15:00'));
  return [...document.querySelectorAll('#odgMeteo .mt-h')].length;
}, PREV);
ok('su un altro giorno niente si toglie', domani, 9);

/* ⚠ Con le ore che arrivano a mezzanotte, "sono passate tutte" non puo'
   piu' succedere mentre e' ancora oggi: l'ora 23 resta fino alle 24, e a
   quel punto e' gia' un altro giorno. La riga resta come rete, per una
   previsione che finisse prima — una salvata quando le ore si fermavano
   al wrap — e si prova cosi'. */
const corta = await p.evaluate(a=>{
  odgCorrente = {data:a.oggi, scene:[],
    previsione:{...a.prev, a:12, ore:a.prev.ore.filter(o=>o.h<=12)}};
  meteoApri(new Date(a.oggi + 'T20:15:00'));
  const el = document.getElementById('odgMeteo');
  return {quante: el.querySelectorAll('.mt-h').length,
          nota: el.querySelector('.mt-nota').textContent.replace(/\s+/g,' ').trim()};
}, {prev:PREV, oggi:OGGI});
ok('una previsione già tutta passata si vede lo stesso', corta.quante, 6);
ok('e la riga lo dice',               /La giornata è finita/.test(corta.nota), true);

/* Il caso che conta: sono le 13, il wrap era previsto alle 12, e si sta
   ancora girando. Il meteo non deve essere sparito. */
const oltre = await alle(13, OGGI);
ok('oltre il wrap il meteo c\'è ancora', oltre.orari, ['13:00','22:00','23:00']);

console.log('\n── ⚠ la notturna che sfonda la mezzanotte ──');
/* Convocazione alle 18, wrap previsto alle 02. La fine viene "prima"
   dell'inizio, e contando dentro il giorno la giornata di lavoro
   risultava lunga due ore invece di otto. Qui le ore si contano di fila:
   le 02 di domani sono l'ora 26. */
const NOTTE = [
  {h:18, g:0, t:14, p:10, vt:9,  c:2},
  {h:21, g:0, t:11, p:20, vt:12, c:3},
  {h:23, g:0, t:10, p:40, vt:16, c:3},
  {h:0,  g:1, t:9,  p:60, vt:22, c:61},
  {h:2,  g:1, t:8,  p:70, vt:25, c:61},
  {h:5,  g:1, t:7,  p:30, vt:11, c:3}
];
const nott = await p.evaluate(a=>{
  odgCorrente = {data:'2026-11-12', scene:[],
    previsione:{...a.prev, da:18, a:2, ore:a.ore}};
  meteoApri(new Date('2026-11-12T17:00:00'));
  const el = document.getElementById('odgMeteo');
  return {orari: [...el.querySelectorAll('.mt-h')].map(x=>x.textContent),
          stacchi: [...el.querySelectorAll('.mt-giorno')].map(x=>x.textContent.trim()),
          ventose: [...el.querySelectorAll('.mt-o')].map(o=>o.classList.contains('ventoso'))};
}, {prev:PREV, ore:NOTTE});
ok('ci sono anche le ore di domani', nott.orari, ['18:00','21:00','23:00','00:00','02:00','05:00']);
ok('con una riga dove cambia giorno', nott.stacchi.length, 1);
ok('e la riga dice che giorno è',     /13 novembre/.test(nott.stacchi[0]), true);
ok('il vento si accende anche di notte', nott.ventose, [false,false,false,true,true,false]);

/* All'una e mezza di notte la giornata di lavoro e' ancora quella di
   ieri: sono le ore 25, non le ore 1. Se il conto ripartisse da zero,
   alle 01.30 ricomparirebbero tutte le ore del pomeriggio appena
   passato. */
const dopoMezzanotte = await p.evaluate(a=>{
  odgCorrente = {data:'2026-11-12', scene:[],
    previsione:{...a.prev, da:18, a:2, ore:a.ore}};
  meteoApri(new Date('2026-11-13T01:30:00'));
  return [...document.querySelectorAll('#odgMeteo .mt-h')].map(x=>x.textContent);
}, {prev:PREV, ore:NOTTE});
ok('all\'1.30 restano solo le 02 e le 05', dopoMezzanotte, ['02:00','05:00']);

console.log('\n── ⚠ il riassunto di una notturna ──');
/* Qui stava il guasto vero. Con convocazione alle 18 e wrap alle 02, il
   confronto fra numeri di ora leggeva la giornata al contrario e il
   riassunto in cima finiva per descrivere UN'ORA invece di otto: la
   parola, i gradi, la pioggia e il vento di una notte intera venivano
   dalle 18:00 e basta. */
const estratto = await p.evaluate(async () => {
  // Il servizio finto: due giorni di fila, una temperatura per ora.
  const ore = [];
  for (const g of ['2026-11-12','2026-11-13'])
    for (let h = 0; h < 24; h++) ore.push(g + 'T' + String(h).padStart(2,'0') + ':00');
  const n = ore.length;
  window.odgPosto = async () => ({lat:40.6, lon:16.8, nome:'Laterza'});
  window.fetch = async () => ({ ok:true, json: async () => ({
    hourly: {
      time: ore,
      // 20° di giorno, 5° di notte: se il riassunto prende le ore
      // sbagliate, il minimo lo dice.
      temperature_2m: ore.map(t => (+t.slice(11,13) >= 8 && +t.slice(11,13) <= 17) ? 20 : 5),
      precipitation_probability: new Array(n).fill(10),
      weather_code: new Array(n).fill(2),
      wind_speed_10m: new Array(n).fill(7)
    },
    daily: { sunrise:['2026-11-12T07:03'], sunset:['2026-11-12T17:59'] }
  })});
  const p1 = await odgPrevisione({data:'2026-11-12', convocazione:'18.00', fineLavorazione:'02.00'});
  const p2 = await odgPrevisione({data:'2026-11-12', convocazione:'07.00', fineLavorazione:'18.00'});
  return {
    notte: {da:p1.da, a:p1.a, min:p1.min, max:p1.max,
            prima:p1.ore[0].h, ultima:p1.ore[p1.ore.length-1].h,
            ultimaG:p1.ore[p1.ore.length-1].g, quante:p1.ore.length},
    giorno:{da:p2.da, a:p2.a, min:p2.min, max:p2.max,
            prima:p2.ore[0].h, ultima:p2.ore[p2.ore.length-1].h,
            ultimaG:p2.ore[p2.ore.length-1].g, quante:p2.ore.length}
  };
});
/* Notturna: 18 → 02 sono nove ore di lavoro, tutte di notte, quindi il
   riassunto deve dire 5°. L'elenco arriva a quattro ore oltre il wrap. */
ok('la giornata di lavoro è lunga 9 ore', estratto.notte.quante >= 9, true);
ok('e il riassunto è tutto notte',        [estratto.notte.min, estratto.notte.max], [5,5]);
ok('l\'elenco arriva alle 06 di domani',  [estratto.notte.ultima, estratto.notte.ultimaG], [6,1]);
ok('e parte dalla convocazione',          estratto.notte.prima, 18);

/* Giornata normale: niente cambia. L'elenco si ferma a mezzanotte e il
   riassunto vede sia le ore calde sia la prima e l'ultima piu' fresche. */
ok('la giornata resta a mezzanotte',      [estratto.giorno.ultima, estratto.giorno.ultimaG], [23,0]);
ok('e il riassunto vede il giorno',       [estratto.giorno.min, estratto.giorno.max], [5,20]);
ok('da 7 a 18',                           [estratto.giorno.da, estratto.giorno.a], [7,18]);

console.log('\n── si chiude ──');
ok('chiusa', await p.evaluate(()=>{meteoChiudi();
  return document.getElementById('odgMeteo').classList.contains('on');}), false);

console.log('\n── un\'ora senza dati non inventa niente ──');
ok('trattino al posto dei gradi', await p.evaluate(a=>{
  odgCorrente = {data:'2026-11-12', scene:[],
    previsione:{...a, ore:[{h:7, g:0, t:null, p:null, vt:null, c:null}]}};
  meteoApri(new Date('2026-11-12T06:00:00'));
  const o = document.querySelector('#odgMeteo .mt-o');
  return {gradi:o.querySelector('.mt-t').textContent, righe:o.querySelectorAll('.mt-r').length};
}, PREV), {gradi:'—', righe:0});

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
