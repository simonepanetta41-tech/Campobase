/* Le categorie dello spoglio sotto le scene del giorno.
 *
 * Lo spoglio sa gia' che la 25 e' uno stunt e un camera car: quella roba
 * serve la mattina, nella lista delle scene di oggi, non in una schermata
 * a parte. Non si estrae niente di nuovo — e' lo stesso dato, incrociato
 * per numero di scena.
 *
 * Il controllo che conta e' quello sul confronto dei numeri. Senza
 * l'ancora di fine, la scena 2 si prenderebbe addosso tutto quello che
 * riguarda la 21 e la 25, e la mattina leggeresti "stunt" su una scena in
 * cui non c'e' nessuno stunt.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(50)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

/* Uno spoglio come quello vero: le scene scritte per esteso. */
const ANALISI = {
  camera_car: {presente:true, scene:[
    {scena:'SC.21 - EST. ACCAMPAMENTO - GIORNO (p.14)', note:'auto in corsa'},
    {scena:'SC.25 - EST. ROTONDA - GIORNO (p.18)', note:'inseguimento'}]},
  stunt: {presente:true, scene:[{scena:'SC.25 - EST. ROTONDA - GIORNO (p.18)', cosa:'inseguimento'}]},
  animali: {presente:true, scene:[
    {scena:'SC.21 - EST. ACCAMPAMENTO - GIORNO (p.14)', animale:'asino'},
    {scena:'SC.24 - EST. SENTIERO - GIORNO (p.16)', animale:'cavallo'}]},
  armi: {presente:true, scene:[{scena:'SC.27 - INT. CASOLARE - NOTTE (p.21)', arma:'fucile'}]},
  ambienti_rumorosi: {presente:true, scene:[{scena:'SC.27 - INT. CASOLARE - NOTTE (p.21)', fonte:'focolare'}]},
  acqua: {presente:false, scene:[]}
};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},order(){return this},
               single:async()=>({data:null}),maybeSingle:async()=>({data:null})}),
    storage:{from:()=>({upload:async()=>({}),download:async()=>({})})}
  })};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(800);

console.log('\n── il numero nudo di una scena ──');
const num = s => p.evaluate(x=>catNumero(x), s);
ok('"SC.21 - EST. ACCAMPAMENTO"', await num('SC.21 - EST. ACCAMPAMENTO - GIORNO (p.14)'), '21');
ok('"Sc. 32END - INT."',          await num('Sc. 32END - INT. CASA'), '32END');
ok('"65C"',                       await num('65C'), '65C');
ok('"  21 "',                     await num('  21 '), '21');
ok('una riga senza numero',       await num('TRASFERIMENTO'), '');
ok('niente',                      await num(''), '');

console.log('\n── le categorie di una scena ──');
const cat = (n, rep) => p.evaluate(a=>{
  localStorage.setItem('cb_profilo', JSON.stringify({nome:'S',cognome:'P',reparto:a.rep||''}));
  return catDiScena(a.n, spoglioDati(a.an), a.rep ? spoglioMioReparto() : null)
    .map(c=>c.nome + (c.mia?' *':''));
}, {n, rep, an:ANALISI});

ok('la 21: camera car e animali', (await cat('21')).sort(), ['Animali','Camera car']);
ok('la 25: camera car e stunt',   (await cat('25')).sort(), ['Camera car','Stunt']);
ok('la 24: solo animali',          await cat('24'), ['Animali']);
ok('la 99: niente',                await cat('99'), []);

console.log('\n── ⚠ il confronto dei numeri è per intero ──');
/* Se "2" si prendesse le scene 21, 24 e 25, la mattina leggeresti stunt
   e camera car su una scena dove non c'e' niente di tutto questo. */
ok('la 2 non prende la 21, la 24 e la 25', await cat('2'), []);
ok('la 5 non prende la 25',                await cat('5'), []);
ok('la 1 non prende la 21',                await cat('1'), []);

console.log('\n── il mio reparto viene prima, e in giallo ──');
/* Ambienti rumorosi e' del suono; armi sta con stunt e sfx. */
const mie = await cat('27','Suono');
ok('il suono per primo e segnato', mie, ['Ambienti rumorosi *','Armi']);
const altre = await cat('27','Montaggio');
ok('per un altro reparto nessuna è sua', altre.some(x=>/\*/.test(x)), false);

console.log('\n── come si vede nella lista ──');
const html = (rep) => p.evaluate(a=>{
  localStorage.setItem('cb_profilo', JSON.stringify({nome:'S',cognome:'P',reparto:a.rep}));
  window.analysisData = a.an;
  const d = {data:'2026-11-11', scene:[
    {n:'21', sinossi:'La Volpe lega l’asino.', ie:'E', m:'G', ambiente:'Accampamento', pag:'1 2/8', ids:'1, 19'},
    {n:'27', sinossi:'Si affrontano al focolare.', ie:'I', m:'N', ambiente:'Casolare', pag:'1 4/8', ids:'1, 2'}]};
  const h = odgPienoHtml(d);
  return [...h.matchAll(/<span class="cc-riga">([\s\S]*?)<\/span>\s*<\/span>/g)]
    .map(m=>m[1].replace(/<b>/g,'[').replace(/<\/b>/g,']').replace(/<[^>]+>/g,'').trim());
}, {rep, an:ANALISI});

ok('due righe, una per scena', (await html('Suono')).length, 2);
ok('la 21 come deve',          (await html('Suono'))[0], 'Camera car · Animali');
ok('la 27 col suono in risalto',(await html('Suono'))[1], '[Ambienti rumorosi] · Armi');
ok('per il montaggio niente in giallo',
   (await html('Montaggio')).some(x=>x.includes('[')), false);

console.log('\n── e senza analisi, niente riga ──');
/* Le categorie vengono dallo spoglio: su un film non analizzato la riga
   non c'e', e non e' un errore. */
ok('nessuna riga', await p.evaluate(()=>{
  window.analysisData = null;
  const d = {data:'2026-11-11', scene:[{n:'21', sinossi:'x', ids:'1'}]};
  return /cc-riga/.test(odgPienoHtml(d));
}), false);

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
