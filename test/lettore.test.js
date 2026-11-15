const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(90)+` atteso ${JSON.stringify(exp)}`);};
const PDF='/mnt/user-data/attachments/53b34710-362c-5fb2-bfbf-da310a874ca4/25bd9e34-MSG_-_Stralci_DAY_20.pdf';
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(20000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in:async()=>({data:[]}),order(){return this},
             limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};});
await p.route('**', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);
// pdf.js serve davvero: il CDN e' bloccato, quindi lo si inietta dal
// pacchetto locale e il worker si costruisce come blob.
const pdfSrc = require('fs').readFileSync(require.resolve('pdfjs-dist/build/pdf.js'),'utf8');
const wrkSrc = require('fs').readFileSync(require.resolve('pdfjs-dist/build/pdf.worker.js'),'utf8');
await p.addScriptTag({ content: pdfSrc });
await p.evaluate(w=>{
  const b=new Blob([w],{type:'application/javascript'});
  window.pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(b);
}, wrkSrc);

console.log('\n── lettura del PDF vero degli stralci ──');
const buf = require('fs').readFileSync(PDF);
const sc = await p.evaluate(async (arr)=>{
  const f = new File([new Uint8Array(arr)], 'Stralci.pdf', {type:'application/pdf'});
  const r = await odgTestoDaPdf(f, true);
  return { tipo: odgTipoDoc(r.testo), righe: r.righe.length, scene: stralciDaRighe(r.righe) };
}, [...buf]);
ok('riconosciuto come stralci', sc.tipo, 'stralci');
ok('righe lette',   sc.righe > 100, true);
ok('tre scene',     sc.scene.map(x=>x.n), ['32','33','65C']);
ok('intestazione',  sc.scene[0].testa, 'EST. CAMPI STERMINATI, IN AUTO - GIORNO');

const b33 = sc.scene[1].blocchi;
ok('azione poi nome poi battuta', b33.slice(0,3).map(x=>x.k), ['azione','chi','battuta']);
ok('chi parla',     b33[1].t, 'COLONNA');
ok('la battuta',    b33[2].t, 'Sicuro che sia il posto giusto?');
ok('lo spazio fra le parole del nome',
   sc.scene[2].blocchi.find(x=>x.k==='chi').t, 'INGEGNER RANIERI');
ok('la didascalia riconosciuta', b33.some(x=>x.k==='didascalia'), true);
ok('le righe spezzate si riuniscono', /Grazie del passaggio, siete stati molto gentili/.test(b33[4].t), true);

console.log('\n── ⚠ stralci col numero sulla riga dell\'intestazione ──');
/* Un'altra produzione, un'altra impaginazione: il numero di scena non sta
   da solo nel margine ma sulla stessa riga, prima e dopo. Il PDF la da'
   come una riga sola che comincia col numero, e di scene non se ne
   trovava nessuna: sull'app gli stralci non si aprivano. Le righe sono
   quelle vere, come le restituisce il lettore. */
const altra = await p.evaluate(()=>stralciDaRighe([
  {x:508,p:1,t:'3.'},
  {x:54,p:1,t:'2   EST. CASA ANDREA - GIORNO   2'},
  {x:108,p:1,t:'Un casolare in collina domina il territorio circostante.'},
  {x:494,p:2,t:'149.'},
  {x:54,p:2,t:'93   EST/INT. CASA DI ANDREA - GIORNO   93'},
  {x:108,p:2,t:'Il ROMBO di una moto anticipa l\u2019arrivo del veicolo davanti'},
  {x:108,p:2,t:'casa di Andrea, sotto un cielo lattiginoso.'},
  {x:252,p:2,t:'ANDREA'},
  {x:180,p:2,t:'Vitaliano.'},
  {x:54,p:3,t:'92A   INT/EST. MACCHINA AMODIO/ STRADE CASALEGNO - ALBA   92A *'},
  {x:108,p:3,t:'Amodio guida.'}]));
