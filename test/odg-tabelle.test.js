/* Quando le tabelle dell'ordine del giorno non si leggono.
 *
 * L'ordine del giorno 24 di Missione San Gennaro e' arrivato con gli
 * orari giusti e senza scene, senza attori, senza troupe. Il modello si
 * era fermato a meta' risposta (tetto di 8000 token, con novanta righe
 * di troupe e i fabbisogni), il JSON non si chiudeva, e il guasto finiva
 * in una riga di console. Sul telefono: niente, come se quel giorno non
 * si girasse nessuna scena.
 *
 * Qui si controlla che il guasto non sia piu' muto: si riprova da soli,
 * e se va male anche la seconda la schermata lo dice e offre di
 * riprovare.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(50)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},
               limit:async()=>({data:[]}),upsert:async()=>({error:null}),
               single:async()=>({data:null}),maybeSingle:async()=>({data:null})}),
    storage:{from:()=>({})}
  })};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(800);

/* Il modello finto: una coda di risposte, una per chiamata. */
await p.evaluate(()=>{
  window.__coda = []; window.__chiamate = [];
  callApi = async (via, corpo) => { window.__chiamate.push(corpo.max_tokens); return window.__coda.shift(); };
});
const BUONA = {stop_reason:'end_turn', content:[{type:'text', text: JSON.stringify({
  scene:[{n:'16', ambiente:'OSTERIA', ie:'I/E', m:'N', pag:'6 6/8', ids:'1, 2, 7'}],
  cast:[{id:'1', ruolo:'PRINCIPE COLONNA', nome:'ROCCO PAPALEO', pickup:'11.20', set:'13.45'}],
  troupe:[{reparto:'SUONO', ruolo:'Microfonista', nome:'S. Panetta', partenza:'13.00'}],
  contatti:[], fabbisogni:{} })}]};
const TRONCA = {stop_reason:'max_tokens', usage:{output_tokens:8000},
  content:[{type:'text', text:'{"scene":[{"n":"16","ambiente":"OSTERIA"}],"troupe":[{"reparto":"REGIA","ruo'}]};
/* Se il modello ragiona prima di rispondere, il primo blocco non e' testo. */
const COL_PENSIERO = {stop_reason:'end_turn', content:[{type:'thinking', thinking:'...'}, BUONA.content[0]]};

console.log('\n── le tabelle, da sole ──');
const tab = (...coda) => p.evaluate(async c=>{ window.__coda=c; window.__chiamate=[];
  const t = await odgTabelle('ODG #24 testo'); return {scene:t.scene.length, cast:t.cast.length, errore:t.errore||null, max:window.__chiamate}; }, coda);
let t = await tab(BUONA);
ok('risposta intera', [t.scene, t.cast, t.errore], [1, 1, null]);
ok('con il tetto alzato', t.max, [16000]);
t = await tab(COL_PENSIERO);
ok('il testo si trova anche dopo un ragionamento', [t.scene, t.errore], [1, null]);
t = await tab(TRONCA);
ok('risposta troncata: niente scene', t.scene, 0);
ok('⚠ e si sa perché', /esaurimento del budget/.test(t.errore||''), true);

console.log('\n── si riprova da soli una volta ──');
const estrai = (...coda) => p.evaluate(async c=>{ window.__coda=c; window.__chiamate=[];
  const d = await odgEstrai({testo:'ODG #24\nCONVOCAZIONE: 13.00\n'});
  return {scene:(d.scene||[]).length, errore:d.errore||null, chiamate:window.__chiamate.length}; }, coda);
let e = await estrai(TRONCA, BUONA);
ok('la seconda va: scene lette', [e.scene, e.errore, e.chiamate], [1, null, 2]);
e = await estrai(BUONA);
ok('se va la prima non si richiama', e.chiamate, 1);
e = await estrai(TRONCA, TRONCA);
ok('due volte male: resta l\'errore', [e.scene, !!e.errore, e.chiamate], [0, true, 2]);

console.log('\n── ⚠ la schermata lo dice ──');
const html = (d) => p.evaluate(x=>{ const h = odgPienoHtml(x);
  return {avviso:/Scene, cast e troupe non letti/.test(h), tasto:/odgRitenta\(\)/.test(h)}; }, d);
const BASE = {data:'2026-11-13', numero:'24', convocazione:'13.00', testo:'ODG #24 ...'};
ok('senza scene e con l\'errore: avviso e tasto',
   await html({...BASE, scene:[], errore:'tronca'}), {avviso:true, tasto:true});
ok('senza il testo salvato non si offre di rileggere',
   await html({...BASE, testo:'', scene:[], errore:'tronca'}), {avviso:true, tasto:false});
ok('foglio letto bene: nessun avviso',
   await html({...BASE, scene:[{n:'16'}]}), {avviso:false, tasto:false});
/* Un giorno senza scene vero (riposo, trasferimento) non e' un guasto. */
ok('senza scene ma con la troupe: nessun avviso',
   await html({...BASE, scene:[], troupe:[{nome:'S. Panetta'}]}), {avviso:false, tasto:false});
/* Vuoto del tutto vuol dire non letto, anche se nessuno ha segnato
   l'errore: la troupe su un ordine del giorno c'e' sempre. */
ok('senza scene, cast e troupe: avviso anche senza errore',
   await html({...BASE, scene:[], cast:[], troupe:[]}), {avviso:true, tasto:true});

console.log('\n── rileggere dal testo salvato ──');
const dopo = await p.evaluate(async a=>{
  odgCorrente = {...a.base, scene:[], cast:[], troupe:[], errore:'tronca', pickup:{ora:'12.30'}};
  odgInCorso = false; window.__coda=[a.buona];
  await odgRitenta();
  return {scene:odgCorrente.scene.length, cast:odgCorrente.cast.length, errore:odgCorrente.errore||null,
          conv:odgCorrente.convocazione, pickup:odgCorrente.pickup.ora, inCorso:odgInCorso};
}, {base:BASE, buona:BUONA});
ok('scene e cast arrivano', [dopo.scene, dopo.cast], [1, 1]);
ok('l\'errore sparisce', dopo.errore, null);
ok('orari e pick-up non si toccano', [dopo.conv, dopo.pickup], ['13.00', '12.30']);
const male = await p.evaluate(async a=>{
  odgCorrente = {...a.base, scene:[], errore:'tronca'}; odgInCorso=false; window.__coda=[a.tronca];
  await odgRitenta();
  return {scene:odgCorrente.scene.length, errore:!!odgCorrente.errore, inCorso:odgInCorso};
}, {base:BASE, tronca:TRONCA});
ok('se va male resta com\'era, e si può riprovare', male, {scene:0, errore:true, inCorso:false});

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
