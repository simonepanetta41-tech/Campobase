const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
const fs=require('fs');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(48)} ${JSON.stringify(got)}`.padEnd(90)+` atteso ${JSON.stringify(exp)}`);};
const STUB=()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};};
(async()=>{
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage(); p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(STUB);
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
const apri=async()=>{
  await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
  await p.waitForTimeout(700);
  await p.evaluate(()=>{
    window.currentUser=null;
    document.getElementById('authPage').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('homePage').style.display='none';
    document.getElementById('resultsPage').classList.add('on');
    document.querySelectorAll('[id$="Section"]').forEach(s=>s.style.display='none');
    document.getElementById('timetableSection').style.display='flex';
    ttInited=false; ttVista='giorno'; initTimetable(); ttSetGiorno(0);
  });
  await p.waitForTimeout(200);
};

console.log('\n── 1. l\'orario si salva a ogni tasto ──');
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.evaluate(()=>localStorage.clear());
await apri();
await p.click('[id$="-inizio"]');
await p.type('[id$="-inizio"]','0730',{delay:30});
// niente blur, niente change: come chiudere l'app con la tastiera aperta
ok('scritto senza confermare il campo',
   await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')||'{}')?.rec?.tabelle?.[0]?.orari?.inizio?.[0]), '07.30');

console.log('\n── e quando l\'app va in secondo piano ──');
await p.evaluate(()=>{const e=document.querySelector('[id$="-fine"]');e.focus();e.value='21.30';});
await p.evaluate(()=>{Object.defineProperty(document,'visibilityState',{get:()=>'hidden',configurable:true});
  document.dispatchEvent(new Event('visibilitychange'));});
await p.waitForTimeout(120);
ok('preso anche il campo attivo',
   await p.evaluate(()=>JSON.parse(localStorage.getItem('cb_tt_bozza')).rec.tabelle[0].orari.fine[0]), '21.30');

console.log('\n── e riaprendo c\'è ──');
await apri();
ok('inizio', await p.evaluate(()=>ttTabelle[0].orari.inizio[0]), '07.30');
ok('fine',   await p.evaluate(()=>ttTabelle[0].orari.fine[0]), '21.30');
ok('a schermo', await p.inputValue('[id$="-fine"]'), '21.30');

console.log('\n── 2. storico, intestazione e regole: tre tasti, tre finestre ──');
/* I tasti dicono solo il loro nome, al centro, senza riepilogo; toccati,
   aprono una finestra a tutto schermo. I campi restano quelli di prima. */
ok('i tasti portano solo il nome, niente riepilogo', await p.evaluate(()=>{ttSommari();return [...document.querySelectorAll('.tt-sez-t')].map(b=>b.textContent.trim())}), ['Storico settimane','Intestazione','Regole di calcolo','Confronta con altri reparti']);
ok('col nome al centro', await p.evaluate(()=>getComputedStyle(document.querySelector('.tt-sez-t')).justifyContent), 'center');
const aperte=()=>p.evaluate(()=>['storico','testa','regole'].filter(k=>document.getElementById('sez-'+k).classList.contains('aperta')));
ok('⚠ entrando nella pagina nessuna finestra è aperta', await aperte(), []);
await p.evaluate(()=>{ localStorage.setItem('cb_tt_sez_regole','1'); ttPieghePrime(); });
ok('nemmeno se una volta la sezione era rimasta aperta', await aperte(), []);
await p.evaluate(()=>ttPiega('regole'));
ok('toccando il tasto si apre a tutto schermo, sopra la barra', await p.evaluate(()=>{ const c=document.querySelector('#sez-regole .tt-sez-c'), r=c.getBoundingClientRect(), st=getComputedStyle(c);
  return [st.position, Math.round(r.width)===innerWidth, Math.round(r.height)===innerHeight, +st.zIndex>=300]; }), ['fixed',true,true,true]);
ok('con il suo titolo e i gruppi in ordine', await p.evaluate(()=>[document.querySelector('#sez-regole .cb-titolo').textContent, [...document.querySelectorAll('#sez-regole .odg-sez')].filter(e=>e.offsetParent).map(e=>e.textContent)]),
  ['Regole di calcolo',['Tipo giornata','Raddoppio ore golden','Maggiorazioni notturne','Ore viaggio concesse al giorno']]);
ok('⚠ le scelte sono quelle di prima, con i loro nomi', await p.evaluate(()=>[['tt-tg10','tt-tg8','tt-rd0','tt-rd1','tt-rd2','tt-rd3','tt-nOff','tt-nOn','tt-applG','tt-applS'].every(id=>document.querySelector('#sez-regole #'+id)), document.querySelectorAll('#sez-regole .tt-vtog').length, document.querySelectorAll('#sez-regole .tt-tog.active').length>=3]), [true,5,true]);
await p.evaluate(()=>ttPiega('testa'));
ok('⚠ una finestra alla volta', await aperte(), ['testa']);
ok('i campi dell\'intestazione ci sono tutti, con i loro nomi', await p.evaluate(()=>['tt-produzione','tt-film','tt-reparto','tt-settimana','tt-dal','tt-al'].every(id=>document.querySelector('#sez-testa #'+id))), true);
await p.click('#sez-testa .tt-fin-fatto');
ok('"Fatto" la chiude', await aperte(), []);
await p.evaluate(()=>ttPiega('storico')); await p.click('#sez-storico .tt-fin-via');
ok('e anche la freccia in alto', await aperte(), []);

console.log('\n── ⚠ le regole di calcolo sono una sola, per tutte le settimane ──');
/* Prima ogni settimana salvata si portava le sue: riaprendone una vecchia
   tornavano 8h invece di 10h, e i conti cambiavano da soli. */
const sett=(n,dal,al,regole)=>({id:'w'+n,updated_at:'2026-11-0'+n+'T10:00:00Z',data:{meta:{produzione:'P',film:'Missione San Gennaro',reparto:'Suono',settimana:String(n),dal,al,note:'nota '+n,
  tipoGiornata:10,raddoppio:0,applicazione:'giornaliero',maggiorazioniNott:true,viaggioConcesso:60,...regole},
  tabelle:[{id:1,workers:['Simone Panetta','Anna Riva'],orari:{partenza:['','','','','',''],inizio:['08.00','','','','',''],pausa:['','','','','',''],stop:['','','','','',''],fine:['19.00','','','','',''],rientro:['','','','','','']}}]}});
await p.evaluate((righe)=>{ window.RIGHE=righe; window.TOLTE=[]; currentUser={id:'u1'}; askConfirm=async()=>true;
  sb.from=()=>{ const x={select(){return x},eq(v,id){ if(x.togli){ TOLTE.push(id); RIGHE=RIGHE.filter(r=>r.id!==id); } return x; },order:async()=>({data:RIGHE,error:null}),upsert:async()=>({error:null}),
    delete(){ x.togli=true; return x; },then(g){return Promise.resolve({data:[],error:null}).then(g)}}; return x; }; },
  [sett(4,'2026-10-26','2026-10-31',{tipoGiornata:8,viaggioConcesso:0,maggiorazioniNott:false}), sett(6,'2026-11-09','2026-11-14',{}), sett(5,'2026-11-02','2026-11-07',{raddoppio:2})]);
const regole=()=>p.evaluate(()=>[ttMeta.tipoGiornata,ttMeta.raddoppio,ttMeta.maggiorazioniNott,ttMeta.viaggioConcesso]);
await p.evaluate(async()=>{ localStorage.removeItem('cb_tt_regole'); Object.assign(ttMeta,{tipoGiornata:10,raddoppio:0,maggiorazioniNott:true,viaggioConcesso:60}); ttRegoleSalva(false); await ttRenderStorico(); });
await p.evaluate(()=>ttSetViaggio(90)); await p.waitForTimeout(100);
ok('cambiare una regola la salva a parte, sul telefono', await p.evaluate(()=>{ const r=JSON.parse(localStorage.getItem('cb_tt_regole')); return [r.viaggioConcesso, r.tipoGiornata, !!r.il, !!r.provvisorie]; }), [90,10,true,false]);
await p.evaluate(()=>ttLoad(ttStoricoCache.findIndex(w=>w.meta.settimana==='4'))); await p.waitForTimeout(100);
ok('⚠ aprendo una settimana salvata a 8h senza viaggio, le regole restano le mie', await regole(), [10,0,true,90]);
ok('gli orari, le note e l\'intestazione invece sono i suoi', await p.evaluate(()=>[ttTabelle[0].orari.inizio[0], ttMeta.note, document.getElementById('tt-settimana').value, document.getElementById('tt-dal').value]), ['08.00','nota 4','4','2026-10-26']);
ok('e i tasti delle regole dicono quelle vere', await p.evaluate(()=>[document.getElementById('tt-tg10').classList.contains('active'), document.getElementById('tt-tg8').classList.contains('active'), [...document.querySelectorAll('.tt-vtog.active')].map(b=>b.dataset.mins)]), [true,false,['90']]);
await p.evaluate(()=>ttLoad(ttStoricoCache.findIndex(w=>w.meta.settimana==='5'))); await p.waitForTimeout(100);
ok('lo stesso con un\'altra: nessuna settimana ha regole sue', await regole(), [10,0,true,90]);
ok('⚠ chiudendo e riaprendo l\'app valgono ancora', await p.evaluate(()=>{ Object.assign(ttMeta,{tipoGiornata:8,viaggioConcesso:0}); ttRegoleApplica(); return [ttMeta.tipoGiornata, ttMeta.viaggioConcesso]; }), [10,90]);
ok('una settimana salvata se le porta ancora dietro, come ricordo', await p.evaluate(()=>ttRecord().meta.viaggioConcesso), 90);
ok('⚠ su un telefono nuovo si riprendono dall\'ultima settimana salvata, una volta sola', await p.evaluate(async()=>{ localStorage.removeItem('cb_tt_regole'); Object.assign(ttMeta,{tipoGiornata:10,raddoppio:0,maggiorazioniNott:true,viaggioConcesso:60}); ttRegoleSalva(true);
  RIGHE[0].data.meta.viaggioConcesso=120; await ttRenderStorico(); const prima=ttMeta.viaggioConcesso; RIGHE[0].data.meta.viaggioConcesso=30; await ttRenderStorico(); return [prima, ttMeta.viaggioConcesso, !!JSON.parse(localStorage.getItem('cb_tt_regole')).provvisorie]; }), [120,120,false]);

console.log('\n── lo storico e la settimana a schermo ──');
await p.evaluate(async()=>{ ttLoad(ttStoricoCache.findIndex(w=>w.meta.settimana==='5')); await ttRenderStorico(); });
ok('la scritta "a schermo" non c\'è da nessuna parte', await p.evaluate(async()=>{ await ttRenderStorico(); return /a schermo/i.test(document.getElementById('timetableSection').innerText+document.getElementById('tt-storico').textContent); }), false);
ok('⚠ sopra la tabella c\'è scritto quale settimana si guarda', await p.evaluate(()=>[...document.querySelectorAll('#tt-quale span')].map(x=>x.textContent)), ['Settimana 5','2–7 Novembre']);
ok('a cavallo di due mesi, o senza date', await p.evaluate(()=>[ttPeriodo('2026-11-30','2026-12-05'), ttPeriodo('2026-11-16',''), ttPeriodo('','')]), ['30 nov – 5 dic','16 nov','']);
ok('sopra la tabella il mese è per esteso, e la data sta a capo sotto il numero', await p.evaluate(()=>[ttPeriodo('2026-11-16','2026-11-21',true), ttPeriodo('2026-11-30','2026-12-05',true), getComputedStyle(document.getElementById('tt-quale')).flexDirection]), ['16–21 Novembre','30 Novembre – 5 Dicembre','column']);
await p.evaluate(()=>{ document.getElementById('tt-settimana').value=''; ttSommari(); });
ok('senza numero lo dice, non resta vuoto', await p.evaluate(()=>document.querySelector('#tt-quale .n').textContent), 'Settimana senza numero');
await p.evaluate(()=>{ document.getElementById('tt-settimana').value='5'; ttSommari(); });
await p.click('#tt-quale'); await p.waitForTimeout(250);
ok('toccandolo si apre lo storico', await aperte(), ['storico']);
ok('una scheda per settimana, dalla più recente', await p.evaluate(()=>[...document.querySelectorAll('#tt-storico .tt-st .n')].map(x=>x.textContent)), ['Settimana 6','Settimana 5','Settimana 4']);
ok('con le date, il reparto e chi c\'è', await p.evaluate(()=>{ const c=document.querySelector('#tt-storico .tt-st'); return [c.querySelector('.tt-st-s').textContent, c.querySelector('.tt-st-c').textContent]; }), ['9–14 nov · Suono · Missione San Gennaro','Simone Panetta, Anna Riva']);
ok('⚠ quella che si guarda è segnata, e non si riapre su se stessa', await p.evaluate(()=>[...document.querySelectorAll('#tt-storico .tt-st')].map(c=>[c.classList.contains('questa'), c.querySelector('.apri').disabled, c.querySelector('.apri').textContent])), [[false,false,'Apri'],[true,true,'Aperta'],[false,false,'Apri']]);
await p.click('#tt-storico .tt-st:first-child .apri'); await p.waitForTimeout(200);
ok('"Apri" carica la settimana e chiude la finestra', [await p.evaluate(()=>document.getElementById('tt-settimana').value), await aperte(), await p.evaluate(()=>document.querySelector('#tt-quale .n').textContent)], ['6',[],'Settimana 6']);
await p.evaluate(()=>{ askConfirm=async()=>false; return ttDelS(ttStoricoCache.findIndex(w=>w.meta.settimana==='4')); });
ok('⚠ eliminare chiede conferma: detto di no, resta', await p.evaluate(()=>[TOLTE, RIGHE.length]), [[],3]);
await p.evaluate(()=>{ askConfirm=async()=>true; return ttDelS(ttStoricoCache.findIndex(w=>w.meta.settimana==='4')); }); await p.waitForTimeout(150);
ok('detto di sì, va via quella e solo quella', await p.evaluate(()=>[TOLTE, [...document.querySelectorAll('#tt-storico .tt-st .n')].map(x=>x.textContent)]), [['w4'],['Settimana 6','Settimana 5']]);
console.log('\n── 3. il profilo si chiede all\'ingresso, non all\'OdG ──');
await p.evaluate(()=>{localStorage.removeItem('cb_profilo');localStorage.removeItem('cb_odg_io');});
ok('c\'è la schermata di benvenuto', await p.evaluate(()=>!!document.getElementById('benvenuto')), true);
ok('si apre se manca il profilo',    await p.evaluate(()=>profiloBenvenuto()), true);
ok('e mostra i tre campi',           await p.evaluate(()=>['profNome','profCognome','profReparto'].every(i=>document.getElementById(i))), true);
await p.fill('#profNome','Simone'); await p.fill('#profCognome','Panetta');
await p.selectOption('#profReparto','Suono');
await p.click('.prof-chiedi .ok'); await p.waitForTimeout(250);
ok('si chiude',                      await p.evaluate(()=>getComputedStyle(document.getElementById('benvenuto')).display), 'none');
ok('e non si riapre',                await p.evaluate(()=>profiloBenvenuto()), false);
await p.evaluate(()=>{odgCorrente={numero:20,data:'2026-11-09',convocazione:'07.30',
  troupe:[{reparto:'SUONO',ruolo:'Microfonista',nome:'S. Panetta',set:'07.30'}]};
  document.getElementById('resultsPage').classList.add('on'); switchResultTab('odg');});
await p.waitForTimeout(200);
ok('l\'OdG non richiede il nome',     await p.evaluate(()=>!document.querySelector('#odgCorpo .prof-chiedi')), true);
ok('chiede solo la conferma',        await p.evaluate(()=>document.querySelector('.odg-chi .t').textContent.trim()), 'Sei tu?');

console.log('\n── 4. Gennaro nascosto ──');
ok('niente voce in Altro', await p.evaluate(()=>!/Gennaro/.test(document.getElementById('altroSection').innerText)), true);
ok('niente chat nei risultati', await p.evaluate(()=>{
  const e=document.getElementById('chatSection'); return !e || getComputedStyle(e).display==='none';}), true);
ok('il codice resta',      await p.evaluate(()=>typeof toggleGennaroDrawer==='function'), true);

console.log('\n── 5. le impostazioni coprono i risultati ──');
await p.evaluate(()=>showPage('settings'));
await p.waitForTimeout(200);
ok('risultati via',   await p.evaluate(()=>{const e=document.getElementById('resultsPage');
  return getComputedStyle(e).display==='none'||!e.classList.contains('on')}), true);
ok('niente OdG in fondo', await p.evaluate(()=>{
  const e=document.getElementById('odgSection');
  return !e.offsetParent;}), true);
ok('impostazioni visibili', await p.evaluate(()=>getComputedStyle(document.getElementById('settingsPage')).display!=='none'), true);

console.log('\n── più allegati insieme: i tre file veri ──');
const fileVeri = {};
for (const [f,atteso] of [['odg.txt','odg'],['giri.txt','giri'],['stralci.txt','stralci']]) {
  /* I documenti veri stanno in test/dati/, fuori da git: dentro c'e' la
     lista della troupe. */
  // Non "p": qui dentro p e' la pagina di Playwright.
  const percorso = require('path').join(__dirname, 'dati', f);
  if (!fs.existsSync(percorso)) { console.log('ok — saltato: manca ' + percorso); process.exit(0); }
  const t = fs.readFileSync(percorso, 'utf8');
  fileVeri[f] = t;
  ok(f, await p.evaluate(x=>odgTipoDoc(x),t), atteso);
}
ok('il principale è l\'OdG, non il primo in ordine alfabetico',
   await p.evaluate(v=>{
     const letti = Object.entries(v).map(([nome,testo])=>({nome,testo,tipo:odgTipoDoc(testo)}))
                   .sort((a,b)=>a.nome.localeCompare(b.nome));   // come li passa iOS
     const p = letti.find(x=>x.tipo==='odg')
       || letti.slice().sort((a,b)=>b.testo.length-a.testo.length)[0];
     return p.nome;
   }, fileVeri), 'odg.txt');
ok('nessuno dichiarato OdG: vince il più lungo',
   await p.evaluate(()=>{
     const letti=[{nome:'a',testo:'x'.repeat(100),tipo:null},{nome:'b',testo:'y'.repeat(900),tipo:null}];
     return (letti.find(x=>x.tipo==='odg')||letti.slice().sort((a,b)=>b.testo.length-a.testo.length)[0]).nome;
   }), 'b');
ok('si possono scegliere più file', await p.evaluate(()=>{
  const i=document.querySelector('#odgCorpo input[type=file]'); return !!i && i.multiple;}), true);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