ok('le scene si trovano, col loro numero', altra.map(x=>x.n), ['2','93','92A']);
ok('l\'intestazione senza i numeri attorno', altra.map(x=>x.testa), ['EST. CASA ANDREA - GIORNO','EST/INT. CASA DI ANDREA - GIORNO','INT/EST. MACCHINA AMODIO/ STRADE CASALEGNO - ALBA']);
ok('il numero di pagina non entra nel testo', altra[0].blocchi.map(x=>x.t), ['Un casolare in collina domina il territorio circostante.']);
ok('azione, nome, battuta', altra[1].blocchi.map(x=>x.k), ['azione','chi','battuta']);
ok('le righe d\'azione si riuniscono', /davanti casa di Andrea/.test(altra[1].blocchi[0].t), true);
console.log('\n── l\'indice degli stralci mandato dal server ──');
/* Dove la lettura dai rientri non trova niente — un'impaginazione che non
   conosce — le scene si aprono lo stesso, alla pagina detta dal server. */
const ind = await p.evaluate(async ()=>{
  const salvaVero = odgSalva; odgSalva = async()=>{};
  const base = () => ({ data:'2026-04-16', numero:'35', troupe:[], scene:[{n:'93'}], allegati:[{nome:'letture.pdf',tipo:'stralci',percorso:'x'}] });
  const out = {};
  // 1. il telefono non legge niente (PDF non scaricabile): vale l'indice
  odgByteDi = async()=>null;
  odgCorrente = Object.assign(base(), { stralciIndice:[{n:'2',p:1,testa:'EST. CASA - GIORNO'},{n:'93',p:2,testa:''}] });
  await odgStralciRipara();
  out.soloIndice = odgCorrente.sceneggiatura.map(x=>x.n+'@'+x.p);
  out.cliccabile = [odgHaStralcio(odgCorrente,'93'), odgHaStralcio(odgCorrente,'94')];
  // 2. il telefono legge il PDF: dove ha letto vale la sua pagina, l'indice aggiunge il resto
  odgByteDi = async()=>new ArrayBuffer(8);
  odgTestoDaPdf = async()=>({ testo:'', righe:[
    {x:54,p:1,t:'2   EST. CASA ANDREA - GIORNO   2'},{x:108,p:1,t:'Un casolare.'},
    {x:54,p:3,t:'93   EST/INT. CASA DI ANDREA - GIORNO   93'},{x:108,p:3,t:'Una moto.'},{x:108,p:4,t:'Fine.'}] });
  odgCorrente = Object.assign(base(), { stralciIndice:[{n:'2',p:1},{n:'93',p:2},{n:'94',p:4},{n:'88',p:9}] });
  await odgStralciRipara();
  out.insieme = odgCorrente.sceneggiatura.map(x=>x.n+'@'+x.p+(x.daIndice?'*':''));
  // 3. senza indice: come sempre
  odgCorrente = base();
  await odgStralciRipara();
  out.senza = odgCorrente.sceneggiatura.map(x=>x.n+'@'+x.p);
  odgSalva = salvaVero; return out;
});
ok('⚠ il telefono non legge niente: valgono le pagine del server', ind.soloIndice, ['2@1','93@2']);
ok('e le scene diventano cliccabili', ind.cliccabile, [true,false]);
ok('⚠ dove il telefono ha letto, vale la sua pagina', ind.insieme.slice(0,2), ['2@1','93@3']);
ok('l\'indice aggiunge solo quello che manca', ind.insieme[2], '94@4*');
ok('⚠ una pagina che nel file non c\'è si scarta', ind.insieme.length, 3);
ok('senza indice tutto come prima', ind.senza, ['2@1','93@3']);

/* L'ordine del giorno la chiama "92pt2", gli stralci "92". */
ok('⚠ "92pt2" apre lo stralcio della 92', await p.evaluate(()=>[
  odgHaStralcio({sceneggiatura:[{n:'92'},{n:'2'}]}, '92pt2'), odgHaStralcio({sceneggiatura:[{n:'92'}]}, '92Pt'),
  odgHaStralcio({sceneggiatura:[{n:'58'}]}, '58END'), odgHaStralcio({sceneggiatura:[{n:'92'}]}, '93pt2'),
  odgHaStralcio({sceneggiatura:[{n:'2'}]}, '92pt2')]), [true,true,true,false,false]);

