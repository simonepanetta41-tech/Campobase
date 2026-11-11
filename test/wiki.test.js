/* Le due righe di "chi è" sotto il nome dell'attore.
 *
 * Il guasto, visto sul set: nella scheda di Carmen Pommella c'era la
 * trama di un film di Sorrentino. Tutto vero, e tutto di un'altra cosa.
 *
 * Il controllo di prima guardava soltanto se il testo nominava un attore,
 * e la pagina di un film lo fa per forza — "è interpretato da Filippo
 * Scotti, Toni Servillo…". Ora si chiede anche che la pagina parli di
 * LEI: il nome nel titolo e il nome all'inizio del testo.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(50)} ${JSON.stringify(got)}`.padEnd(104)+' atteso '+JSON.stringify(exp));};

// Com'era davvero sullo schermo: la pagina del film, con dentro "interpretato".
const FILM = {index:1, title:'È stata la mano di Dio', extract:
  'È stata la mano di Dio è un film del 2021 scritto, diretto e co-prodotto da Paolo Sorrentino. ' +
  'Parzialmente autobiografico, è interpretato da Filippo Scotti, Toni Servillo alla sua sesta ' +
  'collaborazione con Sorrentino, insieme a Teresa Saponangelo, Luisa Ranieri, Renato Carpentieri.'};
const LEI = {index:2, title:'Carmen Pommella', extract:
  'Carmen Pommella (Napoli, 12 marzo 1974) è un\'attrice italiana. Ha lavorato in teatro e al cinema.'};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage();
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},limit:async()=>({data:[]})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);

const prova = (pagina, nome) => p.evaluate(([x,n])=>wikiVaBene(x,n), [pagina, nome]);

console.log('\n── il caso vero ──');
ok('la pagina del film si scarta',   await prova(FILM, 'Carmen Pommella'), false);
ok('la sua biografia si tiene',      await prova(LEI,  'Carmen Pommella'), true);

console.log('\n── un omonimo di un altro mestiere ──');
ok('il calciatore no', await prova({title:'Mario Rossi (calciatore)',
  extract:'Mario Rossi (Roma, 1980) è un calciatore italiano, centrocampista.'}, 'Mario Rossi'), false);
ok('ma l\'attore sì',  await prova({title:'Mario Rossi (attore)',
  extract:'Mario Rossi (Roma, 1980) è un attore italiano.'}, 'Mario Rossi'), true);

console.log('\n── accenti, maiuscole e disambiguazioni ──');
ok('il titolo con la precisazione', await prova({title:'Nicolò Bianchi (attore)',
  extract:'Nicolò Bianchi (Milano, 1975) è un attore e regista italiano.'}, 'Nicolo Bianchi'), true);
ok('un cognome solo nel titolo', await prova({title:'Pommella',
  extract:'Carmen Pommella è un\'attrice italiana nata a Napoli.'}, 'Carmen Pommella'), true);

console.log('\n── una pagina che la nomina ma non parla di lei ──');
/* Il nome c'e', ma in fondo: e' la pagina di qualcun altro che l'ha
   diretta. Il testo deve cominciare parlando di lei. */
ok('si scarta', await prova({title:'Carmen Pommella e il teatro napoletano',
  extract:'Il teatro napoletano del Novecento ha formato molti interpreti. ' +
          'Fra questi Carmen Pommella, attrice.'}, 'Carmen Pommella'), false);

console.log('\n── e i casi vuoti ──');
ok('niente pagina',  await prova(null, 'Carmen Pommella'), false);
ok('niente testo',   await prova({title:'Carmen Pommella'}, 'Carmen Pommella'), false);
ok('niente nome',    await prova(LEI, ''), false);

console.log('\n── fra cinque risultati si pesca il suo ──');
// Wikipedia ordina per pertinenza alla ricerca, non per utilita' nostra:
// la pagina del film in cui ha recitato batte spesso la sua.
ok('vince la biografia, non il film', await p.evaluate(([f,l])=>{
  const pagine = [f, l].sort((a,b)=>a.index-b.index);
  const scelta = pagine.find(x => wikiVaBene(x, 'Carmen Pommella'));
  return scelta && scelta.title;}, [FILM, LEI]), 'Carmen Pommella');

console.log('\n── la memoria vecchia si butta ──');
/* La descrizione sbagliata era gia' salvata sul telefono: senza buttarla,
   la correzione varrebbe solo per gli attori mai cercati prima.
   La memoria la tiene schedaAttore, che e' quella che sceglie fra TMDB e
   Wikipedia: wikiAttore da sola non sa nemmeno che esiste. */
const memoria = await p.evaluate(async()=>{
  localStorage.setItem('cb_wiki', JSON.stringify({
    'Carmen Pommella': {testo:'È stata la mano di Dio è un film del 2021…', foto:null, url:'x'}}));
  let chiamate = 0;
  const vero = window.fetch;
  window.fetch = async () => { chiamate++; throw new Error('niente rete'); };
  const r = await schedaAttore('Carmen Pommella');
  window.fetch = vero;
  const dopo = JSON.parse(localStorage.getItem('cb_wiki') || 'null');
  return {risposta: r, chiamate, scrittaNuova: !!(dopo && dopo.v === 3)};
});
ok('non serve la vecchia',  memoria.risposta, null);
// Due fonti, due tentativi: TMDB e poi Wikipedia.
ok('ed è andata a richiedere', memoria.chiamate, 2);
/* E non si ricorda il buco: se nessuna delle due ha risposto, al
   prossimo tentativo con la rete si riprova. */
ok('senza ricordarsi il buco', memoria.scrittaNuova, false);

ok('ma la memoria nuova si usa', await p.evaluate(async()=>{
  localStorage.setItem('cb_wiki', JSON.stringify({v:3, voci:{
    'Carmen Pommella': {testo:'Carmen Pommella è un\'attrice italiana.', titoli:[], fonte:'TMDB', url:'x'}}}));
  let chiamate = 0;
  const vero = window.fetch;
  window.fetch = async () => { chiamate++; throw new Error('niente rete'); };
  const r = await schedaAttore('Carmen Pommella');
  window.fetch = vero;
  return {testo: r && r.testo, chiamate};
}), {testo:'Carmen Pommella è un\'attrice italiana.', chiamate:0});

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
