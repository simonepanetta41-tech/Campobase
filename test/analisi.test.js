const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(92)+` atteso ${JSON.stringify(exp)}`);};

const D = {
  titolo:'Missione San Gennaro', totale_scene:184,
  scene_interno:96, scene_esterno:88,
  scene_interno_giorno:60, scene_interno_notte:36,
  scene_esterno_giorno:51, scene_esterno_notte:37,
  max_attori_parlanti:{numero:7, scena:'SC.12 - INT. BAR - GIORNO (p.14)'},
  riassunto:'Una commedia napoletana.',
  scene_list:[{n:'7',ie:'EST',m:'N',p:9},{n:'12',ie:'INT',m:'D',p:14},{n:'35A',ie:'INT',m:'N',p:40}],
  personaggi_scene:{ GENNARO:['7','12','35A'], ASSUNTA:['12'] },
  ambienti_rumorosi:{presente:true,scene:[
    {scena:'SC.12 - INT. BAR - GIORNO (p.14)',tipo:'macchina del caffè'},
    {scena:'SC.7 - EST. PORTO - NOTTE (p.9)',tipo:'traghetti'},
    {scena:'SC.35A - INT. CUCINA - NOTTE (p.40)',tipo:'cappa'}]},
  playback:{presente:true,esibizioni_live:[{scena:'SC.12 - INT. BAR - GIORNO (p.14)',note:'neomelodico'}],playback_puro:[]},
  armi:{presente:true,scene:[{scena:'SC.7 - EST. PORTO - NOTTE (p.9)',arma:'pistola scenica'}]},
  folla:{presente:true,scene:[{scena:'SC.12 - INT. BAR - GIORNO (p.14)',note:'avventori'}]},
  acqua:{presente:true,scene:[{scena:'SC.7 - EST. PORTO - NOTTE (p.9)',tipo:'pioggia'}]}
};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in:async()=>({data:[]}),order(){return this},
             limit:async()=>({data:[]}),upsert:async()=>({error:null}),update:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);

await p.evaluate(d=>{
  window.currentUser=null; window.catNotesData={};
  localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
  localStorage.removeItem('cb_rep_spoglio'); localStorage.removeItem('cb_cat_attive');
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  window.analysisData=d; renderResults(d); switchResultTab('spoglio');
}, D);
await p.waitForTimeout(300);

console.log('\n── i conti in cima ──');
ok('quattro riquadri', await p.evaluate(()=>document.querySelectorAll('#statsRow>div').length), 4);
ok('niente media attori', await p.evaluate(()=>/media/i.test(document.getElementById('statsRow').innerText)), false);
ok('le voci giuste', await p.evaluate(()=>[...document.querySelectorAll('#statsRow .k')].map(e=>e.textContent)),
   ['Scene totali','Interno','Esterno','Max attori stessa scena']);
ok('i numeri',  await p.evaluate(()=>[...document.querySelectorAll('#statsRow .n')].map(e=>e.textContent)),
   ['184','96','88','7']);
ok('giorno e notte sotto interno', await p.evaluate(()=>document.querySelectorAll('#statsRow .u')[0].textContent), '60 g · 36 n');
ok('la scena con più attori', await p.evaluate(()=>[...document.querySelectorAll('#statsRow .u')].pop().textContent), 'sc. 12');
/* Il conto dice quello che si vede, non quello che c'e': lo spoglio
   mostra solo le categorie scelte, e un conto piu' alto di quello a
   schermo sembrerebbe roba persa. Quante ne restano fuori sta scritto in
   fondo, e i due numeri insieme fanno il totale. */
ok('il conteggio in testa', await p.evaluate(()=>{
  const viste = +(document.getElementById('spConta').textContent.match(/(\d+)\s+segnalazion/)||[])[1];
  const fuori = +((document.getElementById('spFuori').textContent.match(/Altre\s+(\d+)/)||[])[1] || 0);
  const tutte = Object.values(spoglioDati(window.analysisData)).reduce((s,v)=>s+(v.scene?.length||0),0);
  return {testa: document.getElementById('spConta').textContent.startsWith('184 scene · '),
          somma: viste + fuori, tutte};
}), {testa:true, somma:7, tutte:7});

console.log('\n── i reparti ──');
/* Si vede solo quello che e' scelto; senza una scelta esplicita vale il
   reparto del profilo. Prima si vedeva tutto, con il proprio reparto in
   cima e gli altri in grigio: e' cambiato perche' chi apre lo spoglio in
   preparazione cerca il proprio lavoro, non un elenco da scorrere. */
ok('solo il mio reparto', await p.evaluate(()=>
  [...document.querySelectorAll('.sp-rep-h span:first-child')].map(e=>e.textContent)), ['Suono']);
ok('ed è marcato come mio', await p.evaluate(()=>document.querySelector('.sp-rep').classList.contains('mio')), true);
ok('niente categorie in grigio', await p.evaluate(()=>
  [...document.querySelectorAll('.sp-cat')].every(c=>!c.classList.contains('spenta'))), true);
