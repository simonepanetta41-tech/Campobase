/* L'ordine del giorno scritto dal server, visto dal telefono.
 *
 * Da quando lo legge il server (worker/scrive.js) il telefono non
 * analizza piu': trova l'ordine del giorno gia' pronto sul cloud e lo
 * mostra. Tre cose non devono rompersi:
 *   - il pick-up e' di chi guarda, mai quello di un collega;
 *   - finche' il server lavora il telefono non analizza per conto suo;
 *   - quello che uno ha in mano non gli cambia sotto senza motivo.
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
await p.addInitScript(()=>{
  window.FINTO={odg:[],posta:[],rpc:[],salvati:0};
  const tavola=(nome)=>{
    const q={ _f:{},
      select(){return q}, eq(k,v){q._f[k]=v;return q}, in(k,v){q._in=[k,v];return q},
      order(){return q},
      limit:async()=>{
        let r=(window.FINTO[nome]||[]).slice();
        if(nome==='odg' && q._f.project_id) r=r.filter(x=>!x.project_id || x.project_id===q._f.project_id);
        if(q._in) r=r.filter(x=>q._in[1].includes(x[q._in[0]]));
        return {data:r,error:null};
      },
      upsert:async()=>{ if(nome==='odg') window.FINTO.salvati++; return {error:null}; },
      update(){return {eq:async()=>({error:null})}},
      single:async()=>({data: nome==='analyses' ? (window.FINTO.analisi||null) : null}),
      maybeSingle:async()=>({data: nome==='projects' && window.FINTO.progetto ? window.FINTO.progetto : null}),
      then(ok){ return Promise.resolve({data:[],error:null}).then(ok); } };
    return q; };
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:tavola,
    rpc:async(n,a)=>{ if(n==='prendi_posta') window.FINTO.rpc.push(n); return {data:null}; },
    storage:{from:()=>({download:async()=>({data:null,error:{message:'finto'}}),
                        createSignedUrl:async()=>({data:null,error:{message:'finto'}})})}
  })};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(700);

/* Come lo scrive il server: i viaggi gia' letti, niente testo. */
const DATI = (piu={}) => Object.assign({ daServer:true, caricatoIl:'2026-11-13T19:00:00.000Z',
  numero:'25', data:'2026-11-14', convocazione:'12.30', fineLavorazione:'19.30', catering:'12.45',
  luoghi:[{nome:'CB/ MEZZI TECNICI', url:'https://maps.app.goo.gl/a', indirizzo:''},
          {nome:'SET: CHIESA PAESE', url:'https://maps.app.goo.gl/b', indirizzo:''}],
  contatti:[], scene:[{n:'58END', ie:'I', m:'G', ambiente:'CHIESA PAESE', sinossi:'', ids:'1', pag:'6 6/8'}],
  cast:[{id:'1', ruolo:'PRINCIPE', interprete:'R. PAPALEO', scene:'58END', pickup:'11.00', set:'13.15'}],
  troupe:[{reparto:'SUONO', ruolo:'Microfonista', nome:'S. Panetta', partenza:'', set:'12.30'},
          {reparto:'FOTOGRAFIA', ruolo:'Data Manager', nome:'V. Leone', partenza:'13.30', set:''}],
  fabbisogni:[], domani:null, allegati:[],
  tratte:[{autista:'Luca Cammarosano', tel:'3398408475', partenza:'12.00', arrivo:'12.30', luogo:'TURSPORT HOTEL RESIDENCE',
           indirizzo:'', destinazione:'SET', nomi:['F.Lombardi','D.De Angelis','S.Panetta'], nota:''},
          {autista:'Luca Cammarosano', tel:'3398408475', partenza:'13.00', arrivo:'', luogo:'TURSPORT HOTEL RESIDENCE',
           indirizzo:'', destinazione:'SET', nomi:['V.Leone'], nota:''},
          {autista:'Antonio Varriale', tel:'3331112223', partenza:'19.45', arrivo:'', luogo:'SET',
           indirizzo:'', destinazione:'TURSPORT HOTEL RESIDENCE', nomi:['S.Panetta','V.Leone'], nota:''}]}, piu);

const entra = (nome, cognome) => p.evaluate(([n,c])=>{
  localStorage.clear();
  document.getElementById('authPage').style.display='none';
  document.getElementById('app').style.display='block';
  currentUser={id:'u-'+c};
  profilo=()=>({nome:n,cognome:c});
  filmCorrente=()=>({id:'f1',titolo:'MSG'});
  pushAppuntamenti=()=>{};
  odgCorrente=null; postaAttese=0; clearTimeout(postaAttesaT);
  FINTO.odg=[]; FINTO.posta=[]; FINTO.rpc=[]; FINTO.salvati=0;
}, [nome,cognome]);
const guarda = (d) => p.evaluate((d)=>{ odgCorrente=d; odgRicalcola();
  return { ora:odgCorrente.pickup&&odgCorrente.pickup.ora, autista:odgCorrente.pickup&&odgCorrente.pickup.autista,
           tel:odgCorrente.pickup&&odgCorrente.pickup.tel, conMe:odgCorrente.pickup&&odgCorrente.pickup.conMe,
           ore:odgOreDi(odgIo(), odgCorrente), luoghi:odgCorrente.luoghi.map(l=>l.nome) }; }, d);

