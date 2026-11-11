/* Le notifiche, provate per davvero.
 *
 * Playwright non sa simulare un push che arriva da Apple, ma il pezzo
 * delicato non e' quello: e' cosa fa il service worker quando la notifica
 * arriva vuota — va a chiedere il testo, e se non lo ottiene mostra
 * comunque qualcosa, perche' un push ricevuto e non mostrato su iOS fa
 * perdere il permesso. Qui si chiama a mano il gestore del push e si
 * guarda cosa esce. */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright'); const http=require('http'),fs=require('fs'),path=require('path');
const APP=RADICE;
let ko=0; const ok=(n,g,e)=>{const b=JSON.stringify(g)===JSON.stringify(e);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(g)}`.padEnd(104)+' atteso '+JSON.stringify(e));};

const chiesti=[];            // le richieste che l'app manda al Worker
let testoDaDare='Catering pronto fra 15 minuti!';
let messaggioRompi=false;

const srv=http.createServer((q,s)=>{
  if (q.url.startsWith('/api/')) {
    let corpo='';
    q.on('data',c=>corpo+=c);
    q.on('end',()=>{
      chiesti.push({url:q.url, corpo: corpo?JSON.parse(corpo):null});
      if (q.url==='/api/push/messaggio' && messaggioRompi) { s.writeHead(500); s.end('{}'); return; }
      s.writeHead(200,{'content-type':'application/json'});
      s.end(JSON.stringify(q.url==='/api/push/messaggio' ? {testo:testoDaDare} : {ok:true}));
    });
    return;
  }
  let d; const f=path.join(APP, q.url==='/'?'/index.html':q.url.split('?')[0]);
  try{ d=fs.readFileSync(f); }catch(_){ s.writeHead(404); s.end(); return; }
  s.writeHead(200,{'content-type': f.endsWith('.js')?'text/javascript':f.endsWith('.json')?'application/json':f.endsWith('.png')?'image/png':'text/html'});
  s.end(d);
});

(async()=>{
srv.listen(8095);
const b=await chromium.launch();
const ctx=await b.newContext({baseURL:'http://localhost:8095'});
const p=await ctx.newPage();
p.setDefaultTimeout(20000);
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{access_token:'finto'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},limit:async()=>({data:[]}),upsert:async()=>({error:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>{const u=r.request().url();
  return u.includes('localhost:8095')?r.continue():r.abort();});
await p.goto('/',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(900);

console.log('\n── da un\'ora dell\'ordine del giorno a un istante vero ──');
ok('dieci minuti prima del pick-up', await p.evaluate(()=>
  pushIstante('2026-11-11','07.30',10).toTimeString().slice(0,5)), '07:20');
ok('un quarto d\'ora prima del catering', await p.evaluate(()=>
  pushIstante('2026-11-11','12.30',15).toTimeString().slice(0,5)), '12:15');
ok('e nel giorno giusto', await p.evaluate(()=>
  pushIstante('2026-11-11','07.30',10).getDate()), 11);
ok('a mezzanotte scavalca il giorno', await p.evaluate(()=>
  pushIstante('2026-11-11','00.05',10).toISOString().slice(0,10) < '2026-11-11'), true);
ok('un\'ora che non c\'è, niente', await p.evaluate(()=>pushIstante('2026-11-11','continuato',15)), null);
ok('senza data, niente',          await p.evaluate(()=>pushIstante(null,'07.30',10)), null);

console.log('\n── gli appuntamenti che l\'app registra ──');
const reg = await p.evaluate(async()=>{
  // Si finge il permesso dato e un'iscrizione viva.
  Object.defineProperty(Notification,'permission',{get:()=>'granted',configurable:true});
  // "ready" e' un getter di sola lettura: assegnarlo non fa niente.
  Object.defineProperty(navigator.serviceWorker, 'ready', {configurable:true,
    get:()=>Promise.resolve({pushManager:{getSubscription:async()=>({
      endpoint:'https://web.push.apple.com/finto', toJSON:()=>({keys:{p256dh:'aaa',auth:'bbb'}})})}})});
  odgCorrente = {data:'2026-11-11', numero:22, catering:'12.30', cestini:83, scene:[],
                 pickup:{ora:'07.30', autista:'Stefano Baldini', tel:'3330001234',
                         luogo:'TURSPORT HOTEL RESIDENCE'}};
  await pushAppuntamenti(odgCorrente);
  return true;
});
await p.waitForTimeout(300);
const app = chiesti.find(c=>c.url==='/api/push/appuntamenti');
ok('le notifiche sono possibili', await p.evaluate(()=>pushPossibile()), true);
ok('registrati due appuntamenti', (app&&app.corpo.lista||[]).map(a=>a.genere), ['pickup','catering']);
if(!app){ console.log('\n  (niente richiesta: si fermano qui i controlli)'); await b.close(); srv.close(); process.exit(1); }
/* I testi veri, con i dati dell'ordine del giorno 22 di Missione San
   Gennaro. La prima riga e' quella che si legge a schermo bloccato. */
ok('il pick-up, come si legge',   (app&&app.corpo.lista||[])[0].testo,
   'Stefano è lì fra 10 minuti per il pick up!\nPick up alle 07.30 · Tursport hotel residence');
ok('e il catering',               (app&&app.corpo.lista||[])[1].testo,
   'Catering pronto fra 15 minuti!\nPronto alle 12.30 · 83 cestini');
ok('alle 07.20',                   new Date((app&&app.corpo.lista||[])[0].quando).toTimeString().slice(0,5), '07:20');

console.log('\n── senza autista si resta sul generico ──');
chiesti.length=0;
await p.evaluate(async()=>{ odgCorrente.pickup={ora:'06.45'}; await pushAppuntamenti(odgCorrente); });
await p.waitForTimeout(300);
ok('il tuo driver', chiesti.find(c=>c.url==='/api/push/appuntamenti').corpo.lista[0].testo.split('\n')[0],
   'Il tuo driver è lì fra 10 minuti per il pick up!');

console.log('\n── senza permesso non si registra niente ──');
chiesti.length=0;
await p.evaluate(async()=>{
  Object.defineProperty(Notification,'permission',{get:()=>'default',configurable:true});
  await pushAppuntamenti(odgCorrente); });
await p.waitForTimeout(250);
ok('nessuna richiesta', chiesti.length, 0);

console.log('\n── l\'invito, al primo accesso ──');
const invito = async (stato) => p.evaluate(async(st)=>{
  localStorage.removeItem('cb_push_chiesto');
  if (st.chiesto) localStorage.setItem('cb_push_chiesto', st.chiesto);
  Object.defineProperty(Notification,'permission',{get:()=>st.permesso,configurable:true});
  Object.defineProperty(window.navigator,'standalone',{get:()=>st.installata,configurable:true});
  window.matchMedia = () => ({matches: st.installata});
  /* Sulla pagina iniziale, senza nessun ordine del giorno: e' la
     situazione di chi ha appena installato l'app e fatto l'accesso. */
  odgCorrente = null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  pushInvitoMostra();
  const el = document.querySelector('#pushInvitoHome .push-invito');
  return el ? [...el.querySelectorAll('.t,.sino button')].map(x=>x.textContent.trim()) : null;
}, stato);

ok('senza ordine del giorno si chiede già', await invito({permesso:'default', installata:true}),
   ['Ti avviso io?','Sì, avvisami','No grazie']);
// In Safari le notifiche non arrivano comunque: chiedere brucerebbe
// l'unica occasione per una finestra che non puo' funzionare.
ok('in Safari non si chiede',        await invito({permesso:'default', installata:false}), null);
ok('se ha già detto sì, no',         await invito({permesso:'granted', installata:true}), null);
ok('se iOS ha già negato, no',       await invito({permesso:'denied',  installata:true}), null);
ok('e una volta risposto, mai più',  await invito({permesso:'default', installata:true, chiesto:'no'}), null);

console.log('\n── "no grazie" non è un no a iOS ──');
/* Rispondere no qui non chiama requestPermission: il permesso resta
   "default", cosi' da Impostazioni si possono ancora accendere senza
   passare dalle impostazioni del telefono. */
const dopoIlNo = await p.evaluate(async()=>{
  localStorage.removeItem('cb_push_chiesto');
  let chiamato = false;
  Notification.requestPermission = async () => { chiamato = true; return 'denied'; };
  pushInvitoNo();
  return { chiamato, ricordato: localStorage.getItem('cb_push_chiesto'),
           sparito: !document.getElementById('pushInvito') };
});
ok('non chiede niente a iOS', dopoIlNo.chiamato, false);
ok('si ricorda la risposta',  dopoIlNo.ricordato, 'no');
ok('e l\'invito sparisce',    dopoIlNo.sparito, true);

console.log('\n── chi dice sì senza avere ancora l\'OdG non perde il catering ──');
/* L'ordine del giorno arriva dal cloud poco dopo l'accesso, e quando
   arriva odgRicalcola registra gli appuntamenti: il permesso a quel punto
   c'e' gia'. Senza questo, chi installa l'app alle dieci resta senza la
   notifica del catering di mezzogiorno. */
chiesti.length = 0;
await p.evaluate(async()=>{
  Object.defineProperty(Notification,'permission',{get:()=>'granted',configurable:true});
  Object.defineProperty(navigator.serviceWorker,'ready',{configurable:true,
    get:()=>Promise.resolve({pushManager:{getSubscription:async()=>({
      endpoint:'https://web.push.apple.com/finto', toJSON:()=>({keys:{p256dh:'a',auth:'b'}})})}})});
  odgCorrente = {data:'2026-11-11', numero:22, catering:'12.30', scene:[]};
  odgRicalcola();
});
await p.waitForTimeout(350);
ok('gli appuntamenti si registrano comunque',
   (chiesti.find(c=>c.url==='/api/push/appuntamenti')||{corpo:{lista:[]}}).corpo.lista.map(a=>a.genere),
   ['catering']);

console.log('\n── il service worker che riceve il testo cifrato ──');
// La strada normale: il testo e' dentro la notifica, decifrato dal sistema
// operativo prima di arrivare qui.
const swPieno = await p.evaluate(async()=>{
  const sorgente = await (await fetch('/sw.js')).text();
  const mostrate = [];
  const self = { addEventListener(t,f){ (self._h=self._h||{})[t]=f; },
    registration:{ pushManager:{getSubscription:async()=>({endpoint:'x'})},
      showNotification: async (t,o)=>{ mostrate.push({titolo:t, corpo:o.body}); } },
    clients:{matchAll:async()=>[],openWindow:async()=>null}, skipWaiting(){} };
  new Function('self','caches','fetch', sorgente)(self, {open:async()=>({put:async()=>{},add:async()=>{}}),keys:async()=>[],match:async()=>null,delete:async()=>{}}, window.fetch.bind(window));
  const atteso=[];
  await self._h.push({ data:{ json:()=>({testo:'Nuovo ordine del giorno!\nMSG - ODG 23 del 12.11.2026'}) }, waitUntil:pr=>atteso.push(pr) });
  await Promise.all(atteso);
  return mostrate;
});
ok('titolo e sottotitolo separati', swPieno, [{titolo:'Nuovo ordine del giorno!', corpo:'MSG - ODG 23 del 12.11.2026'}]);
chiesti.length = 0;
ok('e non va a chiedere niente', chiesti.length, 0);

console.log('\n── il service worker che riceve la notifica vuota (riserva) ──');
// Il gestore del push si prova nel suo ambiente: si carica sw.js in una
// finestra con addEventListener e registration finti.
const sw = await p.evaluate(async(stato)=>{
  const sorgente = await (await fetch('/sw.js')).text();
  const mostrate = [];
  const self = {
    addEventListener(tipo, fn){ (self._h = self._h || {})[tipo] = fn; },
    registration: {
      pushManager: { getSubscription: async () => stato.iscritto
        ? { endpoint: 'https://web.push.apple.com/finto' } : null },
      showNotification: async (t, o) => { mostrate.push({titolo:t, corpo:o.body, tag:o.tag}); }
    },
    clients: { matchAll: async()=>[], openWindow: async()=>null },
    skipWaiting(){}, caches: undefined
  };
  new Function('self','caches','fetch', sorgente)(self, { open: async()=>({put:async()=>{},add:async()=>{}}), keys: async()=>[], match: async()=>null, delete: async()=>{} }, window.fetch.bind(window));
  const atteso = [];
  await self._h.push({ waitUntil: pr => atteso.push(pr) });
  await Promise.all(atteso);
  return mostrate;
}, {iscritto:true});
ok('una notifica mostrata', sw.length, 1);
// Una riga sola: diventa il titolo, e sotto non c'e' niente da mettere.
ok('e niente seconda riga',    sw[0] && sw[0].corpo, '');
ok('il titolo è il testo, non il nome dell\'app', sw[0] && sw[0].titolo, 'Catering pronto fra 15 minuti!');
ok('ha chiesto il testo',      !!chiesti.find(c=>c.url==='/api/push/messaggio'), true);
ok('passando il suo indirizzo', chiesti.find(c=>c.url==='/api/push/messaggio').corpo.endpoint,
   'https://web.push.apple.com/finto');

console.log('\n── e se il testo non arriva, mostra comunque qualcosa ──');
// Su iOS un push ricevuto e non mostrato, dopo poche volte, fa togliere il
// permesso: tacere non e' un'opzione.
messaggioRompi = true;
const sw2 = await p.evaluate(async()=>{
  const sorgente = await (await fetch('/sw.js')).text();
  const mostrate = [];
  const self = { addEventListener(t,f){ (self._h=self._h||{})[t]=f; },
    registration:{ pushManager:{getSubscription:async()=>({endpoint:'https://web.push.apple.com/finto'})},
      showNotification: async (t,o)=>{ mostrate.push(t); } },
    clients:{matchAll:async()=>[],openWindow:async()=>null}, skipWaiting(){} };
  new Function('self','caches','fetch', sorgente)(self, {open:async()=>({put:async()=>{},add:async()=>{}}),keys:async()=>[],match:async()=>null,delete:async()=>{}}, window.fetch.bind(window));
  const atteso=[]; await self._h.push({waitUntil:pr=>atteso.push(pr)}); await Promise.all(atteso);
  return mostrate;
});
ok('mostra la riga generica', sw2, ['C\'è un aggiornamento']);

console.log('\n── e se non c\'è nessuna iscrizione, uguale ──');
const sw3 = await p.evaluate(async()=>{
  const sorgente = await (await fetch('/sw.js')).text();
  const mostrate = [];
  const self = { addEventListener(t,f){ (self._h=self._h||{})[t]=f; },
    registration:{ pushManager:{getSubscription:async()=>null},
      showNotification: async (t,o)=>{ mostrate.push(t); } },
    clients:{matchAll:async()=>[],openWindow:async()=>null}, skipWaiting(){} };
  new Function('self','caches','fetch', sorgente)(self, {open:async()=>({put:async()=>{},add:async()=>{}}),keys:async()=>[],match:async()=>null,delete:async()=>{}}, window.fetch.bind(window));
  const atteso=[]; await self._h.push({waitUntil:pr=>atteso.push(pr)}); await Promise.all(atteso);
  return mostrate;
});
ok('mostra la riga generica', sw3, ['C\'è un aggiornamento']);

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); srv.close(); process.exit(ko?1:0);
})();
