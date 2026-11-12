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

console.log('\n── ⚠ una scena spezzata in due si ricuce ──');
/* Il testo e' quello vero dell'ordine del giorno 24, come lo legge
   l'app: la riga della scena 16 va a capo e i pezzi finiscono sopra e
   sotto. Il modello ne aveva fatto una scena 1 e una scena 16. */
const TESTO24 = [
  'SC.   E/I G/N   AMBIENTE   SINOSSI   ID   DAY   PAG',
  '1, 2, 7,',
  'Colonna e Navarra cenano e chiedono informazioni sulla strada. La Volpe li approccia per consigliarli.',
  '16   I/E   N   OSTERIA   15, 16,   3   6 6/8',
  'Arriva Ginetto il bullo ma Navarra lo schiaffeggia.',
  '17',
  'Tot. pag.: 6 6/8',
  'CAST',
  'ID   RUOLO   CAST   SCENE   P/UP   CB   M.UP   HAIR   COST.   PRONTI   SET',
  '1   PRINCIPE COLONNA   ROCCO PAPALEO   16   11.20   11.50   12.50   11.55   12.30   13.35   13.45'
].join('\n');
const CAST16 = [{id:'1', scene:'16'}, {id:'2', scene:'16'}];
const ricuci = (scene, cast, testo) => p.evaluate(a=>{
  const tab = {scene:a.scene, cast:a.cast}; odgRicuciScene(tab, a.testo);
  return tab.scene.map(s=>({n:s.n, sinossi:s.sinossi, ids:s.ids, ie:s.ie}));
}, {scene, cast, testo});
const SPEZZATA = [
  {n:'1', ie:'E', m:'G', ambiente:'Osteria', sinossi:'Colonna e Navarra cenano e chiedono informazioni sulla strada. La Volpe li approccia per consigliarli.', ids:'1, 2, 7'},
  {n:'16', ie:'I/E', m:'N', ambiente:'Osteria', sinossi:'Arriva Ginetto il bullo ma Navarra lo schiaffeggia.', ids:'15, 16, 17', pag:'6 6/8'}];
let rc = await ricuci(SPEZZATA, CAST16, TESTO24);
ok('una scena sola, la 16', rc.map(s=>s.n), ['16']);
ok('con la sinossi intera, nell\'ordine giusto', rc[0].sinossi,
   'Colonna e Navarra cenano e chiedono informazioni sulla strada. La Volpe li approccia per consigliarli. Arriva Ginetto il bullo ma Navarra lo schiaffeggia.');
ok('e tutti gli ID', rc[0].ids, '1, 2, 7, 15, 16, 17');
ok('interno/esterno dalla riga vera', rc[0].ie, 'I/E');

console.log('\n── ⚠ e non si ricuce quello che non è rotto ──');
/* Due scene vere restano due. */
const DUE = [{n:'16', sinossi:'a', ids:'1'}, {n:'17', sinossi:'b', ids:'2'}];
const TESTO2 = '16   I/E   N   OSTERIA   1   3   2\n17   E   G   STRADA   2   3   1\n';
ok('due scene vere', (await ricuci(DUE, [{scene:'16, 17'}], TESTO2)).map(s=>s.n), ['16','17']);
/* Una scena senza attori (un paesaggio) ha la sua riga: resta. */
ok('una scena senza attori resta',
   (await ricuci(DUE, [{scene:'16'}], TESTO2)).map(s=>s.n), ['16','17']);
/* Un foglio scritto in un altro ordine: nessuna scena passa la prova
   della riga, quindi il formato non si conosce e non si tocca niente. */
ok('formato sconosciuto: non si tocca',
   (await ricuci(SPEZZATA, CAST16, 'INT   CASA MARA\n60   N6   2/8   1, 2, 6\n')).map(s=>s.n), ['1','16']);
/* Senza cast manca la seconda prova. */
ok('senza cast: non si tocca', (await ricuci(SPEZZATA, [], TESTO24)).map(s=>s.n), ['1','16']);
/* Gli stacchi (TRASFERIMENTO) non hanno numero e non si giudicano. */
ok('gli stacchi restano',
   (await ricuci([{n:'16',sinossi:'a',ids:'1'},{n:'',nota:'TRASFERIMENTO'},{n:'17',sinossi:'b',ids:'2'}],
                 [{scene:'16, 17'}], TESTO2)).length, 3);

console.log('\n── gli stralci di una giornata con una scena sola ──');
/* Con una scena sola c'e' un'intestazione sola, e contando fino a due il
   documento non era niente: la scena dell'OdG 24 non si apriva. La
   parola "stralci" sta nel nome del file, non nel testo. */
const UNO = 'INT./EST. OSTERIA - NOTTE 16 16\nColonna e Navarra sono seduti a un tavolo. NAVARRA Scusate, per Roma?\n';
ok('dal nome del file', await p.evaluate(x=>odgTipoDoc(x, 'MSG - Stralci DAY _24.pdf'), 'testo qualunque senza intestazioni'), 'stralci');
ok('anche col file rinominato, da un\'intestazione', await p.evaluate(x=>odgTipoDoc(x, 'documento.pdf'), UNO), 'stralci');
ok('un ordine del giorno resta tale, anche col nome sbagliato',
   await p.evaluate(()=>odgTipoDoc('CONVOCAZIONE: 13.00\nFINE RIPRESE: 20.30\nCESTINI: 110', 'Stralci.pdf')), 'odg');
const rip = await p.evaluate(x=>{
  odgCorrente = {data:'2026-11-13', numero:'24', scene:[{n:'16'}], cast:[{scene:'16'}],
    allegati:[{nome:'MSG - Stralci DAY _24.pdf', tipo:null, testo:x}]};
  odgRicalcola();
  return {tipo:odgCorrente.allegati[0].tipo, apre:odgHaStralcio(odgCorrente, '16')};
}, UNO);
ok('un OdG già salvato si ripara all\'apertura', rip, {tipo:'stralci', apre:true});

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
