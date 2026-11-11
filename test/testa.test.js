const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(40)} ${JSON.stringify(got)}`.padEnd(82)+` atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},
    from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[]}),
               single:async()=>({data:null}),maybeSingle:async()=>({data:null}),
               insert:async()=>({data:null}),upsert:async()=>({error:null}),
               delete(){return this},update(){return this},neq(){return this}}),
    storage:{from:()=>({upload:async()=>({}),download:async()=>({})})}})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);
await p.evaluate(()=>{
  window.currentUser=null; localStorage.clear();
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
});

console.log('\n── l\'intestazione vecchia non c\'è più ──');
ok('niente logo da 80px',   await p.evaluate(()=>!document.querySelector('.brand-mark')), true);
ok('niente HOME/IMPOSTAZIONI', await p.evaluate(()=>!document.querySelector('.nav-tabs')), true);
ok('niente "Analisi Completata"', await p.evaluate(()=>!document.getElementById('resTitle')), true);
ok('niente "Esci" in testa',await p.evaluate(()=>!document.querySelector('.btn-logout')), true);

console.log('\n── la nuova ──');
ok('c\'è',                  await p.evaluate(()=>!!document.querySelector('.cb-testa')), true);
ok('è fissa in alto',       await p.evaluate(()=>getComputedStyle(document.querySelector('.cb-testa')).position), 'sticky');
const h=await p.evaluate(()=>Math.round(document.querySelector('.cb-testa').getBoundingClientRect().height));
ok('bassa (< 60px)',        h<60, true);
console.log(`       altezza ${h}px, prima erano 80 di solo logo più la riga di navigazione`);
ok('ingranaggio',           await p.evaluate(()=>!!document.querySelector('.cb-ing')), true);

console.log('\n── dice su cosa stai lavorando ──');
await p.evaluate(()=>{document.getElementById('homePage').style.display='block';
  document.getElementById('resultsPage').style.display='none';cbTestata()});
ok('in home: Campobase',    await p.evaluate(()=>document.getElementById('cbNome').textContent.trim()), 'Campobase');
ok('indietro nascosto',     await p.evaluate(()=>document.querySelector('.cb-back').style.display), 'none');

await p.evaluate(()=>{document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').style.display='block';
  document.getElementById('tt-film').value='Missione San Gennaro';cbTestata()});
ok('nel progetto: il film', await p.evaluate(()=>document.getElementById('cbNome').textContent.trim()), 'Missione San Gennaro');
ok('indietro visibile',     await p.evaluate(()=>document.querySelector('.cb-back').style.display), '');

console.log('\n── i tasti funzionano ──');
await p.click('.cb-ing');
await p.waitForTimeout(200);
ok('ingranaggio apre le impostazioni', await p.evaluate(()=>getComputedStyle(document.getElementById('settingsPage')).display!=='none'), true);
await p.click('.cb-ident');
await p.waitForTimeout(200);
ok('il titolo torna alla home', await p.evaluate(()=>getComputedStyle(document.getElementById('homePage')).display!=='none'), true);

console.log('\n── la barra in fondo resta ──');
await p.evaluate(()=>{document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').style.display='block';switchResultTab('odg')});
ok('cinque schede', await p.evaluate(()=>document.querySelectorAll('.result-tabs .result-tab').length), 5);
ok('non la copre l\'intestazione', await p.evaluate(()=>{
  const t=document.querySelector('.cb-testa').getBoundingClientRect();
  const b=document.querySelector('.result-tabs').getBoundingClientRect();
  return b.top > t.bottom;}), true);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
await p.evaluate(()=>{localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
  odgCorrente={numero:20,data:'2026-11-09',convocazione:'07.30',prontiAGirare:'08.30',
    fineRiprese:'15.00',ambiente:'CAMPI STERMINATI',meteo:'Soleggiato',
    dawn:'06.36',alba:'07.03',tramonto:'17.59',dusk:'18.25',
    location:'Masseria Lamie, Monteiasi',
    troupe:[{reparto:'SUONO',ruolo:'Microfonista',nome:'S. Panetta',set:'07.30'}],
    scene:[{n:'32END',ie:'E',m:'G',ambiente:'CAMPI STERMINATI',sinossi:'Colonna osserva il maestro.',ids:'1, 19',pag:'1/8'}],
    cast:[{id:'1',ruolo:'PRINCIPE COLONNA',interprete:'ROCCO PAPALEO',scene:'33',pickup:'06.00',set:'08.30'}],
    contatti:[{nome:'Maria Chiara De Santis',ruolo:'Organizzatore Generale',tel:'3330000022'}]};
  localStorage.setItem('cb_odg_io',JSON.stringify({nome:'S. Panetta',ruolo:'Microfonista',reparto:'SUONO'}));
  document.getElementById('tt-film').value='Missione San Gennaro';
  switchResultTab('odg'); window.scrollTo(0,0);});
await p.waitForTimeout(300);
const gap=await p.evaluate(()=>{
  const t=document.querySelector('.cb-testa').getBoundingClientRect();
  const h=document.querySelector('.odg-testa .h1').getBoundingClientRect();
  return Math.round(h.top-t.bottom);});
ok('stacco sotto l\'intestazione (< 30px)', gap<30, true);
console.log(`       ${gap}px`);
await p.screenshot({path:__dirname+'/h1-testa.png'});
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
