/* La versione scritta a schermo.
 *
 * Una PWA installata sulla home puo' restare sospesa per ore e riaprirsi
 * con la copia del mattino. Senza un numero scritto da qualche parte,
 * "e' arrivato il deploy?" e' una domanda a cui si risponde a tentoni —
 * ed e' successo due volte in un giorno solo.
 *
 * Il controllo che conta davvero e' il primo: i due file devono dire lo
 * stesso numero. Se un giorno si alza la cache del service worker e ci
 * si dimentica della costante nell'app — o viceversa — il numero a
 * schermo diventerebbe una bugia, e una bugia e' peggio del niente che
 * c'era prima.
 */
const RADICE = require('path').join(__dirname, '..');
const fs = require('fs');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

(async()=>{
const html = fs.readFileSync(RADICE + '/index.html', 'utf8');
const sw   = fs.readFileSync(RADICE + '/sw.js', 'utf8');

const inApp = (/const CB_VERSIONE = '([\d.]+)'/.exec(html) || [])[1];
const inSw  = (/const CACHE = 'campobase-v(\d+)'/.exec(sw) || [])[1];

console.log('\n── i due file dicono lo stesso numero ──');
ok('l\'app ha una versione',      !!inApp, true);
ok('il service worker pure',      !!inSw, true);
ok('e combaciano',                inApp && inApp.split('.')[1], inSw);
ok('la prima cifra è 1',          inApp && inApp.split('.')[0], '1');

console.log('\n── e si legge in fondo alla schermata ──');
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
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
ok('scritta nel piede', await p.evaluate(()=>document.getElementById('cbVer')?.textContent),
   'v' + inApp);
ok('piccola e discreta',
   await p.evaluate(()=>parseFloat(getComputedStyle(document.getElementById('cbVer')).fontSize) <= 10),
   true);

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
