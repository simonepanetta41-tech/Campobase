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

console.log('\n── ⚠ il posto, quando il foglio non ha link ──');
{ const r=await p.evaluate(async()=>{
    const veri=[odgCoordinate, odgCoordDaLink]; const chiesti=[];
    odgCoordinate=async(c)=>{ chiesti.push('comune:'+c); return {lat:1,lon:2,nome:c}; };
    odgCoordDaLink=async(u)=>{ chiesti.push('link:'+u); if(/rotto/.test(u)) throw new Error('niente'); return {lat:3,lon:4,nome:'dal link'}; };
    const prova=async(d)=>{ chiesti.length=0; const x=await odgPosto(d); return [x&&x.nome, chiesti.slice(), d.motivoPosto||'']; };
    const msg={luoghi:[{nome:'Location',url:'',indirizzo:'SEMINARIO ARCIVESCOVILE ALESSIO ASCALESI'},
                       {nome:'Mezzi tecnici',url:'',indirizzo:'Viale Colli Aminei, 3, 80131 Napoli NA'}]};
    const out={ msg: await prova(msg),
      link:    await prova({luoghi:[{nome:'Mezzi tecnici',url:'',indirizzo:'Via Roma 1, 00100 Roma RM'},{nome:'Set',url:'https://maps/x',indirizzo:''}]}),
      rotto:   await prova({luoghi:[{nome:'Set',url:'https://maps/rotto',indirizzo:'Via del Faro, 58, 74122 Taranto (TA)'}]}),
      ponticelli: (await prova({luoghi:[{nome:'Set',url:'https://www.google.com/rotto',indirizzo:'Via Angelo Camillo De Meis, 221, 80147 Ponticelli, Napoli'}],
                    ospedale:'OSPEDALE SAN GIUSEPPE MOSCATI VIA PER MARTINA FRANCA STATTE'})).slice(0,2),
      osp:     await prova({luoghi:[], ospedale:'PRONTO SOCCORSO DEL C.T.O. DI NAPOLI - Viale Colli Aminei, 21, 80131 Napoli NA'}),
      niente:  await prova({luoghi:[{nome:'Location',url:'',indirizzo:'CASA PAESE'}], ospedale:'OSPEDALE MOSCATI - VIA PER MARTINA FRANCA'}),
      forme:[odgComuneCap('Via Angelo Camillo De Meis, 221, 80147 Ponticelli, Napoli'), odgComuneCap('Via del Faro, 58, 74122 Taranto (TA)'),
             odgComuneCap('Via Appia 1, 00100 Roma RM, Italia'), odgComuneCap('Via X 3, 80147 Ponticelli, Napoli (NA)'), odgComuneCap('Via X, 80147 221/B')],
      cap:[odgComuneCap('Viale Colli Aminei, 3, 80131 Napoli NA'), odgComuneCap('SEMINARIO ARCIVESCOVILE'), odgComuneCap('Via X, 74023 Grottaglie'), odgComuneCap('')] };
    [odgCoordinate, odgCoordDaLink]=veri; return out; });
  ok('⚠ dall\'indirizzo dei mezzi tecnici, non dal nome della location', r.msg, ['Napoli',['comune:Napoli'],'']);
  ok('un link vince sempre su un indirizzo', r.link, ['dal link',['link:https://maps/x'],'']);
  ok('link rotto: si ripiega sull\'indirizzo', r.rotto.slice(0,2), ['Taranto',['link:https://maps/rotto','comune:Taranto']]);
  ok('⚠ l\'ospedale non si usa: può essere quello di un\'altra città', r.osp, [null,[],"nei documenti non c'è un indirizzo con il CAP"]);
  ok('⚠ il set del 21 novembre: quartiere e poi comune', r.ponticelli, ['Napoli',['link:https://www.google.com/rotto','comune:Napoli']]);
  ok('⚠ senza un CAP da nessuna parte, nessun meteo', r.niente, [null,[],"nei documenti non c'è un indirizzo con il CAP"]);
  ok('il comune si prende solo dietro a un CAP', r.cap, ['Napoli',null,'Grottaglie',null]);
  ok('⚠ le forme che si incontrano', r.forme, ['Napoli','Taranto','Roma','Napoli',null]);
}

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
ok('⚠ minima e massima uguali: un numero solo', await p.evaluate(()=>{
  const v=odgCorrente.previsione, tieni=[v.min,v.max]; v.min=19; v.max=19; odgRender();
  const t=[...document.querySelectorAll('#odgCorpo .k')].find(k=>k.textContent==='temp').nextElementSibling.textContent;
  [v.min,v.max]=tieni; odgRender(); return t; }), '19°');

