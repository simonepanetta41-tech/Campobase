/* Senza rete l'app deve aprirsi lo stesso, con quello che aveva.
 *
 * In un sotterraneo senza campo l'app restava bianca e poi ferma su
 * "Caricamento…": aspettava la rete per la pagina e leggeva dal server
 * tutto quello che mostra.
 *   - ogni lettura riuscita si mette da parte; quando la rete non c'e', o
 *     non risponde entro tre secondi, torna l'ultima risposta salvata;
 *   - le scritture non si salvano e non si inventano: falliscono;
 *   - i dati di un account non si danno a un altro, e uscendo spariscono;
 *   - senza rete si entra lo stesso, se su quel telefono si era entrati;
 *   - i PDF dell'ordine del giorno si scaricano prima che servano.
 * La pagina si serve da un indirizzo vero: la dispensa (Cache API) da
 * file:// non esiste.
 */
const RADICE = require('path').join(__dirname, '..');
const fs = require('fs'), http = require('http');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(58)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};
(async()=>{
const server = http.createServer((q, r) => { try { const f = q.url.split('?')[0] === '/' ? '/index.html' : q.url.split('?')[0];
  r.writeHead(200, { 'content-type': /\.html$/.test(f) ? 'text/html' : 'text/plain' }); r.end(fs.readFileSync(RADICE + f)); } catch (_) { r.writeHead(404); r.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const QUI = 'http://127.0.0.1:' + server.address().port;
const b=await chromium.launch();
const apri = async (sessione) => {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p = await ctx.newPage(); p.errori=[]; p.on('pageerror',e=>p.errori.push(e.message));
  await p.addInitScript((sessione)=>{
    window.OPZIONI=null; window.MOSTRATA=[];
    const q=()=>{ const x={select(){return x},eq(){return x},in(){return x},order(){return x},update(){return x},upsert(){return x},limit:async()=>({data:[],error:null}),
      single:async()=>({data:null}),maybeSingle:async()=>({data:null}),then(g,h){return Promise.resolve({data:[],error:null}).then(g,h)}}; return x; };
    window.supabase={createClient:(u,k,o)=>{ window.OPZIONI=o; return {auth:{getSession:async()=>sessione==='mai'?new Promise(()=>{}):sessione,signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:q, rpc:async()=>({data:null}), storage:{from:()=>({})}}; }};
    window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
  }, sessione);
  await p.route('**',r=>r.request().url().startsWith(QUI)?r.continue():r.abort());
  await p.goto(QUI + '/index.html'); await p.waitForTimeout(500);
  // Una rete finta, che si puo' spegnere o far restare appesa.
  await p.evaluate(()=>{
    window.RETE='su'; window.CHIAMATE=[]; window.RISPOSTA={n:1};
    window.fetch=(url,init)=>{ CHIAMATE.push(((init&&init.method)||'GET')+' '+String(url).replace(/^https:\/\/[^/]+/,''));
      if (RETE==='giu') return Promise.reject(new TypeError('Failed to fetch'));
      if (RETE==='appesa') return new Promise((_,no)=>{ const s=init&&init.signal; if(s) s.addEventListener('abort',()=>no(new DOMException('aborted','AbortError'))); });
      return Promise.resolve(new Response(JSON.stringify(RISPOSTA),{status:200,headers:{'content-type':'application/json'}})); };
    window.leggi=async(percorso,init)=>{ const t=Date.now(); try { const r=await sbFetch(SUPA_URL+percorso,init); return {dati:await r.json(), ms:Date.now()-t}; } catch(e){ return {errore:e.name, ms:Date.now()-t}; } };
    currentUser={id:'u1'};
  });
  return p;
};

console.log('\n── le letture si mettono da parte ──');
let p=await apri({data:{session:null}});
ok('tutte le chiamate a Supabase passano di qui', await p.evaluate(()=>OPZIONI && OPZIONI.global && OPZIONI.global.fetch===sbFetch), true);
ok('con la rete: la risposta è quella del server', (await p.evaluate(()=>leggi('/rest/v1/analyses?select=id'))).dati, {n:1});
await p.evaluate(()=>{ RETE='giu'; RISPOSTA={n:2}; });
let r=await p.evaluate(()=>leggi('/rest/v1/analyses?select=id'));
ok('⚠ senza rete: torna quella di prima, subito', [r.dati, r.ms<500], [{n:1}, true]);
ok('e lo dice: a schermo ci sono dati salvati', await p.evaluate(()=>[document.body.classList.contains('senza-rete'), getComputedStyle(document.getElementById('cbSenzaRete')).display, document.getElementById('cbSenzaRete').textContent]), [true,'block','Senza rete · dati salvati']);
ok('⚠ una domanda mai fatta prima non ha risposta: fallisce', (await p.evaluate(()=>leggi('/rest/v1/analyses?select=altro'))).errore, 'TypeError');
ok('⚠ una riga sola e una lista sono risposte diverse', (await p.evaluate(()=>leggi('/rest/v1/analyses?select=id',{headers:{Accept:'application/vnd.pgrst.object+json'}}))).errore, 'TypeError');
ok('⚠ una scrittura non si salva e non si finge', [(await p.evaluate(()=>leggi('/rest/v1/analyses?select=id',{method:'PATCH',body:'{}'}))).errore, (await p.evaluate(()=>leggi('/rest/v1/analyses',{method:'POST',body:'{}'}))).errore], ['TypeError','TypeError']);
await p.evaluate(()=>{ currentUser={id:'u2'}; });
ok('⚠ i dati di un account non si danno a un altro', (await p.evaluate(()=>leggi('/rest/v1/analyses?select=id'))).errore, 'TypeError');
await p.evaluate(()=>{ currentUser={id:'u1'}; RETE='su'; });
r=await p.evaluate(()=>leggi('/rest/v1/analyses?select=id'));
ok('tornata la rete: la risposta nuova, e la riga sparisce', [r.dati, await p.evaluate(()=>document.body.classList.contains('senza-rete'))], [{n:2}, false]);
await p.evaluate(()=>{ RETE='giu'; });
ok('e da parte adesso c\'è quella nuova', (await p.evaluate(()=>leggi('/rest/v1/analyses?select=id'))).dati, {n:2});

console.log('\n── ⚠ il campo che va e viene ──');
await p.evaluate(()=>{ RETE='su'; sbLentaFino=0; }); await p.evaluate(()=>leggi('/rest/v1/analyses?select=id'));
await p.evaluate(()=>{ RETE='appesa'; });
r=await p.evaluate(()=>leggi('/rest/v1/analyses?select=id'));
ok('una richiesta appesa: tre secondi, poi i dati salvati', [r.dati, r.ms>=2900 && r.ms<3800], [{n:2}, true]);
r=await p.evaluate(()=>leggi('/rest/v1/analyses?select=id'));
ok('la seconda non aspetta più: la rete ha appena fatto cilecca', [r.dati, r.ms<300], [{n:2}, true]);
r=await p.evaluate(()=>leggi('/rest/v1/rpc/sono_nel_film',{method:'POST',body:'{}'}));
ok('le domande brevi dell\'avvio non restano appese per sempre', [r.errore, r.ms<3200], ['AbortError', true]);
ok('gli allegati della posta non passano dalla dispensa (hanno la loro)', await p.evaluate(async()=>{ RETE='su'; sbLentaFino=0; await leggi('/storage/v1/object/posta/f/m/a.pdf'); RETE='giu'; return (await leggi('/storage/v1/object/posta/f/m/a.pdf')).errore; }), 'TypeError');
ok('la sceneggiatura sì', await p.evaluate(async()=>{ RETE='su'; sbLentaFino=0; await leggi('/storage/v1/object/Screenplays/u1/a.pdf'); RETE='giu'; return (await leggi('/storage/v1/object/Screenplays/u1/a.pdf')).dati; }), {n:2});

console.log('\n── uscendo dall\'account ──');
await p.evaluate(()=>logout()); await p.waitForTimeout(100);
ok('⚠ i dati salvati spariscono', (await p.evaluate(()=>{ currentUser={id:'u1'}; RETE='giu'; return leggi('/rest/v1/analyses?select=id'); })).errore, 'TypeError');
ok('nessun errore di pagina', p.errori, []);
await p.context().close();

console.log('\n── ⚠ aprire l\'app senza rete ──');
const guasto={data:{session:null},error:{name:'AuthRetryableFetchError',message:'Failed to fetch'}};
p=await apri(guasto);
ok('mai entrati su questo telefono: si chiede l\'accesso', await p.evaluate(()=>[getComputedStyle(document.getElementById('authPage')).display!=='none', getComputedStyle(document.getElementById('app')).display]), [true,'none']);
await p.evaluate(()=>localStorage.setItem('sb-cmeccqzlkinpwalmehdf-auth-token', JSON.stringify({access_token:'x',user:{id:'u9',email:'io@x.it'}})));
await p.reload(); await p.waitForTimeout(700);
ok('già entrati: l\'app si apre lo stesso, con chi era', await p.evaluate(()=>[currentUser&&currentUser.id, getComputedStyle(document.getElementById('authPage')).display, getComputedStyle(document.getElementById('app')).display]), ['u9','none','block']);
ok('e dice che i dati sono quelli salvati', await p.evaluate(()=>document.body.classList.contains('senza-rete')), true);
ok('nessun errore di pagina', p.errori, []);
await p.context().close();
p=await apri({data:{session:null}});
await p.evaluate(()=>localStorage.setItem('sb-cmeccqzlkinpwalmehdf-auth-token', JSON.stringify({access_token:'x',user:{id:'u9'}})));
await p.reload(); await p.waitForTimeout(600);
ok('⚠ con la rete, se Supabase dice che la sessione non c\'è, non si entra', await p.evaluate(()=>[currentUser, getComputedStyle(document.getElementById('app')).display]), [null,'none']);
await p.context().close();

console.log('\n── ⚠ il gettone scaduto non blocca le letture ──');
/* Supabase, prima di ogni lettura, chiede la sessione; col gettone
   scaduto e la rete giu' ci metteva venticinque secondi a rispondere. */
const scaduto = JSON.stringify({access_token:'vecchio',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)-100,user:{id:'u9'}});
p=await apri({data:{session:null}});
await p.evaluate((scaduto)=>localStorage.setItem('sb-cmeccqzlkinpwalmehdf-auth-token', scaduto), scaduto);
// la getSession finta del test risponde subito "non c'e', per guasto": deve valere la sessione salvata
r=await p.evaluate(async()=>{ const t=Date.now(); const x=await sb.auth.getSession(); return [x.data.session&&x.data.session.access_token, Date.now()-t<500]; });
ok('gettone scaduto e Supabase che non dice la sua (nessun errore): si crede a Supabase', r, [null, true]);
await p.context().close();
p=await apri({data:{session:null},error:{name:'AuthRetryableFetchError'}});
r=await p.evaluate(async(scaduto)=>{ localStorage.setItem('sb-cmeccqzlkinpwalmehdf-auth-token', scaduto); const t=Date.now(); const x=await sb.auth.getSession();
  const t2=Date.now(); const y=await sb.auth.getSession();
  return [x.data.session.access_token, Date.now()-t<600, y.data.session.user.id, Date.now()-t2<50, document.body.classList.contains('senza-rete')]; }, scaduto);
ok('rinnovo fallito per la rete: si va avanti con la sessione salvata', r, ['vecchio', true, 'u9', true, true]);
r=await p.evaluate(async()=>{ const buono=JSON.stringify({access_token:'buono',expires_at:Math.floor(Date.now()/1000)+3000,user:{id:'u9'}}); localStorage.setItem('sb-cmeccqzlkinpwalmehdf-auth-token', buono);
  sbAuthGiuFino=0; const x=await sb.auth.getSession(); return [x.data.session, x.error&&x.error.name]; });
ok('gettone ancora buono: decide Supabase, come sempre', r, [null,'AuthRetryableFetchError']);
await p.context().close();
p=await apri('mai');     // una getSession che non risponde mai
r=await p.evaluate(async(scaduto)=>{ localStorage.setItem('sb-cmeccqzlkinpwalmehdf-auth-token', scaduto); const t=Date.now(); const x=await sb.auth.getSession(); return [x.data.session.access_token, Date.now()-t>=3900 && Date.now()-t<5000]; }, scaduto);
ok('⚠ rinnovo appeso: quattro secondi, non venticinque', r, ['vecchio', true]);
r=await p.evaluate(async()=>{ RETE='su'; RISPOSTA={n:7}; sbLentaFino=0; await leggi('/rest/v1/odg?select=dati');
  window.fetch=async()=>new Response('{"message":"JWT expired"}',{status:401}); const x=await leggi('/rest/v1/odg?select=dati'); return [x.dati, document.body.classList.contains('senza-rete')]; });
ok('⚠ un "gettone scaduto" dal server vale come rete assente: dati salvati', r, [{n:7}, true]);
await p.context().close();

console.log('\n── i PDF del giorno, prima che servano ──');
p=await apri({data:{session:null}});
r=await p.evaluate(async()=>{
  window.SCARICATI=[]; const casa={};
  cbFileLeggi=async k=>casa[k]||null; cbFileSalva=async(k,b)=>{ casa[k]=b; return true; };
  sb.storage.from=()=>({download:async(percorso)=>{ SCARICATI.push(percorso); return {data:new Blob(['%PDF']),error:null}; }});
  odgPercorsoDaPosta=async()=>null;
  odgCorrente={data:'2026-11-23',nomeFile:'MSG - ODG 31.pdf',percorso:'f/m/odg.pdf',allegati:[{nome:'Giri.pdf',percorso:'f/m/giri.pdf'},{nome:'STRALCI 31.pdf',tipo:'stralci',percorso:'f/m/stralci.pdf'},{nome:'Senza percorso.pdf'}]};
  const presi=await odgAllegatiInCasa();
  const dopo=JSON.parse(localStorage.getItem(ODG_LOCALE)||'null');
  const secondi=await odgAllegatiInCasa();
  return {presi, scaricati:SCARICATI.slice(), ricordati:[!!dopo.file].concat(dopo.allegati.map(a=>!!a.file)), secondi, ancora:SCARICATI.length};
});
ok('⚠ foglio, giri e stralci si scaricano da soli, senza aprirli', [r.presi, r.scaricati], [3, ['f/m/odg.pdf','f/m/giri.pdf','f/m/stralci.pdf']]);
ok('e l\'ordine del giorno salvato sa dove sono', r.ricordati, [true,true,true,false]);
ok('la volta dopo non si riscaricano', [r.secondi, r.ancora], [0,3]);
/* La produzione rimanda gli stralci corretti con lo stesso nome. Il server
   li mette nell'ordine del giorno con un percorso nuovo; il telefono non
   deve trovare "gia' in casa" quelli vecchi solo perche' si chiamano uguale. */
r=await p.evaluate(async()=>{ SCARICATI.length=0;
  odgCorrente={data:'2026-11-23',nomeFile:'MSG - ODG 31.pdf',percorso:'f/m/odg.pdf',file:odgChiaveFile('f/m/odg.pdf'),allegati:[{nome:'STRALCI 31.pdf',tipo:'stralci',percorso:'f/m2/stralci.pdf',file:null}]};
  const n=await odgAllegatiInCasa(); const a=odgCorrente.allegati[0];
  return [n, SCARICATI.slice(), a.file!==odgChiaveFile('f/m/stralci.pdf') && !!a.file]; });
ok('⚠ stralci corretti con lo stesso nome: si scaricano i nuovi', r, [1, ['f/m2/stralci.pdf'], true]);
r=await p.evaluate(async()=>{ SCARICATI.length=0; odgCorrente={data:'2026-11-24',nomeFile:'Altro.pdf',percorso:'f/m/altro.pdf',allegati:[]}; sbSegna(true); const n=await odgAllegatiInCasa(); sbSegna(false); return [n, SCARICATI.length]; });
ok('senza rete non ci si prova nemmeno', r, [0,0]);
ok('nessun errore di pagina', p.errori, []);
await p.context().close();

await b.close(); server.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
