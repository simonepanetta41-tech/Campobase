/* Niente zoom con due dita, tranne che sulle pagine dei documenti.
 *
 * Due dita sull'app la ingrandivano come una pagina web e la barra in
 * basso usciva dallo schermo. Lo zoom resta solo sui canvas, dove stanno
 * i PDF: li' serve per leggere.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(54)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.addInitScript(()=>{
  const q=()=>{ const x={select(){return x},eq(){return x},in(){return x},order(){return x},limit:async()=>({data:[],error:null}),
    single:async()=>({data:null}),maybeSingle:async()=>({data:null}),then(f){return Promise.resolve({data:[],error:null}).then(f)}}; return x; };
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:q, rpc:async()=>({data:null}), storage:{from:()=>({})}})};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(600);
const r=await p.evaluate(()=>{
  const dita=(el,n)=>{ const t=[...Array(n)].map((_,i)=>new Touch({identifier:i,target:el,clientX:100+i*60,clientY:200}));
    const e=new TouchEvent('touchmove',{touches:t,targetTouches:t,changedTouches:t,bubbles:true,cancelable:true}); el.dispatchEvent(e); return e.defaultPrevented; };
  const gesto=(el)=>{ const e=new Event('gesturestart',{bubbles:true,cancelable:true}); el.dispatchEvent(e); return e.defaultPrevented; };
  const app=document.getElementById('app'), pdf=document.getElementById('pdfCanvas');
  const nuovo=document.createElement('canvas'); nuovo.className='pdf-pag'; document.body.appendChild(nuovo);
  return { app2:dita(app,2), app1:dita(app,1), pdf2:dita(pdf,2), nuovo2:dita(nuovo,2), gApp:gesto(app), gPdf:gesto(pdf),
           doppio:getComputedStyle(document.body).touchAction };
});
ok('⚠ due dita sull\'app: fermate', r.app2, true);
ok('un dito scorre come sempre', r.app1, false);
ok('⚠ due dita su una pagina di sceneggiatura: lasciate', r.pdf2, false);
ok('e su una pagina di un PDF aperto dopo', r.nuovo2, false);
ok('su iPhone lo stesso: fermato sull\'app, lasciato sul PDF', [r.gApp, r.gPdf], [true,false]);
ok('niente zoom col doppio tocco', r.doppio, 'manipulation');
ok('nessun errore di pagina', errori, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
