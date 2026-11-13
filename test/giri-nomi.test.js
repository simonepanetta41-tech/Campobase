/*
 * Chi sei tu, sui giri auto.
 *
 * La ricerca del proprio passaggio cercava il solo cognome, in fondo al
 * nome stampato, e prendeva la prima tratta che lo conteneva. Sui giri
 * auto veri di un lunedi' qualsiasi quattro cognomi su cinquantadue
 * comparivano in due tratte diverse, e in un caso erano due persone
 * davvero diverse: stesso cognome, iniziali diverse, due alberghi, mezz'ora
 * di scarto. Chi dei due era scritto dopo nel PDF si ritrovava in mano
 * l'orario e il posto dell'altro, e con le notifiche accese la sveglia
 * all'ora sbagliata.
 *
 * I nomi qui dentro sono inventati: la forma e' quella dei giri auto veri,
 * le persone no.
 */
const RADICE = require('path').join(__dirname, '..');
const {chromium}=require('playwright');
let ko=0;
const ok=(n,got,exp)=>{const b=JSON.stringify(got)===JSON.stringify(exp);if(!b)ko++;
  console.log(`  ${b?'ok ':'KO '} ${n.padEnd(46)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`);};

/* La forma di un giro auto come esce da pdf.js: una riga sola, le colonne
   separate da due o piu' spazi, l'intestazione davanti a tutto. */
const TESTA = 'MARTEDì 10  NOVEMBRE  RUNNER   ORARIO  PARTENZA  NOME   INDIRIZZO   ORARIO  ARRIVO  INDIRIZZO  ';
const tratta = (aut, tel, ora, nomi, luogo, via, arrivo) =>
  `${aut} Van  ${tel}  ${ora}   ${nomi.join('  ')}  ${luogo}  ${via}  ${arrivo}   CB  `;