ok('quello che resta fuori è scritto', await p.evaluate(()=>{
  const n = document.getElementById('spFuori');
  return n.style.display !== 'none' && /Altre \d+ segnalazioni in categorie non scelte/.test(n.textContent);}), true);
ok('spuntando tutto tornano tutti', await p.evaluate(()=>{
  localStorage.setItem('cb_cat_attive', JSON.stringify(SPOGLIO.map(c=>c.key)));
  spoglioRender(window.analysisData);
  const r = [...document.querySelectorAll('.sp-rep-h span:first-child')].map(e=>e.textContent);
  const out = {quanti: r.length, primo: r[0], fuori: document.getElementById('spFuori').style.display};
  localStorage.removeItem('cb_cat_attive'); spoglioRender(window.analysisData);
  return out;}), {quanti:4, primo:'Suono', fuori:'none'});

console.log('\n── le scene sono pulsanti, in ordine ──');
ok('scene di ambienti rumorosi', await p.evaluate(()=>
  [...document.querySelectorAll('#sp-cat-ambienti_rumorosi .sp-sc')].map(e=>e.textContent)), ['7','12','35A']);
ok('il conteggio accanto al nome', await p.evaluate(()=>
  document.querySelector('#sp-cat-ambienti_rumorosi .q').textContent), '3');

console.log('\n── la scheda della scena ──');
await p.click('#sp-cat-ambienti_rumorosi .sp-sc:nth-child(2)');
await p.waitForTimeout(250);
ok('si apre',       await p.evaluate(()=>getComputedStyle(document.getElementById('spScena')).display), 'flex');
ok('la scena giusta', await p.evaluate(()=>document.querySelector('#spScena .sc-n').textContent), 'Scena 12');
ok('senza il numero nella riga sotto', await p.evaluate(()=>document.querySelector('#spScena .sc-h').textContent),
   'INT. BAR - GIORNO');
ok('chi c\'è in scena', await p.evaluate(()=>[...document.querySelectorAll('#spScena .sp-chip')].map(e=>e.textContent)),
   ['GENNARO','ASSUNTA']);
ok('porta alla pagina', await p.evaluate(()=>document.querySelector('#spScena .sp-vai .p').textContent), 'p. 14 ›');
ok('il mio reparto in cima', await p.evaluate(()=>document.querySelector('#spScena .sp-rep-h span').textContent), 'Suono');
ok('due voci di suono', await p.evaluate(()=>document.querySelectorAll('#spScena .sp-corpo>.sp-rep .sp-riga').length), 2);
ok('con il dettaglio', await p.evaluate(()=>[...document.querySelectorAll('#spScena .sp-corpo>.sp-rep .sp-riga .v')].map(e=>e.textContent)),
   ['Macchina del caffè','Live — neomelodico']);
ok('gli altri reparti ripiegati', await p.evaluate(()=>document.getElementById('spAltri').style.display), 'none');
ok('e il tasto li annuncia', await p.evaluate(()=>document.getElementById('spAltriBtn').textContent.trim()), 'Regia ▾');
await p.click('#spAltriBtn'); await p.waitForTimeout(150);
ok('si aprono',     await p.evaluate(()=>document.getElementById('spAltri').style.display), 'block');
await p.click('#spScena .sc-x'); await p.waitForTimeout(150);
ok('si chiude',     await p.evaluate(()=>getComputedStyle(document.getElementById('spScena')).display), 'none');

console.log('\n── le note per categoria ──');
/* Su una categoria che si vede davvero: lo spoglio mostra solo quelle
   scelte, e "armi" non e' del reparto suono — cercarne la nota dava un
   elemento che non esiste. La nota non c'entra col reparto, quindi ne
   vale una qualunque fra quelle a schermo. */
const K = 'ambienti_rumorosi';
ok('chiusa all\'inizio', await p.evaluate(k=>document.getElementById('sp-nota-'+k).classList.contains('on'), K), false);
await p.evaluate(k=>toggleCatNote(k), K);
ok('si apre', await p.evaluate(k=>document.getElementById('sp-nota-'+k).classList.contains('on'), K), true);
await p.fill('#sp-nota-ta-'+K,'Chiedere la scenica al pompiere');
await p.waitForTimeout(100);
ok('il tasto si accende', await p.evaluate(k=>document.getElementById('sp-nota-b-'+k).classList.contains('pieno'), K), true);
ok('e resta dopo un ridisegno', await p.evaluate(k=>{spoglioRender(window.analysisData);
  return document.getElementById('sp-nota-ta-'+k).value}, K), 'Chiedere la scenica al pompiere');

console.log('\n── Altro: Script e Analisi sono due voci ──');
await p.evaluate(()=>switchResultTab('altro'));
await p.waitForTimeout(150);
ok('le voci', await p.evaluate(()=>[...document.querySelectorAll('.altro-el .t')].map(e=>e.textContent)),
   ['Script','Analisi','Troupe','Cast','Wrap']);
ok('Script apre il testo', await p.evaluate(()=>{switchResultTab('script');
  return getComputedStyle(document.getElementById('scriptSection')).display!=='none'}), true);

