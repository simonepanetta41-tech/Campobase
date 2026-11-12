/* Le scene gia' girate si spengono nello spoglio, i giorni passati nel
 * calendario.
 *
 * Nessuno segna a mano le scene fatte, quindi si crede ai documenti:
 * per un giorno passato vale il suo ordine del giorno, e dove l'ordine
 * del giorno manca vale il piano di lavorazione — Missione San Gennaro
 * e' stato preso in corsa e i primi venti non ci sono.
 *
 * Il controllo che conta e' quello al contrario: una scena che deve
 * ancora succedere NON si spegne. La 36 girata a meta' ieri torna oggi
 * come 36PT, e se restasse spenta lo spoglio direbbe che il camera car
 * e' alle spalle la mattina in cui c'e' da montarlo.
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
    from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},
               limit:async()=>({data:[]}),single:async()=>({data:null}),maybeSingle:async()=>({data:null})}),
    storage:{from:()=>({})}
  })};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(800);

/* Oggi e' giovedi' 12 novembre. Il piano copre dal 9 al 14; gli ordini
   del giorno ci sono solo per l'11 e per oggi. */
const fatte = (mondo) => p.evaluate(m=>{
  pdlData = m.piano ? {settimane:[{giorni:m.piano}]} : null;
  odgPassati = m.odg || [];
  odgCorrente = m.corrente || null;
  return [...sceneFatte(new Date(2026,10,12,10,0))].sort();
}, mondo);

const PIANO = [
  {numero_giorno:18, data:'2026-11-09', scene:[{numero:'1'},{numero:'2'}]},
  {numero_giorno:19, data:'2026-11-10', scene:[{numero:'3'},{numero:'36'}]},
  {numero_giorno:20, data:'2026-11-11', scene:[{numero:'50'},{numero:'51'}]},
  {numero_giorno:21, data:'2026-11-12', scene:[{numero:'60'}]},
  {numero_giorno:22, data:'2026-11-13', scene:[{numero:'70'},{numero:'2'}]}
];

console.log('\n── senza ordini del giorno vale il piano ──');
/* La 2 e' il 9 ma anche il 13: deve ancora succedere, resta accesa. */
ok('i giorni passati del piano', await fatte({piano:PIANO}), ['1','3','36','50','51']);
ok('oggi e domani no', (await fatte({piano:PIANO})).filter(x=>['60','70'].includes(x)), []);
ok('⚠ una scena che torna resta accesa', (await fatte({piano:PIANO})).includes('2'), false);

console.log('\n── dove c\'è l\'ordine del giorno, vince lui ──');
/* L'11 il piano diceva 50 e 51, ma si sono girate la 50 e la 63. */
const ODG11 = [{data:'2026-11-11', scene:['50','63']}];
ok('le scene dell\'OdG, non quelle del piano',
   await fatte({piano:PIANO, odg:ODG11}), ['1','3','36','50','63']);
ok('un OdG senza scene non cancella il piano',
   await fatte({piano:PIANO, odg:[{data:'2026-11-11', scene:[]}]}), ['1','3','36','50','51']);

console.log('\n── ⚠ la 36PT di oggi riaccende la 36 ──');
const OGGI = {data:'2026-11-12', numero:'23', scene:[{n:'63'},{n:'36PT'}]};
const r = await fatte({piano:PIANO, odg:ODG11, corrente:OGGI});
ok('la 36 non è fatta', r.includes('36'), false);
ok('e nemmeno la 63, che oggi si rigira', r.includes('63'), false);
ok('il resto sì', r, ['1','3','50']);
/* L'OdG di oggi vince sul piano di oggi: la 60 non e' sul foglio, ma
   nemmeno e' passata, quindi non e' fatta. */
ok('la 60 del piano di oggi non è fatta', r.includes('60'), false);

console.log('\n── l\'OdG di domani, arrivato stasera ──');
ok('non spegne niente',
   await fatte({odg:[{data:'2026-11-13', scene:['70','71']}]}), []);

console.log('\n── senza niente, niente ──');
ok('nessun documento', await fatte({}), []);

console.log('\n── come si vede nello spoglio ──');
const chip = await p.evaluate(()=>{
  localStorage.setItem('cb_profilo', JSON.stringify({nome:'S',cognome:'P',reparto:'Suono'}));
  window.catNotesData = {}; catNotesData = {};
  pdlData = {settimane:[{giorni:[{numero_giorno:19, data:'2000-01-01', scene:[{numero:'36'},{numero:'4'}]}]}]};
  odgPassati = []; odgCorrente = null;
  const h = spoglioRigaCat({key:'camera_car', nome:'Camera car'},
    [{scena:'SC.4 - EST'},{scena:'SC.36 - EST'},{scena:'SC.44 - EST'}], true);
  return [...h.matchAll(/class="(sp-sc[^"]*)"[^>]*>([^<]+)</g)].map(m=>m[2]+(/fatta/.test(m[1])?' spenta':''));
});
ok('le fatte spente, le altre no', chip, ['4 spenta','36 spenta','44']);

ok('e si aggiorna senza ridisegnare', await p.evaluate(()=>{
  document.getElementById('spoglioSection').insertAdjacentHTML('beforeend',
    '<button class="sp-sc" id="prova36">36</button><button class="sp-sc" id="prova44">44</button>');
  sceneFatteAggiorna();
  const a = [prova36.classList.contains('fatta'), prova44.classList.contains('fatta')];
  odgCorrente = {data:'2999-01-01', scene:[{n:'36PT'}]};
  sceneFatteAggiorna();
  return a.concat(prova36.classList.contains('fatta'));
}), [true, false, false]);

console.log('\n── i giorni passati nel calendario ──');
const celle = await p.evaluate(()=>{
  const d = new Date(), iso = x => x.toISOString().split('T')[0];
  const ieri = new Date(d); ieri.setDate(d.getDate()-1);
  const domani = new Date(d); domani.setDate(d.getDate()+1);
  pdlData = {settimane:[{giorni:[
    {numero_giorno:1, data:iso(ieri),   scene:[{numero:'1'}]},
    {numero_giorno:2, data:iso(d),      scene:[{numero:'2'}]},
    {numero_giorno:3, data:iso(domani), scene:[{numero:'3'}]}]}]};
  pdlShootingData = {};
  const out = {};
  for (const [nome, x] of [['ieri', ieri], ['oggi', d], ['domani', domani]]) {
    pdlCurrentYear = x.getUTCFullYear(); pdlCurrentMonth = x.getUTCMonth();
    renderPdlCalendar();
    const g = +iso(x).slice(8);
    const c = [...document.querySelectorAll('#pdlCalGrid .cal-cell.has-shooting')]
      .find(e => +e.querySelector('.cal-cell-day').textContent === g);
    out[nome] = c ? [c.classList.contains('passata'), c.classList.contains('is-today')] : null;
  }
  return out;
});
ok('ieri spento',          celle.ieri,   [true, false]);
ok('oggi acceso, col bordo', celle.oggi,   [false, true]);
ok('domani acceso',        celle.domani, [false, false]);

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