console.log('\n── il pick-up è di chi guarda ──');
await entra('Simone','Panetta');
let r=await guarda(DATI());
ok('Panetta: l\'andata, non il rientro', [r.ora, r.autista, r.tel], ['12.00','Luca Cammarosano','3398408475']);
ok('con chi viaggia', r.conMe, ['F.Lombardi','D.De Angelis']);
await entra('Valerio','Leone');
r=await guarda(DATI());
ok('Leone: il suo, un\'ora dopo', r.ora, '13.00');
/* Sul cloud e' finito il pick-up di un collega che ha salvato dopo. */
await entra('Rossella','Aprea');
r=await guarda(DATI({pickup:{ora:'12.00',autista:'Luca Cammarosano',luogo:'TURSPORT'}}));
ok('⚠ chi non è nei giri non vede il van di un altro', r.ora, null);
await entra('Valerio','Leone');
r=await guarda(DATI({pickup:{ora:'12.00',autista:'Luca Cammarosano'}}));
ok('⚠ e chi ne ha uno suo vede il suo', r.ora, '13.00');
ok('i posti coi nomi dell\'app', r.luoghi.length, 2);

console.log('\n── si disegna senza errori ──');
await entra('Simone','Panetta');
const html=await p.evaluate((d)=>{ odgCorrente=d; odgRicalcola(); odgRender(); return odgPienoHtml(odgCorrente); }, DATI());
ok('c\'è la scena', /58END/.test(html), true);
ok('c\'è la troupe', /Panetta/.test(html), true);
ok('c\'è il pick-up', /12\.00/.test(html), true);
ok('nessun "undefined" a schermo', /undefined|NaN|\[object/.test(html.replace(/<[^>]+>/g,' ')), false);

console.log('\n── quando il cloud prende il posto di quello sul telefono ──');
const vince=(r,l,t)=>p.evaluate(([r,l,t])=>odgCloudVince(r,l,t),[r,l,t]);
const R=(d)=>({data:d.data,dati:d});
ok('niente sul telefono', await vince(R(DATI()), null), true);
ok('una giornata più avanti', await vince(R(DATI({data:'2026-11-15'})), DATI()), true);
ok('una giornata indietro no', await vince(R(DATI({data:'2026-11-13'})), DATI()), false);
ok('la stessa, identica: no', await vince(R(DATI()), DATI()), false);
ok('la stessa, riscritta dal server (foglio corretto)', await vince(R(DATI({caricatoIl:'2026-11-13T21:00:00.000Z'})), DATI()), true);
ok('⚠ la stessa, salvata da un telefono: no', await vince(R(DATI({daServer:false,caricatoIl:'2026-11-13T21:00:00.000Z'})), DATI()), false);
ok('⚠ caricata a mano dopo il server: resta la mia', await vince(R(DATI()), DATI({daServer:false,caricatoIl:'2026-11-13T22:00:00.000Z'})), false);
ok('riga vuota', await vince({data:'2026-11-14',dati:null}, null), false);

console.log('\n── il server sta leggendo ──');
await entra('Simone','Panetta');
r=await p.evaluate(async()=>{
  FINTO.posta=[{id:'p1',stato:'al server',oggetto:'ODG',allegati:[{nome:'odg.pdf',tenuto:true,percorso:'x'}]}];
  await postaControlla();
  return {gettoni:FINTO.rpc.length, attese:postaAttese, odg:!!odgCorrente};
});
ok('⚠ il telefono non la prende in carico', r.gettoni, 0);
ok('si mette ad aspettare', r.attese, 1);
ok('e non mostra ancora niente', r.odg, false);
r=await p.evaluate(async(d)=>{
  FINTO.posta=[]; FINTO.odg=[{data:d.data,dati:d}];
  await postaControlla();
  return {numero:odgCorrente&&odgCorrente.numero, pick:odgCorrente&&odgCorrente.pickup&&odgCorrente.pickup.ora,
          attese:postaAttese, locale:!!localStorage.getItem(ODG_LOCALE)};
}, DATI());
ok('quando è pronto lo prende dal cloud', r.numero, '25');
ok('col suo pick-up', r.pick, '12.00');
ok('smette di aspettare', r.attese, 0);
ok('e lo tiene sul telefono', r.locale, true);

console.log('\n── ⚠ il server non ce l\'ha fatta: mail tornata "nuova" ──');
await entra('Simone','Panetta');
r=await p.evaluate(async()=>{
  FINTO.posta=[{id:'p1',stato:'nuova',oggetto:'ODG',allegati:[{nome:'odg.pdf',tenuto:true,percorso:'x'}]}];
  await postaControlla();
  return FINTO.rpc;
});
ok('il telefono la prende come sempre', r, ['prendi_posta']);

console.log('\n── tolto a mano ──');
await entra('Simone','Panetta');
r=await p.evaluate(async(d)=>{
  FINTO.odg=[{data:d.data,dati:d}];
  await odgCloudNuovo(); const prima=!!odgCorrente;
  askConfirm=async()=>true; cbFileCancella=()=>{};
  await odgRimuovi(); const tolto=!odgCorrente;
  await odgCloudNuovo(); const dopo=!!odgCorrente;
  FINTO.odg=[{data:'2026-11-15',dati:Object.assign({},d,{data:'2026-11-15',numero:'26'})}];
  await odgCloudNuovo();
  return {prima,tolto,dopo,nuovo:odgCorrente&&odgCorrente.numero};
}, DATI());
ok('c\'era, e si toglie', [r.prima,r.tolto], [true,true]);
ok('⚠ non ritorna da solo dopo dieci secondi', r.dopo, false);
ok('quello di domani arriva lo stesso', r.nuovo, '26');

console.log('\n── ⚠ due film sullo stesso telefono ──');
/* Visto davvero: aperto un secondo film, ci si trovava l'ordine del giorno
   del primo. Quello tenuto sul telefono vinceva sempre, di chiunque fosse. */
await entra('Simone','Panetta');
r=await p.evaluate(async(d)=>{
  const A=Object.assign({},d,{numero:'25',data:'2026-11-14'}), B=Object.assign({},d,{numero:'35',data:'2026-04-16'});
  FINTO.odg=[{project_id:'f1',data:A.data,dati:A},{project_id:'f2',data:B.data,dati:B}];
  const film=(id)=>{ filmCorrente=()=>({id,titolo:id}); };
  const out={};
  film('f1'); await odgRipristina(); out.primo=odgCorrente&&odgCorrente.numero;
  film('f2'); await odgRipristina(); out.secondo=odgCorrente&&odgCorrente.numero;
  film('f1'); await odgRipristina(); out.ritorno=odgCorrente&&odgCorrente.numero;
  // un terzo film senza ordini del giorno: non eredita quello di un altro
  film('f3'); FINTO.odg=FINTO.odg.map(x=>x); await odgRipristina(); out.vuoto=odgCorrente;
  film('f1'); await odgRipristina(); out.ancora=odgCorrente&&odgCorrente.numero;
  // un telefono aggiornato adesso: l'ordine del giorno c'è, ma di quale film non è segnato
  localStorage.removeItem('cb_odg_film'); odgCorrente=null;
  film('f2'); await odgRipristina(); out.vecchioAltrove=odgCorrente&&odgCorrente.numero;
  localStorage.setItem('cb_odg', JSON.stringify(A)); localStorage.removeItem('cb_odg_film'); odgCorrente=null;
  film('f1'); await odgRipristina(); out.vecchioSuo=odgCorrente&&odgCorrente.numero;
  return out;
}, DATI());
ok('nel primo film il suo', r.primo, '25');
ok('⚠ nel secondo il suo, anche se è di una data più vecchia', r.secondo, '35');
ok('tornando al primo, di nuovo il suo', r.ritorno, '25');
ok('⚠ un film senza ordini del giorno resta vuoto', r.vuoto, null);
ok('e non ha cancellato quello degli altri', r.ancora, '25');
ok('⚠ telefono appena aggiornato, aperto sull\'altro film', r.vecchioAltrove, '35');
ok('telefono appena aggiornato, aperto sul suo', r.vecchioSuo, '25');

/* Il proprietario non entra nel suo film dalla scheda del film ma da
   quella dell'analisi, che e' un'altra strada: da li' l'ordine del giorno
   non veniva ripreso, e restava a schermo quello del film aperto prima. */
await entra('Simone','Panetta');
r=await p.evaluate(async(d)=>{
  const A=Object.assign({},d,{numero:'25',data:'2026-11-14'}), B=Object.assign({},d,{numero:'35',data:'2026-04-16'});
  FINTO.odg=[{project_id:'f1',data:A.data,dati:A},{project_id:'f2',data:B.data,dati:B}];
  localStorage.setItem('cb_film', JSON.stringify({id:'f2',titolo:'PROVA'}));
  filmCorrente=()=>{ try { return JSON.parse(localStorage.getItem('cb_film')||'null'); } catch(_) { return null; } };
  await odgRipristina(); const prima=odgCorrente&&odgCorrente.numero;
  FINTO.analisi={data:{titolo:'MSG',scene:[],personaggi:[]},notes:null,project_id:'f1'};
  FINTO.progetto={id:'f1',titolo:'MSG',codice:'ABCD1234',casella:'x',user_id:'u-Panetta'};
  try { await loadFromHistory('a1'); } catch(e) { return {errore:e.message}; }
  await new Promise(r=>setTimeout(r,300));
  return {prima, dopo:odgCorrente&&odgCorrente.numero, film:filmCorrente()&&filmCorrente().id};
}, DATI());
ok('nel film di prova c\'era il suo', r.prima, '35');
ok('⚠ aprendo il proprio film dall\'analisi arriva il suo', [r.film, r.dopo], ['f1','25']);

ok('nessun errore di pagina', errori, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
