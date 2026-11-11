/*
 * Sostituisce i dati della troupe nei documenti di test/dati/.
 *
 * I controlli di questa batteria sono nati su ordini del giorno veri, e in
 * un ordine del giorno vero c'e' la lista della troupe: nomi e numeri di
 * telefono di persone che lavorano. I documenti quindi non stanno nel
 * repository (test/dati/ e test/odg-corpus/ sono fuori da git), ma i
 * controlli che li leggono dicono cosa aspettarsi — e quelle attese sono
 * nei file dei controlli, che nel repository invece ci stanno.
 *
 * Da qui la regola: nei file dei controlli i nomi sono inventati, e questo
 * script li rende inventati anche nei documenti, con lo stesso rimpiazzo.
 * Le due parti restano d'accordo e nel repository non finisce nessun nome
 * vero.
 *
 * I nomi inventati hanno la STESSA FORMA di quelli veri — le particelle
 * ("De Marchi"), le iniziali col punto ("S. Panetta"), i numeri a dieci
 * cifre — perche' la forma e' proprio quello che i controlli verificano.
 * Un rimpiazzo che semplifica la forma cancella il controllo invece di
 * proteggerlo.
 *
 * Si lancia dopo aver messo documenti nuovi in test/dati/:
 *
 *   node anonimizza.js
 *   node anonimizza.js --prova     (dice cosa cambierebbe, senza toccare)
 *
 * Tocca solo testo: txt, json, csv. I PDF restano come sono, e restano
 * fuori da git.
 */
const fs = require('fs');
const path = require('path');

/* I numeri di telefono: una regola, non un elenco.
 *
 * Negli estratti di dieci produzioni ce ne sono piu' di cento, e un elenco
 * scritto a mano ne lascia fuori sempre qualcuno. Il rimpiazzo conserva la
 * forma esatta — gli spazi dove stavano, i gruppi di cifre com'erano,
 * l'eventuale +39 — perche' nei fogli veri un numero arriva spezzato
 * ("347", "335", "9815") e rimetterlo insieme e' uno dei controlli.
 *
 * Ed e' deterministico: lo stesso numero da' sempre lo stesso finto, se no
 * le attese scritte nei file dei controlli cambierebbero a ogni passata. */
const TELEFONO = /(?:\+39[ .]?)?\b3[0-9]{2}[ .]?[0-9]{3}[ .]?[0-9]{3,4}\b/g;

function finto(originale) {
  // Il +39 davanti si lascia stare: sostituirne le cifre dava "+33".
  const pre = /^\+39[ .]?/.exec(originale);
  const prefisso = pre ? pre[0] : '';
  const corpo = originale.slice(prefisso.length);
  const cifre = corpo.replace(/\D/g, '');
  /* Un numero gia' finto si riconosce: comincia per 3330. Senza questo,
     rilanciare lo script cambiava i finti una seconda volta e le attese
     scritte nei controlli non tornavano piu'. */
  if (cifre.startsWith('3330')) return originale;
  let h = 0;
  for (const c of cifre) h = (h * 31 + Number(c)) % 1000000;
  const nuove = ('3330' + String(h).padStart(6, '0')).slice(0, cifre.length).padEnd(cifre.length, '0');
  let i = 0;
  return prefisso + corpo.replace(/[0-9]/g, () => nuove[i++]);
}

/* L'elenco dei nomi sta in test/dati/nomi.json, fuori da git.
 *
 * Qui c'era, e in chiaro: una tabella di coppie "nome vero" -> "nome
 * inventato" dentro il file che i nomi veri serve a togliere. Il file dei
 * controlli era pulito e l'elenco dei nomi stava nel repository due righe
 * piu' in la'. Lo strumento resta, l'elenco no — e' lo stesso principio
 * dei documenti.
 *
 * Il formato e' una lista di coppie, applicate in ordine: le piu' lunghe
 * prima, se no "Rossi" si sostituisce dentro "Mario Rossi" e la coppia
 * lunga non trova piu' niente.
 *
 *   [["Mario Rossi", "Mario Bianchi"], ["Rossi", "Bianchi"]]
 */
const ELENCO = path.join(__dirname, 'dati', 'nomi.json');
const MAPPA = fs.existsSync(ELENCO) ? JSON.parse(fs.readFileSync(ELENCO, 'utf8')) : [];
if (!MAPPA.length) console.log('(nessun elenco di nomi in ' + ELENCO + ': si sostituiscono solo i telefoni)');


const prova = process.argv.includes('--prova');
const TESTO = /\.(txt|json|csv)$/i;
const conto = new Map();
let toccati = 0;

function passa(f) {
  /* L'elenco dei nomi non si anonimizza: sta in dati/ come i documenti, e
     passandoci sopra lo script si mangiava la propria tabella — "Rossi ->
     Bianchi" diventava "Bianchi -> Bianchi" e dalla passata dopo non
     sostituiva piu' niente. */
  if (path.basename(f) === 'nomi.json') return;
  let s = fs.readFileSync(f, 'utf8');
  const prima = s;
  s = s.replace(TELEFONO, m => {
    const n = finto(m);
    // Si contano le sostituzioni vere, non gli incontri: un numero gia'
    // finto si incontra a ogni passata e non cambia niente.
    if (n !== m) conto.set('(telefoni)', (conto.get('(telefoni)') || 0) + 1);
    return n;
  });
  for (const [a, b] of MAPPA) {
    if (!s.includes(a)) continue;
    conto.set(a, (conto.get(a) || 0) + s.split(a).length - 1);
    s = s.split(a).join(b);
  }
  if (s === prima) return;
  toccati++;
  if (!prova) fs.writeFileSync(f, s);
}

function gira(dir) {
  if (!fs.existsSync(dir)) return;
  for (const v of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, v.name);
    if (v.isDirectory()) gira(p);
    else if (TESTO.test(v.name)) passa(p);
  }
}

gira(path.join(__dirname, 'dati'));
gira(path.join(__dirname, 'odg-corpus'));

if (!conto.size) { console.log('Niente da sostituire.'); process.exit(0); }
for (const [a, n] of [...conto].sort((x, y) => y[1] - x[1])) console.log(`${String(n).padStart(4)}  ${a}`);
console.log(`\n${toccati} file ${prova ? 'da cambiare' : 'cambiati'}.`);
