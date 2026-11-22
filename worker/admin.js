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
import { mandaScadute } from './push.js';

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

const AZIONI = {
  // Chi sono: la pagina lo chiede per prima cosa.
  async io(env, b, io) { return { admin: true, id: io.id, email: io.email || null }; },

  async persone(env) {
    const [acc, prof, membri, ff, iscr, uso] = await Promise.all([
      account(env), db(env, 'profiles?select=id,nome,cognome,reparto'),
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
               ultima: visto.get(a.id) || null, iscritto: a.created_at || null, bloccato: bloccato(a) };
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
      account(env, u), db(env, `profiles?select=id,nome,cognome,reparto&id=eq.${u}`),
      db(env, `film_membri?select=project_id,ruolo,segna,created_at&user_id=eq.${u}`)
        .catch(() => db(env, `film_membri?select=project_id,ruolo,created_at&user_id=eq.${u}`)),
      film(env),
      db(env, `push_iscrizioni?select=creata,vista,endpoint&user_id=eq.${u}&order=creata.desc`),
      db(env, `push_appuntamenti?select=id,genere,testo,quando,mandato,mostrato,dispositivi,scartati&user_id=eq.${u}` +
              `&mandato=not.is.null&order=mandato.desc&limit=8`),
      db(env, `uso?select=sezione,secondi,giorno,ultimo&user_id=eq.${u}&order=giorno.desc&limit=200`).catch(() => []),
      db(env, `consumi?select=scopo,token_entrata,token_uscita&user_id=eq.${u}&limit=2000`).catch(() => [])
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
      ultima: ((uso || [])[0] || {}).ultimo || null,
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
    if (!/^(io|persone|persona|esito)$/.test(body.azione)) {
      console.log('[admin]', JSON.stringify({ chi: user.id, azione: body.azione, id: body.id || null,
        film: body.film || null, da: body.da || null, a: body.a || null }));
    }
    return json(esito);
  } catch (e) {
    console.error('[admin]', body.azione, String(e && e.message || e).slice(0, 300));
    return json({ error: String(e && e.message || e).slice(0, 300) }, 400);
  }
}
