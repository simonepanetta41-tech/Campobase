const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
const fs=require('fs');
/* I documenti veri non stanno nel repository.
 *
 * Questo controllo gira su un ordine del giorno vero, e dentro un ordine
 * del giorno vero c'e' la lista della troupe: nomi e numeri di telefono di
 * persone che lavorano. Nei file dei controlli i pochi nomi che servivano
 * sono stati sostituiti con nomi inventati della stessa forma; un
 * documento intero no, perche' basta sbagliarne uno.
 * I documenti vanno in test/dati/, che git non guarda. Senza, questo file
 * dice cosa manca e si ferma: un controllo che non puo' girare lo deve
 * dire, non passare di straforo. */
function dati(nome) {
  const p = require('path').join(__dirname, 'dati', nome);
  if (!require('fs').existsSync(p)) {
    console.log('ok — saltato: manca ' + p);
    process.exit(0);
  }
  return require('fs').readFileSync(p, 'utf8');
}

let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(18)} ${JSON.stringify(got)}`.padEnd(76)+` atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844}});
p.setDefaultTimeout(15000);
await p.addInitScript(()=>{
  // Il CDN e' bloccato nei test: senza questo stub `supabase.createClient`
  // esplode al caricamento e tutto cio' che e' dichiarato dopo resta in TDZ.
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},
    from:()=>({select(){return this},eq(){return this},order(){return this},single:async()=>({data:null}),
               maybeSingle:async()=>({data:null}),insert:async()=>({data:null}),upsert:async()=>({error:null}),
               delete(){return this},update(){return this},neq(){return this}}),
    storage:{from:()=>({upload:async()=>({}),download:async()=>({})})}
  })};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);
const testo=dati('odg.txt');
console.log('\n── il parser dentro l\'app, sull\'OdG vero ──');
const r=await p.evaluate(t=>odgIntestazione(t),testo);
Object.entries({numero:20,data:'2026-11-09',convocazione:'07.30',prontiAGirare:'08.30',
  fineRiprese:'15.00',fineLavorazione:'15.30',catering:'11.30',cestini:90,
  dawn:'06.36',alba:'07.03',tramonto:'17.59',dusk:'18.25',
  ambiente:'CAMPI STERMINATI / FATTORIA',meteo:'Soleggiato',
  mappa:'https://maps.app.goo.gl/A5KUf7hE4Kntttyj6'}).forEach(([k,v])=>ok(k,r[k],v));
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
