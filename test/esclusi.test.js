/* Escludere qualcuno dal film.
 *
 * Il QR lo vedono tutti, quindi serve il verso opposto: chi ha aperto il
 * film toglie una persona, e quella non rientra. Tre cose contano:
 *   - lo fa solo chi ha aperto il film, e dopo una conferma;
 *   - l'escluso col codice non rientra, e glielo si dice;
 *   - sul telefono dell'escluso il film si chiude, ma solo davanti a un no
 *     netto del database: senza rete non si butta fuori nessuno.
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
  window.DB={membri:[],esclusi:[],chiamate:[],dentro:null,rotto:false,ingresso:null};
  const q=()=>{ const x={select(){return x},eq(){return x},in(){return x},order(){return x},limit:async()=>({data:[],error:null}),
    upsert:async()=>({error:null}),update(){return {eq:async()=>({error:null})}},delete(){return {eq(){return {eq:async()=>({error:null})}}}},
    single:async()=>({data:null}),maybeSingle:async()=>({data:null}),then(f){return Promise.resolve({data:[],error:null}).then(f)}}; return x; };
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),signOut:async()=>({}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:q, storage:{from:()=>({})},
    rpc:async(n,a)=>{ const D=window.DB; D.chiamate.push(n);
      if(D.rotto) return {data:null,error:{message:'rete'}};
      if(n==='troupe_del_film') return {data:D.membri,error:null};
      if(n==='troupe_segna') return {data:[],error:null};
      if(n==='esclusi_del_film') return {data:D.esclusi,error:null};
      if(n==='escludi_dal_film'){ const m=D.membri.find(x=>x.user_id===a.p_utente); D.membri=D.membri.filter(x=>x!==m); D.esclusi.push(m); return {data:true,error:null}; }
      if(n==='riammetti_nel_film'){ const m=D.esclusi.find(x=>x.user_id===a.p_utente); D.esclusi=D.esclusi.filter(x=>x!==m); D.membri.push(m); return {data:true,error:null}; }
      if(n==='sono_nel_film') return {data:D.dentro,error:null};
      if(n==='entra_nel_film') return D.ingresso==='escluso'?{data:null,error:{message:'escluso dal film'}}:{data:null,error:{message:'codice non valido'}};
      return {data:null}; }})};
  window.pdfjsLib={GlobalWorkerOptions:{},getDocument:()=>({promise:Promise.resolve({numPages:0})})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(700);

const entra=(mio)=>p.evaluate((mio)=>{
  localStorage.clear(); currentUser={id:mio?'u1':'u2'};
  filmImposta({id:'f1',titolo:'Missione San Gennaro',codice:'A1B2C3D4',casella:'x',mio});
  DB.membri=[{user_id:'u1',ruolo:'capo',nome:'Simone',cognome:'P',reparto:'Suono'},
             {user_id:'u2',ruolo:'membro',nome:'Anna',cognome:'R',reparto:'Regia'},
             {user_id:'u3',ruolo:'membro',nome:'Luca',cognome:'B',reparto:'Fotografia'}];
  DB.esclusi=[]; DB.chiamate=[]; DB.dentro=null; DB.rotto=false; DB.ingresso=null;
  document.getElementById('authPage').style.display='none'; document.getElementById('app').style.display='block';
}, mio);
const lista=()=>p.evaluate(()=>[...document.querySelectorAll('#troupeElenco .odg-att')].map(x=>[x.querySelector('.t').textContent, !!x.querySelector('.tr-fuori')]));
const esclusi=()=>p.evaluate(()=>[...document.querySelectorAll('#troupeEsclusi .odg-att .t')].map(x=>x.textContent));
const tocca=async(sel,risposta)=>{ await p.evaluate((sel)=>document.querySelector(sel).click(), sel); await p.waitForTimeout(60);
  const chiesto=await p.evaluate(()=>document.querySelector('button[data-act="si"]')?.closest('div').parentElement.firstElementChild.textContent||null);
  if(risposta) await p.evaluate((r)=>document.querySelector('button[data-act="'+r+'"]')?.click(), risposta);
  await p.waitForTimeout(150); return chiesto; };

console.log('\n── chi ha aperto il film esclude ──');
await entra(true);
await p.evaluate(()=>troupeRender());
ok('una ✕ accanto a ognuno, tranne che a sé', await lista(), [['Simone P',false],['Anna R',true],['Luca B',true]]);
ok('nessuna sezione "esclusi" finché non ce ne sono', await p.evaluate(()=>!document.getElementById('troupeEsclusi')), true);
let chiesto=await tocca('#troupeElenco .tr-fuori','no');
ok('⚠ prima chiede, col nome', chiesto, 'Escludere Anna R dal film? Non potrà rientrare col codice.');
ok('detto di no, non succede niente', [await lista(), await p.evaluate(()=>DB.chiamate.includes('escludi_dal_film'))], [[['Simone P',false],['Anna R',true],['Luca B',true]], false]);
await tocca('#troupeElenco .tr-fuori','si');
ok('⚠ detto di sì, esce dalla troupe', await lista(), [['Simone P',false],['Luca B',true]]);
ok('e compare fra gli esclusi', await esclusi(), ['Anna R']);

console.log('\n── e riammette ──');
await tocca('#troupeEsclusi .tr-segna');
ok('torna nella troupe', (await lista()).map(x=>x[0]), ['Simone P','Luca B','Anna R']);
ok('e la sezione sparisce', await p.evaluate(()=>!document.getElementById('troupeEsclusi')), true);

console.log('\n── ⚠ gli altri non escludono ──');
await entra(false);
await p.evaluate(()=>troupeRender());
ok('nessuna ✕', await lista(), [['Simone P',false],['Anna R',false],['Luca B',false]]);
await p.evaluate(async()=>{ DB.esclusi=[{user_id:'u9',nome:'Ex',cognome:'Z'}]; await troupeRender(); });
ok('e gli esclusi non li vedono', [await p.evaluate(()=>!document.getElementById('troupeEsclusi')), await p.evaluate(()=>DB.chiamate.includes('esclusi_del_film'))], [true,false]);
await p.evaluate(async()=>{ DB.chiamate=[]; await troupeEscludi('u3'); await troupeRiammetti('u9'); });
ok('nemmeno chiamando le funzioni a mano', await p.evaluate(()=>DB.chiamate.filter(x=>/escludi|riammetti/.test(x))), []);

console.log('\n── ⚠ sul telefono dell\'escluso ──');
await entra(false);
await p.evaluate(()=>{ localStorage.setItem('cb_odg','{"x":1}'); DB.rotto=true; });
ok('senza rete resta dentro', [await p.evaluate(()=>filmAncoraDentro()), await p.evaluate(()=>filmCorrente()?.id)], [true,'f1']);
await p.evaluate(()=>{ DB.rotto=false; DB.dentro=null; });
ok('senza una risposta chiara resta dentro', [await p.evaluate(()=>filmAncoraDentro()), await p.evaluate(()=>filmCorrente()?.id)], [true,'f1']);
await p.evaluate(()=>{ DB.dentro=true; });
ok('se è ancora membro resta dentro', await p.evaluate(()=>filmAncoraDentro()), true);
await p.evaluate(()=>{ DB.dentro=false; });
ok('⚠ davanti a un no netto il film si chiude', [await p.evaluate(()=>filmAncoraDentro()), await p.evaluate(()=>filmCorrente())], [false,null]);
ok('con l\'ordine del giorno che aveva in memoria', await p.evaluate(()=>localStorage.getItem('cb_odg')), null);
ok('e glielo dice', await p.evaluate(()=>/Non fai più parte di Missione San Gennaro/.test(document.body.textContent)), true);
await entra(true);
await p.evaluate(()=>{ DB.dentro=false; });
ok('chi ha aperto il film non si chiude mai fuori', [await p.evaluate(()=>filmAncoraDentro()), await p.evaluate(()=>DB.chiamate.includes('sono_nel_film'))], [true,false]);

console.log('\n── ⚠ e col codice non rientra ──');
await p.evaluate(()=>{ localStorage.clear(); currentUser={id:'u2'}; DB.ingresso='escluso'; });
ok('l\'ingresso è rifiutato', [await p.evaluate(()=>filmEntra('A1B2C3D4')), await p.evaluate(()=>filmEntraEscluso), await p.evaluate(()=>filmCorrente())], [null,true,null]);
await p.evaluate(()=>{ DB.ingresso=null; });
ok('un codice sbagliato resta un codice sbagliato', [await p.evaluate(()=>filmEntra('ZZZZZZZZ')), await p.evaluate(()=>filmEntraEscluso)], [null,false]);

console.log('\n── ⚠ uscire dall\'account chiede conferma ──');
{ const r=await p.evaluate(async()=>{
    let usciti=0; const vero=logout; logout=async()=>{ usciti++; };
    const prova=async(risposta)=>{ const pr=logoutChiedi(); await new Promise(r=>setTimeout(r,40));
      const testo=document.querySelector('button[data-act="si"]')?.textContent; document.querySelector('button[data-act="'+risposta+'"]').click(); await pr; return testo; };
    const tasto=await prova('no'); const dopoNo=usciti; await prova('si'); const dopoSi=usciti; logout=vero;
    return {tasto, dopoNo, dopoSi, bottone:document.querySelector('#settingsPage .btn-danger').getAttribute('onclick'),
            mail:!!document.querySelector('#profRigaBox #settingsEmail')}; });
  ok('il tasto delle impostazioni passa dalla domanda', r.bottone, 'logoutChiedi()');
  ok('⚠ detto di no, si resta dentro', [r.tasto, r.dopoNo], ['Esci', 0]);
  ok('detto di sì, si esce', r.dopoSi, 1);
  ok('la mail sta nel riquadro del nome', r.mail, true);
}

ok('nessun errore di pagina', errori, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
process.exit(ko?1:0);
})();
