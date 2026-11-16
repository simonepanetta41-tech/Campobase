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
    from:tavola, rpc:async(n,a)=>{
      if(n==='troupe_segna') return window.CLOUD.rotto?{data:null,error:{message:'no'}}:{data:window.CLOUD.permessi||[],error:null};
      if(n==='permesso_segna'){ window.CLOUD.dati=(window.CLOUD.dati||[]).concat([[a.p_utente,a.p_vale]]);
        window.CLOUD.permessi=(window.CLOUD.permessi||[]).filter(x=>x.user_id!==a.p_utente).concat([{user_id:a.p_utente,segna:a.p_vale}]); return {data:true,error:null}; }
      if(n==='troupe_del_film') return {data:window.CLOUD.troupe||[],error:null};
      return {data:null}; }, storage:{from:()=>({})}})};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(700);

/* Oggi e' il 12 novembre. Il piano: la 44 e la 45 gia' passate, la 70 a venire. */
const entra=(film='f1')=>p.evaluate((film)=>{
  localStorage.clear(); currentUser={id:'u1'}; filmCorrente=()=>({id:film,titolo:film,mio:true,casella:'x'}); segnaChi={}; CLOUD.permessi=[]; CLOUD.dati=[]; CLOUD.troupe=[];
  const Vero=Date; const fisso=new Vero(2026,10,12,10,0).getTime();
  if(!window.__fermo){ window.__fermo=1; window.Date=class extends Vero{ constructor(...a){ super(...(a.length?a:[fisso])); } static now(){ return fisso; } }; }
  const g=(n,data,scene)=>({numero_giorno:n,data,ora_inizio:'12:00',ora_fine:'20:00',scene:scene.map(x=>({numero:x,int_ext:'EXT',momento:'D',cast:[]}))});
  pdlData={titolo:'X',settimane:[{numero:1,label:'Settimana 1',giorni:[g(1,'2026-11-10',['44','45End']),g(2,'2026-11-20',['70','71Pt'])]}]}; window.pdlData=pdlData;
  pdlShootingData={}; odgPassati=[]; odgCorrente=null; sceneSegnate={};
  CLOUD.righe=[]; CLOUD.scritture=[]; CLOUD.rotto=false;
}, film);
const fatte=()=>p.evaluate(()=>[...sceneFatte()].sort());
/* Riaccendere una scena chiede conferma: qui si risponde (di si', se non detto). */
const segna=(n,risposta='si')=>p.evaluate(async({n,risposta})=>{
  const pr=scenaSegna(n); await new Promise(r=>setTimeout(r,30));
  const t=document.querySelector('button[data-act="'+risposta+'"]'); const chiesto=!!t; if(t) t.click();
  await pr; return chiesto; },{n,risposta});

console.log('\n── segnare una scena ──');
await entra();
ok('dai documenti: le due già passate', await fatte(), ['44','45']);
ok('segnarla girata non chiede niente', await segna('70'), false);
ok('⚠ una scena a venire, segnata girata', await fatte(), ['44','45','70']);
ok('scritta sul cloud, per tutta la troupe', await p.evaluate(()=>CLOUD.scritture), [['metti','70','girata']]);
ok('⚠ riaccenderla chiede conferma', await segna('44'), true);
ok('una che i fogli danno per fatta, riaccesa', await fatte(), ['45','70']);
ok('scritta come "da girare"', await p.evaluate(()=>CLOUD.scritture[1]), ['metti','44','da_girare']);
await segna('71Pt');
ok('"71Pt" si segna come la 71', [await fatte(), await p.evaluate(()=>CLOUD.scritture[2])], [['45','70','71'], ['metti','71','girata']]);
await segna('45','no');
ok('⚠ detto di no, resta girata e non si scrive niente', [await fatte(), await p.evaluate(()=>CLOUD.scritture.length)], [['45','70','71'], 3]);

console.log('\n── tornare indietro ──');
await segna('70');
ok('la 70 torna da girare', await fatte(), ['45','71']);
ok('⚠ e il segno si toglie: torna a seguire i fogli', await p.evaluate(()=>[CLOUD.scritture[3], '70' in sceneSegnate]), [['togli','70'], false]);
await segna('44');
ok('la 44 torna girata, senza segno', [await fatte(), await p.evaluate(()=>'44' in sceneSegnate)], [['44','45','71'], false]);

console.log('\n── ⚠ la pillola nella scheda, e il piano che dice la stessa cosa ──');
await entra();
const SPOGLIO_FINTO=()=>{ analysisData=window.analysisData={titolo:'X',scene_list:[{n:'70',ie:'EXT',m:'D',p:12},{n:'71',ie:'EXT',m:'D',p:13}],personaggi_scene:{ANNA:['70']},
    playback:{scene:[{scena:'70 - EXT GIORNO (p. 12)',descrizione:'radio accesa'}]}}; };
