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
  {h:7,  t:9,  p:10, vt:8,  c:2},
  {h:8,  t:11, p:10, vt:10, c:3},
  {h:9,  t:13, p:5,  vt:19, c:3},   // appena sotto la soglia
  {h:10, t:15, p:5,  vt:20, c:2},   // esattamente la soglia: tira
  {h:11, t:17, p:0,  vt:27, c:2},
  {h:12, t:18, p:70, vt:14, c:63}
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
  return {apribile: /odg-prev apribile/.test(h), invito: /ora per ora/.test(h)};
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
ok('un\'ora per riga',        fin.quante, 6);
ok('dalle 7 alle 12',         [fin.orari[0], fin.orari[5]], ['07:00','12:00']);
ok('coi gradi',               fin.gradi[0], '9°');
ok('alba e tramonto',         fin.luce, ['07:03','17:59']);

console.log('\n── ⚠ la soglia del vento, nei due versi ──');
/* 19 non tira, 20 tira. Se la soglia scivolasse, la riga gialla
   direbbe una cosa che non e' vera — ed e' l'unico giudizio che questa
   schermata si permette. */
ok('8, 10 e 19 km/h sono spenti', fin.ventose.slice(0,3), [false,false,false]);
ok('20 e 27 sono accesi',         fin.ventose.slice(3,5), [true,true]);
ok('e 14 torna spento',           fin.ventose[5], false);
ok('la nota conta le ore vere',   /supera i 20 km\/h per 2 ore/.test(fin.nota), true);
ok('e parte dalla prima ora',     /Dalle 7 alle 12/.test(fin.nota), true);

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
ok('e la mattina è sparita',      m.orari.length, 4);
ok('la nota parte da lì',         /Dalle 9 alle 12/.test(m.nota), true);
/* Il vento si conta su quello che si vede: dire "per 2 ore" mostrandone
   una sola sarebbe una riga che contraddice la schermata sotto. */
ok('e conta il vento che resta',  /per 2 ore/.test(m.nota), true);

const tardi = await alle(20, OGGI);
ok('a giornata finita si vede tutto', tardi.orari.length, 6);
ok('e la riga lo dice',               /ore di lavoro di oggi sono passate/.test(tardi.nota), true);

/* Su un ordine del giorno che non e' di oggi non e' passato niente. */
const domani = await alle(20, '2099-01-01');
ok('su un altro giorno niente si toglie', domani.orari.length, 6);

console.log('\n── si chiude ──');
ok('chiusa', await p.evaluate(()=>{meteoChiudi();
  return document.getElementById('odgMeteo').classList.contains('on');}), false);

console.log('\n── un\'ora senza dati non inventa niente ──');
ok('trattino al posto dei gradi', await p.evaluate(a=>{
  odgCorrente = {data:'2026-11-12', scene:[],
    previsione:{...a, ore:[{h:7, t:null, p:null, vt:null, c:null}]}};
  meteoApri(new Date('2026-11-12T06:00:00'));
  const o = document.querySelector('#odgMeteo .mt-o');
  return {gradi:o.querySelector('.mt-t').textContent, righe:o.querySelectorAll('.mt-r').length};
}, PREV), {gradi:'—', righe:0});

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
