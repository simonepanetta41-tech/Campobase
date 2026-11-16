/* Le scene segnate a mano: girata, o da girare.
 *
 * I documenti non dicono tutto, e allora una scena la si segna dalla sua
 * scheda. Due cose contano:
 *   - il segno e' uno solo, e spoglio e piano dicono sempre la stessa cosa;
 *   - e' di tutta la troupe del film, ma se il cloud non c'e' resta sul
 *     telefono e si vede lo stesso.
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
  window.CLOUD={righe:[],scritture:[],rotto:false};
  const tavola=(nome)=>{
    const q={ _f:{},
      select(){return q}, eq(k,v){q._f[k]=v;return q}, in(){return q}, order(){return q},
      limit:async()=>{
        if(nome!=='scene_segnate') return {data:[],error:null};
        if(window.CLOUD.rotto) return {data:null,error:{message:'relation "public.scene_segnate" does not exist'}};
        return {data:window.CLOUD.righe.filter(r=>r.project_id===q._f.project_id),error:null};
      },
      upsert:async(r)=>{ if(nome!=='scene_segnate') return {error:null}; if(window.CLOUD.rotto) return {error:{message:'no'}};
        window.CLOUD.scritture.push(['metti',r.scena,r.stato]);
        window.CLOUD.righe=window.CLOUD.righe.filter(x=>!(x.project_id===r.project_id&&x.scena===r.scena)).concat([r]); return {error:null}; },
      delete(){ return { eq(k,v){ const f={[k]:v}; return { eq:async(k2,v2)=>{ f[k2]=v2;
        window.CLOUD.scritture.push(['togli',f.scena]);
        window.CLOUD.righe=window.CLOUD.righe.filter(x=>!(x.project_id===f.project_id&&x.scena===f.scena)); return {error:null}; } }; } }; },
      single:async()=>({data:null}), maybeSingle:async()=>({data:null}),
      then(ok){ return Promise.resolve({data:[],error:null}).then(ok); } };
    return q; };
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:tavola, rpc:async()=>({data:null}), storage:{from:()=>({})}})};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(700);

/* Oggi e' il 12 novembre. Il piano: la 44 e la 45 gia' passate, la 70 a venire. */
const entra=(film='f1')=>p.evaluate((film)=>{
  localStorage.clear(); currentUser={id:'u1'}; filmCorrente=()=>({id:film,titolo:film});
  const Vero=Date; const fisso=new Vero(2026,10,12,10,0).getTime();
  if(!window.__fermo){ window.__fermo=1; window.Date=class extends Vero{ constructor(...a){ super(...(a.length?a:[fisso])); } static now(){ return fisso; } }; }
  const g=(n,data,scene)=>({numero_giorno:n,data,ora_inizio:'12:00',ora_fine:'20:00',scene:scene.map(x=>({numero:x,int_ext:'EXT',momento:'D',cast:[]}))});
  pdlData={titolo:'X',settimane:[{numero:1,label:'Settimana 1',giorni:[g(1,'2026-11-10',['44','45End']),g(2,'2026-11-20',['70','71Pt'])]}]}; window.pdlData=pdlData;
  pdlShootingData={}; odgPassati=[]; odgCorrente=null; sceneSegnate={};
  CLOUD.righe=[]; CLOUD.scritture=[]; CLOUD.rotto=false;
}, film);
const fatte=()=>p.evaluate(()=>[...sceneFatte()].sort());

console.log('\n── segnare una scena ──');
await entra();
ok('dai documenti: le due già passate', await fatte(), ['44','45']);
await p.evaluate(()=>scenaSegna('70'));
ok('⚠ una scena a venire, segnata girata', await fatte(), ['44','45','70']);
ok('scritta sul cloud, per tutta la troupe', await p.evaluate(()=>CLOUD.scritture), [['metti','70','girata']]);
await p.evaluate(()=>scenaSegna('44'));
ok('⚠ una che i fogli danno per fatta, riaccesa', await fatte(), ['45','70']);
ok('scritta come "da girare"', await p.evaluate(()=>CLOUD.scritture[1]), ['metti','44','da_girare']);
await p.evaluate(()=>scenaSegna('71Pt'));
ok('"71Pt" si segna come la 71', [await fatte(), await p.evaluate(()=>CLOUD.scritture[2])], [['45','70','71'], ['metti','71','girata']]);

