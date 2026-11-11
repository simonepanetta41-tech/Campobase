/* Le categorie spuntate nelle impostazioni e lo spoglio.
 *
 * Il guasto: si spuntava una categoria e lo spoglio non cambiava. La
 * domanda di chi l'ha visto era la migliore possibile — quelle categorie
 * non sono mai state analizzate, o e' solo un problema di
 * visualizzazione? — e la risposta e' la seconda.
 *
 * Analizzate lo sono sempre tutte: lo schema che si manda al modello
 * nasce dalla tabella intera, senza guardare le spunte. Quello che si
 * rompeva e' il ridisegno: spuntare chiamava spoglioRender con
 * analysisData, che veniva riempito solo dal percorso dell'analisi appena
 * fatta. Aprendo un progetto salvato era vuoto, e la prima riga di
 * spoglioRender e' "se non c'e' niente, torna indietro".
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(102)+' atteso '+JSON.stringify(exp));};

const ANALISI = {titolo:'Missione San Gennaro', totale_scene:40,
  stunt_effetti:{presente:true, scene:[{scena:'SC.21 (p.4)', tipo:'caduta dal tetto'}]},
  mezzi_movimento:{presente:true, scene:[{scena:'SC.24 (p.6)', mezzo:'furgone'}]},
  animali:{presente:true, scene:[{scena:'SC.30 (p.9)', tipo:'cane'}]}};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:393,height:852}});
p.setDefaultTimeout(15000);
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},limit:async()=>({data:[]})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);

console.log('\n── il modello le riceve tutte, sempre ──');
/* Lo schema e le istruzioni nascono dalla tabella intera: nessuna spunta
   le filtra. Per questo i dati ci sono sempre, anche per le categorie
   mai spuntate da nessuno. */
const chieste = await p.evaluate(()=>{
  localStorage.setItem('cb_cat_attive', JSON.stringify(['animali']));  // una sola
  return {schema: spoglioSchema(), istruzioni: spoglioIstruzioni(), quante: SPOGLIO.length};
});
ok('tutte nello schema', SPOGLIO_CONTA(chieste.schema), chieste.quante);
ok('e tutte nelle istruzioni', chieste.istruzioni.split('\n').length, chieste.quante);
function SPOGLIO_CONTA(s){ return (s.match(/"presente":false/g)||[]).length; }

console.log('\n── aprendo un progetto salvato, l\'analisi si tiene da parte ──');
const dopo = await p.evaluate((d)=>{
  analysisData = null; window.analysisData = null;
  renderResults(d);
  return {tenuta: !!analysisData, titolo: analysisData && analysisData.titolo};
}, ANALISI);
ok('tenuta',     dopo.tenuta, true);
ok('ed è giusta', dopo.titolo, 'Missione San Gennaro');

console.log('\n── spuntare una categoria ridisegna lo spoglio ──');
/* L'effetto che si vede e' l'ordine dei reparti: quello che contiene una
   categoria spuntata sale in cima. Si spunta "mezzi di scena", che sta in
   Regia e non e' il primo — spuntarne una del reparto gia' primo non
   avrebbe spostato niente, e il controllo sarebbe passato anche rotto. */
const spunta = await p.evaluate(()=>{
  localStorage.removeItem('cb_rep_spoglio');
  localStorage.setItem('cb_cat_attive', JSON.stringify([]));
  spoglioRender(analysisData);
  const reparti = () => [...document.querySelectorAll('#catsGrid .sp-rep-h span:first-child')].map(x=>x.textContent);
  const prima = reparti();
  analisiSpunta('mezzi_scena');     // come toccare l'interruttore
  return {prima, dopo: reparti(), attive: [...catAttive()],
          vuoto: /Nessuna criticità/.test(document.getElementById('spoglioSection').textContent)};
});
ok('la spunta si salva',       spunta.attive, ['mezzi_scena']);
ok('prima Regia stava sotto',  spunta.prima, ['Stunt & SFX','Regia']);
ok('e dopo è salita in cima',  spunta.dopo,  ['Regia','Stunt & SFX']);
ok('e lo spoglio non si svuota', spunta.vuoto, false);

console.log('\n── e le categorie non spuntate restano visibili ──');
/* La spunta non e' un filtro: mette avanti e accende. Le altre restano,
   in fondo e spente — una criticità non sparisce perche' non e' del tuo
   reparto. */
const viste = await p.evaluate(()=>{
  localStorage.setItem('cb_cat_attive', JSON.stringify(['animali']));
  spoglioRender(analysisData);
  const t = document.getElementById('spoglioSection').textContent;
  return {stunt: /Stunt/i.test(t), animali: /Animali/i.test(t),
          conta: (t.match(/(\d+)\s+segnalazion/)||[])[1]};
});
ok('c\'è quella spuntata',      viste.animali, true);
ok('e anche quella non spuntata', viste.stunt, true);
ok('contate tutte e tre',       viste.conta, '3');

console.log('\n── senza analisi non si ridisegna, ma non si rompe ──');
const niente = await p.evaluate(()=>{
  analysisData = null; window.analysisData = null;
  let scoppiato = false;
  try { analisiSpunta('armi'); } catch(_) { scoppiato = true; }
  return scoppiato;
});
ok('non scoppia', niente, false);

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
