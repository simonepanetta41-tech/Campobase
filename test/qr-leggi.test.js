/* Entrare in un film inquadrando il QR da dentro l'app.
   La fotocamera del telefono porta il link nel browser, non nell'app
   installata: qui la fotocamera si apre dentro l'app. La fotocamera finta
   e' un disegno del QR vero, quello che genera la pagina Troupe. */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(52)} ${JSON.stringify(got)}`.padEnd(96)+` atteso ${JSON.stringify(exp)}`);};
const STUB=()=>{
  const q=()=>{const x={select(){return x},order(){return x},limit(){return x},eq(){return x},update(){return x},upsert:async()=>({error:null}),
    single:async()=>({data:null}),maybeSingle:async()=>({data:null}),then(g){return Promise.resolve({data:[],error:null}).then(g)}};return x;};
  window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:q,rpc:async()=>({data:null}),storage:{from:()=>({})}})};
};
(async()=>{
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage(); p.setDefaultTimeout(15000);
const err=[]; p.on('pageerror',e=>err.push(e.message));
await p.addInitScript(STUB);
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://'+RADICE+'/index.html',{waitUntil:'domcontentloaded'}); await p.waitForTimeout(700);
await p.evaluate(()=>{
  currentUser={id:'io'};
  document.getElementById('authPage').style.display='none'; document.getElementById('app').style.display='block';
  window.ENTRATI=[]; window.APERTI=[]; window.FERMATE=0;
  filmEntra=async c=>{ ENTRATI.push(c); return c==='C59C90CE'?{id:'F1',titolo:'Film'}:null; };
  apriFilm=async id=>{ APERTI.push(id); };
  /* La fotocamera finta: una tela con dentro quello che le si dice. */
  window.finta=async (testo)=>{
    await qrCarica();
    const tela=document.createElement('canvas'); tela.width=640; tela.height=480; const c=tela.getContext('2d');
    const disegna=()=>{ c.fillStyle='#777'; c.fillRect(0,0,640,480); if(!testo) return;
      const g=qrcode(0,'M'); g.addData(testo); g.make(); const n=g.getModuleCount(), l=Math.floor(300/(n+8));
      c.fillStyle='#fff'; c.fillRect(170,90,l*(n+8),l*(n+8)); c.fillStyle='#000';
      for(let r=0;r<n;r++) for(let k=0;k<n;k++) if(g.isDark(r,k)) c.fillRect(170+l*(k+4),90+l*(r+4),l,l); };
    disegna(); const t=setInterval(disegna,60);
    navigator.mediaDevices.getUserMedia=async()=>{ const f=tela.captureStream(15);
      f.getTracks().forEach(tr=>{ const s=tr.stop.bind(tr); tr.stop=()=>{ FERMATE++; clearInterval(t); s(); }; }); return f; };
  };
});
const aperta=()=>p.evaluate(()=>document.getElementById('qrVista').classList.contains('on'));

console.log('\n── cosa c\'è in un QR ──');
ok('il link d\'invito', await p.evaluate(()=>qrCodiceDa('https://campobase.dev/?film=c59c90ce')), 'C59C90CE');
ok('il codice nudo', await p.evaluate(()=>qrCodiceDa(' k7qm2x ')), 'K7QM2X');
ok('un altro link non è nostro', await p.evaluate(()=>qrCodiceDa('https://esempio.it/menu?tavolo=4')), null);
ok('né un testo qualsiasi', await p.evaluate(()=>qrCodiceDa('WIFI:S:Set;T:WPA;P:pass;;')), null);

console.log('\n── inquadrando il QR del film si entra ──');
await p.click('#progCodice'); await p.waitForTimeout(150);
ok('il tasto sta sotto il campo del codice', await p.evaluate(()=>[...document.querySelectorAll('#codBox button')].filter(b=>b.offsetParent).map(b=>b.textContent.trim())), ['Entra','Inquadra il QR']);
await p.evaluate(()=>finta(filmLink('C59C90CE')));
await p.click('#codBox .cod-qr');
await p.waitForFunction(()=>APERTI.length>0,null,{timeout:12000}).catch(()=>{});
ok('⚠ letto il QR vero: si entra in quel film', await p.evaluate(()=>[ENTRATI, APERTI]), [['C59C90CE'],['F1']]);
ok('⚠ la fotocamera si chiude e si spegne', [await aperta(), await p.evaluate(()=>FERMATE>0 && qrFlusso===null)], [false, true]);

console.log('\n── quando non c\'è niente da leggere ──');
await p.evaluate(()=>{ ENTRATI.length=0; APERTI.length=0; FERMATE=0; document.getElementById('codBox').classList.add('on'); return finta('https://esempio.it/menu?tavolo=4'); });
await p.click('#codBox .cod-qr'); await p.waitForTimeout(1500);
ok('un QR che non è di Campobase: resta a guardare', [await aperta(), await p.evaluate(()=>ENTRATI.length)], [true, 0]);
await p.click('#qrVista button'); await p.waitForTimeout(150);
ok('"Annulla" chiude e spegne', [await aperta(), await p.evaluate(()=>FERMATE>0)], [false, true]);

console.log('\n── quando la fotocamera non c\'è ──');
await p.evaluate(()=>{ navigator.mediaDevices.getUserMedia=async()=>{ const e=new Error('no'); e.name='NotAllowedError'; throw e; }; });
await p.click('#codBox .cod-qr'); await p.waitForTimeout(300);
ok('permesso negato: lo dice e resta il codice a mano', [await aperta(), await p.evaluate(()=>(document.getElementById('toastContainer')||{textContent:''}).textContent.includes('Fotocamera non permessa'))], [false, true]);
await p.evaluate(()=>{ navigator.mediaDevices.getUserMedia=async()=>{ const e=new Error('no'); e.name='NotFoundError'; throw e; }; });
await p.click('#codBox .cod-qr'); await p.waitForTimeout(300);
ok('nessuna fotocamera: non resta lo schermo nero', await aperta(), false);

console.log('\n── il codice del QR sbagliato ──');
await p.evaluate(()=>{ ENTRATI.length=0; APERTI.length=0; return finta(filmLink('AAAAAAAA')); });
await p.click('#codBox .cod-qr');
await p.waitForFunction(()=>ENTRATI.length>0,null,{timeout:12000}).catch(()=>{}); await p.waitForTimeout(200);
ok('un codice che non esiste: non si entra, e si torna al campo', [await p.evaluate(()=>[ENTRATI, APERTI]), await aperta()], [[['AAAAAAAA'],[]], false]);

ok('nessun errore in pagina', err, []);
await b.close();
console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati');
process.exit(ko?1:0);
})();
