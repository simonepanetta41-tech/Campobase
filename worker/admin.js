/* L'amministrazione.
 *
 * Una pagina a parte (/admin.html) con cui chi gestisce Campobase vede
 * tutte le persone e tutti i film e agisce su di loro: aggiungere a un
 * film, spostare, togliere, bloccare, provare le notifiche di qualcuno.
 * Tutto quello che finora si faceva lanciando query a mano su Supabase.
 *
 * ⚠ Qui il server guarda i dati di TUTTI, scavalcando le regole che
 * tengono ogni film separato dagli altri. Per questo il controllo su chi
 * chiede e' la prima cosa, in un punto solo, e niente passa prima:
 *   - bisogna essere entrati con il proprio account (come ovunque);
 *   - e il proprio numero deve stare in ADMIN_IDS, una variabile di
 *     Cloudflare. Non e' nel database: nessuna query sbagliata, nessuna
 *     regola dimenticata puo' fare di qualcuno un amministratore.
 * Senza ADMIN_IDS non entra nessuno.
 *
 * Chi non e' amministratore si sente dire di no, e riceve solo il proprio
 * numero: serve la prima volta, per sapere cosa scrivere in ADMIN_IDS.
 */
import { json, readJson, requireUser } from './shared.js';
import { db } from './ombra.js';
import { mandaScadute, avvisaPosta, primeParole } from './push.js';
import { stralciNuovi, stralciIndiceDopo } from './scrive.js';
import { indiceStralci } from './stralci.js';
import { genereDi } from './smista.js';
import { costo, PREZZI } from './consumi.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = x => (UUID.test(String(x || '')) ? String(x).toLowerCase() : null);

export function eAdmin(env, userId) {
  const lista = String(env && env.ADMIN_IDS || '').toLowerCase().split(/[\s,;]+/).filter(x => UUID.test(x));
  return !!userId && lista.includes(String(userId).toLowerCase());
}

/* Gli account, dal servizio di accesso: mail, ultimo ingresso, blocco. */
async function account(env, soloId) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const capo = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
  if (soloId) {
    const r = await fetch(`${base}/auth/v1/admin/users/${soloId}`, { headers: capo });
    if (!r.ok) throw new Error('account non letto (' + r.status + ')');
    return [await r.json()];
  }
  const tutti = [];
  for (let pagina = 1; pagina <= 10; pagina++) {
    const r = await fetch(`${base}/auth/v1/admin/users?page=${pagina}&per_page=200`, { headers: capo });
    if (!r.ok) throw new Error('account non letti (' + r.status + ')');
    const d = await r.json();
    const u = Array.isArray(d) ? d : (d.users || []);
    tutti.push(...u);
    if (u.length < 200) break;
  }
  return tutti;
}
const bloccato = a => !!(a && a.banned_until && Date.parse(a.banned_until) > Date.now());

