const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(92)+` atteso ${JSON.stringify(exp)}`);};
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
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
  window.analysisData=analysisData={totale_scene:184, personaggi_scene:{
    COLONNA:['7','12','18','32','33','65C'], ASSUNTA:['12','33'], "INGEGNER RANIERI":['65C']},
    cast_provvisorio:[{character_id:4,nome:"L'AVVOCATO",pose_stimate:3}]};
  window.castData=castData=[
    {character_id:1,id_ufficiale:'1',nome:'COLONNA',fonte:'ufficiale'},
    {character_id:2,id_ufficiale:'2',nome:'ASSUNTA',fonte:'ufficiale',minore:true},
    {character_id:3,id_ufficiale:'3',nome:'INGEGNER RANIERI',fonte:'ufficiale'},
    {character_id:4,id_ufficiale:'4',nome:"L'AVVOCATO",fonte:'ufficiale'}];
  odgCorrente={numero:20,data:'2026-11-09',scene:[],cast:[
    {id:'1',interprete:'Rocco Maffei',ruolo:'Colonna',scene:'32, 33',pickup:'06.45',set:'07.30'}]};
  renderCastTab(castData,false); switchResultTab('cast');
});
await p.waitForTimeout(250);

console.log('\n── il titolo davanti al nome non deve far perdere il conto ──');
const prova = await p.evaluate(()=>{
  // come li scrive la produzione, e come li scrive la sceneggiatura
  window.analysisData=analysisData={totale_scene:184, personaggi_scene:{
    COLONNA:['1','2','3','4','5','6','7','8','9','10','11','12'],
    NAVARRA:['1','2','3'], 'TERESA NAVARRA':['4','5','6','7','8','9','10','11','12','13','14'],
    MAZZACANE:['2','3'], ASCALESI:['9'], BUONOCORE:['3','4'],
    'LA VOLPE':['1','2','3','4','5','6'], BARONESSA:['7'],
    'IL MONACO':['1','2','3'], CAPECE:['1','2','3','4','5'],
    'INGEGNER RANIERI':['6','7']}};
  const nomi=['PRINCIPE COLONNA','GIUSEPPE NAVARRA','COLONNELLO CIRO MAZZACANE','TERESA NAVARRA',
    'CARDINALE ASCALESI','SINDACO GIUSEPPE BUONOCORE','LA VOLPE','BARONESSA','IL MONACO',
    'CAPECE','ING. RANIERI'];
  const m=personaggiConta(nomi);
  return nomi.map(n=>[n, m.get(n)?m.get(n).n:null]);
});
ok('PRINCIPE COLONNA → COLONNA',       prova[0], ['PRINCIPE COLONNA',12]);
ok('GIUSEPPE NAVARRA prende NAVARRA',  prova[1], ['GIUSEPPE NAVARRA',3]);
ok('e TERESA resta la sua',            prova[3], ['TERESA NAVARRA',11]);
ok('COLONNELLO CIRO MAZZACANE',        prova[2], ['COLONNELLO CIRO MAZZACANE',2]);
ok('CARDINALE ASCALESI',               prova[4], ['CARDINALE ASCALESI',1]);
ok('SINDACO GIUSEPPE BUONOCORE',       prova[5], ['SINDACO GIUSEPPE BUONOCORE',2]);
ok('LA VOLPE si chiama cosi\'',        prova[6], ['LA VOLPE',6]);
ok('BARONESSA pure',                   prova[7], ['BARONESSA',1]);
ok('IL MONACO pure',                   prova[8], ['IL MONACO',3]);
ok('CAPECE senza titoli',              prova[9], ['CAPECE',5]);
ok('ING. RANIERI → INGEGNER RANIERI',  prova[10], ['ING. RANIERI',2]);

