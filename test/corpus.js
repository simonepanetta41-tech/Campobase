/*
 * La batteria di prova: undici ordini del giorno di produzioni diverse.
 *
 * I documenti si leggono dentro la pagina vera, chiamando odgTestoDaPdf e
 * odgIntestazione come li chiama l'app. Estrarre il testo in un altro modo
 * — con pdftotext, per dire — vorrebbe dire misurare un testo che l'app
 * non vedra' mai: pdf.js unisce le righe a modo suo, e meta' dei guasti di
 * stasera stavano proprio li'.
 *
 * pdf.js arriva da un CDN, che qui dentro non si raggiunge: si serve la
 * copia locale rispondendo al posto del CDN.
 *
 * Uso:  node corpus.js            → la tabella di cosa si legge
 *       node corpus.js --testo X  → il testo estratto del documento che
 *                                   contiene X nel nome, per guardarlo
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
const http=require('http'); const fs=require('fs'); const path=require('path');

const DIR=path.join(__dirname,'odg-corpus');
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

const APP=RADICE;
const PDFJS=path.join(__dirname,'node_modules/pdfjs-dist/build');

const srv=http.createServer((req,res)=>{
  const p=req.url.split('?')[0];
  const f = p.startsWith('/pdfjs/') ? path.join(PDFJS,p.slice(7))
          : p.startsWith('/pdf/')   ? path.join(DIR,decodeURIComponent(p.slice(5)))
          : path.join(APP, p==='/'?'/index.html':p);
  try{
    res.writeHead(200,{'content-type':
      f.endsWith('.js')?'text/javascript':f.endsWith('.pdf')?'application/pdf':'text/html'});
    res.end(fs.readFileSync(f));
  }catch(_){ res.writeHead(404); res.end(); }
});

const campi=['numero','data','convocazione','prontiAGirare','pausa','catering','cestini',
             'fineRiprese','fineLavorazione','pagine','ambiente','location','luoghi',
             'dawn','alba','tramonto','dusk','meteo','ospedale','regia'];

(async()=>{
await new Promise(r=>srv.listen(0,r));
const porta=srv.address().port;
const b=await chromium.launch();
const ctx=await b.newContext({serviceWorkers:'block'});
const p=await ctx.newPage();
p.setDefaultTimeout(60000);
const errori=[]; p.on('pageerror',e=>errori.push(e.message));

// pdf.js dal CDN non si raggiunge: si risponde con la copia locale.
await p.route('**',r=>/^http:\/\/(localhost|127\.)/.test(r.request().url())?r.continue():r.abort());
await p.route('**cdnjs.cloudflare.com/**pdf.min.js',r=>r.fulfill(
  {status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(PDFJS,'pdf.min.js'))}));
await p.route('**cdnjs.cloudflare.com/**pdf.worker.min.js',r=>r.fulfill(
  {status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(PDFJS,'pdf.worker.min.js'))}));

await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},
             limit:async()=>({data:[]}),upsert:async()=>({error:null}),maybeSingle:async()=>({data:null})}),
  storage:{from:()=>({})}})};});

await p.goto('http://localhost:'+porta+'/index.html',{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>!!window.pdfjsLib && typeof odgTestoDaPdf==='function',null,{timeout:30000});

const files=fs.readdirSync(DIR).filter(f=>f.endsWith('.pdf')).sort();
const cerca=process.argv.indexOf('--testo');
const soloTesto=cerca>0?process.argv[cerca+1]:null;

const righe=[];
for(const f of files){
  if(soloTesto && !f.toLowerCase().includes(soloTesto.toLowerCase())) continue;
  const r=await p.evaluate(async([nome,porta])=>{
    const resp=await fetch('http://localhost:'+porta+'/pdf/'+encodeURIComponent(nome));
    const file=new File([await resp.blob()],nome,{type:'application/pdf'});
    const t=await odgTestoDaPdf(file,true);
    return {testo:t.testo, colonne:t.colonne, tagli:(window.__tagli||null), tipo:odgTipoDoc(t.testo), int:odgIntestazioneDa(t,nome),
            daNome:odgNumeroDaNome(nome), caratteri:t.testo.length};
  },[f,porta]);
  righe.push({f,...r});
}

if(process.argv.includes('--json')){
  const out={};
  for(const r of righe) out[r.f.replace(/\.pdf$/,'')]=r.int;
  fs.writeFileSync(path.join(__dirname,'script.json'),JSON.stringify(out,null,1));
  console.log('scritto script.json ('+Object.keys(out).length+' documenti)');
} else if(process.argv.includes('--colonne')){
  for(const r of righe){ console.log('\n══════ '+r.f); console.log(r.colonne||'(nessuna colonna)'); }
} else if(process.argv.includes('--salva')){
  const out=path.join(__dirname,'testi'); fs.mkdirSync(out,{recursive:true});
  for(const r of righe) fs.writeFileSync(path.join(out,r.f.replace(/\.pdf$/,'.txt')),r.testo);
  console.log('salvati '+righe.length+' testi in '+out);
} else if(soloTesto){
  for(const r of righe){
    console.log('\n══════ '+r.f+'  ('+r.caratteri+' caratteri, tipo: '+r.tipo+')');
    console.log(r.testo.slice(0,Number(process.argv[cerca+2])||3500));
  }
} else {
  const breve=s=>s===null||s===undefined||s===''?'·':String(s).replace(/\s+/g,' ').slice(0,26);
  for(const r of righe){
    console.log('\n══════ '+r.f);
    console.log('   tipo riconosciuto: '+r.tipo+'   ·   caratteri: '+r.caratteri
      +'   ·   numero dal nome: '+(r.daNome??'·'));
    for(const c of campi){
      let v=r.int[c];
      if(c==='luoghi') v=(v||[]).map(x=>x.nome).join(', ');
      console.log('   '+c.padEnd(16)+breve(v));
    }
  }
}
if(errori.length) console.log('\nErrori di pagina:',errori.slice(0,5));
await b.close(); srv.close();})();
