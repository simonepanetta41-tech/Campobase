/* Il campo del codice del film, e lo spazio sotto.
 *
 * Il guasto, visto sul telefono di un collega: mentre si scriveva il
 * codice, a ogni carattere la pagina saltava tutta in fondo. Sul telefono
 * di chi l'app la sviluppa non succedeva.
 *
 * Il campo sta in coda alla lista dei progetti, e sotto c'erano quaranta
 * pixel: appiccicato alla fine della pagina. Con la tastiera aperta iOS, a
 * ogni carattere, rifa' il conto di dove sta il cursore e scorre per
 * tenerlo visibile — e senza spazio sotto, "tenerlo visibile" vuol dire
 * portare il documento al massimo. Con pochi progetti la pagina non
 * scorre affatto e non si vede niente: ecco perche' su un telefono si' e
 * sull'altro no.
 *
 * Qui non si puo' aprire una tastiera di iOS, quindi non si misura il
 * salto: si misura la condizione che lo rende possibile, cioe' il campo in
 * fondo a una pagina senza spazio sotto.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,v,extra='')=>{ if(!v) ko++; console.log(`  ${v?'ok ':'KO '} ${String(n).padEnd(46)} ${extra}`); };

const apri = async (b, quantiProgetti) => {
  const p = await b.newPage({viewport:{width:393,height:852}});
  await p.addInitScript((n)=>{
    const righe = Array.from({length:n},(_,i)=>({id:'a'+i, title:'Film numero '+i,
      created_at:'2026-11-01', project_id:'p'+i, type:'film', data:{}, user_id:'u1'}));
    window.supabase={createClient:()=>({
      auth:{getSession:async()=>({data:{session:{user:{id:'u1'},access_token:'t'}}}),
            onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
      from:()=>({select(){return this},eq(){return this},in(){return this},order(){return this},
         limit:async()=>({data:righe}), then:(f)=>f({data:righe,error:null}),
         single:async()=>({data:null}), upsert:async()=>({error:null})}),
      rpc:async()=>({data:[],error:null}), storage:{from:()=>({})}})};
  }, quantiProgetti);
  await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
  await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(800);
  await p.evaluate(()=>{
    document.getElementById('authPage').style.display='none';
    document.getElementById('app').style.display='block';
    document.getElementById('homePage').style.display='';
  });
  return p;
};

(async()=>{
const b=await chromium.launch();

console.log('\n── con il campo aperto c\'è spazio sotto ──');
const p = await apri(b, 12);
const chiuso = await p.evaluate(()=>document.documentElement.scrollHeight);
await p.evaluate(()=>codiceMostra());
await p.waitForTimeout(700);
const m = await p.evaluate(()=>{
  const r = document.getElementById('codBox').getBoundingClientRect();
  return {
    aperto: document.getElementById('homePage').classList.contains('cod-aperto'),
    campoDaSopra: Math.round(r.top),
    campoSotto: Math.round(r.bottom),
    sottoAlCampo: Math.round(document.documentElement.scrollHeight - (scrollY + r.bottom)),
    sotto: Math.round(document.documentElement.scrollHeight - innerHeight - scrollY),
    altezza: document.documentElement.scrollHeight,
    attivo: document.activeElement && document.activeElement.id
  };
});
ok('il campo prende il fuoco', m.attivo === 'codInput', m.attivo);
ok('la home si allarga sotto',  m.aperto);
/* Quello che conta non e' lo spazio residuo: e' che il campo stia gia'
   nella fascia visibile sopra la tastiera, cosi' il browser non abbia
   niente da sistemare a ogni carattere. La tastiera di iOS copre circa il
   45% dello schermo. */
const tastiera = Math.round(852 * 0.45);
const visibile = 852 - tastiera;
ok('il campo sta sopra la tastiera', m.campoSotto < visibile - 20,
   `finisce a ${m.campoSotto}, la tastiera comincia a ${visibile}`);
ok('e in alto, non al centro', m.campoDaSopra < 200, `${m.campoDaSopra} da sopra`);
/* E sotto il campo resta pagina: si misura dal campo alla fine del
   documento, non da quanto manca a scorrere — lo spazio gia' a schermo
   conta, perche' per mostrare una cosa gia' visibile il browser non
   scorre. Prima erano quaranta pixel, ed e' li' che nasceva il salto. */
ok('e sotto il campo resta pagina', m.sottoAlCampo > tastiera,
   `${m.sottoAlCampo} contro ${tastiera}`);

console.log('\n── scrivere non muove la pagina ──');
await p.click('#codInput');
const prima = await p.evaluate(()=>Math.round(scrollY));
const mosse = [];
for (const c of 'C59C90CE') {
  await p.keyboard.type(c);
  await p.waitForTimeout(90);
  mosse.push(await p.evaluate(()=>Math.round(scrollY)));
}
ok('la pagina sta ferma', mosse.every(y=>y===prima), `da ${prima} a ${mosse.join(',')}`);
ok('e il codice è tutto lì', (await p.evaluate(()=>document.getElementById('codInput').value)) === 'C59C90CE');

console.log('\n── richiudendolo lo spazio se ne va ──');
await p.evaluate(()=>codiceMostra());
await p.waitForTimeout(300);
const dopo = await p.evaluate(()=>({
  aperto: document.getElementById('homePage').classList.contains('cod-aperto'),
  altezza: document.documentElement.scrollHeight }));
ok('niente classe',          !dopo.aperto);
ok('e niente vuoto in fondo', dopo.altezza === chiuso, `${dopo.altezza} contro ${chiuso}`);
await p.close();

console.log('\n── con pochi progetti la pagina non scorre, e va bene ──');
// E' il caso in cui il guasto non si vedeva: resta cosi'.
const q = await apri(b, 1);
await q.evaluate(()=>codiceMostra());
await q.waitForTimeout(500);
const corto = await q.evaluate(()=>({
  attivo: document.activeElement && document.activeElement.id,
  sotto: Math.round(document.documentElement.scrollHeight - innerHeight - scrollY)}));
ok('il campo prende il fuoco', corto.attivo === 'codInput', corto.attivo);
ok('e c\'è spazio sotto',      corto.sotto >= 0, String(corto.sotto));
await q.close();

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
