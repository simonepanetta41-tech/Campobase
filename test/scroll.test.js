/* ⚠ UN'ATTESA DI QUESTO CONTROLLO E' ANCORA ROSSA, e non e' spiegata.
 *
 * Nato per un guasto vero: sulla tabella delle ore, su un telefono, si
 * scorreva fino al sabato, si scriveva un orario, e lo scorrimento tornava
 * al lunedi' facendo perdere il segno.
 *
 * QUI SOPRA C'ERA SCRITTA UNA SPIEGAZIONE SBAGLIATA, e vale la pena
 * lasciarne memoria. Diceva che la tabella era cambiata, che a 390 pixel
 * la vista a settimana non sbordava piu' e che quindi le due attese rosse
 * parlavano di una schermata inesistente. Misurato poi davvero: a 390
 * pixel ci sono 352 pixel da scorrere, e il KO "le ore calcolate si
 * aggiornano" era un guasto in piena regola — ttSetO infilava l'id della
 * tabella, che e' un numero con la virgola, dentro un selettore CSS, e
 * sollevava un errore prima di salvare l'orario. Quell'attesa adesso e'
 * verde, e il guasto e' coperto da ore-scrittura.test.js.
 *
 * Morale: un rosso che non si capisce non si archivia con un racconto.
 * Questo controllo stava dicendo la verita' e gli e' stata scritta sopra
 * una spiegazione che lo faceva sembrare obsoleto. E' una forma piu'
 * educata di ritarare le attese finche' passano, e fa lo stesso danno.
 *
 * COSA RESTA: l'attesa "il campo resta attivo" e' ancora rossa e NON si
 * sa perche'. Provato a parte, il comportamento dell'app e' giusto:
 * scrivendo in una casella della vista a settimana e aspettando 600ms, il
 * fuoco resta sulla casella. Quindi il sospetto e' che a perderlo sia
 * questa sequenza di prova — lo scorrimento e le misure fra una scrittura
 * e l'altra — e non l'app. Ma "il sospetto e'" non basta: va trovato il
 * motivo e poi o si rifa' l'attesa su cio' che conta davvero (la tastiera
 * che non si chiude su iOS), oppure si toglie. Quello che non si deve
 * fare e' aggiustarla finche' diventa verde.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');

(async()=>{
  const b=await chromium.launch();
  // iPhone in verticale.
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  // Le dipendenze esterne non sono raggiungibili dalla sandbox: si stubbano
  // prima che la pagina giri, altrimenti lo script si ferma al primo errore.
  await p.addInitScript(()=>{
    window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signInWithOAuth:async()=>({})},from:()=>({select:()=>({eq:()=>({single:async()=>({data:null})})}),upsert:async()=>({})})})};
    window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
    window.jspdf={jsPDF:function(){return{};}};
  });
  const errori=[];
  p.on('pageerror',e=>errori.push(e.message));
  await p.goto('file://' + RADICE + '/index.html');
  await p.waitForTimeout(600);

  // Senza sessione l'app resta dietro la pagina di accesso: la si apre a
  // mano, perche' qui interessa solo il comportamento della tabella.
  await p.evaluate(()=>{
    document.getElementById('authPage').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('resultsPage').style.display='flex';
    try{switchResultTab('timetable');}catch(e){}
  });
  await p.waitForTimeout(300);

  const stato=await p.evaluate(()=>{
    const s=document.getElementById('timetableSection');
    return {visibile:s&&getComputedStyle(s).display!=='none',
            tabelle:document.querySelectorAll('.tt-scroll').length,
            errori:[]};
  });
  console.log('sezione timetable visibile:',stato.visibile,'— tabelle:',stato.tabelle);
  if(errori.length) console.log('errori di pagina:',errori.slice(0,3));
  if(!stato.tabelle){ console.log('nessuna tabella: creo'); await p.evaluate(()=>{try{ttAddFirst();}catch(e){}}); await p.waitForTimeout(200); }

  /* La vista a settimana, che e' quella che scorre.
   *
   * Su uno schermo stretto l'app si apre sulla vista a giorno, e la vista
   * a giorno non ha niente da scorrere: .tt-scroll non esiste e questo
   * controllo si rompeva su un elemento nullo. La cosa da verificare c'e'
   * ancora — chi sta su un telefono puo' passare a Settimana — e quindi si
   * passa a Settimana prima di scorrere. */
  /* E un lavoratore dentro: una tabella vuota non ha righe, quindi non ha
     campi da compilare e non ha niente che sborda. Prima questo controllo
     girava su tabelle gia' salvate sul telefono, che qui non ci sono. */
  await p.evaluate(()=>{try{
    if (ttTabelle[0] && !ttTabelle[0].workers.length) { ttTabelle[0].workers.push('S. Panetta'); ttRenderAll(); }
  }catch(e){}});
  await p.waitForTimeout(200);
  await p.evaluate(()=>{try{ttSetVista('settimana');}catch(e){}});
  await p.waitForTimeout(250);
  if(!await p.evaluate(()=>!!document.querySelector('.tt-scroll'))){
    console.log('ok — saltato: nessuna tabella da scorrere'); await b.close(); process.exit(0);
  }

  const misura=async()=>p.evaluate(()=>{
    const sc=document.querySelector('.tt-scroll');
    return {scrollLeft:Math.round(sc.scrollLeft),max:sc.scrollWidth-sc.clientWidth};
  });

  // Scorri fino in fondo a destra (sabato) e compila il campo partenza.
  await p.evaluate(()=>{document.querySelector('.tt-scroll').scrollLeft=9999;});
  await p.waitForTimeout(150);
  const prima=await misura();
  console.log('\nscorrimento massimo:',prima.max,'— posizione dopo lo scroll:',prima.scrollLeft);
  console.log(await p.evaluate(()=>{
    // Chi sta nascondendo la tabella: si risale la catena.
    let e=document.querySelector('.tt-scroll'), catena=[];
    while(e&&e!==document.documentElement){
      const cs=getComputedStyle(e);
      catena.push(`${e.tagName}${e.id?'#'+e.id:''}${e.className&&typeof e.className==='string'?'.'+e.className.trim().split(/\s+/)[0]:''} w=${Math.round(e.getBoundingClientRect().width)} ${cs.display}`);
      e=e.parentElement;
    }
    return catena;
  }));
  console.log(await p.evaluate(()=>{
    const sc=document.querySelector('.tt-scroll'), t=sc.querySelector('table.tt2');
    const w=document.getElementById('timetableSection');
    return {contenitore:Math.round(sc.getBoundingClientRect().width),
            tabella:Math.round(t.getBoundingClientRect().width),
            minWidth:getComputedStyle(t).minWidth,
            sezione:Math.round(w.getBoundingClientRect().width),
            overflowX:getComputedStyle(sc).overflowX,
            corpo:Math.round(document.body.getBoundingClientRect().width)};
  }));

  const sel=f=>`input[data-f="${f}"][data-i="5"]`;   // colonna del sabato
  const scrive=async(f,v)=>{
    await p.evaluate(({s,v})=>{
      const i=document.querySelector(s); i.focus(); i.value=v;
      i.dispatchEvent(new Event('change',{bubbles:true}));
    },{s:sel(f),v});
    await p.waitForTimeout(120);
    const m=await misura();
    return `${m.scrollLeft} (max ${m.max})`;
  };

  let ko=0;
  const atteso=(e,a,v)=>{const ok=String(a)===String(v);if(!ok)ko++;console.log(`  ${ok?'ok ':'KO '}${e.padEnd(40)} ${String(a).padEnd(8)} atteso ${v}`);};

  console.log('\ncompilo la colonna del sabato, una casella per volta:');
  for(const [f,v] of [['partenza','07.20'],['inizio','07.30'],['fine','18.00'],['rientro','19.30']])
    console.log(`     dopo "${f}" = ${v}: ${await scrive(f,v)}`);
  const fine=await misura();
  // Il salto da correggere portava a zero. Un paio di pixel di differenza
  // sono invece l'effetto legittimo di una tabella che cambia larghezza
  // quando le celle calcolate si riempiono.
  atteso('resta sul sabato (scostamento <= 8px)', Math.abs(fine.scrollLeft-Math.min(prima.scrollLeft,fine.max))<=8, 'true');

  // Il campo su cui si sta scrivendo non deve perdere il fuoco: su iOS
  // perderlo chiude la tastiera a ogni casella.
  const fuoco=await p.evaluate(()=>{const a=document.activeElement;return a&&a.dataset?`${a.dataset.f}/${a.dataset.i}`:'nessuno';});
  atteso('il campo resta attivo', fuoco, 'rientro/5');

  // E i calcoli devono essersi aggiornati davvero, non solo "non rompersi".
  const calcolati=await p.evaluate(()=>{
    const g=k=>document.querySelector(`td[data-c="${k}"][data-ci="5"]`)?.textContent;
    return {viaggio:g('oreViaggio'),gold:g('goldenOrd'),sesto:document.querySelector('.tt-sub')?.textContent.trim()};
  });
  console.log('  valori calcolati del sabato:',JSON.stringify(calcolati));
  atteso('le ore calcolate si aggiornano', calcolati.gold!=='—'||calcolati.viaggio!=='—', 'true');

  console.log(ko===0?'\nok — la tabella resta dov\'e\' e i conti si aggiornano':`\nKO — ${ko} controlli falliti`);
  await p.screenshot({path:'/tmp/claude-0/-home-claude/53b34710-362c-5fb2-bfbf-da310a874ca4/scratchpad/scroll-dopo.png'});
  await b.close(); process.exit(ko?1:0);
})();
