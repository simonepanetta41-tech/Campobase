const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(92)+` atteso ${JSON.stringify(exp)}`);};

// Un finto Supabase che tiene conto di chi sta dentro al film.
const FINTO = `window.__db = {
  progetto:{id:'p1',titolo:'Missione San Gennaro',codice:'A1B2C3D4',casella:'cafebabecafebabe',user_id:'u1'},
  membri:[{user_id:'u1',ruolo:'capo',created_at:'1'}],
  profili:{u1:{id:'u1',nome:'Simone',cognome:'Panetta',reparto:'Suono'},
           u2:{id:'u2',nome:'Alfredo',cognome:'De Marchi',reparto:'Suono'}},
  odg:[], rpc:[], aggiornamenti:[]
};
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc:async(nome,arg)=>{ __db.rpc.push([nome,arg]);
    // I nomi della troupe passano da una funzione, non da profiles: quella
    // tabella e' chiusa e dentro ci sono anche le email.
    if (nome==='troupe_del_film') return {data:__db.membri.map(m=>{
      const p=__db.profili[m.user_id]||{};
      return {user_id:m.user_id, ruolo:m.ruolo, entrato:m.created_at,
              nome:p.nome, cognome:p.cognome, reparto:p.reparto};}), error:null};
    if (nome!=='entra_nel_film') return {data:null,error:{message:'?'}};
    if (String(arg.codice_invito).toUpperCase()!==__db.progetto.codice)
      return {data:null,error:{message:'codice non valido'}};
    if(!__db.membri.some(m=>m.user_id===currentUser.id))
      __db.membri.push({user_id:currentUser.id,ruolo:'membro',created_at:'2'});
    return {data:[{id:__db.progetto.id,titolo:__db.progetto.titolo}],error:null};},
  from:(t)=>{const q={_t:t,_f:{},select(){return q},eq(k,v){q._f[k]=v;return q},
    in(k,v){q._in=v;return Promise.resolve({data:(v||[]).map(x=>__db.profili[x]).filter(Boolean)})},
    order(){return q},maybeSingle(){return Promise.resolve({data:t==='projects'?__db.progetto:null})},
    single(){return Promise.resolve({data:null})},
    update(v){__db.aggiornamenti.push([t,v]);Object.assign(__db.progetto,v);return {eq:async()=>({error:null})}},
    upsert:async(r)=>{__db.odg.push(r);return {error:null}},
    limit:async()=>({data:t==='odg'?__db.odg.filter(x=>!q._f.project_id||x.project_id===q._f.project_id)
                                      .map(x=>({dati:x.dati,data:x.data})):[]}),
    then:(f)=>Promise.resolve({data:t==='film_membri'?__db.membri:[]}).then(f)};
    if (t==='film_membri') q.limit=async()=>({data:__db.membri
      .filter(m=>!q._f.user_id||m.user_id===q._f.user_id)
      .map(m=>({project_id:__db.progetto.id,created_at:m.created_at,projects:__db.progetto})),error:null});
    return q;},
  storage:{from:()=>({})}})};`;

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(FINTO);
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html?film=a1b2c3d4',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);

console.log('\n── il codice del QR fa entrare nel film ──');
await p.evaluate(async()=>{
  currentUser={id:'u2',email:'alfredo@x.it'};   // let, non window: va assegnato cosi'
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').classList.add('on');
  await filmDallIndirizzo();
});
ok('ha chiamato la porta giusta', await p.evaluate(()=>__db.rpc[0][0]), 'entra_nel_film');
ok('col codice del link',  await p.evaluate(()=>__db.rpc[0][1].codice_invito), 'a1b2c3d4');
ok('ora è nella troupe',   await p.evaluate(()=>__db.membri.map(m=>m.user_id)), ['u1','u2']);
ok('e il film è il suo',   await p.evaluate(()=>filmCorrente().titolo), 'Missione San Gennaro');
ok('il codice sparisce dall\'indirizzo', await p.evaluate(()=>location.search.includes('film')), false);

console.log('\n── la pagina di chi e\' entrato col QR ──');
await p.evaluate(()=>switchResultTab('troupe'));
await p.waitForTimeout(500);
ok('il titolo del film', await p.evaluate(()=>document.querySelector('#troupeCorpo .sp-testa .t').textContent), 'Missione San Gennaro');
ok('la troupe elencata',  await p.evaluate(()=>[...document.querySelectorAll('#troupeElenco .odg-att .t')].map(e=>e.textContent)),
   ['Simone Panetta','Alfredo De Marchi']);
