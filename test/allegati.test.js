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
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(92)+` atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);
const giri=dati('giri.txt');
const stra=dati('stralci.txt');

console.log('\n── il pick-up dai giri auto veri ──');
const pu = await p.evaluate(t=>odgPickUp(t,{nome:'Simone',cognome:'Panetta'}), giri);
ok('ora di partenza, non di arrivo', pu.ora, '07.00');
ok('arrivo',       pu.arrivo, '07.30');
ok('luogo, con la lettera mangiata dal PDF rimessa', pu.luogo, 'TURSPORT HOTEL RESIDENCE');
ok('indirizzo',    pu.indirizzo, 'Via del Faro, 58, 74122 Taranto TA');
ok('destinazione', pu.destinazione, 'CB');
ok('autista',      pu.autista, 'Antonio Ferraro');
ok('telefono',     pu.tel, '3330007326');
ok('compagni di furgone', pu.conMe, ['D.De Marchi','A.Grimaldi']);
ok('altri: Portelli', (await p.evaluate(t=>odgPickUp(t,{cognome:'Portelli'}),giri)).ora, '07.15');
ok('un furgone con otto persone',
   (await p.evaluate(t=>odgPickUp(t,{cognome:'Abate'}),giri)).conMe.length, 7);
ok('cognome in due parole', (await p.evaluate(t=>odgPickUp(t,{cognome:'De Santis'}),giri)).autista, 'Marcello De Ruggiero');
ok('chi non c\'è',  await p.evaluate(t=>odgPickUp(t,{cognome:'Bianchi'}),giri), null);
ok('"INDIRIZZO" non è un cognome',
   await p.evaluate(t=>{const r=odgPickUp(t,{cognome:'Grimaldi'});return r&&r.autista},giri), 'Antonio Ferraro');

console.log('\n── gli stralci ──');
const st = await p.evaluate(t=>odgStralci(t), stra);
ok('scene trovate', Object.keys(st), ['32','33','65C']);
ok('intestazione',  st['32'].testa, 'EST. CAMPI STERMINATI, IN AUTO - GIORNO');
ok('testo',         st['33'].testo.startsWith('... finché l’auto arriva'), true);
ok('32END trova la 32', await p.evaluate(s=>odgStralcioDi(s,'32END').testa, st), 'EST. CAMPI STERMINATI, IN AUTO - GIORNO');
ok('32PT trova la 32',  await p.evaluate(s=>!!odgStralcioDi(s,'32PT'), st), true);
ok('65C resta 65C',     await p.evaluate(s=>odgStralcioDi(s,'65C').testa, st), 'EST. STRADE, IN CAMIONETTA - GIORNO');
ok('65 non diventa 65C', await p.evaluate(s=>odgStralcioDi(s,'65'), st), null);
ok('scena assente',     await p.evaluate(s=>odgStralcioDi(s,'99'), st), null);

console.log('\n── nella scheda ──');
await p.evaluate(([g,sx])=>{
  localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
  localStorage.setItem('cb_odg_io',JSON.stringify({nome:'S. Panetta',ruolo:'Microfonista',reparto:'SUONO'}));
  window.currentUser=null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
  odgCorrente={numero:20,data:'2026-11-09',convocazione:'07.30',
    ospedale:'SAN GIUSEPPE MOSCATI, STATTE',
    contatti:[{nome:'Maria Chiara De Santis',ruolo:'Organizzatore',tel:'3330000022'}],
    scene:[{n:'32END',ie:'E',m:'G',ambiente:'CAMPI STERMINATI',sinossi:'Colonna osserva.',ids:'1, 19',pag:'1/8'},
           {n:'71',ie:'I',m:'G',ambiente:'CHIESA',sinossi:'Senza stralcio.',ids:'1'}],
    pickup: odgPickUp(g,{nome:'Simone',cognome:'Panetta'}),
    stralci: odgStralci(sx)};
  switchResultTab('odg');
}, [giri,stra]);
await p.waitForTimeout(250);
ok('sezione passaggio',   await p.evaluate(()=>/IL TUO PASSAGGIO/.test(document.getElementById('odgCorpo').innerText)), true);
ok('orario grande = partenza', await p.evaluate(()=>document.querySelector('.odg-pick .v').textContent), '07.00');
ok('e sotto l\'arrivo',   await p.evaluate(()=>document.querySelector('.odg-pick .v2').textContent), '07.30');
ok('con chi sei in furgone', await p.evaluate(()=>/De Marchi/.test(document.querySelector('.odg-pick .conme').innerText)), true);
ok('autista chiamabile',  await p.evaluate(()=>document.querySelector('.odg-pick .odg-tel').getAttribute('href')), 'tel:3330007326');
ok('ospedale in un riquadro suo', await p.evaluate(()=>{
  const c=[...document.querySelectorAll('.card')].find(x=>/Ospedale/.test(x.innerText));
  return !!c && !/De Santis/.test(c.innerText);}), true);
ok('e dopo i numeri utili', await p.evaluate(()=>{
  const n=[...document.querySelectorAll('.card')].findIndex(x=>/De Santis/.test(x.innerText));
  const o=[...document.querySelectorAll('.card')].findIndex(x=>/Ospedale/.test(x.innerText));
  return o>n;}), true);
ok('scena con stralcio apribile', await p.evaluate(()=>!!document.querySelector('.odg-scene li.apre')), true);
ok('scena senza stralcio no',     await p.evaluate(()=>document.querySelectorAll('.odg-scene li.apre').length), 1);

console.log('\n── apro la scena ──');
await p.click('.odg-scene li.apre'); await p.waitForTimeout(200);
ok('si apre',        await p.evaluate(()=>getComputedStyle(document.getElementById('odgScena')).display!=='none'), true);
ok('numero',         await p.evaluate(()=>document.querySelector('.sc-n').textContent), '32END');
ok('intestazione',   await p.evaluate(()=>document.querySelector('.sc-h').textContent), 'EST. CAMPI STERMINATI, IN AUTO - GIORNO');
ok('testo della scena', await p.evaluate(()=>/La Lancia taglia alcuni campi/.test(document.querySelector('.sc-corpo').innerText)), true);
ok('cast in scena',  await p.evaluate(()=>/1, 19/.test(document.querySelector('.sc-id').innerText)), true);
await p.click('.sc-x'); await p.waitForTimeout(150);
ok('si chiude',      await p.evaluate(()=>getComputedStyle(document.getElementById('odgScena')).display), 'none');

console.log('\n── testi e barra ──');
ok('"Sei tu?" senza spiegazione', await p.evaluate(()=>{
  localStorage.removeItem('cb_odg_io'); odgForzaElenco=false;
  odgCorrente.troupe=[{reparto:'SUONO',ruolo:'Microfonista',nome:'S. Panetta',set:'07.30'}];
  odgRender(); return !document.querySelector('.odg-chi.uno .s');}), true);
ok('impostazioni: Account', await p.evaluate(()=>[...document.querySelectorAll('.settings-title')].some(e=>e.textContent.trim()==='Account')), true);
ok('niente rimbalzo agli estremi', await p.evaluate(()=>getComputedStyle(document.body).overscrollBehaviorY), 'none');

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
