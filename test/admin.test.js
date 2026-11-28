/* La pagina di amministrazione.
 *
 * Il no vero lo dice il server (worker-admin.test.mjs). Qui si guarda che
 * la pagina non mostri niente a chi non puo', e che ogni tasto chieda al
 * server la cosa giusta — dopo una conferma, quando l'azione toglie
 * qualcosa a qualcuno.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(54)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const apri=async(scena, larghezza=390)=>{
  const p=await b.newPage({viewport:{width:larghezza,height:844}});
  p.errori=[]; p.on('pageerror',e=>p.errori.push(e.message));
  await p.addInitScript((D)=>{ window.D=D; }, require('./admin-dati.js')());
  await p.addInitScript((scena)=>{
    window.CHIESTE=[]; window.SCENA=scena; window.ESITI=[];
    window.DENTRO = scena!=='fuori'; window.ACCESSI=[];
    window.supabase={createClient:()=>({auth:{
      getSession:async()=>({data:{session: DENTRO?{access_token:'tok'}:null}}),
      signInWithPassword:async(c)=>{ ACCESSI.push(c); if(c.password!=='giusta') return {error:{message:'Invalid login credentials'}}; DENTRO=true; SCENA='admin'; return {error:null}; },
      signInWithOAuth:async(c)=>{ ACCESSI.push(c); return {}; },
      signOut:async()=>{ DENTRO=false; return {}; } }})};
    const A='aaaaaaaa-1111-4111-8111-111111111111', L='bbbbbbbb-1111-4111-8111-111111111111', FA='f1f1f1f1-1111-4111-8111-111111111111', FB='f2f2f2f2-1111-4111-8111-111111111111';
    const persone=[{id:A,nome:'Anna',cognome:'Riva',reparto:'Regia',email:'anna@x.it',film:[{id:FA,titolo:'Missione San Gennaro',sigla:'MSG',ruolo:'membro'}],telefoni:1,ultima:new Date().toISOString(),bloccato:false},
                   {id:L,nome:'Luca',cognome:'Berti',reparto:'Fotografia',email:'luca@x.it',film:[],telefoni:0,ultima:null,bloccato:false},
                   {id:'cccccccc-1111-4111-8111-111111111111',nome:'',cognome:'',reparto:'',email:'bloccato@x.it',film:[],telefoni:0,ultima:null,bloccato:true}];
    const scheda={id:A,nome:'Anna',cognome:'Riva',reparto:'Regia',email:'anna@x.it',iscritto:'2026-11-09T10:00:00Z',ultima:new Date().toISOString(),bloccato:false,creaFilm:false,
      film:[{id:FA,titolo:'Missione San Gennaro',sigla:'MSG',ruolo:'membro',segna:true}],telefoni:[{tipo:'iPhone'}],
      notifiche:[{titolo:'MSG - OdG 30',mandato:new Date().toISOString(),mostrato:new Date().toISOString(),dispositivi:1}],uso7:420,consumi:{spoglio:{chiamate:2,entrata:30000,uscita:12000}}};
    window.fetch=async(url,opz)=>{
      if(String(url).includes('sw.js')) return {ok:true,text:async()=>"const CACHE = 'campobase-v175';"};
      const c=JSON.parse(opz.body); CHIESTE.push(c);
      const R=(d,s=200)=>({ok:s<400,status:s,json:async()=>d});
      if(SCENA==='estraneo') return R({error:'Non sei amministratore',admin:false,id:'il-mio-numero'},403);
      if(c.azione==='io') return R({admin:true});
      if(D[c.azione]) return R(D[c.azione]);
      if(c.azione==='persone') return R({persone,film:[{id:FA,titolo:'Missione San Gennaro',sigla:'MSG',membri:9},{id:FB,titolo:'Separazioni',sigla:null,membri:1}]});
      if(c.azione==='persona') return R(scheda);
      if(c.azione==='prova') return R({appuntamento:'n1'});
      if(c.azione==='esito') return R(ESITI.shift()||{mandato:new Date().toISOString(),dispositivi:1,mostrato:new Date().toISOString()});
      if(c.azione==='togli'&&SCENA==='rifiuta') return R({error:'è la persona che ha aperto il film: non si può togliere'},400);
      return R({fatto:true});
    };
  },scena);
  await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.goto('file://' + RADICE + '/admin.html'); await p.waitForTimeout(350); return p;
};
const azioni=p=>p.evaluate(()=>CHIESTE.filter(c=>!/^(io|persone|persona|esito)$/.test(c.azione)));

console.log('\n── ⚠ chi non può non vede niente ──');
let p=await apri('fuori');
ok('l\'ingresso è nudo: due campi e due tasti, niente spiegazioni', await p.evaluate(()=>document.getElementById('porta').innerText.replace(/\s+/g,' ').trim()), 'Entra Entra con Google');
ok('senza accesso: si entra da qui, e non chiede niente al server', [await p.evaluate(()=>!!document.getElementById('aMail')&&!!document.getElementById('aPass')), await p.evaluate(()=>CHIESTE.length), await p.evaluate(()=>document.getElementById('corpo').style.display)], [true,0,'none']);
await p.fill('#aMail',' simone@x.it '); await p.fill('#aPass','sbagliata'); await p.click('#aEntra'); await p.waitForTimeout(150);
ok('⚠ password sbagliata: lo dice e resta fuori', [await p.evaluate(()=>document.getElementById('aErrore').textContent), await p.evaluate(()=>document.getElementById('corpo').style.display), await p.evaluate(()=>CHIESTE.length)], ['Email o password sbagliate.','none',0]);
await p.fill('#aPass','giusta'); await p.click('#aEntra'); await p.waitForTimeout(300);
ok('con quella giusta entra e vede l\'elenco', [await p.evaluate(()=>ACCESSI[1].email), await p.evaluate(()=>document.getElementById('lista').children.length), await p.evaluate(()=>document.getElementById('porta').innerHTML)], ['simone@x.it',3,'']);
await p.evaluate(()=>accediGoogle());
ok('con Google si torna su questa pagina, non nell\'app', await p.evaluate(()=>/\/admin\.html$/.test(ACCESSI[2].options.redirectTo)), true);
await p.click('#esciRiga button'); await p.waitForTimeout(200);
ok('⚠ uscendo l\'elenco sparisce e torna l\'ingresso', [await p.evaluate(()=>document.getElementById('corpo').style.display), await p.evaluate(()=>!!document.getElementById('aMail')), await p.evaluate(()=>getComputedStyle(document.getElementById('esciRiga')).display)], ['none',true,'none']);
ok('nessun errore di pagina', p.errori, []);
await p.close();
p=await apri('estraneo');
ok('⚠ non amministratore: pagina riservata, nessun elenco', [await p.evaluate(()=>/riservata/.test(document.getElementById('porta').textContent)), await p.evaluate(()=>document.getElementById('lista').children.length), await p.evaluate(()=>CHIESTE.map(c=>c.azione))], [true,0,['io']]);
ok('e può uscire per entrare con un altro account', await p.evaluate(()=>!!document.querySelector('#porta button[onclick="esci()"]')), true);
ok('gli viene mostrato solo il suo numero', await p.evaluate(()=>/il-mio-numero/.test(document.getElementById('porta').textContent)), true);
await p.close();

console.log('\n── l\'elenco ──');
p=await apri('admin');
const righe=()=>p.evaluate(()=>[...document.querySelectorAll('#lista .riga')].map(r=>[r.querySelector('.t').textContent, r.querySelector('.s').textContent.split(' · ').slice(0,2).join(' · '), r.querySelector('.tag')?.textContent||'']));
ok('tutti, con film e stato', await righe(), [['Anna Riva','Regia · MSG',''],['Luca Berti','Fotografia · nessun film',''],['bloccato@x.it','nessun film','bloccato']]);
ok('⚠ sulla Home ha la sua icona e il suo nome', await p.evaluate(()=>[document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), document.querySelector('meta[name="apple-mobile-web-app-title"]').content, document.querySelector('link[rel="manifest"]').getAttribute('href')]), ['/admin-180.png','Admin','/admin.webmanifest']);
ok('⚠ in fondo, il numero di questa pagina, non quello dell\'app', await p.evaluate(()=>[document.getElementById('versione').textContent==='A '+ADMIN_VERSIONE, /^\d+\.\d+$/.test(ADMIN_VERSIONE)]), [true, true]);
ok('il conto in fondo', await p.evaluate(()=>document.getElementById('conta').textContent), '3 persone · 1 film con una troupe · 1 di una persona sola');
await p.fill('#cerca','gennaro');
ok('si cerca anche per film', (await righe()).map(r=>r[0]), ['Anna Riva']);
await p.fill('#cerca','');

console.log('\n── la scheda e le azioni ──');
await p.click('#lista .riga'); await p.waitForTimeout(200);
ok('sul telefono si vede la scheda al posto dell\'elenco', await p.evaluate(()=>[getComputedStyle(document.getElementById('elenco')).display, document.querySelector('#scheda .nome').textContent]), ['none','Anna Riva']);
ok('i suoi film, telefoni e ultime notifiche', await p.evaluate(()=>[...document.querySelectorAll('#scheda .kv')].slice(0,3).map(k=>k.lastElementChild.textContent)), ['1 · iPhone', await p.evaluate(()=>document.querySelectorAll('#scheda .kv')[1].lastElementChild.textContent), 'mostrata']);
await p.evaluate(()=>scegliFilm('aggiungi')); await p.waitForTimeout(80);
ok('aggiungere: propone solo i film in cui non è', await p.evaluate(()=>[...document.querySelectorAll('#foglio .riga .t')].map(x=>x.textContent)), ['Separazioni']);
await p.click('#foglio .riga'); await p.waitForTimeout(200);
ok('⚠ e lo chiede al server', await azioni(p), [{azione:'aggiungi',id:'aaaaaaaa-1111-4111-8111-111111111111',film:'f2f2f2f2-1111-4111-8111-111111111111'}]);
await p.evaluate(()=>{ CHIESTE.length=0; togli('f1f1f1f1-1111-4111-8111-111111111111'); }); await p.waitForTimeout(80);
ok('⚠ togliere chiede conferma, col nome e il film', await p.evaluate(()=>document.querySelector('#foglio h3').textContent), 'Togliere Anna Riva da Missione San Gennaro?');
await p.click('#cNo'); await p.waitForTimeout(100);
ok('detto di no, niente parte', await azioni(p), []);
await p.evaluate(()=>{ togli('f1f1f1f1-1111-4111-8111-111111111111'); }); await p.waitForTimeout(80); await p.click('#cSi'); await p.waitForTimeout(200);
ok('detto di sì, parte', (await azioni(p)).map(c=>c.azione), ['togli']);
await p.evaluate(()=>{ CHIESTE.length=0; scegliFilm('sposta','f1f1f1f1-1111-4111-8111-111111111111'); }); await p.waitForTimeout(80); await p.click('#foglio .riga'); await p.waitForTimeout(200);
ok('spostare: da dove e verso dove', await azioni(p), [{azione:'sposta',id:'aaaaaaaa-1111-4111-8111-111111111111',da:'f1f1f1f1-1111-4111-8111-111111111111',a:'f2f2f2f2-1111-4111-8111-111111111111'}]);
/* Chi puo' aprire un film da zero: un interruttore nella scheda. */
ok('l\'interruttore "Può aprire un film da zero" parte spento', await p.evaluate(()=>[document.querySelector('.kv.int span').textContent, document.getElementById('swFilm').getAttribute('aria-pressed')]), ['Può aprire un film da zero','false']);
await p.evaluate(()=>{ CHIESTE.length=0; }); await p.click('#swFilm'); await p.waitForTimeout(200);
ok('⚠ toccandolo lo accende, per quella persona', (await azioni(p)).filter(c=>c.azione==='permesso'), [{azione:'permesso',id:'aaaaaaaa-1111-4111-8111-111111111111',creaFilm:true}]);
await p.evaluate(()=>{ CHIESTE.length=0; blocca(); }); await p.waitForTimeout(80);
ok('⚠ bloccare chiede conferma e dice cosa succede', await p.evaluate(()=>[document.querySelector('#foglio h3').textContent, /non può più entrare/.test(document.querySelector('#foglio .sotto').textContent)]), ['Bloccare Anna Riva?', true]);
await p.click('#cNo'); await p.waitForTimeout(80);
ok('annullato, non blocca', await azioni(p), []);

