/* Cosa serve oggi, reparto per reparto.
 *
 * Il controllo che conta e' il riconoscimento del reparto. Tutta la
 * funzione sta in piedi su una cosa sola: che quando la riga si accende
 * tu ci creda. Se una volta ti manda a cercare le lacrime di un attore
 * perche' sul foglio stavano scritte accanto a "Suono", la volta dopo
 * quella spia non la guardi piu', e tanto valeva non farla.
 *
 * Quindi qui si prova soprattutto il contrario di quello che si spera:
 * che NON si accenda dove non deve.
 */
const RADICE = require('path').join(__dirname, '..');
const fs = require('fs');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(50)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

/* I fabbisogni veri dell'OdG 22 di Missione San Gennaro, piu' una riga
   di suono come quelle che compaiono sui fogli di altre produzioni. */
const FAB = [
  {reparto:'Scenografia / Props', voci:[
    {scene:'21', cosa:'Accampamento Volpe, lanterne, Corda per legare l’asino'},
    {scene:'25', cosa:'Rotonda dei caduti racc.'},
    {scene:'21, 27', cosa:'Focolare spento, Fucile La Volpe, Pistola Mazzacane'}]},
  {reparto:'Veicoli', voci:[{scene:'25, 25A, 27', cosa:'Auto carabinieri Mazzacane'}]},
  {reparto:'Stunt', voci:[{scene:'25', cosa:'Materassini e protezioni'}]},
  {reparto:'Animali', voci:[{scene:'21, 24', cosa:'1 Asino cavalcabile con sella'}]},
  {reparto:'Costumi / Trucco', voci:[{scene:'21, 24', cosa:'Doppio per Double Mazzacane'}]},
  {reparto:'Suono', voci:[{scene:'36', cosa:'Playback carro, diffusore in campo'}]},
];

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

console.log('\n── il reparto del foglio è il mio? ──');
const mio = (reparto, io) => p.evaluate(a=>fabMio(a.r, a.i), {r:reparto, i:io});

ok('Suono ↔ Suono',              await mio('Suono','Suono'), true);
ok('Audio ↔ Suono',              await mio('Audio','Suono'), true);
ok('Microfonisti ↔ Suono',       await mio('Microfonisti','Suono'), true);
ok('Costumi / Trucco ↔ Costumi', await mio('Costumi / Trucco','Costumi'), true);
ok('Costumi / Trucco ↔ Trucco',  await mio('Costumi / Trucco','Trucco'), true);
ok('Scenografia / Props ↔ Scenografia', await mio('Scenografia / Props','Scenografia'), true);
ok('Mezzi di Scena ↔ Autisti',   await mio('Mezzi di Scena','Autisti'), true);
ok('Attrezzeria ↔ Scenografia',  await mio('Attrezzeria','Scenografia'), true);

console.log('\n── e soprattutto: dove NON deve accendersi ──');
/* Il caso vero, dal foglio di SPRZ: nel testo appiattito "Lacrime per
   PIETRO" finisce accanto all'intestazione SUONO, ma e' trucco. Qui si
   prova che reparti diversi restano diversi. */
ok('Veicoli non è Suono',        await mio('Veicoli','Suono'), false);
ok('Stunt non è Suono',          await mio('Stunt','Suono'), false);
ok('Animali non è Scenografia',  await mio('Animali','Scenografia'), false);
ok('VFX non è SFX',              await mio('VFX','SFX'), false);
ok('SFX non è VFX',              await mio('SFX','VFX'), false);
ok('Trucco non è Costumi',       await mio('Trucco','Costumi'), false);
ok('senza reparto nel profilo, mai', await mio('Suono',''), false);
ok('reparto sconosciuto, mai',   await mio('Pirotecnica','Suono'), false);

console.log('\n── la riga nell\'OdG ──');
const riga = (reparto) => p.evaluate(a=>{
  localStorage.setItem('cb_profilo', JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:a.rep}));
  const d = {data:'2026-11-11', fabbisogni:a.fab, scene:[]};
  const h = odgPienoHtml(d);
  const m = /class="odg-att cerca fab-riga( acceso)?"[\s\S]*?<\/a>/.exec(h);
  return m ? {acceso:!!m[1], testo:m[0].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim()} : null;
}, {rep:reparto, fab:FAB});