ok('con il reparto',      await p.evaluate(()=>document.querySelector('#troupeElenco .odg-att .s').textContent), 'Suono');
ok('e chi l\'ha aperto',  await p.evaluate(()=>document.querySelector('#troupeElenco .cast-m').textContent), 'ha aperto il film');
ok('ma niente QR: la porta non è sua', await p.evaluate(()=>!document.querySelector('.tr-qr')), true);
ok('né i tasti per invitare',          await p.evaluate(()=>!document.querySelector('#troupeCorpo .sp-azioni')), true);
ok('né la casella della posta',        await p.evaluate(()=>!document.getElementById('troupeMail')), true);
ok('e nessuna spiegazione a nessuno',  await p.evaluate(()=>!document.querySelector('.tr-spiega')), true);

console.log('\n── la pagina di chi il film l\'ha aperto ──');
await p.evaluate(async()=>{ currentUser={id:'u1'}; filmImposta(null); await filmCarica('p1'); switchResultTab('troupe'); });
await p.waitForTimeout(400);
ok('il codice a schermo', await p.evaluate(()=>document.querySelector('.tr-qr .c').textContent), 'A1B2C3D4');
ok('il QR è disegnato',   await p.evaluate(()=>!!document.querySelector('.tr-qr svg')), true);
ok('e ha dentro i quadratini', await p.evaluate(()=>   // un solo path, un M per modulo
  (document.querySelector('.tr-qr svg path')?.getAttribute('d')?.match(/M/g)||[]).length > 100), true);
ok('e il fondo resta bianco anche di notte', await p.evaluate(()=>   // se no non si legge
  document.querySelector('.tr-qr svg rect').getAttribute('fill')), 'white');
ok('e i tasti per invitare ci sono', await p.evaluate(()=>
  [...document.querySelectorAll('#troupeCorpo .sp-azioni button')].map(b=>b.textContent)),
  ["Manda l'invito",'Copia il link']);
console.log('\n── l\'indirizzo dove arriva la posta ──');
ok('scritto per intero', await p.evaluate(()=>document.getElementById('troupeMail').textContent),
   'cafebabecafebabe@campobase.dev');
ok('e non lo deduce da dove si e\' aperta l\'app', await p.evaluate(()=>
  filmPosta().endsWith('@campobase.dev')), true);
ok('senza casella non lo inventa', await p.evaluate(()=>
  filmPosta({id:'p1',titolo:'X',codice:'A1B2C3D4'})), '');

console.log('\n── un film aperto prima che le caselle esistessero ──');
await p.evaluate(()=>{   // in memoria c'e' la copia vecchia, senza casella
  filmImposta({id:'p1',titolo:'Missione San Gennaro',codice:'A1B2C3D4'});  // vecchia copia: senza casella e senza sapere di chi e'
  switchResultTab('troupe');
});
await p.waitForTimeout(400);
ok('se la va a riprendere invece di nasconderla', await p.evaluate(()=>
  document.getElementById('troupeMail')?.textContent), 'cafebabecafebabe@campobase.dev');

console.log('\n── il link dell\'invito ──');
ok('porta al codice', await p.evaluate(()=>filmLink('A1B2C3D4').endsWith('?film=A1B2C3D4')), true);

console.log('\n── l\'OdG si salva sul film, non sulla persona ──');
await p.evaluate(async()=>{ await odgSalva({numero:20,data:'2026-11-09',scene:[]}); });
ok('con il film addosso', await p.evaluate(()=>__db.odg[0].project_id), 'p1');
ok('e chi l\'ha caricato resta scritto', await p.evaluate(()=>__db.odg[0].user_id), 'u1');

console.log('\n── un film senza codice se lo prende ──');
await p.evaluate(async()=>{ __db.progetto.codice=null; __db.aggiornamenti=[]; await filmCarica('p1'); });
ok('generato',      await p.evaluate(()=>/^[0-9A-F]{8}$/.test(__db.progetto.codice)), true);
ok('e scritto sul film', await p.evaluate(()=>__db.aggiornamenti[0][0]), 'projects');

console.log('\n── un codice sbagliato non apre niente ──');
await p.evaluate(()=>{filmImposta(null)});
ok('rifiutato',  await p.evaluate(async()=>!(await filmEntra('ZZZZZZZZ'))), true);
ok('e nessun film', await p.evaluate(()=>filmCorrente()), null);

