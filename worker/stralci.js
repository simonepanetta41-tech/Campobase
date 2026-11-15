/* ══ L'INDICE DEGLI STRALCI: A CHE PAGINA COMINCIA OGNI SCENA ═════════════
 *
 * Gli stralci sono le pagine di sceneggiatura delle scene del giorno.
 * L'app li mostra come PDF, e per saltare alla scena giusta le serve
 * sapere a che pagina comincia ognuna. Finora lo ricavava il telefono dai
 * rientri del testo, con regole che valgono per un'impaginazione: con gli
 * stralci di un'altra produzione non trovava nessuna scena e non si
 * aprivano.
 *
 * Qui lo si chiede al modello: l'elenco "scena → pagina". E' una risposta
 * corta, e non dipende da come il foglio e' impaginato.
 *
 * Si accende con STRALCI = "si". Non e' la verita' ultima: sul telefono,
 * dove la lettura dai rientri riesce, vale quella (index.html,
 * odgStralciRipara), e questo indice riempie solo quello che manca.
 * Se la chiamata fallisce l'ordine del giorno si scrive lo stesso.
 */
import { firma } from './ombra.js';

const MODELLO = 'claude-haiku-5-5';

export const STRALCI_SYS = `Ti viene dato un PDF con gli stralci del giorno di una produzione cinematografica: le pagine di sceneggiatura delle scene che si girano. Per ogni scena che COMINCIA nel documento, cioè ogni intestazione di scena (una riga come "93  EST/INT. CASA DI ANDREA - GIORNO  93" o "EST. CAMPI STERMINATI, IN AUTO - GIORNO 32"), dai:

n: il numero di scena come è scritto nell'intestazione, con le sue lettere ("93", "65C", "3A").
p: la pagina del PDF in cui comincia, contando le pagine del file: la prima pagina del PDF è 1, la seconda 2. NON il numero stampato sul foglio (quello è il numero di pagina della sceneggiatura intera, e non c'entra).
testa: l'intestazione senza i numeri di scena ("EST/INT. CASA DI ANDREA - GIORNO").

Nell'ordine in cui compaiono. Solo le intestazioni che ci sono davvero: non aggiungere scene. Rispondi SOLO con un array JSON, senza testo attorno:
[{"n":"2","p":1,"testa":"EST. CASA ANDREA - GIORNO"},{"n":"93","p":2,"testa":"EST/INT. CASA DI ANDREA - GIORNO"}]`;

/* Lo stralcio fra gli allegati: detto dallo smistamento, o dal nome. */
export function allegatoStralci(allegati) {
  return (allegati || []).find(a => a && a.tenuto && a.percorso && /\.pdf$/i.test(a.nome || '')
    && (a.smistato ? a.genere === 'stralci' : /stralc/i.test(a.nome || ''))) || null;
}

/* Quello che ha detto il modello, ripulito. Si tiene solo cio' che sta in
   piedi: un numero di scena, una pagina vera, e le pagine che non tornano
   indietro — gli stralci si leggono in avanti, e una scena "a pagina 149"
   e' il numero stampato sul foglio, non la pagina del file. */
export function indicePulito(grezzo) {
  const out = [];
  let ultima = 0;
  for (const x of Array.isArray(grezzo) ? grezzo : []) {
    const n = String(x && x.n != null ? x.n : '').toUpperCase().replace(/\s+/g, '');
    const p = +(x && x.p);
    if (!/^\d{1,3}[A-Z]{0,4}\d?$/.test(n) || !Number.isInteger(p) || p < 1 || p > 80) continue;
    if (p < ultima) return [];              // pagine in disordine: non ci si fida di niente
    if (out.some(y => y.n === n)) continue;
    ultima = p;
    out.push({ n, p, testa: String(x.testa || '').replace(/\s+/g, ' ').trim().slice(0, 120) });
  }
  // Una sola scena "a pagina 30" in un file che dovrebbe cominciare da 1.
  if (out.length && out[0].p > 3) return [];
  return out;
}

/* Torna l'indice ([{n,p,testa}]) o null. Non lancia mai. */
export async function indiceStralci(env, allegati) {
  if (String(env.STRALCI || '').toLowerCase() !== 'si') return null;
  const a = allegatoStralci(allegati);
  if (!a || (a.byte || 0) > 8000000) return null;
  const modello = env.STRALCI_MODELLO || MODELLO;
  const inizio = Date.now();
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modello, max_tokens: 1500, system: STRALCI_SYS,
        messages: [{ role: 'user', content: [
          { type: 'text', text: 'STRALCI DEL GIORNO:' },
          { type: 'document', source: { type: 'url', url: await firma(env, a.percorso) } }] }] })
    });
    const grezzo = await r.text();
    if (!r.ok) throw new Error('modello ' + r.status + ': ' + grezzo.slice(0, 200));
    const d = JSON.parse(grezzo);
    const testo = (d.content || []).filter(b => b && b.type === 'text').map(b => b.text || '').join('');
    const indice = indicePulito(JSON.parse(testo.slice(testo.indexOf('['), testo.lastIndexOf(']') + 1)));
    console.log('stralci:', JSON.stringify({ modello, ms: Date.now() - inizio,
      token_entrata: d.usage && d.usage.input_tokens, token_uscita: d.usage && d.usage.output_tokens,
      scene: indice.map(x => x.n + '@' + x.p).join(' ') }));
    return indice.length ? indice : null;
  } catch (e) {
    console.error('stralci: indice non fatto —', String(e && e.message || e).slice(0, 200));
    return null;
  }
}
