/* ══ IL SERVER SCRIVE L'ORDINE DEL GIORNO ════════════════════════════════
 *
 * Fin qui l'ordine del giorno lo leggeva il primo telefono che apriva
 * l'app, e quello che leggeva lui valeva per tutta la troupe. Se leggeva
 * male, leggeva male per sessanta persone, e nessuno lo sapeva.
 *
 * Qui lo scrive il Worker, dalla lettura fatta appena arriva la mail
 * (ombra.js): una volta, uguale per tutti, prima che qualcuno apra
 * niente. I telefoni lo trovano dove hanno sempre trovato l'ordine del
 * giorno caricato da un collega — la tabella `odg` — e non analizzano.
 *
 * Si accende con OMBRA_SCRIVE = "si". Spento, questo file non viene mai
 * chiamato e tutto resta com'era.
 *
 * Come va, con l'interruttore acceso:
 *
 *   1. arriva la mail con un ordine del giorno. posta.js la salva con
 *      stato 'al server' invece di 'nuova': i telefoni prendono solo le
 *      'nuove', quindi aspettano. E NON parte la notifica — partirebbe
 *      prima che ci sia qualcosa da leggere;
 *   2. il cron legge (ombra.js) e chiama scriviTutto(): l'ordine del
 *      giorno nella tabella `odg`, la mail segnata 'fatta', e a ognuno la
 *      sua notifica con pick-up, convocazione e fine lavorazione;
 *   3. se la lettura non riesce, o non arriva in tempo, rilascia(): la
 *      mail torna 'nuova', parte la notifica di sempre e analizza il
 *      primo telefono, come prima. Nessuno resta senza ordine del giorno
 *      perche' il server ha avuto un problema.
 *
 * Una mail che porta anche il piano di lavorazione non passa di qui: il
 * piano lo sa leggere solo il telefono, e quella mail segue la strada
 * vecchia per intero (posta.js).
 */
import { avvisaPosta } from './push.js';
import { nomeCorrisponde, avvisiPer } from './avvisi.js';

export const ATTESA_MINUTI = 4;       // oltre, si rilascia e ci pensa il telefono

const ORA = /^\s*(\d{1,2})[.:,](\d{2})\s*$/;
const ora2 = (o) => { const m = ORA.exec(String(o || '')); return m ? String(+m[1]).padStart(2, '0') + '.' + m[2] : ''; };
const testo = (x) => String(x == null ? '' : x).trim();

function capi(env) {
  return { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
           'Content-Type': 'application/json' };
}
const base = (env) => env.SUPABASE_URL.replace(/\/+$/, '');