const r1 = await riga('Suono');
ok('col mio reparto si accende', r1.acceso, true);
ok('e dice cosa c\'è',          /6 reparti · 8 voci/.test(r1.testo), true);
ok('e porta il bollo',          /suono/i.test(r1.testo), true);

const r2 = await riga('Montaggio');
ok('senza il mio reparto resta spenta', r2.acceso, false);
ok('e lo dice',                 /Niente per il tuo reparto/.test(r2.testo), true);
ok('senza bollo',               /montaggio|suono/i.test(r2.testo), false);

console.log('\n── la finestra ──');
const fin = await p.evaluate(a=>{
  localStorage.setItem('cb_profilo', JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
  odgCorrente = {data:'2026-11-11', fabbisogni:a.fab,
    domani:{etichetta:'Giovedì 12 novembre', fabbisogni:[{reparto:'VFX',voci:[{scene:'63',cosa:'Tunnel'}]}], scene:[]}};
  fabApri();
  const el = document.getElementById('odgFab');
  const rep = [...el.querySelectorAll('.fab-rep-t')].map(x=>x.textContent.trim());
  return {aperta: el.classList.contains('on'),
          primo: rep[0],
          mio: !!el.querySelector('.fab-rep.mio'),
          quante: el.querySelectorAll('.fab-rep').length,
          domani: !!el.querySelector('.fab-g'),
          scene: [...el.querySelectorAll('.fab-sc')].slice(0,2).map(x=>x.textContent.trim())};
}, {fab:FAB});
ok('si apre',                   fin.aperta, true);
ok('il mio reparto per primo',  /^Suono/.test(fin.primo), true);
ok('col bordo giallo',          fin.mio, true);
ok('ci sono tutti i reparti',   fin.quante, 7);   // 6 di oggi + 1 di domani
ok('e il giorno dopo a parte',  fin.domani, true);
ok('le scene in evidenza',      fin.scene, ['SC. 36','SC. 21']);

ok('si chiude', await p.evaluate(()=>{fabChiudi();
  return document.getElementById('odgFab').classList.contains('on');}), false);

console.log('\n── il richiamo, una volta sola ──');
const pop = (segno, reparto) => p.evaluate(a=>{
  localStorage.setItem('cb_profilo', JSON.stringify({nome:'S',cognome:'P',reparto:a.rep}));
  odgCorrente = {data:a.segno, fabbisogni:a.fab};
  fabRichiamo();
  const el = document.getElementById('fabPop');
  const su = el.classList.contains('on');
  const t  = el.textContent.replace(/\s+/g,' ').trim();
  el.classList.remove('on');
  return {su, t};
}, {segno, rep:reparto, fab:FAB});

const p1 = await pop('2026-11-11','Suono');
ok('la prima volta compare',    p1.su, true);
ok('e mostra la voce',          /Playback carro/.test(p1.t), true);
ok('senza didascalia',          /sotto Suono|ordine del giorno di oggi/i.test(p1.t), false);
ok('la seconda volta no',       (await pop('2026-11-11','Suono')).su, false);
ok('ma un OdG nuovo sì',        (await pop('2026-11-12','Suono')).su, true);
ok('senza niente del mio reparto, mai', (await pop('2026-11-13','Montaggio')).su, false);

console.log('\n── quello che torna dal modello si ripulisce ──');
ok('voci senza testo via, reparti vuoti via', await p.evaluate(()=>fabPulisci([
  {reparto:'Suono', voci:[{scene:'1',cosa:''},{scene:'2',cosa:'Playback'}]},
  {reparto:'Veicoli', voci:[]},
  {reparto:'', voci:[{scene:'3',cosa:'x'}]},
  {reparto:'Stunt'}
])), [{reparto:'Suono', voci:[{scene:'2',cosa:'Playback'}]}]);
ok('e se non c\'è niente, lista vuota',
   await p.evaluate(()=>[fabPulisci(null).length, fabPulisci('boh').length]), [0,0]);

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
