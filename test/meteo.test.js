// Il meteo parte dal link della produzione, non da cosa c'è scritto.
//
// Questo test serve la pagina da un server vero invece che da file://:
// odgCoordDaLink chiama /api/mappa, e una fetch relativa da una pagina
// file:// non parte nemmeno — il browser la blocca prima di arrivare alle
// rotte finte.
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
const http=require('http'); const fs=require('fs');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(100)+` atteso ${JSON.stringify(exp)}`);};

const ch={mappa:[],geo:[],meteo:[]};
const svuota=()=>{ch.mappa.length=0;ch.geo.length=0;ch.meteo.length=0;};

const srv=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/mappa')){
    let corpo=''; req.on('data',d=>corpo+=d);
    req.on('end',()=>{
      const u=(JSON.parse(corpo||'{}').url)||''; ch.mappa.push(u);
      res.writeHead(/CAMPOBASE/.test(u)?200:404,{'content-type':'application/json'});
      res.end(/CAMPOBASE/.test(u)
        ? JSON.stringify({lat:40.4712,lon:17.2033,nome:'Masseria Accetta Grande'})
        : JSON.stringify({error:'Coordinate non trovate'}));
    });
    return;
  }
  const f=RADICE+(req.url==='/'?'/index.html':req.url.split('?')[0]);
  try { res.writeHead(200,{'content-type':f.endsWith('.js')?'text/javascript':'text/html'});
        res.end(fs.readFileSync(f)); }
  catch(_){ res.writeHead(404); res.end(); }
});

(async()=>{
await new Promise(r=>srv.listen(0,r));
const porta=srv.address().port;
const b=await chromium.launch();
// Servendo da http il service worker si registra davvero e si mette in
// mezzo alle chiamate, prima delle rotte finte. Qui va spento.
const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,serviceWorkers:'block'});
const p=await ctx.newPage();
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:{access_token:'t',user:{id:'u1',email:'s@x.it'}}}}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},
             limit:async()=>({data:[]}),upsert:async()=>({error:null}),maybeSingle:async()=>({data:null})}),
  storage:{from:()=>({})}})};});

// Il generico PRIMA: fra le rotte vince l'ultima iscritta, e un catch-all
// messo in fondo si mangerebbe tutte le altre.
const CORS={'access-control-allow-origin':'*'};
await p.route('**',r=>/^http:\/\/(localhost|127\.)/.test(r.request().url())?r.continue():r.abort());
await p.route('**geocoding-api.open-meteo.com**',r=>{ ch.geo.push(r.request().url());
  return r.fulfill({status:200,contentType:'application/json',headers:CORS,
    body:JSON.stringify({results:[{latitude:45.67,longitude:12.16,name:'Paese'}]})});});
let CODICI = null;   // null = sereno/poco nuvoloso per tutte le ore
await p.route('**api.open-meteo.com/v1/forecast**',r=>{ ch.meteo.push(r.request().url());
  const ore=[...Array(24)].map((_,i)=>`2026-11-10T${String(i).padStart(2,'0')}:00`);
  const cod = ore.map((_,i)=>CODICI? (CODICI[i] ?? 1) : 1);
  return r.fulfill({status:200,contentType:'application/json',headers:CORS,
    body:JSON.stringify({hourly:{time:ore,temperature_2m:ore.map((_,i)=>10+(i%6)),
      precipitation_probability:ore.map(()=>10),weather_code:cod,wind_speed_10m:ore.map(()=>9)}})});});