let r=await p.evaluate(async(finto)=>{
  document.getElementById('authPage').style.display='none'; document.getElementById('app').style.display='block';
  document.getElementById('resultsPage').style.display='flex';
  (new Function('return '+finto)())();
  spoglioApriScena('70');
  const pil=()=>{ const t=document.querySelector('#spGirata .sp-pillola'); return t?[t.textContent.replace(/\s+/g,' ').trim(), t.classList.contains('on'), t.tagName]:null; };
  const prima=pil();
  // sta dentro la scheda, dopo l'ultima categoria, non incollata al fondo dello schermo
  const riga=document.getElementById('spGirata'), corpo=document.querySelector('#spScena .sp-corpo');
  const ultima=corpo.lastElementChild===riga, ferma=getComputedStyle(riga).position;
  renderPdlStats(); const barraPrima=document.querySelector('.pdl-barra b').textContent;
  document.querySelector('#spGirata .sp-pillola').click(); await new Promise(r=>setTimeout(r,60));
  const dopo=pil(); const barraDopo=document.querySelector('.pdl-barra b').textContent;
  spoglioChiudiScena();
  // la finestra della giornata nel piano
  pdlModalSceneStates={}; window._pdlModalG=getPdlAllGiorni()[1]; renderPdlModalChips(window._pdlModalG);
  document.getElementById('pdlDayModal').classList.add('open');
  const chip=[...document.querySelectorAll('#pdlModalChips .pdl-chip')].map(c=>[c.querySelector('.pdl-chip-num').textContent, c.classList.contains('girato')]);
  const cerchietti=document.querySelectorAll('#pdlModalChips .pdl-chip-segna').length;
  // toccata nel piano, si apre la stessa scheda, sopra la giornata
  document.querySelector('#pdlModalChips .pdl-chip').click(); await new Promise(r=>setTimeout(r,60));
  const box=document.getElementById('spScena');
  const aperta=[box.style.display, box.querySelector('.sc-n').textContent, +getComputedStyle(box).zIndex > +getComputedStyle(document.getElementById('pdlDayModal')).zIndex];
  const dalPiano=pil();
  // e da li' la si riaccende
  document.querySelector('#spGirata .sp-pillola').click(); await new Promise(r=>setTimeout(r,40));
  document.querySelector('button[data-act="si"]').click(); await new Promise(r=>setTimeout(r,60));
  const riaccesa=pil(); const chipDopo=document.querySelector('#pdlModalChips .pdl-chip').classList.contains('girato');
  spoglioChiudiScena(); const tolta=box.classList.contains('sopra');
  // "71Pt" nel piano apre la scheda della 71
  document.querySelectorAll('#pdlModalChips .pdl-chip')[1].click(); await new Promise(r=>setTimeout(r,60));
  const parziale=box.querySelector('.sc-n')?.textContent;
  spoglioChiudiScena(); document.getElementById('pdlDayModal').classList.remove('open');
  return {prima,ultima,ferma,dopo,barraPrima,barraDopo,chip,cerchietti,aperta,dalPiano,riaccesa,chipDopo,tolta,parziale};
}, SPOGLIO_FINTO.toString());
ok('la pillola invita a segnarla', r.prima, ['✓Segna come girata', false, 'BUTTON']);
ok('⚠ sta sotto l\'ultima categoria, non fissa in fondo', [r.ultima, r.ferma], [true, 'static']);
ok('toccata, dice che è girata', r.dopo, ['✓Girata', true, 'BUTTON']);
ok('la barra del piano sale', [r.barraPrima, r.barraDopo], ['2/4 · 50%','3/4 · 75%']);
ok('⚠ nel piano la stessa scena risulta girata', r.chip, [['70',true],['71Pt',false]]);
ok('nel piano niente più cerchietto', r.cerchietti, 0);
ok('⚠ toccata nel piano si apre la sua scheda, sopra la giornata', r.aperta, ['flex','Scena 70',true]);
ok('con la pillola già verde', r.dalPiano, ['✓Girata', true, 'BUTTON']);
ok('⚠ riaccesa da lì, il piano la segue', [r.riaccesa, r.chipDopo], [['✓Segna come girata', false, 'BUTTON'], false]);
ok('chiusa, la scheda torna al suo posto', r.tolta, false);
ok('"71Pt" apre la scheda della 71', r.parziale, 'Scena 71');

