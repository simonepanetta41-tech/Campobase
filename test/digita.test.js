const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=got===exp;if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(38)} ${String(got).padEnd(9)} atteso ${exp}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844}});
await p.addInitScript(()=>{
  // Il CDN e' bloccato nei test: senza questo stub `supabase.createClient`
  // esplode al caricamento e tutto cio' che e' dichiarato dopo resta in TDZ.
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},
    from:()=>({select(){return this},eq(){return this},order(){return this},single:async()=>({data:null}),
               maybeSingle:async()=>({data:null}),insert:async()=>({data:null}),upsert:async()=>({error:null}),
               delete(){return this},update(){return this},neq(){return this}}),
    storage:{from:()=>({upload:async()=>({}),download:async()=>({})})}
  })};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(800);
await p.evaluate(()=>{
  window.currentUser=null; localStorage.clear();
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').style.display='block';
  document.querySelectorAll('[id$="Section"]').forEach(s=>s.style.display='none');
  document.getElementById('timetableSection').style.display='flex';
  ttInited=false; ttVista='giorno'; initTimetable(); ttSetGiorno(0);
});
await p.waitForTimeout(150);
const sel='[id$="-inizio"]';

console.log('\n── il punto compare da solo battendo cifre ──');
async function batti(cifre, tappe){
  await p.click(sel); await p.evaluate(s=>{const e=document.querySelector(s);e.value='';e._ttPrec='';},sel);
  for(let i=0;i<cifre.length;i++){
    await p.type(sel,cifre[i],{delay:25});
    ok(`"${cifre.slice(0,i+1)}"`, await p.inputValue(sel), tappe[i]);
  }
}
await batti('0730',['0','07','07.3','07.30']);     // ore a due cifre
await batti('830', ['8','83','8.30']);             // ore a una cifra
await batti('2130',['2','21','21.3','21.30']);     // sera
await batti('930', ['9','93','9.30']);
await batti('1230',['1','12','12.3','12.30']);
await p.dispatchEvent(sel,'change'); await p.waitForTimeout(100);
ok('memorizzato', await p.evaluate(()=>ttTabelle[0].orari.inizio[0]), '12.30');

console.log('\n── cancellando non riscrive sotto le dita ──');
await p.click(sel);
await p.press(sel,'End');
for(let i=0;i<3;i++) await p.press(sel,'Backspace');
ok('tre cancellazioni', await p.inputValue(sel), '12');

console.log('\n── correggere una cifra in mezzo non sposta il cursore ──');
await p.evaluate(s=>{const e=document.querySelector(s);e.value='21.30';e.setSelectionRange(1,1);},sel);
await p.type(sel,'9',{delay:25});
ok('testo', await p.inputValue(sel), '291.30');
ok('cursore fermo dove stavo', await p.evaluate(s=>document.querySelector(s).selectionStart,sel), 2);

console.log('\n── alla conferma rimette comunque in forma ──');
await p.evaluate(s=>{const e=document.querySelector(s);e.value='830';},sel);
await p.dispatchEvent(sel,'change'); await p.waitForTimeout(100);
ok('campo', await p.inputValue(sel), '08.30');

console.log('\n── il pallino di Gennaro non c\'è più ──');
ok('nessun FAB', await p.evaluate(()=>!document.getElementById('gennaroFab')), true);
ok('la chat resta richiamabile', await p.evaluate(()=>typeof toggleGennaroDrawer==='function'), true);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.evaluate(()=>{try{showGennaroFab();hideGennaroFab();}catch(e){window.__e=e.message}});
ok('showGennaroFab non esplode', await p.evaluate(()=>window.__e||'ok'), 'ok');

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