console.log('\n── mezzo nome per uno ──');
const mezzi = await p.evaluate(()=>{
  analysisData.personaggi_scene={
    'IL PRINCIPE':['1','2','3','4','5','6','7','8'],   // la lista dice PRINCIPE COLONNA
    'CIRO':['2','3','9'],                               // la lista dice COLONNELLO CIRO MAZZACANE
    NAVARRA:['1','2','3'], 'TERESA NAVARRA':['4','5']};
  const nomi=['PRINCIPE COLONNA','COLONNELLO CIRO MAZZACANE','GIUSEPPE NAVARRA','TERESA NAVARRA'];
  const m=personaggiConta(nomi);
  return [nomi.map(n=>m.get(n)?m.get(n).n:null), m.restanti];
});
ok('PRINCIPE COLONNA ↔ IL PRINCIPE',  mezzi[0][0], 8);
ok('…CIRO MAZZACANE ↔ CIRO',          mezzi[0][1], 3);
ok('GIUSEPPE NAVARRA ↔ NAVARRA',      mezzi[0][2], 3);
ok('TERESA resta sua',                mezzi[0][3], 2);
ok('e non avanza niente',             mezzi[1], []);

console.log('\n── il film vero: nome e cognome girati, e un secondo Ciro ──');
const vero = await p.evaluate(()=>{
  analysisData.personaggi_scene={
    'COLONNA STEFANO':['1','2','3','4','5','6','7'], 'MAZZACANE CIRO':['4','5'],
    'SUORA ANZIANA':['6','7'], 'TERESA NAVARRA':['8','9'], NAVARRA:['1','2','3','4'],
    'DON CIRO':['11','12','13']};
  // la lista provvisoria del primo giro li chiama in un terzo modo ancora
  analysisData.cast_provvisorio=[{character_id:1,nome:'IL PRINCIPE',pose_stimate:30},
                                 {character_id:2,nome:'IL COLONNELLO',pose_stimate:9}];
  const nomi=['PRINCIPE COLONNA','GIUSEPPE NAVARRA','COLONNELLO CIRO MAZZACANE','TERESA NAVARRA','DON CIRO'];
  const m=personaggiConta(nomi);
  return [nomi.map(n=>m.get(n)?m.get(n).n:null), m.restanti];
});
ok('PRINCIPE COLONNA ↔ COLONNA STEFANO',       vero[0][0], 7);
ok('…CIRO MAZZACANE ↔ MAZZACANE CIRO',          vero[0][2], 2);
ok('e il secondo Ciro resta suo',               vero[0][4], 3);
ok('la lista provvisoria non entra nel conto',  vero[0][0], 7);
ok('Teresa e Giuseppe stanno al loro posto',    [vero[0][1],vero[0][3]], [4,2]);
ok('fuori solo chi la lista non ha',            vero[1], ['SUORA ANZIANA']);
await p.evaluate(()=>{delete analysisData.cast_provvisorio});

console.log('\n── quello che la lista non ha si dice ──');
ok('elencato a parte', await p.evaluate(()=>{
  analysisData.personaggi_scene={COLONNA:['1','2'], 'VOCE AL TELEFONO':['5','6'], STRILLONE:['7','8']};
  const m=personaggiConta(['PRINCIPE COLONNA']);
  return m.restanti;}), ['VOCE AL TELEFONO','STRILLONE']);

console.log('\n── ma due candidati non si tirano a sorte ──');
ok('NAVARRA da solo non si assegna', await p.evaluate(()=>{
  analysisData.personaggi_scene={NAVARRA:['1','2','3']};
  const m=personaggiConta(['GIUSEPPE NAVARRA','TERESA NAVARRA']);
  return [m.has('GIUSEPPE NAVARRA'), m.has('TERESA NAVARRA')];}), [false,false]);
ok('e nemmeno un cognome ripetuto', await p.evaluate(()=>{
  analysisData.personaggi_scene={ESPOSITO:['1','2','3']};
  const m=personaggiConta(['MARIA ESPOSITO','ANTONIO ESPOSITO']);
  return [m.has('MARIA ESPOSITO'), m.has('ANTONIO ESPOSITO')];}), [false,false]);

console.log('\n── la pagina Cast dice quante scene fa ognuno ──');
await p.evaluate(()=>{window.analysisData=analysisData={totale_scene:184, personaggi_scene:{
    COLONNA:['7','12','18','32','33','65C'], ASSUNTA:['12','33'], "INGEGNER RANIERI":['65C']},
    cast_provvisorio:[{character_id:4,nome:"L'AVVOCATO",pose_stimate:3}]};
  renderCastTab(castData,false);});
