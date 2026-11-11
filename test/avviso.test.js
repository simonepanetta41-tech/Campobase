/* L'avviso che si deve leggere.
 *
 * I toast sono una riga da undici pixel in cima allo schermo. Vanno bene
 * per confermare un tocco appena dato, quando l'occhio e' gia' li'; non
 * vanno bene per una cosa che arriva da sola. La posta della produzione
 * arriva quando capita, magari col telefono sul tavolo, e quella riga non
 * la leggeva nessuno.
 *
 * Due cose si provano qui. Che l'avviso grande sia davvero grande, al
 * centro, e che non rubi i tocchi a quello che c'e' sotto — l'analisi va
 * avanti mentre lo si legge. E che i due annunci automatici all'apertura
 * di un progetto non ci siano piu': dicevano che era andata bene una cosa
 * che l'utente non aveva chiesto.
 */
const RADICE = require('path').join(__dirname, '..');
const fs = require('fs');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

(async()=>{
const sorgente = fs.readFileSync(RADICE + '/index.html', 'utf8');

console.log('\n── i due annunci automatici non ci sono piu\' ──');
ok('niente "PDL caricato correttamente"',
   /showToast\([^)]*PDL caricato/.test(sorgente), false);
ok('niente "PDF caricato — scene cliccabili"',
   /showToast\([^)]*scene cliccabili/.test(sorgente), false);
/* Questo invece resta: e' un ordine del giorno nuovo che e' appena
   entrato, non il buon esito di un caricamento in sottofondo. */
ok('ma resta "Ordine del giorno caricato."',
   /showToast\('Ordine del giorno caricato\.'\)/.test(sorgente), true);

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

console.log('\n── grande, al centro, e non ruba i tocchi ──');
const m = await p.evaluate(()=>{
  // Qualcosa da toccare sotto l'avviso, per vedere se lo copre.
  const sotto=document.createElement('button');
  sotto.id='provaSotto'; sotto.textContent='tocca';
  sotto.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1';
  sotto.onclick=()=>{window.__toccato=true;};
  document.body.appendChild(sotto);
  window.__toccato=false;

  avvisoGrande('Nuova mail dalla produzione', "Non chiudere l'app: la sto leggendo.", 900);
  const el=document.getElementById('avvisoGrande');
  const card=el.firstElementChild;
  const t=card.firstElementChild;
  const r=card.getBoundingClientRect();
  return {
    titolo: t.textContent,
    sotto: card.children[1]?.textContent,
    corpo: Math.round(parseFloat(getComputedStyle(t).fontSize)),
    tocchi: getComputedStyle(el).pointerEvents,
    // scostamento del centro della scheda dal centro dello schermo
    fuoriCentroX: Math.round(Math.abs((r.left+r.width/2) - innerWidth/2)),
    fuoriCentroY: Math.round(Math.abs((r.top+r.height/2) - innerHeight/2))
  };
});
ok('il titolo giusto',   m.titolo, 'Nuova mail dalla produzione');
ok('e la cosa da fare',  m.sotto, "Non chiudere l'app: la sto leggendo.");
ok('testo grande (>=20px)', m.corpo >= 20, true);
ok('centrato in orizzontale (<=2px)', m.fuoriCentroX <= 2, true);
ok('centrato in verticale (<=2px)',   m.fuoriCentroY <= 2, true);
ok('non prende i tocchi', m.tocchi, 'none');

/* Il tocco deve arrivare a quello che sta sotto: mentre si legge
   l'avviso l'analisi va avanti, e l'app resta usabile. */
await p.click('#provaSotto');
ok('si tocca quello che c\'è sotto', await p.evaluate(()=>window.__toccato), true);

console.log('\n── e se ne va da solo ──');
await p.waitForTimeout(1500);
ok('sparito', await p.evaluate(()=>!!document.getElementById('avvisoGrande')), false);

console.log('\n── due avvisi di fila non si accavallano ──');
await p.evaluate(()=>{ avvisoGrande('Primo','',4000); avvisoGrande('Secondo','',4000); });
ok('ce n\'è uno solo',
   await p.evaluate(()=>document.querySelectorAll('#avvisoGrande').length), 1);
ok('ed è l\'ultimo',
   await p.evaluate(()=>document.querySelector('#avvisoGrande div div').textContent), 'Secondo');

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
