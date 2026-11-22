/* ══ LO SMISTAMENTO: CHE COS'E' QUESTO ALLEGATO? ══════════════════════════
 *
 * Il server capisce cos'e' un allegato dal nome del file: "ODG", "GIRI",
 * "PDL". Finche' la produzione usa nomi che conosce va dritto. Ma ogni
 * produzione li chiama a modo suo — i giri auto di un film erano
 * "IS_TL_16.04.2026.pdf", una transport list — e a ogni nome nuovo
 * l'ordine del giorno arrivava senza pick-up, o non arrivava.
 *
 * La via di mezzo: quando i nomi sono chiari non cambia niente. Quando
 * fra gli allegati c'e' un PDF che dal nome non si capisce, E manca
 * qualcosa che dovrebbe esserci (l'ordine del giorno, o i giri auto), i
 * PDF dubbi si fanno guardare al modello, che dice cosa sono dal
 * contenuto. Un ordine del giorno si riconosce da com'e' fatto, comunque
 * si chiami il file.
 *
 * Si accende con SMISTA = "si". La risposta si scrive accanto a ogni
 * allegato (genere, smistato) e da li' in poi vale quella: la leggono
 * l'ombra, il piano e chi scrive l'ordine del giorno (genereDi).
 * Se lo smistamento fallisce non succede niente: restano i nomi.
 */
import { db, firma, genereDalNome, daIgnorare } from './ombra.js';
import { segnaConsumo } from './consumi.js';

const MODELLO = 'claude-haiku-5-5';
const MASSIMO = 4;                    // quanti allegati dubbi si guardano
const PESO = 5000000;                 // e non piu' grandi di cosi'
const GENERI = ['odg', 'giri', 'stralci', 'pdl', 'altro'];

export const SMISTA_SYS = `Ti vengono dati alcuni allegati PDF arrivati per mail a una troupe cinematografica italiana, numerati. Per ognuno di' che cos'è, guardando il contenuto e non il nome del file.

odg: l'ordine del giorno (call sheet) di una giornata di riprese: data, convocazione, scene del giorno, cast, convocazione della troupe per reparti.
giri: la lista dei trasporti del giorno (giri auto, transport list, movement order): autisti, orari di pick-up, passeggeri, da dove a dove.
stralci: le pagine di sceneggiatura delle scene del giorno.
pdl: il piano di lavorazione (strip board): tutte le giornate di riprese con le loro scene, chiuse da righe "End of Day" o "Fine del giorno".
altro: qualunque altra cosa (day out of days, alloggi, memo, mappe, moduli, liste).

Rispondi SOLO con un array JSON, senza testo attorno: [{"n":1,"tipo":"odg"},{"n":2,"tipo":"altro"}]. Nel dubbio: "altro".`;

const si = (v) => String(v || '').toLowerCase() === 'si';

/* Il genere di un allegato: quello detto dallo smistamento, se c'e' stato;
   se no quello del nome. */
export function genereDi(a) {
  if (!a) return null;
  if (a.smistato) return GENERI.includes(a.genere) && a.genere !== 'altro' ? a.genere : null;
  return genereDalNome(a.nome);
}

/* Gli allegati che dal nome non si capiscono e che vale la pena guardare. */
export function dubbi(allegati) {
  return (allegati || []).filter(a => a && a.tenuto && a.percorso && !a.smistato
    && /\.pdf$/i.test(a.nome || '') && genereDalNome(a.nome) == null && !/stralc/i.test(a.nome)
    && !daIgnorare(a.nome) && (a.byte || 0) < PESO).slice(0, MASSIMO);
}

/* Serve smistare? Solo se c'e' un dubbio E manca qualcosa. */
export function daSmistare(env, allegati) {
  if (!si(env.SMISTA)) return false;
  const generi = (allegati || []).filter(a => a && a.tenuto).map(genereDi);
  return dubbi(allegati).length > 0 && (!generi.includes('odg') || !generi.includes('giri'));
}

/* Una mail che il server sa leggere per intero aspetta il server; se anche
   solo un pezzo tocca al telefono, va tutta al telefono (vedi posta.js).
   Torna true se questa mail, con questi allegati, tocca al server. */
export function toccaAlServer(env, allegati) {
  const generi = (allegati || []).filter(a => a && a.tenuto && a.percorso).map(genereDi);
  const haOdg = generi.includes('odg'), haPiano = generi.includes('pdl');
  const alTelefono = (haOdg && !si(env.OMBRA_SCRIVE)) || (haPiano && !si(env.PIANO_SCRIVE));
  return (haOdg || haPiano) && !alTelefono;
}

/* Guarda gli allegati dubbi e torna la lista degli allegati con il genere
   scritto accanto. Non lancia: se qualcosa va storto torna quella di prima. */
export async function smista(env, riga) {
  const allegati = riga.allegati || [];
  const incerti = dubbi(allegati);
  if (!incerti.length) return allegati;
  const modello = env.SMISTA_MODELLO || MODELLO;
  const inizio = Date.now();
  try {
    const contenuto = [];
    for (const [i, a] of incerti.entries()) contenuto.push(
      { type: 'text', text: `ALLEGATO ${i + 1}:` },
      { type: 'document', source: { type: 'url', url: await firma(env, a.percorso) } });
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modello, max_tokens: 300, system: SMISTA_SYS,
        messages: [{ role: 'user', content: contenuto }] })
    });
    const grezzo = await r.text();
    if (!r.ok) throw new Error('modello ' + r.status + ': ' + grezzo.slice(0, 200));
    const d = JSON.parse(grezzo);
    const testo = (d.content || []).filter(b => b && b.type === 'text').map(b => b.text || '').join('');
    const esito = JSON.parse(testo.slice(testo.indexOf('['), testo.lastIndexOf(']') + 1));
    const detto = new Map();
    for (const x of esito || []) {
      const a = incerti[(+x.n) - 1];
      if (a && GENERI.includes(x.tipo)) detto.set(a.percorso, x.tipo);
    }
    /* Un ordine del giorno, una lista di giri, un piano: se il nome ne
       indicava gia' uno, o il modello ne trova due, il secondo e' "altro".
       Due ordini del giorno nella stessa mail non si sa quale leggere. */
    const presi = new Set(allegati.filter(a => a && a.tenuto).map(a => genereDalNome(a.nome)).filter(Boolean));
    const nuovi = allegati.map(a => {
      if (!a || !detto.has(a.percorso)) return a;
      let g = detto.get(a.percorso);
      if (g !== 'altro' && g !== 'stralci') { if (presi.has(g)) g = 'altro'; else presi.add(g); }
      return { ...a, genere: g, smistato: true };
    });
    await db(env, `posta?id=eq.${riga.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ allegati: nuovi }) });
    await segnaConsumo(env, { origine: 'server', scopo: 'smistamento', project_id: riga.project_id, posta_id: riga.id,
      modello, usage: d.usage, ms: Date.now() - inizio, esito: d.stop_reason });
    console.log('smista:', JSON.stringify({ modello, ms: Date.now() - inizio,
      token_entrata: d.usage && d.usage.input_tokens, token_uscita: d.usage && d.usage.output_tokens,
      esito: nuovi.filter(a => a && a.smistato).map(a => a.nome + ' → ' + a.genere) }));
    return nuovi;
  } catch (e) {
    console.error('smista: non riuscito, restano i nomi —', String(e && e.message || e).slice(0, 200));
    return allegati;
  }
}
