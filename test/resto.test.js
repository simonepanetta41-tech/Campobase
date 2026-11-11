const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(88)+` atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in:async()=>({data:[]}),order(){return this},
             limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);
await p.evaluate(()=>{
  window.currentUser={id:'u1',email:'x@y.z'};
  localStorage.setItem('cb_profilo',JSON.stringify({nome:'S',cognome:'P',reparto:'Suono'}));
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
});

console.log('\n── Piano: stato vuoto nella grafica nuova ──');
await p.evaluate(()=>{document.getElementById('resultsPage').classList.add('on');
  document.getElementById('homePage').style.display='none'; switchResultTab('piano');
  document.getElementById('pdlUploadArea').style.display='';});
await p.waitForTimeout(200);
ok('parla come l\'OdG', await p.evaluate(()=>!!document.querySelector('#pdlUploadArea .odg-vuoto')), true);
ok('titolo',   await p.evaluate(()=>document.querySelector('#pdlUploadArea .odg-t').textContent), 'Nessun piano di lavorazione');
ok('dice cosa ci si guadagna', await p.evaluate(()=>/calendario si riempie/.test(document.querySelector('#pdlUploadArea .odg-s').textContent)), true);
ok('niente icona bianca fuori tavolozza', await p.evaluate(()=>
  !/#f0e040|fill="#fff"/.test(document.getElementById('pdlUploadArea').innerHTML)), true);
ok('si può caricare', await p.evaluate(()=>!!document.querySelector('#pdlUploadArea input[type=file]')), true);

console.log('\n── la riga del progetto si completa col piano ──');
await p.evaluate(()=>{
  renderHistoryGrid([{id:'a1',created_at:'2026-11-02T10:00:00Z',version_label:'v1',
                      data:{titolo:'Missione San Gennaro',totale_scene:184}}]);
});
ok('prima: scene e data', await p.evaluate(()=>document.querySelector('.prog .s').textContent), '184 scene · 2 nov');
ok('la riga porta l\'id',  await p.evaluate(()=>document.querySelector('.prog').dataset.id), 'a1');
await p.evaluate(()=>{
  // come se il piano fosse arrivato dal cloud
  const el=document.querySelector('.prog[data-id="a1"] .s');
  const p={data:{totale_giorni:37,produzione:'Cattleya'},shooting_data:{1:{status:'complete'},2:{status:'complete'},3:{status:'pending'}}};
  const girate=Object.values(p.shooting_data).filter(x=>x&&x.status==='complete').length;
  el.textContent=[p.data.totale_giorni+' giorni',girate+' girati',p.data.produzione].join(' · ');
});
ok('dopo: giorni, girati, produzione', await p.evaluate(()=>document.querySelector('.prog .s').textContent), '37 giorni · 2 girati · Cattleya');

console.log('\n── analisi in corso ──');
ok('la schermata c\'è',  await p.evaluate(()=>!!document.getElementById('progressPanel')), true);
ok('niente Gennaro nei passaggi', await p.evaluate(()=>!/Gennaro/.test(document.getElementById('progressPanel').innerText)), true);
ok('quattro passaggi',  await p.evaluate(()=>document.querySelectorAll('.prog-step').length), 4);
ok('dice che si può chiudere', await p.evaluate(()=>/puoi chiudere l'app/i.test(document.querySelector('.an-nota').textContent)), true);
ok('la barra si muove', await p.evaluate(()=>{setStep(3);return document.getElementById('progFill').style.width}), '66.6667%');

console.log('\n── pagina di errore ──');
await p.evaluate(()=>mostraErrore('Il file si apre, ma dentro non c\'è testo.','MSG.pdf\n37 pagine · 12 caratteri estratti'));
await p.waitForTimeout(200);
ok('si apre',        await p.evaluate(()=>getComputedStyle(document.getElementById('errorePagina')).display!=='none'), true);
ok('titolo',         await p.evaluate(()=>document.getElementById('erroreTit').textContent), 'Non sono riuscito a leggerlo');
ok('spiega',         await p.evaluate(()=>/non c'è testo/.test(document.getElementById('erroreTesto').textContent)), true);
ok('mostra i numeri',await p.evaluate(()=>/37 pagine · 12 caratteri/.test(document.getElementById('erroreDett').textContent)), true);
ok('copre le altre pagine', await p.evaluate(()=>
  getComputedStyle(document.getElementById('homePage')).display==='none' &&
  !document.getElementById('resultsPage').classList.contains('on')), true);
await p.click('#errorePagina .odg-btn'); await p.waitForTimeout(200);
ok('si chiude e torna ai progetti', await p.evaluate(()=>
  getComputedStyle(document.getElementById('errorePagina')).display==='none' &&
  getComputedStyle(document.getElementById('homePage')).display!=='none'), true);

console.log('\n── senza dettaglio non lascia il riquadro vuoto ──');
await p.evaluate(()=>mostraErrore('Qualcosa non va.','', 'Errore'));
ok('riquadro nascosto', await p.evaluate(()=>getComputedStyle(document.getElementById('erroreDett')).display), 'none');
await p.evaluate(()=>chiudiErrore());

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
