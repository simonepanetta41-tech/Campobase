/* Il confronto degli orari fra reparti dello stesso film.
   Chi ha compilato la settimana la rende visibile; gli altri reparti la
   vedono accanto alla propria. Nessuna etichetta "uguale/diverso". */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(52)} ${JSON.stringify(got)}`.padEnd(96)+` atteso ${JSON.stringify(exp)}`);};
const STUB=()=>{
  window.__fatte=[]; window.__righe=[]; window.__errore=localStorage.getItem('__err')||null;
  const q=(tab)=>{ const x={_op:'select',_f:{},
    select(){return x}, order(){return x}, limit(){return x},
    eq(k,v){x._f[k]=v;return x},
    update(v){x._op='update';x._v=v;return x},
    delete(){x._op='delete';return x},
    upsert(v){window.__fatte.push({tab,op:'upsert',v});return Promise.resolve({error:null})},
    single:async()=>({data:null}), maybeSingle:async()=>({data:null}),
    then(g,b){ let r;
      if(x._op==='select'){ r=window.__errore&&tab==='timetable_weeks'&&x._f.project_id?{data:null,error:{message:window.__errore}}
        :{data:tab==='timetable_weeks'&&x._f.project_id?window.__righe.filter(z=>z.project_id===x._f.project_id):[],error:null}; }
      else { window.__fatte.push({tab,op:x._op,v:x._v,f:x._f}); r={error:null}; }
      return Promise.resolve(r).then(g,b); } };
    return x; };
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:q, rpc:async()=>({data:null}), storage:{from:()=>({})}})};
};
(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage(); p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(STUB);
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://'+RADICE+'/index.html',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.clear());
const apri=async(film)=>{
  await p.goto('file://'+RADICE+'/index.html',{waitUntil:'domcontentloaded',timeout:20000});
  await p.waitForTimeout(700);
  await p.evaluate((film)=>{
    currentUser={id:'io'};
    localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
    if(film) localStorage.setItem('cb_film',JSON.stringify({id:'F1',titolo:'Missione San Gennaro'})); else localStorage.removeItem('cb_film');
    document.getElementById('authPage').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('homePage').style.display='none';
    document.getElementById('resultsPage').classList.add('on');
    document.querySelectorAll('[id$="Section"]').forEach(s=>s.style.display='none');
    document.getElementById('timetableSection').style.display='flex';
    ttInited=false; ttVista='giorno'; initTimetable(); ttSetGiorno(0);
    const m=(id,v)=>{document.getElementById(id).value=v;};
    m('tt-film','Missione San Gennaro'); m('tt-settimana','7'); m('tt-dal','2026-11-16'); m('tt-al','2026-11-21');
    const o=ttTabelle[0].orari; o.inizio[0]='07.00'; o.fine[0]='18.30'; o.inizio[1]='07.30'; o.pausa[1]='13.00'; o.fine[1]='19.00';
    ttMeta.tipoGiornata=10; ttMeta.raddoppio=2;
  },film);
  await p.waitForTimeout(200);
};
const sett=(id,chi,reparto,dal,extra={})=>({id,user_id:chi,reparto,project_id:'F1',condivisa:true,updated_at:new Date().toISOString(),
  data:{meta:{film:'Missione San Gennaro',reparto,settimana:'7',dal,al:'2026-11-21',autore:'M. Greco',tipoGiornata:9,raddoppio:0,applicazione:'giornaliero',maggiorazioniNott:true,viaggioConcesso:60},
    tabelle:[{id:1,workers:['M. Greco'],orari:{partenza:[],inizio:['07.00','07.00'],pausa:['','13.00'],stop:[],fine:['18.45','19.30'],rientro:[]}}]},...extra});
const testo=s=>p.evaluate(s=>[...document.querySelectorAll(s)].map(e=>e.textContent.trim().replace(/\s+/g,' ')),s);

console.log('\n── 1. senza film il confronto non c\'è ──');
await apri(false);
await p.click('#sez-confronto .tt-sez-t'); await p.waitForTimeout(200);
ok('si apre a finestra', await p.evaluate(()=>document.getElementById('sez-confronto').classList.contains('aperta')), true);
ok('e dice perché non c\'è niente', (await testo('#tt-cf .cf-nota'))[0].startsWith('Il confronto funziona dentro un film'), true);
ok('senza interruttore', await p.locator('#tt-cf-sw').count(), 0);

console.log('\n── 2. finché la query non è stata lanciata, il salvataggio resta quello di prima ──');
await p.evaluate(()=>localStorage.setItem('__err','column timetable_weeks.condivisa does not exist'));
await apri(true);
ok('⚠ nessuna colonna nuova nel salvataggio', await p.evaluate(()=>ttCfColonne()), {});
await p.click('#sez-confronto .tt-sez-t'); await p.waitForTimeout(250);
ok('la finestra lo dice', await testo('#tt-cf .cf-nota'), ['Il confronto fra reparti non è ancora attivo.']);
ok('⚠ e le colonne restano fuori', await p.evaluate(()=>ttCfColonne()), {});

console.log('\n── 3. chi ha condiviso questa settimana ──');
await p.evaluate((r)=>{localStorage.removeItem('__err'); window.__errore=null; window.__righe=r; ttPiega('confronto');},
  [sett('a','altro1','Fotografia','2026-11-17'), sett('b','altro2','Macchinisti','2026-11-16',{condivisa:false}),
   sett('c','altro3','Elettricisti','2026-11-09'), sett('d','io','Suono','2026-11-16',{condivisa:false})]);
await p.click('#sez-confronto .tt-sez-t'); await p.waitForTimeout(250);
ok('titoli', await testo('#tt-cf .odg-sez'), ['I tuoi orari','Settimana 7 · 16–21 Novembre']);
ok('solo chi ha condiviso, e solo questa settimana', await testo('#tt-cf .cf-r .a'), ['Fotografia']);
ok('⚠ stessa settimana anche se "Dal" è un altro giorno', (await testo('#tt-cf .cf-r .b'))[0].startsWith('M. Greco · aggiornata oggi'), true);
ok('nessuna etichetta uguale/diverso', await p.evaluate(()=>/uguale|divers/i.test(document.getElementById('tt-cf').textContent)), false);
ok('nessun elenco di chi non ha condiviso', await p.evaluate(()=>/non ancora/i.test(document.getElementById('tt-cf').textContent)), false);
ok('interruttore spento, com\'è sul server', await p.getAttribute('#tt-cf-sw','aria-pressed'), 'false');

console.log('\n── 4. l\'interruttore vale per tutto il film ──');
await p.evaluate(()=>{window.__fatte=[];});
await p.click('#tt-cf-sw'); await p.waitForTimeout(300);
ok('acceso', await p.getAttribute('#tt-cf-sw','aria-pressed'), 'true');
const fatte=await p.evaluate(()=>window.__fatte);
ok('le settimane del film prendono film e interruttore', fatte.filter(f=>f.op==='update').map(f=>[f.v,f.f]),
  [[{project_id:'F1',condivisa:true},{user_id:'io',film:'Missione San Gennaro'}],[{condivisa:true},{user_id:'io',project_id:'F1'}]]);
ok('e la settimana a schermo sale già così', [...new Set(fatte.filter(f=>f.op==='upsert').map(f=>[f.v.project_id,f.v.condivisa,f.v.data.meta.autore].join('|')))], ['F1|true|S. Panetta']);
ok('da qui in poi ogni salvataggio lo porta', await p.evaluate(()=>ttCfColonne()), {project_id:'F1',condivisa:true});

console.log('\n── 5. il confronto ──');
await p.click('#tt-cf .cf-r'); await p.waitForTimeout(200);
ok('titolo', await p.textContent('#tt-cf-titolo'), 'Confronto');
ok('le due colonne', (await testo('#tt-cf .cf-t.gg:first-child .i')).slice(1), ['Suono','Fotografia']);
ok('un giorno per riga, i miei e i loro', (await testo('#tt-cf button.cf-t.gg')).slice(0,3), ['Lun 1607.00–18.3007.00–18.45','Mar 1707.30–19.0007.00–19.30','Mer 18——']);
ok('niente giallo sulle caselle', await p.evaluate(()=>[...document.querySelectorAll('#tt-cf .cf-t .c')].every(e=>getComputedStyle(e).color===getComputedStyle(document.querySelector('#tt-cf .cf-t .c')).color)), true);
await p.click('#tt-cf button.cf-t.gg[data-g="1"]'); await p.waitForTimeout(150);
ok('toccando il giorno si apre il dettaglio', await testo('#tt-cf .cf-ap .cf-t .l'), ['Inizio','Pausa','Fine','Golden']);
/* Io: 07.30–19.00 con giornata da 10h = 1h30 golden. Loro: 07.00–19.30 con
   giornata da 9h = 3h30: il conto si fa con le regole di chi ha compilato. */
ok('⚠ la golden di ognuno con le sue regole', (await testo('#tt-cf .cf-ap .cf-t .c')).slice(-2), ['1h 30','3h 30']);
ok('⚠ e le mie regole restano le mie', await p.evaluate(()=>[ttMeta.tipoGiornata,ttMeta.raddoppio]), [10,2]);
ok('indicatore delle regole diverse', await testo('#tt-cf-regole'), ['Regole diverse dalle tueGiornata: tu 10h · loro 9hRaddoppio golden: tu dopo 2h · loro no']);

console.log('\n── 6. copia i loro orari ──');
ok('il tasto', await testo('#tt-cf .cf-usa'), ['Copia i loro orari nel mio martedì']);
await p.click('#tt-cf .cf-usa'); await p.waitForTimeout(200);
ok('giorno già compilato: chiede prima', await p.evaluate(()=>ttTabelle[0].orari.fine[1]), '19.00');
await p.evaluate(()=>{ const t=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.textContent.trim()==='Copia'); t[t.length-1].click(); });
await p.waitForTimeout(250);
ok('dopo il sì sono i loro', await p.evaluate(()=>['inizio','pausa','fine'].map(k=>ttTabelle[0].orari[k][1])), ['07.00','13.00','19.30']);
ok('gli altri giorni non si toccano', await p.evaluate(()=>[ttTabelle[0].orari.inizio[0],ttTabelle[0].orari.fine[0]]), ['07.00','18.30']);
ok('e finiscono nella bozza salvata', await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')).rec.tabelle[0].orari.fine[1]), '19.30');

console.log('\n── 7. indietro ──');
await p.click('#sez-confronto .tt-fin-via'); await p.waitForTimeout(150);
ok('dal confronto torna all\'elenco', [await p.textContent('#tt-cf-titolo'), await p.evaluate(()=>document.getElementById('sez-confronto').classList.contains('aperta'))], ['Confronta reparti',true]);
await p.click('#sez-confronto .tt-fin-via'); await p.waitForTimeout(150);
ok('dall\'elenco chiude', await p.evaluate(()=>document.getElementById('sez-confronto').classList.contains('aperta')), false);

console.log('\n── 8. regole uguali: nessun indicatore ──');
await p.evaluate(()=>{ window.__righe[0].data.meta.tipoGiornata=10; window.__righe[0].data.meta.raddoppio=2; });
await p.click('#sez-confronto .tt-sez-t'); await p.waitForTimeout(250);
await p.click('#tt-cf .cf-r'); await p.waitForTimeout(150);
ok('non compare', await p.locator('#tt-cf-regole').count(), 0);

console.log('\n── 9. la prima volta l\'interruttore è già acceso ──');
await p.evaluate(()=>{ localStorage.removeItem('cb_tt_condivisi'); localStorage.removeItem('cb_tt_cf_ok'); });
await apri(true);
await p.waitForTimeout(300);
await p.evaluate((r)=>{ window.__righe=r; }, [sett('a','altro1','Fotografia','2026-11-17')]);
ok('⚠ acceso senza aprire il confronto', await p.evaluate(()=>ttCfColonne()), {project_id:'F1',condivisa:true});
ok('e le settimane del film già salvate lo prendono', await p.evaluate(()=>window.__fatte.filter(f=>f.op==='update').map(f=>f.v)), [{project_id:'F1',condivisa:true},{condivisa:true}]);
await p.click('#sez-confronto .tt-sez-t'); await p.waitForTimeout(250);
ok('nella finestra risulta acceso', await p.getAttribute('#tt-cf-sw','aria-pressed'), 'true');
await p.evaluate(()=>{window.__righe.push({id:'d',user_id:'io',reparto:'Suono',project_id:'F1',condivisa:false,data:{meta:{},tabelle:[]}});});
await p.click('#tt-cf-sw'); await p.waitForTimeout(300);
await p.evaluate(()=>{ localStorage.removeItem('cb_tt_condivisi'); ttCfApri(); }); await p.waitForTimeout(300);
ok('⚠ chi l\'ha spento lo ritrova spento, anche su un altro telefono', await p.getAttribute('#tt-cf-sw','aria-pressed'), 'false');

ok('nessun errore in pagina', err, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati');
process.exit(ko?1:0);
})();