await p.goto('http://localhost:'+porta+'/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(800);

console.log('\n── con i link della produzione ──');
const r1=await p.evaluate(async()=>{
  const d={data:'2026-11-10',convocazione:'07.30',fineRiprese:'19.00',
    ambiente:'CASA PAESE',location:null,
    luoghi:[{nome:'Mezzi tecnici',url:'https://maps.app.goo.gl/MEZZI'},
            {nome:'Campo base',   url:'https://maps.app.goo.gl/CAMPOBASE'}]};
  return {prev:await odgPrevisione(d), posto:d.posto};
});
// Il campo base viene prima dei mezzi, e appena uno risponde si smette.
ok('comincia dal campo base e si ferma lì', ch.mappa, ['https://maps.app.goo.gl/CAMPOBASE']);
ok('e trova il posto vero',     r1.posto && r1.posto.nome, 'Masseria Accetta Grande');
ok('col meteo di lì',           r1.prev && r1.prev.comune, 'Masseria Accetta Grande');
ok('"CASA PAESE" non è un paese: nessun geocoder', ch.geo, []);
ok('le coordinate sono quelle del link', /latitude=40.4712/.test(ch.meteo[0]||''), true);

svuota();
console.log('\n── un link che non si scioglie ──');
const r2=await p.evaluate(async()=>odgPrevisione({data:'2026-11-10',ambiente:'CASA PAESE',location:null,
  luoghi:[{nome:'Mezzi tecnici',url:'https://maps.app.goo.gl/MEZZI'}]}));
ok('niente meteo inventato',            r2, null);
ok('e nessuna ricerca su "CASA PAESE"', ch.geo, []);

svuota();
console.log('\n── un ordine del giorno all\'antica ──');
const r3=await p.evaluate(async()=>odgPrevisione(
  {data:'2026-11-10',location:'Via del Faro, 58, 74122 Taranto TA',luoghi:[]}));
ok('l\'indirizzo scritto si usa ancora', /name=Taranto/.test(ch.geo[0]||''), true);
ok('e il meteo arriva',                  !!r3 && r3.max, 15);

svuota();
console.log('\n── una seconda occhiata non rifà il giro ──');
await p.evaluate(async()=>{const d={data:'2026-11-10',
  luoghi:[{nome:'Campo base',url:'https://maps.app.goo.gl/CAMPOBASE'}]};
  await odgPrevisione(d); await odgPrevisione(d);});
ok('il link si scioglie una volta sola', ch.mappa.length, 1);

svuota();
console.log('\n── una previsione vecchia non si tiene ──');
const r5=await p.evaluate(async()=>{
  const fatta=[];
  odgCorrente={data:'2026-11-10',luoghi:[{nome:'Campo base',url:'https://maps.app.goo.gl/CAMPOBASE'}],
    // com'era salvata: presa col vecchio modo, quello che leggeva l'ambiente
    previsione:{comune:'Paese',cielo:'Pioggia',segno:'☂',min:4,max:9,da:7,a:19}};
  await odgCaricaMeteo();
  fatta.push(odgCorrente.previsione.comune);
  // adesso e' fresca: non si richiede
  await odgCaricaMeteo();
  return {comune:fatta[0], versione:odgCorrente.previsione.v, attesa:ODG_METEO_V};
});
ok('quella di Treviso se ne va', r5.comune, 'Masseria Accetta Grande');
// Il marchio e' quello corrente, qualunque sia: scritto a mano, questo
// controllo falliva ogni volta che si cambiava il modo di cercare il posto.
ok('e la nuova porta il suo marchio', r5.versione, r5.attesa);
ok('ma non si richiede ogni volta', ch.mappa.length, 1);

svuota();
console.log('\n── una previsione di tre ore fa non è più una previsione ──');
const r6=await p.evaluate(async()=>{
  odgCorrente={data:'2026-11-10',luoghi:[{nome:'Campo base',url:'https://maps.app.goo.gl/CAMPOBASE'}],
    previsione:{v:3,chiesta:new Date(Date.now()-4*3600e3).toISOString(),comune:'Vecchia',max:3}};
  await odgCaricaMeteo();
  return odgCorrente.previsione.comune;
});
ok('si rifà', r6, 'Masseria Accetta Grande');

svuota();
console.log('\n── chi ha rinunciato col vecchio modo riprova ──');
const r7=await p.evaluate(async()=>{
  odgCorrente={data:'2026-11-10',luoghi:[{nome:'Campo base',url:'https://maps.app.goo.gl/CAMPOBASE'}],
    previsioneFallita:true};          // com'era segnata prima: solo "fallita"
  await odgCaricaMeteo();
  return odgCorrente.previsione && odgCorrente.previsione.comune;
});
ok('riprova e ci riesce', r7, 'Masseria Accetta Grande');

svuota();
console.log('\n── la parola descrive la giornata, non l\'ora peggiore ──');
const cielo = async cod => { CODICI = cod; return p.evaluate(async()=>{
  odgCorrente=null;
  const d={data:'2026-11-10',convocazione:'08.30',fineLavorazione:'16.30',
    luoghi:[{nome:'Campo base',url:'https://maps.app.goo.gl/CAMPOBASE'}]};
  const pr=await odgPrevisione(d); return pr && pr.cielo; }); };
// Il caso di Missione San Gennaro: nove ore di sole, una di pioviggine.
const uno = [...Array(24)].fill(0); uno[13] = 51;
ok('una pioviggine non fa una giornata di pioggia', await cielo(uno), 'Sereno');
// Mezza giornata bagnata invece lo è.
const meta = [...Array(24)].fill(0); for (let i=8;i<13;i++) meta[i]=61;
ok('mezza giornata bagnata sì',   await cielo(meta), 'Pioggia');
// E quando piove si nomina la più forte, che è quella per cui ci si copre.
const forte = [...Array(24)].fill(0); for (let i=8;i<12;i++) forte[i]=51; forte[12]=95; forte[13]=95;
ok('e si nomina la più forte',    await cielo(forte), 'Temporale');
const coperto = [...Array(24)].fill(3); coperto[9]=0;
ok('una giornata coperta è coperta', await cielo(coperto), 'Coperto');
CODICI = null;

console.log('\n── il comune dagli indirizzi scritti ──');
ok('col CAP',      await p.evaluate(()=>odgComune('Via del Faro, 58, 74122 Taranto TA')), 'Taranto');
ok('col trattino', await p.evaluate(()=>odgComune('Masseria Lamie Strada Vicinale Citrezze - Monteiasi')), 'Monteiasi');
ok('senza niente', await p.evaluate(()=>odgComune('Grottaglie')), 'Grottaglie');
ok('e vuoto è vuoto', await p.evaluate(()=>odgComune('')), null);

console.log('\n── come si vede nella scheda ──');
await p.evaluate(()=>{
  odgCorrente={data:'2026-11-10',numero:21,scene:[],
    previsione:{comune:'Masseria Accetta Grande',cielo:'Sereno',segno:'☀',min:10,max:15,
                pioggia:10,vento:9,da:7,a:19,
                ore:[{h:7,g:0,t:10,p:10,vt:9,c:0},{h:8,g:0,t:12,p:10,vt:9,c:0}]}};
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
  switchResultTab('odg');
});
await p.waitForTimeout(300);
const testo=await p.evaluate(()=>document.getElementById('odgCorpo').textContent);
ok('le temperature ci sono',/10/.test(testo) && /15/.test(testo), true);
/* Il nome del posto non sta piu' sulla scheda — era una riga in piu' su
   una pagina che si legge di corsa — ma non si puo' perdere: e' l'unico
   modo per accorgersi che il meteo sta guardando il comune sbagliato,
   che e' gia' successo (una troupe in Puglia con la previsione di
   Treviso). Adesso sta in testa alla finestra, a un tocco di distanza. */
ok('la scheda non lo ripete', /Masseria Accetta Grande/.test(testo), false);
ok('ma la finestra lo dice',  await p.evaluate(()=>{
  meteoApri(new Date('2026-11-10T06:00:00'));
  return document.querySelector('#odgMeteo .sc-h').textContent;
}), 'Masseria Accetta Grande · martedì 10 novembre');

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); srv.close(); process.exit(ko?1:0);})();
