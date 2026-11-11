// Il "Dove": due link con il loro nome, non un muro di testo.
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(104)+` atteso ${JSON.stringify(exp)}`);};

// Com'e' scritto davvero nell'ordine del giorno di Missione San Gennaro.
const VERO = `ODG # 21 Martedì 10 Novembre 2026
CONVOCAZIONE : 07.30 PRONTI A GIRARE : 08.00
AMBIENTE: MASSERIA ACCETTA GRANDE
LOCATION: MEZZI TECNICI: https://maps.app.goo.gl/n3Xnduv2JAFRxQ2S9 CB: https://maps.app.goo.gl/sjTVx16HatxCTRcs6?g_st=iw METEO: Soleggiato DAWN : 06 : 36 ALBA : 07 : 05
FINE RIPRESE : 19.00`;

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},
             limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);

console.log('\n── quello che si legge nell\'intestazione ──');
const r = await p.evaluate(t=>odgIntestazione(t), VERO);
ok('l\'ambiente resta intero',  r.ambiente, 'MASSERIA ACCETTA GRANDE');
ok('la location non si mangia il resto', r.location, null);
ok('il meteo è solo il meteo',  r.meteo, 'Soleggiato');
ok('e l\'alba è un\'ora',        r.alba, '07.05');
ok('i posti sono due',          r.luoghi.map(l=>l.nome), ['Mezzi tecnici','Campo base']);
ok('con i link giusti',         r.luoghi.map(l=>l.url),
   ['https://maps.app.goo.gl/n3Xnduv2JAFRxQ2S9','https://maps.app.goo.gl/sjTVx16HatxCTRcs6?g_st=iw']);
ok('e niente link nel testo dei posti', r.luoghi.every(l=>!/https/.test(l.nome)), true);

console.log('\n── i criteri di riserva, uno dopo l\'altro ──');
// Secondo: altri nomi per la stessa cosa, ma l'ora dev'essere attaccata.
ok('PRONTI: vale pronti a girare', await p.evaluate(()=>
  odgIntestazioneDa({testo:'CONVOCAZIONE: 08.00\nPRONTI: 09.00'}).prontiAGirare), '09.00');
ok('WRAP: vale fine riprese',      await p.evaluate(()=>
  odgIntestazioneDa({testo:'Convocazione troupe: 09.00\nWRAP: 16:30'}).fineRiprese), '16.30');
ok('ma non il titolo di una colonna', await p.evaluate(()=>
  odgIntestazioneDa({testo:'ID RUOLO COSTUMI PRONTI SET\n1 MARA 07.10 07.30 08.00'}).prontiAGirare), null);
ok('e il nome esteso batte quello corto', await p.evaluate(()=>
  odgIntestazioneDa({testo:'PRONTI A GIRARE: 10.15\nCOSTUMI PRONTI: 09.00'}).prontiAGirare), '10.15');

console.log('\n── il numero, anche con le cifre staccate ──');
ok('numero intero',        r.numero, 21);
ok('cifre separate da uno spazio', await p.evaluate(()=>odgIntestazione('ODG # 2 1 Martedì 10 Novembre 2026').numero), 21);
ok('e spezzate a capo',    await p.evaluate(()=>odgIntestazione('ODG # 2\n1 Martedì').numero), 21);
ok('ma non si mangia la data', await p.evaluate(()=>odgIntestazione('ODG # 21  10 Novembre 2026').numero), 21);
ok('a una cifra resta a una cifra', await p.evaluate(()=>odgIntestazione('ODG # 7 Lunedì').numero), 7);
ok('col trattino basso, come lo scrive MSG', await p.evaluate(()=>odgIntestazione('MSG - ODG _21 del 10.11.2026').numero), 21);
ok('con n.',               await p.evaluate(()=>odgIntestazione('ODG n. 21 del 10.11').numero), 21);
ok('con n°',               await p.evaluate(()=>odgIntestazione('ODG n° 21').numero), 21);
ok('coi due punti',        await p.evaluate(()=>odgIntestazione('ODG: 21 Martedì').numero), 21);

console.log('\n── un ordine del giorno vecchio non scalza quello di oggi ──');
ok('resta quello di domani', await p.evaluate(async()=>{
  odgCorrente = {data:'2026-11-11', numero:22, scene:[]};
  // si salva comunque, ma non diventa quello che si riapre
  localStorage.removeItem('cb_odg');
  await odgSalva({data:'2026-10-15', numero:4, scene:[]}, {nonMostrare:true});
  return [odgCorrente.numero, localStorage.getItem('cb_odg')];}), [22, null]);
