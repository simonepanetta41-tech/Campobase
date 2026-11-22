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
ok('tutte le persone e i film, i più popolati per primi', [d.persone.length, d.film.map(f => [f.sigla || f.titolo, f.membri])], [3, [['MSG', 3], ['Separazioni', 1]]]);
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

console.log('\n── i costi: il listino ──');
const { costo, PREZZI } = await import(RADICE + '/worker/consumi.js');
ok('sonnet: 2 e 10 dollari per milione', costo({ modello: 'claude-sonnet-5-5', token_entrata: 1000000, token_uscita: 100000 }), 3);
ok('haiku sotto la soglia', Math.round(costo({ modello: 'claude-haiku-5-5', token_entrata: 50000, token_uscita: 1000 }) * 1e6), 5500);
ok('⚠ haiku oltre 100.000 token in entrata costa cinque volte', Math.round(costo({ modello: 'claude-haiku-5-5', token_entrata: 120000, token_uscita: 1000 }) * 1e6), 62500);
ok('la cache letta costa meno', Math.round(costo({ modello: 'claude-sonnet-5-5', token_entrata: 0, token_uscita: 0, token_cache_letti: 1000000 }) * 100), 10);
ok('⚠ un modello fuori listino non vale zero: non si sa', [costo({ modello: 'claude-opus-9', token_entrata: 5 }), costo({ token_entrata: 5 })], [null, null]);
ok('nel listino i modelli che il server usa davvero', Object.keys(PREZZI), ['claude-sonnet-5-5', 'claude-haiku-5-5']);

console.log('\n── film, posta, server: si guarda soltanto ──');
mondo();
const M1 = U(4), M2 = U(5), M3 = U(6), poco = m => new Date(Date.now() - m * 60000).toISOString();
T.projects[0].casella = '84956e3c3046df55'; T.projects[0].codice = 'K7QM2X';
T.posta = [
  { id: M1, project_id: FA, oggetto: 'MSG - ODG #30', ricevuta: poco(100), stato: 'fatta', mittente_vero: 'prod@x.it',
    allegati: [{ nome: 'MSG - ODG _30.pdf', byte: 700000, tenuto: true, percorso: 'segreto/odg.pdf' }, { nome: 'logo.png', byte: 900, tenuto: false }],
    ombra_stato: 'fatta', ombra_il: poco(99), info: { ms: 44000, token_entrata: 15900, token_uscita: 10400 }, scritto: { scritto: true, data: '2026-11-21', notifiche: 3, avvisi: 4 } },
  { id: M2, project_id: FA, oggetto: 'MSG - PDL 8', ricevuta: poco(200), stato: 'nuova', nota: 'il server non ha letto: piano: lettura troncata',
    allegati: [{ nome: 'MSG PDL 8.pdf', byte: 500000, tenuto: true, percorso: 'segreto/pdl.pdf' }],
    piano_stato: 'tronca', piano_il: poco(199), pinfo: { ms: 95000 }, pscritto: { scritto: false, errore: 'lettura troncata' } },
  { id: M3, project_id: FA, oggetto: 'Promemoria', ricevuta: poco(300), stato: 'senza allegati', allegati: [] }
];
T.consumi = [
  { quando: poco(98), origine: 'server', scopo: 'odg', project_id: FA, posta_id: M1, modello: 'claude-sonnet-5-5', token_entrata: 15900, token_uscita: 10400 },
  { quando: poco(97), origine: 'server', scopo: 'stralci', project_id: FA, posta_id: M1, modello: 'claude-haiku-5-5', token_entrata: 48000, token_uscita: 600 },
  { quando: poco(60 * 24 * 20), origine: 'telefono', scopo: 'spoglio', project_id: FA, user_id: ANNA, modello: 'claude-sonnet-5-5', token_entrata: 100000, token_uscita: 20000 },
  { quando: poco(50), origine: 'telefono', scopo: 'assistente', project_id: null, user_id: ANNA, modello: 'modello-nuovo', token_entrata: 10, token_uscita: 10 }
];
T.push_appuntamenti = [
  { id: U(7), user_id: ANNA, project_id: FA, genere: 'posta', quando: poco(98), mandato: poco(98), mostrato: poco(98), dispositivi: 1 },
  { id: U(8), user_id: LUCA, project_id: FA, genere: 'posta', quando: poco(98), mandato: poco(98), mostrato: null, dispositivi: 1 },
  { id: U(9), user_id: IO, project_id: FA, genere: 'posta', quando: poco(98), mandato: poco(98), mostrato: null, dispositivi: 0 }
];
const prima = JSON.stringify(T);
ok('⚠ un membro qualsiasi non vede posta né costi', [(await chiedi('tok-anna', { azione: 'posta' }))[0], (await chiedi('tok-anna', { azione: 'server' }))[0], (await chiedi('tok-anna', { azione: 'lettura', id: M1 }))[0]], [403, 403, 403]);
[st, d] = await chiedi('tok-io', { azione: 'film' });
ok('i film: persone, chi l\'ha aperto, mail e spesa', d.film.map(f => [f.sigla || f.titolo, f.membri, f.capo, f.mail, f.dollari]), [['MSG', 3, 'Simone P', 3, 0.5409], ['Separazioni', 1, 'Luca B', 0, 0]]);
[st, d] = await chiedi('tok-io', { azione: 'filmUno', id: FA });
ok('un film: la troupe, chi l\'ha aperto per primo', d.membri.map(m => [m.nome, m.ruolo, m.telefono]), [['Simone P', 'capo', false], ['Anna R', 'membro', true], ['Luca B', 'membro', false]]);
ok('la sua posta e i costi per scopo', [d.casella, d.posta.length, d.consumi.map(c => [c.scopo, c.chiamate])], ['84956e3c3046df55', 3, [['spoglio', 1], ['odg', 1], ['stralci', 1]]]);
[st, d] = await chiedi('tok-io', { azione: 'posta' });
ok('la posta: com\'è andata ogni mail', d.mail.map(m => [m.oggetto, m.esito, m.colore, m.secondi, m.notifiche]),
  [['MSG - ODG #30', 'letta', 'g', 44, 3], ['MSG - PDL 8', 'errore', 'r', 95, null], ['Promemoria', 'senza allegati', 'm', null, null]]);
