const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(42)} ${JSON.stringify(got)}`.padEnd(84)+` atteso ${JSON.stringify(exp)}`);};
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
await p.evaluate(()=>{
  window.currentUser=null; localStorage.clear();
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  showPage('home');
});

console.log('\n── la pagina dei progetti ──');
ok('si chiama così',     await p.evaluate(()=>document.querySelector('.prog-tit').textContent.trim()), 'I tuoi progetti');
ok('in testa il film o Campobase', await p.evaluate(()=>document.getElementById('cbNome').textContent.trim()), 'Campobase');
ok('c\'è il tasto nuovo',  await p.evaluate(()=>/Nuovo progetto/.test(document.getElementById('progNuovo').textContent)), true);
ok('caricamento chiuso', await p.evaluate(()=>getComputedStyle(document.getElementById('uploadPanel')).display), 'none');

console.log('\n── senza progetti ──');
await p.evaluate(()=>renderHistoryGrid([]));
ok('lo dice',            await p.evaluate(()=>/Nessun progetto/.test(document.querySelector('.prog-vuoto').innerText)), true);
ok('e dice come farne uno', await p.evaluate(()=>/sceneggiatura/.test(document.querySelector('.prog-vuoto').innerText)), true);

console.log('\n── con tre progetti ──');
const oggi=new Date(), anno=oggi.getFullYear();
await p.evaluate(a=>renderHistoryGrid([
  {id:'a',created_at:a+'-11-02T10:00:00Z',version_label:'v1',data:{titolo:'Missione San Gennaro',totale_scene:184}},
  {id:'b',created_at:a+'-09-12T10:00:00Z',version_label:'v3',data:{titolo:'Le stanze di sotto',totale_scene:96}},
  {id:'c',created_at:(a-1)+'-06-04T10:00:00Z',version_label:'v1',data:{titolo:null,totale_scene:0}}
]),anno);
ok('tre righe',          await p.evaluate(()=>document.querySelectorAll('.prog').length), 3);
ok('titolo',             await p.evaluate(()=>document.querySelector('.prog .t').textContent), 'Missione San Gennaro');
ok('scene e data',       await p.evaluate(()=>document.querySelector('.prog .s').textContent), '184 scene · 2 nov');
ok('la versione solo se non è v1', await p.evaluate(()=>document.querySelectorAll('.prog .s')[1].textContent), '96 scene · v3 · 12 set');
ok('anno quando non è questo',     await p.evaluate(()=>/\d{4}/.test(document.querySelectorAll('.prog .s')[2].textContent)), true);
ok('senza titolo non resta vuoto', await p.evaluate(()=>document.querySelectorAll('.prog .t')[2].textContent), 'Senza titolo');
ok('ogni riga ha il cestino',      await p.evaluate(()=>document.querySelectorAll('.prog .x').length), 3);
ok('righe alte abbastanza',        await p.evaluate(()=>Math.min(...[...document.querySelectorAll('.prog')].map(e=>e.getBoundingClientRect().height))>=56), true);
ok('otto righe stanno in uno schermo',
   await p.evaluate(()=>document.querySelector('.prog').getBoundingClientRect().height*8 < 844), true);

console.log('\n── il tasto apre e chiude il caricamento ──');
await p.click('#progNuovo'); await p.waitForTimeout(200);
ok('pannello aperto',    await p.evaluate(()=>getComputedStyle(document.getElementById('uploadPanel')).display!=='none'), true);
ok('il tasto diventa annulla', await p.evaluate(()=>/Annulla/.test(document.getElementById('progNuovo').textContent)), true);
ok('c\'è la zona di caricamento', await p.evaluate(()=>!!document.getElementById('uploadZone')), true);
await p.click('#progNuovo'); await p.waitForTimeout(200);
ok('richiuso',           await p.evaluate(()=>getComputedStyle(document.getElementById('uploadPanel')).display), 'none');

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
await p.evaluate(()=>window.scrollTo(0,0));
await p.screenshot({path:__dirname+'/l1-progetti.png'});
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