ok('e uno nuovo invece sì', await p.evaluate(async()=>{
  await odgSalva({data:'2026-11-12', numero:23, scene:[]});
  return JSON.parse(localStorage.getItem('cb_odg')).numero;}), 23);

console.log('\n── la colonna DAY attaccata alle pagine ──');
ok('si accorge e la toglie', await p.evaluate(()=>{
  // com'e' arrivato davvero: DAY 4 incollato davanti a PAG
  const d = {pagine:3.5, scene:[{n:'32END',pag:'4 1/8'},{n:'31',pag:'4 3 3/8'}]};
  odgAggiustaPagine(d); return d.scene.map(s=>s.pag);}), ['1/8','3 3/8']);
ok('se i conti tornano non tocca niente', await p.evaluate(()=>{
  const d = {pagine:3.5, scene:[{n:'1',pag:'1/8'},{n:'2',pag:'3 3/8'}]};
  odgAggiustaPagine(d); return d.scene.map(s=>s.pag);}), ['1/8','3 3/8']);
ok('e se togliendo non tornano, lascia stare', await p.evaluate(()=>{
  const d = {pagine:9, scene:[{n:'1',pag:'4 1/8'},{n:'2',pag:'4 3/8'}]};
  odgAggiustaPagine(d); return d.scene.map(s=>s.pag);}), ['4 1/8','4 3/8']);
ok('senza totale dichiarato non si inventa niente', await p.evaluate(()=>{
  const d = {scene:[{n:'1',pag:'4 1/8'},{n:'2',pag:'4 3/8'}]};
  odgAggiustaPagine(d); return d.scene.map(s=>s.pag);}), ['4 1/8','4 3/8']);

console.log('\n── il nome del file sa il numero ──');
ok('lo legge',             await p.evaluate(()=>odgNumeroDaNome('MSG - ODG _21 del 10.11.2026.pdf')), 21);
ok('anche senza trattino', await p.evaluate(()=>odgNumeroDaNome('ODG 7 del 01.11.pdf')), 7);
ok('e se non c\'è, niente', await p.evaluate(()=>odgNumeroDaNome('Giri auto 10.11.pdf')), null);

console.log('\n── il totale delle pagine lo dice l\'ordine del giorno ──');
ok('lo legge',            await p.evaluate(()=>odgTotalePagine('Tot. pag.: 3 4/8')), 3.5);
ok('anche senza punti',   await p.evaluate(()=>odgTotalePagine('Tot pag 3 4/8')), 3.5);
ok('solo la frazione',    await p.evaluate(()=>odgTotalePagine('Tot. pag.: 7/8')), 0.875);
ok('solo l\'intero',      await p.evaluate(()=>odgTotalePagine('Tot. pag.: 4')), 4);
ok('se non c\'è, zero',   await p.evaluate(()=>odgTotalePagine('PAG 1/8')), 0);
ok('un numero assurdo si scarta', await p.evaluate(()=>odgTotalePagine('Tot. pag.: 412')), 0);

ok('in testa si usa quello, non la somma delle righe', await p.evaluate(()=>{
  odgCorrente={data:'2026-11-10',numero:21,ambiente:'Campi sterminati / casa paese',
    pagine:3.5,   // dichiarato dalla produzione
    scene:[{pag:'1/8'},{pag:'3 3/8'},{pag:'1/8'},{pag:'3 3/8'}]};  // stampate due volte
  switchResultTab('odg');
  return document.querySelector('#odgSection .h2').textContent;}),
  'Campi sterminati / casa paese · 3 4/8 pag');
ok('e senza dichiarato si somma come prima', await p.evaluate(()=>{
  odgCorrente={data:'2026-11-10',numero:21,ambiente:'X',scene:[{pag:'1/8'},{pag:'3 3/8'}]};
  switchResultTab('odg');
  return document.querySelector('#odgSection .h2').textContent;}), 'X · 3 4/8 pag');

