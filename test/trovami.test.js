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

let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(92)+` atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844}});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);
const testo=dati('odg.txt');

console.log('\n── trovarsi nel testo grezzo dell\'OdG vero ──');
for (const [nome,cognome,att] of [
  ['Simone','Panetta',    {nome:'S. Panetta',   ruolo:'Microfonista',  set:'07.30'}],
  ['Claudio','Di Benedetto', {nome:'C. Di Benedetto', ruolo:'Dop',           set:'07.30'}],
  ['Rossella','Calvino',    {nome:'R. Calvino',     ruolo:'Costumista',    set:'O.C.'}],
  ['Ludovico','Di Pasquale',{nome:'L. Di Pasquale',ruolo:'Regista',      set:'07.00'}],
  ['Giulia','Tagliabue',    {nome:'G. Tagliabue',   ruolo:'Aiuto Regista', set:'07.00'}]]) {
  const r = await p.evaluate(([t,pr])=>odgTrovamiNelTesto(t,pr), [testo,{nome,cognome}]);
  ok(cognome, r && {nome:r.nome,ruolo:r.ruolo,set:r.set}, att);
}

console.log('\n── chi non c\'è, non si inventa ──');
ok('cognome assente',   await p.evaluate(t=>odgTrovamiNelTesto(t,{nome:'Anna',cognome:'Bianchi'}),testo), null);
ok('senza profilo',     await p.evaluate(t=>odgTrovamiNelTesto(t,{}),testo), null);
ok('senza testo',       await p.evaluate(()=>odgTrovamiNelTesto('',{nome:'S',cognome:'Panetta'})), null);
ok('cognome senza orario accanto',
   await p.evaluate(()=>odgTrovamiNelTesto('La scena con Panetta che corre via.',{nome:'S',cognome:'Panetta'})), null);
ok('due omonimi: non sceglie',
   await p.evaluate(()=>odgTrovamiNelTesto('Fonico  S. Panetta  07.30  Microfonista  L. Panetta  08.00',{nome:'S',cognome:'Panetta'})), null);

console.log('\n── nella scheda: la troupe estratta mi ha saltato ──');
await p.evaluate(t=>{
  localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
  localStorage.removeItem('cb_odg_io');
  window.currentUser=null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
  odgForzaElenco=false;
  odgCorrente={numero:20,data:'2026-11-09',convocazione:'07.30',testo:t,
    troupe:[{reparto:'REGIA',ruolo:'Regista',nome:'L. Di Pasquale',set:'07.00'},
            {reparto:'FOTOGRAFIA',ruolo:'Dop',nome:'C. Di Benedetto',set:'07.30'}]};
  switchResultTab('odg');
}, testo);
await p.waitForTimeout(250);
ok('niente elenco di sessanta nomi', await p.evaluate(()=>document.querySelector('.odg-chi .t').textContent.trim()), 'Sei tu?');
ok('una riga sola',       await p.evaluate(()=>document.querySelectorAll('.odg-chi .el .riga').length), 1);
ok('ed è la mia',         await p.evaluate(()=>document.querySelector('.odg-chi .n').textContent.trim()), 'S. Panetta');
ok('col ruolo giusto',    await p.evaluate(()=>/Microfonista/.test(document.querySelector('.odg-chi .r').textContent)), true);
ok('due tasti, si\' e no', await p.evaluate(()=>
  [...document.querySelectorAll('.odg-chi .sino button')].map(b=>b.textContent.trim())), ['Sì, sono io','No']);
ok('il sì è quello in evidenza', await p.evaluate(()=>{
  const b=document.querySelector('.odg-chi .sino .si');
  return getComputedStyle(b).backgroundColor !== 'rgba(0, 0, 0, 0)';}), true);
await p.click('.odg-chi .sino .si'); await p.waitForTimeout(200);
ok('confermando, il mio orario', await p.evaluate(()=>document.querySelector('.odg-badge .o').textContent.trim()), '07.30');

console.log('\n── se non mi trova nemmeno lì, l\'elenco ──');
await p.evaluate(t=>{
  localStorage.setItem('cb_profilo',JSON.stringify({nome:'Anna',cognome:'Bianchi',reparto:'Regia'}));
  localStorage.removeItem('cb_odg_io'); odgForzaElenco=false; odgRender();
}, testo);
await p.waitForTimeout(200);
ok('torna l\'elenco',  await p.evaluate(()=>document.querySelector('.odg-chi .t').textContent.trim()), 'Quale sei tu?');
ok('e dice perché',   await p.evaluate(()=>/Anna Bianchi non compare/.test(document.querySelector('.odg-chi .s').textContent)), true);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
