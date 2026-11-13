const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
const fs=require('fs');
/* I documenti veri non stanno nel repository.
 *
 * Questo controllo gira su un ordine del giorno vero, e dentro un ordine
 * del giorno vero c'e' la lista della troupe: nomi e numeri di telefono di
 * persone che lavorano. Nei file dei controlli i pochi nomi che servivano
 * sono stati sostituiti con nomi inventati della stessa forma; un
 * documento intero no, perche' basta sbagliarne uno.
 * I documenti vanno in test/dati/, che git non guarda. Senza, questo file
 * dice cosa manca e si ferma: un controllo che non puo' girare lo deve
 * dire, non passare di straforo. */
function dati(nome) {
  const p = require('path').join(__dirname, 'dati', nome);
  if (!require('fs').existsSync(p)) {
    console.log('ok — saltato: manca ' + p);
    process.exit(0);
  }
  return require('fs').readFileSync(p, 'utf8');
}

let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(40)} ${JSON.stringify(got)}`.padEnd(84)+` atteso ${JSON.stringify(exp)}`);};
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
await p.evaluate(()=>{
  window.currentUser=null; localStorage.clear();
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').style.display='block';
});

console.log('\n── la barra ha cinque schede ──');
const et=await p.evaluate(()=>[...document.querySelectorAll('.result-tabs .result-tab')].map(b=>b.textContent.trim()));
ok('etichette', et, ['OdG','Spoglio','Ore','Piano','Altro']);
ok('una riga sola', await p.evaluate(()=>document.querySelectorAll('.result-tabs').length), 1);

console.log('\n── ogni scheda apre la sua sezione ──');
const vis=k=>p.evaluate(id=>{const e=document.getElementById(id);
  return !!e && getComputedStyle(e).display!=='none';},k);
for(const [tab,sez] of [['odg','odgSection'],['spoglio','spoglioSection'],
                        ['ore','timetableSection'],['altro','altroSection']]){
  await p.evaluate(t=>switchResultTab(t),tab);
  ok(`${tab} apre ${sez}`, await vis(sez), true);
}
await p.evaluate(()=>switchResultTab('odg'));
ok('e chiude le altre', await vis('altroSection'), false);

console.log('\n── Altro porta alle sezioni secondarie ──');
await p.evaluate(()=>switchResultTab('altro'));
const voci=await p.evaluate(()=>[...document.querySelectorAll('.altro-el button .t')].map(e=>e.textContent));
ok('voci', voci, ['Script','Analisi','Troupe','Cast','Wrap']);
await p.evaluate(()=>switchResultTab('cast'));
ok('cast aperto', await vis('castSection'), true);
ok('in barra resta acceso Altro',
   await p.evaluate(()=>document.getElementById('tabAltro').classList.contains('active')), true);

console.log('\n── OdG: stato vuoto ──');
await p.evaluate(()=>switchResultTab('odg'));
ok('invito a caricare', await p.evaluate(()=>/Nessun ordine del giorno/.test(document.getElementById('odgCorpo').innerText)), true);
ok('c\'è il tasto', await p.evaluate(()=>!!document.querySelector('#odgCorpo input[type=file]')), true);

console.log('\n── OdG: con i dati veri, senza modello ──');
const testo=dati('odg.txt');
await p.evaluate(t=>{
  const d=odgIntestazione(t);
  d.scene=[{n:'32END',ie:'E',m:'G',ambiente:'CAMPI STERMINATI',sinossi:'Colonna osserva il maestro che guarda il paesaggio.',ids:'1, 19',pag:'1/8'},
           {n:'33',ie:'E',m:'G',ambiente:'FATTORIA',sinossi:'Colonna e Navarra capiscono che l’ometto vuole vendicarsi.',ids:'1, 2, 19',pag:'2 1/8'}];
  d.cast=[{id:'1',ruolo:'PRINCIPE COLONNA',interprete:'ROCCO PAPALEO',scene:'33, 32END',pickup:'06.00',set:'08.30'},
          {id:'2',ruolo:'GIUSEPPE NAVARRA',interprete:'MARCO D’AMORE',scene:'33',pickup:'06.10',set:'08.30'}];
  d.troupe=[{reparto:'SUONO',ruolo:'Microfonista',nome:'S. Panetta',partenza:'',set:'07.30'},
            {reparto:'SUONO',ruolo:'Fonico',nome:'D. De Marchi',partenza:'',set:'07.30'},
            {reparto:'REGIA',ruolo:'Regista',nome:'L. Di Pasquale',partenza:'',set:'07.00'}];
  d.contatti=[{nome:'Maria Chiara De Santis',ruolo:'Organizzatore Generale',tel:'3330000022'},
              {nome:'Attilio Montagna',ruolo:'Direttore di produzione',tel:'3330000033'}];
  d.domani={etichetta:'Martedì 10 novembre · 08.00–16.00',scene:[{n:'31'},{n:'53A'},{n:'35Aend'}]};
  d.nomeFile='MSG_ODG_20_09.11.2026.pdf'; d.caricatoIl=new Date().toISOString();
  odgCorrente=d; odgRender();
},testo);
ok('intestazione', await p.evaluate(()=>document.querySelector('.odg-testa .h1').textContent.trim()), 'OdG 20 · lunedì 9 novembre');
// Il totale e' quello dichiarato dall'ordine del giorno ("Tot. pag. : 3 1/8"),
// non la somma delle due scene rimaste in questa prova.
ok('pagine dichiarate', await p.evaluate(()=>document.querySelector('.odg-testa .h2').textContent.trim()), 'Campi sterminati / fattoria · 3 1/8 pag');
// Senza profilo non c'e' con cosa cercare: l'elenco intero e' il ripiego giusto.
ok('senza profilo ripiega sull\'elenco', await p.evaluate(()=>document.querySelectorAll('.odg-chi .el button').length), 3);

console.log('\n── metto il profilo: diventa una conferma sola ──');
await p.evaluate(()=>{localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));odgRender()});
ok('una riga', await p.evaluate(()=>document.querySelectorAll('.odg-chi .el .riga').length), 1);
ok('ed è la mia', await p.evaluate(()=>document.querySelector('.odg-chi .n').textContent.trim()), 'S. Panetta');

console.log('\n── confermo ──');
await p.evaluate(()=>odgSceltoIo(0));
ok('badge col mio ruolo', await p.evaluate(()=>document.querySelector('.odg-badge .r').textContent.trim()), 'Microfonista · SUONO');
ok('badge col mio orario', await p.evaluate(()=>document.querySelector('.odg-badge .o').textContent.trim()), '07.30');
ok('la domanda sparisce', await p.evaluate(()=>!document.querySelector('.odg-chi')), true);
ok('resta dopo un ridisegno', await p.evaluate(()=>{odgRender();return !!document.querySelector('.odg-badge')}), true);

console.log('\n── il resto della scheda ──');
ok('scene',   await p.evaluate(()=>document.querySelectorAll('.odg-scene li').length), 2);
ok('cast',    await p.evaluate(()=>document.querySelectorAll('.odg-att').length), 2);
ok('numeri',  await p.evaluate(()=>document.querySelectorAll('.odg-tel').length), 2);
ok('chiamata diretta', await p.evaluate(()=>document.querySelector('.odg-tel').getAttribute('href')), 'tel:3330000022');
ok('niente telefono nel testo', await p.evaluate(()=>/3330000022/.test(document.querySelector('.odg-tel').innerText)), false);
ok('mappa della location', await p.evaluate(()=>document.querySelector('.odg-posto').getAttribute('href')), 'https://maps.app.goo.gl/A5KUf7hE4Kntttyj6');
ok('ospedale',await p.evaluate(()=>/Ospedale più vicino/.test(document.getElementById('odgCorpo').innerText)), true);
ok('domani',  await p.evaluate(()=>/Marted/.test(document.querySelector('.odg-domani').innerText)), true);
ok('luce',    await p.evaluate(()=>document.querySelectorAll('.odg-luce>div').length), 4);

await p.evaluate(()=>{switchResultTab('odg');window.scrollTo(0,0)});
await p.waitForTimeout(250);
await p.screenshot({path:__dirname+'/g2-odg.png',fullPage:true});

console.log('\n── rimuovo ──');
/* Il tasto chiede prima: sta in fondo alla pagina, sotto il pollice che
   scorre, e toccato per sbaglio toglieva tutto senza una parola. */
const vero = await p.evaluate(()=>{ window.__conferma=askConfirm; return true; });
ok('chi annulla tiene l\'ordine del giorno', await p.evaluate(async()=>{
  let chiesto=''; askConfirm=async t=>{ chiesto=t; return false; };
  await odgRimuovi();
  return [/Confermi/.test(chiesto), !!odgCorrente];
}), [true, true]);
await p.evaluate(async()=>{ askConfirm=async()=>true; await odgRimuovi(); askConfirm=window.__conferma; });
ok('torna vuoto', await p.evaluate(()=>/Nessun ordine del giorno/.test(document.getElementById('odgCorpo').innerText)), true);

console.log('\n── aprendo un film si arriva all\'OdG ──');
ok('la scheda accesa è OdG', await p.evaluate(()=>document.querySelector('.result-tab.active')?.id), 'tabOdg');
ok('e la pagina aperta pure', await p.evaluate(()=>
  getComputedStyle(document.getElementById('odgSection')).display !== 'none' &&
  getComputedStyle(document.getElementById('spoglioSection')).display === 'none'), true);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
await p.evaluate(()=>switchResultTab('odg'));
await p.screenshot({path:__dirname+'/g1-odg-vuoto.png'});
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
