/* Gli stralci: il foglio della produzione, su tutti i telefoni.
 *
 * I byte di un PDF stanno nella memoria del telefono che l'ha letto, e
 * quella memoria non viaggia. Con il gettone della posta li legge un
 * telefono solo — chi arriva primo — quindi il foglio vero lo vedeva uno
 * e tutti gli altri vedevano la ricostruzione dell'app; e quale fosse
 * quell'uno cambiava ogni sera.
 *
 * Qui si finge di essere il telefono che NON ha i byte, e si guarda se va
 * a prenderseli nel secchio della posta.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${String(n).padEnd(46)} ${JSON.stringify(got)}`.padEnd(104)+' atteso '+JSON.stringify(exp));};

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844}});
p.setDefaultTimeout(15000);

// Il secchio della posta e la tabella posta, finti.
await p.addInitScript(()=>{
  window.__scaricati = [];
  window.__chiesto = 0;
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:{access_token:'x'}}}),
          onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:(t)=>({
      select(){ return this; }, eq(){ return this; }, in(){ return this; },
      order(){ return this; },
      limit: async function(){
        if (t !== 'posta') return {data:[]};
        window.__chiesto++;
        return {data:[{ricevuta:'2026-11-11', allegati:[
          {nome:'MSG_-_Stralci_DAY_22.pdf', percorso:'film1/pacco1/MSG_-_Stralci_DAY_22.pdf', tenuto:true},
          {nome:'altro.pdf', percorso:'film1/pacco1/altro.pdf', tenuto:true}]}]};
      },
      upsert:async()=>({error:null}), single:async()=>({data:null})}),
    storage:{from:(s)=>({ download: async (percorso)=>{
      window.__scaricati.push({secchio:s, percorso});
      // Un PDF minimo ma vero: pdf.js lo deve saper aprire.
      const testo = '%PDF-1.4\nSTRALCI FINTI\n%%EOF\n';
      return {data:new Blob([testo],{type:'application/pdf'}), error:null};
    }})}})};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html',{waitUntil:'domcontentloaded'});
await p.waitForTimeout(700);

console.log('\n── i byte di casa vincono: niente rete ──');
const casa = await p.evaluate(async()=>{
  await cbFileSalva('chiave-locale', new TextEncoder().encode('%PDF-1.4 locale').buffer);
  window.__scaricati = [];
  const buf = await odgByteDi({nome:'x.pdf', file:'chiave-locale', percorso:'film1/pacco1/x.pdf'});
  return {byte: !!buf && buf.byteLength > 0, scaricati: window.__scaricati.length};
});
ok('i byte arrivano', casa.byte, true);
ok('e non si scarica niente', casa.scaricati, 0);

console.log('\n── senza byte in casa si scarica dal secchio ──');
const rete = await p.evaluate(async()=>{
  window.__scaricati = [];
  const att = {nome:'MSG_-_Stralci_DAY_22.pdf', file:null, percorso:'film1/pacco1/MSG_-_Stralci_DAY_22.pdf'};
  const buf = await odgByteDi(att);
  return {byte: !!buf && buf.byteLength > 0, scaricati: window.__scaricati, chiave: att.file};
});
ok('i byte arrivano',        rete.byte, true);
ok('dal secchio della posta', rete.scaricati.map(x=>x.secchio), ['posta']);
ok('al percorso giusto',      rete.scaricati.map(x=>x.percorso), ['film1/pacco1/MSG_-_Stralci_DAY_22.pdf']);
// Messi da parte: la seconda volta non si paga un altro download.
ok('e restano sul telefono',  typeof rete.chiave, 'string');
// La chiave la decide l'app: si riusa quella, non una indovinata.
const dinuovo = await p.evaluate(async(chiave)=>{
  window.__scaricati = [];
  const buf = await odgByteDi({nome:'MSG_-_Stralci_DAY_22.pdf', file:chiave, percorso:'film1/pacco1/MSG_-_Stralci_DAY_22.pdf'});
  return {byte: !!buf, scaricati: window.__scaricati.length};
}, rete.chiave);
ok('la seconda volta i byte ci sono', dinuovo.byte, true);
ok('e non si scarica di nuovo',       dinuovo.scaricati, 0);

console.log('\n── un ordine del giorno vecchio: il percorso si cerca nella posta ──');
/* Gli ordini del giorno salvati prima di questa modifica non portano il
   percorso. Aspettare il pacchetto di domani vorrebbe dire lasciare la
   troupe senza il foglio vero per una giornata. */
const vecchio = await p.evaluate(async()=>{
  filmImposta({id:'film1', titolo:'Missione San Gennaro', codice:'ABCD1234'});
  window.__scaricati = []; window.__chiesto = 0;
  const att = {nome:'MSG_-_Stralci_DAY_22.pdf', file:null};   // nessun percorso
  const buf = await odgByteDi(att);
  return {byte: !!buf, percorso: att.percorso, chiesto: window.__chiesto,
          scaricati: window.__scaricati.map(x=>x.percorso)};
});
ok('trovato nella posta',  vecchio.percorso, 'film1/pacco1/MSG_-_Stralci_DAY_22.pdf');
ok('e scaricato',          vecchio.scaricati, ['film1/pacco1/MSG_-_Stralci_DAY_22.pdf']);
ok('i byte arrivano',      vecchio.byte, true);

console.log('\n── e quando non c\'è niente da nessuna parte ──');
const niente = await p.evaluate(async()=>{
  const a = await odgByteDi({nome:'mai-visto.pdf', file:null});   // non è nella posta
  const b = await odgByteDi(null);
  return [a, b];
});
ok('torna niente, senza rompersi', niente, [null, null]);

console.log('\n── fuori da un film non si va a cercare ──');
// Il percorso nella posta si cerca per film: senza film non c'è dove.
const fuori = await p.evaluate(async()=>{
  filmImposta(null);
  window.__chiesto = 0;
  const buf = await odgByteDi({nome:'MSG_-_Stralci_DAY_22.pdf', file:null});
  return {buf, chiesto: window.__chiesto};
});
ok('niente byte',      fuori.buf, null);
ok('e niente domande', fuori.chiesto, 0);

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
