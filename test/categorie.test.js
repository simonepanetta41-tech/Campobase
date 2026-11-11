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

console.log('\n── si vede solo quello che è spuntato ──');
const una = await p.evaluate(()=>{
  localStorage.removeItem('cb_rep_spoglio');
  localStorage.setItem('cb_cat_attive', JSON.stringify(['animali']));
  spoglioRender(analysisData);
  const t = document.getElementById('spoglioSection').textContent;
  return {animali: /Animali/i.test(t), stunt: /Stunt(?!\s*&)/i.test(t),
          mezzi: /Mezzi/i.test(t),
          categorie: [...document.querySelectorAll('#catsGrid .sp-cat')].length,
          conta: (t.match(/(\d+)\s+segnalazion/)||[])[1]};
});
ok('c\'è quella spuntata',        una.animali, true);
ok('le altre no',                [una.stunt, una.mezzi], [false, false]);
ok('una categoria sola a schermo', una.categorie, 1);
// Il conto dice quello che si vede: dicesse tre, sembrerebbe roba persa.
ok('e il conto è di quella',     una.conta, '1');

console.log('\n── il proprio reparto apre la pagina ──');
const mio = await p.evaluate(()=>{
  localStorage.setItem('cb_cat_attive', JSON.stringify(['animali','mezzi_scena']));
  const reparti = () => [...document.querySelectorAll('#catsGrid .sp-rep-h span:first-child')].map(x=>x.textContent);
  localStorage.removeItem('cb_rep_spoglio');
  spoglioRender(analysisData);
  const senza = reparti();
  localStorage.setItem('cb_rep_spoglio', 'regia');
  spoglioRender(analysisData);
  return {senza, con: reparti(),
          evidenziato: document.querySelector('#catsGrid .sp-rep').classList.contains('mio')};
});
ok('senza reparto, ordine della tabella', mio.senza, ['Stunt & SFX','Regia']);
ok('col reparto, il proprio per primo',   mio.con,   ['Regia','Stunt & SFX']);
ok('ed è marcato come proprio',           mio.evidenziato, true);

console.log('\n── togliendo tutto si dice perché, non "nessuna criticità" ──');
/* Una sceneggiatura senza criticita' e' una notizia; nessuna categoria
   spuntata e' un'impostazione da cambiare. Confonderle manda a cercare un
   guasto dove non c'e'. */
const zero = await p.evaluate(()=>{
  localStorage.setItem('cb_cat_attive', JSON.stringify([]));
  spoglioRender(analysisData);
  const t = document.getElementById('catsGrid').textContent;
  return {impostazioni: /Impostazioni/.test(t), criticita: /Nessuna criticità/.test(t),
          quante: /3/.test(t)};
});
ok('manda alle impostazioni', zero.impostazioni, true);
ok('e non dice che non c\'è niente', zero.criticita, false);
ok('anzi dice quante ce ne sono', zero.quante, true);

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
