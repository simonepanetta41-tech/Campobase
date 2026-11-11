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

console.log('\n── la soglia del raddoppio: le prime restano normali ──');
/* "Dopo 2h" vuol dire che le prime due ore di golden si contano una
   volta, e dalla terza si contano doppie. Non che si raddoppia tutto
   quando si superano le due ore. */
ok('sotto la soglia non cambia nulla', await p.evaluate(()=>{
  ttMeta.raddoppio = 2; return [ttApplyRd(60), ttApplyRd(120)];}), [60, 120]);
ok('dalla terza ora si raddoppia',     await p.evaluate(()=>ttApplyRd(180)), 240);
ok('e quattro ore fanno sei',          await p.evaluate(()=>ttApplyRd(240)), 360);
ok('con la soglia a 1h',               await p.evaluate(()=>{
  ttMeta.raddoppio = 1; return ttApplyRd(180);}), 300);
ok('e senza raddoppio resta tutto',    await p.evaluate(()=>{
  ttMeta.raddoppio = 0; return ttApplyRd(240);}), 240);

console.log('\n── giornaliero e settimanale danno numeri diversi ──');
/* Due giornate con un'ora e mezza di golden ciascuna, soglia a 2h.
   Giornaliero: nessuna delle due supera la soglia, niente raddoppio.
   Settimanale: tre ore in tutto, la terza si conta doppia. */
ok('due volte 90 minuti', await p.evaluate(()=>{
  ttMeta.raddoppio = 2;
  const prova = (quando) => { ttMeta.applicazione = quando;
    const g = [{goldenOrd:90},{goldenOrd:90}];
    return quando === 'giornaliero'
      ? g.map(d=>ttApplyRd(d.goldenOrd)).reduce((a,b)=>a+b,0)
      : ttApplyRd(g.reduce((a,b)=>a+b.goldenOrd,0)); };
  return {giornaliero: prova('giornaliero'), settimanale: prova('settimanale')};
/* Giornaliero: 90 + 90, nessuna delle due giornate supera le 2h, si
   pagano 3 ore. Settimanale: 3 ore in tutto, le prime due normali e la
   terza doppia, si pagano 4 ore. La stessa settimana vale un'ora in piu'
   o in meno a seconda di come si legge il contratto. */
}), {giornaliero:180, settimanale:240});

console.log('\n── riaprendo, i bottoni dicono le regole vere ──');
/* Nell'HTML i bottoni partono con "10h" e "Off" accesi, scritti a mano:
   sono lo stato di una tabella nuova. Aprendo una tabella salvata con
   regole diverse, il riassunto diceva 8h e i bottoni mostravano 10h — e
   toccare 8 non faceva niente, perche' per ttSetGiornata era gia' 8.
   Il valore era giusto da sempre: era l'evidenziatura a non saperlo. */
/* E con il raddoppio acceso ricompare la scelta fra giornaliero e
   settimanale, che senza riallineo restava nascosta: ttRenderAll esce
   prima quando le tabelle sono zero, e il riallineo stava dopo
   quell'uscita. */
ok('la scelta giornaliero/settimanale compare', await p.evaluate(()=>{
  ttMeta.raddoppio = 0; ttRenderAll();
  const prima = document.getElementById('tt-rdExtra').style.display;
  ttMeta.raddoppio = 2; ttRenderAll();
  return [prima, document.getElementById('tt-rdExtra').style.display];
}), ['none','block']);

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
