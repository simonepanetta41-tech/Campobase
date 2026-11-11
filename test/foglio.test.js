const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
const fs=require('fs');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(94)+` atteso ${JSON.stringify(exp)}`);};
/* I PDF veri stanno in test/dati/, che git non guarda: dentro un ordine
   del giorno c'e' la lista della troupe. Prima venivano letti dalla
   cartella degli allegati di una conversazione, che fuori da quella non
   esiste. */
const A = require('path').join(__dirname, 'dati') + '/';
const STRALCI = A + 'MSG_-_Stralci_DAY_20.pdf';
const GIRI    = A + '20_MSG_-_GIRI_AUTO_di_Lunedi_09.11.pdf';
for (const f of [STRALCI, GIRI]) if (!fs.existsSync(f)) {
  console.log('ok — saltato: manca ' + f); process.exit(0);
}

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(25000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in:async()=>({data:[]}),order(){return this},
             limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);
await p.addScriptTag({content:fs.readFileSync(require.resolve('pdfjs-dist/build/pdf.js'),'utf8')});
await p.evaluate(w=>{const b=new Blob([w],{type:'application/javascript'});
  window.pdfjsLib.GlobalWorkerOptions.workerSrc=URL.createObjectURL(b);},
  fs.readFileSync(require.resolve('pdfjs-dist/build/pdf.worker.js'),'utf8'));

console.log('\n── TRASFERIMENTO e DRONE UNIT sono stacchi, non scene ──');
for (const [etichetta, riga, atteso] of [
  ['marcata dal modello', {n:'',nota:'TRASFERIMENTO'}, 'TRASFERIMENTO'],
  ['finita nella colonna del numero', {n:'DRONE UNIT'}, 'DRONE UNIT'],
  ['finita nella sinossi', {n:'',sinossi:'Second Unit'}, 'SECOND UNIT'],
  ['una scena vera resta una scena', {n:'65C',sinossi:'La camionetta'}, null],
  ['e una con la parola dentro pure', {n:'33',sinossi:'Trasferimento in auto fino alla fattoria'}, null],
]) ok(etichetta, await p.evaluate(s=>odgStacco(s), riga), atteso);

console.log('\n── e a schermo stanno su una riga loro ──');
await p.evaluate(()=>{
  window.currentUser=null;
  localStorage.setItem('cb_odg_io',JSON.stringify({nome:'S. Panetta',ruolo:'Microfonista',reparto:'SUONO'}));
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
  odgCorrente={numero:20,data:'2026-11-09',convocazione:'07.30',scene:[
    {n:'32END',sinossi:'Colonna osserva.',ids:'1, 19'},
    {n:'33',sinossi:'La fattoria.',ids:'1, 2'},
    {n:'',nota:'TRASFERIMENTO'},
    {n:'65C',sinossi:'La camionetta.',ids:'4'},
    {n:'',nota:'DRONE UNIT'},
    {n:'32PT',sinossi:'I campi.'}]};
  switchResultTab('odg');
});
await p.waitForTimeout(250);
ok('sei righe',       await p.evaluate(()=>document.querySelectorAll('.odg-scene li').length), 6);
ok('due stacchi',     await p.evaluate(()=>[...document.querySelectorAll('.odg-scene li.stacco')].map(e=>e.textContent)),
   ['TRASFERIMENTO','DRONE UNIT']);
ok('al posto giusto', await p.evaluate(()=>[...document.querySelectorAll('.odg-scene li')]
   .map(e=>e.classList.contains('stacco')?'—':e.querySelector('.n').textContent)),
   ['32END','33','—','65C','—','32PT']);
ok('non si aprono',   await p.evaluate(()=>[...document.querySelectorAll('.odg-scene li.stacco')]
   .every(e=>!e.classList.contains('apre'))), true);

console.log('\n── il piede della revisione non è sceneggiatura ──');
const buf=[...fs.readFileSync(STRALCI)];
const sc = await p.evaluate(async arr=>{
  const f=new File([new Uint8Array(arr)],'Stralci.pdf',{type:'application/pdf'});
  const r=await odgTestoDaPdf(f,true);
  return stralciDaRighe(r.righe);
}, buf);
ok('nessun "Blue Rev" nel testo', /blue\s*rev/i.test(JSON.stringify(sc)), false);
ok('nemmeno il numero di pagina in coda', await p.evaluate(s=>
  s.some(x=>x.blocchi.some(b=>/\b(Blue|Pink|Rev\.)\b/.test(b.t))), sc), false);
ok('le scene restano tre', sc.map(x=>x.n), ['32','33','65C']);
ok('ognuna sa la sua pagina', sc.map(x=>x.p), [1,2,4]);

console.log('\n── il PDF vero, non la ricostruzione ──');
await p.evaluate(async arr=>{
  const chiave=odgChiaveFile('Stralci.pdf');
  await cbFileSalva(chiave, new Uint8Array(arr).buffer);
  odgCorrente.sceneggiatura = window._sc;
  odgCorrente.allegati=[{nome:'Stralci.pdf',tipo:'stralci',testo:'…',file:chiave}];
}, buf);
await p.evaluate(s=>{window._sc=s; odgCorrente.sceneggiatura=s;}, sc);
await p.evaluate(()=>odgApriScena('33'));
await p.waitForTimeout(2500);
ok('si apre',        await p.evaluate(()=>getComputedStyle(document.getElementById('odgScena')).display), 'flex');
ok('è il PDF',       await p.evaluate(()=>!!document.querySelector('#odgScena .pdf-rullo')), true);
ok('quattro pagine', await p.evaluate(()=>document.querySelectorAll('.pdf-pag').length), 4);
ok('disegnate davvero', await p.evaluate(()=>[...document.querySelectorAll('.pdf-pag')].every(c=>c.width>600)), true);
ok('le scorciatoie di scena', await p.evaluate(()=>[...document.querySelectorAll('.sc-tab')].map(e=>e.textContent)),
   ['32','33','65C']);
