const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(100)+` atteso ${JSON.stringify(exp)}`);};

// Supabase finto: la posta, il gettone, il secchio degli allegati.
const FINTO = `window.__db = {
  posta:[
    {id:'m1',oggetto:'ODG 20',ricevuta:'2026-11-09T18:00:00Z',stato:'nuova',
     allegati:[{nome:'odg20.pdf',tipo:'application/pdf',tenuto:true,percorso:'p1/m1/odg20.pdf'},
               {nome:'logo.png',tipo:'image/png',tenuto:false}]},
    {id:'m2',oggetto:'Auguri',ricevuta:'2026-11-09T19:00:00Z',stato:'nuova',allegati:[]}
  ],
  gettoni:[], scaricati:[], segnati:[], presoDaAltri:false
};
window.supabase={createClient:()=>({
  auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
        onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
  rpc:async(nome,arg)=>{
    if(nome!=='prendi_posta') return {data:null,error:null};
    __db.gettoni.push(arg.p_posta);
    if(__db.presoDaAltri) return {data:null,error:null};     // l'ha preso un altro
    return {data:[{id:arg.p_posta,stato:'in analisi'}],error:null};},
  from:(t)=>{const q={_t:t,_f:{},select(){return q},order(){return q},
    eq(k,v){q._f[k]=v;return q},
    in(k,v){q._in=[k,v];return q},
    update(v){__db.segnati.push([q._id||null,v]);return {eq:(k,id)=>{__db.segnati[__db.segnati.length-1][0]=id;
      const r=__db.posta.find(x=>x.id===id); if(r) Object.assign(r,v); return Promise.resolve({error:null});}};},
    limit:async()=>({data:t==='posta'
      ? __db.posta.filter(x=>!q._in || q._in[1].includes(x[q._in[0]])) : [], error:null}),
    maybeSingle:async()=>({data:null}),
    then:(f)=>Promise.resolve({data:[],error:null}).then(f)};
    return q;},
  storage:{from:(b)=>({download:async(p)=>{__db.scaricati.push(b+'/'+p);
    return {data:new Blob([new Uint8Array([37,80,68,70])],{type:'application/pdf'}),error:null};}})}
})};`;

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(FINTO);
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);

// odgLavora e' gia' coperto dai suoi test e vuole pdf.js, che qui non c'e':
// si sostituisce con un segnalibro che dice solo quali file ha ricevuto.
await p.evaluate(()=>{
  currentUser={id:'u1'};
  window.__visti=[]; window.__riesce=true;
  window.__motivo='Non ho riconosciuto un ordine del giorno in questo file.';
  window.odgLavora = async (files)=>{ __visti.push(files.map(f=>f.name));
    if(!__riesce) odgErrore=__motivo;
    return __riesce; };
  filmImposta({id:'p1',titolo:'Missione San Gennaro',codice:'A1B2C3D4',casella:'cafebabe'});
});

console.log('\n── il pacchetto arrivato si apre da solo ──');
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(300);
ok('il gettone solo per quello con dentro qualcosa', await p.evaluate(()=>__db.gettoni), ['m1']);
ok('scarica solo gli allegati tenuti',  await p.evaluate(()=>__db.scaricati), ['posta/p1/m1/odg20.pdf']);
ok('e li passa al caricatore',          await p.evaluate(()=>__visti), [['odg20.pdf']]);
ok('il primo si segna fatto',           await p.evaluate(()=>__db.posta.find(x=>x.id==='m1').stato), 'fatta');
ok('la mail vuota si segna senza disturbare nessuno',
   await p.evaluate(()=>[__db.posta.find(x=>x.id==='m2').stato, __db.scaricati.length]), ['senza allegati',1]);

ok('e porta sulla pagina dove si vede lavorare', await p.evaluate(()=>
  document.getElementById(RT_SEZIONI.odg).style.display !== 'none'), true);

console.log('\n── una seconda occhiata non rifa\' niente ──');
await p.evaluate(()=>{__db.gettoni=[];__db.scaricati=[];__visti=[];});
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(250);
ok('niente di nuovo, niente da fare', await p.evaluate(()=>[__db.gettoni,__db.scaricati,__visti]), [[],[],[]]);