console.log('\n── ⚠ la prova di notifica ──');
await p.evaluate(()=>{ CHIESTE.length=0; ESITI.push({mandato:null,dispositivi:null,mostrato:null}); });
await p.click('#bProva'); await p.waitForTimeout(2700);
ok('chiesta per quella persona', (await azioni(p)), [{azione:'prova',id:'aaaaaaaa-1111-4111-8111-111111111111'}]);
ok('partita, accettata, mostrata', await p.evaluate(()=>[...document.querySelectorAll('#esito .kv')].map(k=>[k.firstElementChild.textContent, k.lastElementChild.className])), [['Partita','ok'],['Accettata','ok'],['Mostrata sul telefono','ok']]);
ok('e la frase che lo dice', await p.evaluate(()=>/funzionano/.test(document.querySelector('#esito .nota').textContent)), true);
await p.evaluate(()=>{ disegnaEsito('Prova', {mandato:new Date().toISOString(),dispositivi:0}, 3, true); });
ok('senza telefoni iscritti lo spiega', await p.evaluate(()=>/nessun telefono iscritto/.test(document.querySelector('#esito .nota').textContent)), true);
await p.evaluate(()=>{ disegnaEsito('Prova', {mandato:new Date().toISOString(),dispositivi:1}, 60, true); });
ok('⚠ non confermata dopo un minuto: non dice che è arrivata', await p.evaluate(()=>[document.querySelectorAll('#esito .kv')[2].lastElementChild.className, /non confermata/.test(document.querySelector('#esito .nota').textContent)]), ['no', true]);
ok('nessun errore di pagina', p.errori, []);
await p.close();

