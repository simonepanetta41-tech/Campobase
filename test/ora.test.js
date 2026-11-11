const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=got===exp;if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(30)} ${String(got).padEnd(10)} atteso ${exp}`);};
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

console.log('\n── come lo si batte sul telefono ──');
for(const [in_,out] of [
  ['8','08.00'],['21','21.00'],['0','00.00'],
  ['800','08.00'],['830','08.30'],['2130','21.30'],['0715','07.15'],
  ['1930','19.30'],['0000','00.00'],['2359','23.59']])
  ok(JSON.stringify(in_), await p.evaluate(v=>ttNormalizzaOra(v),in_), out);

console.log('\n── separatori che una tastiera puo\' dare ──');
for(const [in_,out] of [
  ['8.00','08.00'],['8,00','08.00'],['8:00','08.00'],['8h00','08.00'],
  ['21.30','21.30'],['21,30','21.30'],[' 7.15 ','07.15'],['8.3','08.30']])
  ok(JSON.stringify(in_), await p.evaluate(v=>ttNormalizzaOra(v),in_), out);

console.log('\n── cose che non sono orari: restano come scritte ──');
for(const [in_,out] of [
  ['','' ],['25.00','25.00'],['8.70','8.70'],['2561','2561'],['abc','abc'],['12345','12345']])
  ok(JSON.stringify(in_), await p.evaluate(v=>ttNormalizzaOra(v),in_), out);

console.log('\n── il calcolo legge la forma normalizzata ──');
ok('ttToMin(08.30)', await p.evaluate(()=>ttToMin(ttNormalizzaOra('830'))), 510);
ok('ttToMin(21.30)', await p.evaluate(()=>ttToMin(ttNormalizzaOra('2130'))), 1290);

console.log('\n── scritto nel campo a schermo ──');
await p.evaluate(()=>{
  window.currentUser=null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').style.display='block';
  document.querySelectorAll('[id$="Section"]').forEach(s=>s.style.display='none');
  document.getElementById('timetableSection').style.display='flex';
  localStorage.clear(); ttInited=false; ttVista='giorno'; initTimetable(); ttSetGiorno(0);
});
await p.waitForTimeout(150);
const sel='[id$="-inizio"]';
await p.fill(sel,'730'); await p.dispatchEvent(sel,'change'); await p.waitForTimeout(120);
ok('campo riscritto',  await p.inputValue(sel), '07.30');
ok('dato memorizzato', await p.evaluate(()=>ttTabelle[0].orari.inizio[0]), '07.30');
await p.fill('[id$="-fine"]','2130'); await p.dispatchEvent('[id$="-fine"]','change'); await p.waitForTimeout(120);
ok('ore lavorate',     await p.evaluate(()=>ttCalcTab(ttTabelle[0].orari,false).days[0].oreLav), 840);

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
