const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(44)} ${JSON.stringify(got)}`.padEnd(88)+` atteso ${JSON.stringify(exp)}`);};
(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(()=>{window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  from:()=>({select(){return this},eq(){return this},order(){return this},limit:async()=>({data:[]}),upsert:async()=>({error:null}),single:async()=>({data:null})}),
  storage:{from:()=>({})}})};});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded',timeout:20000});
await p.waitForTimeout(700);

console.log('\n── la tabella ──');
ok('21 categorie',   await p.evaluate(()=>SPOGLIO.length), 21);
ok('7 reparti',      await p.evaluate(()=>REPARTI.length), 7);
ok('ogni categoria ha un reparto noto', await p.evaluate(()=>SPOGLIO.every(c=>REPARTI.some(r=>r[0]===c.rep))), true);
ok('nessuna chiave doppia',  await p.evaluate(()=>new Set(SPOGLIO.map(c=>c.key)).size), 21);
ok('ogni categoria ha un\'icona', await p.evaluate(()=>SPOGLIO.filter(c=>!SPOGLIO_ICONE[c.key]).map(c=>c.key)), []);
ok('tutte descritte al modello', await p.evaluate(()=>SPOGLIO.every(c=>c.desc&&c.desc.length>40)), true);

console.log('\n── il prompt si genera da lì ──');
for (const k of ['armi','minori','alba_tramonto','effetti_trucco','costumi_speciali','musica_diegetica'])
  ok('nel prompt: '+k, await p.evaluate(x=>SYSPROMPT.includes('"'+x+'"')&&SYSPROMPT.includes('- '+x+':'),k), true);
ok('niente categorie morte', await p.evaluate(()=>/dialoghi_movimento|crowd_parlante|location_wild/.test(SYSPROMPT)), false);
ok('non parla più di solo suono', await p.evaluate(()=>/reparto suono/i.test(SYSPROMPT)), false);

console.log('\n── un\'analisi vecchia si legge ancora ──');
const vecchia = {
  stunt_effetti:{presente:true,scene:[{scena:'SC.9 (p.12)',tipo:'caduta dal tetto'}]},
  mezzi_movimento:{presente:true,scene:[{scena:'SC.2 (p.3)',mezzo:'moto'}]},
  aerei_elicotteri:{presente:true,scene:[{scena:'SC.8 (p.9)',tipo:'elicottero'}]},
  crowd_parlante:{presente:true,scene:[{scena:'SC.5 (p.6)',note:'mercato'}]},
  costume_critico:{presente:true,scene:[{scena:'SC.7 (p.8)',personaggi:'ANNA',attori:2}]},
  location_wild:{presente:true,scene:[{scena:'SC.1 (p.1)',location:'bosco'}]},
  subacquee:{presente:true,scene:['SC.55 (p.60)']},
  dialoghi_movimento:{presente:true,scene:[{scena:'SC.3'}]},
  playback:{presente:true,esibizioni_live:[{scena:'SC.12',note:'band'}],playback_puro:[],
            musica_diegetica:[{scena:'SC.3 (p.4)',fonte:'radio'}]}
};
const conv = await p.evaluate(v=>spoglioDati(v), vecchia);
ok('stunt rinominato',      Object.keys(conv).includes('stunt'), true);
ok('aerei dentro mezzi',    conv.mezzi_scena.scene.length, 2);
ok('e con la stessa etichetta', conv.mezzi_scena.scene.map(s=>s.mezzo).sort(), ['elicottero','moto']);
ok('crowd diventa folla',   conv.folla.scene[0].note, 'mercato');
ok('musica diegetica salvata', conv.musica_diegetica.scene[0].fonte, 'radio');
ok('playback separato',     conv.playback.scene.length, 1);
ok('subacquee da stringa',  conv.subacquee.scene[0].scena, 'SC.55 (p.60)');
ok('dialoghi in movimento eliminati', !!conv.dialoghi_movimento, false);

console.log('\n── le vecchie chiavi si vedono nella vista nuova ──');
const d = Object.assign({titolo:'Missione San Gennaro',totale_scene:184,scene_list:[]}, vecchia);
await p.evaluate(x=>{
  localStorage.setItem('cb_profilo',JSON.stringify({nome:'Simone',cognome:'Panetta',reparto:'Suono'}));
  localStorage.removeItem('cb_rep_spoglio'); localStorage.removeItem('cb_cat_attive');
  window.currentUser=null; window.catNotesData={};
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('homePage').style.display='none';
  window.analysisData=x; renderResults(x); switchResultTab('spoglio');
}, d);
await p.waitForTimeout(250);
const reps = await p.evaluate(()=>[...document.querySelectorAll('.sp-rep-h span:first-child')].map(e=>e.textContent));
ok('il mio reparto per primo', reps[0], 'Suono');
/* Si vede solo quello che e' scelto, e senza una scelta esplicita vale il
   reparto: un fonico apre lo spoglio e trova il suono. Le altre non
   spariscono in silenzio — in fondo c'e' scritto quante sono. */
ok('solo il mio reparto', reps, ['Suono']);
ok('le sue categorie', await p.evaluate(()=>document.querySelectorAll('.sp-cat').length), 2);
/* Il numero non si scrive a mano: si controlla che i conti tornino —
   quelle a schermo piu' quelle lasciate fuori fanno tutte quelle trovate.
   Un numero copiato a mano regge finche' non si tocca la batteria di
   prova, e poi va aggiornato senza che nessuno sappia piu' perche'. */
ok('e in fondo cosa resta fuori', await p.evaluate(()=>{
  const n = document.getElementById('spFuori');
  const viste = document.querySelectorAll('#spoglioSection .sp-sc').length;
  const fuori = +(n.textContent.match(/Altre\s+(\d+)/)||[])[1];
  const tutte = Object.values(spoglioDati(window.analysisData))
    .reduce((s,v)=>s+(v.scene?.length||0),0);
  return {visibile: n.style.display !== 'none', somma: viste + fuori === tutte, fuori: fuori > 0};
}), {visibile:true, somma:true, fuori:true});
ok('con tutte spuntate si vede tutto', await p.evaluate(()=>{
  localStorage.setItem('cb_cat_attive', JSON.stringify(SPOGLIO.map(c=>c.key)));
  spoglioRender(window.analysisData);
  return [document.querySelectorAll('.sp-rep').length,
          document.querySelectorAll('.sp-cat').length,
          document.getElementById('spFuori').style.display];}), [5, 8, 'none']);
ok('ognuna con le sue scene', await p.evaluate(()=>
  [...document.querySelectorAll('.sp-cat')].every(c=>c.querySelectorAll('.sp-sc').length>0)), true);
ok('il numero di scena, non la riga intera', await p.evaluate(()=>
  document.querySelector('#sp-cat-stunt .sp-sc').textContent), '9');
ok('niente categoria vuota a schermo', await p.evaluate(()=>!/Dialoghi in Movimento/i.test(document.getElementById('catsGrid').innerText)), true);
ok('una scena vecchia si apre lo stesso', await p.evaluate(()=>{
  spoglioApriScena('9');
  return document.querySelector('#spScena .sp-riga .v').textContent;}), 'Caduta dal tetto');
await p.evaluate(()=>spoglioChiudiScena());

console.log('\n── senza reparto in profilo ──');
await p.evaluate(x=>{localStorage.removeItem('cb_profilo');localStorage.removeItem('cb_cat_attive');
  renderResults(x)}, d);
await p.waitForTimeout(200);
ok('nessuno promosso', await p.evaluate(()=>!document.querySelector('.sp-rep.mio:not(:first-child)')), true);
ok('ma si vede tutto, e acceso', await p.evaluate(()=>
  document.querySelectorAll('.sp-cat').length+'/'+document.querySelectorAll('.sp-cat.spenta').length), '8/0');

console.log('\n── sceneggiatura senza criticità ──');
await p.evaluate(()=>renderResults({titolo:'X',totale_scene:10,scene_list:[]}));
await p.waitForTimeout(150);
ok('lo dice invece di restare vuota', await p.evaluate(()=>/Nessuna criticità/.test(document.getElementById('catsGrid').innerText)), true);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
await p.evaluate(x=>{localStorage.setItem('cb_profilo',JSON.stringify({nome:'S',cognome:'P',reparto:'Suono'}));
  renderResults(x);switchResultTab('spoglio');window.scrollTo(0,0)}, d);
await p.waitForTimeout(250);
await p.screenshot({path:__dirname+'/m1-spoglio.png',fullPage:true});
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
