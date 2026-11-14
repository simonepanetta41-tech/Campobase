/* ══ GLI AVVISI DI PICK-UP E CATERING, DAL SERVER ═══════════════════════
 *
 * Fin qui questi due avvisi li creava il telefono, nel momento in cui
 * apriva l'ordine del giorno. Chi la sera non apriva l'app, la mattina
 * dopo non riceveva niente: ne' "il driver e' li' fra dieci minuti" ne'
 * il catering. E' successo davvero — due colleghi sullo stesso van, a uno
 * la notifica arriva e all'altro no.
 *
 * Qui gli avvisi nascono dalla lettura in ombra (ombra.js), appena
 * arriva la mail, per tutti i membri del film. Nessuno deve aprire
 * niente.
 *
 * Tre scelte.
 *
 *   La chiave e' la stessa che usa il telefono (utente:genere:giorno).
 *   Quindi non si raddoppia mai: se poi il telefono apre l'ordine del
 *   giorno e registra il suo avviso, riscrive questa riga, non ne
 *   aggiunge una. E il testo e' lo stesso, parola per parola.
 *
 *   Un pick-up sbagliato e' peggio di nessun pick-up. Se un nome dei
 *   giri auto puo' essere di due membri diversi, non si avvisa nessuno
 *   dei due: resta l'app, dove ognuno vede il suo.
 *
 *   Parte spento. Senza la variabile OMBRA_AVVISI = "si" il Worker
 *   calcola gli avvisi e li scrive accanto alla lettura (ombra->'avvisi')
 *   senza crearli: cosi' si vede cosa farebbe, su una mail vera, prima di
 *   lasciarglielo fare.
 */

const PRIMA = { pickup: 10, catering: 15 };      // minuti, come nell'app

/* Il confronto dei nomi e' quello dell'app (index.html, nomeCorrisponde):
   cognome intero, e il nome o la sua iniziale. "F.Lonardo" e "A.Lonardo"
   si distinguono da soli. */
export function nomeParole(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[.'`’]/g, ' ')
    .split(/[^a-z0-9]+/).filter(Boolean);
}
export function nomeCorrisponde(stampato, p) {
  const t = nomeParole(stampato);
  if (!t.length) return false;
  const cog = nomeParole(p.cognome), nom = nomeParole(p.nome);
  if (!cog.length) return false;
  if (!cog.every(c => t.includes(c))) return false;
  if (!nom.length) return true;
  const n = nom[0];
  return t.includes(n) || t.includes(n[0]);
}

const ORA = /^\s*(\d{1,2})[.:](\d{2})\s*$/;
function minuti(o) { const m = ORA.exec(String(o || '')); return m ? +m[1] * 60 + +m[2] : Infinity; }
function ora2(o) { const m = ORA.exec(String(o || '')); return m ? String(+m[1]).padStart(2, '0') + '.' + m[2] : ''; }
function cap(s) { s = String(s || ''); return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''; }

/* Da un'ora scritta sull'ordine del giorno a un istante vero.
 *
 * L'app lo fa con l'orologio del telefono, che e' in Italia. Il Worker
 * non ha un fuso: gira in UTC. Quindi l'ora del foglio si legge come ora
 * di Roma, con l'ora legale di quel giorno — d'estate sono due ore di
 * scarto e d'inverno una, e sbagliarle vuol dire avvisare un'ora dopo.
 */
export function romaIstante(data, ora, meno) {
  const m = ORA.exec(String(ora || ''));
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(data || ''));
  if (!m || !d) return null;
  const finto = Date.UTC(+d[1], +d[2] - 1, +d[3], +m[1], +m[2]);       // come se Roma fosse UTC
  const scarto = (t) => {
    const p = {};
    for (const x of new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(t))) p[x.type] = +x.value;
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  let t = finto - scarto(finto);
  t = finto - scarto(t);                 // una seconda volta, per il giorno in cui cambia l'ora
  const q = new Date(t - (meno || 0) * 60000);
  return isNaN(q) ? null : q;
}

/* Cosa va detto a chi. Funzione pura: dati dentro, righe fuori.
 *   letto   quello che ha letto l'ombra
 *   membri  [{ user_id, nome, cognome }]
 * Torna { righe, chi }: le righe sono pronte per push_appuntamenti, `chi`
 * e' il riepilogo leggibile, uno per membro.
 */