console.log('\n── tornare indietro ──');
await p.evaluate(()=>scenaSegna('70'));
ok('la 70 torna da girare', await fatte(), ['45','71']);
ok('⚠ e il segno si toglie: torna a seguire i fogli', await p.evaluate(()=>[CLOUD.scritture[3], '70' in sceneSegnate]), [['togli','70'], false]);
await p.evaluate(()=>scenaSegna('44'));
ok('la 44 torna girata, senza segno', [await fatte(), await p.evaluate(()=>'44' in sceneSegnate)], [['44','45','71'], false]);

console.log('\n── ⚠ spoglio e piano dicono la stessa cosa ──');
await entra();
let r=await p.evaluate(async()=>{
  document.getElementById('authPage').style.display='none'; document.getElementById('app').style.display='block';
  document.getElementById('resultsPage').style.display='flex';
  // un tasto come quello della scheda dello spoglio
  const t=document.createElement('button'); t.id='spGirataBtn'; t.dataset.n='70'; document.body.appendChild(t);
  spoglioGirataBottone('70'); const prima=[...t.querySelectorAll('span')].map(x=>x.textContent).join(' ');
  renderPdlStats(); const barraPrima=document.querySelector('.pdl-barra b').textContent;
  await scenaSegna('70');
  const dopo=[...t.querySelectorAll('span')].map(x=>x.textContent).join(' '), acceso=t.classList.contains('on');
  const barraDopo=document.querySelector('.pdl-barra b').textContent;
  // la finestra della giornata nel piano
  pdlModalSceneStates={}; renderPdlModalChips(getPdlAllGiorni()[1]);
  const chip=[...document.querySelectorAll('#pdlModalChips .pdl-chip')].map(c=>[c.querySelector('.pdl-chip-num').textContent, c.classList.contains('girato'), c.querySelector('.pdl-chip-segna').classList.contains('on')]);
  // e dal piano la si riaccende
  document.getElementById('pdlDayModal').classList.add('open');
  document.querySelector('#pdlModalChips .pdl-chip-segna').click(); await new Promise(r=>setTimeout(r,50));
  const dalPiano=[...t.querySelectorAll('span')].map(x=>x.textContent).join(' ');
  const chipDopo=document.querySelector('#pdlModalChips .pdl-chip').classList.contains('girato');
  t.remove(); document.getElementById('pdlDayModal').classList.remove('open');
  return {prima,dopo,acceso,barraPrima,barraDopo,chip,dalPiano,chipDopo};
});
ok('il tasto nello spoglio invita a segnarla', r.prima, 'Segna come girata ○');
ok('toccato, dice che è girata', [r.dopo, r.acceso], ['Girata ✓ tocca per riaccenderla', true]);
ok('la barra del piano sale', [r.barraPrima, r.barraDopo], ['2/4 · 50%','3/4 · 75%']);
ok('⚠ nel piano la stessa scena risulta girata', r.chip, [['70',true,true],['71Pt',false,false]]);
ok('⚠ riaccesa dal piano, lo spoglio la segue', [r.dalPiano, r.chipDopo], ['Segna come girata ○', false]);

console.log('\n── di tutta la troupe, ma anche senza cloud ──');
await entra();
await p.evaluate(async()=>{ CLOUD.righe=[{project_id:'f1',scena:'70',stato:'girata'},{project_id:'f1',scena:'45',stato:'da_girare'},{project_id:'f2',scena:'9',stato:'girata'}]; await sceneSegnateCarica(); });
ok('quelle segnate da un collega arrivano', await fatte(), ['44','70']);
ok('⚠ quelle di un altro film no', await p.evaluate(()=>'9' in sceneSegnate), false);
await entra();
await p.evaluate(async()=>{ CLOUD.rotto=true; await scenaSegna('70'); await sceneSegnateCarica(); });
ok('⚠ senza la tabella il segno resta sul telefono', await fatte(), ['44','45','70']);
await p.evaluate(async()=>{ sceneSegnate={}; await sceneSegnateCarica(); });
ok('e si ritrova riaprendo', await fatte(), ['44','45','70']);

ok('nessun errore di pagina', errori, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
