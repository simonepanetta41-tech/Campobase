/*
 * Il verificatore.
 *
 * Un modello legge bene i formati che nessuno ha previsto, e ogni tanto
 * scrive una cosa verosimile che nel foglio non c'e'. Uno script non
 * inventa mai, ma tace sui formati che non conosce.
 *
 * Qui si mettono insieme: il modello propone, il documento conferma. Un
 * valore si tiene solo se si ritrova ALLA LETTERA nel testo del PDF —
 * dove "alla lettera" tiene conto di come il testo esce da pdf.js, che
 * stacca le cifre e spezza le parole dove gli pare.
 *
 * Non e' una misura di quanto il modello e' bravo: e' una rete sotto.
 * Quello che passa, nel documento c'e'.
 */

// Il testo ridotto all'osso: niente spazi, niente accenti, tutto in
// maiuscolo. "0 9 : 3 0" e "09:30" diventano la stessa cosa, ed e'
// esattamente il confronto che serve.
function nudo(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/* Un orario si ritrova se nel foglio c'e' scritto come un orario:
 * ore, un due punti o un punto, minuti. Gli spazi in mezzo non contano,
 * perche' il PDF stampa "1 6 : 0 0" e intende le sedici.
 *
 * Il separatore invece conta, eccome. Prima bastava che le quattro cifre
 * comparissero di fila a separatori tolti, e un ordine del giorno e' pieno
 * di numeri: dentro "+39 333 0000000" ci sono le 06:45, le 54:49 e altre
 * sedici ore che nessuno ha mai scritto. Un verificatore che conferma un
 * orario inventato perche' le sue cifre passavano per caso dentro un
 * numero di telefono non verifica niente.
 */
function oraNelTesto(ora, testo) {
  const m = String(ora || '').match(/^(\d{1,2})[.:](\d{2})$/);
  if (!m) return false;
  const sp = x => String(x).split('').join('\\s*');
  const h = +m[1];
  const ore = h < 10 ? '(?:' + sp('0' + h) + '|' + sp(h) + ')' : sp(h);
  const re = new RegExp('(?<![0-9])' + ore + '\\s*[.:]\\s*' + sp(m[2]) + '(?![0-9])');
  return re.test(String(testo));
}

// Un testo si ritrova se ci sono le sue parole, nell'ordine, anche con
// altro in mezzo: il PDF puo' spezzare "LAVORAZIONE" in due pezzi.
function testoNelTesto(v, testo) {
  const n = nudo(v);
  if (n.length < 3) return false;
  const t = nudo(testo);
  if (t.includes(n)) return true;
  // Pezzo per pezzo: almeno i tre quarti delle parole devono esserci.
  const parole = String(v).split(/[^A-Za-zÀ-ÿ0-9]+/).filter(p => p.length >= 3);
  if (!parole.length) return false;
  const dentro = parole.filter(p => t.includes(nudo(p))).length;
  return dentro / parole.length >= 0.75;
}

function numeroNelTesto(v, testo) {
  if (v == null) return false;
  // Le pagine sono frazioni di ottavi: 3.125 e' "3 1/8", e nel foglio
  // c'e' scritto cosi'.
  const intero = Math.floor(v);
  const ottavi = Math.round((v - intero) * 8);
  const t = nudo(testo);
  if (ottavi === 0) return t.includes(nudo(String(intero)));
  return t.includes(nudo(intero + ' ' + ottavi + '/8'))
      || t.includes(nudo(intero + '-' + ottavi + '/8'))
      || (intero === 0 && t.includes(nudo(ottavi + '/8')));
}

const ORARI  = ['convocazione', 'prontiAGirare', 'fineRiprese', 'fineLavorazione',
                'alba', 'tramonto', 'catering', 'pausa'];
const NUMERI = ['pagine', 'cestini', 'numero'];

/* La riga da cui viene il valore.
 *
 * La prova di presenza ha un limite che non si puo' togliere: controlla
 * che il valore ci sia, non che venga dal posto giusto. In un ordine del
 * giorno ci sono quaranta orari — trucco, capelli, costumi, pick-up di
 * ogni attore — e un modello che prende le 06.45 dalla riga di un attore
 * e le chiama convocazione passerebbe il controllo, perche' quelle 06.45
 * nel foglio ci sono davvero.
 *
 * Si chiude chiedendo al modello di citare: per ogni campo, la riga da
 * cui l'ha preso, parola per parola. Allora si controllano due cose
 * invece di una — che quella riga esista nel documento, e che il valore
 * stia dentro quella riga. Una citazione inventata non si trova nel
 * foglio, e una riga vera che parla d'altro non contiene il valore.
 */
function rigaConfermata(valore, riga, testo) {
  if (!riga) return null;                       // il modello non ha citato
  const t = nudo(testo), r = nudo(riga);
  if (r.length < 6 || !t.includes(r)) return false;   // citazione inventata
  return confermato('_dentroLaRiga', valore, riga);
}

function confermato(campo, valore, testo) {
  if (valore == null || valore === '') return false;
  if (campo === 'data') {
    // La data si ritrova in una delle forme in cui la scrivono.
    const [a, m, g] = String(valore).split('-');
    const t = nudo(testo);
    return t.includes(nudo(g + m + a)) || t.includes(nudo(g + m + a.slice(2)))
        || t.includes(nudo(+g + ' ' + +m + ' ' + a));
  }
  // I numeri prima degli orari: 1.75 pagine ha la forma di un orario e non
  // lo e', e cercata come "1:75" non si trova da nessuna parte.
  if (NUMERI.includes(campo)) return numeroNelTesto(valore, testo);
  if (/^\d{1,2}[.:]\d{2}$/.test(String(valore))) return oraNelTesto(valore, testo);
  if (ORARI.includes(campo))  return testoNelTesto(valore, testo);
  return testoNelTesto(valore, testo);
}

/*
 * Mette insieme le due letture.
 *
 *   - dove parlano tutti e due e dicono la stessa cosa: nessun dubbio
 *   - dove parlano e discordano: vince lo script, che sa indicare la riga
 *   - dove lo script tace: parla il modello, se il documento lo conferma
 *   - quello che il documento non conferma si butta, e si segna
 */
function unisci(script, modello, testo) {
  const campi = new Set([...Object.keys(script || {}), ...Object.keys(modello || {})]);
  const fuori = {}, diario = [];
  const vuoto = v => v === null || v === undefined || v === '' || v === 0
                     || (Array.isArray(v) && !v.length);

  for (const c of campi) {
    if (c.startsWith('_')) continue;
    const s = script ? script[c] : null;
    const m = modello ? modello[c] : null;

    if (!vuoto(s) && !vuoto(m)) {
      if (nudo(s) === nudo(m)) {
        fuori[c] = s;
        diario.push({ campo: c, esito: 'concordi', tenuto: s });
        continue;
      }
      /* Chi vince quando discordano.
       *
       * Sugli orari e sui numeri comanda lo script: e' ripetibile, non
       * costa niente e sa indicare la riga da cui ha preso il valore.
       * (Sui tuoi undici documenti non hanno mai discordato nemmeno una
       * volta, quindi e' una regola che per ora non decide niente.)
       *
       * Sui campi di testo comanda il modello, se il documento lo
       * conferma — e qui la pratica ha smentito l'idea di partenza. Lo
       * script tace o parla, ma quando parla si porta dietro quello che
       * viene dopo: "Continuato nuvolosita' in graduale aumento",
       * "22:00 CESTINI N° 50", "continuato CAMPO BASE :". Non sono
       * valori sbagliati, sono valori sporchi, ed e' peggio: un campo
       * vuoto si vede, un campo sporco si legge male. Il modello li
       * restituisce puliti, e il verificatore controlla che ci siano.
       */
      /* Testuale si decide dal valore, non dal nome del campo: "pausa"
         una volta e' "14:00" e un'altra "continuato", e sono due cose
         diverse da verificare. */
      const testuale = !/^\d{1,2}[.:]\d{2}$/.test(String(m))
                    && !NUMERI.includes(c) && c !== 'data';
      const vince = testuale && confermato(c, m, testo) ? m : s;
      fuori[c] = vince;
      diario.push({ campo: c, esito: 'discordi', script: s, modello: m, tenuto: vince });
      continue;
    }
    if (!vuoto(s)) { fuori[c] = s; diario.push({ campo: c, esito: 'solo script', tenuto: s }); continue; }
    if (vuoto(m))  continue;

    // Se il modello ha citato la riga, si controlla quella; se no, ci si
    // accontenta della presenza nel documento.
    const citata = rigaConfermata(m, (modello._righe || {})[c], testo);
    const passa = citata === null ? confermato(c, m, testo) : citata;
    if (passa) {
      fuori[c] = m;
      diario.push({ campo: c, esito: 'solo modello', tenuto: m,
                    prova: citata === null ? 'presente nel foglio' : 'riga citata' });
    } else {
      diario.push({ campo: c, esito: 'scartato', modello: m, tenuto: null,
                    perche: citata === false ? 'la riga citata non regge' : 'non si trova nel foglio' });
    }
  }
  return { dati: fuori, diario };
}

module.exports = { unisci, confermato, rigaConfermata, nudo, oraNelTesto, testoNelTesto, numeroNelTesto };