console.log('\n── un no del server si vede ──');
p=await apri('rifiuta'); await p.click('#lista .riga'); await p.waitForTimeout(200);
await p.evaluate(()=>{ togli('f1f1f1f1-1111-4111-8111-111111111111'); }); await p.waitForTimeout(80); await p.click('#cSi'); await p.waitForTimeout(200);
ok('il motivo compare, in rosso', await p.evaluate(()=>[document.getElementById('avviso').className, document.getElementById('avviso').textContent]), ['on r','è la persona che ha aperto il film: non si può togliere']);
await p.close();

console.log('\n── le altre linguette ──');
p=await apri('admin');
const testo=sel=>p.evaluate(s=>document.querySelector(s).innerText.replace(/\s+/g,' ').trim(), sel);
ok('quattro linguette, parte da Persone', await p.evaluate(()=>[...document.querySelectorAll('#ling button')].map(b=>b.textContent+(b.classList.contains('on')?'*':''))), ['Persone*','Film','Posta','Server']);
await p.click('#ling [data-l=film]'); await p.waitForTimeout(150);
ok('Film: ogni film con persone, ultima mail e spesa', await p.evaluate(()=>[...document.querySelectorAll('#lista .riga')].map(r=>[r.querySelector('.t').textContent, r.querySelector('.s').textContent.replace(/ultima mail [^·]+ ·/,'ultima mail X ·')])),
  [['Missione San Gennaro','16 persone · ultima mail X · $6,42'],['Separazioni','solo Luca Berti']]);
