/* Tornare dove si era, e arrivare dove porta la notifica.
 *
 * L'app si apre dieci volte al giorno: ripartire ogni volta dalla lista
 * dei film e' un tocco di troppo. E una notifica toccata deve portare al
 * SUO film, anche se l'ultimo aperto era un altro.
 *   - si ricorda l'ultimo film aperto, e uscendo apposta lo si dimentica;
 *   - una notifica porta al suo film e alla sua sezione;
 *   - non si apre un film in cui non si e' piu'.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(54)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.addInitScript(()=>{
  window.DB={membro:['film-A','film-B'], analisi:{'film-A':'an-1'}};
  const q=(tavola)=>{ const f={}; const x={select(){return x},eq(k,v){f[k]=v;return x},in(){return x},order(){return x},
    limit:async()=>{ const D=window.DB;
      if(tavola==='film_membri') return {data:D.membro.includes(f.project_id)?[{project_id:f.project_id}]:[],error:null};
      if(tavola==='analyses'){ if(f.id) return {data:Object.values(D.analisi).includes(f.id)?[{id:f.id}]:[],error:null};
        return {data:D.analisi[f.project_id]?[{id:D.analisi[f.project_id]}]:[],error:null}; }
      return {data:[],error:null}; },
    single:async()=>({data:null}),maybeSingle:async()=>({data:null}),then(g){return Promise.resolve({data:[],error:null}).then(g)}}; return x; };
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:q, rpc:async()=>({data:null}), storage:{from:()=>({})}})};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(600);
// Le due porte d'ingresso, finte: dicono solo da dove si e' entrati.
await p.evaluate(()=>{
  window.PASSI=[]; currentUser={id:'u1'};
  const dentro=(id)=>{ filmImposta({id,titolo:id,mio:id==='film-A'}); document.getElementById('homePage').style.display='none'; document.getElementById('resultsPage').classList.add('on'); };
  window.veraApri=apriFilm; window.veraStoria=loadFromHistory;
  apriFilm=async(id)=>{ ultimoRicorda({f:id}); PASSI.push('film:'+id); dentro(id); };
  loadFromHistory=async(id)=>{ const f=Object.keys(DB.analisi).find(k=>DB.analisi[k]===id); ultimoRicorda(f?{f}:{a:id}); PASSI.push('analisi:'+id); dentro(f||id); };
  switchResultTab=(t)=>PASSI.push('sezione:'+t);
  odgRipristina=async()=>{}; postaControlla=()=>{};
  window.riparti=()=>{ PASSI.length=0; filmImposta(null); document.getElementById('resultsPage').classList.remove('on'); document.getElementById('homePage').style.display=''; };
});
const passi=()=>p.evaluate(()=>PASSI.slice());

console.log('\n── si torna nell\'ultimo film aperto ──');
await p.evaluate(async()=>{ riparti(); localStorage.clear(); await avvioApri(); });
ok('la prima volta si resta sulla lista', await passi(), []);
await p.evaluate(async()=>{ await apriFilm('film-B'); riparti(); await avvioApri(); });
ok('⚠ riaprendo l\'app si rientra in quel film', await passi(), ['film:film-B','sezione:odg']);
await p.evaluate(async()=>{ await loadFromHistory('an-1'); riparti(); await avvioApri(); });
ok('chi l\'ha aperto rientra dalla sua analisi', await passi(), ['analisi:an-1','sezione:odg']);
await p.evaluate(async()=>{ riparti(); document.querySelector('.cb-ident').click(); await avvioApri(); });
ok('⚠ uscito apposta con la freccia, resta sulla lista', [await passi(), await p.evaluate(()=>ultimoLeggi())], [[], null]);
await p.evaluate(async()=>{ await apriFilm('film-B'); riparti(); DB.membro=['film-A']; await avvioApri(); });
ok('⚠ un film in cui non si è più non si riapre', [await passi(), await p.evaluate(()=>ultimoLeggi())], [[], null]);
await p.evaluate(()=>{ DB.membro=['film-A','film-B']; });

console.log('\n── ⚠ la notifica porta al suo film ──');
await p.evaluate(async()=>{ await apriFilm('film-B'); riparti(); history.replaceState(null,'','?apri=film-A&vai=piano'); await avvioApri(); });
ok('non all\'ultimo aperto: a quello della notifica', await passi(), ['analisi:an-1','sezione:piano']);
ok('e l\'indirizzo torna pulito', await p.evaluate(()=>location.search), '');
await p.evaluate(async()=>{ riparti(); await filmApriDa('film-B','passaggio'); });
ok('il pick-up apre l\'ordine del giorno', await passi(), ['film:film-B','sezione:odg']);
await p.evaluate(async()=>{ PASSI.length=0; await filmApriDa('film-B','piano'); });
ok('già dentro quel film: cambia solo sezione', await passi(), ['sezione:piano']);
await p.evaluate(async()=>{ PASSI.length=0; await filmApriDa('film-A','odg'); });
ok('⚠ dentro un altro film: si passa a quello giusto', await passi(), ['analisi:an-1','sezione:odg']);
await p.evaluate(async()=>{ riparti(); window.ESITO=await filmApriDa('film-di-un-altro','odg'); });
ok('una notifica di un film non mio non apre niente', [await passi(), await p.evaluate(()=>ESITO)], [[], false]);

console.log('\n── il biglietto lasciato in memoria dal service worker ──');
const biglietto=(quando)=>p.evaluate(async(quando)=>{ riparti();
  // Sotto file:// la memoria vera non si puo' usare: una finta, con la stessa forma.
  if(!window.FINTA){ const st={}; window.FINTA={ put:async(k,r)=>{ st[k]=await r.text(); }, match:async(k)=>st[k]?new Response(st[k]):undefined, delete:async(k)=>{ delete st[k]; } };
    Object.defineProperty(window,'caches',{value:{open:async()=>window.FINTA},configurable:true}); }
  const c=await caches.open('campobase-apri'); await c.put('/apri', new Response(JSON.stringify({film:'film-B',vai:'odg',quando})));
  const fatto=await apriDaNotifica(); return [fatto, !!(await c.match('/apri'))]; }, quando);
ok('fresco: si apre, e si consuma', [await biglietto(Date.now()), await passi()], [[true,false], ['film:film-B','sezione:odg']]);
ok('⚠ vecchio di dieci minuti: è una notifica passata, non si apre', [await biglietto(Date.now()-600000), await passi()], [[false,false], []]);

console.log('\n── il proprio passaggio viene portato in vista ──');
ok('si cerca la sezione giusta', await p.evaluate(async()=>{
  document.getElementById('odgCorpo').innerHTML='<div class="odg-sez">ORARI</div><div style="height:1500px"></div><div class="odg-sez" id="tp">IL TUO PASSAGGIO</div>';
  let visto=null; const v=Element.prototype.scrollIntoView; Element.prototype.scrollIntoView=function(){ visto=this.id; };
  sezioneVai('passaggio'); await new Promise(r=>setTimeout(r,50)); Element.prototype.scrollIntoView=v; return visto; }), 'tp');

ok('nessun errore di pagina', errori, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