await p.waitForTimeout(200);
ok('quattro righe',   await p.evaluate(()=>document.querySelectorAll('#castTableWrap .odg-att').length), 4);
ok('i conteggi',      await p.evaluate(()=>[...document.querySelectorAll('.cast-n')].map(e=>e.textContent)),
   ['6sc','2sc','1sc']);
ok('le pose stimate non sono scene', await p.evaluate(()=>
  [...document.querySelectorAll('#castTableWrap .odg-att')].pop().querySelector('.cast-n')), null);
ok('e la scheda dice lo stesso', await p.evaluate(()=>{
  castApri('1'); const t=document.querySelector('.at-tot').textContent.trim(); odgChiudiScena(); return t;}),
  '6 scene su 184');
ok('l\'interprete dall\'OdG', await p.evaluate(()=>document.querySelector('#castTableWrap .odg-att .s')?.textContent), 'Rocco Maffei');
ok('solo per chi l\'OdG ha detto', await p.evaluate(()=>document.querySelectorAll('#castTableWrap .odg-att .s').length), 1);
ok('il minore è segnato',  await p.evaluate(()=>!!document.querySelector('.cast-m')), true);
ok('in testa il conto',    await p.evaluate(()=>document.querySelector('#castTableWrap .sp-testa .s').textContent),
   '4 personaggi · lista ufficiale');

console.log('\n── si riordina per peso ──');
ok('prima per ID',   await p.evaluate(()=>[...document.querySelectorAll('#castTableWrap .odg-att .id')].map(e=>e.textContent)), ['1','2','3','4']);
await p.evaluate(()=>castOrdina('scene')); await p.waitForTimeout(200);
ok('poi per scene',  await p.evaluate(()=>[...document.querySelectorAll('#castTableWrap .odg-att .id')].map(e=>e.textContent)), ['1','2','3','4']);
ok('e il tasto lo dice', await p.evaluate(()=>document.querySelector('#castTableWrap .cal-vista button.on').textContent), 'Per scene');
await p.evaluate(()=>castOrdina('id'));

console.log('\n── da qui si apre la stessa scheda ──');
await p.evaluate(()=>castApri('1')); await p.waitForTimeout(300);
ok('si apre',        await p.evaluate(()=>getComputedStyle(document.getElementById('odgScena')).display), 'flex');
ok('col nome dell\'attore', await p.evaluate(()=>document.querySelector('#odgScena .sc-n').textContent), 'Rocco Maffei');
ok('le scene di oggi ci sono', await p.evaluate(()=>!!document.querySelector('.at-ore')), true);
ok('e il conto del film',      await p.evaluate(()=>document.querySelector('.at-tot').textContent.trim()), '6 scene su 184');
await p.evaluate(()=>odgChiudiScena());

console.log('\n── un personaggio che nessun OdG ha ancora convocato ──');
await p.evaluate(()=>castApri('3')); await p.waitForTimeout(300);
ok('si apre col personaggio', await p.evaluate(()=>document.querySelector('#odgScena .sc-n').textContent), 'INGEGNER RANIERI');
ok('niente sezione di oggi',  await p.evaluate(()=>!document.querySelector('.at-ore') && !document.querySelector('.sp-scene')), true);
ok('niente tasto IMDb',       await p.evaluate(()=>!document.querySelector('.at-imdb')), true);
ok('ma lo spiega',            await p.evaluate(()=>/interprete comparir/.test(document.querySelector('.at-corpo').textContent)), true);
ok('e le scene del film sì',  await p.evaluate(()=>document.querySelector('.at-tot').textContent.trim()), '1 scene su 184');
await p.evaluate(()=>odgChiudiScena());

console.log('\n── un nome con l\'apostrofo non rompe niente ──');
await p.evaluate(()=>castApri('4')); await p.waitForTimeout(250);
ok('si apre lo stesso', await p.evaluate(()=>document.querySelector('#odgScena .sc-n').textContent), "L'AVVOCATO");
await p.evaluate(()=>odgChiudiScena());

console.log('\n── senza lista non finge ──');
await p.evaluate(()=>renderCastTab([],false)); await p.waitForTimeout(150);
ok('lo dice',        await p.evaluate(()=>/Nessuna lista/.test(document.getElementById('castTableWrap').textContent)), true);
ok('e offre di generarla', await p.evaluate(()=>getComputedStyle(document.getElementById('castGeneraBtn')).display), 'block');

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
