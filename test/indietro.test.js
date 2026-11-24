/* Tornare indietro: il segno in testa e lo scorrimento.
 *
 * Il tasto per tornare alla scelta del progetto c'e' sempre stato — e'
 * il nome del film in alto — ma lo diceva una freccetta verso il basso,
 * che di solito vuol dire "qui si apre qualcosa". Adesso c'e' il segno
 * di indietro, tutto a sinistra, e si puo' anche scorrere.
 *
 * Lo scorrimento vale su ordine del giorno, spoglio e piano. NON sulle
 * ore: li' la tabella della settimana scorre gia' in orizzontale, e un
 * gesto che vuol dire "indietro" su una pagina dove si scorre per
 * arrivare al sabato sarebbe un modo per uscirne per sbaglio. Quella
 * esclusione e' il controllo piu' importante di questo file.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},order(){return this},
               single:async()=>({data:null}),maybeSingle:async()=>({data:null}),
               upsert:async()=>({error:null})}),
    storage:{from:()=>({upload:async()=>({}),download:async()=>({})})}
  })};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(800);

/* Un gesto col dito, fatto a mano: Playwright non ha uno "swipe", e
   quello che conta qui sono i tre eventi nell'ordine giusto. */
const scorri=(sel,dx,dy)=>p.evaluate(a=>{
  const el=document.querySelector(a.sel); if(!el) return 'nessun elemento '+a.sel;
  const r=el.getBoundingClientRect();
  const x0=r.left+20, y0=r.top+Math.min(60,r.height/2);
  const tocco=(x,y)=>({identifier:1,target:el,clientX:x,clientY:y});
  const manda=(tipo,lista)=>el.dispatchEvent(new TouchEvent(tipo,{bubbles:true,cancelable:true,
    touches:tipo==='touchend'?[]:lista, changedTouches:lista, targetTouches:tipo==='touchend'?[]:lista}));
  manda('touchstart',[new Touch(tocco(x0,y0))]);
  manda('touchmove', [new Touch(tocco(x0+a.dx/2,y0+a.dy/2))]);
  manda('touchend',  [new Touch(tocco(x0+a.dx,y0+a.dy))]);
  return 'ok';
},{sel,dx,dy});

const dove=()=>p.evaluate(()=>
  document.getElementById('homePage')?.style.display!=='none' ? 'home' : 'progetto');

const apri=(sezione)=>p.evaluate(s=>{
  localStorage.clear();
  window.currentUser=null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').style.display='block';
  document.querySelectorAll('[id$="Section"]').forEach(x=>x.style.display='none');
  const el=document.getElementById(s);
  el.style.display = s==='timetableSection' ? 'flex' : 'block';
  if(s==='timetableSection'){ ttInited=false; initTimetable(); }
  // Qualcosa da toccare dentro la sezione, se e' vuota.
  if(!el.firstElementChild || !el.textContent.trim())
    el.innerHTML='<div style="height:400px">contenuto</div>';
}, sezione);

console.log('\n── il segno di indietro in testa ──');
ok('non c\'è più la freccetta in giù',
   await p.evaluate(()=>!!document.querySelector('.cb-giu')), false);
ok('c\'è il segno di indietro',
   await p.evaluate(()=>document.querySelector('.cb-back')?.textContent), '‹');
ok('ed è il primo, prima del nome',
   await p.evaluate(()=>{const b=document.querySelector('.cb-ident');
     return b.firstElementChild.className;}), 'cb-back');
ok('il tasto è quello dell\'indietro',
   await p.evaluate(()=>document.querySelector('.cb-ident').getAttribute('onclick')),
   "cbIndietro()");

console.log('\n── ⚠ da Altro si torna da dove si era partiti, non fuori dal film ──');
/* Entrando in Cast da Altro e premendo indietro si finiva alla scelta del
   film, e bisognava rientrarci. */
const dopo = async (passi) => p.evaluate((passi)=>{ let fuori=false; const vera=showPage; showPage=()=>{ fuori=true; };
  rtAdesso = rtPrimaDiAltro = null;
  for (const x of passi) { if (x==='<') cbIndietro(); else switchResultTab(x); }
  showPage=vera; return fuori ? 'fuori dal film' : rtAdesso; }, passi);
ok('OdG → Altro → Cast → indietro: di nuovo sull\'ordine del giorno', await dopo(['odg','altro','cast','<']), 'odg');
ok('Spoglio → Altro → indietro: di nuovo sullo spoglio', await dopo(['spoglio','altro','<']), 'spoglio');
ok('girando dentro Altro ci si ricorda sempre da dove si era entrati', await dopo(['piano','altro','cast','altro','troupe','analisi','<']), 'piano');
ok('e da lì un altro indietro esce dal film, come sempre', await dopo(['odg','altro','cast','<','<']), 'fuori dal film');
ok('⚠ dalle pagine del film l\'indietro esce subito', [await dopo(['odg','<']), await dopo(['spoglio','ore','<'])], ['fuori dal film','fuori dal film']);
ok('si ricorda l\'ultima, non la prima', await dopo(['odg','altro','cast','spoglio','altro','troupe','<']), 'spoglio');
ok('aperto direttamente su Cast (da una notifica): indietro esce', await dopo(['cast','<']), 'fuori dal film');
ok('uscendo dal film non resta memoria per il prossimo', await p.evaluate(()=>{ const vera=showPage; showPage=()=>{}; switchResultTab('odg'); switchResultTab('altro'); cbEsciDalFilm(); showPage=vera; return [rtAdesso, rtPrimaDiAltro]; }), [null,null]);
await p.evaluate(()=>{ document.getElementById('resultsPage').style.display=''; switchResultTab('odg'); });

