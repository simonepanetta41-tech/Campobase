// Le coordinate vere dei pezzi di testo, per capire come sono disposte le
// colonne. Uso: node coord.js VM3 "FINE LAVORAZIONE"
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
const http=require('http'); const fs=require('fs'); const path=require('path');
const DIR=path.join(__dirname,'odg-corpus'), APP=RADICE;
/* I PDF della batteria non stanno nel repository.
 *
 * Sono ordini del giorno veri di dieci produzioni, e dentro ci sono i
 * numeri di telefono della troupe: non e' materiale da mettere in un
 * repository, nemmeno privato. Chi vuole rilanciare questa misura mette i
 * suoi PDF in test/odg-corpus/ — la cartella e' esclusa da git. Senza
 * quella cartella questo file dice cosa manca e si ferma, invece di
 * fallire con un elenco vuoto che sembra un risultato. */
if (!require('fs').existsSync(DIR) || !require('fs').readdirSync(DIR).filter(f=>f.endsWith('.pdf')).length) {
  console.log('Manca la batteria di PDF. Mettine qualcuno in ' + DIR + ' e rilancia.');
  process.exit(0);
}

const PDFJS=path.join(__dirname,'node_modules/pdfjs-dist/build');
const srv=http.createServer((req,res)=>{const p=req.url.split('?')[0];
  const f=p.startsWith('/pdfjs/')?path.join(PDFJS,p.slice(7)):p.startsWith('/pdf/')?path.join(DIR,decodeURIComponent(p.slice(5))):path.join(APP,p==='/'?'/index.html':p);
  try{res.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':f.endsWith('.pdf')?'application/pdf':'text/html'});res.end(fs.readFileSync(f));}catch(_){res.writeHead(404);res.end();}});
(async()=>{
await new Promise(r=>srv.listen(0,r)); const porta=srv.address().port;
const b=await chromium.launch(); const ctx=await b.newContext({serviceWorkers:'block'}); const p=await ctx.newPage();
p.setDefaultTimeout(60000);
await p.route('**',r=>/^http:\/\/(localhost|127\.)/.test(r.request().url())?r.continue():r.abort());
await p.route('**cdnjs.cloudflare.com/**pdf.min.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(PDFJS,'pdf.min.js'))}));
await p.route('**cdnjs.cloudflare.com/**pdf.worker.min.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(PDFJS,'pdf.worker.min.js'))}));
await p.addInitScript(()=>{window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},from:()=>({select(){return this},eq(){return this},limit:async()=>({data:[]}),maybeSingle:async()=>({data:null})}),storage:{from:()=>({})}})};});
await p.goto('http://localhost:'+porta+'/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>!!window.pdfjsLib,null,{timeout:30000});
const nome=fs.readdirSync(DIR).find(f=>f.toLowerCase().includes(process.argv[2].toLowerCase()));
const cerca=process.argv[3]||'';
const r=await p.evaluate(async([nome,porta,cerca])=>{
  const resp=await fetch('http://localhost:'+porta+'/pdf/'+encodeURIComponent(nome));
  const buf=await (await resp.blob()).arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const pag=await pdf.getPage(1); const c=await pag.getTextContent();
  const vp=pag.getViewport({scale:1});
  const items=c.items.filter(i=>i.str&&i.str.trim())
    .map(i=>({t:i.str,x:Math.round(i.transform[4]*10)/10,y:Math.round(i.transform[5]*10)/10,w:Math.round((i.width||0)*10)/10}));
  const q=cerca?items.filter(i=>i.t.toUpperCase().includes(cerca.toUpperCase())):items;
  return {larghezza:Math.round(vp.width), trovati:q.slice(0,8),
          vicini: q.length? items.filter(i=>Math.abs(i.y-q[0].y)<9).sort((a,b)=>a.x-b.x) : []};
},[nome,porta,cerca]);
console.log(nome+'   larghezza pagina: '+r.larghezza);
console.log('\ntrovati:'); r.trovati.forEach(i=>console.log('   y='+i.y+'  x='+i.x+'  w='+i.w+'   '+JSON.stringify(i.t)));
console.log('\nquello che sta a meno di 9 punti di altezza:');
r.vicini.forEach(i=>console.log('   y='+i.y+'  x='+i.x+'   '+JSON.stringify(i.t)));
await b.close(); srv.close();})();
