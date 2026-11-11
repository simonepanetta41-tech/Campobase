const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
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

const P=JSON.parse(dati('piano.json'));
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(90)+` atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in:async()=>({data:[]}),order(){return this},
             limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);
await p.evaluate(d=>{
  window.currentUser=null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
  window.pdlData=pdlData=d;
  window.pdlShootingData=pdlShootingData={16:{status:'complete',scenes:{'28':'done','29':'done'}},
    17:{status:'complete',scenes:{'30':'done','31':'done','31A':'standby'}},
    18:{status:'complete',scenes:{'34':'done'}},19:{status:'partial',scenes:{'40':'done'}}};
  pdlCurrentMonth=10; pdlCurrentYear=2026;
  document.getElementById('pdlUploadArea').style.display='none';
  document.getElementById('pdlDashboard').style.display='block';
  renderPdlDashboard(); switchResultTab('piano');
}, P);
await p.waitForTimeout(300);

console.log('\n── la testata ──');
ok('titolo',    await p.evaluate(()=>document.getElementById('pdlFilmTitle').textContent), 'Piano di lavorazione');
ok('e sotto il film', await p.evaluate(()=>document.getElementById('pdlFilmInfo').textContent),
   'Missione San Gennaro · regia Mario Bertoldi · v6 del 30.10 · 37 giorni · 184 scene');

console.log('\n── i conti, come nello spoglio ──');
ok('quattro riquadri', await p.evaluate(()=>document.querySelectorAll('#pdlStatsRow>div').length), 4);
ok('niente scatole vecchie', await p.evaluate(()=>document.querySelectorAll('#pdlSection .stat-box').length), 0);
ok('le voci', await p.evaluate(()=>[...document.querySelectorAll('#pdlStatsRow .k')].map(e=>e.textContent)),
   ['Giorni totali','Giornate girate','Scene girate','In stand-by']);
ok('i numeri', await p.evaluate(()=>[...document.querySelectorAll('#pdlStatsRow .n')].map(e=>e.textContent)),
   ['37','3','6','1']);
ok('due barre', await p.evaluate(()=>document.querySelectorAll('.pdl-barra').length), 2);
ok('con i conti giusti', await p.evaluate(()=>[...document.querySelectorAll('.pdl-barra b')].map(e=>e.textContent)),
   ['6/18 · 33%','3/37 · 8%']);

console.log('\n── i giorni si contano, non si leggono ──');
// Com'e' fatto un piano dopo l'unione con un PDL aggiornato: le settimane
// le ha tutte, il campo dichiarato e' rimasto quello del solo PDF nuovo.
ok('le giornate vere battono il totale dichiarato', await p.evaluate(()=>{
  // dopo l'unione con un PDL aggiornato: dentro ci sono tutte e sei le
  // giornate, il campo dichiarato e' rimasto quello delle sole due nuove
  const g = n => ({numero_giorno:n, scene:[{numero:'1'},{numero:'2'}]});
  return pdlTotali({ totale_giorni:2, totale_scene:4,
    settimane:[{giorni:[g(1),g(2),g(3),g(4)]},{giorni:[g(5),g(6)]}] });}), {giorni:6,scene:12});
ok('ma un piano in mano parziale non si sgonfia', await p.evaluate(()=>
  pdlTotali({totale_giorni:38,totale_scene:200,
             settimane:[{giorni:[{numero_giorno:1,scene:[]}]}]})), {giorni:38,scene:200});
ok('e senza settimane resta quello che dice', await p.evaluate(()=>
  pdlTotali({totale_giorni:12,totale_scene:40,settimane:[]})), {giorni:12,scene:40});

console.log('\n── un piano vecchio non torna indietro ──');
ok('il 6 è più vecchio del 7',  await p.evaluate(()=>pdlPiuVecchio('PdL #6 30.10.2026','PdL #7 03.11.2026')), true);
ok('il 7 non è più vecchio del 6', await p.evaluate(()=>pdlPiuVecchio('PdL #7 03.11.2026','PdL #6 30.10.2026')), false);
ok('stessa versione, passa',    await p.evaluate(()=>pdlPiuVecchio('PdL #7 03.11.2026','PdL #7 03.11.2026')), false);
ok('senza numero comanda la data', await p.evaluate(()=>pdlPiuVecchio('PDL del 30.10.2026','PDL del 03.11.2026')), true);
ok('se non si capisce, si lascia passare', await p.evaluate(()=>pdlPiuVecchio('','PdL #7')), false);
ok('e il numero conta più della data', await p.evaluate(()=>
  pdlPiuVecchio('PdL #8 01.11.2026','PdL #7 03.11.2026')), false);

console.log('\n── il calendario del mese ──');
ok('caselle quadrate', await p.evaluate(()=>getComputedStyle(document.querySelector('.cal-cell')).aspectRatio.replace(/\s/g,'')), '1/1.12');
ok('non deborda', await p.evaluate(()=>{const g=document.getElementById('pdlCalGrid');
  return g.scrollWidth<=g.clientWidth+1}), true);
ok('30 giorni + 6 vuote + 7 intestazioni', await p.evaluate(()=>document.querySelectorAll('#pdlCalGrid>div').length), 7+6+30);
ok('le giornate di ripresa', await p.evaluate(()=>document.querySelectorAll('.cal-cell.has-shooting').length), 7);
ok('una giornata pesante', await p.evaluate(()=>document.querySelectorAll('.cal-cell.bg-heavy').length), 2);
ok('tre girate segnate',   await p.evaluate(()=>document.querySelectorAll('.cal-cell.status-complete').length), 3);
ok('la giornata dice D e ora', await p.evaluate(()=>
  document.querySelector('.cal-cell.has-shooting .cal-cell-giorno').textContent.trim()), 'D16 07.30');
ok('la legenda c\'è', await p.evaluate(()=>document.querySelectorAll('.pdl-leg span').length), 5);
ok('e dice la media',await p.evaluate(()=>document.getElementById('pdlAvgLabel').textContent), 'media 3.7 pag/giorno');

console.log('\n── il trasferimento ──');
ok('il posto, senza la preposizione', await p.evaluate(()=>
  ['TRASFERIMENTO A NAPOLI','VIAGGIO VERSO NAPOLI','PARTENZA PER REGGIA DI CASERTA','TRAVEL TO NAPLES','TRASFERIMENTO']
    .map(x=>pdlViaggioLuogo(x))), ['Napoli','Napoli','Reggia Di Caserta','Naples','Trasferimento']);
ok('il pulmino è disegnato, non un\'emoji', await p.evaluate(()=>{
  const c=[...document.querySelectorAll('.cal-cell-bus')];
  return c.length>0 && c.every(e=>!!e.querySelector('svg') && !/[\u{1F300}-\u{1FAFF}]/u.test(e.textContent));}), true);
ok('e prende il colore del viaggio', await p.evaluate(()=>{
  const prova=document.createElement('i'); prova.style.color='var(--viaggio)';
  document.body.appendChild(prova);
  const atteso=getComputedStyle(prova).color; prova.remove();
  return getComputedStyle(document.querySelector('.cal-cell-bus')).color === atteso;}), true);
ok('la casella del viaggio ha solo il pulmino', await p.evaluate(()=>{
  const c=[...document.querySelectorAll('.cal-cell')].find(e=>e.classList.contains('is-viaggio')&&!e.classList.contains('has-shooting'));
  return [!!c.querySelector('.cal-cell-bus'), !c.querySelector('.cal-cell-viaggio'), c.classList.contains('tocca')];}),
  [true,true,true]);
ok('e il nome per intero resta nel titolo', await p.evaluate(()=>
  [...document.querySelectorAll('.cal-cell')].find(e=>e.classList.contains('is-viaggio')&&!e.classList.contains('has-shooting')).title),
  'TRASFERIMENTO A NAPOLI');
ok('anche la giornata che si gira e si sposta', await p.evaluate(()=>{
  const c=[...document.querySelectorAll('.cal-cell.has-shooting')].find(e=>e.textContent.includes('D19'));
  return !!c.querySelector('.cal-cell-bus') && !c.querySelector('.cal-cell-viaggio');}), true);
await p.evaluate(()=>[...document.querySelectorAll('.cal-cell')]
  .find(e=>e.classList.contains('is-viaggio')&&!e.classList.contains('has-shooting')).click());
await p.waitForTimeout(250);
ok('si apre il foglio',   await p.evaluate(()=>document.getElementById('pdlViaggioModal').classList.contains('open')), true);
ok('dice di che giorno',  await p.evaluate(()=>document.getElementById('pdlViaggioData').textContent), 'giovedì 05 novembre 2026');
ok('e dove si va',        await p.evaluate(()=>document.querySelector('#pdlViaggioLuogo .t').textContent), 'Napoli');
ok('con la mappa',        await p.evaluate(()=>decodeURIComponent(document.getElementById('pdlViaggioLuogo').href).endsWith('query=Napoli')), true);
await p.evaluate(()=>chiudiViaggio()); await p.waitForTimeout(150);
ok('si chiude',           await p.evaluate(()=>document.getElementById('pdlViaggioModal').classList.contains('open')), false);
await p.evaluate(()=>openPdlDayModal(19)); await p.waitForTimeout(200);
ok('e nella giornata che si gira sta nella scheda', await p.evaluate(()=>
  document.querySelector('#pdlModalTransfer .v')?.textContent), 'Ginosa');
await p.evaluate(()=>closePdlDayModal()); await p.waitForTimeout(150);

console.log('\n── la settimana ──');
await p.evaluate(()=>{setPdlView('weekly');pdlCurrentWeekStart=new Date(2026,10,9);renderPdlCalendar()});
await p.waitForTimeout(250);
ok('la griglia cambia forma', await p.evaluate(()=>document.getElementById('pdlCalGrid').classList.contains('sett')), true);
ok('le caselle si allungano', await p.evaluate(()=>getComputedStyle(document.querySelector('.cal-cell')).aspectRatio), 'auto');
ok('non deborda',   await p.evaluate(()=>{const g=document.getElementById('pdlCalGrid');
  return g.scrollWidth<=g.clientWidth+1}), true);
ok('il titolo sta su una riga', await p.evaluate(()=>document.getElementById('pdlCalMonth').textContent), '9–15 nov 2026');
ok('il tasto acceso è Settimana', await p.evaluate(()=>document.querySelector('.cal-vista button.on').textContent), 'Settimana');
await p.evaluate(()=>setPdlView('monthly')); await p.waitForTimeout(200);
ok('e si torna al mese', await p.evaluate(()=>document.getElementById('pdlCalGrid').classList.contains('sett')), false);

console.log('\n── la scheda di una giornata ──');
await p.evaluate(()=>openPdlDayModal(20)); await p.waitForTimeout(250);
ok('si apre',   await p.evaluate(()=>document.getElementById('pdlDayModal').classList.contains('open')), true);
ok('in italiano', await p.evaluate(()=>document.getElementById('pdlModalTitle').textContent), 'Giorno 20');
ok('niente trattino a vuoto', await p.evaluate(()=>/–\s*·/.test(document.getElementById('pdlModalSub').textContent)), false);
ok('e dice pag, non pgs', await p.evaluate(()=>/3 1\/8 pag$/.test(document.getElementById('pdlModalSub').textContent)), true);
ok('quattro scene',   await p.evaluate(()=>document.querySelectorAll('#pdlDayModal .pdl-chip').length), 4);
ok('ognuna porta alla sceneggiatura', await p.evaluate(()=>
  [...document.querySelectorAll('#pdlDayModal .pdl-chip')].every(e=>
    /openSceneFromPdl/.test(e.getAttribute('onclick')) && !!e.querySelector('.ch'))), true);
ok('toccarle non le segna più girate', await p.evaluate(async()=>{
  window.alert = ()=>{};                      // senza PDF avvisa e basta
  const prima = JSON.stringify(pdlModalSceneStates);
  document.querySelector('#pdlDayModal .pdl-chip').click();
  await new Promise(r=>setTimeout(r,120));
  return JSON.stringify(pdlModalSceneStates) === prima;}), true);
ok('e il meccanismo è proprio sparito', await p.evaluate(()=>typeof cyclePdlSceneModal), 'undefined');
ok('sale dal basso',  await p.evaluate(()=>getComputedStyle(document.getElementById('pdlDayModal')).alignItems), 'flex-end');
await p.evaluate(()=>closePdlDayModal()); await p.waitForTimeout(150);

console.log('\n── in fondo ──');
ok('si aggiorna il piano', await p.evaluate(()=>!!document.querySelector('.pdl-agg input[type=file]')), true);
ok('e si rimuove',         await p.evaluate(()=>document.querySelector('#pdlSection .odg-togli').textContent.trim()), 'Rimuovi il piano');

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
