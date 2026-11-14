/* Il piano di lavorazione scritto dal server, visto dal telefono.
 *
 * Il telefono non lo legge piu': lo trova sul cloud. Due cose contano:
 *   - quello del server arriva da solo, senza riaprire l'app;
 *   - ⚠ un telefono rimasto col piano vecchio non lo deve rimettere sul
 *     cloud alla prima scena segnata come girata.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(54)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

(async()=>{
const {pianoPerApp}=await import(RADICE+'/worker/piano.js');
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const errori=[]; p.on('pageerror',e=>errori.push(e.message));
await p.addInitScript(()=>{
  window.FINTO={cloud:null, salvati:[]};
  const tavola=(nome)=>{
    const q={ _sel:'',
      select(s){q._sel=s||'';return q}, eq(){return q}, in(){return q}, order(){return q},
      limit:async()=>({data:[],error:null}),
      upsert:async(r)=>{ if(nome==='pdl_versions'){ window.FINTO.salvati.push(JSON.parse(JSON.stringify(r))); window.FINTO.cloud={data:r.data,shooting_data:r.shooting_data}; } return {error:null}; },
      single:async()=>({data:null}),
      maybeSingle:async()=>{
        const c=window.FINTO.cloud;
        if(nome!=='pdl_versions'||!c) return {data:null};
        if(/caricatoIl/.test(q._sel)) return {data:{caricatoIl:c.data.caricatoIl||null, daServer:c.data.daServer?'true':null}};
        return {data:{data:JSON.parse(JSON.stringify(c.data))}};
      },
      then(ok){ return Promise.resolve({data:[],error:null}).then(ok); } };
    return q; };
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:tavola,
    rpc:async(n)=> n==='pdl_del_film' && window.FINTO.cloud ? {data:[JSON.parse(JSON.stringify(window.FINTO.cloud))]} : {data:null},
    storage:{from:()=>({})}})};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(700);

const sc=(n,piu={})=>Object.assign({n,ie:'EXT',m:'Giorno',ambiente:'STRADE BIANCHE',luogo:'GINOSA',cast:['1','2'],pag:'1 1/8',note:''},piu);
const letto=(versione,piu={})=>Object.assign({titolo:'MISSIONE SAN GENNARO',regista:'',versione,
  giorni:[{n:25,data:'2026-11-14',inizio:'12.00',fine:'19.00',pagine:'7/8',settimana:5,scene:[sc('58End',{ie:'INT',m:'Notte'})]},
          {n:26,data:'2026-11-17',inizio:'16',fine:'24',pagine:'3/8',settimana:6,scene:[sc('2'),sc('3Apt')]},
          {n:27,data:'2026-11-18',inizio:'',fine:'',pagine:'3 6/8',settimana:6,scene:[sc('3Pt')]}],
  viaggi:[{data:'2026-11-16',destinazione:'NAPOLI',etichetta:''}]},piu);
const P7=pianoPerApp(letto('PdL 7 del 3 Novembre 2026'), Date.parse('2026-11-03T18:00:00Z'));
const P8=pianoPerApp(letto('PdL 8 del 12 Novembre 2026',{giorni:letto().giorni.concat([{n:28,data:'2026-11-19',inizio:'16',fine:'24',pagine:'1 4/8',settimana:6,scene:[sc('3End')]}])}), Date.parse('2026-11-12T18:00:00Z'));

const entra=()=>p.evaluate(()=>{
  localStorage.clear();
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('resultsPage').style.display='flex';
  currentUser={id:'u1'}; currentAnalysisId='a1';
  filmCorrente=()=>({id:'f1',titolo:'MSG'});
  pdlData=null; window.pdlData=null; pdlShootingData={};
  FINTO.cloud=null; FINTO.salvati=[];
});

console.log('\n── quando il piano del cloud prende il posto di quello sul telefono ──');
const vince=(r,l)=>p.evaluate(([r,l])=>pianoCloudVince(r,l),[r,l]);
ok('niente sul telefono', await vince(P7,null), true);
ok('quello del server, più recente', await vince(P8,P7), true);
ok('lo stesso: no', await vince(P7,P7), false);
ok('uno più vecchio: no', await vince(P7,P8), false);
ok('⚠ uno salvato da un telefono non si impone', await vince(Object.assign({},P8,{daServer:false}),P7), false);
ok('⚠ caricato a mano dopo il server: resta il mio', await vince(P8,Object.assign({},P7,{daServer:false,caricatoIl:'2026-11-13T09:00:00.000Z'})), false);
ok('un piano senza settimane non è un piano', await vince({daServer:true,caricatoIl:'2099'},P7), false);

console.log('\n── arriva da solo ──');
await entra();
let r=await p.evaluate(async([p7,p8])=>{
  FINTO.cloud={data:p7,shooting_data:{25:{scenes:{'58End':'done'}}}};
  const a=await pianoCloudNuovo(); const v1=pdlData&&pdlData.versione;
  const b=await pianoCloudNuovo();
  FINTO.cloud={data:p8,shooting_data:{25:{scenes:{'58End':'done'}}}};
  const c=await pianoCloudNuovo();
  return {a,v1,b,c,v2:pdlData.versione,segnate:pdlShootingData,
          vista:document.getElementById('pdlDashboard').style.display,
          info:document.getElementById('pdlFilmInfo').textContent,
          celle:document.querySelectorAll('.cal-cell').length};
},[P7,P8]);
ok('il primo si prende', [r.a,r.v1], [true,'PdL 7 del 3 Novembre 2026']);
ok('lo stesso non si riprende', r.b, false);
ok('quello nuovo sì', [r.c,r.v2], [true,'PdL 8 del 12 Novembre 2026']);
ok('con le scene segnate', r.segnate, {25:{scenes:{'58End':'done'}}});
ok('e si vede: versione, giorni e scene', [r.vista, /PdL 8/.test(r.info), /4 giorni · 5 scene/.test(r.info)], ['block',true,true]);
ok('il calendario si disegna', r.celle>0, true);

console.log('\n── ⚠ un telefono rimasto col piano vecchio ──');
await entra();
r=await p.evaluate(async([p7,p8])=>{
  pdlData=JSON.parse(JSON.stringify(p7)); window.pdlData=pdlData;
  FINTO.cloud={data:p8,shooting_data:{}};                 // intanto il server ha scritto l'8
  pdlShootingData={26:{scenes:{'2':'done'}}};             // e qui si segna una scena
  await savePdlToSupabase();
  const s=FINTO.salvati[0];
  return {salvato:s.data.versione, segnate:s.shooting_data, inMano:pdlData.versione};
},[P7,P8]);
ok('⚠ non rimette il vecchio sul cloud', r.salvato, 'PdL 8 del 12 Novembre 2026');
ok('la scena segnata si salva lo stesso', r.segnate, {26:{scenes:{'2':'done'}}});
ok('e il telefono passa al piano nuovo', r.inMano, 'PdL 8 del 12 Novembre 2026');
await entra();
r=await p.evaluate(async([p7,p8])=>{
  FINTO.cloud={data:p8,shooting_data:{}};
  pdlData=Object.assign(JSON.parse(JSON.stringify(p7)),{versione:'PdL 9 a mano',daServer:false,caricatoIl:'2026-11-13T09:00:00.000Z'});
  await savePdlToSupabase();
  return FINTO.salvati[0].data.versione;
},[P7,P8]);
ok('uno caricato a mano dopo si salva', r, 'PdL 9 a mano');
await entra();
r=await p.evaluate(async(p7)=>{
  pdlData=JSON.parse(JSON.stringify(p7)); pdlData.daServer=false; delete pdlData.caricatoIl;
  await savePdlToSupabase();
  return FINTO.salvati.length;
},P7);
ok('senza niente sul cloud si salva come sempre', r, 1);

ok('nessun errore di pagina', errori, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
