const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(86)+` atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})},
    from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[]}),
               single:async()=>({data:null}),maybeSingle:async()=>({data:null}),
               insert:async()=>({data:null}),upsert:async()=>({error:null}),
               delete(){return this},update(){return this},neq(){return this}}),
    storage:{from:()=>({upload:async()=>({}),download:async()=>({})})}
  })};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);

console.log('\n── come la produzione scrive il tuo nome ──');
const io={nome:'Simone',cognome:'Panetta'};
for(const [stampato,atteso] of [
  ['Simone Panetta',true],['PANETTA Simone',true],['Panetta Simone',true],
  ['S. Panetta',true],['S.Panetta',true],['Panetta S.',true],
  ['  simone   panetta  ',true],['Simóne Panétta',true],
  ['Panetta Simone - Microfonista',true],
  ['Marco Panetti',false],['Simone Rossi',false],['Luca Panetta',false],
  ['Panetta',false],['',false]])
  ok(JSON.stringify(stampato), await p.evaluate(([s,i])=>nomeCorrisponde(s,i),[stampato,io]), atteso);

console.log('\n── doppi cognomi ──');
for(const [stampato,prof,atteso] of [
  ['D. De Marchi',{nome:'Daniele',cognome:'De Marchi'},true],
  ['De Marchi Daniele',{nome:'Daniele',cognome:'De Marchi'},true],
  ['D. Marchi',{nome:'Daniele',cognome:'De Marchi'},false],
  ['M. C. De Santis',{nome:'Maria',cognome:'De Santis'},true]])
  ok(JSON.stringify(stampato), await p.evaluate(([s,i])=>nomeCorrisponde(s,i),[stampato,prof]), atteso);

const troupe=[{reparto:'REGIA',ruolo:'Regista',nome:'L. Di Pasquale',set:'07.00'},
              {reparto:'SUONO',ruolo:'Microfonista',nome:'S. Panetta',set:'07.30'},
              {reparto:'SUONO',ruolo:'Fonico',nome:'D. De Marchi',set:'07.30'}];

console.log('\n── trovare la riga giusta ──');
ok('mi trova',       await p.evaluate(t=>{localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta'}));return profiloTrovaInTroupe(t)},troupe), 1);
ok('senza profilo',  await p.evaluate(t=>{localStorage.removeItem('cb_profilo');return profiloTrovaInTroupe(t)},troupe), -1);
ok('chi non c\'è',    await p.evaluate(t=>{localStorage.setItem('cb_profilo',JSON.stringify({nome:'Anna',cognome:'Bianchi'}));return profiloTrovaInTroupe(t)},troupe), -1);
ok('due omonimi → elenco', await p.evaluate(()=>{
    localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta'}));
    return profiloTrovaInTroupe([{nome:'S. Panetta'},{nome:'Simone Panetta'}])}), -1);

// ── nell'OdG ──
const apri=async()=>{await p.evaluate(t=>{
  window.currentUser=null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').style.display='block';
  odgForzaElenco=false;
  odgCorrente={numero:20,data:'2026-11-09',convocazione:'07.30',troupe:t};
  switchResultTab('odg');
},troupe);};

console.log('\n── primo avvio: la domanda sta all\'ingresso, non nell\'OdG ──');
await p.evaluate(()=>{localStorage.removeItem('cb_profilo');localStorage.removeItem('cb_odg_io')});
await apri();
ok('l\'OdG non chiede niente', await p.evaluate(()=>!document.querySelector('#odgCorpo .prof-chiedi')), true);
await p.evaluate(()=>profiloBenvenuto());
await p.waitForTimeout(150);
ok('la chiede il benvenuto',   await p.evaluate(()=>!!document.querySelector('#benvenuto .prof-chiedi')), true);
ok('tre campi',        await p.evaluate(()=>['profNome','profCognome','profReparto'].every(i=>document.getElementById(i))), true);

console.log('\n── compilo: la lista diventa una conferma sola ──');
await p.fill('#profNome','Simone'); await p.fill('#profCognome','Panetta');
await p.selectOption('#profReparto','Suono');
await p.click('.prof-chiedi .ok'); await p.waitForTimeout(250);
await apri();
ok('profilo salvato',  await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_profilo')).cognome), 'Panetta');
ok('chiede "Sei tu?"', await p.evaluate(()=>document.querySelector('.odg-chi .t').textContent.trim()), 'Sei tu?');
ok('una riga sola',    await p.evaluate(()=>document.querySelectorAll('.odg-chi .el .riga').length), 1);
ok('ed è la mia',      await p.evaluate(()=>document.querySelector('.odg-chi .n').textContent.trim()), 'S. Panetta');

console.log('\n── confermo ──');
await p.click('.odg-chi .sino .si'); await p.waitForTimeout(200);
ok('badge',            await p.evaluate(()=>document.querySelector('.odg-badge .r').textContent.trim()), 'Microfonista · SUONO');
ok('orario mio',       await p.evaluate(()=>document.querySelector('.odg-badge .o').textContent.trim()), '07.30');
ok('memorizza la grafia del documento',
                       await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_odg_io')).nome), 'S. Panetta');

console.log('\n── "non sono io" riapre l\'elenco intero ──');
await p.evaluate(()=>{localStorage.removeItem('cb_odg_io');odgForzaElenco=false;odgRender()});
await p.click('.odg-chi .sino .no'); await p.waitForTimeout(200);
ok('elenco completo',  await p.evaluate(()=>document.querySelectorAll('.odg-chi .el button').length), 3);

console.log('\n── se il nome non compare, elenco e spiegazione ──');
await p.evaluate(()=>{localStorage.setItem('cb_profilo',JSON.stringify({nome:'Anna',cognome:'Bianchi'}));
  localStorage.removeItem('cb_odg_io');odgForzaElenco=false;odgRender()});
ok('elenco completo',  await p.evaluate(()=>document.querySelectorAll('.odg-chi .el button').length), 3);
ok('dice perché',      await p.evaluate(()=>/Anna Bianchi non compare/.test(document.querySelector('.odg-chi .s').textContent)), true);

console.log('\n── nelle impostazioni ──');
await p.evaluate(()=>{localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
  showPage('settings')});
await p.waitForTimeout(200);
ok('riga riassunto',   await p.evaluate(()=>document.querySelector('#profRiga .settings-row-label').textContent.trim()), 'Simone Panetta');
ok('reparto',          await p.evaluate(()=>/Suono/.test(document.querySelector('#profRiga .settings-row-desc').textContent)), true);
await p.evaluate(()=>profiloApri()); await p.waitForTimeout(150);
ok('si apre il modulo',await p.evaluate(()=>!!document.querySelector('#profForm .prof-chiedi')), true);
ok('precompilato',     await p.evaluate(()=>document.getElementById('profCognome').value), 'Panetta');

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
