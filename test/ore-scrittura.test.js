/* Scrivere un orario, e ritrovarlo.
 *
 * L'id di una tabella nasce da Date.now()+Math.random(): un numero con la
 * virgola, tipo 1794413039170.8691. ttSetO lo infilava dentro un selettore
 * CSS — "#ttb-1794413039170.8691 input[...]" — e per il CSS quel ".8691"
 * e' il nome di una classe: selettore illegale, querySelector solleva un
 * errore, e la funzione si fermava una riga prima di quella che salva
 * l'orario.
 *
 * Sul telefono non si vedeva: l'app si apre sulla vista a giorno, e quel
 * ramo usa getElementById, a cui la virgola non da' fastidio. Bastava
 * passare a Settimana perche' ogni orario battuto sparisse senza un
 * avviso. Su schermo largo, dove la settimana e' la vista di partenza,
 * non si poteva scrivere niente del tutto.
 *
 * Qui si prova la cosa piu' semplice che ci sia, in tutte e due le viste
 * e a due larghezze: scrivo un'ora, la ritrovo nei dati, e i conti si
 * muovono.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

const FINTO = () => {
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},order(){return this},
               single:async()=>({data:null}),maybeSingle:async()=>({data:null}),
               upsert:async()=>({error:null})}),
    storage:{from:()=>({upload:async()=>({}),download:async()=>({})})}
  })};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
};

const APRI = () => {
  localStorage.clear();
  window.currentUser=null;
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  document.getElementById('resultsPage').style.display='block';
  document.querySelectorAll('[id$="Section"]').forEach(s=>s.style.display='none');
  document.getElementById('timetableSection').style.display='flex';
  ttInited=false; initTimetable();
  document.getElementById('tt-dal').value='2026-11-09';
};

(async()=>{
const b=await chromium.launch();

for(const [larghezza, etichetta] of [[390,'iPhone'],[768,'schermo largo']]){
  console.log(`\n── ${etichetta} (${larghezza}px) ──`);
  const p=await b.newPage({viewport:{width:larghezza,height:844},
                           isMobile:larghezza<600,hasTouch:larghezza<600});
  const errori=[]; p.on('pageerror',e=>errori.push(e.message));
  await p.addInitScript(FINTO);
  await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.goto('file://' + RADICE + '/index.html');
  await p.waitForTimeout(800);
  await p.evaluate(APRI);

  /* L'id con la virgola e' la condizione del guasto: se un giorno le
     tabelle nascessero con un id intero questo controllo non proverebbe
     piu' niente, ed e' giusto che lo dica. */
  ok('l\'id della tabella ha la virgola',
     await p.evaluate(()=>!Number.isInteger(ttTabelle[0].id)), true);

  /* Ogni vista scrive su una giornata sua. Scrivendo tutte e due sul
     lunedi', la settimana trovava li' quello che ci aveva messo il
     giorno un attimo prima e il controllo passava anche da rotto. */
  for(const [vista, di] of [['giorno',0],['settimana',2]]){
    const r=await p.evaluate(a=>{
      const tab=ttTabelle[0];
      ttVista=a.v; if(a.v==='giorno')ttGiornoSel=a.di;
      ttRenderAll();
      let errore=null;
      try{
        ttSetO(tab.id,'inizio',a.di,'07.30');
        ttSetO(tab.id,'fine',a.di,'19.30');
      }catch(e){ errore=String(e.message).slice(0,70); }
      return {errore,
              scritto:[tab.orari.inizio[a.di],tab.orari.fine[a.di]],
              // 12h di lavoro con la giornata da 10h: 2h di golden.
              golden:ttCalcTab(tab.orari).days[a.di].goldenOrd};
    }, {v:vista, di});
    ok(`vista ${vista}: nessun errore`, r.errore, null);
    ok(`vista ${vista}: l'orario si salva`, r.scritto, ['07.30','19.30']);
    ok(`vista ${vista}: i conti si muovono`, r.golden, 120);
  }

  ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
  await p.close();
}

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