ok('aperto sulla pagina della 33', await p.evaluate(()=>{
  const box=document.querySelector('.pdf-rullo'), el=document.getElementById('pdfpag-2');
  return Math.abs((el.offsetTop-box.offsetTop)-box.scrollTop)<6;}), true);
await p.evaluate(()=>odgVaiScena('65C',true)); await p.waitForTimeout(400);
ok('salto alla 65C → pagina 4', await p.evaluate(()=>{
  const box=document.querySelector('.pdf-rullo'), el=document.getElementById('pdfpag-4');
  return Math.abs((el.offsetTop-box.offsetTop)-box.scrollTop)<6;}), true);
ok('e la scorciatoia si accende', await p.evaluate(()=>document.querySelector('.sc-tab.on').textContent), '65C');
ok('si scorre',      await p.evaluate(()=>{const b=document.querySelector('.pdf-rullo');
  return b.scrollHeight>b.clientHeight}), true);
await p.evaluate(()=>odgChiudiScena());

console.log('\n── senza i byte si ripiega sulla ricostruzione ──');
await p.evaluate(()=>{odgCorrente.allegati[0].file='odg/non_esiste.pdf'});
await p.evaluate(()=>odgApriScena('33')); await p.waitForTimeout(600);
ok('niente PDF',     await p.evaluate(()=>!!document.querySelector('#odgScena .pdf-rullo')), false);
ok('ma la scena c\'è',await p.evaluate(()=>document.querySelectorAll('.sc-sez').length), 3);
await p.evaluate(()=>odgChiudiScena());

console.log('\n── anche i file si aprono come PDF ──');
await p.evaluate(()=>{odgCorrente.allegati[0].file=odgChiaveFile('Stralci.pdf')});
await p.evaluate(()=>odgApriFile(0)); await p.waitForTimeout(2500);
ok('il foglio vero', await p.evaluate(()=>document.querySelectorAll('.pdf-pag').length), 4);
ok('col suo nome',   await p.evaluate(()=>document.querySelector('#odgScena .sc-h').textContent), 'Stralci.pdf');
await p.evaluate(()=>odgChiudiScena());

console.log('\n── il pick-up si rilegge dai giri, non si eredita ──');
const giri=[...fs.readFileSync(GIRI)];
const testoGiri = await p.evaluate(async arr=>{
  const f=new File([new Uint8Array(arr)],'Giri.pdf',{type:'application/pdf'});
  // Come fa l'app: per i giri auto si usa la forma appiattita, non quella
  // rimessa in righe — in quella tabella una riga logica sta su piu' righe
  // fisiche e separarle le allontana invece di unirle.
  return (await odgTestoDaPdf(f, true)).piatto;
}, giri);
ok('dal testo vero: 07.00', await p.evaluate(t=>odgPickUp(t,{nome:'Simone',cognome:'Panetta'}).ora, testoGiri), '07.00');
/* I compagni di furgone si controllano nella forma, non nel nome.
 *
 * Questo controllo legge il PDF vero, e un PDF non si puo' anonimizzare
 * come un file di testo: i nomi che escono sono quelli della troupe. La
 * cosa da verificare comunque non e' chi c'era quel giorno — e' che il
 * lettore sappia tenere insieme le particelle ("D.De Marchi" e' un nome
 * solo, non due) e sappia togliere me stesso dall'elenco. */
const conMe = await p.evaluate(t=>odgPickUp(t,{nome:'Simone',cognome:'Panetta'}).conMe, testoGiri);
ok('due compagni di furgone', conMe.length, 2);
ok('con le particelle tenute insieme', conMe.some(n => /^[A-Z]\.\s?(?:De|Di|Del|La)\s\S/.test(n)), true);
ok('e senza me stesso',       conMe.some(n => /Panetta/i.test(n)), false);
ok('e il posto intero',     await p.evaluate(t=>odgPickUp(t,{nome:'Simone',cognome:'Panetta'}).luogo, testoGiri),
   'TURSPORT HOTEL RESIDENCE');
await p.evaluate(t=>{
  localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
  localStorage.setItem('cb_odg', JSON.stringify({numero:20,data:'2026-11-09',
    giriTesto:t, pickup:{ora:'07.30',luogo:'URSPORT HOTEL RESIDENCE'}, scene:[]}));
  window.currentUser=null;
}, testoGiri);
await p.evaluate(()=>odgRipristina());
await p.waitForTimeout(300);
ok('un OdG vecchio si corregge da solo', await p.evaluate(()=>odgCorrente.pickup.ora), '07.00');
ok('e anche il posto',                   await p.evaluate(()=>odgCorrente.pickup.luogo), 'TURSPORT HOTEL RESIDENCE');

ok('nessun errore di pagina', err.filter(e=>!/supabase|pdf\.worker/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