console.log('\n── se l\'ha preso un altro della troupe ──');
await p.evaluate(()=>{
  __db.posta=[{id:'m3',oggetto:'ODG 21',ricevuta:'2026-11-10T18:00:00Z',stato:'nuova',
    allegati:[{nome:'odg21.pdf',tipo:'application/pdf',tenuto:true,percorso:'p1/m3/odg21.pdf'}]}];
  __db.gettoni=[];__db.scaricati=[];__visti=[];__db.presoDaAltri=true;
});
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(250);
ok('il gettone lo chiede',        await p.evaluate(()=>__db.gettoni), ['m3']);
ok('ma non scarica niente',       await p.evaluate(()=>__db.scaricati), []);
ok('e non tocca lo stato',        await p.evaluate(()=>__db.posta[0].stato), 'nuova');

console.log('\n── arriva un piano di lavorazione nuovo ──');
await p.evaluate(()=>{
  __db.presoDaAltri=false; __riesce=false;
  __motivo='Nel pacchetto non c\'è un ordine del giorno.';
  window.__piani=[];
  // l'OdG non c'e', ma fra quello che e' stato letto c'e' un piano.
  // odgUltimiLetti e' un let: va assegnato nudo, non su window.
  odgUltimiLetti=[];
  window.odgLavora = async (files)=>{ __visti.push(files.map(f=>f.name));
    odgUltimiLetti=[{nome:files[0].name, vero:files[0], tipo:'pdl'}];
    if(!__riesce) odgErrore=__motivo;
    return __riesce; };
  window.pdlAggiorna = async (f)=>{ __piani.push(f.name); return true; };
  __db.posta=[{id:'m9',oggetto:'PDL 8 aggiornato',ricevuta:'2026-11-10T22:00:00Z',stato:'nuova',
    allegati:[{nome:'MSG_PDL8_10.11.pdf',tipo:'application/pdf',tenuto:true,percorso:'p1/m9/pdl8.pdf'}]}];
  __db.gettoni=[];__db.scaricati=[];__visti=[];
});
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(250);
ok('il piano viene aggiornato', await p.evaluate(()=>__piani), ['MSG_PDL8_10.11.pdf']);
ok('e la mail si segna fatta',  await p.evaluate(()=>__db.posta[0].stato), 'fatta');
ok('con scritto cos\'era',      await p.evaluate(()=>__db.segnati[__db.segnati.length-1][1].nota),
   'piano di lavorazione');

console.log('\n── una mail con dentro tutto: OdG, piano, stralci, giri ──');
await p.evaluate(()=>{
  __riesce=true; __piani=[];
  odgUltimiLetti=[];
  window.odgLavora = async (files)=>{ __visti.push(files.map(f=>f.name));
    // il caricatore trova l'ordine del giorno e, fra i letti, anche il piano
    odgUltimiLetti=[{nome:'ODG22.pdf',vero:files[0],tipo:'odg'},
                    {nome:'PDL8.pdf', vero:files[1],tipo:'pdl'},
                    {nome:'Stralci.pdf',vero:files[2],tipo:'stralci'},
                    {nome:'Giri.pdf', vero:files[3],tipo:'giri'}];
    return __riesce; };
  __db.posta=[{id:'m10',oggetto:'Pacchetto di domani',ricevuta:'2026-11-10T23:00:00Z',stato:'nuova',
    allegati:['ODG22.pdf','PDL8.pdf','Stralci.pdf','Giri.pdf'].map((n,i)=>
      ({nome:n,tipo:'application/pdf',tenuto:true,percorso:'p1/m10/'+i}))}];
  __db.gettoni=[];__db.scaricati=[];__visti=[];
});
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(300);
ok('scarica tutti e quattro',   await p.evaluate(()=>__db.scaricati.length), 4);
ok('la giornata si aggiorna',   await p.evaluate(()=>__visti[0].length), 4);
ok('e anche il piano',          await p.evaluate(()=>__piani), ['PDL8.pdf']);
ok('la mail dice che ha fatto tutti e due', await p.evaluate(()=>__db.segnati[__db.segnati.length-1][1].nota),
   'ordine del giorno + piano di lavorazione');

