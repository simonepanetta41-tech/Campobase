const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${n.padEnd(46)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();
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

async function apri(){
  await p.goto('file://' + RADICE + '/index.html');
  await p.waitForTimeout(800);
  await p.evaluate(()=>{
    window.currentUser=null;                  // non loggato: solo locale
    document.getElementById('authPage').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('homePage').style.display='none';
    document.getElementById('resultsPage').style.display='block';
    document.querySelectorAll('[id$="Section"]').forEach(s=>s.style.display='none');
    document.getElementById('timetableSection').style.display='flex';
    ttInited=false; initTimetable();
  });
  await p.waitForTimeout(200);
}

console.log('\n── salvataggio automatico ──');
await apri();
await p.evaluate(()=>{
  document.getElementById('tt-film').value='Missione San Gennaro';
  document.getElementById('tt-settimana').value='7';
  document.getElementById('tt-dal').value='2026-11-09';
  ttTabelle[0].workers=['Simone Panetta'];
  ttSetO(ttTabelle[0].id,'inizio',0,'07.30');
  ttSetO(ttTabelle[0].id,'fine',0,'21.30');
});
await p.waitForTimeout(100);
ok('bozza scritta in locale', await p.evaluate(()=>!!localStorage.getItem('cb_tt_bozza')), true);
ok('contiene l\'orario', await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')).rec.tabelle[0].orari.fine[0]), '21.30');
ok('contiene il film',  await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')).rec.meta.film), 'Missione San Gennaro');
ok('stato mostrato',    await p.evaluate(()=>document.getElementById('tt-stato').textContent.length>0), true);

console.log('\n── ricarico la pagina: il lavoro deve tornare ──');
await apri();
ok('orario recuperato',    await p.evaluate(()=>ttTabelle[0].orari.fine[0]), '21.30');
ok('inizio recuperato',    await p.evaluate(()=>ttTabelle[0].orari.inizio[0]), '07.30');
ok('film recuperato',      await p.evaluate(()=>document.getElementById('tt-film').value), 'Missione San Gennaro');
ok('data recuperata',      await p.evaluate(()=>document.getElementById('tt-dal').value), '2026-11-09');
ok('lavoratore recuperato',await p.evaluate(()=>ttTabelle[0].workers), ['Simone Panetta']);
ok('calcolo coerente',     await p.evaluate(()=>ttCalcTab(ttTabelle[0].orari,false).days[0].oreLav), 840);
// La vista giorno mostra la giornata di oggi, non la prima della
// settimana: senza sceglierla, questo controllo passava solo il 9 novembre.
await p.evaluate(()=>ttSetGiorno(0));
await p.waitForTimeout(150);
ok('casella compilata a schermo', await p.evaluate(()=>document.querySelector('[id$="-fine"]').value), '21.30');

console.log('\n── cambiare giorno o vista non deve riscrivere ──');
const t0=await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')).ts);
await p.waitForTimeout(60);
await p.evaluate(()=>{ttSetGiorno(3);ttSetVista('settimana');ttSetVista('giorno');});
ok('timestamp invariato', await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')).ts), t0);

console.log('\n── offline ──');
await p.evaluate(()=>Object.defineProperty(navigator,'onLine',{get:()=>false,configurable:true}));
await p.evaluate(()=>{ttSetO(ttTabelle[0].id,'rientro',0,'22.10')});
await p.waitForTimeout(100);
ok('scrive lo stesso in locale', await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')).rec.tabelle[0].orari.rientro[0]), '22.10');
ok('lo stato lo dice', await p.evaluate(()=>/rete|telefono/.test(document.getElementById('tt-stato').textContent)), true);

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