console.log('\n── sulla schermata di scelta non si torna da nessuna parte ──');
await p.evaluate(()=>{
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='block';
  document.getElementById('resultsPage').style.display='none';
  cbTestata();
});
ok('il segno è nascosto',
   await p.evaluate(()=>document.querySelector('.cb-back').style.display), 'none');

console.log('\n── scorrendo verso destra si torna indietro ──');
for(const [sez, nome] of [['odgSection','ordine del giorno'],
                          ['spoglioSection','spoglio'],
                          ['pdlSection','piano']]){
  await apri(sez);
  ok(`${nome}: prima sono dentro`, await dove(), 'progetto');
  await scorri('#'+sez, 140, 10);
  await p.waitForTimeout(150);
  ok(`${nome}: scorrendo torno alla scelta`, await dove(), 'home');
}

console.log('\n── ⚠ e da Altro e dalle sue pagine riporta dove si era, come la freccia ──');
/* Su cast, troupe e analisi il gesto non c'era: la freccia in alto
   riportava alla pagina di prima, il dito no. */
for (const [t, nome] of [['altro','Altro'],['cast','cast'],['troupe','troupe'],['analisi','analisi']]) {
  await apri('spoglioSection');
  await p.evaluate((t)=>{ rtAdesso=rtPrimaDiAltro=null; switchResultTab('spoglio'); switchResultTab('altro'); if(t!=='altro') switchResultTab(t); }, t);
  await p.waitForTimeout(120);
  await scorri('#'+({altro:'altroSection',cast:'castSection',troupe:'troupeSection',analisi:'analisiSection'})[t], 140, 10);
  await p.waitForTimeout(150);
  ok(`${nome}: scorrendo torno allo spoglio, non fuori dal film`, [await p.evaluate(()=>rtAdesso), await dove()], ['spoglio','progetto']);
}
await apri('odgSection');
await p.evaluate(()=>{ rtAdesso=rtPrimaDiAltro=null; switchResultTab('odg'); switchResultTab('altro'); switchResultTab('script'); });
await scorri('#scriptSection', 140, 10); await p.waitForTimeout(150);
ok('sulla sceneggiatura no: lì col dito si lavora', await p.evaluate(()=>rtAdesso), 'script');

console.log('\n── ⚠ negli Orari: ovunque, tranne che sulle tabelle ──');
/* Sulla tabella della settimana si scorre col dito per arrivare al
   sabato: se quel gesto cambiasse schermata, compilare il sabato
   diventerebbe un terno al lotto. Sul resto della pagina vale come altrove. */
await apri('timetableSection');
await p.evaluate(()=>{ rtAdesso='ore'; rtPrimaDiAltro=null; try{ initTimetable(); }catch(_){} });
ok('prima sono dentro', await dove(), 'progetto');
await scorri('#tt-tabelle', 140, 10); await p.waitForTimeout(150);
ok('sulla tabella: scorrendo resto dove sono', await dove(), 'progetto');
ok('la tabella c\'è davvero, non è un contenitore vuoto', await p.evaluate(()=>document.getElementById('tt-tabelle').getBoundingClientRect().height>100), true);
await scorri('#tt-note', 140, 10); await p.waitForTimeout(150);
ok('da un campo in cui si scrive, nemmeno', await dove(), 'progetto');
await p.evaluate(()=>ttPiega('regole'));
await scorri('#sez-regole .tt-fin-corpo', 140, 10); await p.waitForTimeout(150);
ok('⚠ con una finestra aperta il gesto chiude quella, non la pagina', [await p.evaluate(()=>document.querySelectorAll('.tt-sez.aperta').length), await dove()], [0,'progetto']);
await scorri('#tt-quale', 140, 10); await p.waitForTimeout(150);
ok('⚠ dal resto della pagina torno indietro', await dove(), 'home');

console.log('\n── e nemmeno con un gesto che non è chiaro ──');
await apri('odgSection');
await scorri('#odgSection', 140, 120);   // troppo in diagonale
await p.waitForTimeout(150);
ok('di sbieco non conta', await dove(), 'progetto');
await scorri('#odgSection', 40, 5);      // troppo corto
await p.waitForTimeout(150);
ok('troppo corto non conta', await dove(), 'progetto');
await scorri('#odgSection', -140, 5);    // verso sinistra
await p.waitForTimeout(150);
ok('verso sinistra non conta', await dove(), 'progetto');

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
