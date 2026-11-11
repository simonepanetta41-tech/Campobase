const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(94)+` atteso ${JSON.stringify(exp)}`);};
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
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);
await p.evaluate(()=>{
  window.currentUser=null;
  localStorage.setItem('cb_odg_io',JSON.stringify({nome:'S. Panetta',ruolo:'Microfonista',reparto:'SUONO',partenza:'07.30',set:''}));
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
});

const mostra = (odg) => p.evaluate(d=>{odgCorrente=d;switchResultTab('odg')}, odg);
const riga = (partenza, set) => [{nome:'S. Panetta',ruolo:'Microfonista',reparto:'SUONO',partenza,set}];
const BASE = {numero:20,data:'2026-11-09',convocazione:'07.30',
  location:'Masseria Lamie, Strada Vicinale Citrezze, Monteiasi', scene:[],
  troupe: riga('07.30','')};

console.log('\n── l\'ora di partenza la dicono i giri auto ──');
await mostra({...BASE, pickup:{ora:'07.00',luogo:'TURSPORT HOTEL RESIDENCE'}});
await p.waitForTimeout(200);
ok('il numero grande è la convocazione', await p.evaluate(()=>document.querySelector('.odg-badge .o').textContent), '07.30');
ok('e sotto c\'è il pick-up vero', await p.evaluate(()=>document.querySelector('.odg-badge .p').textContent), 'pick-up 07.00');
ok('non dice più partenza 07.30', await p.evaluate(()=>/partenza/.test(document.querySelector('.odg-badge').textContent)), false);

console.log('\n── senza giri auto vale la convocazione troupe ──');
await mostra({...BASE, troupe: riga('06.30','07.30')});
await p.waitForTimeout(150);
ok('la partenza della tabella', await p.evaluate(()=>document.querySelector('.odg-badge .p')?.textContent||''), 'partenza 06.30');
await mostra({...BASE});
await p.waitForTimeout(150);
ok('se coincide col grande, non si ripete', await p.evaluate(()=>!document.querySelector('.odg-badge .p')), true);
await mostra({...BASE, troupe: riga('Vedi GA','07.30')});
await p.waitForTimeout(150);
ok('"Vedi GA" non è un orario', await p.evaluate(()=>!document.querySelector('.odg-badge .p')), true);
ok('e il set resta il numero grande', await p.evaluate(()=>document.querySelector('.odg-badge .o').textContent), '07.30');

console.log('\n── il pick-up uguale al set non si ripete ──');
await mostra({...BASE, pickup:{ora:'07.30'}});
await p.waitForTimeout(150);
ok('una riga sola', await p.evaluate(()=>!document.querySelector('.odg-badge .p')), true);

console.log('\n── dove parcheggiare, solo se non c\'è il passaggio ──');
await mostra({...BASE});
await p.waitForTimeout(150);
ok('c\'è', await p.evaluate(()=>!!document.querySelector('.odg-posto[href*="parcheggio"]')), true);
ok('e cerca accanto al campo base', await p.evaluate(()=>
  decodeURIComponent(document.querySelector('.odg-posto[href*="parcheggio"]').href).includes('parcheggio vicino a Masseria Lamie')), true);
await mostra({...BASE, pickup:{ora:'07.00',luogo:'TURSPORT'}});
await p.waitForTimeout(150);
ok('col van non serve', await p.evaluate(()=>!document.querySelector('.odg-posto[href*="parcheggio"]')), true);
ok('ma il campo base resta', await p.evaluate(()=>
  [...document.querySelectorAll('#odgCorpo .odg-posto')].some(e=>/Campo base/.test(e.textContent))), true);

console.log('\n── i due tasti in fondo all\'OdG ──');
await mostra({...BASE});
await p.waitForTimeout(150);
const larg = await p.evaluate(()=>{
  const f=document.querySelector('.odg-fondo'), b=[...f.children];
  const c=f.getBoundingClientRect();
  return b.map(e=>{const r=e.getBoundingClientRect();
    return [Math.round(r.width), Math.round((r.left-c.left)-(c.right-r.right))];});
});
ok('sono due',            larg.length, 2);
ok('della stessa misura', larg[0][0] === larg[1][0], true);
ok('circa la metà',       larg[0][0] > 140 && larg[0][0] < 0.75*390, true);
ok('centrati',            larg.every(x=>Math.abs(x[1])<=1), true);