console.log('\n── la testata su due colonne, col link staccato dalla sua etichetta ──');
// Com'e' scritto nell'ODG 22 di Missione San Gennaro: fra "CB / MEZZI
// TECNICI:" e il suo link ci finiscono dawn, alba e la pausa.
const DUE = `CB / MEZZI TECNICI:   DAWN: 06:36 ALBA: 07:03
PAUSA:   Rotazione 20’
https://maps.app.goo.gl/2kUywsjpG4SfNNrN7?g_st=iw   TRAMONTO: 17.59`;
ok('il posto non si chiama Pausa', await p.evaluate(t=>odgLuoghi(t).map(l=>l.nome), DUE),
   ['Mezzi tecnici']);
ok('etichette maiuscolo-minuscolo', await p.evaluate(()=>odgLuoghi(
   'LOCATION Main 1:   Via Santa Cornelia 10, Formello https://maps.app.goo.gl/AAA   PRONTI A GIRARE:   10:15'
   ).map(l=>l.nome)), ['Location main 1']);
ok('un orario non è un posto',  await p.evaluate(()=>odgCampoTestata('YUTA PAUSA SPLIT')), true);
ok('i mezzi tecnici invece sì', await p.evaluate(()=>odgCampoTestata('CB / MEZZI TECNICI')), false);
// Un link senza etichetta si lascia stare, e non prende il nome da un
// pezzo del link che lo precede.
ok('niente etichette dentro i link', await p.evaluate(()=>odgLuoghi(
   'https://maps.app.goo.gl/SNZZushw8 https://maps.app.goo.gl/XYZ').map(l=>l.nome)), []);

console.log('\n── un ambiente andato a capo dentro la sua cella ──');
ok('si attacca il seguito', await p.evaluate(()=>odgIntestazione(
   'AMBIENTE: TANA DELLA VOLPE / ROTONDA AI   METEO: Nuvoloso\nCADUTI   PRONTI A GIRARE   09.00'
   ).ambiente), 'TANA DELLA VOLPE / ROTONDA AI CADUTI');
ok('ma solo se resta appeso', await p.evaluate(()=>odgIntestazione(
   'AMBIENTE: MASSERIA ACCETTA GRANDE   METEO: Sole\nCADUTI   PRONTI A GIRARE   09.00'
   ).ambiente), 'MASSERIA ACCETTA GRANDE');
ok('e non si prende un\'etichetta', await p.evaluate(()=>odgIntestazione(
   'AMBIENTE: CASA DI   METEO: Sole\nPAUSA: Rotazione').ambiente), 'CASA DI');

console.log('\n── il meteo trova il comune anche senza location ──');
ok('lo prende dall\'ambiente', await p.evaluate(()=>
  odgComune(odgIntestazione('AMBIENTE: Masseria Accetta Grande - Monteiasi LOCATION: CB: https://x.it METEO: Sole').ambiente)),
  'Monteiasi');

console.log('\n── un ordine del giorno all\'antica, con la location scritta ──');
const vecchio = await p.evaluate(()=>odgIntestazione(
  'LOCATION: VIA DEI FORI IMPERIALI 12, ROMA METEO: Nuvoloso'));
ok('la location si legge', vecchio.location, 'VIA DEI FORI IMPERIALI 12, ROMA');
ok('e nessun posto inventato', vecchio.luoghi, []);

console.log('\n── un valore che comincia come un\'etichetta ──');
ok('non sparisce', await p.evaluate(()=>odgIntestazione('LOCATION: Catering Village, Bari METEO: Sereno').location),
   'Catering Village, Bari');

console.log('\n── come si vede a schermo ──');
await p.evaluate(t=>{
  const d = odgIntestazione(t);
  d.scene = []; d.data = '2026-11-10';
  odgCorrente = d;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
  switchResultTab('odg');
}, VERO);
await p.waitForTimeout(300);
ok('due righe nel Dove', await p.evaluate(()=>
  [...document.querySelectorAll('#odgSection .odg-posto .t')].map(e=>e.textContent)),
  ['Mezzi tecnici','Campo base']);
ok('ognuna porta alla sua mappa', await p.evaluate(()=>
  [...document.querySelectorAll('#odgSection .odg-posto')].map(a=>a.getAttribute('href'))),
  ['https://maps.app.goo.gl/n3Xnduv2JAFRxQ2S9','https://maps.app.goo.gl/sjTVx16HatxCTRcs6?g_st=iw']);
ok('e non c\'è più il muro di testo', await p.evaluate(()=>
  !/METEO|DAWN/.test(document.querySelector('#odgSection .card')?.textContent||'')), true);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