console.log('\n── ⚠ dove porta "Mappa", col foglio del 21 novembre ──');
{ const r=await p.evaluate(()=>{
    const L=[{nome:'Set',url:'https://www.google.com/maps/search/?api=1&query=SET',indirizzo:'Via Angelo Camillo De Meis, 221, 80147 Ponticelli, Napoli'},
             {nome:'Location',url:'',indirizzo:'MASSERIA MORABITO'},
             {nome:'Mezzi tecnici',url:'',indirizzo:'@set'}];
    const q=u=>decodeURIComponent(u.split('query=')[1]||u);
    const tieni=[odgCorrente.luoghi]; odgCorrente.luoghi=L; odgRender();
    const righe=[...document.querySelectorAll('#odgCorpo .odg-posto')].filter(x=>/^(Set|Location|Mezzi tecnici)$/.test(x.querySelector('.t').textContent))
      .map(x=>[x.querySelector('.t').textContent, x.querySelector('.s').textContent, q(x.getAttribute('href'))]);
    [odgCorrente.luoghi]=tieni; odgRender();
    return { righe,
      vero:[odgUrlVero('https://maps.app.goo.gl/5aLY'), odgUrlVero('https://www.google.com/maps/place/X/@40.85,14.33,17z'), odgUrlVero('https://maps.google.com/?q=40.8512,14.3301'),
            odgUrlVero('https://www.google.com/maps/search/?api=1&query=SET'), odgUrlVero('https://www.google.com/search?q=set'), odgUrlVero('set')].map(x=>x?'sì':'no'),
      setConLink: odgLinkPosto({nome:'Mezzi tecnici',indirizzo:'@set'},[{nome:'Set',url:'https://maps.app.goo.gl/abc',indirizzo:'x'},{nome:'Mezzi tecnici',indirizzo:'@set'}]),
      soloNome: q(odgLinkPosto({nome:'Location',indirizzo:'CAVA DI FAGGIANO'},[{nome:'Location',indirizzo:'CAVA DI FAGGIANO'}])),
      alSet:['@set','@ set','c/o set','presso il set','Al set','set di Via Roma'].map(odgAlSet) }; });
  ok('⚠ il set: l\'indirizzo, non la ricerca di "SET"', r.righe[0], ['Set','Via Angelo Camillo De Meis, 221, 80147 Ponticelli, Napoli','Via Angelo Camillo De Meis, 221, 80147 Ponticelli, Napoli']);
  ok('⚠ un nome solo: cercato nel comune della giornata', r.righe[1], ['Location','MASSERIA MORABITO','MASSERIA MORABITO, Napoli']);
  ok('⚠ "@set" porta dove porta il set, e lo dice', r.righe[2], ['Mezzi tecnici','Al set','Via Angelo Camillo De Meis, 221, 80147 Ponticelli, Napoli']);
  ok('un punto è un link, una ricerca no', r.vero, ['sì','sì','sì','no','no','no']);
  ok('"@set" con un set che ha il suo link: quello', r.setConLink, 'https://maps.app.goo.gl/abc');
  ok('senza un comune da nessuna parte, il nome com\'è', r.soloNome, 'CAVA DI FAGGIANO');
  ok('i modi di dire "al set"', r.alSet, [true,true,true,true,true,false]);
}

