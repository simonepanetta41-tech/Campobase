const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
const fs=require('fs');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(48)} ${JSON.stringify(got)}`.padEnd(90)+` atteso ${JSON.stringify(exp)}`);};
const STUB=()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};};
(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage(); p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(STUB);
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
const apri=async()=>{
  await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
  await p.waitForTimeout(700);
  await p.evaluate(()=>{
    window.currentUser=null;
    document.getElementById('authPage').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('homePage').style.display='none';
    document.getElementById('resultsPage').classList.add('on');
    document.querySelectorAll('[id$="Section"]').forEach(s=>s.style.display='none');
    document.getElementById('timetableSection').style.display='flex';
    ttInited=false; ttVista='giorno'; initTimetable(); ttSetGiorno(0);
  });
  await p.waitForTimeout(200);
};

console.log('\n── 1. l\'orario si salva a ogni tasto ──');
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.clear());
await apri();
await p.click('[id$="-inizio"]');
await p.type('[id$="-inizio"]','0730',{delay:30});
// niente blur, niente change: come chiudere l'app con la tastiera aperta
ok('scritto senza confermare il campo',
   await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')||'{}')?.rec?.tabelle?.[0]?.orari?.inizio?.[0]), '07.30');

console.log('\n── e quando l\'app va in secondo piano ──');
await p.evaluate(()=>{const e=document.querySelector('[id$="-fine"]');e.focus();e.value='21.30';});
await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});
  document.dispatchEvent(new Event('visibilitychange'));});
await p.waitForTimeout(120);
ok('preso anche il campo attivo',
   await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')).rec.tabelle[0].orari.fine[0]), '21.30');

console.log('\n── e riaprendo c\'è ──');
await apri();
ok('inizio', await p.evaluate(()=>ttTabelle[0].orari.inizio[0]), '07.30');
ok('fine',   await p.evaluate(()=>ttTabelle[0].orari.fine[0]), '21.30');
ok('a schermo', await p.inputValue('[id$="-fine"]'), '21.30');

console.log('\n── 2. storico senza "vuoto" ──');
ok('riepilogo muto quando è vuoto', await p.evaluate(()=>{ttSommari();return document.getElementById('sum-storico').textContent}), '');

console.log('\n── 3. il profilo si chiede all\'ingresso, non all\'OdG ──');
await p.evaluate(()=>{localStorage.removeItem('cb_profilo');localStorage.removeItem('cb_odg_io');});
ok('c\'è la schermata di benvenuto', await p.evaluate(()=>!!document.getElementById('benvenuto')), true);
ok('si apre se manca il profilo',    await p.evaluate(()=>profiloBenvenuto()), true);
ok('e mostra i tre campi',           await p.evaluate(()=>['profNome','profCognome','profReparto'].every(i=>document.getElementById(i))), true);
await p.fill('#profNome','Simone'); await p.fill('#profCognome','Panetta');
await p.selectOption('#profReparto','Suono');
await p.click('.prof-chiedi .ok'); await p.waitForTimeout(250);
ok('si chiude',                      await p.evaluate(()=>getComputedStyle(document.getElementById('benvenuto')).display), 'none');
ok('e non si riapre',                await p.evaluate(()=>profiloBenvenuto()), false);
await p.evaluate(()=>{odgCorrente={numero:20,data:'2026-11-09',convocazione:'07.30',
  troupe:[{reparto:'SUONO',ruolo:'Microfonista',nome:'S. Panetta',set:'07.30'}]};
  document.getElementById('resultsPage').classList.add('on'); switchResultTab('odg');});
await p.waitForTimeout(200);
ok('l\'OdG non richiede il nome',     await p.evaluate(()=>!document.querySelector('#odgCorpo .prof-chiedi')), true);
ok('chiede solo la conferma',        await p.evaluate(()=>document.querySelector('.odg-chi .t').textContent.trim()), 'Sei tu?');

console.log('\n── 4. Gennaro nascosto ──');
ok('niente voce in Altro', await p.evaluate(()=>!/Gennaro/.test(document.getElementById('altroSection').innerText)), true);
ok('niente chat nei risultati', await p.evaluate(()=>{
  const e=document.getElementById('chatSection'); return !e || getComputedStyle(e).display==='none';}), true);
ok('il codice resta',      await p.evaluate(()=>typeof toggleGennaroDrawer==='function'), true);

console.log('\n── 5. le impostazioni coprono i risultati ──');
await p.evaluate(()=>showPage('settings'));
await p.waitForTimeout(200);
ok('risultati via',   await p.evaluate(()=>{const e=document.getElementById('resultsPage');
  return getComputedStyle(e).display==='none'||!e.classList.contains('on')}), true);
ok('niente OdG in fondo', await p.evaluate(()=>{
  const e=document.getElementById('odgSection');
  return !e.offsetParent;}), true);
ok('impostazioni visibili', await p.evaluate(()=>getComputedStyle(document.getElementById('settingsPage')).display!=='none'), true);

console.log('\n── più allegati insieme: i tre file veri ──');
const fileVeri = {};
for (const [f,atteso] of [['odg.txt','odg'],['giri.txt','giri'],['stralci.txt','stralci']]) {
  /* I documenti veri stanno in test/dati/, fuori da git: dentro c'e' la
     lista della troupe. */
  // Non "p": qui dentro p e' la pagina di Playwright.
  const percorso = require('path').join(__dirname, 'dati', f);
  if (!fs.existsSync(percorso)) { console.log('ok — saltato: manca ' + percorso); process.exit(0); }
  const t = fs.readFileSync(percorso, 'utf8');
  fileVeri[f] = t;
  ok(f, await p.evaluate(x=>odgTipoDoc(x),t), atteso);
}
ok('il principale è l\'OdG, non il primo in ordine alfabetico',
   await p.evaluate(v=>{
     const letti = Object.entries(v).map(([nome,testo])=>({nome,testo,tipo:odgTipoDoc(testo)}))
                   .sort((a,b)=>a.nome.localeCompare(b.nome));   // come li passa iOS
     const p = letti.find(x=>x.tipo==='odg')
       || letti.slice().sort((a,b)=>b.testo.length-a.testo.length)[0];
     return p.nome;
   }, fileVeri), 'odg.txt');
ok('nessuno dichiarato OdG: vince il più lungo',
   await p.evaluate(()=>{
     const letti=[{nome:'a',testo:'x'.repeat(100),tipo:null},{nome:'b',testo:'y'.repeat(900),tipo:null}];
     return (letti.find(x=>x.tipo==='odg')||letti.slice().sort((a,b)=>b.testo.length-a.testo.length)[0]).nome;
   }), 'b');
ok('si possono scegliere più file', await p.evaluate(()=>{
  const i=document.querySelector('#odgCorpo input[type=file]'); return !!i && i.multiple;}), true);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