export function avvisiPer(letto, membri, adesso) {
  const ora = adesso || Date.now();
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(letto && letto.data || '')) ? letto.data : null;
  const righe = [], chi = [];
  if (!data) return { righe, chi, motivo: 'la lettura non ha una data' };

  const tratte = (letto.tratte || []).filter(t => t && ora2(t.partenza) && (t.passeggeri || []).length);

  /* Un nome dei giri auto che corrisponde a due membri non si sa di chi
     e': quei membri restano senza pick-up dal server. */
  const dubbi = new Set();
  for (const t of tratte) for (const p of t.passeggeri) {
    const suoi = membri.filter(m => m.cognome && nomeCorrisponde(p, m));
    if (suoi.length > 1) suoi.forEach(m => dubbi.add(m.user_id));
  }

  const catering = ora2(letto.catering);
  for (const m of membri) {
    const voce = { user_id: m.user_id, nome: [m.nome, m.cognome].filter(Boolean).join(' ') || null,
                   pickup: null, catering: null, nota: null };
    if (!m.cognome) voce.nota = 'profilo senza cognome';
    else if (dubbi.has(m.user_id)) voce.nota = 'nome che combacia con due membri';
    else {
      const mie = tratte.filter(t => t.passeggeri.some(p => nomeCorrisponde(p, m)));
      if (mie.length) {
        // L'andata e il rientro portano lo stesso nome: vale la piu' presto.
        const mia = [...mie].sort((a, b) => minuti(a.partenza) - minuti(b.partenza))[0];
        const pick = ora2(mia.partenza);
        const q = romaIstante(data, pick, PRIMA.pickup);
        const autista = String(mia.autista || '').trim().split(/\s+/)[0] || null;
        const dove = mia.luogo || mia.indirizzo || '';
        voce.pickup = pick;
        if (q && q.getTime() > ora) righe.push({
          user_id: m.user_id, quando: q.toISOString(), giorno: data, genere: 'pickup',
          testo: (autista ? `${autista} è lì fra 10 minuti per il pick up!`
                          : 'Il tuo driver è lì fra 10 minuti per il pick up!')
                 + '\n' + ['Pick up alle ' + pick, cap(dove)].filter(Boolean).join(' · ')
        });
        else voce.nota = 'pick-up già passato';
      } else voce.nota = 'non è nei giri auto';
    }
    if (catering) {
      const q = romaIstante(data, catering, PRIMA.catering);
      voce.catering = catering;
      if (q && q.getTime() > ora) righe.push({
        user_id: m.user_id, quando: q.toISOString(), giorno: data, genere: 'catering',
        testo: 'Catering pronto fra 15 minuti!\nPronto alle ' + catering
               + (letto.cestini ? ` · ${letto.cestini} cestini` : '')
      });
    }
    chi.push(voce);
  }
  return { righe, chi };
}

/* Legge i membri, calcola e — se `scrivi` — crea gli avvisi. Torna il
   riepilogo da mettere accanto alla lettura. Non lancia: qualunque guasto
   diventa una riga di riepilogo, perche' la lettura in ombra che lo
   chiama deve comunque salvarsi. */
export async function avvisiDalServer(env, projectId, letto, opz = {}) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const capi = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
                 'Content-Type': 'application/json' };
  const leggi = async (via) => {
    const r = await fetch(`${base}/rest/v1/${via}`, { headers: capi });
    if (!r.ok) throw new Error(`${via.split('?')[0]} -> ${r.status}`);
    return r.json();
  };
  try {
    const mm = await leggi(`film_membri?select=user_id&project_id=eq.${projectId}`);
    const ids = [...new Set((mm || []).map(x => x.user_id).filter(Boolean))];
    if (!ids.length) return { creati: 0, acceso: !!opz.scrivi, chi: [], motivo: 'il film non ha membri' };
    const pp = await leggi(`profiles?select=id,nome,cognome&id=in.(${ids.join(',')})`);
    const perId = new Map((pp || []).map(p => [p.id, p]));
    const membri = ids.map(id => ({ user_id: id, nome: (perId.get(id) || {}).nome || '',
                                    cognome: (perId.get(id) || {}).cognome || '' }));

    const { righe, chi, motivo } = avvisiPer(letto, membri, opz.adesso);
    let creati = 0;
    if (opz.scrivi && righe.length) {
      const r = await fetch(`${base}/rest/v1/push_appuntamenti?on_conflict=chiave`, {
        method: 'POST', headers: { ...capi, Prefer: 'resolution=merge-duplicates' },
        /* Come fa l'app: riscrivere la chiave azzera `mandato`, cosi' un
           pick-up spostato si riavvisa all'ora nuova. */
        body: JSON.stringify(righe.map(x => ({
          user_id: x.user_id, project_id: projectId, quando: x.quando, genere: x.genere, testo: x.testo,
          chiave: `${x.user_id}:${x.genere}:${x.giorno}`, mandato: null, mostrato: null })))
      });
      if (!r.ok) throw new Error('push_appuntamenti -> ' + r.status + ' ' + await r.text().catch(() => ''));
      creati = righe.length;
    }
    // Nel riepilogo non serve l'id: basta il nome, e la riga pesa meno.
    return { creati, calcolati: righe.length, acceso: !!opz.scrivi, motivo: motivo || null,
             chi: chi.map(c => ({ nome: c.nome, pickup: c.pickup, catering: c.catering, nota: c.nota })) };
  } catch (e) {
    return { creati: 0, acceso: !!opz.scrivi, errore: String(e && e.message || e).slice(0, 300) };
  }
}
