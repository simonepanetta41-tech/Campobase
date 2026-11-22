/* L'amministrazione.
 *
 * Qui il server guarda i dati di tutti i film: la cosa che conta di piu'
 * e' chi puo' entrare. Poi che ogni azione faccia quello che dice, e
 * niente di piu'.
 *   - senza accesso, o senza essere in ADMIN_IDS, non si ottiene niente;
 *   - chi ha aperto un film non si puo' togliere dal suo film;
 *   - bloccare toglie dai film e dalle notifiche, e non si blocca se stessi;
 *   - la prova di notifica parte per quella persona sola.
 */
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const RADICE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let ko = 0;
const ok = (n, got, exp) => { const b = JSON.stringify(got) === JSON.stringify(exp); if (!b) ko++;
  console.log(`  ${b ? 'ok ' : 'KO '} ${String(n).padEnd(56)} ${JSON.stringify(got)}  atteso ${JSON.stringify(exp)}`); };

const U = n => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const IO = U(1), ANNA = U(2), LUCA = U(3), ESTRANEO = U(9), FA = U('a'), FB = U('b');
let T, banditi, ENV;
function mondo() {
  banditi = {};
  ENV = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'chiave', ADMIN_IDS: IO };
  T = {
    profiles: [{ id: IO, nome: 'Simone', cognome: 'P', reparto: 'Suono' }, { id: ANNA, nome: 'Anna', cognome: 'R', reparto: 'Regia' }, { id: LUCA, nome: 'Luca', cognome: 'B', reparto: 'Fotografia' }],
    projects: [{ id: FA, titolo: 'Missione San Gennaro', sigla: 'MSG', user_id: IO }, { id: FB, titolo: 'Separazioni', sigla: null, user_id: LUCA }],
    film_membri: [{ project_id: FA, user_id: IO, ruolo: 'capo' }, { project_id: FA, user_id: ANNA, ruolo: 'membro' },
                  { project_id: FB, user_id: LUCA, ruolo: 'capo' }, { project_id: FA, user_id: LUCA, ruolo: 'membro' }],
    film_esclusi: [], push_iscrizioni: [{ user_id: ANNA, endpoint: 'https://web.push.apple.com/a', creata: '2026-11-16T10:00:00Z', vista: null }],
    push_appuntamenti: [{ id: U(7), user_id: ANNA, genere: 'posta', testo: 'OdG 30 · sabato\nConvocazione 12.00', quando: '2026-11-20T22:45:00Z', mandato: '2026-11-20T22:45:00Z', mostrato: '2026-11-20T22:45:05Z', dispositivi: 1, scartati: 0 }],
    uso: [{ user_id: ANNA, sezione: 'odg', secondi: 300, giorno: new Date().toISOString().slice(0, 10), ultimo: new Date().toISOString() }],
    consumi: [{ user_id: ANNA, scopo: 'spoglio', token_entrata: 40000, token_uscita: 20000 }]
  };
}
const chiHaIlToken = { 'tok-io': IO, 'tok-anna': ANNA, 'tok-estraneo': ESTRANEO };
globalThis.fetch = async (url, opz = {}) => {
  url = String(url); const metodo = opz.method || 'GET';
  const R = (corpo, stato = 200) => new Response(stato === 204 ? null : (corpo == null ? '' : JSON.stringify(corpo)), { status: stato });
  if (url === 'https://db.test/auth/v1/user') {
    const chi = chiHaIlToken[String(opz.headers.Authorization).slice(7)];
    return chi ? R({ id: chi, email: chi === IO ? 'io@x.it' : 'altro@x.it' }) : R({ msg: 'no' }, 401);
  }
  const acc = id => ({ id, email: id.slice(0, 4) + '@x.it', created_at: '2026-11-01T00:00:00Z', last_sign_in_at: '2026-11-20T00:00:00Z',
                      banned_until: banditi[id] ? '2126-01-01T00:00:00Z' : null });
  if (url.startsWith('https://db.test/auth/v1/admin/users')) {
    const m = /users\/([0-9a-f-]{36})$/.exec(url);
    if (m && metodo === 'PUT') { const b = JSON.parse(opz.body); banditi[m[1]] = b.ban_duration !== 'none'; return R(acc(m[1])); }
    if (m) return R(acc(m[1]));
    return R({ users: [IO, ANNA, LUCA].map(acc) });
  }
  if (url.startsWith('https://web.push.')) return R(null, 201);
  const m = /^https:\/\/db\.test\/rest\/v1\/([a-z_]+)\??(.*)$/.exec(url);
  if (!m) throw new Error('chiamata inattesa: ' + url);
  const tavola = T[m[1]]; if (!tavola) return R({ message: 'tavola inesistente: ' + m[1] }, 404);
  const filtri = [];
  for (const pezzo of m[2].split('&').filter(Boolean)) {
    const [k, v] = pezzo.split('='); const val = decodeURIComponent(v || '');
    if (/^(select|order|limit|on_conflict)$/.test(k)) continue;
    const f = /^(eq|neq|is|not\.is|in)\.(.*)$/.exec(val); if (!f) continue;
    filtri.push(r => f[1] === 'eq' ? String(r[k]) === f[2] : f[1] === 'neq' ? String(r[k]) !== f[2]
      : f[1] === 'is' ? r[k] == null : f[1] === 'not.is' ? r[k] != null : f[2].replace(/[()]/g, '').split(',').includes(String(r[k])));
  }
  const tiene = r => filtri.every(f => f(r));
  if (metodo === 'GET') {
    let out = tavola.filter(tiene);
    if (/order=mandato\.desc/.test(m[2])) out = out.slice().sort((a, b) => String(b.mandato).localeCompare(String(a.mandato)));
    return R(out);
  }
  if (metodo === 'DELETE') { T[m[1]] = tavola.filter(r => !tiene(r)); return R(null, 204); }
  if (metodo === 'PATCH') { tavola.filter(tiene).forEach(r => Object.assign(r, JSON.parse(opz.body))); return R(null, 204); }
  if (metodo === 'POST') {
    const nuova = JSON.parse(opz.body);
    if (m[1] === 'film_membri' && tavola.some(r => r.project_id === nuova.project_id && r.user_id === nuova.user_id)) return R(null, 201);
    if (m[1] === 'film_membri') nuova.ruolo = nuova.ruolo || 'membro';
    if (m[1] === 'push_appuntamenti') nuova.id = U(8);
    tavola.push(nuova); return R([nuova], 201);
  }
  return R(null, 405);
};
const { handleAdmin, eAdmin } = await import(RADICE + '/worker/admin.js');
const chiedi = async (token, corpo) => {
  const r = await handleAdmin(new Request('https://x/api/admin', { method: 'POST',
    headers: token ? { authorization: 'Bearer ' + token, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify(corpo) }), ENV);
  return [r.status, await r.json()];
};
const film = u => T.film_membri.filter(m => m.user_id === u).map(m => m.project_id === FA ? 'A' : 'B').sort().join('');

console.log('\n── ⚠ chi entra ──');
mondo();
ok('senza accesso: no', (await chiedi(null, { azione: 'persone' }))[0], 401);
ok('con un accesso finto: no', (await chiedi('tok-inventato', { azione: 'persone' }))[0], 401);
let [st, d] = await chiedi('tok-anna', { azione: 'persone' });
ok('⚠ un membro qualsiasi: no, e riceve solo il suo numero', [st, Object.keys(d).sort(), d.id], [403, ['admin', 'error', 'id'], ANNA]);
ok('chi non è nemmeno in un film: no', (await chiedi('tok-estraneo', { azione: 'persone' }))[0], 403);
ok('⚠ nemmeno le azioni', [(await chiedi('tok-anna', { azione: 'blocca', id: LUCA }))[0], banditi[LUCA]], [403, undefined]);
ENV.ADMIN_IDS = '';
ok('⚠ senza ADMIN_IDS non entra nessuno', (await chiedi('tok-io', { azione: 'io' }))[0], 403);
ENV.ADMIN_IDS = 'pippo, ' + ANNA.toUpperCase() + ' ;' + IO;
ok('più amministratori, scritti come capita', [eAdmin(ENV, IO), eAdmin(ENV, ANNA), eAdmin(ENV, LUCA), eAdmin(ENV, null)], [true, true, false, false]);
ENV.ADMIN_IDS = IO;
ok('l\'amministratore entra', (await chiedi('tok-io', { azione: 'io' })), [200, { admin: true, id: IO, email: 'io@x.it' }]);
ok('un\'azione che non esiste', (await chiedi('tok-io', { azione: 'cancella_tutto' }))[0], 400);

console.log('\n── l\'elenco e la scheda ──');
[st, d] = await chiedi('tok-io', { azione: 'persone' });
const anna = d.persone.find(p => p.id === ANNA), luca = d.persone.find(p => p.id === LUCA);
ok('tutte le persone e i film', [d.persone.length, d.film.map(f => f.sigla || f.titolo)], [3, ['MSG', 'Separazioni']]);
ok('di ognuno: reparto, film, telefoni', [anna.nome, anna.reparto, anna.film.map(f => f.sigla), anna.telefoni, luca.film.length, luca.telefoni], ['Anna', 'Regia', ['MSG'], 1, 2, 0]);
ok('chi ha usato l\'app per ultimo sta in cima', d.persone[0].id, ANNA);
[st, d] = await chiedi('tok-io', { azione: 'persona', id: ANNA });
ok('la scheda: film, telefoni, ultime notifiche', [d.film.map(f => [f.titolo, f.ruolo]), d.telefoni.map(t => t.tipo), d.notifiche.map(n => [n.titolo, !!n.mostrato])],
   [[['Missione San Gennaro', 'membro']], ['iPhone'], [['OdG 30 · sabato', true]]]);
ok('uso e consumi', [d.uso7, d.consumi], [300, { spoglio: { chiamate: 1, entrata: 40000, uscita: 20000 } }]);
ok('un numero che non è un numero', (await chiedi('tok-io', { azione: 'persona', id: "x' or 1=1" }))[0], 400);

console.log('\n── ⚠ aggiungere, spostare, togliere ──');
await chiedi('tok-io', { azione: 'aggiungi', id: ANNA, film: FB });
ok('aggiunta: resta anche dov\'era', film(ANNA), 'AB');
await chiedi('tok-io', { azione: 'aggiungi', id: ANNA, film: FB });
ok('aggiunta due volte: una riga sola', T.film_membri.filter(m => m.user_id === ANNA).length, 2);
await chiedi('tok-io', { azione: 'togli', id: ANNA, film: FB });
ok('tolta da quel film soltanto', film(ANNA), 'A');
await chiedi('tok-io', { azione: 'sposta', id: ANNA, da: FA, a: FB });
ok('⚠ spostata: esce da uno, entra nell\'altro', film(ANNA), 'B');
[st, d] = await chiedi('tok-io', { azione: 'togli', id: LUCA, film: FB });
ok('⚠ chi ha aperto il film non si toglie dal suo', [st, film(LUCA)], [400, 'AB']);
[st] = await chiedi('tok-io', { azione: 'sposta', id: LUCA, da: FB, a: FA });
ok('né si sposta via', [st, film(LUCA)], [400, 'AB']);
ok('servono due film diversi', (await chiedi('tok-io', { azione: 'sposta', id: ANNA, da: FB, a: FB }))[0], 400);

console.log('\n── ⚠ bloccare ──');
mondo();
ok('non si blocca se stessi', [(await chiedi('tok-io', { azione: 'blocca', id: IO }))[0], banditi[IO]], [400, undefined]);
T.push_appuntamenti.push({ id: U(6), user_id: LUCA, genere: 'pickup', testo: 'x', quando: '2099-01-01T00:00:00Z', mandato: null });
T.push_iscrizioni.push({ user_id: LUCA, endpoint: 'https://web.push.apple.com/l' });
await chiedi('tok-io', { azione: 'blocca', id: LUCA });
ok('⚠ non può più entrare', banditi[LUCA], true);
ok('fuori dai film, tranne quello che ha aperto lui', film(LUCA), 'B');
ok('niente più notifiche, nemmeno quelle in coda', [T.push_iscrizioni.some(i => i.user_id === LUCA), T.push_appuntamenti.some(a => a.user_id === LUCA)], [false, false]);
ok('gli altri non sono toccati', [film(ANNA), T.push_iscrizioni.length], ['A', 1]);
[st, d] = await chiedi('tok-io', { azione: 'persone' });
ok('nell\'elenco risulta bloccato', d.persone.find(p => p.id === LUCA).bloccato, true);
await chiedi('tok-io', { azione: 'sblocca', id: LUCA });
ok('sbloccato', banditi[LUCA], false);

console.log('\n── ⚠ la prova di notifica ──');
mondo();
[st, d] = await chiedi('tok-io', { azione: 'prova', id: ANNA });
const prova = T.push_appuntamenti.find(a => a.genere === 'prova');
ok('una notifica sola, per lei sola', [st, T.push_appuntamenti.filter(a => a.genere === 'prova').map(a => a.user_id), d.appuntamento === prova.id], [200, [ANNA], true]);
[st, d] = await chiedi('tok-io', { azione: 'esito', appuntamento: prova.id });
ok('e si può chiedere com\'è andata', [st, 'mandato' in d, d.sparita], [200, true, undefined]);
[st, d] = await chiedi('tok-io', { azione: 'rimanda', id: ANNA });
ok('⚠ rimandare l\'ultimo ordine del giorno: quello, rimesso in partenza', [st, d.titolo, d.appuntamento], [200, 'OdG 30 · sabato', U(7)]);
ok('a chi non ne ha mai ricevuti si dice', (await chiedi('tok-io', { azione: 'rimanda', id: LUCA }))[0], 400);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
