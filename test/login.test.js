/* La schermata di accesso: i due tasti devono riempire lo schermo.
 *
 * Il guasto: dopo il controllo dell'accesso il JavaScript mette
 * display:flex su #authPage, e da quel momento la scheda diventa un
 * elemento flessibile che si stringe sul contenuto. Su un telefono da 390
 * pixel veniva larga 241, i tasti 193, e la scritta "Continua con Google"
 * ne occupava 162: quindici pixel per lato.
 *
 * Il CSS dice che #authPage e' un blocco, ed e' vero per un istante: per
 * questo il controllo mette flex a mano prima di misurare. Misurare lo
 * stato iniziale avrebbe detto che andava tutto bene.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,v,extra='')=>{ if(!v) ko++; console.log(`  ${v?'ok ':'KO '} ${String(n).padEnd(48)} ${extra}`); };

(async()=>{
const b=await chromium.launch();

const misura = async (larghezza) => {
  const p = await b.newPage({viewport:{width:larghezza,height:844}});
  await p.addInitScript(()=>{window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},limit:async()=>({data:[]})}),
    storage:{from:()=>({})}})};});
  await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(600);
  const m = await p.evaluate(()=>{
    // Lo stato che si guarda davvero, non quello del primo istante.
    document.getElementById('authPage').style.display = 'flex';
    const acc = document.querySelector('.acc').getBoundingClientRect();
    const tasti = [...document.querySelectorAll('#accScelte .acc-btn')];
    const dentro = (t) => {
      const testo = [...t.childNodes].map(n=>n.textContent).join('').trim();
      const s = document.createElement('span');
      s.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;font:'+getComputedStyle(t).font;
      s.textContent = testo; document.body.appendChild(s);
      const w = s.getBoundingClientRect().width; s.remove();
      return {testo, larghezzaTesto: w, larghezza: t.getBoundingClientRect().width,
              alto: t.getBoundingClientRect().height};
    };
    const pad = parseFloat(getComputedStyle(document.querySelector('.acc')).paddingLeft);
    return {schermo: innerWidth, acc: acc.width, accSinistra: acc.left, pad, tasti: tasti.map(dentro),
            sborda: document.documentElement.scrollWidth > innerWidth};
  });
  await p.close();
  return m;
};

/* Oltre i 420 la scheda non si stira: su un iPhone Pro Max, largo 430,
   fermarsi e' voluto — una riga di testo lunga quanto lo schermo si legge
   peggio, non meglio. */
const LIMITE = 420;
for (const larghezza of [390, 360, 430]) {
  console.log(`\n── su uno schermo da ${larghezza} ──`);
  const m = await misura(larghezza);
  const atteso = Math.min(larghezza, LIMITE);
  ok('la scheda è larga quanto deve', Math.round(m.acc) === atteso, `${Math.round(m.acc)} di ${larghezza}`);
  ok('due tasti', m.tasti.length === 2, String(m.tasti.length));
  for (const t of m.tasti) {
    const largo = Math.round(t.larghezza), pieno = atteso - m.pad * 2;
    ok(`"${t.testo}" largo quanto la scheda`, largo === Math.round(pieno), `${largo} invece di ${Math.round(pieno)}`);
    /* L'aria ai lati della scritta: era quindici pixel, e si vedeva. */
    const aria = Math.round((t.larghezza - t.larghezzaTesto) / 2);
    ok('  con aria ai lati', aria >= 40, `${aria} pixel per lato`);
    ok('  e alto da toccare', t.alto >= 44, `${Math.round(t.alto)} pixel`);
  }
  ok('niente sborda di lato', !m.sborda);
}

console.log('\n── su uno schermo largo resta una colonna, centrata ──');
// Su un portatile non si stira per tutto lo schermo: max-width 420.
const g = await misura(1024);
ok('non supera i 420', g.acc <= 420, `${Math.round(g.acc)}`);
// Centrata davvero: il margine a sinistra e' meta' dello spazio avanzato.
ok('ed è centrata', Math.abs(g.accSinistra - (1024 - g.acc) / 2) < 1,
   `a ${Math.round(g.accSinistra)} da sinistra`);
ok('i tasti riempiono la colonna',
   Math.round(g.tasti[0].larghezza) === Math.round(g.acc - g.pad * 2),
   `${Math.round(g.tasti[0].larghezza)} in ${Math.round(g.acc)}`);

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
