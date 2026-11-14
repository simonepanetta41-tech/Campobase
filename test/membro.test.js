/* Chi entra nel film col codice deve vedere anche spoglio e piano.
 *
 * Il guasto: un collega entra col codice, vede l'ordine del giorno e la
 * troupe, e le altre due schede restano vuote. Non e' la schermata: lo
 * spoglio sta in analyses e il piano in pdl_versions, tabelle legate a chi
 * le ha create — il capo reparto che ha caricato la sceneggiatura. Un
 * membro non le poteva leggere, e nemmeno sapere che c'erano.
 *
 * Qui si finge di essere quel collega: nessuna analisi propria, e il
 * database che risponde solo alle tre funzioni del film.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(100)+' atteso '+JSON.stringify(exp));};

/* La forma vera di uno spoglio: una voce per categoria, ognuna con
   "presente" e le sue scene. La prima versione di questo controllo si era
   inventata {scenes:[...]} e non mostrava niente — giustamente. */
const SPOGLIO = {titolo:'Missione San Gennaro',
  stunt_effetti:{presente:true, scene:[{scena:'SC.21 (p.4)', tipo:'caduta dal tetto'}]},
  mezzi_movimento:{presente:true, scene:[{scena:'SC.24 (p.6)', mezzo:'furgone'}]}};
const PIANO = {titolo:'Missione San Gennaro', totale_giorni:37, data_inizio:'2026-10-12',
  settimane:[{giorni:[{numero_giorno:1, scene:[{numero:'1'}]},{numero_giorno:2, scene:[{numero:'2'}]}]}]};
const CAST = [{character_id:'CIRO', character_name:'CIRO', actor_name:'Attore Uno', fonte:'definitiva'}];

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:393,height:852}});
p.setDefaultTimeout(15000);
const errori=[]; p.on('pageerror',e=>errori.push(e.message));

await p.addInitScript(([spoglio, piano, cast])=>{
  window.__rpc = [];
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:{user:{id:'u2'},access_token:'t'}}}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    // Il collega non ha nessuna analisi sua: ogni tabella risponde vuoto.
    from:(t)=>({select(){return this},eq(){return this},in(){return this},order(){return this},
      limit:async()=>({data:[]}), then:(f)=>f({data:[],error:null}),
      maybeSingle:async()=>({data: t==='projects'
        ? {id:'film1',titolo:'Missione San Gennaro',codice:'ABCD1234',casella:null,user_id:'u1'} : null}),
      single:async()=>({data:null,error:{message:'nessuna riga'}}),
      upsert:async()=>({error:null}), update(){return this}}),
    rpc: async (nome, args) => {
      window.__rpc.push(nome);
      if (nome === 'analisi_del_film') return {data:[{id:'an1', data:spoglio, notes:'', creata:'2026-11-01'}], error:null};
      if (nome === 'pdl_del_film')     return {data:[{analysis_id:'an1', data:piano, shooting_data:{}}], error:null};
      if (nome === 'cast_del_film')    return {data:cast, error:null};
      return {data:[], error:null};
    },
    storage:{from:()=>({download:async()=>({data:null,error:'no'})})}})};
}, [SPOGLIO, PIANO, CAST]);
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(800);

await p.evaluate(async()=>{
  currentUser = {id:'u2'};
  currentAnalysisId = null;          // un membro, non chi ha caricato
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  await apriFilm('film1');
});
await p.waitForTimeout(900);

console.log('\n── le tre domande al database ──');
// Il piano si richiede anche a ogni ritorno sull'app (pianoCloudNuovo): conta che ci siano tutte.
ok('chieste tutte e tre', await p.evaluate(()=>[...new Set(window.__rpc.filter(n=>n.endsWith('_del_film')))].sort()),
   ['analisi_del_film','cast_del_film','pdl_del_film']);

console.log('\n── e cosa si vede ──');
const v = await p.evaluate(()=>({
  analisi: currentAnalysisId,
  // Quello che si vede, non una variabile: e' la prova che serve.
  /* Le categorie partono chiuse, quindi il dettaglio non e' ancora scritto:
     la prova che lo spoglio e' arrivato e' il conteggio in cima. */
  spoglio: document.querySelectorAll('#spoglioSection .sp-sc').length,
  piano: pdlData && pdlData.titolo,
  giorni: pdlData && pdlTotali(pdlData).giorni,
  cruscotto: document.getElementById('pdlDashboard').style.display,
  carica: document.getElementById('pdlUploadArea').style.display,
  cast: (window.castData||[]).length,
  // Le schede si accendono con display, non con una classe (tranne il piano).
  scheda: document.getElementById('odgSection').style.display !== 'none',
  spoglioNascosto: document.getElementById('spoglioSection').style.display === 'none'
}));
ok('lo spoglio è caricato',   v.spoglio, 2);
ok("l'analisi ha un id",      v.analisi, 'an1');
ok('il piano è caricato',     v.piano, 'Missione San Gennaro');
ok('con le sue giornate',     v.giorni, 37);
ok('il cruscotto è acceso',   v.cruscotto, 'block');
ok('e non chiede di caricare',v.carica, 'none');
ok('il cast è caricato',      v.cast, 1);
ok('ma si resta sull\'OdG',   v.scheda, true);
ok('con lo spoglio dietro',   v.spoglioNascosto, true);

console.log('\n── chi l\'analisi ce l\'ha sua non passa di qui ──');
// Il capo reparto legge le sue tabelle direttamente: chiedere al film
// sarebbe una domanda in piu' per la stessa risposta.
const suo = await p.evaluate(async()=>{
  window.__rpc = [];
  currentAnalysisId = 'an-mia';
  await filmAnalisi('film1');
  return window.__rpc;
});
ok('nessuna domanda', suo, []);

console.log('\n── e se le funzioni sul database non ci sono ancora ──');
/* Finche' sql/troupe-analisi.sql non e' stato lanciato, le tre funzioni
   non esistono: la scheda resta vuota come prima, senza rompere niente. */
const senza = await p.evaluate(async()=>{
  currentAnalysisId = null;
  const vero = sb.rpc;
  sb.rpc = async () => ({data:null, error:{message:'function does not exist'}});
  let scoppiato = false;
  try { await filmAnalisi('film1'); } catch (_) { scoppiato = true; }
  sb.rpc = vero;
  return {scoppiato, analisi: currentAnalysisId};
});
ok('non scoppia',        senza.scoppiato, false);
ok('e non inventa nulla', senza.analisi, null);

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
