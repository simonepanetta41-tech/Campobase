/* Il tasto "Nuova settimana" nella sezione Ore.
 *
 * Ha preso il posto di "Svuota", che cancellava gli orari e basta. Il
 * guaio era il dopo: l'app salva da sola, e una settimana si riconosce
 * per film, reparto e numero. Svuotando senza cambiare il numero, il
 * salvataggio automatico riscriveva sul cloud la settimana appena finita
 * con gli orari vuoti.
 *
 * Quindi i controlli che contano sono quelli in cui il tasto si FERMA:
 * non si va avanti finche' la settimana in corso non e' al sicuro, e non
 * si atterra su una settimana che nello storico c'e' gia'.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(50)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},in(){return this},order:async()=>({data:[]}),
               limit:async()=>({data:[]}),upsert:async()=>({error:null}),
               single:async()=>({data:null}),maybeSingle:async()=>({data:null})}),
    storage:{from:()=>({})}
  })};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(700);
await p.evaluate(()=>{
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('resultsPage').style.display='flex';
  switchResultTab('ore');
});
await p.waitForTimeout(300);

console.log('\n── il numero e le date che vengono dopo ──');
const dopo = x => p.evaluate(v=>ttSettimanaDopo(v), x);
ok('"3"',        await dopo('3'), '4');
ok('"Sett. 3"',  await dopo('Sett. 3'), 'Sett. 4');
ok('"3ª"',       await dopo('3ª'), '4ª');
ok('"9" → "10"', await dopo('9'), '10');
ok('senza numero', await dopo('ultima'), '');
ok('lunedì + 7',          await p.evaluate(()=>ttDataPiu7('2026-11-09')), '2026-11-16');
ok('a cavallo del mese',  await p.evaluate(()=>ttDataPiu7('2026-11-28')), '2026-12-05');
ok('a cavallo dell\'anno', await p.evaluate(()=>ttDataPiu7('2026-12-28')), '2027-01-04');
ok('data vuota resta vuota', await p.evaluate(()=>ttDataPiu7('')), '');

/* Una settimana compilata, e i pezzi esterni sotto controllo: cosa
   risponde il cloud, cosa c'e' nello storico, cosa risponde l'utente. */
const prova = (mondo) => p.evaluate(async m=>{
  const set=(id,v)=>{document.getElementById(id).value=v;};
  set('tt-film','Missione San Gennaro'); set('tt-reparto','Suono');
  set('tt-settimana', m.sett===undefined?'4':m.sett); set('tt-dal','2026-11-09'); set('tt-al','2026-11-14');
  ttTabelle=[ttMkTab(['S. Panetta'])];
  if(!m.vuota){ ttTabelle[0].orari.inizio[0]='07.30'; ttTabelle[0].orari.fine[0]='18.00'; }
  ttMeta.note='nota della settimana';
  const fatti={sync:0, chiesto:null, avvisi:[]};
  ttSync=async()=>{ fatti.sync++; return m.cloud!==false; };
  ttRenderStorico=async()=>{};
  ttStoricoCache=m.storico||[];
  askConfirm=async(t)=>{ fatti.chiesto=t; return m.conferma!==false; };
  showToast=(t)=>{ fatti.avvisi.push(t); };
  await ttNuovaSettimana();
  const v=id=>document.getElementById(id).value;
  return {sett:v('tt-settimana'), dal:v('tt-dal'), al:v('tt-al'), film:v('tt-film'),
          inizio:ttTabelle[0].orari.inizio[0], squadra:ttTabelle[0].workers, note:ttMeta.note,
          sync:fatti.sync, chiesto:!!fatti.chiesto, avviso:fatti.avvisi[0]||''};
}, mondo);

console.log('\n── tutto a posto: si va avanti ──');
let r = await prova({});
ok('prima si salva quella in corso', r.sync, 1);
ok('numero e date avanti di una settimana', [r.sett, r.dal, r.al], ['5','2026-11-16','2026-11-21']);
ok('orari e note vuoti', [r.inizio, r.note], ['','']);
ok('squadra e film restano', [r.squadra, r.film], [['S. Panetta'],'Missione San Gennaro']);

console.log('\n── ⚠ se il cloud non conferma non si tocca niente ──');
/* Senza rete la settimana vive solo sul telefono, in una bozza sola:
   andare avanti la cancellerebbe per sempre. */
r = await prova({cloud:false});
ok('settimana e orari come prima', [r.sett, r.inizio, r.note], ['4','07.30','nota della settimana']);
ok('non si chiede nemmeno conferma', r.chiesto, false);
ok('e si dice perché', /non è ancora al sicuro/.test(r.avviso), true);

console.log('\n── ⚠ senza numero di settimana non si può conservare ──');
r = await prova({sett:''});
ok('niente cambia', [r.inizio, r.sync], ['07.30', 0]);
ok('e si dice cosa manca', /numero di questa settimana/.test(r.avviso), true);

console.log('\n── ⚠ la settimana di arrivo c\'è già nello storico ──');
/* Azzerarla e salvarla la sovrascriverebbe, come faceva "Svuota". */
r = await prova({storico:[{meta:{settimana:'5', film:'missione san gennaro', reparto:'Suono'}, tabelle:[]}]});
ok('ci si ferma', [r.sett, r.inizio], ['4','07.30']);
ok('e lo si dice', /c'è già nello storico/.test(r.avviso), true);
/* Ma la 5 di un altro reparto o di un altro film non c'entra. */
r = await prova({storico:[{meta:{settimana:'5', film:'Altro film', reparto:'Suono'}, tabelle:[]}]});
ok('la 5 di un altro film non blocca', r.sett, '5');

console.log('\n── chi annulla resta dov\'era ──');
r = await prova({conferma:false});
ok('niente cambia', [r.sett, r.inizio], ['4','07.30']);

console.log('\n── una settimana ancora vuota avanza senza passare dal cloud ──');
r = await prova({vuota:true, cloud:false});
ok('avanza', [r.sett, r.sync], ['5', 0]);

console.log('\n── il tasto ──');
const tasti = await p.evaluate(()=>[...document.querySelectorAll('#timetableSection > div:first-child button')].map(b=>b.textContent.trim()));
ok('Nuova settimana ed Esporta PDF, niente Svuota né Salva', tasti, ['Nuova settimana','Esporta PDF']);

ok('nessun errore di pagina', errori.filter(e=>!/supabase/i.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