async function db(env, via, opz = {}) {
  const r = await fetch(`${base(env)}/rest/v1/${via}`, { ...opz, headers: { ...capi(env), ...(opz.headers || {}) } });
  if (!r.ok) throw new Error(`${via.split('?')[0]} -> ${r.status} ${await r.text().catch(() => '')}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

/* "6 6/8" -> 6.75. L'app tiene il totale delle pagine come numero. */
export function pagineNumero(s) {
  const m = /^\s*(?:(\d+)\s*)?(?:(\d+)\s*\/\s*(\d+))?\s*$/.exec(String(s || ''));
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const n = (+(m[1] || 0)) + (m[2] ? (+m[2]) / (+m[3] || 1) : 0);
  return n > 0 && n < 40 ? n : null;
}

function tipoDalNome(nome) {
  const n = String(nome || '').toLowerCase().replace(/[_-]/g, ' ');
  if (/stralc/.test(n)) return 'stralci';
  if (/giri|transport|trasport|movement/.test(n)) return 'giri';
  if (/\bodg\b|ordine\s*del\s*giorno|call\s*sheet/.test(n)) return 'odg';
  return null;
}

function scene(l) {
  return (Array.isArray(l) ? l : []).map(s => ({
    n: testo(s && s.n), ie: testo(s && s.ie), m: testo(s && s.m), ambiente: testo(s && s.ambiente),
    sinossi: testo(s && s.sinossi), ids: testo(s && s.ids), pag: testo(s && s.pag), nota: testo(s && s.nota)
  })).filter(s => s.n || s.nota);
}
function fabbisogni(l) {
  return (Array.isArray(l) ? l : []).map(f => ({
    reparto: testo(f && f.reparto),
    voci: (Array.isArray(f && f.voci) ? f.voci : [])
      .map(v => ({ scene: testo(v && v.scene), cosa: testo(v && v.cosa) })).filter(v => v.cosa)
  })).filter(f => f.reparto && f.voci.length);
}

/* Dalla lettura del Worker all'ordine del giorno come lo vuole l'app.
 *
 * I nomi dei campi sono gia' quelli dell'app; qui si mettono a posto le
 * forme. Funzione pura: e' quella che si prova passando il risultato alla
 * schermata vera.
 *
 * Tre cose che l'app aveva e qui non ci sono, apposta:
 *   - `testo` e `giriTesto`: il Worker non ha il testo dei PDF. L'app li
 *     usava per ricavare pick-up e luoghi; qui i luoghi arrivano gia'
 *     letti e il pick-up si ricava da `tratte`;
 *   - `stralci` e `sceneggiatura`: li costruisce il telefono dal PDF, la
 *     prima volta che servono;
 *   - `pickup`: e' di chi guarda, lo calcola ogni telefono per se'.
 */
export function datiPerApp(letto, riga, adesso) {
  const L = letto || {};
  const allegati = (riga && riga.allegati || []).filter(a => a && a.tenuto && a.percorso)
    .map(a => ({ nome: a.nome, tipo: tipoDalNome(a.nome), percorso: a.percorso, file: null }));
  const odg = allegati.find(a => a.tipo === 'odg');
  const d = {
    daServer: true,
    numero: testo(L.numero), data: testo(L.data),
    convocazione: ora2(L.convocazione), prontiAGirare: ora2(L.prontiAGirare),
    pausa: testo(L.pausa), catering: ora2(L.catering), cestini: testo(L.cestini),
    fineRiprese: ora2(L.fineRiprese), fineLavorazione: ora2(L.fineLavorazione),
    ambiente: testo(L.ambiente), meteo: testo(L.meteo), ospedale: testo(L.ospedale),
    dawn: ora2(L.dawn), alba: ora2(L.alba), tramonto: ora2(L.tramonto), dusk: ora2(L.dusk),
    luoghi: (Array.isArray(L.luoghi) ? L.luoghi : [])
      .filter(l => l && /^https?:\/\//.test(testo(l.url)) && testo(l.nome))
      .map(l => ({ nome: testo(l.nome), url: testo(l.url), indirizzo: testo(l.indirizzo) })),
    contatti: (Array.isArray(L.contatti) ? L.contatti : [])
      .map(c => ({ nome: testo(c && c.nome), ruolo: testo(c && c.ruolo), tel: testo(c && c.tel).replace(/[^\d+]/g, '') }))
      .filter(c => c.nome && c.tel),
    scene: scene(L.scene),
    domani: L.domani && Array.isArray(L.domani.scene) && (L.domani.scene.length || testo(L.domani.etichetta))
      ? { etichetta: testo(L.domani.etichetta), scene: scene(L.domani.scene), fabbisogni: fabbisogni(L.domani.fabbisogni) }
      : null,
    fabbisogni: fabbisogni(L.fabbisogni),
    cast: (Array.isArray(L.cast) ? L.cast : []).map(c => {
      const pulito = (o) => { const v = testo(o); return /^-+$/.test(v) ? '' : (ora2(v) || v); };
      return { id: testo(c && c.id), ruolo: testo(c && c.ruolo), interprete: testo(c && c.interprete),
               scene: testo(c && c.scene), pickup: pulito(c && c.pickup), set: pulito(c && c.set) };
    }).filter(c => c.ruolo || c.interprete),
    troupe: (Array.isArray(L.troupe) ? L.troupe : []).map(r => {
      const v = (o) => ora2(o) || testo(o);
      return { reparto: testo(r && r.reparto), ruolo: testo(r && r.ruolo), nome: testo(r && r.nome),
               partenza: v(r && r.partenza), set: v(r && r.set) };
    }).filter(r => r.nome || r.ruolo),
    /* I viaggi con il nome che l'app da' ai passeggeri: `nomi`. */
    tratte: (Array.isArray(L.tratte) ? L.tratte : []).map(t => ({
      autista: testo(t && t.autista).replace(/\s+(Van|Auto|Minivan|Pulmino)$/i, ''),
      tel: testo(t && t.tel).replace(/[^\d+]/g, ''),
      partenza: ora2(t && t.partenza), arrivo: ora2(t && t.arrivo),
      luogo: testo(t && t.luogo), indirizzo: testo(t && t.indirizzo), destinazione: testo(t && t.destinazione),
      nomi: (Array.isArray(t && t.passeggeri) ? t.passeggeri : []).map(testo).filter(Boolean),
      nota: testo(t && t.nota)
    })).filter(t => t.nomi.length),
    allegati,
    percorso: odg ? odg.percorso : null,
    file: null,
    caricatoIl: new Date(adesso || Date.now()).toISOString()
  };
  const pag = pagineNumero(L.pagine);
  if (pag) d.pagine = pag;
  return d;
}

/* Abbastanza per mostrarlo? Senza data non si sa nemmeno di che giorno
   e', e senza convocazione o senza troupe e' un foglio non letto: meglio
   rilasciare e lasciar fare al telefono. */
export function leggibile(d) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.data)) return 'manca la data';
  if (!d.convocazione) return 'manca la convocazione';
  if (!d.troupe.length) return 'manca la troupe';
  return null;
}

const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
              'settembre', 'ottobre', 'novembre', 'dicembre'];
export function dataEstesa(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const g = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${GIORNI[g.getUTCDay()]} ${+m[3]} ${MESI[+m[2] - 1]}`;
}

/* "TURSPORT HOTEL RESIDENCE" -> "Tursport Hotel Residence", e corto: sta
   su una riga di notifica insieme all'ora. */
function posto(s) {
  const p = testo(s).toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return p.length > 26 ? p.slice(0, 25).trim() + '…' : p;
}

/* La convocazione di una persona, dalla sua riga nella troupe. E' la
   stessa regola dell'app (odgOreDi): le colonne sono due ma l'orario e'
   quasi sempre uno solo, e chi legge lo mette ora in una ora nell'altra —
   provato su dodici fogli, in quattro era sotto "partenza". Un orario
   solo, dovunque sia, e' la convocazione. Due righe che combaciano sono
   due omonimi: si resta sulla generale. */
export function convocazioneDi(d, membro) {
  const mie = (d.troupe || []).filter(r => membro && membro.cognome && nomeCorrisponde(r.nome, membro));
  if (mie.length !== 1) return d.convocazione || '';
  return ora2(mie[0].set) || ora2(mie[0].partenza) || d.convocazione || '';
}

/* La notifica dell'ordine del giorno arrivato, una per persona:
 *
 *   OdG 25 · sabato 14 novembre
 *   Pick-up 12.00 · Tursport Hotel Residence
 *   Convocazione 12.30 · Fine lavorazione 19.30
 *
 * Fine LAVORAZIONE, non fine riprese: e' quando si chiudono i camion.
 */
export function notificaOdg(d, membro, pickup) {
  const righe = [`OdG ${d.numero || '—'} · ${dataEstesa(d.data)}`.replace(/ · $/, '')];
  if (pickup && pickup.ora) righe.push(['Pick-up ' + pickup.ora, posto(pickup.luogo)].filter(Boolean).join(' · '));
  const conv = convocazioneDi(d, membro);
  const sotto = [conv ? 'Convocazione ' + conv : '', d.fineLavorazione ? 'Fine lavorazione ' + d.fineLavorazione : '']
    .filter(Boolean).join(' · ');
  if (sotto) righe.push(sotto);
  return righe.join('\n');
}

/* Tutto quello che succede quando la lettura e' riuscita.
   Torna un riepilogo; lancia se non riesce a scrivere l'ordine del
   giorno — e allora chi chiama rilascia. */
export async function scriviTutto(env, riga, letto, opz = {}) {
  const adesso = opz.adesso || Date.now();
  const d = datiPerApp(letto, riga, adesso);
  const manca = leggibile(d);
  if (manca) throw new Error('lettura insufficiente: ' + manca);

  const film = (await db(env, `projects?select=user_id,titolo&id=eq.${riga.project_id}&limit=1`) || [])[0];
  if (!film || !film.user_id) throw new Error('film senza proprietario');

  // 1. L'ordine del giorno, dove i telefoni lo cercano.
  await db(env, 'odg?on_conflict=project_id,data', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: film.user_id, project_id: riga.project_id, film: film.titolo || '',
      data: d.data, numero: /^\d+$/.test(d.numero) ? +d.numero : null, dati: d,
      updated_at: new Date(adesso).toISOString() })
  });

  // 2. La mail e' a posto: i telefoni non devono piu' analizzarla.
  await db(env, `posta?id=eq.${riga.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ stato: 'fatta', nota: 'letta dal server' }) });

  // 3. Le notifiche. Da qui in poi niente deve far tornare indietro: l'ordine
  //    del giorno e' scritto, e un avviso mancato non lo rende meno vero.
  let notifiche = 0, avvisi = 0, errore = null;
  try {
    const mm = await db(env, `film_membri?select=user_id&project_id=eq.${riga.project_id}`);
    const ids = [...new Set((mm || []).map(x => x.user_id).filter(Boolean))];
    if (ids.length) {
      const pp = await db(env, `profiles?select=id,nome,cognome&id=in.(${ids.join(',')})`);
      const perId = new Map((pp || []).map(p => [p.id, p]));
      const membri = ids.map(id => ({ user_id: id, nome: (perId.get(id) || {}).nome || '',
                                      cognome: (perId.get(id) || {}).cognome || '' }));
      // Lo stesso calcolo degli avvisi: un solo posto decide di chi e' un pick-up.
      const lettoPerAvvisi = { data: d.data, catering: d.catering, cestini: d.cestini,
        tratte: d.tratte.map(t => ({ ...t, passeggeri: t.nomi })) };
      const { righe, chi } = avvisiPer(lettoPerAvvisi, membri, adesso);
      const pickDi = new Map(chi.filter(c => c.pickup).map(c => [c.user_id, { ora: c.pickup, luogo: c.luogo }]));
      const minuto = new Date(adesso).toISOString();
      const tutte = membri.map(m => ({
        user_id: m.user_id, project_id: riga.project_id, quando: minuto, genere: 'posta',
        testo: notificaOdg(d, m, pickDi.get(m.user_id)),
        chiave: `${m.user_id}:posta:${minuto.slice(0, 16)}`, mandato: null, mostrato: null
      })).concat(righe.map(x => ({
        user_id: x.user_id, project_id: riga.project_id, quando: x.quando, genere: x.genere, testo: x.testo,
        chiave: `${x.user_id}:${x.genere}:${x.giorno}`, mandato: null, mostrato: null })));
      await db(env, 'push_appuntamenti?on_conflict=chiave', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(tutte) });
      notifiche = membri.length; avvisi = righe.length;
    }
  } catch (e) { errore = String(e && e.message || e).slice(0, 200); }

  return { scritto: true, data: d.data, notifiche, avvisi, errore };
}

/* La strada vecchia: la mail torna 'nuova', parte la notifica di sempre,
   e il primo telefono che apre analizza. Si scrive solo se la mail e'
   ancora 'al server', cosi' due passaggi del cron non la rilasciano due
   volte e non partono due notifiche. */
export async function rilascia(env, riga, motivo) {
  const prese = await db(env, `posta?id=eq.${riga.id}&stato=eq.al%20server`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ stato: 'nuova', nota: ('il server non ha letto: ' + (motivo || '')).slice(0, 300) })
  });
  if (!prese || !prese.length) return false;
  try {
    const nomi = (riga.allegati || []).filter(a => a && a.tenuto).map(a => a.nome).join(' ').toLowerCase();
    await avvisaPosta(env, riga.project_id, /\bodg\b|ordine|call.?sheet/.test(nomi.replace(/[_-]/g, ' ')) ? ['odg'] : [], riga.oggetto);
  } catch (e) { console.error('scrive: avviso di riserva non partito', e.message); }
  console.log('scrive: rilasciata al telefono —', motivo);
  return true;
}

/* A ogni passaggio del cron: le mail rimaste 'al server' troppo a lungo
   si rilasciano. Copre il caso in cui la lettura non parte proprio, o si
   ferma a meta'. */
export async function rilasciaInRitardo(env, adesso) {
  const limite = new Date((adesso || Date.now()) - ATTESA_MINUTI * 60000).toISOString();
  const righe = await db(env, 'posta?select=id,project_id,oggetto,allegati&stato=eq.al%20server'
    + `&ricevuta=lt.${encodeURIComponent(limite)}&limit=5`);
  let n = 0;
  for (const r of righe || []) if (await rilascia(env, r, `passati ${ATTESA_MINUTI} minuti`)) n++;
  return n;
}
