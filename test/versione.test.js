/* Rianalizzare una sceneggiatura non deve far sparire il piano.
 *
 * Rianalizzare non sostituisce l'analisi: ne crea una versione nuova. Ma
 * il piano di lavorazione e il cast stanno appesi all'id dell'analisi
 * vecchia — chi rianalizzava si ritrovava il cruscotto del piano vuoto,
 * le giornate marcate perse e il cast sparito, con il piano ancora li' nel
 * database a due righe di distanza.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(104)+' atteso '+JSON.stringify(exp));};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:393,height:852}});
p.setDefaultTimeout(15000);

await p.addInitScript(()=>{
  // Un database finto con dentro una versione vecchia, il suo piano e il
  // suo cast.
  window.__db = {
    analyses: [{id:'v1', project_id:'film1', created_at:'2026-10-01'}],
    pdl_versions: [{analysis_id:'v1', user_id:'u1',
      data:{titolo:'MSG', totale_giorni:37}, shooting_data:{'3':{status:'complete'}}}],
    cast_list: [{id:'c1', created_at:'2026-10-01', analysis_id:'v1', character_id:1, nome:'CIRO'},
                {id:'c2', created_at:'2026-10-01', analysis_id:'v1', character_id:2, nome:'ASSUNTA'}]
  };
  const tavola = (t) => {
    let righe = window.__db[t] || [];
    let filtro = r => true;
    const q = {
      select(){ return q; },
      eq(c,v){ const f=filtro; filtro = r => f(r) && r[c]===v; return q; },
      neq(c,v){ const f=filtro; filtro = r => f(r) && r[c]!==v; return q; },
      in(c,vs){ const f=filtro; filtro = r => f(r) && vs.includes(r[c]); return q; },
      order(){ return q; },
      limit: async () => ({data: righe.filter(filtro)}),
      then: (fn) => fn({data: righe.filter(filtro), error:null}),
      maybeSingle: async () => ({data: righe.filter(filtro)[0] || null}),
      single: async () => ({data: righe.filter(filtro)[0] || null, error:null}),
      insert(v){ const vs=[].concat(v); window.__db[t].push(...vs);
                 return {select:()=>({single: async()=>({data: vs[0]})})}; },
      upsert(v){ const vs=[].concat(v);
                 for (const n of vs) {
                   const i = window.__db[t].findIndex(r => r.analysis_id === n.analysis_id);
                   i >= 0 ? window.__db[t][i] = n : window.__db[t].push(n);
                 }
                 return Promise.resolve({error:null}); },
      update(){ return q; }
    };
    return q;
  };
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from: tavola, rpc: async()=>({data:[],error:null}),
    storage:{from:()=>({download:async()=>({data:null,error:'no'}), upload:async()=>({data:null,error:null})})}})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);

console.log('\n── la versione nuova si porta dietro piano e cast ──');
const dopo = await p.evaluate(async()=>{
  currentUser = {id:'u1'};
  window.__db.analyses.push({id:'v2', project_id:'film1', created_at:'2026-11-11'});
  await portaAvanti('film1', 'v2');
  const piani = window.__db.pdl_versions;
  const cast = window.__db.cast_list;
  return {
    piani: piani.map(x=>x.analysis_id),
    nuovoPiano: (piani.find(x=>x.analysis_id==='v2')||{}).data,
    marcature: (piani.find(x=>x.analysis_id==='v2')||{}).shooting_data,
    cast: cast.map(c=>c.analysis_id+':'+c.nome)
  };
});
ok('il piano c\'è su tutte e due', dopo.piani, ['v1','v2']);
ok('ed è lo stesso piano',        dopo.nuovoPiano, {titolo:'MSG', totale_giorni:37});
// Le giornate gia' marcate sono lavoro di qualcuno: non si buttano.
ok('con le giornate marcate',     dopo.marcature, {'3':{status:'complete'}});
ok('e il cast è copiato',         dopo.cast,
   ['v1:CIRO','v1:ASSUNTA','v2:CIRO','v2:ASSUNTA']);

console.log('\n── la versione vecchia resta intera ──');
// Copia e non spostamento: aprire la v1 deve ancora mostrare il suo piano.
ok('v1 ha ancora il suo piano', await p.evaluate(()=>
  !!window.__db.pdl_versions.find(x=>x.analysis_id==='v1')), true);
ok('e il suo cast',             await p.evaluate(()=>
  window.__db.cast_list.filter(c=>c.analysis_id==='v1').length), 2);

console.log('\n── rifarlo due volte non duplica niente ──');
/* Il piano si riscrive sopra, il cast sono righe e insert le aggiunge:
   senza un controllo, in troupe comparirebbe ogni attore in doppio. */
ok('un piano solo per v2', await p.evaluate(async()=>{
  await portaAvanti('film1', 'v2');
  return window.__db.pdl_versions.filter(x=>x.analysis_id==='v2').length;}), 1);
ok('e due attori, non quattro', await p.evaluate(()=>
  window.__db.cast_list.filter(c=>c.analysis_id==='v2').length), 2);

console.log('\n── la prima analisi di un film non ha niente da portare ──');
ok('nessun piano inventato', await p.evaluate(async()=>{
  window.__db.analyses.push({id:'w1', project_id:'film2', created_at:'2026-11-11'});
  await portaAvanti('film2', 'w1');
  return window.__db.pdl_versions.filter(x=>x.analysis_id==='w1').length;}), 0);

console.log('\n── e se il database risponde male, non si rompe ──');
ok('non scoppia', await p.evaluate(async()=>{
  const vero = sb.from;
  sb.from = () => { throw new Error('rete assente'); };
  let scoppiato = false;
  try { await portaAvanti('film1','v2'); } catch(_) { scoppiato = true; }
  sb.from = vero;
  return scoppiato;}), false);

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
