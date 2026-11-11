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