console.log('\n── il lettore ──');
await p.evaluate(s=>{
  window.currentUser=null;
  localStorage.setItem('cb_odg_io',JSON.stringify({nome:'S. Panetta',ruolo:'Microfonista',reparto:'SUONO'}));
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
  odgCorrente={numero:20,data:'2026-11-09',convocazione:'07.30',
    scene:[{n:'32END',sinossi:'Colonna osserva.',ids:'1, 19'},
           {n:'33',sinossi:'La fattoria.',ids:'1, 2'},
           {n:'65C',sinossi:'La camionetta.',ids:'7'},
           {n:'99',sinossi:'Senza stralcio.'}],
    sceneggiatura:s};
  switchResultTab('odg');
}, sc.scene);
await p.waitForTimeout(250);
ok('tre scene apribili su quattro', await p.evaluate(()=>document.querySelectorAll('.odg-scene li.apre').length), 3);
await p.evaluate(()=>odgApriScena('33'));
await p.waitForTimeout(400);
ok('si apre',          await p.evaluate(()=>getComputedStyle(document.getElementById('odgScena')).display), 'flex');
ok('ci sono tutte e tre', await p.evaluate(()=>document.querySelectorAll('.sc-sez').length), 3);
ok('le scorciatoie in alto', await p.evaluate(()=>[...document.querySelectorAll('.sc-tab')].map(e=>e.textContent)), ['32','33','65C']);
ok('quella aperta è segnata', await p.evaluate(()=>document.querySelector('.sc-tab.on').textContent), '33');
ok('è in cima',        await p.evaluate(()=>{
  const b=document.querySelector('.sc-foglio'), e=document.getElementById('sc-33');
  return Math.abs((e.offsetTop-b.offsetTop) - b.scrollTop) < 6;}), true);
ok('si può scorrere',  await p.evaluate(()=>{
  const b=document.querySelector('.sc-foglio'); return b.scrollHeight > b.clientHeight;}), true);
ok('la battuta è rientrata rispetto all\'azione', await p.evaluate(()=>{
  const a=document.querySelector('.b-azione').getBoundingClientRect().left;
  const d=document.querySelector('.b-battuta').getBoundingClientRect().left;
  return d > a + 10;}), true);
ok('e il nome più dentro ancora', await p.evaluate(()=>{
  const d=document.querySelector('.b-battuta').getBoundingClientRect().left;
  const c=document.querySelector('.b-chi').getBoundingClientRect().left;
  return c > d;}), true);

console.log('\n── 32END porta alla 32 ──');
await p.evaluate(()=>odgChiudiScena());
await p.evaluate(()=>odgApriScena('32END'));
await p.waitForTimeout(400);
ok('scena giusta', await p.evaluate(()=>document.querySelector('.sc-tab.on').textContent), '32');
await p.evaluate(()=>odgVaiScena('65C'));
await p.waitForTimeout(500);
ok('salto a un\'altra scena', await p.evaluate(()=>document.querySelector('.sc-tab.on').textContent), '65C');
await p.click('.sc-x'); await p.waitForTimeout(150);
ok('si chiude', await p.evaluate(()=>getComputedStyle(document.getElementById('odgScena')).display), 'none');

console.log('\n── l\'OdG sopravvive alla chiusura dell\'app ──');
await p.evaluate(()=>{odgCorrente.nomeFile='MSG.pdf';odgSalva(odgCorrente)});
ok('scritto sul telefono', await p.evaluate(()=>!!localStorage.getItem('cb_odg')), true);
ok('con la sceneggiatura', await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_odg')).sceneggiatura.length), 3);
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(800);
await p.evaluate(()=>{window.currentUser=null; odgRipristina();});
await p.waitForTimeout(300);
ok('ricaricato',     await p.evaluate(()=>odgCorrente && odgCorrente.numero), 20);
ok('con gli stralci',await p.evaluate(()=>odgCorrente.sceneggiatura.length), 3);

ok('nessun errore di pagina', err.filter(e=>!/supabase|pdf\.worker/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