ok('con la spesa di ognuna, e il conto', [d.mail[0].dollari, d.lette, d.errori], [0.1409, 1, 1]);
[st, d] = await chiedi('tok-io', { azione: 'mail', id: M1 });
ok('una mail, passo per passo: si parte dall\'arrivo, in ordine di tempo', [d.passi[0].titolo, d.passi.every((x, i) => !i || x.quando >= d.passi[i - 1].quando)], ['Arrivata', true]);
ok('i passi che contano ci sono tutti', ['Arrivata', 'Indice stralci', 'Ordine del giorno: letto in 44 s', 'Ordine del giorno: scritto', '3 notifiche'].every(t => d.passi.some(x => x.titolo === t)), true);
ok('⚠ le notifiche: mostrate, senza conferma, senza telefono', d.passi.find(x => /notifiche/.test(x.titolo)).testo, '1 mostrata, 1 senza conferma, 1 senza telefono');
ok('gli allegati col genere, e ⚠ mai il percorso del file', [d.allegati.map(a => [a.nome, a.genere, a.tenuto]), JSON.stringify(d).includes('segreto')], [[['MSG - ODG _30.pdf', 'odg', true], ['logo.png', null, false]], false]);
[st, d] = await chiedi('tok-io', { azione: 'mail', id: M2 });
ok('una lettura fallita si vede, in rosso, col motivo', [d.esito, d.passi.filter(x => x.colore === 'r').map(x => x.titolo), d.nota], ['errore', ['Piano: lettura troncata in 95 s', 'Piano: non scritto'], 'il server non ha letto: piano: lettura troncata']);
ok('una mail che non c\'è', (await chiedi('tok-io', { azione: 'mail', id: U(0) }))[0], 400);
T.posta[0].letto = { numero: 30 };
ok('la lettura com\'è', (await chiedi('tok-io', { azione: 'lettura', id: M1 }))[1], { letto: { numero: 30 }, testo: null });
delete T.posta[0].letto;
[st, d] = await chiedi('tok-io', { azione: 'server' });
ok('il server: ultima lettura, coda, errori', [d.stato.ultima.esito, d.stato.coda, d.stato.errori, d.stato.mail, d.stato.secondi], ['letta', 0, 1, 3, 44]);
ok('⚠ notifiche senza conferma: solo fra quelle davvero partite', d.stato.notifiche, { partite: 2, senza: 1 });
ok('i costi: oggi/7 giorni non contano quelli vecchi', [d.costi.sette.chiamate, d.costi.sempre.chiamate, d.costi.sempre.dollari], [3, 4, 0.5409]);
ok('⚠ la chiamata fuori listino è contata a parte, non a zero', [d.costi.sempre.senzaPrezzo, d.costi.scopi.find(x => x.scopo === 'assistente').senzaPrezzo], [1, 1]);
ENV.OMBRA_SCRIVE = 'si'; ENV.PIANO = 'no';
[st, d] = await chiedi('tok-io', { azione: 'server' });
ok('gli interruttori, come stanno in Cloudflare', d.interruttori.slice(0, 4).map(i => i.acceso), [true, true, false, false]);
ok('⚠ in tutto questo non è stato scritto niente', JSON.stringify(T) === prima, true);

console.log(ko ? `\n${ko} CONTROLLI FALLITI` : '\nTutti i controlli passati.');
process.exit(ko ? 1 : 0);