console.log('\n── ⚠ chi può segnare ──');
await entra();
r=await p.evaluate(async(finto)=>{
  (new Function('return '+finto)())();
  filmCorrente=()=>({id:'f1',titolo:'f1',mio:false,casella:'x'});
  const pil=()=>{ const t=document.querySelector('#spGirata .sp-pillola'); return t?[t.textContent.replace(/\s+/g,' ').trim(), t.tagName]:null; };
  await sceneSegnateCarica();
  spoglioApriScena('70'); const senza=pil();
  await scenaSegna('70'); const provato=[...sceneFatte()].sort(), scritto=CLOUD.scritture.length;
  // una già girata la vede, ma non la tocca
  CLOUD.righe=[{project_id:'f1',scena:'70',stato:'girata'}]; await sceneSegnateCarica(); spoglioApriScena('70'); const vede=pil();
  // chi ha aperto il film gli dà il permesso
  CLOUD.permessi=[{user_id:'u1',segna:true},{user_id:'u9',segna:true}]; await sceneSegnateCarica();
  spoglioApriScena('71'); const con=pil(); await scenaSegna('71'); const ora=[...sceneFatte()].sort();
  // senza rete vale l'ultima risposta avuta
  CLOUD.rotto=true; segnaChi={}; await segnaChiCarica(); const senzaRete=possoSegnare(); CLOUD.rotto=false;
  // chi ha aperto il film può sempre
  filmCorrente=()=>({id:'f1',titolo:'f1',mio:true,casella:'x'}); CLOUD.permessi=[]; await segnaChiCarica(); const capo=possoSegnare();
  // un'analisi senza film è solo mia
  filmCorrente=()=>null; const solo=possoSegnare();
  spoglioChiudiScena();
  return {senza,provato,scritto,vede,con,ora,senzaRete,capo,solo};
}, SPOGLIO_FINTO.toString());
ok('senza permesso la pillola non c\'è', r.senza, null);
ok('⚠ e non si segna nemmeno a chiamarla', [r.provato, r.scritto], [['44','45'], 0]);
ok('una scena girata la vede, ma non è un tasto', r.vede, ['✓Girata','SPAN']);
ok('⚠ col permesso la pillola compare e segna', [r.con, r.ora], [['✓Segna come girata','BUTTON'], ['44','45','70','71']]);
ok('senza rete vale l\'ultimo permesso avuto', r.senzaRete, true);
ok('chi ha aperto il film può sempre', r.capo, true);
ok('un\'analisi senza film è solo mia', r.solo, true);

console.log('\n── ⚠ il permesso si dà dalla troupe ──');
await entra();
r=await p.evaluate(async()=>{
  CLOUD.troupe=[{user_id:'u1',ruolo:'capo',entrato:'2026-11-01',nome:'Simone',cognome:'P',reparto:'Suono'},
                {user_id:'u2',ruolo:'membro',entrato:'2026-11-02',nome:'Anna',cognome:'R',reparto:'Regia'},
                {user_id:'u3',ruolo:'membro',entrato:'2026-11-03',nome:'Luca',cognome:'B',reparto:'Fotografia'}];
  CLOUD.permessi=[{user_id:'u1',segna:true}];
  await troupeRender();
  const righe=()=>[...document.querySelectorAll('#troupeElenco .odg-att')].map(x=>{ const t=x.querySelector('.tr-segna'), m=x.querySelector('.cast-m');
    return [x.querySelector('.t').textContent, t?(t.classList.contains('on')?'sì':'no'):(m?m.textContent:'')]; });
  const prima=righe();
  [...document.querySelectorAll('#troupeElenco .tr-segna')][0].click(); await new Promise(r=>setTimeout(r,120));
  const dopo=righe(), dato=CLOUD.dati.slice();
  [...document.querySelectorAll('#troupeElenco .tr-segna')][0].click(); await new Promise(r=>setTimeout(r,120));
  const tolto=righe(), dati2=CLOUD.dati.slice(1);
  // un membro vede chi segna, ma non ha tasti
  CLOUD.permessi=[{user_id:'u1',segna:true},{user_id:'u3',segna:true}];
  filmCorrente=()=>({id:'f1',titolo:'f1',mio:false,casella:'x'}); currentUser={id:'u2'};
  await troupeRender(); const daMembro=righe(), tasti=document.querySelectorAll('#troupeElenco .tr-segna').length;
  await troupeSegna('u2',true); const furbo=CLOUD.dati.length;
  return {prima,dopo,dato,tolto,dati2,daMembro,tasti,furbo};
});
ok('chi ha aperto il film vede un tasto per ognuno', r.prima, [['Simone P','ha aperto il film'],['Anna R','no'],['Luca B','no']]);
ok('⚠ toccato, il permesso è dato', [r.dopo[1], r.dato], [['Anna R','sì'], [['u2',true]]]);
ok('ritoccato, è tolto', [r.tolto[1], r.dati2], [['Anna R','no'], [['u2',false]]]);
ok('⚠ un membro vede solo la lista: né tasti né chi segna', [r.daMembro, r.tasti], [[['Simone P','ha aperto il film'],['Anna R',''],['Luca B','']], 0]);
ok('e non può darselo da solo', r.furbo, 2);

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