console.log('\n── entrare col codice, senza QR ──');
await p.evaluate(()=>{ currentUser={id:'u3',email:'c@x.it'}; filmImposta(null);
  document.getElementById('homePage').style.display='block';
  document.getElementById('resultsPage').classList.remove('on'); });
ok('il tasto c\'è',  await p.evaluate(()=>!!document.getElementById('progCodice')), true);
await p.evaluate(()=>codiceMostra());
ok('si apre la casella', await p.evaluate(()=>document.getElementById('codBox').classList.contains('on')), true);
await p.evaluate(()=>{document.getElementById('codInput').value='zzzzzzzz'});
await p.evaluate(()=>codiceEntra()); await p.waitForTimeout(250);
ok('un codice sbagliato non fa entrare', await p.evaluate(()=>filmCorrente()), null);
ok('e la casella resta aperta per riprovare', await p.evaluate(()=>
  document.getElementById('codBox').classList.contains('on')), true);
// minuscolo e con spazi intorno: come lo si copia da un messaggio
await p.evaluate(()=>{document.getElementById('codInput').value=' '+__db.progetto.codice.toLowerCase()+' '});
await p.evaluate(()=>codiceEntra()); await p.waitForTimeout(400);
ok('quello giusto sì, anche minuscolo e con spazi',
   await p.evaluate(()=>filmCorrente()&&filmCorrente().titolo), 'Missione San Gennaro');
ok('e la pagina si accende davvero', await p.evaluate(()=>
  document.getElementById('resultsPage').classList.contains('on')), true);
ok('sulla giornata, non sul vuoto', await p.evaluate(()=>
  document.getElementById(RT_SEZIONI.odg).style.display !== 'none'), true);
ok('la casella si richiude', await p.evaluate(()=>
  document.getElementById('codBox').classList.contains('on')), false);

console.log('\n── chi e\' solo nella troupe vede comunque il film ──');
ok('la scheda c\'è, anche senza analisi sue', await p.evaluate(()=>{
  renderHistoryGrid([], [{id:'p1',titolo:'Missione San Gennaro',user_id:'u1'}]);
  const c = document.querySelector('#historyGrid .prog');
  return [c?.querySelector('.t')?.textContent, c?.querySelector('.s')?.textContent,
          c?.getAttribute('onclick')];}),
  ['Missione San Gennaro','nella troupe',"apriFilm('p1')"]);
ok('senza niente resta il messaggio di prima', await p.evaluate(()=>{
  renderHistoryGrid([], []);
  return !!document.querySelector('#historyGrid .prog-vuoto');}), true);
ok('il proprio film non si duplica', await p.evaluate(async()=>{
  currentUser={id:'u1'};
  const suoi = await filmDaMembri([{data:{titolo:'Missione San Gennaro'}}]);
  return suoi.length;}), 0);

console.log('\n── il film si ritrova anche senza invito ──');
await p.evaluate(()=>{ currentUser={id:'u2'}; filmImposta(null); });
ok('da soli non c\'è', await p.evaluate(()=>filmCorrente()), null);
await p.evaluate(()=>filmDaMembro());
ok('ma chi è nella troupe se lo ritrova', await p.evaluate(()=>filmCorrente()?.titolo), 'Missione San Gennaro');
ok('e non è lui il capo', await p.evaluate(()=>filmCorrente()?.mio), false);
await p.evaluate(()=>{ currentUser={id:'u9'}; filmImposta(null); });
await p.evaluate(()=>filmDaMembro());
ok('chi non c\'è dentro resta fuori', await p.evaluate(()=>filmCorrente()), null);

console.log('\n── uscendo dall\'account il film si chiude ──');
await p.evaluate(async()=>{filmImposta({id:'p1',titolo:'X',codice:'A1B2C3D4'}); await logout();});
ok('dimenticato', await p.evaluate(()=>filmCorrente()), null);

console.log('\n── senza film la pagina lo dice ──');
await p.evaluate(()=>{switchResultTab('troupe')});
await p.waitForTimeout(250);
ok('niente QR inventato', await p.evaluate(()=>!document.querySelector('.tr-qr')), true);
ok('lo spiega',           await p.evaluate(()=>/Nessun film aperto/.test(document.getElementById('troupeCorpo').textContent)), true);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
