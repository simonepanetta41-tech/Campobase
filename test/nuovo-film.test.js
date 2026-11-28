/* Aprire un film da zero, senza sceneggiatura.
   Il tasto lo vede solo chi l'amministrazione ha abilitato; il permesso
   lo ricontrolla il database (sql/permessi.sql), che qui e' finto. */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(52)} ${JSON.stringify(got)}`.padEnd(96)+` atteso ${JSON.stringify(exp)}`);};
const STUB=()=>{
  window.__perm={data:null,error:null}; window.__rpc=[]; window.__esito={data:[{id:'F9',titolo:'La Promessa'}],error:null};
  window.__membri=[];
  const q=(t)=>{const x={select(){return x},order(){return x},limit(){return x},eq(){return x},update(){return x},upsert:async()=>({error:null}),
    single:async()=>({data:null}),maybeSingle:async()=>(t==='permessi'?window.__perm:{data:null}),
    then(g){return Promise.resolve({data:t==='film_membri'?window.__membri:[],error:null}).then(g)}};return x;};
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:q,rpc:async(n,a)=>{ window.__rpc.push([n,a]); return n==='nuovo_film'?window.__esito:{data:null}; },storage:{from:()=>({})}})};
};
(async()=>{
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(STUB);
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://'+RADICE+'/index.html',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
await p.evaluate(()=>{ localStorage.clear(); currentUser={id:'io'};
  document.getElementById('authPage').style.display='none'; document.getElementById('app').style.display='block';
  window.APERTI=[]; window.SCHEDE=[]; apriFilm=async id=>{ APERTI.push(id); }; switchResultTab=t=>{ SCHEDE.push(t); }; });
const visibile=()=>p.evaluate(()=>!!document.getElementById('progFilm').offsetParent);
const toast=()=>p.evaluate(()=>(document.getElementById('toastContainer')||{textContent:''}).textContent);

console.log('\n── chi vede il tasto ──');
await p.evaluate(()=>filmNuovoPermesso());
ok('chi non è abilitato non lo vede', await visibile(), false);
await p.evaluate(()=>{ __perm={data:null,error:{message:'relation "permessi" does not exist'}}; return filmNuovoPermesso(); });
ok('tabella non ancora creata: nessun tasto, nessun errore', await visibile(), false);
await p.evaluate(()=>{ __perm={data:{crea_film:true},error:null}; return filmNuovoPermesso(); });
ok('⚠ chi è abilitato sì', await visibile(), true);
ok('sta in fondo, dopo gli altri due', await p.evaluate(()=>[...document.querySelectorAll('#homePage > .prog-nuovo')].filter(b=>b.offsetParent).map(b=>b.textContent.trim())),
  ['＋ Entra con un codice','＋ Nuovo da sceneggiatura','＋ Nuovo film']);
ok('ed è pieno, in giallo: si nota', await p.evaluate(()=>getComputedStyle(document.getElementById('progFilm')).backgroundColor===getComputedStyle(document.querySelector('#codBox button')).backgroundColor), true);
await p.evaluate(()=>{ __perm={data:null,error:{message:'Failed to fetch'}}; return filmNuovoPermesso(); });
ok('senza rete resta com\'era', await visibile(), true);
await p.evaluate(()=>{ __perm={data:{crea_film:false},error:null}; return filmNuovoPermesso(); });
ok('⚠ tolto il permesso, il tasto sparisce', await visibile(), false);
await p.evaluate(()=>{ __perm={data:{crea_film:true},error:null}; return filmNuovoPermesso(); });

console.log('\n── aprire il film ──');
await p.click('#progFilm'); await p.waitForTimeout(150);
ok('si apre il campo del titolo', await p.evaluate(()=>[document.getElementById('filmBox').classList.contains('on'), document.getElementById('filmTitolo').placeholder]), [true,'Titolo del film']);
await p.click('#filmBox button'); await p.waitForTimeout(150);
ok('senza titolo non parte niente', [await p.evaluate(()=>__rpc.length), (await toast()).includes('Scrivi il titolo')], [0,true]);
await p.fill('#filmTitolo','  la   Promessa '); await p.click('#filmBox button'); await p.waitForTimeout(300);
ok('⚠ lo crea il database, col titolo ripulito', await p.evaluate(()=>__rpc), [['nuovo_film',{p_titolo:'la Promessa'}]]);
ok('⚠ e si entra nel film, sulla pagina della troupe', await p.evaluate(()=>[APERTI, SCHEDE.slice(-1), document.getElementById('filmBox').classList.contains('on'), document.getElementById('filmTitolo').value]), [['F9'],['troupe'],false,'']);

console.log('\n── quando il database dice di no ──');
for (const [nome, messaggio, atteso] of [
  ['titolo già usato', "hai gia' un film con questo titolo", 'Hai già un film con questo titolo.'],
  ['⚠ permesso tolto nel frattempo', 'non puoi aprire un film', 'Non sei abilitato ad aprire un film.'],
  ['niente rete', 'Failed to fetch', 'Non riuscito. Riprova']]) {
  await p.evaluate((m)=>{ APERTI.length=0; __esito={data:null,error:{message:m}}; document.getElementById('toastContainer')?.replaceChildren(); document.getElementById('filmBox').classList.add('on'); document.getElementById('filmTitolo').value='Altro'; }, messaggio);
  await p.click('#filmBox button'); await p.waitForTimeout(250);
  ok(nome+': lo dice e non entra da nessuna parte', [(await toast()).includes(atteso), await p.evaluate(()=>APERTI.length), await p.evaluate(()=>document.getElementById('filmTitolo').value)], [true,0,'Altro']);
}

console.log('\n── il film vuoto sta nella lista di chi l\'ha aperto ──');
/* Non ha un'analisi: prima i propri film si vedevano solo tramite quella. */
ok('⚠ un film mio senza analisi compare', await p.evaluate(async()=>{ __membri=[{project_id:'F9',projects:{id:'F9',titolo:'La Promessa',codice:'AA',casella:'cc',user_id:'io'}}];
  return (await filmDaMembri([])).map(f=>f.titolo); }), ['La Promessa']);
ok('uno mio che ha già la sua analisi non raddoppia', await p.evaluate(async()=>(await filmDaMembri([{data:{titolo:'La Promessa'}}])).length), 0);

ok('nessun errore in pagina', err, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati');
process.exit(ko?1:0);
})();