console.log('\n── la pagina Analisi ──');
await p.evaluate(()=>switchResultTab('analisi'));
await p.waitForTimeout(200);
ok('sette reparti',  await p.evaluate(()=>document.querySelectorAll('#anReparti button').length), 7);
ok('il mio è scelto',await p.evaluate(()=>document.querySelector('#anReparti button.on').textContent), 'Suono');
ok('ventuno spunte', await p.evaluate(()=>document.querySelectorAll('.an-sp').length), 21);
ok('accese quelle di suono', await p.evaluate(()=>document.querySelectorAll('.an-sp.on').length), 4);
ok('ognuna si spiega', await p.evaluate(()=>[...document.querySelectorAll('.an-sp .d')].every(e=>e.textContent.length>15)), true);

console.log('\n── una spunta cambia lo spoglio ──');
await p.evaluate(()=>analisiSpunta('armi'));
await p.waitForTimeout(200);
ok('ora è accesa',   await p.evaluate(()=>document.querySelectorAll('.an-sp.on').length), 5);
await p.evaluate(()=>switchResultTab('spoglio'));
await p.waitForTimeout(200);
/* Spuntando "armi" compare il suo reparto, e nient'altro: la spunta
   aggiunge quello che si vede, non riporta tutto. Il proprio reparto
   resta comunque il primo. */
ok('compare il reparto di armi', await p.evaluate(()=>
  [...document.querySelectorAll('.sp-rep-h span:first-child')].map(e=>e.textContent)), ['Suono','Stunt & SFX']);
ok('la categoria c\'è davvero', await p.evaluate(()=>!!document.getElementById('sp-cat-armi')), true);
// "mio" marca il proprio reparto, non quello che si e' appena spuntato.
ok('in evidenza resta il mio', await p.evaluate(()=>
  document.querySelector('.sp-rep').classList.contains('mio') &&
  !document.getElementById('sp-cat-armi').closest('.sp-rep').classList.contains('mio')), true);

console.log('\n── cambiare reparto riparte dal suo preset ──');
await p.evaluate(()=>{switchResultTab('analisi');analisiReparto('costumi')});
await p.waitForTimeout(200);
ok('scelto costumi', await p.evaluate(()=>document.querySelector('#anReparti button.on').textContent), 'Costumi');
ok('due spunte accese', await p.evaluate(()=>document.querySelectorAll('.an-sp.on').length), 2);
ok('vince sul profilo', await p.evaluate(()=>spoglioMioReparto()), 'costumi');
await p.evaluate(()=>switchResultTab('spoglio'));
await p.waitForTimeout(200);
ok('costumi non ha scene, quindi non compare', await p.evaluate(()=>
  [...document.querySelectorAll('.sp-rep-h span')].map(e=>e.textContent).includes('Costumi')), false);
/* E il suono sparisce del tutto, non si scolorisce: scelti i costumi, si
   vedono i costumi. Qui pero' lo spoglio resta vuoto — questa
   sceneggiatura di costumi non segnala niente — e allora deve dire
   perche': "nessuna criticita'" manderebbe a cercare un guasto che non
   c'e'. */
ok('e il suono sparisce', await p.evaluate(()=>!document.getElementById('sp-cat-ambienti_rumorosi')), true);
ok('lo spoglio spiega il vuoto', await p.evaluate(()=>{
  const t = document.getElementById('catsGrid').textContent;
  return {scelte: /categorie scelte/.test(t), altre: /in altre categorie/.test(t),
          criticita: /Nessuna criticità/.test(t)};
}), {scelte:true, altre:true, criticita:false});

console.log('\n── la scelta sopravvive alla chiusura ──');
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
ok('reparto ricordato', await p.evaluate(()=>spoglioMioReparto()), 'costumi');
ok('categorie ricordate', await p.evaluate(()=>[...catAttive()].sort()), ['costumi_criticita','costumi_speciali']);

console.log('\n── sceneggiatura senza criticità ──');
await p.evaluate(()=>{window.currentUser=null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  renderResults({titolo:'X',totale_scene:10,scene_list:[]}); switchResultTab('spoglio');});
await p.waitForTimeout(200);
ok('lo dice', await p.evaluate(()=>/Nessuna criticità/.test(document.getElementById('catsGrid').innerText)), true);
ok('e i conti reggono il vuoto', await p.evaluate(()=>[...document.querySelectorAll('#statsRow .n')].map(e=>e.textContent)),
   ['10','—','—','—']);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);

// ritratti
await p.evaluate(d=>{localStorage.removeItem('cb_rep_spoglio');localStorage.removeItem('cb_cat_attive');
  localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
  window.analysisData=d;renderResults(d);switchResultTab('spoglio');window.scrollTo(0,0)}, D);
await p.waitForTimeout(300);
await p.screenshot({path:__dirname+'/q1-spoglio.png',fullPage:true});
await p.evaluate(()=>spoglioApriScena('12')); await p.waitForTimeout(250);
await p.screenshot({path:__dirname+'/q2-scena.png'});
await p.evaluate(()=>{spoglioChiudiScena();switchResultTab('analisi');window.scrollTo(0,0)});
await p.waitForTimeout(250);
await p.screenshot({path:__dirname+'/q3-analisi.png',fullPage:true});
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
