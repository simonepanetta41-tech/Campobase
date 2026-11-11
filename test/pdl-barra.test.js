/* L'avanzamento delle giornate nel piano.
 *
 * Prima si contavano solo le giornate marcate a mano, una per una, dalla
 * finestra di una giornata del piano. Sul set nessuno lo fa: la barra
 * restava a zero a metà film.
 *
 * Il numero dell'ordine del giorno e' il contatore della produzione — se
 * in mano c'e' il 23, le prime 22 sono fatte — e quella di oggi, che e' in
 * corso, non si conta.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(48)} ${JSON.stringify(got)}`.padEnd(104)+' atteso '+JSON.stringify(exp));};

// Un piano con 37 giornate e tre scene per giornata.
const PIANO = {titolo:'Missione San Gennaro', totale_giorni:37, settimane:[{giorni:
  Array.from({length:37},(_,i)=>({numero_giorno:i+1, scene:[{numero:'a'+i},{numero:'b'+i},{numero:'c'+i}]}))}]};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844}});
p.setDefaultTimeout(15000);
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},
             limit:async()=>({data:[]}),upsert:async()=>({error:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);

// Restituisce {giornate, perc, nota} come si leggono a schermo.
const barre = async (odg, segnate) => p.evaluate(([piano, odg, segnate]) => {
  pdlData = piano;
  pdlShootingData = {};
  for (let i = 1; i <= segnate; i++) pdlShootingData[i] = {scenes:{}, status:'complete'};
  odgCorrente = odg ? {data:'2026-11-11', numero:odg, scene:[]} : null;
  renderPdlStats();
  const g = document.querySelectorAll('#pdlProgBars .pdl-barra')[1];
  return {
    etichetta: g.querySelector('b').textContent,
    larghezza: g.querySelector('.v>div').style.width,
    nota: (g.querySelector('.d')||{}).textContent || '',
    girate: [...document.querySelectorAll('#pdlStatsRow div')].map(x=>x.textContent)
  };
}, [PIANO, odg, segnate]);

console.log('\n── col 23 in mano, 22 sono fatte ──');
const a = await barre(23, 0);
ok('ventidue su trentasette', a.etichetta, '22/37 · 59%');
ok('la barra è al 59%',       a.larghezza, '59%');
ok('e dice da dove viene',    a.nota, 'dall\'ordine del giorno 23');

console.log('\n── quello di oggi non si conta ──');
// Oggi e' l'ODG 22: la giornata e' in corso, le fatte sono 21.
ok('ventuno', (await barre(22, 0)).etichetta, '21/37 · 57%');
ok('col primo, zero', (await barre(1, 0)).etichetta, '0/37 · 0%');

console.log('\n── senza ordine del giorno resta quello che è segnato a mano ──');
const m = await barre(null, 4);
ok('quattro segnate',     m.etichetta, '4/37 · 11%');
ok('e nessuna spiegazione', m.nota, '');

console.log('\n── chi c\'era vince: le marcature a mano, se dicono di più ──');
const piu = await barre(10, 25);
ok('venticinque, non nove', piu.etichetta, '25/37 · 68%');
ok('e niente nota',         piu.nota, '');

console.log('\n── non si sfora il totale ──');
/* Un ordine del giorno con un numero piu' alto delle giornate del piano
   vuol dire che il piano in mano e' una versione vecchia: la barra si
   ferma al suo totale invece di dire 45 su 37. */
const oltre = await barre(50, 0);
ok('fermo a trentasette',  oltre.etichetta, '37/37 · 100%');
ok('e non oltre il 100%',  oltre.larghezza, '100%');

console.log('\n── e nella riga dei numeri in cima ──');
ok('giornate girate aggiornate', (await barre(23, 0)).girate[1], '22Giornate girate');

console.log('\n── le scene restano come erano ──');
// Di proposito: per ora si contano solo quelle marcate.
const sc = await p.evaluate(() => {
  const s = document.querySelectorAll('#pdlProgBars .pdl-barra')[0];
  return s.querySelector('b').textContent;
});
ok('nessuna scena stimata', sc, '0/111 · 0%');

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
