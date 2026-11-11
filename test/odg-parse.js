/*
 * Riconoscimento deterministico dell'intestazione di un ordine del giorno.
 *
 * pdf.js restituisce il testo con spazi dove nel PDF non ce ne sono:
 * "C ONVOCAZIONE", "0 8.30", "33 9 7564743", "06 : 36". Succede perche'
 * ogni glifo e' posizionato per conto suo e la spaziatura del titolo viene
 * letta come separazione. Quindi ogni confronto deve tollerare spazi in
 * mezzo a tutto: le etichette si cercano lettera per lettera e i numeri si
 * ricompongono togliendo gli spazi.
 *
 * Questa parte non costa token. Al modello restano solo le tabelle a piu'
 * colonne — scene, cast, troupe — dove il testo arriva intrecciato e un
 * riconoscimento a regole sarebbe fragile.
 */

// "CONVOCAZIONE" -> /C\s*O\s*N\s*V\s*.../i  — una etichetta con spazi ovunque
function etichetta(s) {
  return s.split('').map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
}

// "0 8.30" -> "08.30" ; "06 : 36" -> "06.36" ; "18. 25" -> "18.25"
function ora(s) {
  if (!s) return null;
  const m = String(s).replace(/\s+/g, '').match(/^(\d{1,2})[.:,](\d{2})/);
  if (!m) return null;
  const h = +m[1], mn = +m[2];
  if (h > 23 || mn > 59) return null;
  return String(h).padStart(2, '0') + '.' + String(mn).padStart(2, '0');
}

/*
 * Il testo che segue un'etichetta.
 *
 * La stessa parola puo' comparire piu' volte: "AMBIENTE" sta sia nel campo
 * dell'intestazione sia dentro il paragrafo sul protocollo green film
 * ("RISPETTOSA DELL'AMBIENTE"). A distinguerli sono i due punti, che il
 * campo ha e la prosa no. Quindi fra tutte le occorrenze si preferisce
 * quella seguita dai due punti, e solo se non ce n'e' nessuna si ripiega
 * sulla prima — perche' qualche campo i due punti non ce li ha davvero
 * ("PRONTI A GIRARE 08.30", "OSPEDALE SAN GIUSEPPE").
 */
function dopo(testo, et, lunghezza = 90) {
  const re = new RegExp(etichetta(et) + '(\\s*:)?\\s*', 'gi');
  let primo = null, conDuePunti = null, m;
  while ((m = re.exec(testo)) !== null) {
    const p = m.index + m[0].length;
    if (primo === null) primo = p;
    if (m[1] && conDuePunti === null) conDuePunti = p;
    if (m[0].length === 0) re.lastIndex++;
  }
  const p = conDuePunti !== null ? conDuePunti : primo;
  return p === null ? null : testo.slice(p, p + lunghezza);
}

function oraDopo(testo, et) {
  const t = dopo(testo, et, 24);
  return t ? ora(t) : null;
}

/* Un valore testuale: si ferma alla prossima etichetta in maiuscolo seguita
   da due punti, che e' come l'OdG separa i campi. */
function valoreDopo(testo, et, stop) {
  let t = dopo(testo, et, 160);
  if (!t) return null;
  const fine = t.search(new RegExp('(' + stop.map(etichetta).join('|') + ')\\s*:?', 'i'));
  if (fine > 0) t = t.slice(0, fine);
  return t.replace(/\s+/g, ' ').trim()
          .replace(/^[\s.,;:/|-]+/, '')      // residui quando l'etichetta era in mezzo a una frase
          .replace(/[\s/|-]+$/, '').trim() || null;
}

const STOP = ['LOCATION', 'AMBIENTE', 'METEO', 'DAWN', 'ALBA', 'TRAMONTO', 'DUSK',
  'CONVOCAZIONE', 'PRONTI', 'PAUSA', 'FINE RIPRESE', 'FINE LAVORAZIONE',
  'OSPEDALE', 'Catering', 'CB /', 'MEZZI TECNICI', 'SC.', 'https'];

const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio',
              'agosto','settembre','ottobre','novembre','dicembre'];

function odgIntestazione(testo) {
  const t = String(testo || '');
  const r = {};

  // Numero dell'OdG e data: "ODG # 20  Lunedì 09 Novembre 2026"
  const mN = t.match(new RegExp(etichetta('ODG') + '\\s*#?\\s*(\\d{1,3})', 'i'));
  if (mN) r.numero = +mN[1];
  const mD = t.match(new RegExp('(\\d{1,2})\\s*(' + MESI.map(etichetta).join('|') + ')\\s*(\\d{4})', 'i'));
  if (mD) {
    const mese = MESI.findIndex(x => x.toLowerCase() === mD[2].replace(/\s+/g, '').toLowerCase());
    if (mese >= 0) r.data = `${mD[3]}-${String(mese + 1).padStart(2, '0')}-${String(+mD[1]).padStart(2, '0')}`;
  }

  // Orari della giornata
  r.convocazione   = oraDopo(t, 'CONVOCAZIONE');
  r.prontiAGirare  = oraDopo(t, 'PRONTI A GIRARE');
  r.fineRiprese    = oraDopo(t, 'FINE RIPRESE');
  r.fineLavorazione= oraDopo(t, 'FINE LAVORAZIONE');
  r.catering       = oraDopo(t, 'Catering Pronto');

  // Luce
  r.dawn     = oraDopo(t, 'DAWN');
  r.alba     = oraDopo(t, 'ALBA');
  r.tramonto = oraDopo(t, 'TRAMONTO');
  r.dusk     = oraDopo(t, 'DUSK');

  // Luoghi e testi
  r.ambiente = valoreDopo(t, 'AMBIENTE', STOP);
  r.location = valoreDopo(t, 'LOCATION', STOP);
  r.meteo    = valoreDopo(t, 'METEO', STOP);
  r.ospedale = valoreDopo(t, 'OSPEDALE', STOP);
  r.pausa    = valoreDopo(t, 'PAUSA', STOP);

  // Cestini del catering: "N° Cestini : 90"
  const mC = t.match(new RegExp(etichetta('Cestini') + '\\s*:?\\s*(\\d[\\d\\s]{0,4})', 'i'));
  if (mC) r.cestini = +mC[1].replace(/\s+/g, '');

  // Il link alla mappa, se c'e'. Si ferma al primo spazio: l'etichetta che
  // segue nel PDF ("METEO:") finirebbe dentro l'indirizzo.
  const mM = t.match(/https?:\/\/\S+/);
  if (mM) r.mappa = mM[0].replace(/[.,;:]+$/, '');

  // Regia e produzione, utili per intitolare il progetto
  r.regia = valoreDopo(t, 'Regia di', ['MAD', 'Piazza', 'S.p.A', 'Produttore']);

  return r;
}

module.exports = { odgIntestazione, ora, etichetta };