ok('la ricerca delle persone qui non c\'è', await p.evaluate(()=>getComputedStyle(document.getElementById('cerca')).display), 'none');
await p.click('#lista .riga'); await p.waitForTimeout(150);
ok('un film: indirizzo della posta, troupe, costi', [await p.evaluate(()=>/84956e3c3046df55@campobase\.dev/.test(document.querySelector('#scheda .sotto').textContent)), await p.evaluate(()=>document.querySelectorAll('#scheda .card')[0].querySelectorAll('.riga').length), await p.evaluate(()=>[...document.querySelectorAll('#scheda .sez')].slice(-2)[0].textContent)], [true,3,"Costi dall'inizio · $6,42"]);
const fatte=az=>p.evaluate(az=>CHIESTE.filter(c=>c.azione===az), az);
await p.evaluate(()=>{ D.messaggio={fatto:true,persone:3,raggiunte:2}; D.filmCambia={fatto:true}; D.accetta={fatto:true,legge:'server'}; D.scarta={fatto:true}; scriviAllaTroupe(); }); await p.waitForTimeout(100);
ok('⚠ scrivere alla troupe: il tasto dice a quanti arriva, ed è spento finché è vuoto', await p.evaluate(()=>[document.getElementById('mSi').textContent, document.getElementById('mSi').disabled]), ['Manda a 3 persone', true]);
await p.evaluate(()=>chiudiFoglio()); ok('annullando non parte niente', await fatte('messaggio'), []);
await p.evaluate(()=>scriviAllaTroupe()); await p.fill('#mTesto','Domani si gira lo stesso, convocazione invariata.'); await p.click('#mSi'); await p.waitForTimeout(200);
ok('parte col testo scritto, al film giusto', await fatte('messaggio'), [{azione:'messaggio',film:'f1f1f1f1-1111-4111-8111-111111111111',testo:'Domani si gira lo stesso, convocazione invariata.'}]);
ok('e dice a quanti è arrivato davvero', await p.evaluate(()=>document.getElementById('avviso').textContent), 'Mandato a 3 persone · 2 con le notifiche attive');
await p.evaluate(()=>modificaFilm()); await p.waitForTimeout(100);
ok('modificare: i campi partono da quello che c\'è', await p.evaluate(()=>['fTitolo','fSigla','fMittente'].map(k=>document.getElementById(k).value)), ['Missione San Gennaro','MSG','']);
ok('i mittenti attesi stanno in elenco, ognuno con la sua X', await p.evaluate(()=>[...document.querySelectorAll('#fMittenti .mitt-r')].map(r=>[r.querySelector('.m').textContent, !!r.querySelector('.mitt-x')])), [['produzione@esempio.it',true]]);
await p.click('#fSi'); await p.waitForTimeout(100);
ok('senza cambiare niente non si chiede niente', await fatte('filmCambia'), []);
await p.evaluate(()=>modificaFilm()); await p.fill('#fSigla','msg2'); await p.click('#fSi'); await p.waitForTimeout(200);
ok('⚠ si manda solo quello che è cambiato', await fatte('filmCambia'), [{azione:'filmCambia',id:'f1f1f1f1-1111-4111-8111-111111111111',sigla:'msg2'}]);
/* Il codice d'invito si cambia dopo una conferma che dice cosa succede. */
await p.evaluate(()=>{ D.codiceNuovo={fatto:true,codice:'9F3A77C1'}; cambiaCodice(); }); await p.waitForTimeout(100);
ok('cambiare codice: dice quale smette di funzionare', await p.evaluate(()=>document.querySelector('#foglio .sotto').textContent), 'K7QM2X smette di funzionare. Chi è già nel film resta dentro.');
await p.evaluate(()=>chiudiFoglio()); ok('annullando non cambia', await fatte('codiceNuovo'), []);
await p.evaluate(()=>cambiaCodice()); await p.click('#cSi'); await p.waitForTimeout(200);
ok('⚠ confermando chiede il codice nuovo, per quel film', await fatte('codiceNuovo'), [{azione:'codiceNuovo',id:'f1f1f1f1-1111-4111-8111-111111111111'}]);
ok('e lo dice', await p.evaluate(()=>document.getElementById('avviso').textContent), 'Codice nuovo: 9F3A77C1');
/* I mittenti: uno alla volta col +, via con la X dopo la conferma. */
await p.evaluate(()=>{ CHIESTE=CHIESTE.filter(c=>c.azione!=='filmCambia'); modificaFilm(); }); await p.waitForTimeout(100);
await p.fill('#fMittente','non-una-mail'); await p.click('#fMittPiu');
ok('quello che non è un indirizzo non entra', await p.evaluate(()=>[document.querySelectorAll('#fMittenti .mitt-r').length, document.getElementById('avviso').textContent]), [1,'Non è un indirizzo mail']);
await p.fill('#fMittente','Collega@Gmail.com'); await p.click('#fMittPiu');
ok('⚠ il + lo mette in elenco e libera il campo', await p.evaluate(()=>[[...document.querySelectorAll('#fMittenti .m')].map(x=>x.textContent), document.getElementById('fMittente').value]), [['produzione@esempio.it','collega@gmail.com'],'']);
await p.fill('#fMittente','collega@gmail.com'); await p.click('#fMittPiu');
ok('lo stesso indirizzo non entra due volte', await p.evaluate(()=>document.querySelectorAll('#fMittenti .mitt-r').length), 2);
await p.click('#fMittenti .mitt-x[data-x="0"]');
ok('⚠ la X chiede prima', await p.evaluate(()=>[[...document.querySelectorAll('#fMittenti .mitt-r.chiede button')].map(b=>b.textContent), document.querySelectorAll('#fMittenti .mitt-r').length]), [['No','Togli'],2]);
await p.click('#fMittenti [data-no]');
ok('col no resta', await p.evaluate(()=>[...document.querySelectorAll('#fMittenti .m')].map(x=>x.textContent)), ['produzione@esempio.it','collega@gmail.com']);
await p.click('#fMittenti .mitt-x[data-x="0"]'); await p.click('#fMittenti [data-si]');
ok('col sì se ne va', await p.evaluate(()=>[...document.querySelectorAll('#fMittenti .m')].map(x=>x.textContent)), ['collega@gmail.com']);
ok('finché non si salva non parte niente', await fatte('filmCambia'), []);
await p.fill('#fMittente','prod@casa.it'); await p.click('#fSi'); await p.waitForTimeout(200);
ok('⚠ salvando parte l\'elenco, compreso l\'indirizzo scritto e non ancora aggiunto', await fatte('filmCambia'), [{azione:'filmCambia',id:'f1f1f1f1-1111-4111-8111-111111111111',mittente:'collega@gmail.com, prod@casa.it'}]);
await p.evaluate(()=>modificaFilm()); await p.waitForTimeout(100);
await p.click('#fMittenti .mitt-x'); await p.click('#fMittenti [data-si]');
ok('senza mittenti lo dice', await p.evaluate(()=>document.querySelector('#fMittenti .m').textContent), 'Nessuno: la casella accetta qualunque mittente');
await p.evaluate(()=>chiudiFoglio());
await p.evaluate(()=>{ CHIESTE=CHIESTE.filter(c=>!/^(messaggio|filmCambia|codiceNuovo)$/.test(c.azione)); });
const eliminati=()=>p.evaluate(()=>CHIESTE.filter(c=>c.azione==='eliminaFilm'));
await p.click('#scheda .btn.r'); await p.waitForTimeout(100);
ok('⚠ eliminare dice cosa si perde e che non si torna indietro', await p.evaluate(()=>document.querySelector('#foglio .sotto').textContent), 'Si cancellano per sempre: lo spoglio e il piano di Simone Panetta, 30 ordini del giorno, 23 mail con gli allegati. Le 3 persone della troupe non lo vedranno più. Non si può annullare.');
ok('⚠ con una troupe il tasto è spento finché non si scrive il titolo', await p.evaluate(()=>document.getElementById('eSi').disabled), true);
await p.fill('#eParola','missione'); ok('un pezzo di titolo non basta', await p.evaluate(()=>document.getElementById('eSi').disabled), true);
await p.evaluate(()=>chiudiFoglio()); ok('annullando non parte niente', await eliminati(), []);
await p.click('#scheda .btn.r'); await p.waitForTimeout(100); await p.fill('#eParola','Missione San Gennaro'); await p.click('#eSi'); await p.waitForTimeout(250);
ok('col titolo scritto parte, e il film esce dall\'elenco', [await eliminati(), await p.evaluate(()=>document.querySelector('#ling .on').textContent), await p.evaluate(()=>document.body.classList.contains('aperta'))], [[{azione:'eliminaFilm',id:'f1f1f1f1-1111-4111-8111-111111111111',conferma:'Missione San Gennaro'}],'Film',false]);
await p.evaluate(()=>{ CHIESTE=CHIESTE.filter(c=>c.azione!=='eliminaFilm'); return apriFilm(D.FA); }); await p.waitForTimeout(200);
await p.evaluate(()=>{ FILM_APERTO={...FILM_APERTO, membri:FILM_APERTO.membri.slice(0,1), dentro:{analisi:0,odg:0,mail:0}}; eliminaFilm(); }); await p.waitForTimeout(100);
ok('un film vuoto di una persona sola: una conferma semplice', await p.evaluate(()=>[document.querySelector('#foglio .sotto').textContent, !!document.getElementById('eParola'), document.getElementById('eSi').disabled]), ["Dentro non c'è niente. Non si può annullare.", false, false]);
await p.evaluate(()=>chiudiFoglio());
await p.click('#scheda .card .riga'); await p.waitForTimeout(200);
ok('da una persona della troupe si va alla sua scheda', [await p.evaluate(()=>document.querySelector('#ling .on').textContent), await p.evaluate(()=>document.querySelector('#scheda .nome').textContent), await p.evaluate(()=>CHIESTE.slice(-1)[0].azione)], ['Persone','Anna Riva','persona']);
await p.evaluate(()=>vaiA('posta')); await p.waitForTimeout(150);
ok('Posta: le mail con il loro esito', await p.evaluate(()=>[...document.querySelectorAll('#lista .riga')].map(r=>(r.querySelector('.tag')||{}).textContent||'ok')), ['ok','errata','senza allegati','errore']);
ok('e in fondo il conto', await p.evaluate(()=>document.getElementById('conta').textContent), 'ultime 4 mail · 2 lette dal server · 1 errore');
await p.click('#lista .riga'); await p.waitForTimeout(150);
ok('una mail: allegati come li ha capiti', await p.evaluate(()=>[...document.querySelectorAll('#scheda .card')[0].querySelectorAll('.tag')].map(t=>t.textContent)), ['ordine del giorno','giri auto','stralci','scartato']);
ok('e i passi, in ordine, con l\'ora', await p.evaluate(()=>[...document.querySelectorAll('#scheda .passo')].map(x=>x.querySelector('span').textContent)), ['Arrivata','Ordine del giorno: letto in 44 s','Ordine del giorno: scritto','10 notifiche','Indice stralci']);
ok('i tasti di una mail', await p.evaluate(()=>[...document.querySelectorAll('#scheda .btn')].map(b=>b.textContent)), ["Vedi la lettura dell'ordine del giorno","Fai rileggere l'ordine del giorno"]);
await p.click('#scheda .btn'); await p.waitForTimeout(150);
ok('la lettura si apre com\'è', await p.evaluate(()=>[document.getElementById('velo').classList.contains('on'), /"numero": 30/.test(document.querySelector('#foglio pre').textContent)]), [true,true]);
await p.evaluate(()=>chiudiFoglio()); await p.evaluate(()=>chiudiScheda());
await p.evaluate(()=>vaiA('server')); await p.waitForTimeout(150);
ok('Server: stato, costi, chi spende, tempi, versioni, interruttori', await p.evaluate(()=>[...document.querySelectorAll('#lista .sez')].map(x=>x.textContent)), ['Stato, ultimi 7 giorni','Costi','Chi spende dal telefono','Tempo di lettura',"Versione dell'app",'Interruttori']);
ok('il grafico dei giorni: una colonna per giorno con spesa, quattordici zone da toccare', await p.evaluate(()=>{ const g=document.querySelectorAll('#lista .graf')[0]; return [g.querySelectorAll('path.b').length, g.querySelectorAll('.tocca').length]; }), [11,14]);
ok('sul grafico solo il massimo e l\'ultimo, il resto toccando', await p.evaluate(()=>{ const g=document.querySelectorAll('#lista .graf')[0]; g.querySelectorAll('.tocca')[9].dispatchEvent(new MouseEvent('click',{bubbles:true})); return [[...g.querySelectorAll('text.v')].map(t=>t.textContent), /· \$1,24 · 10 chiamate$/.test(g.querySelector('.dice').textContent)]; }), [['$1,24','$0,17'],true]);
ok('i tempi di lettura: il picco si vede e si legge', await p.evaluate(()=>{ const g=document.querySelectorAll('#lista .graf')[1]; g.querySelectorAll('.tocca')[6].dispatchEvent(new MouseEvent('click',{bubbles:true})); return [[...g.querySelectorAll('text.v')].map(t=>t.textContent), /95 s · MSG - ODG #26$/.test(g.querySelector('.dice').textContent)]; }), [['95 s','44 s'],true]);
ok('chi è rimasto indietro con l\'app', await p.evaluate(()=>{ const c=[...document.querySelectorAll('#lista .sez')].find(x=>/Versione/.test(x.textContent)).nextElementSibling; return [c.querySelector('.kv').innerText.replace(/\s+/g,' '), [...c.querySelectorAll('.riga')].map(r=>r.querySelector('.t').textContent+' '+r.querySelector('.tag').textContent)]; }), ['La più recente vista 1.176 · 12 persone',['Luca Berti 1.171']]);
ok('i tre totali', await p.evaluate(()=>[...document.querySelectorAll('#lista .tre b')].map(x=>x.textContent)), ['$0,17','$3,80','$6,42']);
ok('⚠ dice che è una stima e con quale listino', await p.evaluate(()=>/Stima dai token, al listino: sonnet-5-5 \$2 \/ \$10 · haiku-5-5 \$0,1 \/ \$0,5/.test(document.querySelector('#lista').innerText)), true);
ok('⚠ gli interruttori si leggono soltanto', await p.evaluate(()=>{ const c=[...document.querySelectorAll('#lista .sez')].find(x=>x.textContent==='Interruttori').nextElementSibling; return [c.querySelectorAll('button, input').length, /variabili di Cloudflare/.test(document.querySelector('#lista').innerText)]; }), [0,true]);
await p.evaluate(D=>{ vaiA('posta'); return apriMail(D.M1); }, require('./admin-dati.js')()); await p.waitForTimeout(250);
const rileggiChieste=()=>p.evaluate(()=>CHIESTE.filter(c=>c.azione==='rileggi'));
await p.click('#scheda .btn:last-of-type'); await p.waitForTimeout(100);
ok('⚠ far rileggere chiede prima: senza avvisare, avvisando, o niente', await p.evaluate(()=>[...document.querySelectorAll('#foglio .btn')].map(b=>b.textContent)), ['Rileggi senza avvisare','Rileggi e manda la notifica a tutta la troupe','Annulla']);
await p.evaluate(()=>chiudiFoglio()); await p.waitForTimeout(80);
ok('⚠ chiudere senza scegliere non fa partire niente', await rileggiChieste(), []);
await p.click('#scheda .btn:last-of-type'); await p.waitForTimeout(100); await p.click('#rMuta'); await p.waitForTimeout(250);
ok('⚠ senza avvisare: lo dice al server chiaro e tondo', await rileggiChieste(), [{azione:'rileggi',id:'11111111-2222-4222-8222-222222222222',cosa:'odg',notifiche:false}]);
await p.evaluate(()=>{ D.mail={...D.mail, esito:'in rilettura', colore:'y'}; }); await p.evaluate(D=>apriMail(D.M1), require('./admin-dati.js')()); await p.waitForTimeout(250);
ok('⚠ mentre rilegge il tasto non c\'è: non si chiede due volte', await p.evaluate(()=>[[...document.querySelectorAll('#scheda .btn')].some(b=>/rileggere/.test(b.textContent)), /sta rileggendo/.test(document.getElementById('scheda').innerText)]), [false,true]);
await p.evaluate(()=>{ D.mail={...D.mail, esito:'letta', colore:'g'}; rileggi(D.M1,'odg'); }); await p.waitForTimeout(100); await p.click('#rAvvisa'); await p.waitForTimeout(250);
ok('avvisando: con il sì esplicito', (await rileggiChieste()).map(c=>c.notifiche), [false,true]);
await p.evaluate(()=>{ D.mail={...D.mail, esito:'da verificare', colore:'y'}; return apriMail(D.M1); }); await p.waitForTimeout(250);
ok('una mail messa da parte: si accetta o si scarta, non si rilegge', await p.evaluate(()=>[...document.querySelectorAll('#scheda .btn')].map(b=>b.textContent)), ['Accetta e leggi','Scarta',"Vedi la lettura dell'ordine del giorno"]);
await p.click('#scheda .btn.r'); await p.waitForTimeout(100); await p.evaluate(()=>chiudiFoglio());
ok('⚠ scartare chiede conferma', await p.evaluate(()=>CHIESTE.filter(c=>c.azione==='scarta').length), 0);
await p.click('#scheda .btn.r'); await p.waitForTimeout(100); await p.click('#sSi'); await p.waitForTimeout(200);
await p.evaluate(()=>accettaMail(D.M1)); await p.waitForTimeout(200);
ok('scarta e accetta partono per quella mail', await p.evaluate(()=>CHIESTE.filter(c=>/^(scarta|accetta)$/.test(c.azione)).map(c=>c.azione+' '+c.id.slice(0,8))), ['scarta 11111111','accetta 11111111']);
await p.evaluate(()=>{ D.mail={...D.mail, esito:'letta', colore:'g'}; CHIESTE=CHIESTE.filter(c=>!/^(rileggi|scarta|accetta)$/.test(c.azione)); chiudiScheda(); });
ok('⚠ a parte la rilettura chiesta apposta, al server solo domande', await p.evaluate(()=>[...new Set(CHIESTE.map(c=>c.azione))].sort()), ['film','filmUno','io','lettura','mail','persona','persone','posta','server']);
await p.evaluate(()=>vaiA('persone')); await p.waitForTimeout(150);
ok('tornando a Persone c\'è di nuovo l\'elenco', [await p.evaluate(()=>document.querySelectorAll('#lista .riga').length), await p.evaluate(()=>document.getElementById('lista').className)], [3,'card']);
ok('nessun errore di pagina', p.errori, []);
await p.close();

console.log('\n── su uno schermo largo ──');
p=await apri('admin',1200); await p.click('#lista .riga'); await p.waitForTimeout(200);
ok('elenco e scheda insieme', await p.evaluate(()=>[getComputedStyle(document.getElementById('elenco')).display, !!document.querySelector('#scheda .nome'), document.querySelector('#lista .riga').classList.contains('sel')]), ['block', true, true]);
await p.close();

await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
