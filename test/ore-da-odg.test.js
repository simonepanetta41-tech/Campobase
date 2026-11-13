/* Partenza e Inizio compilati dall'ordine del giorno.
 *
 * L'ordine del giorno dice gia' a che ora parti e a che ora sei
 * convocato; la tabella delle ore li propone nei primi due campi del
 * giorno. Sono una proposta: il controllo che conta e' che quello che
 * scrive la persona vinca sempre, anche quando cancella.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(52)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},in(){return this},order:async()=>({data:[]}),
               limit:async()=>({data:[]}),upsert:async()=>({error:null}),
               single:async()=>({data:null}),maybeSingle:async()=>({data:null})}),
    storage:{from:()=>({})}
  })};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(700);
await p.evaluate(()=>{
  localStorage.clear();
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('resultsPage').style.display='flex';
  switchResultTab('ore');
});
await p.waitForTimeout(300);

/* Venerdi' 13 novembre 2026: nella settimana che comincia lunedi' 9 e'
   la colonna 4. */
const ODG = {data:'2026-11-13', numero:'24', convocazione:'13.00', pickup:{ora:'12.30'}, troupe:[]};
const giro = (passi) => p.evaluate(a=>{
  const set=(id,v)=>{document.getElementById(id).value=v;};
  const out=[];
  for(const s of a){
    if(s.azzera){ localStorage.removeItem('cb_tt_pre'); ttTabelle=[ttMkTab(['S. Panetta'])];
                  set('tt-dal', s.dal===undefined?'2026-11-09':s.dal); set('tt-al',''); set('tt-film',''); }
    if(s.odg!==undefined) odgCorrente=s.odg;
    if(s.scrivo) ttTabelle[0].orari[s.scrivo[0]][s.scrivo[1]]=s.scrivo[2];
    if(s.tabelle) ttTabelle.push(ttMkTab(['M. Rossi']));
    const n=ttDaOdg();
    out.push({n, partenza:ttTabelle[0].orari.partenza.slice(), inizio:ttTabelle[0].orari.inizio.slice(),
              dal:document.getElementById('tt-dal').value, al:document.getElementById('tt-al').value,
              seconda:ttTabelle[1]?ttTabelle[1].orari.partenza[4]:null});
  }
  return out;
}, passi);

console.log('\n── i primi due campi del giorno ──');
let r = await giro([{azzera:true, odg:ODG}]);
ok('Partenza = pick-up, nel venerdì', r[0].partenza, ['','','','','12.30','']);
ok('Inizio = convocazione',           r[0].inizio,   ['','','','','13.00','']);
ok('due caselle scritte', r[0].n, 2);

console.log('\n── la convocazione della mia riga vince su quella generale ──');
await p.evaluate(()=>{ odgMiaRiga=()=>({nome:'S. Panetta', set:'13.30', partenza:'12.45'}); });
r = await giro([{azzera:true, odg:{...ODG, pickup:null}}]);
ok('Inizio dalla mia riga', r[0].inizio[4], '13.30');
ok('senza pick-up, la partenza della mia riga', r[0].partenza[4], '12.45');
await p.evaluate(()=>{ odgMiaRiga=()=>null; });

console.log('\n── ⚠ quello che scrive la persona vince sempre ──');
r = await giro([{azzera:true, odg:ODG, scrivo:['partenza',4,'12.00']}]);
ok('una casella già compilata non si tocca', [r[0].partenza[4], r[0].inizio[4]], ['12.00','13.00']);
r = await giro([{azzera:true, odg:ODG}, {scrivo:['partenza',4,'12.10']}, {}]);
ok('corretta dopo: resta la correzione', r[2].partenza[4], '12.10');
r = await giro([{azzera:true, odg:ODG}, {scrivo:['partenza',4,'']}, {}]);
ok('cancellata apposta: non ricompare', r[2].partenza[4], '');

console.log('\n── se la produzione sposta il pick-up, la proposta si aggiorna ──');
r = await giro([{azzera:true, odg:ODG}, {odg:{...ODG, pickup:{ora:'12.00'}}}]);
ok('casella mai toccata: orario nuovo', r[1].partenza[4], '12.00');
r = await giro([{azzera:true, odg:ODG}, {scrivo:['partenza',4,'12.20']}, {odg:{...ODG, pickup:{ora:'12.00'}}}]);
ok('casella corretta a mano: resta la tua', r[2].partenza[4], '12.20');

console.log('\n── solo nella settimana giusta ──');
r = await giro([{azzera:true, dal:'2026-11-16', odg:ODG}]);
ok('un OdG di un\'altra settimana non scrive', [r[0].n, r[0].partenza], [0, ['','','','','','']]);
r = await giro([{azzera:true, odg:{...ODG, data:'2026-11-15'}}]);
ok('la domenica non ha colonna', r[0].n, 0);
r = await giro([{azzera:true, dal:'', odg:ODG}]);
ok('tabella vuota senza date: si apre sulla settimana dell\'OdG', [r[0].dal, r[0].al, r[0].partenza[4]], ['2026-11-09','2026-11-14','12.30']);

console.log('\n── tutte le tabelle della squadra ──');
r = await giro([{azzera:true, odg:ODG, tabelle:true}]);
ok('anche la seconda', r[0].seconda, '12.30');

console.log('\n── senza ordine del giorno, niente ──');
r = await giro([{azzera:true, odg:null}]);
ok('niente', r[0].n, 0);

console.log('\n── e resta una casella come le altre ──');
await giro([{azzera:true, odg:ODG}]);
await p.evaluate(()=>{ ttVista='settimana'; ttRenderAll(); });
const v = await p.evaluate(()=>{
  const i=document.querySelector('table.tt2 input[data-f="partenza"][data-i="4"]');
  return {valore:i.value, bloccata:i.disabled||i.readOnly};
});
ok('si vede e si può modificare', v, {valore:'12.30', bloccata:false});

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
