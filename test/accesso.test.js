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
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
          signInWithOAuth:async()=>{window.__google=true;return{}},signOut:async()=>({})},
    from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[]}),
               upsert:async()=>({error:null}),single:async()=>({data:null})}),
    storage:{from:()=>({})}})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);

console.log('\n── la prima cosa che si vede ──');
ok('la pagina di accesso è quella aperta', await p.evaluate(()=>getComputedStyle(document.getElementById('authPage')).display!=='none'), true);
ok('dice come si chiama',   await p.evaluate(()=>document.querySelector('.acc h1').textContent.trim()), 'Campobase');
ok('dice cosa fa',          await p.evaluate(()=>/per tutta la troupe/i.test(document.querySelector('.acc-claim').innerText.replace(/\n/g,' '))), true);
ok('c\'è il ciak',           await p.evaluate(()=>!!document.querySelector('.acc-marchio')), true);

console.log('\n── niente caselle in faccia prima di sapere cos\'è ──');
ok('email nascosta',        await p.evaluate(()=>getComputedStyle(document.getElementById('accMail')).display), 'none');
ok('due sole scelte',       await p.evaluate(()=>[...document.querySelectorAll('#accScelte .acc-btn')].map(b=>b.textContent.trim())),
                            ['Continua con Google','Entra con una mail']);
ok('Google in evidenza',    await p.evaluate(()=>document.querySelector('#accScelte .acc-btn').classList.contains('amb')), true);
ok('niente riga in fondo',  await p.evaluate(()=>!document.querySelector('.acc-minuto')), true);

console.log('\n── "entra con una mail" apre il modulo ──');
await p.click('#accScelte .acc-btn:nth-child(2)');
await p.waitForTimeout(200);
ok('modulo visibile',       await p.evaluate(()=>getComputedStyle(document.getElementById('accMail')).display!=='none'), true);
ok('scelte via',            await p.evaluate(()=>getComputedStyle(document.getElementById('accScelte')).display), 'none');
ok('campo attivo',          await p.evaluate(()=>document.activeElement.id), 'authEmail');
ok('Accedi / Registrati',   await p.evaluate(()=>[...document.querySelectorAll('.acc-tabs .auth-tab')].map(b=>b.textContent.trim())), ['Accedi','Registrati']);

console.log('\n── il meccanismo di prima funziona ancora ──');
await p.evaluate(()=>setAuthMode('signup'));
ok('passa a Registrati',    await p.evaluate(()=>document.getElementById('tabSignup').classList.contains('active')), true);
ok('e il tasto lo dice',    await p.evaluate(()=>document.getElementById('authBtn').textContent.trim()), 'Registrati');
await p.evaluate(()=>setAuthMode('login'));
ok('e torna indietro',      await p.evaluate(()=>document.getElementById('authBtn').textContent.trim()), 'Accedi');
await p.evaluate(()=>loginWithGoogle());
await p.waitForTimeout(200);
ok('Google parte',          await p.evaluate(()=>!!window.__google), true);

console.log('\n── tocco comodo e niente che esca dallo schermo ──');
const h=await p.evaluate(()=>Math.min(...[...document.querySelectorAll('.acc-btn,.acc-campo,.acc-tabs .auth-tab')]
  .filter(e=>e.offsetParent!==null)                    // solo quelli davvero a schermo
  .map(e=>e.getBoundingClientRect().height)));
ok(`tasti e caselle ≥ 40px (min ${Math.round(h)})`, h>=40, true);
ok('niente scorrimento orizzontale', await p.evaluate(()=>document.documentElement.scrollWidth<=390), true);

await p.evaluate(()=>{document.getElementById('accMail').style.display='none';
  document.getElementById('accScelte').style.display='block';});
const d=await p.evaluate(()=>{
  const c=document.querySelector('.acc-claim').getBoundingClientRect();
  const b=document.querySelector('#accScelte .acc-btn').getBoundingClientRect();
  return {stacco:Math.round(b.top-c.bottom), fondo:Math.round(innerHeight-b.bottom)};});
ok(`tasti poco sotto la frase (${d.stacco}px)`, d.stacco<70, true);
ok('e non incollati al bordo', d.fondo>60, true);
ok('la pagina non sfora lo schermo',
   await p.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1), true);
ok('i tasti stanno dentro lo schermo', d.fondo>=0, true);
const centro=await p.evaluate(()=>{
  const g=document.querySelector('.acc-alto').getBoundingClientRect();
  const b=document.querySelector('#accScelte').getBoundingClientRect();
  return Math.round(((g.top+b.bottom)/2) - innerHeight/2);});
ok(`blocco centrato (scarto ${centro}px)`, Math.abs(centro)<30, true);
ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
await p.evaluate(()=>{document.getElementById('accMail').style.display='none';document.getElementById('accScelte').style.display='block'});
await p.screenshot({path:__dirname+'/i1-accesso.png'});
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