async function blocco(env, userId, si) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  const r = await fetch(`${base}/auth/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
               'Content-Type': 'application/json' },
    body: JSON.stringify({ ban_duration: si ? '876000h' : 'none' })      // cent'anni, o niente
  });
  if (!r.ok) throw new Error('blocco non riuscito (' + r.status + ')');
}

/* I film, con la sigla se la colonna c'e' gia'. */
async function film(env) {
  try { return await db(env, 'projects?select=id,titolo,sigla,user_id&order=titolo.asc') || []; }
  catch (_) { return await db(env, 'projects?select=id,titolo,user_id&order=titolo.asc') || []; }
}

/* Supabase da' al massimo mille righe per volta: i consumi (una riga per
   ogni chiamata al modello) e le notifiche li superano presto. Si legge a
   pagine, con un tetto: oltre, il conto direbbe meno del vero, e allora
   lo si dice (troncato). */
async function tutte(env, percorso, pagine = 15) {
  const out = [];
  for (let i = 0; i < pagine; i++) {
    const r = await db(env, `${percorso}&limit=1000&offset=${i * 1000}`) || [];
    out.push(...r);
    if (r.length < 1000) return { righe: out, troncato: false };
  }
  return { righe: out, troncato: true };
}
const CAMPI_CONSUMI = 'quando,origine,scopo,project_id,posta_id,user_id,modello,token_entrata,token_uscita,token_cache_letti,token_cache_scritti';

/* Una somma di righe dei consumi. senzaPrezzo conta le chiamate a un
   modello che nel listino non c'e': i loro dollari mancano dal totale. */
function somma(righe) {
  const t = { chiamate: 0, entrata: 0, uscita: 0, dollari: 0, senzaPrezzo: 0 };
  for (const r of righe || []) {
    t.chiamate++; t.entrata += (+r.token_entrata || 0) + (+r.token_cache_letti || 0) + (+r.token_cache_scritti || 0);
    t.uscita += +r.token_uscita || 0;
    const c = costo(r); if (c == null) t.senzaPrezzo++; else t.dollari += c;
  }
  t.dollari = Math.round(t.dollari * 10000) / 10000;
  return t;
}
function perScopo(righe) {
  const g = new Map();
  for (const r of righe || []) { const k = r.scopo || 'altro'; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return [...g].map(([scopo, rr]) => ({ scopo, origine: rr[0].origine || null, ...somma(rr) })).sort((a, b) => b.dollari - a.dollari);
}
const giornoRoma = t => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date(t));

/* I profili, con la versione dell'app che ognuno ha aperto per ultima
   (sql/versione.sql): se le colonne non ci sono ancora si fa senza. */
async function profili(env, uno) {
  const dove = uno ? `&id=eq.${uno}` : '';
  try { return await db(env, `profiles?select=id,nome,cognome,reparto,app_versione,app_vista${dove}`) || []; }
  catch (_) { return await db(env, `profiles?select=id,nome,cognome,reparto${dove}`) || []; }
}
/* "1.176" contro "1.98": si confrontano i numeri, non le lettere. */
/* La piu' recente di due date ISO; null se mancano tutte e due. */
export function piuTardi(a, b) {
  const ta = Date.parse(a || ''), tb = Date.parse(b || '');
  if (isNaN(ta) && isNaN(tb)) return null;
  if (isNaN(tb)) return a;
  if (isNaN(ta)) return b;
  return tb > ta ? b : a;
}

/* Stralci si', ordine del giorno e piano no. */
function soliStralci(allegati) {
  const t = (allegati || []).filter(a => a && a.tenuto && a.percorso);
  return t.some(a => /\.pdf$/i.test(a.nome || '') && (a.smistato ? a.genere === 'stralci' : /stralc/i.test(a.nome || '')))
    && !t.some(a => ['odg', 'pdl'].includes(genereDi(a)));
}

export function versioneMaggiore(a, b) {
  const x = String(a || '').split('.').map(n => +n || 0), y = String(b || '').split('.').map(n => +n || 0);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}

/* Le mail: i campi che servono a dire com'e' andata, senza tirarsi dietro
   la lettura intera (decine di migliaia di caratteri per riga). */
const CAMPI_POSTA = 'id,project_id,oggetto,ricevuta,stato,nota,allegati,mittente_vero,ombra_stato,ombra_il,piano_stato,piano_il,'
  + 'info:ombra->info,scritto:ombra->scritto,oerrore:ombra->>errore,onota:ombra->>nota,'
  + 'pinfo:piano->info,pscritto:piano->scritto,perrore:piano->>errore';

/* Com'e' andata una mail, in una parola e un colore. */
export function esitoMail(r) {
  const s = r.scritto || null, ps = r.pscritto || null;
  if (r.stato === 'prova') return ['prova', 'm'];
  if (/^rilettura/.test(r.stato || '')) return ['in rilettura', 'y'];
  if (r.ombra_stato === 'errore' || r.piano_stato === 'errore' || r.stato === 'errore' || (s && s.scritto === false) || (ps && ps.scritto === false))
    return ['errore', 'r'];
  if (r.stato === 'al server' || r.ombra_stato === 'in corso' || r.piano_stato === 'in corso') return ['in coda', 'y'];
  if (r.stato === 'da verificare') return ['da verificare', 'y'];
  if (r.ombra_stato === 'tronca') return ['troncata', 'r'];
  if (s && s.scritto) return [s.errata ? 'errata' : 'letta', s.errata ? 'y' : 'g'];
  if (ps && ps.scritto) return ['letta', 'g'];
  if (r.stato === 'senza allegati') return ['senza allegati', 'm'];
  if (r.stato === 'scartata') return ['scartata', 'm'];
  if (r.ombra_stato === 'fatta' || r.piano_stato === 'fatta') return ['letta in ombra', 'm'];
  if (/doppione/.test(String(r.nota || '') + String(r.onota || ''))) return ['doppione', 'm'];
  return ['al telefono', 'm'];
}
function rigaMail(r, F, spese) {
  const f = F.get(r.project_id) || {}, [esito, colore] = esitoMail(r);
  const info = r.info || {}, pinfo = r.pinfo || {};
  const ms = (+info.ms || 0) + (+pinfo.ms || 0);
  return { id: r.id, film: { id: r.project_id, titolo: f.titolo || '', sigla: f.sigla || null },
    oggetto: r.oggetto || '(senza oggetto)', ricevuta: r.ricevuta, esito, colore,
    secondi: ms ? Math.round(ms / 1000) : null,
    notifiche: r.scritto && r.scritto.scritto ? (r.scritto.notifiche || 0) : null,
    allegati: (r.allegati || []).filter(a => a && a.tenuto).length,
    dollari: spese ? somma(spese.get(r.id) || []).dollari : null };
}
async function speseDelleMail(env, ids) {
  const m = new Map();
  if (!ids.length) return m;
  const righe = await db(env, `consumi?select=${CAMPI_CONSUMI}&posta_id=in.(${ids.join(',')})&limit=1000`).catch(() => []);
  for (const c of righe || []) { if (!m.has(c.posta_id)) m.set(c.posta_id, []); m.get(c.posta_id).push(c); }
  return m;
}
/* I film con tutto quello che serve qui; le colonne aggiunte col tempo
   possono non esserci ancora, e allora si fa senza. */
async function filmPieni(env) {
  try { return await db(env, 'projects?select=id,titolo,sigla,user_id,casella,codice,mittente&order=titolo.asc') || []; }
  catch (_) { return await film(env); }
}
const si = v => String(v || '').toLowerCase() === 'si';
const k = n => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (Math.round(n / 100) / 10 + 'k').replace('.', ',') : String(n));
const usd = n => '$' + (n < 0.1 ? n.toFixed(3) : n.toFixed(2)).replace('.', ',');

const AZIONI = {
  // Chi sono: la pagina lo chiede per prima cosa.
  async io(env, b, io) { return { admin: true, id: io.id, email: io.email || null }; },

  /* "Ultima apertura": la piu' recente fra il tempo d'uso e l'apertura
     registrata con la versione. Il tempo d'uso da solo non basta: chi
     apre l'app per pochi secondi puo' non lasciarne traccia, e nell'elenco
     risultava ferma da giorni una persona che l'aveva aperta la notte. */
  async persone(env) {
    const [acc, prof, membri, ff, iscr, uso] = await Promise.all([
      account(env), profili(env),
      db(env, 'film_membri?select=project_id,user_id,ruolo'), film(env),
      db(env, 'push_iscrizioni?select=user_id'),
      db(env, 'uso?select=user_id,ultimo&order=ultimo.desc&limit=3000').catch(() => [])
    ]);
    const P = new Map((prof || []).map(p => [p.id, p]));
    const F = new Map((ff || []).map(f => [f.id, f]));
    const filmDi = new Map(), telefoni = new Map(), visto = new Map();
    for (const m of membri || []) {
      const f = F.get(m.project_id); if (!f) continue;
      if (!filmDi.has(m.user_id)) filmDi.set(m.user_id, []);
      filmDi.get(m.user_id).push({ id: f.id, titolo: f.titolo, sigla: f.sigla || null, ruolo: m.ruolo });
    }
    for (const i of iscr || []) telefoni.set(i.user_id, (telefoni.get(i.user_id) || 0) + 1);
    for (const u of uso || []) if (!visto.has(u.user_id)) visto.set(u.user_id, u.ultimo);
    const persone = (acc || []).map(a => {
      const p = P.get(a.id) || {};
      return { id: a.id, nome: p.nome || '', cognome: p.cognome || '', reparto: p.reparto || '', email: a.email || '',
               film: filmDi.get(a.id) || [], telefoni: telefoni.get(a.id) || 0,
               ultima: piuTardi(visto.get(a.id), p.app_vista), iscritto: a.created_at || null, bloccato: bloccato(a),
               versione: p.app_versione || null };
    }).sort((x, y) => String(y.ultima || '').localeCompare(String(x.ultima || '')));
    /* Di ogni film, quante persone ha dentro: nella tabella dei film ci
       sono anche quelli nati da una vecchia analisi e mai usati da una
       troupe, e contarli tutti da' un numero che non dice niente. */
    const quanti = new Map();
    for (const m of membri || []) quanti.set(m.project_id, (quanti.get(m.project_id) || 0) + 1);
    return { persone, film: (ff || []).map(f => ({ id: f.id, titolo: f.titolo, sigla: f.sigla || null, membri: quanti.get(f.id) || 0 }))
      .sort((x, y) => y.membri - x.membri || String(x.titolo).localeCompare(String(y.titolo))) };
  },

  async persona(env, b) {
    const u = id(b.id); if (!u) throw new Error('manca la persona');
    const [acc, prof, membri, ff, iscr, notifiche, uso, consumi] = await Promise.all([
      account(env, u), profili(env, u),
      db(env, `film_membri?select=project_id,ruolo,segna,created_at&user_id=eq.${u}`)
        .catch(() => db(env, `film_membri?select=project_id,ruolo,created_at&user_id=eq.${u}`)),
      film(env),
      db(env, `push_iscrizioni?select=creata,vista,endpoint&user_id=eq.${u}&order=creata.desc`),
      db(env, `push_appuntamenti?select=id,genere,testo,quando,mandato,mostrato,dispositivi,scartati&user_id=eq.${u}` +
              `&mandato=not.is.null&order=mandato.desc&limit=8`),
      db(env, `uso?select=sezione,secondi,giorno,ultimo&user_id=eq.${u}&order=giorno.desc&limit=200`).catch(() => []),
      db(env, `consumi?select=${CAMPI_CONSUMI}&user_id=eq.${u}&limit=1000`).catch(() => [])
    ]);
    const a = acc[0] || {}, p = (prof || [])[0] || {}, F = new Map((ff || []).map(f => [f.id, f]));
    const perScopo = {};
    for (const c of consumi || []) {
      const s = perScopo[c.scopo] || (perScopo[c.scopo] = { chiamate: 0, entrata: 0, uscita: 0 });
      s.chiamate++; s.entrata += c.token_entrata || 0; s.uscita += c.token_uscita || 0;
    }
    return {
      id: u, nome: p.nome || '', cognome: p.cognome || '', reparto: p.reparto || '', email: a.email || '',
      iscritto: a.created_at || null, ultimoAccesso: a.last_sign_in_at || null, bloccato: bloccato(a),
      ultima: piuTardi(((uso || [])[0] || {}).ultimo, p.app_vista),
      versione: p.app_versione || null, versioneVista: p.app_vista || null, dollari: somma(consumi).dollari,
      film: (membri || []).filter(m => F.has(m.project_id)).map(m => ({ id: m.project_id, titolo: F.get(m.project_id).titolo,
              sigla: F.get(m.project_id).sigla || null, ruolo: m.ruolo, segna: !!m.segna, entrato: m.created_at })),
      telefoni: (iscr || []).map(i => ({ creata: i.creata, vista: i.vista,
              tipo: /apple/.test(i.endpoint) ? 'iPhone' : /google|fcm/.test(i.endpoint) ? 'Android' : 'altro' })),
      notifiche: (notifiche || []).map(n => ({ id: n.id, genere: n.genere, titolo: String(n.testo || '').split('\n')[0].slice(0, 80),
              mandato: n.mandato, mostrato: n.mostrato, dispositivi: n.dispositivi, scartati: n.scartati })),
      uso7: (uso || []).filter(x => Date.parse(x.giorno) > Date.now() - 7 * 86400000)
              .reduce((t, x) => t + (x.secondi || 0), 0),
      consumi: perScopo
    };
  },

  /* ── I film ── */
  async film(env) {
    const [ff, membri, prof, posta, cons] = await Promise.all([
      filmPieni(env), db(env, 'film_membri?select=project_id,user_id,ruolo'), db(env, 'profiles?select=id,nome,cognome'),
      db(env, 'posta?select=project_id,ricevuta,oggetto&stato=neq.prova&order=ricevuta.desc&limit=1000').catch(() => []),
      tutte(env, `consumi?select=${CAMPI_CONSUMI}&order=id.asc`).catch(() => ({ righe: [], troncato: false }))
    ]);
    const P = new Map((prof || []).map(p => [p.id, p]));
    const quanti = new Map(), ultima = new Map(), mail = new Map(), spesa = new Map();
    for (const m of membri || []) quanti.set(m.project_id, (quanti.get(m.project_id) || 0) + 1);
    for (const m of posta || []) { mail.set(m.project_id, (mail.get(m.project_id) || 0) + 1); if (!ultima.has(m.project_id)) ultima.set(m.project_id, m); }
    for (const c of cons.righe) { if (!c.project_id) continue; if (!spesa.has(c.project_id)) spesa.set(c.project_id, []); spesa.get(c.project_id).push(c); }
    return { troncato: cons.troncato, film: (ff || []).map(f => {
      const c = P.get(f.user_id) || {}, u = ultima.get(f.id);
      return { id: f.id, titolo: f.titolo, sigla: f.sigla || null, membri: quanti.get(f.id) || 0,
        capo: [c.nome, c.cognome].filter(Boolean).join(' ') || null, casella: f.casella || null,
        mail: mail.get(f.id) || 0, ultimaMail: u ? u.ricevuta : null, dollari: somma(spesa.get(f.id) || []).dollari };
    }).sort((x, y) => y.membri - x.membri || String(y.ultimaMail || '').localeCompare(String(x.ultimaMail || '')) || String(x.titolo).localeCompare(String(y.titolo))) };
  },

  async filmUno(env, b) {
    const f = id(b.id); if (!f) throw new Error('manca il film');
    const [ff, membri, prof, iscr, esclusi, posta, cons, analisi, fogli, tutteLeMail] = await Promise.all([
      filmPieni(env),
      db(env, `film_membri?select=user_id,ruolo,segna,created_at&project_id=eq.${f}`)
        .catch(() => db(env, `film_membri?select=user_id,ruolo,created_at&project_id=eq.${f}`)),
      db(env, 'profiles?select=id,nome,cognome,reparto'), db(env, 'push_iscrizioni?select=user_id'),
      db(env, `film_esclusi?select=user_id&project_id=eq.${f}`).catch(() => []),
      db(env, `posta?select=${CAMPI_POSTA}&project_id=eq.${f}&order=ricevuta.desc&limit=8`).catch(() => []),
      tutte(env, `consumi?select=${CAMPI_CONSUMI}&project_id=eq.${f}&order=id.asc`).catch(() => ({ righe: [], troncato: false })),
      // Quanto c'e' dentro: serve a dire cosa si perde eliminandolo.
      db(env, `analyses?select=id&project_id=eq.${f}&limit=1000`).catch(() => []),
      db(env, `odg?select=id&project_id=eq.${f}&limit=1000`).catch(() => []),
      db(env, `posta?select=id&project_id=eq.${f}&limit=1000`).catch(() => [])
    ]);
    const x = (ff || []).find(y => y.id === f); if (!x) throw new Error('film non trovato');
    const padrone = (prof || []).find(p => p.id === x.user_id) || {};
    const P = new Map((prof || []).map(p => [p.id, p])), F = new Map([[x.id, x]]);
    const tel = new Set((iscr || []).map(i => i.user_id));
    return { id: x.id, titolo: x.titolo, sigla: x.sigla || null, casella: x.casella || null, codice: x.codice || null,
      mittente: x.mittente || null, esclusi: (esclusi || []).length,
      capo: [padrone.nome, padrone.cognome].filter(Boolean).join(' ') || null,
      dentro: { analisi: (analisi || []).length, odg: (fogli || []).length, mail: (tutteLeMail || []).length },
      membri: (membri || []).map(m => { const p = P.get(m.user_id) || {};
        return { id: m.user_id, nome: [p.nome, p.cognome].filter(Boolean).join(' ') || 'Senza nome', reparto: p.reparto || '',
                 ruolo: m.ruolo, segna: !!m.segna, telefono: tel.has(m.user_id) }; })
        .sort((a, c) => (c.ruolo === 'capo') - (a.ruolo === 'capo') || a.nome.localeCompare(c.nome)),
      posta: (posta || []).map(r => rigaMail(r, F, null)),
      totale: somma(cons.righe), consumi: perScopo(cons.righe), troncato: cons.troncato };
  },

  /* Eliminare un film, per sempre: serve a togliere le prove e le vecchie
     analisi rimaste in elenco. Porta via tutto quello che il film ha
     dentro — lo spoglio e il piano, gli ordini del giorno, la posta con
     gli allegati — e chi c'era ne esce. Restano solo le righe dei
     consumi, senza piu' il film: quello che e' stato speso e' stato speso.
     Un film con una troupe non si elimina con un tocco: bisogna
     riscriverne il titolo. */
  async eliminaFilm(env, b) {
    const f = id(b.id); if (!f) throw new Error('manca il film');
    const x = ((await db(env, `projects?select=id,titolo,user_id&id=eq.${f}&limit=1`)) || [])[0];
    if (!x) throw new Error('film non trovato');
    const membri = await db(env, `film_membri?select=user_id&project_id=eq.${f}`) || [];
    const parola = String(x.titolo || '').trim() || 'elimina';
    if (membri.length > 1 && String(b.conferma || '').trim().toLowerCase() !== parola.toLowerCase())
      throw new Error(`ha una troupe di ${membri.length} persone: per eliminarlo va scritto il titolo`);

    // 1. I file della posta: nel database sparirebbero le righe, non loro.
    const mail = await db(env, `posta?select=allegati&project_id=eq.${f}&limit=1000`).catch(() => []) || [];
    const percorsi = [...new Set(mail.flatMap(m => (m.allegati || []).map(a => a && a.percorso).filter(Boolean)))];
    let file = 0;
    for (let i = 0; i < percorsi.length; i += 100) {
      try {
        const r = await fetch(`${env.SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/posta`, { method: 'DELETE',
          headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prefixes: percorsi.slice(i, i + 100) }) });
        if (r.ok) file += percorsi.slice(i, i + 100).length;
      } catch (_) {}
    }
    // 2. Lo spoglio, con il piano e il cast che gli stanno attaccati.
    const analisi = (await db(env, `analyses?select=id&project_id=eq.${f}&limit=1000`).catch(() => []) || []).map(a => a.id).filter(id);
    if (analisi.length) {
      const dove = `analysis_id=in.(${analisi.join(',')})`;
      for (const t of ['cast_list', 'pdl_versions']) { try { await db(env, `${t}?${dove}`, { method: 'DELETE' }); } catch (_) {} }
      await db(env, `analyses?project_id=eq.${f}`, { method: 'DELETE' });
    }
    // 3. Il film: con lui vanno via posta, ordini del giorno, troupe, scene segnate, notifiche in coda.
    await db(env, `projects?id=eq.${f}`, { method: 'DELETE' });
    const rimasto = await db(env, `projects?select=id&id=eq.${f}&limit=1`);
    if (rimasto && rimasto.length) throw new Error('il database non ha eliminato il film');
    return { fatto: true, titolo: x.titolo || '', persone: membri.length, analisi: analisi.length, mail: mail.length, file, fileRimasti: percorsi.length - file };
  },

  /* ── La posta ── */
  async posta(env) {
    const [ff, righe] = await Promise.all([film(env), db(env, `posta?select=${CAMPI_POSTA}&order=ricevuta.desc&limit=40`)]);
    const F = new Map((ff || []).map(f => [f.id, f]));
    const spese = await speseDelleMail(env, (righe || []).map(r => r.id));
    const mail = (righe || []).map(r => rigaMail(r, F, spese));
    return { mail, lette: mail.filter(m => /^(letta|errata)$/.test(m.esito)).length, errori: mail.filter(m => m.colore === 'r').length };
  },

  /* Una mail, passo per passo: quando e' arrivata, cosa ne ha fatto il
     server, quanto e' costata, a quanti e' arrivata la notifica. */
  async mail(env, b) {
    const m = id(b.id); if (!m) throw new Error('manca la mail');
    const r = ((await db(env, `posta?select=${CAMPI_POSTA}&id=eq.${m}&limit=1`)) || [])[0];
    if (!r) throw new Error('mail non trovata');
    const [ff, cons] = await Promise.all([film(env),
      db(env, `consumi?select=${CAMPI_CONSUMI},ms,esito&posta_id=eq.${m}&order=id.asc&limit=100`).catch(() => [])]);
    const F = new Map((ff || []).map(f => [f.id, f]));
    const passi = [], passo = (quando, titolo, testo, colore) => { if (quando) passi.push({ quando, titolo, testo: testo || '', colore: colore || '' }); };
    const tenuti = (r.allegati || []).filter(a => a && a.tenuto);
    passo(r.ricevuta, 'Arrivata', [tenuti.length === 1 ? '1 allegato' : tenuti.length + ' allegati', r.mittente_vero ? 'da ' + r.mittente_vero : ''].filter(Boolean).join(' · '));
    const spesa = c => { const d = costo(c); return [k((+c.token_entrata || 0)) + ' token in', k(+c.token_uscita || 0) + ' out', d == null ? '' : usd(d)].filter(Boolean).join(' · '); };
    for (const c of cons || []) {
      if (c.scopo === 'smistamento') passo(c.quando, 'Smistata', 'allegati dal nome incerto guardati dentro · ' + spesa(c));
      if (c.scopo === 'stralci') passo(c.quando, 'Indice stralci', spesa(c));
    }
    /* Le notifiche partite per questa lettura: sono quelle del film, di
       genere posta, scritte nei minuti subito dopo. Il registro tiene
       sette giorni: per una mail piu' vecchia non c'e' piu' niente da contare. */
    const notifiche = async (da) => {
      if (!da) return null;
      const a = new Date(Date.parse(da) - 60000).toISOString(), z = new Date(Date.parse(da) + 10 * 60000).toISOString();
      const nn = await db(env, `push_appuntamenti?select=mandato,mostrato,dispositivi&project_id=eq.${r.project_id}&genere=eq.posta`
        + `&quando=gte.${encodeURIComponent(a)}&quando=lte.${encodeURIComponent(z)}&limit=500`).catch(() => []);
      if (!nn || !nn.length) return null;
      const partite = nn.filter(n => (n.dispositivi || 0) > 0);
      return { tutte: nn.length, partite: partite.length, mostrate: partite.filter(n => n.mostrato).length };
    };
    const lettura = async (nome, stato, il, info, scritto, errore) => {
      if (!il || !stato || stato === 'saltata') return;
      const fine = new Date(Date.parse(il) + (+((info || {}).ms) || 0)).toISOString();
      const c = (cons || []).filter(x => x.scopo === (nome === 'Piano' ? 'piano' : 'odg')).pop();     // l'ultima: una rilettura ne aggiunge una
      if (stato === 'in corso') return passo(il, nome + ': lettura in corso', '', 'y');
      if (stato === 'errore') return passo(fine, nome + ': lettura fallita', errore || '', 'r');
      passo(fine, nome + (stato === 'tronca' ? ': lettura troncata' : ': letto') + (info && info.ms ? ' in ' + Math.round(info.ms / 1000) + ' s' : ''),
        c ? spesa(c) : (info && info.token_entrata != null ? [k(+info.token_entrata || 0) + ' token in', k(+info.token_uscita || 0) + ' out'].join(' · ') : ''), stato === 'tronca' ? 'r' : '');
      if (scritto && scritto.scritto === false) return passo(fine, nome + ': non scritto', (scritto.errore || '') + ' · passata ai telefoni', 'r');
      if (scritto && scritto.scritto) {
        passo(fine, nome + ': scritto', [scritto.data ? 'giorno ' + scritto.data : '', scritto.errata ? 'errata corrige (' + scritto.errata + ')' : '',
          scritto.avvisi != null ? scritto.avvisi + ' avvisi di pick-up e catering' : '', scritto.vecchio ? 'più vecchio di quello in uso: lasciato stare' : '',
          scritto.errore ? 'ma: ' + scritto.errore : ''].filter(Boolean).join(' · '), scritto.errore ? 'y' : 'g');
        const n = await notifiche(fine);
        if (n) passo(fine, n.tutte + (n.tutte === 1 ? ' notifica' : ' notifiche'),
          n.mostrate + (n.mostrate === 1 ? ' mostrata' : ' mostrate') + (n.partite - n.mostrate ? ', ' + (n.partite - n.mostrate) + ' senza conferma' : '')
          + (n.tutte - n.partite ? ', ' + (n.tutte - n.partite) + ' senza telefono' : ''), n.partite - n.mostrate ? 'y' : 'g');
        else if (scritto.notifiche) passo(fine, scritto.notifiche + ' notifiche', 'partite; il registro di chi l\'ha vista dura sette giorni');
      } else if (stato === 'fatta') passo(fine, nome + ': non scritto', 'lettura di prova, in ombra: la mail è andata ai telefoni');
    };
    await lettura('Ordine del giorno', r.ombra_stato, r.ombra_il, r.info, r.scritto, r.oerrore);
    await lettura('Piano', r.piano_stato, r.piano_il, r.pinfo, r.pscritto, r.perrore);
    passi.sort((x, y) => String(x.quando).localeCompare(String(y.quando)));
    const [esito, colore] = esitoMail(r);
    /* Il testo della mail, solo qui e non negli elenchi: pesa, e serve quando
       si deve capire cosa ha scritto chi l'ha mandata (una conferma di
       inoltro, un'errata, un formato nuovo). */
    const testo = ((await db(env, `posta?select=testo&id=eq.${m}&limit=1`).catch(() => [])) || [])[0];
    return { ...rigaMail(r, F, new Map([[r.id, cons || []]])), esito, colore, nota: r.nota || r.onota || null, mittente: r.mittente_vero || null,
      testo: (testo && testo.testo) || null,
      allegati: (r.allegati || []).map(a => ({ nome: a.nome, byte: a.byte || 0, tenuto: !!a.tenuto, genere: a.tenuto ? (genereDi(a) || null) : null })),
      rileggibile: { odg: tenuti.some(a => genereDi(a) === 'odg'), piano: tenuti.some(a => genereDi(a) === 'pdl'),
        stralci: soliStralci(r.allegati) && !/^stralci sostituiti/.test(r.nota || '') },
      passi, haOdg: /^(fatta|tronca|errore)$/.test(r.ombra_stato || ''), haPiano: /^(fatta|tronca|errore)$/.test(r.piano_stato || '') };
  },

  /* Quello che il modello ha letto, com'e': serve quando l'app mostra una
     cosa strana e si vuole sapere se l'ha letta male lui o l'ha girata
     male il server. */
  async lettura(env, b) {
    const m = id(b.id); if (!m) throw new Error('manca la mail');
    const col = b.cosa === 'piano' ? 'piano' : 'ombra';
    const r = ((await db(env, `posta?select=letto:${col}->letto,testo:${col}->>testo&id=eq.${m}&limit=1`)) || [])[0];
    if (!r || (r.letto == null && !r.testo)) throw new Error('di questa mail non c\'è una lettura salvata');
    return { letto: r.letto != null ? r.letto : null, testo: r.letto != null ? null : r.testo };
  },

  /* Una mail messa da parte perche' "non sembra di questo film": la si
     accetta o la si scarta. Accettata, va letta come se fosse appena
     arrivata, e la troupe — che non ne ha saputo niente — va avvisata:
     se il server scrive passa dalla rilettura (con notifiche), altrimenti
     torna 'nuova' e la prendono i telefoni. */
  async accetta(env, b) {
    const m = id(b.id); if (!m) throw new Error('manca la mail');
    const r = ((await db(env, `posta?select=id,project_id,oggetto,stato,allegati&id=eq.${m}&limit=1`)) || [])[0];
    if (!r) throw new Error('mail non trovata');
    if (r.stato !== 'da verificare') throw new Error('non è una mail messa da parte');
    const ha = g => (r.allegati || []).some(a => a && a.tenuto && a.percorso && genereDi(a) === g);
    const spento = v => String(v || '').toLowerCase() === 'no';
    const odg = ha('odg') && si(env.OMBRA_SCRIVE) && !spento(env.OMBRA), piano = ha('pdl') && si(env.PIANO_SCRIVE) && !spento(env.PIANO);
    const stato = odg ? 'rilettura' : piano ? 'rilettura piano' : 'nuova';
    const fatte = await db(env, `posta?id=eq.${m}&stato=eq.da%20verificare`, { method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ stato, nota: stato === 'nuova' ? 'accettata dall\'amministrazione' : 'rilettura: con notifiche' }) });
    if (!fatte || !fatte.length) throw new Error('qualcun altro l\'ha già sistemata');
    if (stato === 'nuova') {
      const fatti = [ha('odg') && 'odg', ha('pdl') && 'pdl'].filter(Boolean);
      try { await avvisaPosta(env, r.project_id, fatti, r.oggetto); await mandaScadute(env); } catch (_) {}
    }
    return { fatto: true, legge: stato === 'nuova' ? 'telefoni' : 'server' };
  },
  async scarta(env, b) {
    const m = id(b.id); if (!m) throw new Error('manca la mail');
    const fatte = await db(env, `posta?id=eq.${m}&stato=eq.da%20verificare`, { method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ stato: 'scartata', nota: 'scartata dall\'amministrazione' }) });
    if (!fatte || !fatte.length) throw new Error('non è una mail messa da parte');
    return { fatto: true };
  },

  /* Correggere un film: titolo, sigla (il prefisso delle notifiche),
     mittente atteso della posta. Chi l'ha aperto non si cambia da qui:
     gli ordini del giorno sono scritti a suo nome, e spostarli e' un
     lavoro a parte. */
  /* Cambiare il codice d'invito. Escludere una persona le toglie
     l'accesso, ma il codice lo conosce ancora: con un'altra mail si fa un
     account nuovo e rientra. Con un codice nuovo quello vecchio non apre
     piu' niente; chi e' gia' nel film resta dov'e', perche' nel film ci
     sta per la sua riga fra i membri, non per il codice. */
  async codiceNuovo(env, b) {
    const f = id(b.id); if (!f) throw new Error('manca il film');
    const c = ((await db(env, `projects?select=id,codice&id=eq.${f}&limit=1`)) || [])[0];
    if (!c) throw new Error('film non trovato');
    // Otto cifre come quelle di sql/troupe.sql. L'indice vuole che sia unico:
    // se per caso esiste gia', se ne tira un altro.
    for (let giro = 0; giro < 4; giro++) {
      const codice = [...crypto.getRandomValues(new Uint8Array(4))].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
      if (codice === c.codice) continue;
      try {
        await db(env, `projects?id=eq.${f}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ codice }) });
        return { fatto: true, codice };
      } catch (e) { if (!/23505|duplicate|unique/i.test(e.message || '')) throw e; }
    }
    throw new Error('non sono riuscito a trovare un codice libero: riprova');
  },

  async filmCambia(env, b) {
    const f = id(b.id); if (!f) throw new Error('manca il film');
    const c = {};
    if (b.titolo !== undefined) { c.titolo = String(b.titolo || '').replace(/\s+/g, ' ').trim().slice(0, 120); if (!c.titolo) throw new Error('il titolo non può essere vuoto'); }
    if (b.sigla !== undefined) {
      const s = String(b.sigla || '').trim().toUpperCase();
      if (s && !/^[A-Z][A-Z0-9]{1,5}$/.test(s)) throw new Error('la sigla è di 2-6 lettere o numeri, e comincia con una lettera');
      c.sigla = s || null;
    }
    if (b.mittente !== undefined) {
      const mm = String(b.mittente || '').toLowerCase().split(/[,;\s]+/).filter(Boolean);
      if (mm.some(x => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(x))) throw new Error('il mittente dev\'essere un indirizzo mail (o più, separati da virgola)');
      c.mittente = mm.join(', ') || null;
    }
    if (!Object.keys(c).length) throw new Error('niente da cambiare');
    const fatti = await db(env, `projects?id=eq.${f}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(c) });
    if (!fatti || !fatti.length) throw new Error('film non trovato');
    return { fatto: true, ...c };
  },

  /* Un messaggio scritto a mano a tutta la troupe di un film. Parte
     subito, con la sigla del film davanti come le altre notifiche. */
  async messaggio(env, b) {
    const f = id(b.film); if (!f) throw new Error('manca il film');
    const testo = String(b.testo || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
    if (testo.length < 3) throw new Error('il messaggio è vuoto');
    if (testo.length > 240) throw new Error('il messaggio è troppo lungo: al massimo 240 caratteri');
    const membri = await db(env, `film_membri?select=user_id&project_id=eq.${f}`) || [];
    if (!membri.length) throw new Error('in questo film non c\'è nessuno');
    const adesso = new Date();
    await db(env, 'push_appuntamenti', { method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(membri.map(m => ({ user_id: m.user_id, project_id: f, quando: adesso.toISOString(), genere: 'avviso',
        chiave: `${m.user_id}:avviso:${adesso.getTime()}`, testo: 'Avviso\n' + testo }))) });
    await mandaScadute(env);
    const esito = await db(env, `push_appuntamenti?select=dispositivi&project_id=eq.${f}&genere=eq.avviso&quando=eq.${encodeURIComponent(adesso.toISOString())}`).catch(() => []);
    return { fatto: true, persone: membri.length, raggiunte: (esito || []).filter(e => (e.dispositivi || 0) > 0).length };
  },

  /* Far rileggere una mail. Non la si rimette 'al server': quello stato
     ha una scadenza di pochi minuti, e una mail di ieri verrebbe subito
     passata ai telefoni con una notifica a tutti. Ha uno stato suo, che
     il cron (ombra.js, piano.js) prende per primo; se avvisare o no la
     troupe lo decide chi chiede, e viaggia nella nota. */
  async rileggi(env, b) {
    const m = id(b.id); if (!m) throw new Error('manca la mail');
    const piano = b.cosa === 'piano';
    const r = ((await db(env, `posta?select=id,stato,allegati,ombra_stato,piano_stato&id=eq.${m}&limit=1`)) || [])[0];
    if (!r) throw new Error('mail non trovata');
    if (r.stato === 'prova') throw new Error('è una mail di prova: non si rilegge da qui');
    if (r.stato === 'al server' || /^rilettura/.test(r.stato || '') || r.ombra_stato === 'in corso' || r.piano_stato === 'in corso')
      throw new Error('il server la sta già leggendo');
    const cerco = piano ? 'pdl' : 'odg';
    if (!(r.allegati || []).some(a => a && a.tenuto && a.percorso && genereDi(a) === cerco))
      throw new Error(piano ? 'in questa mail non c\'è un piano' : 'in questa mail non c\'è un ordine del giorno');
    if (piano ? (!si(env.PIANO_SCRIVE) || String(env.PIANO || '').toLowerCase() === 'no')
              : (!si(env.OMBRA_SCRIVE) || String(env.OMBRA || '').toLowerCase() === 'no'))
      throw new Error('il server non sta scrivendo ' + (piano ? 'i piani' : 'gli ordini del giorno') + ': l\'interruttore è spento');
    const nota = 'rilettura: ' + (b.notifiche === true ? 'con notifiche' : 'senza notifiche');
    await db(env, `posta?id=eq.${m}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(piano ? { stato: 'rilettura piano', nota, piano_stato: null, piano: null, piano_il: null }
                                 : { stato: 'rilettura', nota, ombra_stato: null, ombra: null, ombra_il: null }) });
    return { fatto: true, avvisa: b.notifiche === true };
  },

  /* Una mail con i soli stralci arrivata dopo l'ordine del giorno: li si
     mette al posto dei vecchi (scrive.js). Da quando esiste lo fa il
     server da solo all'arrivo; questo tasto serve per le mail arrivate
     prima, o per quando non ha capito di quale giorno fossero. Non manda
     notifiche: la troupe quella mail l'ha gia' vista arrivare. */
  async stralci(env, b) {
    const m = id(b.id); if (!m) throw new Error('manca la mail');
    const r = ((await db(env, `posta?select=id,project_id,oggetto,testo,allegati,stato&id=eq.${m}&limit=1`)) || [])[0];
    if (!r) throw new Error('mail non trovata');
    if (!soliStralci(r.allegati)) throw new Error('in questa mail non ci sono solo stralci');
    if (!si(env.OMBRA_SCRIVE)) throw new Error('il server non sta scrivendo gli ordini del giorno: l\'interruttore è spento');
    const parole = primeParole(r.testo);
    const fatto = await stralciNuovi(env, r, Date.now(), parole ? [parole] : []);
    if (!fatto) throw new Error('non trovo l\'ordine del giorno a cui si riferiscono');
    try { await stralciIndiceDopo(env, r, fatto, await indiceStralci(env, r.allegati, r)); } catch (_) {}
    return { fatto: true, numero: fatto.numero || null, data: fatto.data };
  },

  /* ── Il server ── */
  async server(env) {
    const adesso = Date.now(), sette = new Date(adesso - 7 * 86400000).toISOString();
    const [posta, push, cons, prof, letture] = await Promise.all([
      db(env, `posta?select=${CAMPI_POSTA}&stato=neq.prova&ricevuta=gte.${encodeURIComponent(sette)}&order=ricevuta.desc&limit=300`).catch(() => []),
      tutte(env, `push_appuntamenti?select=mandato,mostrato,dispositivi&mandato=gte.${encodeURIComponent(sette)}&order=mandato.asc`, 5).catch(() => ({ righe: [] })),
      tutte(env, `consumi?select=${CAMPI_CONSUMI}&order=id.asc`).catch(() => ({ righe: [], troncato: false, manca: true })),
      profili(env).catch(() => []),
      db(env, 'posta?select=ombra_il,oggetto,info:ombra->info&ombra_stato=eq.fatta&stato=neq.prova&order=ombra_il.desc&limit=30').catch(() => [])
    ]);
    const nomeDi = new Map((prof || []).map(p => [p.id, [p.nome, p.cognome].filter(Boolean).join(' ') || 'Senza nome']));
    /* Chi spende dal telefono: spoglio, confronto, cast. Le letture del
       server non sono di nessuno e qui non entrano. */
    const diChi = new Map();
    for (const c of cons.righe) { if (!c.user_id || c.origine === 'server') continue; if (!diChi.has(c.user_id)) diChi.set(c.user_id, []); diChi.get(c.user_id).push(c); }
    const spendono = [...diChi].map(([u, rr]) => ({ id: u, nome: nomeDi.get(u) || 'Account eliminato', ...somma(rr) }))
      .sort((a, b) => b.dollari - a.dollari || b.chiamate - a.chiamate).slice(0, 8);
    /* Giorno per giorno, gli ultimi quattordici (anche quelli a zero). */
    const perGiorno = new Map();
    for (const c of cons.righe) { const g = giornoRoma(c.quando); if (!perGiorno.has(g)) perGiorno.set(g, []); perGiorno.get(g).push(c); }
    const giorni = [];
    for (let i = 13; i >= 0; i--) { const g = giornoRoma(adesso - i * 86400000), t = somma(perGiorno.get(g) || []); giorni.push({ giorno: g, dollari: t.dollari, chiamate: t.chiamate }); }
    /* Quanto ci mette a leggere un ordine del giorno, lettura per lettura. */
    const tempiLettura = (letture || []).filter(r => r.ombra_il && r.info && +r.info.ms > 0)
      .map(r => ({ quando: r.ombra_il, secondi: Math.round(+r.info.ms / 1000), oggetto: String(r.oggetto || '').slice(0, 60) })).reverse();
    /* Che versione dell'app ha aperto ognuno, l'ultima volta. */
    const conVersione = (prof || []).filter(p => p.app_versione);
    const ultimaV = conVersione.map(p => p.app_versione).reduce((m, v) => (m == null || versioneMaggiore(v, m) ? v : m), null);
    const versioni = { ultima: ultimaV, aggiornati: conVersione.filter(p => p.app_versione === ultimaV).length,
      indietro: conVersione.filter(p => p.app_versione !== ultimaV)
        .map(p => ({ id: p.id, nome: nomeDi.get(p.id), versione: p.app_versione, vista: p.app_vista || null }))
        .sort((a, b) => String(b.vista || '').localeCompare(String(a.vista || ''))),
      ignoti: (prof || []).length - conVersione.length };
    const lette = (posta || []).map(r => ({ r, il: [r.ombra_il, r.piano_il].filter(Boolean).sort().pop(), e: esitoMail(r) }))
      .filter(x => x.il && /^(letta|errata|errore|troncata|letta in ombra)$/.test(x.e[0]));
    const ultima = lette.slice().sort((a, b) => String(b.il).localeCompare(String(a.il)))[0];
    const tempi = (posta || []).map(r => +((r.info || {}).ms) || 0).filter(Boolean);
    const partite = push.righe.filter(n => (n.dispositivi || 0) > 0);
    const oggi = giornoRoma(adesso), ieri = giornoRoma(adesso - 86400000);
    const di = g => cons.righe.filter(c => giornoRoma(c.quando) === g);
    const interruttore = (nome, v, spentoSe) => ({ nome, acceso: spentoSe ? String(v || '').toLowerCase() !== 'no' : si(v) });
    return {
      stato: { ultima: ultima ? { quando: ultima.il, esito: ultima.e[0], colore: ultima.e[1], oggetto: ultima.r.oggetto } : null,
        coda: (posta || []).filter(r => /^in (coda|rilettura)$/.test(esitoMail(r)[0])).length,
        errori: (posta || []).filter(r => esitoMail(r)[1] === 'r').length, mail: (posta || []).length,
        secondi: tempi.length ? Math.round(tempi.reduce((a, c) => a + c, 0) / tempi.length / 1000) : null,
        notifiche: { partite: partite.length, senza: partite.filter(n => !n.mostrato).length } },
      costi: { oggi: somma(di(oggi)), ieri: somma(di(ieri)), sette: somma(cons.righe.filter(c => Date.parse(c.quando) >= adesso - 7 * 86400000)), sempre: somma(cons.righe),
        dal: cons.righe.length ? cons.righe.map(c => c.quando).sort()[0] : null,
        scopi: perScopo(cons.righe), troncato: !!cons.troncato, manca: !!cons.manca, giorni, persone: spendono },
      tempi: tempiLettura, versioni,
      prezzi: Object.entries(PREZZI).map(([modello, p]) => ({ modello, entrata: p.entrata, uscita: p.uscita })),
      interruttori: [
        interruttore('Legge gli ordini del giorno', env.OMBRA, true), interruttore('Scrive gli ordini del giorno', env.OMBRA_SCRIVE),
        interruttore('Legge i piani', env.PIANO, true), interruttore('Scrive i piani', env.PIANO_SCRIVE),
        interruttore('Smistamento allegati', env.SMISTA), interruttore('Indice degli stralci', env.STRALCI) ]
      /* OMBRA_AVVISI non si mostra: da quando il server scrive gli ordini del
         giorno, pick-up e catering li crea scrive.js per tutta la troupe, e
         quell'interruttore vale solo nel percorso "legge senza scrivere",
         dove le mail non passano piu'. In elenco risultava "spento" e
         sembrava una funzione mancante. */
    };
  },

  /* ── Le azioni ── */
  async aggiungi(env, b) {
    const u = id(b.id), f = id(b.film); if (!u || !f) throw new Error('manca la persona o il film');
    await db(env, 'film_membri?on_conflict=project_id,user_id', { method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ project_id: f, user_id: u }) });
    try { await db(env, `film_esclusi?project_id=eq.${f}&user_id=eq.${u}`, { method: 'DELETE' }); } catch (_) {}
    return { fatto: true };
  },
  async togli(env, b) {
    const u = id(b.id), f = id(b.film); if (!u || !f) throw new Error('manca la persona o il film');
    // Chi ha aperto il film non si toglie: il film resterebbe senza nessuno che lo governa.
    const m = await db(env, `film_membri?select=ruolo&project_id=eq.${f}&user_id=eq.${u}&limit=1`);
    if (m && m[0] && m[0].ruolo === 'capo') throw new Error('è la persona che ha aperto il film: non si può togliere');
    await db(env, `film_membri?project_id=eq.${f}&user_id=eq.${u}`, { method: 'DELETE' });
    return { fatto: true };
  },
  async sposta(env, b) {
    const da = id(b.da), a = id(b.a);
    if (!da || !a || da === a) throw new Error('servono due film diversi');
    await AZIONI.togli(env, { id: b.id, film: da });
    await AZIONI.aggiungi(env, { id: b.id, film: a });
    return { fatto: true };
  },

  async blocca(env, b, io) {
    const u = id(b.id); if (!u) throw new Error('manca la persona');
    if (u === String(io.id).toLowerCase()) throw new Error('non puoi bloccare te stesso');
    if (eAdmin(env, u)) throw new Error('è un amministratore: toglilo prima da ADMIN_IDS');
    await blocco(env, u, true);
    // Fuori dai film (tranne quelli che ha aperto lui) e niente piu' notifiche.
    await db(env, `film_membri?user_id=eq.${u}&ruolo=neq.capo`, { method: 'DELETE' });
    await db(env, `push_iscrizioni?user_id=eq.${u}`, { method: 'DELETE' });
    await db(env, `push_appuntamenti?user_id=eq.${u}&mandato=is.null`, { method: 'DELETE' });
    return { fatto: true };
  },
  async sblocca(env, b) {
    const u = id(b.id); if (!u) throw new Error('manca la persona');
    await blocco(env, u, false);
    return { fatto: true };
  },

  /* Una notifica di prova a una persona: parte subito, e la pagina poi
     chiede com'e' andata (partita, accettata, mostrata). */
  async prova(env, b) {
    const u = id(b.id); if (!u) throw new Error('manca la persona');
    const adesso = new Date();
    const r = await db(env, 'push_appuntamenti', { method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: u, quando: adesso.toISOString(), genere: 'prova',
        chiave: `${u}:admin-prova:${adesso.getTime()}`,
        testo: 'Prova da Campobase\nSe la leggi, le notifiche su questo telefono funzionano.' }) });
    const riga = Array.isArray(r) ? r[0] : r;
    await mandaScadute(env);
    return { appuntamento: riga && riga.id || null };
  },
  async rimanda(env, b) {
    const u = id(b.id); if (!u) throw new Error('manca la persona');
    const ultimo = await db(env, `push_appuntamenti?select=id,testo&user_id=eq.${u}&genere=eq.posta&mandato=not.is.null` +
      `&order=mandato.desc&limit=1`);
    if (!ultimo || !ultimo[0]) throw new Error('non ha ancora ricevuto nessun ordine del giorno');
    await db(env, `push_appuntamenti?id=eq.${ultimo[0].id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ mandato: null, mostrato: null, dispositivi: null, scartati: null, quando: new Date().toISOString() }) });
    await mandaScadute(env);
    return { appuntamento: ultimo[0].id, titolo: String(ultimo[0].testo || '').split('\n')[0] };
  },
  async esito(env, b) {
    const a = id(b.appuntamento); if (!a) throw new Error('manca la notifica');
    const r = await db(env, `push_appuntamenti?select=mandato,mostrato,dispositivi,scartati&id=eq.${a}&limit=1`);
    return r && r[0] ? r[0] : { sparita: true };
  }
};

export async function handleAdmin(request, env) {
  const { user, error } = await requireUser(request, env);
  if (error) return error;
  if (!eAdmin(env, user.id)) return json({ error: 'Non sei amministratore', admin: false, id: user.id }, 403);

  const { body, error: malformato } = await readJson(request);
  if (malformato) return malformato;
  const azione = AZIONI[String(body && body.azione || '')];
  if (!azione) return json({ error: 'Azione sconosciuta' }, 400);
  try {
    const esito = await azione(env, body || {}, user);
    if (!/^(io|persone|persona|esito|film|filmUno|posta|mail|lettura|server)$/.test(body.azione)) {
      console.log('[admin]', JSON.stringify({ chi: user.id, azione: body.azione, id: body.id || null,
        film: body.film || null, da: body.da || null, a: body.a || null }));
    }
    return json(esito);
  } catch (e) {
    console.error('[admin]', body.azione, String(e && e.message || e).slice(0, 300));
    return json({ error: String(e && e.message || e).slice(0, 300) }, 400);
  }
}