console.log('\n── il cast si cerca su IMDb ──');
await mostra({...BASE, cast:[
  {id:'1', interprete:'Rocco Maffei', ruolo:'Colonna', scene:'32, 33', pickup:'06.45', set:'07.30'},
  {id:'19', interprete:'Marcello Romolo', ruolo:'Nino', scene:'32', set:'07.30'},
  {id:'2', interprete:'Marco D\u2019Amore', ruolo:'Ingegner Ranieri', scene:'65C', set:'08.00'},
  {id:'1FS', interprete:'Figurazione speciale', ruolo:'Passante', scene:'33'},
  {id:'3', interprete:'', ruolo:'Bambino', scene:'33'}]});
await p.waitForTimeout(200);
ok('cinque righe',       await p.evaluate(()=>document.querySelectorAll('.odg-att').length), 5);
ok('tre si cercano',     await p.evaluate(()=>document.querySelectorAll('.odg-att.cerca').length), 3);
ok('la figurazione no',  await p.evaluate(()=>
  [...document.querySelectorAll('.odg-att')].filter(e=>/Figurazione|Bambino/.test(e.textContent))
    .every(e=>!e.classList.contains('cerca'))), true);
ok('e si vede che si apre',  await p.evaluate(()=>
  !!document.querySelector('.odg-att.cerca .chev')), true);

console.log('\n── la scheda dell\'attore, senza uscire dall\'app ──');
await p.evaluate(()=>{
  window.analysisData = {totale_scene:184, personaggi_scene:{
    COLONNA:['7','12','32','33','65C'], 'INGEGNER RANIERI':['65C']}};
  odgCorrente.sceneggiatura=[{n:'32',testa:'EST. CAMPI - GIORNO',blocchi:[{k:'azione',t:'x'}],p:1}];
  odgApriAttore('1');});
await p.waitForTimeout(400);
ok('si apre dentro l\'app',  await p.evaluate(()=>getComputedStyle(document.getElementById('odgScena')).display), 'flex');
ok('il nome in testa',       await p.evaluate(()=>document.querySelector('#odgScena .sc-n').textContent), 'Rocco Maffei');
ok('personaggio e ID sotto', await p.evaluate(()=>document.querySelector('#odgScena .sc-h').textContent), 'Colonna · ID 1');
ok('gli orari di oggi',      await p.evaluate(()=>[...document.querySelectorAll('.at-ore .v')].map(e=>e.textContent)), ['06.45','07.30']);
ok('le scene di oggi',       await p.evaluate(()=>[...document.querySelectorAll('.sp-scene .sp-sc')].map(e=>e.textContent)), ['32','33']);
ok('la 32 si apre, la 33 no',await p.evaluate(()=>[...document.querySelectorAll('.sp-scene .sp-sc')].map(e=>e.tagName)), ['BUTTON','SPAN']);
ok('quante nel film',        await p.evaluate(()=>document.querySelector('.at-tot').textContent.trim()), '5 scene su 184');
ok('e quali',                await p.evaluate(()=>document.querySelector('.at-elenco').textContent), '7 · 12 · 32 · 33 · 65C');
ok('IMDb resta in fondo',    await p.evaluate(()=>
  decodeURIComponent(document.querySelector('.at-imdb').href)), 'https://www.imdb.com/find/?s=nm&q=Rocco Maffei');
ok('senza rete non si lamenta', await p.evaluate(()=>!document.querySelector('.at-wiki')), true);
await p.evaluate(()=>odgChiudiScena()); await p.waitForTimeout(150);
ok('si chiude',              await p.evaluate(()=>getComputedStyle(document.getElementById('odgScena')).display), 'none');