console.log('\n── una comunicazione con dentro solo gli stralci ──');
await p.evaluate(()=>{ odgUltimiLetti=[]; window.odgLavora = async (files)=>{
  __visti.push(files.map(f=>f.name)); if(!__riesce) odgErrore=__motivo; return __riesce; }; });
await p.evaluate(()=>{
  // Il caricatore dice di no: nel pacchetto un ordine del giorno non c'e'.
  __db.presoDaAltri=false;
  __db.posta=[{id:'m8',oggetto:'Scena 47 modificata',ricevuta:'2026-11-10T21:00:00Z',stato:'nuova',
    allegati:[{nome:'Stralci_47.pdf',tipo:'application/pdf',tenuto:true,percorso:'p1/m8/s47.pdf'}]}];
  __db.gettoni=[];__db.scaricati=[];__visti=[];
  __riesce=false; __motivo='Nel pacchetto non c\'è un ordine del giorno.';
});
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(250);
ok('si scarta, e l\'OdG di oggi resta dov\'è', await p.evaluate(()=>__db.posta[0].stato), 'scartata');
ok('con scritto perché', await p.evaluate(()=>__db.segnati[__db.segnati.length-1][1].nota),
   'Nel pacchetto non c\'è un ordine del giorno.');

console.log('\n── una mail che non e\' un ordine del giorno ──');
await p.evaluate(()=>{
  __motivo='Non ho riconosciuto un ordine del giorno in questo file.';
  __db.presoDaAltri=false; __riesce=false;
  __db.posta=[{id:'m4',oggetto:'Catena di S. Antonio',ricevuta:'2026-11-10T20:00:00Z',stato:'nuova',
    allegati:[{nome:'gatti.pdf',tipo:'application/pdf',tenuto:true,percorso:'p1/m4/gatti.pdf'}]}];
  __db.gettoni=[];__db.scaricati=[];__visti=[];
});
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(250);
ok('si scarta, non si ritenta all\'infinito', await p.evaluate(()=>__db.posta[0].stato), 'scartata');
ok('con scritto perche\'', await p.evaluate(()=>__db.segnati[__db.segnati.length-1][1].nota),
   'Non ho riconosciuto un ordine del giorno in questo file.');

console.log('\n── un pacchetto rimasto a meta\' ──');
await p.evaluate(()=>{
  __riesce=true;
  // il telefono e' andato in tasca durante l'analisi: preso, mai finito
  __db.posta=[{id:'m6',oggetto:'ODG 21',ricevuta:'2026-11-10T18:00:00Z',stato:'in analisi',
    allegati:[{nome:'odg21.pdf',tipo:'application/pdf',tenuto:true,percorso:'p1/m6/odg21.pdf'}]}];
  __db.gettoni=[];__db.scaricati=[];__visti=[];
});
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(250);
ok('si riprende, non resta li\' per sempre', await p.evaluate(()=>__db.posta[0].stato), 'fatta');

console.log('\n── un pacchetto andato storto non si ritenta ──');
await p.evaluate(()=>{
  __db.posta=[{id:'m7',oggetto:'rotto',ricevuta:'2026-11-10T18:00:00Z',stato:'errore',
    allegati:[{nome:'rotto.pdf',tipo:'application/pdf',tenuto:true,percorso:'p1/m7/rotto.pdf'}]}];
  __db.gettoni=[];__db.scaricati=[];__visti=[];
});
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(250);
ok('un PDF illeggibile resta illeggibile', await p.evaluate(()=>[__db.gettoni,__db.scaricati]), [[],[]]);

console.log('\n── senza film non si guarda nemmeno ──');
await p.evaluate(()=>{filmImposta(null);__db.gettoni=[];
  __db.posta=[{id:'m5',stato:'nuova',allegati:[{nome:'x.pdf',tenuto:true,percorso:'p1/m5/x.pdf'}]}];});
await p.evaluate(()=>postaControlla());
await p.waitForTimeout(200);
ok('niente gettoni', await p.evaluate(()=>__db.gettoni), []);

ok('nessun errore di pagina', err.filter(e=>!/supabase/.test(e)), []);
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
