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
    const scheda={id:A,nome:'Anna',cognome:'Riva',reparto:'Regia',email:'anna@x.it',iscritto:'2026-11-09T10:00:00Z',ultima:new Date().toISOString(),bloccato:false,
      film:[{id:FA,titolo:'Missione San Gennaro',sigla:'MSG',ruolo:'membro',segna:true}],telefoni:[{tipo:'iPhone'}],
      notifiche:[{titolo:'MSG - OdG 30',mandato:new Date().toISOString(),mostrato:new Date().toISOString(),dispositivi:1}],uso7:420,consumi:{spoglio:{chiamate:2,entrata:30000,uscita:12000}}};
    window.fetch=async(url,opz)=>{
      if(String(url).includes('sw.js')) return {ok:true,text:async()=>"const CACHE = 'campobase-v175';"};
      const c=JSON.parse(opz.body); CHIESTE.push(c);
      const R=(d,s=200)=>({ok:s<400,status:s,json:async()=>d});
      if(SCENA==='estraneo') return R({error:'Non sei amministratore',admin:false,id:'il-mio-numero'},403);
      if(c.azione==='io') return R({admin:true});
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

console.log('\n── su uno schermo largo ──');
p=await apri('admin',1200); await p.click('#lista .riga'); await p.waitForTimeout(200);
ok('elenco e scheda insieme', await p.evaluate(()=>[getComputedStyle(document.getElementById('elenco')).display, !!document.querySelector('#scheda .nome'), document.querySelector('#lista .riga').classList.contains('sel')]), ['block', true, true]);
await p.close();

await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