console.log('\n── un attore che non c\'è nello spoglio ──');
await p.evaluate(()=>odgApriAttore('19'));
await p.waitForTimeout(300);
ok('niente sezione del film', await p.evaluate(()=>!document.querySelector('.at-tot')), true);
ok('ma la giornata sì',       await p.evaluate(()=>!!document.querySelector('.at-ore')), true);
await p.evaluate(()=>odgChiudiScena());

console.log('\n── Wikipedia: due righe e la faccia ──');
await p.route('**it.wikipedia.org/w/api.php**', r=>r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({query:{pages:{'123':{title:'Rocco Maffei',
    extract:'Rocco Maffei è un attore, regista e cantautore italiano. Ha esordito nel 1988. Terza frase da tagliare.',
    thumbnail:{source:'https://upload.wikimedia.org/x.jpg'}}}}})}));
await p.evaluate(()=>{localStorage.removeItem('cb_wiki');odgApriAttore('1')});
await p.waitForTimeout(600);
ok('arriva il riquadro',  await p.evaluate(()=>!!document.querySelector('.at-wiki')), true);
ok('due frasi, non tre',  await p.evaluate(()=>document.querySelector('.at-wiki p').textContent),
   'Rocco Maffei è un attore, regista e cantautore italiano. Ha esordito nel 1988.');
ok('con la faccia',       await p.evaluate(()=>document.querySelector('.at-wiki img').src), 'https://upload.wikimedia.org/x.jpg');
ok('e il credito',        await p.evaluate(()=>document.querySelector('.at-wiki a').textContent.trim()), 'Wikipedia ↗');
/* La memoria porta un numero di versione: quando cambia il modo di
   scegliere la pagina, quella vecchia si butta invece di restare li' con
   dentro una descrizione sbagliata. */
ok('ricordato sul telefono', await p.evaluate(()=>{
  const m = JSON.parse(localStorage.getItem('cb_wiki'));
  return !!(m && m.v && m.voci && m.voci['Rocco Maffei']);}), true);
await p.evaluate(()=>odgChiudiScena());

console.log('\n── un omonimo che non è un attore non entra ──');
await p.route('**it.wikipedia.org/w/api.php**', r=>r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({query:{pages:{'9':{title:'Marco D\u2019Amore (calciatore)',
    extract:'Marco D\u2019Amore è un calciatore italiano, centrocampista.'}}}})}));
await p.evaluate(()=>{localStorage.removeItem('cb_wiki');odgApriAttore('2')});
await p.waitForTimeout(600);
ok('scartato',   await p.evaluate(()=>!document.querySelector('.at-wiki')), true);
ok('ma la scheda resta', await p.evaluate(()=>document.querySelector('#odgScena .sc-n').textContent), 'Marco D’Amore');
await p.evaluate(()=>odgChiudiScena());

console.log('\n── se Wikipedia non risponde, niente di rotto ──');
await p.route('**it.wikipedia.org/w/api.php**', r=>r.abort());
await p.evaluate(()=>{localStorage.removeItem('cb_wiki');odgApriAttore('1')});
await p.waitForTimeout(500);
ok('la scheda c\'è lo stesso', await p.evaluate(()=>!!document.querySelector('.at-ore')), true);
ok('e non si ricorda il buco', await p.evaluate(()=>localStorage.getItem('cb_wiki')), null);
await p.evaluate(()=>odgChiudiScena());

console.log('\n── interno/esterno su un piano italiano ──');
for (const [ie,m,att] of [
  ['EST','G','type-ext-day'], ['EST','N','type-ext-night'],
  ['INT','G','type-int-day'], ['INT','N','type-int-night'],
  ['EXT','D','type-ext-day'], ['INT','D','type-int-day'],
  ['I/E','G','type-mixed'],   ['EST','T','type-morning'],
  ['','',  'type-mixed'],
]) ok(`${ie||'—'} ${m||'—'}`, await p.evaluate(a=>getPdlSceneTypeClass(a[0],a[1]), [ie,m]), att);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
