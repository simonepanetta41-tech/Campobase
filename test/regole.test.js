const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${n.padEnd(48)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844}});
const conferma = sel => p.evaluate(a=>{
  const ovs=[...document.querySelectorAll('div')].filter(d=>d.style.zIndex==='10000');
  const ov=ovs[ovs.length-1]; if(!ov) throw new Error('nessun overlay');
  ov.querySelector(`button[data-act="${a}"]`).click();
}, sel);
const cePopup = () => p.evaluate(()=>[...document.querySelectorAll('div')]
  .some(d=>d.style.zIndex==='10000'));
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
  localStorage.clear();
  window.currentUser=null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').style.display='block';
  document.querySelectorAll('[id$="Section"]').forEach(s=>s.style.display='none');
  document.getElementById('timetableSection').style.display='flex';
  ttInited=false; initTimetable();
});

console.log('\n── settimana vuota: nessuna conferma ──');
await p.evaluate(()=>ttSetGiornata(8));
await p.waitForTimeout(150);
ok('nessun popup',        !(await cePopup()), true);
ok('regola applicata',    await p.evaluate(()=>ttMeta.tipoGiornata), 8);

console.log('\n── con giornate compilate: chiede ──');
await p.evaluate(()=>{
  document.getElementById('tt-dal').value='2026-11-09';
  ttSetO(ttTabelle[0].id,'inizio',0,'07.30'); ttSetO(ttTabelle[0].id,'fine',0,'19.30');
  ttSetO(ttTabelle[0].id,'inizio',1,'08.00'); ttSetO(ttTabelle[0].id,'fine',1,'18.00');
});
const golden8 = await p.evaluate(()=>ttCalcTab(ttTabelle[0].orari,false).days[0].goldenOrd);
p.evaluate(()=>ttSetGiornata(10));
await p.waitForTimeout(250);
ok('popup comparso',      await cePopup(), true);
ok('conta le giornate',   await p.evaluate(()=>/2 giornate/.test(document.body.innerText)), true);
ok('regola non ancora applicata', await p.evaluate(()=>ttMeta.tipoGiornata), 8);

console.log('\n── annullo: tutto come prima ──');
await conferma('no');
await p.waitForTimeout(200);
ok('regola invariata',    await p.evaluate(()=>ttMeta.tipoGiornata), 8);
ok('bottone 8h riacceso', await p.evaluate(()=>document.getElementById('tt-tg8').classList.contains('active')), true);
ok('bottone 10h spento',  await p.evaluate(()=>document.getElementById('tt-tg10').classList.contains('active')), false);
ok('calcolo invariato',   await p.evaluate(()=>ttCalcTab(ttTabelle[0].orari,false).days[0].goldenOrd), golden8);

console.log('\n── confermo: ricalcola ──');
p.evaluate(()=>ttSetGiornata(10));
await p.waitForTimeout(250);
await conferma('si');
await p.waitForTimeout(250);
ok('regola applicata',    await p.evaluate(()=>ttMeta.tipoGiornata), 10);
ok('bottone 10h acceso',  await p.evaluate(()=>document.getElementById('tt-tg10').classList.contains('active')), true);
ok('golden diminuita',    await p.evaluate(x=>ttCalcTab(ttTabelle[0].orari,false).days[0].goldenOrd<x, golden8), true);

console.log('\n── riaprendo, i bottoni dicono le regole vere ──');
/* Nell'HTML i bottoni partono con "10h" e "Off" accesi, scritti a mano:
   sono lo stato di una tabella nuova. Aprendo una tabella salvata con
   regole diverse, il riassunto diceva 8h e i bottoni mostravano 10h — e
   toccare 8 non faceva niente, perche' per ttSetGiornata era gia' 8.
   Il valore era giusto da sempre: era l'evidenziatura a non saperlo. */
ok('le regole caricate si vedono', await p.evaluate(()=>{
  ttMeta.tipoGiornata = 8; ttMeta.raddoppio = 2;
  ttMeta.maggiorazioniNott = false; ttMeta.viaggioConcesso = 30;
  // Come al caricamento di una tabella salvata.
  ttRenderAll();
  const on = id => document.getElementById(id).classList.contains('active');
  return {otto: on('tt-tg8'), dieci: on('tt-tg10'), rd2: on('tt-rd2'), rd0: on('tt-rd0'),
          nottOff: on('tt-nOff'), nottOn: on('tt-nOn'),
          viaggio: [...document.querySelectorAll('.tt-vtog')]
            .filter(x=>x.classList.contains('active')).map(x=>x.dataset.mins)};
}), {otto:true, dieci:false, rd2:true, rd0:false, nottOff:true, nottOn:false, viaggio:['30']});

console.log('\n── ritoccare la stessa regola non chiede nulla ──');
await p.evaluate(()=>{ ttMeta.tipoGiornata = 10; ttRenderAll(); });
await p.evaluate(()=>ttSetGiornata(10));
await p.waitForTimeout(150);
ok('nessun popup',        !(await cePopup()), true);

if(ko){const d=await p.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='Ricalcola').map(b=>b.parentElement.parentElement.innerText.slice(0,120)));console.log('DEBUG overlay residui:',JSON.stringify(d,null,1));}
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
