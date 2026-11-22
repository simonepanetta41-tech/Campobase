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
import { genereDalNome } from './ombra.js';
import { genereDi } from './smista.js';

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

/* Il tipo di un allegato come lo vuole l'app. Vale quello detto dallo
   smistamento (smista.js), se c'e' stato; se no il nome. */
function tipoDi(a) {
  if (a && a.smistato) return ['odg', 'giri', 'stralci'].includes(a.genere) ? a.genere : null;
  const n = String(a && a.nome || '').toLowerCase().replace(/[_-]/g, ' ');
  if (/stralc/.test(n)) return 'stralci';
  const g = genereDalNome(a && a.nome);
  return g === 'giri' || g === 'odg' ? g : null;
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
    .map(a => ({ nome: a.nome, tipo: tipoDi(a), percorso: a.percorso, file: null }));
  const odg = allegati.find(a => a.tipo === 'odg');
  const d = {
    daServer: true,
    mail: riga && riga.id || null,          // da quale mail viene: serve a riconoscere un'errata
    numero: testo(L.numero), data: testo(L.data),
    convocazione: ora2(L.convocazione), prontiAGirare: ora2(L.prontiAGirare),
    pausa: testo(L.pausa), catering: ora2(L.catering), cestini: testo(L.cestini),
    fineRiprese: ora2(L.fineRiprese), fineLavorazione: ora2(L.fineLavorazione),
    ambiente: testo(L.ambiente), meteo: testo(L.meteo), ospedale: testo(L.ospedale),
    dawn: ora2(L.dawn), alba: ora2(L.alba), tramonto: ora2(L.tramonto), dusk: ora2(L.dusk),
    luoghi: (Array.isArray(L.luoghi) ? L.luoghi : [])
      /* Un posto vale se ha un link o qualcosa di scritto accanto: molti
         fogli (Missione San Gennaro) non mettono link, scrivono
         l'indirizzo. Senza quelli l'app non sa dove si gira, e non da'
         ne' la mappa ne' il meteo. Un link che non e' un link si butta,
         il posto resta. */
      .map(l => ({ nome: testo(l && l.nome), url: linkVero(l && l.url),
                   indirizzo: testo(l && l.indirizzo) }))
      .filter(l => l.nome && (l.url || l.indirizzo)),
    avvisi: avvisiDallaMail(L.avvisi, riga && riga.testo)
      .filter(a => !indicazioniDallaMail(L.indicazioni, riga && riga.testo).some(p => p.testo.includes(a) || a.includes(p.testo))),
    indicazioni: indicazioniDallaMail(L.indicazioni, riga && riga.testo),
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
/* Il link di un posto vale se indica un punto. Una ricerca
   ("…/maps/search/?query=SET") non lo indica: il 21 novembre il set
   portava a un'azienda di nome Set. Meglio nessun link: l'app cerca
   l'indirizzo, che c'e'. */
export function linkVero(u) {
  const t = testo(u);
  if (!/^https?:\/\//i.test(t)) return '';
  if (/google\.[a-z.]+\/(maps\/)?search/i.test(t)) return '';
  if (/[?&](q|query)=/i.test(t) && !/[?&]q=-?\d+\.\d+,-?\d+\.\d+/.test(t)) return '';
  return t;
}

/* Gli avvisi della produzione, dal testo della mail.
 *
 * Il modello li copia, e qui si controlla che li abbia copiati davvero:
 * un avviso resta solo se sta, parola per parola, nel testo della mail.
 * Un avviso inventato o riassunto, messo sotto il titolo "Dalla
 * produzione", sarebbe una frase che la produzione non ha mai scritto.
 * Si confronta a spazi e a capo pareggiati, e senza i ">" delle mail
 * inoltrate.
 */
export function avvisiDallaMail(avvisi, corpo) {
  const piatto = s => String(s || '').replace(/^[ \t]*>+ ?/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const mail = piatto(corpo);
  if (!mail || !Array.isArray(avvisi)) return [];
  const out = [];
  for (const a of avvisi) {
    const t = String(a || '').replace(/\s+/g, ' ').trim();
    if (t.length < 12 || t.length > 700) continue;
    if (!mail.includes(piatto(t))) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

/* Come arrivare al set, dal testo della mail.
 *
 * Non c'e' una forma fissa: a passi, in elenco, tutto a parole. Il modello
 * divide in passi; qui si tiene di ogni passo solo quello che sta, parola
 * per parola, nella mail. Vale ancora di piu' per i link: un link copiato
 * con un carattere sbagliato porta la troupe da un'altra parte, e allora
 * si toglie il link e si lascia il testo. Meglio un passo senza mappa che
 * una mappa sbagliata.
 */
export function indicazioniDallaMail(passi, corpo) {
  const semplice = s => String(s || '').replace(/^[ \t]*>+ ?/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const mail = semplice(corpo), grezzo = String(corpo || '');
  if (!mail || !Array.isArray(passi)) return [];
  const out = [];
  for (const p of passi) {
    const t = String(p && p.testo || '').replace(/\s+/g, ' ').trim();
    if (t.length < 10 || t.length > 900 || !mail.includes(semplice(t))) continue;
    if (out.some(x => x.testo === t)) continue;
    const l = String(p && p.link || '').trim();
    out.push({ testo: t, link: /^https?:\/\/\S+$/.test(l) && grezzo.includes(l) ? l : '' });
    if (out.length >= 10) break;
  }
  return out;
}

/* ── L'errata corrige ────────────────────────────────────────────────────
 *
 * Di rado la produzione rimanda l'ordine del giorno corretto, con
 * "errata corrige" nell'oggetto o nel testo e una o due righe che dicono
 * cosa cambia. Il foglio nuovo c'e' sempre, quindi orari e avvisi sono
 * comunque quelli giusti; quello che mancava era dirlo: la notifica era
 * identica alla prima e nessuno capiva che qualcosa era cambiato.
 */
const piatto = s => String(s || '').replace(/^[ \t]*>+ ?/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();

/* E' un'errata? Lo dice la produzione, oppure e' un secondo foglio per un
   giorno che ne ha gia' uno, arrivato con un'altra mail. La stessa mail
   riletta (un secondo tentativo del server) non lo e'. */
export function tipoErrata(riga, vecchio, adesso) {
  const scritto = [riga && riga.oggetto, riga && riga.testo]
    .concat((riga && riga.allegati || []).map(a => a && a.nome)).join(' ');
  if (/errata[\s_-]*corrige/i.test(scritto)) return 'errata';
  if (!vecchio) return null;
  if (vecchio.mail) return vecchio.mail !== (riga && riga.id) ? 'aggiornato' : null;
  // Un foglio scritto prima che si tenesse il numero della mail: vale l'eta'.
  const eta = (adesso || Date.now()) - new Date(vecchio.caricatoIl || 0).getTime();
  return eta > 15 * 60000 ? 'aggiornato' : null;
}

/* Le righe che dicono cosa cambia.
 *
 * Il modello le copia; qui restano solo quelle che stanno davvero nel
 * testo dell'errata e che NON c'erano nelle mail di prima: l'errata ripete
 * quasi tutta la mail normale (il set, le colazioni), e quella parte non
 * e' una correzione. Se il modello non ne da' nessuna buona, si prendono
 * dal testo: la riga che dice "errata corrige" e quelle subito sotto,
 * finche' non ricomincia la parte gia' vista.
 */
export function righeErrata(dalModello, corpo, corpiPrima) {
  const mail = piatto(corpo), prima = piatto((corpiPrima || []).join('\n'));
  if (!mail) return [];
  const pulita = r => String(r || '').replace(/\s+/g, ' ').replace(/^[-–•*]\s*/, '').trim();
  const nuova = r => { const p = piatto(r); return p.length >= 8 && mail.includes(p) && !(prima && prima.includes(p)); };
  let out = [];
  for (const r of Array.isArray(dalModello) ? dalModello : []) {
    const t = pulita(r);
    if (t.length <= 400 && nuova(t) && !out.includes(t)) out.push(t);
  }
  if (!out.length) {
    const righe = String(corpo || '').replace(/^[ \t]*>+ ?/gm, '').split(/\r?\n/).map(x => x.trim());
    const i = righe.findIndex(x => /errata\s*corrige/i.test(x));
    if (i >= 0) {
      for (let k = i; k < righe.length && out.length < 6; k++) {
        if (!righe[k]) { if (k > i) break; continue; }
        const t = pulita(righe[k]);
        if (k > i && (!nuova(t) || /^(grazie|a domani|a presto|un saluto|saluti|cordial|buon lavoro|buona serata|--)/i.test(t))) break;
        if (t.length <= 400) out.push(t);
      }
      // "inviamo in allegato l'ODG #7 – ERRATA CORRIGE:" annuncia, non dice
      // cosa cambia: se sotto c'e' altro, si lascia fuori.
      if (out.length > 1 && /errata\s*corrige\s*:?$/i.test(out[0])) out.shift();
    }
  }
  return out.slice(0, 6);
}

/* Cosa cambia per ognuno, calcolato qui e non letto da nessuna parte: gli
   orari di tutti, e la convocazione e il pick-up di quella persona. */
export function cambiPer(vecchio, nuovo, membri, adesso) {
  if (!vecchio) return {};
  const pick = d => new Map(avvisiPer({ data: d.data, catering: d.catering, cestini: d.cestini,
      tratte: (d.tratte || []).map(t => ({ ...t, passeggeri: t.nomi || t.passeggeri || [] })) }, membri, adesso)
    .chi.map(c => [c.user_id, c.pickup || '']));
  const pv = pick(vecchio), pn = pick(nuovo), out = {};
  const comuni = [['Pronti a girare', 'prontiAGirare'], ['Catering', 'catering'],
                  ['Fine riprese', 'fineRiprese'], ['Fine lavorazione', 'fineLavorazione']]
    .map(([nome, k]) => [nome, testo(vecchio[k]), testo(nuovo[k])]).filter(x => x[1] !== x[2]);
  for (const m of membri) {
    const righe = [];
    const cv = convocazioneDi(vecchio, m), cn = convocazioneDi(nuovo, m);
    if (cv !== cn) righe.push(['Convocazione', cv, cn]);
    const a = pv.get(m.user_id) || '', b = pn.get(m.user_id) || '';
    if (a !== b) righe.push(['Pick-up', a, b]);
    righe.push(...comuni);
    if (righe.length) out[m.user_id] = righe.map(([n, x, y]) => [n, x || '—', y || '—']);
  }
  return out;
}

/* La notifica dell'errata: il titolo lo dice, poi cosa cambia, poi gli
   orari della persona come sempre. */
export function notificaErrata(d, membro, pickup, tipo, righe) {
  const base = notificaOdg(d, membro, pickup).split('\n');
  base[0] = (tipo === 'errata' ? 'Errata corrige - ' : 'Aggiornato - ')
    + `OdG ${d.numero || '—'} - ${dataEstesa(d.data)}`.replace(/ - $/, '');
  const cosa = righe && righe[0] ? (righe[0].length > 90 ? righe[0].slice(0, 89).trim() + '…' : righe[0]) : '';
  return [base[0], cosa, ...base.slice(1)].filter(Boolean).join('\n');
}

/* La sigla del film, com'e' scritta davanti ai file e nell'oggetto:
   "MSG - ODG 26 del 17.11.2026", "MSG_PDL7_03.11.pdf", "I: IS_ODG 12". */
export function siglaDa(riga) {
  const voci = [riga && riga.oggetto].concat((riga && riga.allegati || []).map(a => a && a.nome));
  for (const v of voci) {
    const t = String(v || '').replace(/^(\s*(i|r|re|fw|fwd|inoltra)\s*:\s*)+/i, '').replace(/_/g, ' ').trim();
    const m = /^([A-Za-z][A-Za-z0-9]{1,5})\s*[-–\s]\s*(?:errata\s+corrige\s*[-–\s]*)?(?:o\.?d\.?g|pdl|p\.d\.l)(?![a-z])/i.exec(t);
    if (!m) continue;
    const s = m[1].toUpperCase();
    if (!/^(ODG|PDL|ERRATA|NUOVO|BOZZA|DAY|DEL|IL|LA)$/.test(s)) return s;
  }
  return null;
}

export async function scriviTutto(env, riga, letto, opz = {}) {
  const adesso = opz.adesso || Date.now();
  const d = datiPerApp(letto, riga, adesso);
  const manca = leggibile(d);
  if (manca) throw new Error('lettura insufficiente: ' + manca);
  // L'indice degli stralci (stralci.js): scena → pagina, per l'app.
  if (opz.stralciIndice && opz.stralciIndice.length) d.stralciIndice = opz.stralciIndice;

  const film = (await db(env, `projects?select=user_id,titolo&id=eq.${riga.project_id}&limit=1`) || [])[0];
  if (!film || !film.user_id) throw new Error('film senza proprietario');

  /* E' un'errata? Si guarda il foglio che c'e' gia' per quel giorno, prima
     di scriverci sopra. Niente di questo deve fermare la scrittura. */
  let vecchio = null, tipo = null, righeE = [];
  try {
    const c = await db(env, `odg?select=dati&project_id=eq.${riga.project_id}&data=eq.${d.data}&limit=1`);
    vecchio = c && c[0] && c[0].dati || null;
    tipo = tipoErrata(riga, vecchio, adesso);
    if (tipo) {
      const pp = await db(env, `posta?select=testo&project_id=eq.${riga.project_id}&id=neq.${riga.id}` +
        `&order=ricevuta.desc&limit=5`);
      righeE = righeErrata(letto && letto.errata, riga.testo, (pp || []).map(x => x.testo));
      // Quello che sta nell'errata non si ripete in fondo, fra gli avvisi.
      d.avvisi = (d.avvisi || []).filter(a => !righeE.some(r => piatto(a).includes(piatto(r)) || piatto(r).includes(piatto(a))));
    }
    if (vecchio && Array.isArray(vecchio.errata)) d.errata = vecchio.errata.slice(-4);
  } catch (e) { console.log('[scrive] errata non riconosciuta:', e && e.message); }

  // La sigla del film, se la mail la porta e non la sappiamo ancora.
  try {
    const sigla = siglaDa(riga);
    if (sigla) await db(env, `projects?id=eq.${riga.project_id}&sigla=is.null`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ sigla }) });
  } catch (_) { /* la colonna non c'e' ancora: si usano le iniziali */ }

  /* La troupe serve gia' qui: l'errata porta con se' cosa cambia per
     ognuno, e va scritta insieme al foglio. */
  let membri = [];
  try {
    const mm = await db(env, `film_membri?select=user_id&project_id=eq.${riga.project_id}`);
    const ids = [...new Set((mm || []).map(x => x.user_id).filter(Boolean))];
    if (ids.length) {
      const pp = await db(env, `profiles?select=id,nome,cognome&id=in.(${ids.join(',')})`);
      const perId = new Map((pp || []).map(p => [p.id, p]));
      membri = ids.map(id => ({ user_id: id, nome: (perId.get(id) || {}).nome || '',
                                cognome: (perId.get(id) || {}).cognome || '' }));
    }
  } catch (e) { console.log('[scrive] troupe non letta:', e && e.message); }
  if (tipo) {
    let perChi = {};
    // Solo fra due fogli letti qui: uno letto dal telefono ha un'altra forma,
    // e confrontarli darebbe differenze che non esistono.
    try { if (vecchio && vecchio.daServer) perChi = cambiPer(vecchio, d, membri, adesso); } catch (_) {}
    /* La stessa errata riletta a mano non si aggiunge una seconda volta:
       nel foglio c'e' gia', e il riquadro giallo la mostrerebbe doppia. */
    const giaDetta = opz.rilettura && vecchio && vecchio.mail === riga.id && Array.isArray(vecchio.errata) && vecchio.errata.length;
    if (!giaDetta) d.errata = (d.errata || []).concat([{ quando: new Date(adesso).toISOString(), tipo, righe: righeE, perChi }]);
  }

  // 1. L'ordine del giorno, dove i telefoni lo cercano.
  await db(env, 'odg?on_conflict=project_id,data', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: film.user_id, project_id: riga.project_id, film: film.titolo || '',
      data: d.data, numero: /^\d+$/.test(d.numero) ? +d.numero : null, dati: d,
      updated_at: new Date(adesso).toISOString() })
  });

  // 2. La mail e' a posto: i telefoni non devono piu' analizzarla. A meno
  //    che porti anche un piano che il server deve ancora leggere
  //    (piano.js): allora resta 'al server', e la chiude lui.
  if (!(await pianoInSospeso(env, riga)))
    await db(env, `posta?id=eq.${riga.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ stato: 'fatta', nota: 'letta dal server' }) });

  // 3. Le notifiche. Da qui in poi niente deve far tornare indietro: l'ordine
  //    del giorno e' scritto, e un avviso mancato non lo rende meno vero.
  let notifiche = 0, avvisi = 0, errore = null;
  try {
    if (membri.length) {
      // Lo stesso calcolo degli avvisi: un solo posto decide di chi e' un pick-up.
      const lettoPerAvvisi = { data: d.data, catering: d.catering, cestini: d.cestini,
        tratte: d.tratte.map(t => ({ ...t, passeggeri: t.nomi })) };
      const { righe, chi } = avvisiPer(lettoPerAvvisi, membri, adesso);
      const pickDi = new Map(chi.filter(c => c.pickup).map(c => [c.user_id, { ora: c.pickup, luogo: c.luogo }]));
      const minuto = new Date(adesso).toISOString();
      /* Una rilettura "senza avvisare" (admin.js) non manda a nessuno la
         notifica dell'ordine del giorno. I promemoria di pick-up e
         catering si riscrivono lo stesso: se la rilettura corregge un
         orario, il promemoria deve suonare all'ora giusta. */
      const tutte = (opz.muta ? [] : membri).map(m => ({
        user_id: m.user_id, project_id: riga.project_id, quando: minuto, genere: 'posta',
        testo: tipo ? notificaErrata(d, m, pickDi.get(m.user_id), tipo, righeE)
                    : notificaOdg(d, m, pickDi.get(m.user_id)),
        chiave: `${m.user_id}:posta:${minuto.slice(0, 16)}`, mandato: null, mostrato: null
      })).concat(righe.map(x => ({
        user_id: x.user_id, project_id: riga.project_id, quando: x.quando, genere: x.genere, testo: x.testo,
        chiave: `${x.user_id}:${x.genere}:${x.giorno}`, mandato: null, mostrato: null })));
      if (tutte.length) await db(env, 'push_appuntamenti?on_conflict=chiave', {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(tutte) });
      notifiche = opz.muta ? 0 : membri.length; avvisi = righe.length;
    }
  } catch (e) { errore = String(e && e.message || e).slice(0, 200); }

  return { scritto: true, data: d.data, notifiche, avvisi, errore, errata: tipo };
}

/* La mail porta un piano di lavorazione che tocca al server e che non e'
   ancora stato letto? Si chiede a parte, e se la domanda fallisce (le
   colonne di sql/piano.sql non ci sono) la risposta e' no: l'ordine del
   giorno non deve restare appeso a una cosa che non parte. */
const ATTESA_PIANO_MINUTI = 8;
const haPiano = (riga) => (riga.allegati || []).some(a => a && a.tenuto && genereDi(a) === 'pdl');
export async function pianoInSospeso(env, riga) {
  if (String(env.PIANO_SCRIVE || '').toLowerCase() !== 'si' || !haPiano(riga)) return false;
  try {
    const r = (await db(env, `posta?select=piano_stato&id=eq.${riga.id}&limit=1`) || [])[0];
    return !!r && !['fatta', 'tronca', 'saltata', 'errore'].includes(r.piano_stato);
  } catch (_) { return false; }
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
    const generi = (riga.allegati || []).filter(a => a && a.tenuto).map(a => genereDi(a));
    await avvisaPosta(env, riga.project_id, ['odg', 'pdl'].filter(g => generi.includes(g)), riga.oggetto);
  } catch (e) { console.error('scrive: avviso di riserva non partito', e.message); }
  console.log('scrive: rilasciata al telefono —', motivo);
  return true;
}

/* A ogni passaggio del cron: le mail rimaste 'al server' troppo a lungo
   si rilasciano. Copre il caso in cui la lettura non parte proprio, o si
   ferma a meta'. */
export async function rilasciaInRitardo(env, adesso) {
  const ora = adesso || Date.now();
  const limite = new Date(ora - ATTESA_MINUTI * 60000).toISOString();
  const righe = await db(env, 'posta?select=id,project_id,oggetto,allegati,ricevuta&stato=eq.al%20server'
    + `&ricevuta=lt.${encodeURIComponent(limite)}&limit=5`);
  const pianoAcceso = String(env.PIANO_SCRIVE || '').toLowerCase() === 'si';
  let n = 0;
  for (const r of righe || []) {
    /* Una mail col piano fa due letture, una al minuto: le si da' il
       doppio del tempo prima di arrendersi. */
    const minuti = pianoAcceso && haPiano(r) ? ATTESA_PIANO_MINUTI : ATTESA_MINUTI;
    if (Date.parse(r.ricevuta) > ora - minuti * 60000) continue;
    if (await rilascia(env, r, `passati ${minuti} minuti`)) n++;
  }
  return n;
}