console.log('\n── ⚠ come arrivare al set, sotto il set ──');
{ const r=await p.evaluate(()=>{
    const tieni=[odgCorrente.luoghi, odgCorrente.indicazioni, odgCorrente.location];
    const leggi=()=>{ const e=document.querySelector('#odgCorpo .odg-arrivo'); if(!e) return null;
      return { aperto:e.open, titolo:e.querySelector('summary').textContent.replace(/\s+/g,' ').trim(), prima:e.previousElementSibling?.querySelector('.t')?.textContent||null,
        passi:[...e.querySelectorAll('.odg-passo')].map(x=>[x.querySelector('.num')?.textContent||'', x.querySelector('.tx').firstChild.textContent, x.querySelector('a')?.getAttribute('href')||'']) }; };
    odgCorrente.luoghi=[{nome:'Mezzi tecnici',url:'',indirizzo:'Via X, 74023 Grottaglie TA'},{nome:'Set',url:'',indirizzo:'MASSERIA LAMIE'}];
    odgCorrente.indicazioni=[]; odgRender(); const senza=leggi();
    odgCorrente.indicazioni=[{testo:'Inserire come prima indicazione il distributore',link:'https://maps.app.goo.gl/abc'},{testo:'Proseguire dritto per 800 metri',link:''}];
    odgRender(); const due=leggi();
    odgCorrente.indicazioni=[{testo:'Impostare prima Via Roma e poi andare dritto fino alla cava.',link:''}]; odgRender(); const uno=leggi();
    odgCorrente.luoghi=[]; odgCorrente.location=''; odgRender(); const soli=leggi();
    [odgCorrente.luoghi, odgCorrente.indicazioni, odgCorrente.location]=tieni; odgRender(); return {senza,due,uno,soli}; });
  ok('senza indicazioni, niente riga', r.senza, null);
  ok('⚠ chiusa, sotto il set e non sotto il primo posto', [r.due.aperto, r.due.titolo, r.due.prima], [false, '›Come arrivare al set2 passi', 'Set']);
  ok('⚠ i passi nell\'ordine, col link dove c\'è', r.due.passi, [['1','Inserire come prima indicazione il distributore','https://maps.app.goo.gl/abc'],['2','Proseguire dritto per 800 metri','']]);
  ok('una frase sola: niente numeri né conteggio', [r.uno.titolo, r.uno.passi], ['›Come arrivare al set', [['','Impostare prima Via Roma e poi andare dritto fino alla cava.','']]]);
  ok('senza posti nel foglio, le indicazioni si vedono lo stesso', r.soli && r.soli.passi.length, 1);
}

console.log('\n── ⚠ l\'errata corrige, in cima all\'ordine del giorno ──');
{ const r=await p.evaluate(()=>{
    const tieni=[odgCorrente.errata, currentUser]; currentUser={id:'u1'};
    const leggi=()=>[...document.querySelectorAll('#odgCorpo .odg-errata')].map(e=>({ t:e.querySelector('.et').firstChild.textContent.trim(),
      righe:[...e.querySelectorAll('p')].map(x=>x.textContent), perTe:[...e.querySelectorAll('.pt .r')].map(x=>[x.firstElementChild.textContent, x.querySelector('s').textContent, x.lastElementChild.lastChild.textContent]) }));
    odgCorrente.errata=undefined; odgRender(); const senza=leggi().length;
    odgCorrente.errata=[{quando:'2026-11-17T20:40:00Z',tipo:'errata',righe:['Convocazione posticipata alle ore 12:30'],
      perChi:{u1:[['Convocazione','12.00','12.30'],['Pick-up','11.35','12.05']], u2:[['Pick-up','13.00','—']]}}];
    odgRender(); const una=leggi();
    const c=document.getElementById('odgCorpo'), box=c.querySelector('.odg-errata');
    const primaDiTutto=!!(box.compareDocumentPosition(c.querySelector('.odg-orari')||c.querySelector('.card')) & Node.DOCUMENT_POSITION_FOLLOWING);
    currentUser={id:'u9'}; odgRender(); const altro=leggi();
    currentUser={id:'u1'};
    odgCorrente.errata.push({quando:'2026-11-17T22:05:00Z',tipo:'aggiornato',righe:[],perChi:{}});
    odgRender(); const due=leggi();
    [odgCorrente.errata, currentUser]=tieni; odgRender(); return {senza,una,primaDiTutto,altro,due}; });
  ok('senza errata, nessun riquadro', r.senza, 0);
  ok('⚠ le parole della produzione, e cosa cambia per me', r.una, [{t:'Errata corrige',righe:['Convocazione posticipata alle ore 12:30'],perTe:[['Convocazione','12.00','12.30'],['Pick-up','11.35','12.05']]}]);
  ok('⚠ sta sopra gli orari', r.primaDiTutto, true);
  ok('a chi non cambia niente, solo le parole della produzione', r.altro[0].perTe, []);
  ok('due lo stesso giorno: restano tutte e due, numerate', r.due.map(x=>[x.t,x.righe]), [['Errata corrige 1',['Convocazione posticipata alle ore 12:30']],['Aggiornato 2',["La produzione ha rimandato l'ordine del giorno."]]]);
}

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