(async()=>{
const b=await chromium.launch();
const p=await b.newPage({viewport:{width:390,height:844}});
await p.addInitScript(()=>{
  window.supabase={createClient:()=>({
    auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
    from:()=>({select(){return this},eq(){return this},order(){return this},
               single:async()=>({data:null}),maybeSingle:async()=>({data:null})}),
    storage:{from:()=>({upload:async()=>({}),download:async()=>({})})}
  })};
});
await p.route('**',r=>r.request().url().startsWith('file://')?r.continue():r.abort());
await p.goto('file://' + RADICE + '/index.html');
await p.waitForTimeout(800);

const cerca = (testo, nome, cognome) =>
  p.evaluate(a=>odgPickUp(a.t,{nome:a.n,cognome:a.c}), {t:testo, n:nome, c:cognome});

console.log('\n── due cognomi uguali, due persone diverse ──');
/* Il caso vero di lunedi': lo stesso cognome in due tratte, iniziali
   diverse, alberghi diversi. Prima vincevano tutte e due la prima tratta
   scritta nel PDF — cioe' uno dei due partiva mezz'ora dopo il suo giro. */
const DUE = TESTA
  + tratta('Marco Verdoni','333 1110001','07.00',['F.Lonetti','P.Mazzara'],'HOTEL CORALLO','Via Roma, 10, 74100 Taranto TA','07.30')
  + tratta('Elio Brandani','333 1110002','06.25',['A.Lonetti'],'HOTEL GIRASOLE','Via Verdi, 4, 74100 Taranto TA','06.55');

const franco = await cerca(DUE,'Franco','Lonetti');
const aldo   = await cerca(DUE,'Aldo','Lonetti');
ok('Franco prende la sua',      [franco.ora, franco.luogo], ['07.00','HOTEL CORALLO']);
ok('Aldo prende la sua',        [aldo.ora,   aldo.luogo],   ['06.25','HOTEL GIRASOLE']);
ok('e ognuno il proprio autista', [franco.autista, aldo.autista], ['Marco Verdoni','Elio Brandani']);
ok('nessuna ambiguita rimasta', [franco.altre, aldo.altre], [0,0]);

console.log('\n── ⚠ limite noto: il nome scritto al contrario ──');
/*
 * ATTENZIONE: quello che segue NON e' il comportamento che vogliamo. E'
 * quello che c'e', scritto qui perche' si veda invece di scoprirlo su un
 * set.
 *
 * "LONETTI FRANCO" e' come compila mezza Italia, e questa riga non trova
 * nessun passaggio. Il confronto pero' non c'entra: nomeCorrisponde su
 * quella stringa risponde di si'. Il punto e' prima, in odgTratte, che
 * quella cella non la legge come un nome ma come un albergo — due parole
 * tutte maiuscole hanno la stessa forma di "HOTEL CORALLO", e la colonna
 * finisce nel posto sbagliato: nomi vuoti, luogo "LONETTI FRANCO".
 *
 * Si risolve insegnando a odgTratte a distinguere una persona da un
 * posto, ed e' un lavoro da misurare su tutto il corpus prima di
 * toccarlo. Quando qualcuno lo fara', questo controllo diventera' rosso:
 * e' il segnale giusto, e allora va riscritto con l'esito che vogliamo —
 * ora '07.00' e luogo 'HOTEL CORALLO'. Non va aggiustato in nessun altro
 * modo.
 */
const ROVESCIO = TESTA
  + tratta('Marco Verdoni','333 1110001','07.00',['LONETTI FRANCO'],'HOTEL CORALLO','Via Roma, 10, 74100 Taranto TA','07.30');
ok('il confronto lo riconoscerebbe',
   await p.evaluate(()=>nomeCorrisponde('LONETTI FRANCO',{nome:'Franco',cognome:'Lonetti'})), true);
ok('ma la cella viene letta come un posto',
   await p.evaluate(t=>odgTratte(t)[0].nomi, ROVESCIO), []);
ok('e quindi nessun passaggio (da risolvere)',
   await cerca(ROVESCIO,'Franco','Lonetti'), null);

console.log('\n── la stessa persona in due tratte ──');
/* Andata e rientro, o la stessa riga ripetuta. Qui non c'e' niente da
   distinguere: vale la piu' mattiniera, che e' quella che non si puo'
   perdere. */
const BIS = TESTA
  + tratta('Marco Verdoni','333 1110001','06.10',['F.Lonetti'],'HOTEL CORALLO','Via Roma, 10, 74100 Taranto TA','06.40')
  + tratta('Elio Brandani','333 1110002','06.00',['F.Lonetti'],'HOTEL CORALLO','Via Roma, 10, 74100 Taranto TA','06.30');
const bis = await cerca(BIS,'Franco','Lonetti');
ok('vince la piu mattiniera', bis.ora, '06.00');
ok('e lo dice',               bis.altre, 1);

console.log('\n── chi non c\'è non viene inventato ──');
ok('nessun passaggio',     await cerca(DUE,'Chiara','Rinaldi'), null);
ok('senza cognome niente', await cerca(DUE,'Franco',''),        null);

console.log('\n── i compagni di furgone, senza me stesso ──');
ok('solo gli altri', franco.conMe, ['P.Mazzara']);

console.log('\n── il telefono dell\'autista stampato in due pezzi ──');
/* Dai giri auto di sabato 14, come li legge l'app: "339" e "8408475"
   arrivano separati, e il secondo pezzo ha sette cifre. Il numero di
   Luca Cammarosano restava vuoto, e nella scheda del pick-up mancava il
   tasto per chiamarlo. */
const SABATO = ['SET','Luca Cammarosano Van','339','8408475','11.55','A.Viscardi','D .Cinque',
  'VILLA DELLA MEDA','Viale Del Tramonto 23','12.00','TURSPORT HOTEL RESIDENCE',
  'Via del Faro, 58, 74122 Taranto TA','12.00','F.Lombardi','D.De Angelis','S.Panetta','A.Rizzo','A.Liddi',
  'TURSPORT HOTEL RESIDENCE','Via del Faro, 58, 74122 Taranto TA','12.30','SET'].join('\n');
const pk = await p.evaluate(t=>odgPickUp(t,{nome:'Simone',cognome:'Panetta'}), SABATO);
ok('il numero si rimette insieme', pk && pk.tel, '3398408475');
ok('e il pick-up resta il suo', pk && [pk.ora, pk.autista], ['12.00','Luca Cammarosano']);
/* Ma senza un prefisso davanti una fila di numeri non diventa un
   telefono: orari e numeri di scena restano quello che sono. */
ok('due numeri qualunque non fanno un telefono',
   await p.evaluate(()=>telVicino(['Mario Rossi Van','16','8408475','12.00'],0)), null);

console.log(ko?`\n${ko} CONTROLLI FALLITI`:'\nTutti i controlli passati.');
await b.close(); process.exit(ko?1:0);})();
