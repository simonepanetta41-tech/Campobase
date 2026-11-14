/* Il tempo d'uso, per sezione.
 *
 * Si conta solo il tempo davanti agli occhi; un'app congelata dal
 * telefono per mezz'ora non e' mezz'ora d'uso. E non si deve mai contare
 * due volte, ne' perdere il conto se manca il campo.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(52)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.clock.install({time:new Date('2026-11-14T10:00:00Z')});
await p.addInitScript(()=>{
  window.INVII=[]; window.GUASTO=null;
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null}),maybeSingle:async()=>({data:null})}),
    rpc:async(n,a)=>{ if(n!=='segna_uso') return {data:null}; if(window.GUASTO) return {error:window.GUASTO}; window.INVII.push(a.p_righe); return {error:null}; },
    storage:{from:()=>({})}})};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.clock.runFor(700);
// Da qui il tempo va avanti solo quando lo dice la prova.
await p.clock.pauseAt(new Date('2026-11-14T10:01:00Z'));
/* Si legge dopo aver chiuso il conto fino a questo istante: cosi' il
   controllo non dipende da quando cade il battito dei quindici secondi. */
const coda=()=>p.evaluate(()=>{ usoSegna(); return usoCoda(); });
const manda=()=>p.evaluate(async()=>{ usoSegna(); await usoManda(); usoUltimoInvio=Date.now()+3600000; const x=INVII; INVII=[]; return x.map(r=>Object.fromEntries(r.map(y=>[y.sezione,y.secondi]))); });
const fermaInvii=()=>p.evaluate(()=>{ usoUltimoInvio=Date.now()+3600000; });

console.log('\n── senza nessuno dentro non si conta ──');
await p.clock.runFor(60000);
ok('niente in coda, niente mandato', [await coda(), await manda()], [{}, []]);

console.log('\n── il tempo va alla sezione che si guarda ──');
await p.evaluate(()=>{ currentUser={id:'u1'}; localStorage.removeItem('cb_uso_coda'); usoDa=Date.now();
  document.getElementById('authPage').style.display='none'; document.getElementById('app').style.display='block';
  document.getElementById('resultsPage').style.display='flex'; switchResultTab('odg'); });
await fermaInvii();
await p.clock.runFor(30000);
ok('trenta secondi sull\'ordine del giorno', await coda(), {odg:30});
await p.evaluate(()=>switchResultTab('piano'));
await p.clock.runFor(20000);
ok('poi venti sul piano', await coda(), {odg:30, piano:20});
ok('si manda, e la coda si svuota', [await manda(), await coda()], [[{odg:30, piano:20}], {}]);
/* Da solo, senza che nessuno lo chiami: un invio al minuto. */
await p.evaluate(()=>{ usoUltimoInvio=Date.now(); });
await p.clock.runFor(50000);
ok('prima del minuto non manda', (await p.evaluate(()=>INVII.length)), 0);
await p.clock.runFor(30000);
ok('passato il minuto manda da solo', (await p.evaluate(()=>{const n=INVII.length; INVII=[]; return n;})), 1);
await fermaInvii(); await manda();

console.log('\n── ⚠ in tasca non conta ──');
await p.evaluate(()=>{ Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
await p.clock.runFor(30*60000);
await p.evaluate(()=>{ INVII=[]; Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true}); document.dispatchEvent(new Event('visibilitychange')); });
await p.clock.runFor(10000);
ok('mezz\'ora in tasca: contano solo i secondi dopo', await coda(), {piano:10});
/* Il telefono congela l'app senza avvisare: il timer salta mezz'ora in un colpo. */
await p.evaluate(()=>{ usoDa = Date.now() - 30*60000; });
ok('⚠ un salto di mezz\'ora non è mezz\'ora d\'uso', await coda(), {piano:10});

console.log('\n── ⚠ senza campo non si perde e non si raddoppia ──');
await p.evaluate(()=>{ GUASTO={message:'Failed to fetch'}; });
await p.clock.runFor(10000);
ok('l\'invio fallisce: niente parte', await manda(), []);
ok('e il tempo resta in coda', await coda(), {piano:20});
await p.evaluate(()=>{ GUASTO=null; });
await p.clock.runFor(10000);
ok('torna il campo: parte tutto, una volta sola', [await manda(), await coda()], [[{piano:30}], {}]);

console.log('\n── fuori dal film, e senza la funzione sul database ──');
await p.evaluate(()=>{ document.getElementById('resultsPage').style.display='none'; });
await p.clock.runFor(10000);
ok('fuori dal film è "home"', await coda(), {home:10});
await p.evaluate(()=>{ GUASTO={code:'PGRST202',message:'Could not find the function public.segna_uso'}; });
await manda();
await p.clock.runFor(120000);
ok('sql non lanciato: smette, senza riprovare ogni minuto', [await p.evaluate(()=>usoFermo), await p.evaluate(()=>usoCoda())], [true, {}]);
ok('nessun errore di pagina', errori, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
